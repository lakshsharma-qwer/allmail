import express from 'express';
import bcrypt from 'bcryptjs';
import { one, all, run, tx, dayKey, nextMidnight } from '../db.js';
import { HttpError, owned, requireFields, toInt, isEmail } from '../http.js';
import { poolCapacity, accountView } from '../engine/pool.js';
import { publicUser } from '../auth.js';

// ---------- dashboard ----------
export const statsRouter = express.Router();

statsRouter.get('/dashboard', (req, res) => {
  const uid = req.user.id;
  const tz = req.user.timezone;
  const accounts = all('SELECT * FROM sender_accounts WHERE user_id = ? ORDER BY id', uid).map((a) => accountView(a, tz));
  const totals = one(
    `SELECT COUNT(*) AS sent,
            SUM(r.opened_at IS NOT NULL) AS opened,
            SUM(r.clicked_at IS NOT NULL) AS clicked,
            SUM(r.unsubscribed_at IS NOT NULL) AS unsubscribed
       FROM campaign_recipients r JOIN campaigns c ON c.id = r.campaign_id
      WHERE c.user_id = ? AND r.status = 'sent' AND r.sent_at >= ?`,
    uid, new Date(Date.now() - 30 * 864e5).toISOString(),
  );
  const failed30 = one(
    `SELECT COUNT(*) AS n FROM campaign_recipients r JOIN campaigns c ON c.id = r.campaign_id
      WHERE c.user_id = ? AND r.status = 'failed'`,
    uid,
  ).n;

  // last 14 days of sends, bucketed by the user's local day
  const since = new Date(Date.now() - 14 * 864e5).toISOString();
  const sends = all(
    `SELECT r.sent_at FROM campaign_recipients r JOIN campaigns c ON c.id = r.campaign_id
      WHERE c.user_id = ? AND r.status = 'sent' AND r.sent_at >= ?`,
    uid, since,
  );
  const buckets = new Map();
  for (let i = 13; i >= 0; i--) buckets.set(dayKey(tz, new Date(Date.now() - i * 864e5)), 0);
  for (const s of sends) {
    const k = dayKey(tz, new Date(s.sent_at));
    if (buckets.has(k)) buckets.set(k, buckets.get(k) + 1);
  }

  res.json({
    capacity: poolCapacity(uid, tz),
    resets_at: nextMidnight(tz).toISOString(),
    accounts,
    totals: { sent: totals.sent || 0, opened: totals.opened || 0, clicked: totals.clicked || 0, unsubscribed: totals.unsubscribed || 0, failed: failed30 },
    contacts: one(`SELECT COUNT(*) AS total, SUM(status='subscribed') AS subscribed FROM contacts WHERE user_id = ?`, uid),
    daily: [...buckets].map(([day, sent]) => ({ day, sent })),
    active_campaigns: all(
      `SELECT c.id, c.name, c.status, c.waiting_reason, c.scheduled_at,
              (SELECT COUNT(*) FROM campaign_recipients WHERE campaign_id = c.id) AS total,
              (SELECT COUNT(*) FROM campaign_recipients WHERE campaign_id = c.id AND status = 'sent') AS sent
         FROM campaigns c WHERE c.user_id = ? AND c.status IN ('sending','paused','scheduled') ORDER BY c.id DESC`,
      uid,
    ),
    recent_campaigns: all(
      `SELECT c.id, c.name, c.status, c.completed_at,
              (SELECT COUNT(*) FROM campaign_recipients WHERE campaign_id = c.id AND status = 'sent') AS sent,
              (SELECT COUNT(*) FROM campaign_recipients WHERE campaign_id = c.id AND opened_at IS NOT NULL) AS opened,
              (SELECT COUNT(*) FROM campaign_recipients WHERE campaign_id = c.id AND clicked_at IS NOT NULL) AS clicked
         FROM campaigns c WHERE c.user_id = ? AND c.status IN ('completed','cancelled') ORDER BY c.completed_at DESC LIMIT 5`,
      uid,
    ),
  });
});

// ---------- suppressions ----------
export const suppressionsRouter = express.Router();

suppressionsRouter.get('/', (req, res) => {
  const where = ['user_id = ?'];
  const params = [req.user.id];
  if (req.query.q) { where.push('email LIKE ?'); params.push(`%${req.query.q}%`); }
  if (req.query.reason) { where.push('reason = ?'); params.push(req.query.reason); }
  const w = where.join(' AND ');
  res.json({
    suppressions: all(`SELECT * FROM suppressions WHERE ${w} ORDER BY id DESC LIMIT 500`, ...params),
    total: one(`SELECT COUNT(*) AS n FROM suppressions WHERE ${w}`, ...params).n,
  });
});

suppressionsRouter.post('/', (req, res) => {
  const emails = String(req.body.emails || '').split(/[\s,;]+/).map((e) => e.trim().toLowerCase()).filter(Boolean);
  const valid = emails.filter(isEmail);
  if (!valid.length) throw new HttpError(400, 'Enter at least one valid email address.');
  tx(() => {
    for (const e of valid) {
      run(`INSERT OR IGNORE INTO suppressions (user_id, email, reason) VALUES (?, ?, 'manual')`, req.user.id, e);
      run(`UPDATE contacts SET status = 'unsubscribed' WHERE user_id = ? AND email = ? AND status = 'subscribed'`, req.user.id, e);
    }
  });
  res.status(201).json({ added: valid.length, skipped: emails.length - valid.length });
});

suppressionsRouter.delete('/:id', (req, res) => {
  const s = owned(one('SELECT * FROM suppressions WHERE id = ? AND user_id = ?', req.params.id, req.user.id), 'Entry');
  tx(() => {
    run('DELETE FROM suppressions WHERE id = ?', s.id);
    if (req.query.resubscribe === '1') run(`UPDATE contacts SET status = 'subscribed' WHERE user_id = ? AND email = ?`, req.user.id, s.email);
  });
  res.json({ ok: true });
});

// ---------- settings ----------
export const settingsRouter = express.Router();

settingsRouter.patch('/', (req, res) => {
  const u = req.user;
  const b = req.body;
  const delayMin = toInt(b.delay_min ?? u.delay_min, u.delay_min);
  const delayMax = toInt(b.delay_max ?? u.delay_max, u.delay_max);
  if (delayMin < 0 || delayMax < delayMin || delayMax > 600) throw new HttpError(400, 'Delay must be 0–600 seconds, with the minimum no higher than the maximum.');
  const tz = String(b.timezone ?? u.timezone);
  try { new Intl.DateTimeFormat('en', { timeZone: tz }); } catch { throw new HttpError(400, 'Choose a valid timezone.'); }
  run('UPDATE users SET name = ?, timezone = ?, delay_min = ?, delay_max = ?, company = ?, address = ? WHERE id = ?',
    String(b.name ?? u.name), tz, delayMin, delayMax, String(b.company ?? u.company), String(b.address ?? u.address), u.id);
  res.json({ user: publicUser(one('SELECT * FROM users WHERE id = ?', u.id)) });
});

settingsRouter.post('/password', (req, res) => {
  requireFields(req.body, ['current', 'next']);
  if (!bcrypt.compareSync(String(req.body.current), req.user.password_hash)) throw new HttpError(400, 'Current password is incorrect.');
  if (String(req.body.next).length < 8) throw new HttpError(400, 'Use a new password with at least 8 characters.');
  run('UPDATE users SET password_hash = ? WHERE id = ?', bcrypt.hashSync(String(req.body.next), 10), req.user.id);
  res.json({ ok: true });
});
