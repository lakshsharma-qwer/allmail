import express from 'express';
import { one, all, run, tx, nowIso } from '../db.js';
import { HttpError, ah, owned, requireFields, toInt, isEmail } from '../http.js';
import { startCampaign } from '../engine/sender.js';
import { renderMessage } from '../engine/render.js';
import { getTransport, remainingToday, accountView } from '../engine/pool.js';
import { friendlySmtpError } from './accounts.js';

export const campaignsRouter = express.Router();

const EDITABLE = ['draft', 'scheduled', 'paused'];

function hydrate(c, tz) {
  const lists = all('SELECT l.id, l.name FROM campaign_lists cl JOIN lists l ON l.id = cl.list_id WHERE cl.campaign_id = ?', c.id);
  const accounts = all(
    `SELECT a.* FROM campaign_accounts ca JOIN sender_accounts a ON a.id = ca.account_id WHERE ca.campaign_id = ? ORDER BY ca.position, a.id`,
    c.id,
  ).map((a) => accountView(a, tz));
  return { ...c, track_opens: !!c.track_opens, track_clicks: !!c.track_clicks, lists, accounts, stats: stats(c.id) };
}

function stats(campaignId) {
  const s = one(
    `SELECT COUNT(*) AS total,
            SUM(status = 'queued') + SUM(status = 'sending') AS queued,
            SUM(status = 'sent') AS sent,
            SUM(status = 'failed') AS failed,
            SUM(opened_at IS NOT NULL) AS opened,
            SUM(clicked_at IS NOT NULL) AS clicked,
            SUM(unsubscribed_at IS NOT NULL) AS unsubscribed
       FROM campaign_recipients WHERE campaign_id = ?`,
    campaignId,
  );
  for (const k of Object.keys(s)) s[k] = s[k] || 0;
  return s;
}

const find = (req) => owned(one('SELECT * FROM campaigns WHERE id = ? AND user_id = ?', req.params.id, req.user.id), 'Campaign');

function audienceSize(userId, listIds) {
  if (!listIds.length) return 0;
  const ph = listIds.map(() => '?').join(',');
  return one(
    `SELECT COUNT(DISTINCT lower(c.email)) AS n FROM contacts c JOIN list_contacts lc ON lc.contact_id = c.id
      WHERE c.user_id = ? AND lc.list_id IN (${ph}) AND c.status = 'subscribed'
        AND c.email NOT IN (SELECT email FROM suppressions WHERE user_id = ?)`,
    userId, ...listIds, userId,
  ).n;
}

function save(req, existing) {
  const b = req.body;
  const data = {
    name: String(b.name ?? existing?.name ?? '').trim(),
    subject: String(b.subject ?? existing?.subject ?? ''),
    preheader: String(b.preheader ?? existing?.preheader ?? ''),
    from_name: String(b.from_name ?? existing?.from_name ?? ''),
    reply_to: String(b.reply_to ?? existing?.reply_to ?? '').trim(),
    html: String(b.html ?? existing?.html ?? ''),
    rotation: ['sequential', 'round_robin'].includes(b.rotation) ? b.rotation : (existing?.rotation || 'sequential'),
    track_opens: b.track_opens === undefined ? (existing?.track_opens ?? 1) : (b.track_opens ? 1 : 0),
    track_clicks: b.track_clicks === undefined ? (existing?.track_clicks ?? 1) : (b.track_clicks ? 1 : 0),
  };
  if (!data.name) throw new HttpError(400, 'Give the campaign a name.');
  if (data.reply_to && !isEmail(data.reply_to)) throw new HttpError(400, 'Reply-to must be a valid email address.');

  const listIds = Array.isArray(b.list_ids) ? [...new Set(b.list_ids.map(Number))] : null;
  const accountIds = Array.isArray(b.account_ids) ? [...new Set(b.account_ids.map(Number))] : null;
  for (const id of listIds || []) owned(one('SELECT id FROM lists WHERE id = ? AND user_id = ?', id, req.user.id), 'List');
  for (const id of accountIds || []) owned(one('SELECT id FROM sender_accounts WHERE id = ? AND user_id = ?', id, req.user.id), 'Mailbox');

  return tx(() => {
    let id = existing?.id;
    if (existing) {
      run(`UPDATE campaigns SET name=?, subject=?, preheader=?, from_name=?, reply_to=?, html=?, rotation=?, track_opens=?, track_clicks=? WHERE id=?`,
        data.name, data.subject, data.preheader, data.from_name, data.reply_to, data.html, data.rotation, data.track_opens, data.track_clicks, id);
    } else {
      id = Number(run(`INSERT INTO campaigns (user_id, name, subject, preheader, from_name, reply_to, html, rotation, track_opens, track_clicks) VALUES (?,?,?,?,?,?,?,?,?,?)`,
        req.user.id, data.name, data.subject, data.preheader, data.from_name, data.reply_to, data.html, data.rotation, data.track_opens, data.track_clicks).lastInsertRowid);
    }
    if (listIds) {
      if (existing && existing.status !== 'draft' && existing.status !== 'scheduled') {
        // recipients were already built; audience is locked once sending starts
      } else {
        run('DELETE FROM campaign_lists WHERE campaign_id = ?', id);
        for (const l of listIds) run('INSERT INTO campaign_lists (campaign_id, list_id) VALUES (?, ?)', id, l);
      }
    }
    if (accountIds) {
      run('DELETE FROM campaign_accounts WHERE campaign_id = ?', id);
      accountIds.forEach((a, i) => run('INSERT INTO campaign_accounts (campaign_id, account_id, position) VALUES (?, ?, ?)', id, a, i));
    }
    return id;
  });
}

