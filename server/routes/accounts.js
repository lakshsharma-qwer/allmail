import express from 'express';
import { one, all, run } from '../db.js';
import { encrypt } from '../crypto.js';
import { HttpError, ah, owned, requireFields, toInt, isEmail } from '../http.js';
import { accountView, poolCapacity, buildTransport, getTransport, dropTransport } from '../engine/pool.js';

export const accountsRouter = express.Router();

const PRESETS = {
  gmail:   { smtp_host: 'smtp.gmail.com',       smtp_port: 587, smtp_secure: 0, daily_limit: 500 },
  outlook: { smtp_host: 'smtp.office365.com',   smtp_port: 587, smtp_secure: 0, daily_limit: 300 },
  zoho:    { smtp_host: 'smtp.zoho.in',         smtp_port: 587, smtp_secure: 0, daily_limit: 300 },
  custom:  { smtp_host: '',                     smtp_port: 587, smtp_secure: 0, daily_limit: 500 },
};

function normalize(body, existing) {
  const provider = body.provider || existing?.provider || 'gmail';
  const preset = PRESETS[provider] || PRESETS.custom;
  const email = String(body.email ?? existing?.email ?? '').trim().toLowerCase();
  const out = {
    provider,
    label: String(body.label ?? existing?.label ?? '').trim(),
    from_name: String(body.from_name ?? existing?.from_name ?? '').trim(),
    email,
    smtp_host: String(body.smtp_host || existing?.smtp_host || preset.smtp_host).trim(),
    smtp_port: toInt(body.smtp_port ?? existing?.smtp_port ?? preset.smtp_port, 587),
    smtp_secure: body.smtp_secure !== undefined ? (body.smtp_secure ? 1 : 0) : (existing?.smtp_secure ?? preset.smtp_secure),
    smtp_user: String(body.smtp_user || existing?.smtp_user || email).trim(),
    daily_limit: toInt(body.daily_limit ?? existing?.daily_limit ?? preset.daily_limit, 500),
  };
  if (!isEmail(out.email)) throw new HttpError(400, 'Enter the mailbox’s email address.');
  if (!out.smtp_host) throw new HttpError(400, 'Enter the SMTP server host.');
  if (out.daily_limit < 1 || out.daily_limit > 100000) throw new HttpError(400, 'Daily limit must be between 1 and 100,000.');
  if (out.smtp_port === 465 && body.smtp_secure === undefined && !existing) out.smtp_secure = 1;
  return out;
}

accountsRouter.get('/', (req, res) => {
  const rows = all('SELECT * FROM sender_accounts WHERE user_id = ? ORDER BY id', req.user.id);
  res.json({ accounts: rows.map((a) => accountView(a, req.user.timezone)), capacity: poolCapacity(req.user.id, req.user.timezone), presets: PRESETS });
});

// Check SMTP credentials before saving.
accountsRouter.post('/verify', ah(async (req, res) => {
  const cfg = normalize(req.body);
  if (!req.body.smtp_pass) throw new HttpError(400, 'Enter the app password.');
  const t = buildTransport({ ...cfg, smtp_pass: String(req.body.smtp_pass).replace(/\s+/g, '') });
  try {
    await t.verify();
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ ok: false, error: friendlySmtpError(err) });
  } finally {
    t.close();
  }
}));

