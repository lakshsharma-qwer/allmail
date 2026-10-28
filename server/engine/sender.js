/**
 * The relay engine.
 *
 * Every tick, for each campaign that is sending, it picks a mailbox from the campaign's
 * pool and hands it the next queued recipient.
 *   - sequential:  use mailbox #1 until it reaches its daily limit, then shift to #2, and so on.
 *   - round_robin: spread sends across every mailbox that still has capacity.
 * Each mailbox sends one message at a time with a random pause (user's delay_min..delay_max)
 * between messages. When every mailbox in the pool has hit its limit, the campaign waits
 * and resumes automatically after local midnight, when the counters reset.
 */
import { one, all, run, tx, nowIso, nextMidnight } from '../db.js';
import { randomToken } from '../crypto.js';
import { getTransport, remainingToday, recordSend, markExhausted, dropTransport } from './pool.js';
import { renderMessage } from './render.js';

const TICK_MS = 1000;
const MAX_ATTEMPTS = 3;

const busy = new Set();        // account ids with a message in flight
const cooldown = new Map();    // account id -> epoch ms when it may send again
let timer = null;

const randBetween = (a, b) => a + Math.random() * Math.max(0, b - a);

// ---------- lifecycle helpers used by routes ----------

/** Materialise recipients for a campaign: subscribed contacts in its lists, minus suppressions, de-duplicated. */
export function buildRecipients(campaignId, userId) {
  const rows = all(
    `SELECT MIN(c.id) AS id, c.email
       FROM contacts c
       JOIN list_contacts lc ON lc.contact_id = c.id
       JOIN campaign_lists cl ON cl.list_id = lc.list_id AND cl.campaign_id = ?
      WHERE c.user_id = ? AND c.status = 'subscribed'
        AND c.email NOT IN (SELECT email FROM suppressions WHERE user_id = ?)
      GROUP BY lower(c.email)`,
    campaignId, userId, userId,
  );
  tx(() => {
    const ins = 'INSERT INTO campaign_recipients (campaign_id, contact_id, email, token) VALUES (?, ?, ?, ?)';
    for (const r of rows) run(ins, campaignId, r.id, r.email, randomToken(18));
  });
  return rows.length;
}

export function startCampaign(campaign) {
  const existing = one('SELECT COUNT(*) AS n FROM campaign_recipients WHERE campaign_id = ?', campaign.id).n;
  const count = existing || buildRecipients(campaign.id, campaign.user_id);
  if (!count) {
    run(`UPDATE campaigns SET status = 'completed', started_at = ?, completed_at = ?, waiting_reason = ? WHERE id = ?`,
      nowIso(), nowIso(), 'No eligible recipients: the selected lists have no subscribed contacts.', campaign.id);
    return 0;
  }
  run(`UPDATE campaigns SET status = 'sending', started_at = COALESCE(started_at, ?), waiting_reason = NULL WHERE id = ?`, nowIso(), campaign.id);
  return count;
}

// ---------- engine ----------

function classifyError(err) {
  const code = err.responseCode || 0;
  const msg = `${err.response || ''} ${err.message || ''}`;
  if (code === 535 || code === 534 || code === 530 || err.code === 'EAUTH' || /Username and Password not accepted|Application-specific password required|Invalid login/i.test(msg)) {
    return 'auth';
  }
  if (/5\.4\.5|Daily user sending limit|sending quota|limit exceeded|too many (messages|recipients)/i.test(msg) || code === 421 && /rate|limit/i.test(msg)) {
    return 'quota';
  }
  if (code >= 550 && code < 560 && /5\.1\.1|does not exist|no such user|user unknown|recipient address rejected|mailbox unavailable/i.test(msg)) {
    return 'bounce';
  }
  if (code >= 500 && code < 600) return 'permanent';
  return 'temporary'; // 4xx, timeouts, connection resets
}