campaignsRouter.get('/', (req, res) => {
  const rows = all('SELECT * FROM campaigns WHERE user_id = ? ORDER BY id DESC', req.user.id);
  res.json({ campaigns: rows.map((c) => ({ ...c, html: undefined, stats: stats(c.id) })) });
});

campaignsRouter.get('/:id', (req, res) => {
  const c = find(req);
  const out = hydrate(c, req.user.timezone);
  out.audience = c.status === 'draft' || c.status === 'scheduled' ? audienceSize(req.user.id, out.lists.map((l) => l.id)) : out.stats.total;
  out.by_account = all(
    `SELECT a.id, a.email, a.label, COUNT(*) AS sent FROM campaign_recipients r JOIN sender_accounts a ON a.id = r.account_id
      WHERE r.campaign_id = ? AND r.status = 'sent' GROUP BY a.id ORDER BY MIN(r.sent_at)`,
    c.id,
  );
  out.top_links = all(
    `SELECT url, COUNT(*) AS clicks, COUNT(DISTINCT recipient_id) AS unique_clicks FROM link_clicks
      WHERE recipient_id IN (SELECT id FROM campaign_recipients WHERE campaign_id = ?) GROUP BY url ORDER BY clicks DESC LIMIT 10`,
    c.id,
  );
  res.json({ campaign: out });
});

campaignsRouter.get('/:id/recipients', (req, res) => {
  const c = find(req);
  const page = Math.max(1, toInt(req.query.page, 1));
  const size = 50;
  const where = ['r.campaign_id = ?'];
  const params = [c.id];
  const f = req.query.filter;
  if (f === 'queued') where.push(`r.status IN ('queued','sending')`);
  else if (['sent', 'failed'].includes(f)) { where.push('r.status = ?'); params.push(f); }
  else if (f === 'opened') where.push('r.opened_at IS NOT NULL');
  else if (f === 'clicked') where.push('r.clicked_at IS NOT NULL');
  else if (f === 'unsubscribed') where.push('r.unsubscribed_at IS NOT NULL');
  if (req.query.q) { where.push('r.email LIKE ?'); params.push(`%${req.query.q}%`); }
  const w = where.join(' AND ');
  const total = one(`SELECT COUNT(*) AS n FROM campaign_recipients r WHERE ${w}`, ...params).n;
  const rows = all(
    `SELECT r.id, r.email, r.status, r.error, r.attempts, r.sent_at, r.opened_at, r.open_count, r.clicked_at, r.click_count, r.unsubscribed_at, a.email AS sender
       FROM campaign_recipients r LEFT JOIN sender_accounts a ON a.id = r.account_id
      WHERE ${w} ORDER BY r.sent_at IS NULL, r.sent_at DESC, r.id LIMIT ? OFFSET ?`,
    ...params, size, (page - 1) * size,
  );
  res.json({ recipients: rows, total, page, size });
});

