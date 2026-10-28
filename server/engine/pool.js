// Mailbox pool: per-day usage, remaining capacity, and transport handling.
import nodemailer from 'nodemailer';
import { one, all, run, dayKey } from '../db.js';
import { decrypt } from '../crypto.js';

export function usageToday(accountId, timezone) {
  const row = one('SELECT sent, exhausted FROM account_usage WHERE account_id = ? AND day = ?', accountId, dayKey(timezone));
  return { sent: row?.sent ?? 0, exhausted: !!row?.exhausted };
}

export function remainingToday(account, timezone) {
  const u = usageToday(account.id, timezone);
  if (u.exhausted) return 0;
  return Math.max(0, account.daily_limit - u.sent);
}

export function recordSend(accountId, timezone) {
  const day = dayKey(timezone);
  run(
    `INSERT INTO account_usage (account_id, day, sent) VALUES (?, ?, 1)
     ON CONFLICT(account_id, day) DO UPDATE SET sent = sent + 1`,
    accountId, day,
  );
  run(`UPDATE sender_accounts SET total_sent = total_sent + 1, last_used_at = ? WHERE id = ?`, new Date().toISOString(), accountId);
}

// Provider told us the mailbox is out of quota for today even though our own limit isn't reached.
export function markExhausted(accountId, timezone) {
  run(
    `INSERT INTO account_usage (account_id, day, sent, exhausted) VALUES (?, ?, 0, 1)
     ON CONFLICT(account_id, day) DO UPDATE SET exhausted = 1`,
    accountId, dayKey(timezone),
  );
}

// Strip secrets and attach today's usage.
export function accountView(a, timezone) {
  const u = usageToday(a.id, timezone);
  return {
    id: a.id, label: a.label, provider: a.provider, from_name: a.from_name, email: a.email,
    smtp_host: a.smtp_host, smtp_port: a.smtp_port, smtp_secure: !!a.smtp_secure, smtp_user: a.smtp_user,
    daily_limit: a.daily_limit, status: a.status, last_error: a.last_error, last_used_at: a.last_used_at,
    total_sent: a.total_sent, created_at: a.created_at,
    sent_today: u.sent, exhausted_today: u.exhausted,
    remaining_today: u.exhausted ? 0 : Math.max(0, a.daily_limit - u.sent),
  };
}

export function poolCapacity(userId, timezone) {
  const accounts = all('SELECT * FROM sender_accounts WHERE user_id = ? ORDER BY id', userId);
  let limit = 0, sent = 0, remaining = 0;
  for (const a of accounts) {
    if (a.status !== 'active') continue;
    const v = accountView(a, timezone);
    limit += a.daily_limit;
    sent += v.sent_today;
    remaining += v.remaining_today;
  }
  return { accounts: accounts.length, active: accounts.filter((a) => a.status === 'active').length, limit, sent, remaining };
}

// ---- transports ----
const transports = new Map(); // accountId -> { key, transporter }

function transportKey(a) {
  return [a.smtp_host, a.smtp_port, a.smtp_secure, a.smtp_user, a.smtp_pass_enc].join('|');
}

export function buildTransport(cfg) {
  return nodemailer.createTransport({
    host: cfg.smtp_host,
    port: Number(cfg.smtp_port),
    secure: !!cfg.smtp_secure,
    auth: { user: cfg.smtp_user, pass: cfg.smtp_pass },
    pool: true,
    maxConnections: 1,
    maxMessages: 100,
    connectionTimeout: 20_000,
    greetingTimeout: 15_000,
    socketTimeout: 45_000,
  });
}

export function getTransport(account) {
  const key = transportKey(account);
  const cached = transports.get(account.id);
  if (cached && cached.key === key) return cached.transporter;
  cached?.transporter.close();
  const transporter = buildTransport({ ...account, smtp_pass: decrypt(account.smtp_pass_enc) });
  transports.set(account.id, { key, transporter });
  return transporter;
}

export function dropTransport(accountId) {
  transports.get(accountId)?.transporter.close();
  transports.delete(accountId);
}