accountsRouter.post('/', (req, res) => {
  requireFields(req.body, ['email', 'smtp_pass']);
  const cfg = normalize(req.body);
  if (one('SELECT id FROM sender_accounts WHERE user_id = ? AND email = ?', req.user.id, cfg.email)) {
    throw new HttpError(409, 'This mailbox is already in your pool.');
  }
  const { lastInsertRowid } = run(
    `INSERT INTO sender_accounts (user_id, label, provider, from_name, email, smtp_host, smtp_port, smtp_secure, smtp_user, smtp_pass_enc, daily_limit)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    req.user.id, cfg.label, cfg.provider, cfg.from_name, cfg.email, cfg.smtp_host, cfg.smtp_port, cfg.smtp_secure, cfg.smtp_user,
    encrypt(String(req.body.smtp_pass).replace(/\s+/g, '')), cfg.daily_limit,
  );
  res.status(201).json({ account: accountView(one('SELECT * FROM sender_accounts WHERE id = ?', lastInsertRowid), req.user.timezone) });
});

const find = (req) => owned(one('SELECT * FROM sender_accounts WHERE id = ? AND user_id = ?', req.params.id, req.user.id), 'Mailbox');

accountsRouter.patch('/:id', (req, res) => {
  const a = find(req);
  const cfg = normalize(req.body, a);
  const status = ['active', 'paused'].includes(req.body.status) ? req.body.status : a.status;
  const passEnc = req.body.smtp_pass ? encrypt(String(req.body.smtp_pass).replace(/\s+/g, '')) : a.smtp_pass_enc;
  run(
    `UPDATE sender_accounts SET label=?, provider=?, from_name=?, email=?, smtp_host=?, smtp_port=?, smtp_secure=?, smtp_user=?, smtp_pass_enc=?, daily_limit=?, status=?,
            last_error = CASE WHEN ? = 'active' AND status != 'active' THEN NULL ELSE last_error END
      WHERE id = ?`,
    cfg.label, cfg.provider, cfg.from_name, cfg.email, cfg.smtp_host, cfg.smtp_port, cfg.smtp_secure, cfg.smtp_user, passEnc, cfg.daily_limit, status,
    status, a.id,
  );
  dropTransport(a.id);
  res.json({ account: accountView(one('SELECT * FROM sender_accounts WHERE id = ?', a.id), req.user.timezone) });
});

accountsRouter.delete('/:id', (req, res) => {
  const a = find(req);
  dropTransport(a.id);
  run('DELETE FROM sender_accounts WHERE id = ?', a.id);
  res.json({ ok: true });
});

// Re-check a saved mailbox's sign-in; clears an error state on success.
accountsRouter.post('/:id/check', ah(async (req, res) => {
  const a = find(req);
  dropTransport(a.id);
  try {
    await getTransport(a).verify();
    run(`UPDATE sender_accounts SET status = CASE WHEN status = 'error' THEN 'active' ELSE status END, last_error = NULL WHERE id = ?`, a.id);
    res.json({ ok: true, account: accountView(one('SELECT * FROM sender_accounts WHERE id = ?', a.id), req.user.timezone) });
  } catch (err) {
    const msg = friendlySmtpError(err);
    run(`UPDATE sender_accounts SET status = 'error', last_error = ? WHERE id = ?`, msg, a.id);
    res.status(400).json({ ok: false, error: msg });
  }
}));

accountsRouter.post('/:id/test', ah(async (req, res) => {
  const a = find(req);
  const to = String(req.body.to || req.user.email).trim();
  if (!isEmail(to)) throw new HttpError(400, 'Enter a valid recipient address.');
  try {
    await getTransport(a).sendMail({
      from: { name: a.from_name || req.user.name || 'allmail', address: a.email },
      to,
      subject: 'allmail test: this mailbox can send',
      text: `This test came from ${a.email} through ${a.smtp_host}:${a.smtp_port}. It is ready to join your sending pool.`,
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ ok: false, error: friendlySmtpError(err) });
  }
}));

export function friendlySmtpError(err) {
  const raw = `${err.response || err.message || err}`;
  if (/Application-specific password required/i.test(raw)) return 'Gmail needs an app password, not your normal password. Turn on 2-Step Verification, then create one at myaccount.google.com/apppasswords.';
  if (/Username and Password not accepted|Invalid login|535/i.test(raw)) return 'Sign-in was rejected. Check the email and app password.';
  if (/ENOTFOUND|EAI_AGAIN/i.test(raw)) return 'The SMTP host could not be found. Check the server name.';
  if (/ETIMEDOUT|ECONNREFUSED|ECONNRESET/i.test(raw)) return 'Could not connect to the SMTP server. Check the host and port (587 with STARTTLS, or 465 with SSL).';
  if (/wrong version number|ssl3_get_record/i.test(raw)) return 'SSL setting doesn’t match the port. Use SSL with port 465, and turn it off for 587.';
  return raw.slice(0, 300);
}