campaignsRouter.post('/', (req, res) => {
  const id = save(req, null);
  res.status(201).json({ campaign: hydrate(one('SELECT * FROM campaigns WHERE id = ?', id), req.user.timezone) });
});

campaignsRouter.patch('/:id', (req, res) => {
  const c = find(req);
  if (!EDITABLE.includes(c.status)) throw new HttpError(409, 'Pause the campaign before editing it.');
  save(req, c);
  res.json({ campaign: hydrate(one('SELECT * FROM campaigns WHERE id = ?', c.id), req.user.timezone) });
});

campaignsRouter.post('/:id/duplicate', (req, res) => {
  const c = find(req);
  const id = tx(() => {
    const nid = Number(run(`INSERT INTO campaigns (user_id, name, subject, preheader, from_name, reply_to, html, rotation, track_opens, track_clicks)
      SELECT user_id, name || ' (copy)', subject, preheader, from_name, reply_to, html, rotation, track_opens, track_clicks FROM campaigns WHERE id = ?`, c.id).lastInsertRowid);
    run('INSERT INTO campaign_lists (campaign_id, list_id) SELECT ?, list_id FROM campaign_lists WHERE campaign_id = ?', nid, c.id);
    run('INSERT INTO campaign_accounts (campaign_id, account_id, position) SELECT ?, account_id, position FROM campaign_accounts WHERE campaign_id = ?', nid, c.id);
    return nid;
  });
  res.status(201).json({ campaign: { id } });
});

campaignsRouter.delete('/:id', (req, res) => {
  const c = find(req);
  if (c.status === 'sending') throw new HttpError(409, 'Pause or cancel the campaign before deleting it.');
  run('DELETE FROM campaigns WHERE id = ?', c.id);
  res.json({ ok: true });
});

function readiness(c, userId, tz) {
  const h = hydrate(c, tz);
  const problems = [];
  if (!h.subject.trim()) problems.push('Add a subject line.');
  if (!h.html.trim()) problems.push('Add email content.');
  if (!h.lists.length) problems.push('Choose at least one list to send to.');
  if (!h.accounts.length) problems.push('Choose at least one sender mailbox.');
  else if (!h.accounts.some((a) => a.status === 'active')) problems.push('All chosen mailboxes are paused or failing. Fix one in Senders.');
  if (problems.length) throw new HttpError(400, problems.join(' '));
  return h;
}

// Send now, or schedule if scheduled_at is given.
campaignsRouter.post('/:id/send', (req, res) => {
  const c = find(req);
  if (!['draft', 'scheduled'].includes(c.status)) throw new HttpError(409, 'This campaign has already started.');
  readiness(c, req.user.id, req.user.timezone);
  if (req.body.scheduled_at) {
    const at = new Date(req.body.scheduled_at);
    if (Number.isNaN(at.getTime())) throw new HttpError(400, 'Pick a valid date and time.');
    if (at.getTime() < Date.now() - 60_000) throw new HttpError(400, 'Pick a time in the future.');
    run(`UPDATE campaigns SET status = 'scheduled', scheduled_at = ? WHERE id = ?`, at.toISOString(), c.id);
  } else {
    run(`UPDATE campaigns SET scheduled_at = NULL WHERE id = ?`, c.id);
    startCampaign({ ...c, status: 'draft' });
  }
  res.json({ campaign: hydrate(one('SELECT * FROM campaigns WHERE id = ?', c.id), req.user.timezone) });
});

campaignsRouter.post('/:id/unschedule', (req, res) => {
  const c = find(req);
  if (c.status !== 'scheduled') throw new HttpError(409, 'This campaign is not scheduled.');
  run(`UPDATE campaigns SET status = 'draft', scheduled_at = NULL WHERE id = ?`, c.id);
  res.json({ ok: true });
});