function poolFor(campaign) {
  return all(
    `SELECT a.* FROM campaign_accounts ca JOIN sender_accounts a ON a.id = ca.account_id
      WHERE ca.campaign_id = ? ORDER BY ca.position, a.id`,
    campaign.id,
  );
}

function pickAccount(campaign, pool, tz) {
  const now = Date.now();
  const withCapacity = pool.filter((a) => a.status === 'active' && remainingToday(a, tz) > 0);
  if (!withCapacity.length) return { reason: 'limit' };
  const ready = (a) => !busy.has(a.id) && (cooldown.get(a.id) || 0) <= now;

  if (campaign.rotation === 'round_robin') {
    const candidates = withCapacity.filter(ready);
    if (!candidates.length) return { reason: 'cooldown' };
    candidates.sort((x, y) => (x.last_used_at || '').localeCompare(y.last_used_at || ''));
    return { account: candidates[0] };
  }
  // sequential: stay on the first mailbox with capacity until it's full
  const first = withCapacity[0];
  return ready(first) ? { account: first } : { reason: 'cooldown' };
}

async function deliver({ campaign, user, account, recipient }) {
  const contact = recipient.contact_id ? one('SELECT * FROM contacts WHERE id = ?', recipient.contact_id) : null;
  const msg = renderMessage({ campaign, contact, recipient, user });
  const fromName = campaign.from_name || account.from_name || user.name || '';
  const info = await getTransport(account).sendMail({
    from: fromName ? { name: fromName, address: account.email } : account.email,
    to: recipient.email,
    replyTo: campaign.reply_to || undefined,
    subject: msg.subject,
    html: msg.html,
    text: msg.text,
    headers: {
      'List-Unsubscribe': `<${msg.unsubscribeUrl}>, <mailto:${account.email}?subject=unsubscribe>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      'X-Campaign-Id': `allmail-${campaign.id}`,
    },
  });
  return info;
}

function handleSuccess(recipient, account, user, info) {
  run(`UPDATE campaign_recipients SET status = 'sent', account_id = ?, sent_at = ?, message_id = ?, error = NULL, attempts = attempts + 1 WHERE id = ?`,
    account.id, nowIso(), info.messageId || null, recipient.id);
  recordSend(account.id, user.timezone);
  if (account.status === 'error') run(`UPDATE sender_accounts SET status = 'active', last_error = NULL WHERE id = ?`, account.id);
}

function handleFailure(err, recipient, account, user, campaign) {
  const kind = classifyError(err);
  const detail = String(err.response || err.message || err).slice(0, 500);
  const requeue = (countAttempt = true) => {
    const attempts = recipient.attempts + (countAttempt ? 1 : 0);
    if (attempts >= MAX_ATTEMPTS) {
      run(`UPDATE campaign_recipients SET status = 'failed', attempts = ?, error = ?, account_id = ? WHERE id = ?`, attempts, detail, account.id, recipient.id);
    } else {
      run(`UPDATE campaign_recipients SET status = 'queued', attempts = ?, error = ? WHERE id = ?`, attempts, detail, recipient.id);
    }
  };

  switch (kind) {
    case 'auth':
      // The mailbox is broken, not the recipient: take the mailbox out of rotation, retry the recipient elsewhere.
      run(`UPDATE sender_accounts SET status = 'error', last_error = ? WHERE id = ?`, `Sign-in failed: ${detail}`, account.id);
      dropTransport(account.id);
      requeue(false);
      break;
    case 'quota':
      markExhausted(account.id, user.timezone);
      run(`UPDATE sender_accounts SET last_error = ? WHERE id = ?`, `Provider daily quota reached: ${detail}`, account.id);
      requeue(false);
      break;
    case 'bounce':
      run(`UPDATE campaign_recipients SET status = 'failed', attempts = attempts + 1, error = ?, account_id = ? WHERE id = ?`, detail, account.id, recipient.id);
      if (recipient.contact_id) run(`UPDATE contacts SET status = 'bounced' WHERE id = ?`, recipient.contact_id);
      run(`INSERT OR IGNORE INTO suppressions (user_id, email, reason) VALUES (?, ?, 'bounced')`, campaign.user_id, recipient.email);
      break;
    case 'permanent':
      run(`UPDATE campaign_recipients SET status = 'failed', attempts = attempts + 1, error = ?, account_id = ? WHERE id = ?`, detail, account.id, recipient.id);
      break;
    default:
      dropTransport(account.id);
      requeue(true);
  }
}

function dispatch(campaign, user, account) {
  const recipient = one(`SELECT * FROM campaign_recipients WHERE campaign_id = ? AND status = 'queued' ORDER BY attempts, id LIMIT 1`, campaign.id);
  if (!recipient) return false;
  run(`UPDATE campaign_recipients SET status = 'sending' WHERE id = ?`, recipient.id);
  busy.add(account.id);

  deliver({ campaign, user, account, recipient })
    .then((info) => handleSuccess(recipient, account, user, info))
    .catch((err) => handleFailure(err, recipient, account, user, campaign))
    .finally(() => {
      busy.delete(account.id);
      cooldown.set(account.id, Date.now() + randBetween(user.delay_min, user.delay_max) * 1000);
    });
  return true;
}

function startDueScheduled() {
  const due = all(`SELECT * FROM campaigns WHERE status = 'scheduled' AND scheduled_at <= ?`, nowIso());
  for (const c of due) startCampaign(c);
}

function tick() {
  try {
    startDueScheduled();
    const campaigns = all(`SELECT * FROM campaigns WHERE status = 'sending' ORDER BY started_at, id`);
    const users = new Map();

    for (const campaign of campaigns) {
      const counts = one(
        `SELECT SUM(status = 'queued') AS queued, SUM(status = 'sending') AS sending FROM campaign_recipients WHERE campaign_id = ?`,
        campaign.id,
      );
      if (!counts.queued && !counts.sending) {
        run(`UPDATE campaigns SET status = 'completed', completed_at = ?, waiting_reason = NULL WHERE id = ?`, nowIso(), campaign.id);
        continue;
      }
      if (!counts.queued) continue;

      if (!users.has(campaign.user_id)) users.set(campaign.user_id, one('SELECT * FROM users WHERE id = ?', campaign.user_id));
      const user = users.get(campaign.user_id);
      const pool = poolFor(campaign);

      let waiting = null;
      if (!pool.length) {
        waiting = 'No sender mailboxes are assigned to this campaign. Edit the campaign and add at least one.';
      } else if (!pool.some((a) => a.status === 'active')) {
        waiting = 'Every mailbox in this campaign is paused or failing to sign in. Fix or resume one in Senders.';
      } else {
        // In round-robin mode several mailboxes may fire in the same tick.
        for (;;) {
          const pick = pickAccount(campaign, pool, user.timezone);
          if (pick.reason === 'limit') {
            const at = nextMidnight(user.timezone);
            waiting = `All mailboxes reached today’s limit. Sending resumes automatically at ${at.toLocaleString('en-GB', { timeZone: user.timezone, hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' })} (${user.timezone}).`;
            break;
          }
          if (!pick.account) break;
          if (!dispatch(campaign, user, pick.account)) break;
          if (campaign.rotation !== 'round_robin') break;
        }
      }
      if ((waiting || null) !== (campaign.waiting_reason || null)) {
        run(`UPDATE campaigns SET waiting_reason = ? WHERE id = ?`, waiting, campaign.id);
      }
    }
  } catch (err) {
    console.error('[relay] tick failed:', err);
  }
}

export function startEngine() {
  // Anything mid-flight when the process died goes back in the queue.
  run(`UPDATE campaign_recipients SET status = 'queued' WHERE status = 'sending'`);
  timer = setInterval(tick, TICK_MS);
  console.log('[relay] engine started');
}

export function stopEngine() {
  clearInterval(timer);
}