campaignsRouter.post('/:id/pause', (req, res) => {
  const c = find(req);
  if (c.status !== 'sending') throw new HttpError(409, 'Only a sending campaign can be paused.');
  run(`UPDATE campaigns SET status = 'paused', waiting_reason = NULL WHERE id = ?`, c.id);
  res.json({ ok: true });
});

campaignsRouter.post('/:id/resume', (req, res) => {
  const c = find(req);
  if (c.status !== 'paused') throw new HttpError(409, 'Only a paused campaign can be resumed.');
  readiness(c, req.user.id, req.user.timezone);
  run(`UPDATE campaigns SET status = 'sending' WHERE id = ?`, c.id);
  res.json({ ok: true });
});

campaignsRouter.post('/:id/cancel', (req, res) => {
  const c = find(req);
  if (!['sending', 'paused', 'scheduled'].includes(c.status)) throw new HttpError(409, 'This campaign can’t be cancelled.');
  tx(() => {
    run(`UPDATE campaign_recipients SET status = 'skipped', error = 'Campaign cancelled' WHERE campaign_id = ? AND status = 'queued'`, c.id);
    run(`UPDATE campaigns SET status = 'cancelled', completed_at = ?, waiting_reason = NULL WHERE id = ?`, nowIso(), c.id);
  });
  res.json({ ok: true });
});

// Re-queue failed recipients (e.g. after fixing a mailbox).
campaignsRouter.post('/:id/retry-failed', (req, res) => {
  const c = find(req);
  const { changes } = run(
    `UPDATE campaign_recipients SET status = 'queued', attempts = 0, error = NULL
      WHERE campaign_id = ? AND status = 'failed'
        AND email NOT IN (SELECT email FROM suppressions WHERE user_id = ?)`,
    c.id, req.user.id,
  );
  if (changes && ['completed', 'paused'].includes(c.status)) {
    run(`UPDATE campaigns SET status = 'sending', completed_at = NULL WHERE id = ?`, c.id);
  }
  res.json({ ok: true, requeued: changes });
});

// Render a preview for a sample contact (or a blank one).
campaignsRouter.post('/preview', (req, res) => {
  const contact = req.body.contact_id
    ? one('SELECT * FROM contacts WHERE id = ? AND user_id = ?', req.body.contact_id, req.user.id)
    : { email: 'jane@example.com', first_name: 'Jane', last_name: 'Doe', fields: '{"company":"Example Co"}' };
  const msg = renderMessage({
    campaign: { subject: req.body.subject || '', preheader: req.body.preheader || '', html: req.body.html || '', track_opens: 0, track_clicks: 0 },
    contact, recipient: null, user: req.user,
  });
  res.json({ subject: msg.subject, html: msg.html, text: msg.text });
});

campaignsRouter.post('/:id/test', ah(async (req, res) => {
  const c = find(req);
  const to = String(req.body.to || req.user.email).trim();
  if (!isEmail(to)) throw new HttpError(400, 'Enter a valid address for the test.');
  const h = hydrate(c, req.user.timezone);
  const account = all(`SELECT a.* FROM campaign_accounts ca JOIN sender_accounts a ON a.id = ca.account_id WHERE ca.campaign_id = ? ORDER BY ca.position`, c.id)
    .find((a) => a.status === 'active' && remainingToday(a, req.user.timezone) > 0)
    || one(`SELECT * FROM sender_accounts WHERE user_id = ? AND status = 'active' ORDER BY id LIMIT 1`, req.user.id);
  if (!account) throw new HttpError(400, 'Add an active sender mailbox to send a test.');
  const msg = renderMessage({ campaign: { ...c, track_opens: 0, track_clicks: 0 }, contact: { email: to, first_name: req.user.name.split(' ')[0] || '', last_name: '' }, recipient: null, user: req.user });
  try {
    await getTransport(account).sendMail({
      from: { name: c.from_name || account.from_name || req.user.name || '', address: account.email },
      to, replyTo: c.reply_to || undefined, subject: `[Test] ${msg.subject}`, html: msg.html, text: msg.text,
    });
    res.json({ ok: true, via: account.email, lists: h.lists.length });
  } catch (err) {
    res.status(400).json({ ok: false, error: friendlySmtpError(err) });
  }
}));
