import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { DATA_DIR } from './config.js';

export const db = new DatabaseSync(path.join(DATA_DIR, 'allmail.db'));

db.exec(`
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name          TEXT NOT NULL DEFAULT '',
  password_hash TEXT NOT NULL,
  timezone      TEXT NOT NULL DEFAULT 'Asia/Kolkata',
  delay_min     INTEGER NOT NULL DEFAULT 8,
  delay_max     INTEGER NOT NULL DEFAULT 20,
  company       TEXT NOT NULL DEFAULT '',
  address       TEXT NOT NULL DEFAULT '',
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS sender_accounts (
  id            INTEGER PRIMARY KEY,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label         TEXT NOT NULL DEFAULT '',
  provider      TEXT NOT NULL DEFAULT 'gmail',
  from_name     TEXT NOT NULL DEFAULT '',
  email         TEXT NOT NULL,
  smtp_host     TEXT NOT NULL,
  smtp_port     INTEGER NOT NULL,
  smtp_secure   INTEGER NOT NULL DEFAULT 0,
  smtp_user     TEXT NOT NULL,
  smtp_pass_enc TEXT NOT NULL,
  daily_limit   INTEGER NOT NULL DEFAULT 500,
  status        TEXT NOT NULL DEFAULT 'active',   -- active | paused | error
  last_error    TEXT,
  last_used_at  TEXT,
  total_sent    INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- sent count per mailbox per calendar day (in the owner's timezone)
CREATE TABLE IF NOT EXISTS account_usage (
  account_id INTEGER NOT NULL REFERENCES sender_accounts(id) ON DELETE CASCADE,
  day        TEXT NOT NULL,
  sent       INTEGER NOT NULL DEFAULT 0,
  exhausted  INTEGER NOT NULL DEFAULT 0,          -- provider said "quota exceeded" before our limit
  PRIMARY KEY (account_id, day)
);

CREATE TABLE IF NOT EXISTS lists (
  id          INTEGER PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS contacts (
  id         INTEGER PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email      TEXT NOT NULL COLLATE NOCASE,
  first_name TEXT NOT NULL DEFAULT '',
  last_name  TEXT NOT NULL DEFAULT '',
  fields     TEXT NOT NULL DEFAULT '{}',
  status     TEXT NOT NULL DEFAULT 'subscribed',   -- subscribed | unsubscribed | bounced
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (user_id, email)
);

CREATE TABLE IF NOT EXISTS list_contacts (
  list_id    INTEGER NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
  contact_id INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  PRIMARY KEY (list_id, contact_id)
);

CREATE TABLE IF NOT EXISTS templates (
  id         INTEGER PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  subject    TEXT NOT NULL DEFAULT '',
  html       TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS campaigns (
  id             INTEGER PRIMARY KEY,
  user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  subject        TEXT NOT NULL DEFAULT '',
  preheader      TEXT NOT NULL DEFAULT '',
  from_name      TEXT NOT NULL DEFAULT '',
  reply_to       TEXT NOT NULL DEFAULT '',
  html           TEXT NOT NULL DEFAULT '',
  rotation       TEXT NOT NULL DEFAULT 'sequential', -- sequential | round_robin
  track_opens    INTEGER NOT NULL DEFAULT 1,
  track_clicks   INTEGER NOT NULL DEFAULT 1,
  status         TEXT NOT NULL DEFAULT 'draft',      -- draft | scheduled | sending | paused | completed | cancelled
  waiting_reason TEXT,
  scheduled_at   TEXT,
  started_at     TEXT,
  completed_at   TEXT,
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS campaign_lists (
  campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  list_id     INTEGER NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
  PRIMARY KEY (campaign_id, list_id)
);

CREATE TABLE IF NOT EXISTS campaign_accounts (
  campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  account_id  INTEGER NOT NULL REFERENCES sender_accounts(id) ON DELETE CASCADE,
  position    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (campaign_id, account_id)
);

CREATE TABLE IF NOT EXISTS campaign_recipients (
  id              INTEGER PRIMARY KEY,
  campaign_id     INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  contact_id      INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
  email           TEXT NOT NULL,
  token           TEXT NOT NULL UNIQUE,
  status          TEXT NOT NULL DEFAULT 'queued',   -- queued | sending | sent | failed | skipped
  account_id      INTEGER REFERENCES sender_accounts(id) ON DELETE SET NULL,
  attempts        INTEGER NOT NULL DEFAULT 0,
  error           TEXT,
  message_id      TEXT,
  sent_at         TEXT,
  opened_at       TEXT,
  open_count      INTEGER NOT NULL DEFAULT 0,
  clicked_at      TEXT,
  click_count     INTEGER NOT NULL DEFAULT 0,
  unsubscribed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_cr_campaign_status ON campaign_recipients(campaign_id, status);
CREATE INDEX IF NOT EXISTS idx_cr_sent_at ON campaign_recipients(sent_at);

CREATE TABLE IF NOT EXISTS link_clicks (
  id           INTEGER PRIMARY KEY,
  recipient_id INTEGER NOT NULL REFERENCES campaign_recipients(id) ON DELETE CASCADE,
  url          TEXT NOT NULL,
  clicked_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS suppressions (
  id         INTEGER PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email      TEXT NOT NULL COLLATE NOCASE,
  reason     TEXT NOT NULL DEFAULT 'manual',        -- unsubscribed | bounced | complaint | manual
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (user_id, email)
);
`);

export const one = (sql, ...p) => db.prepare(sql).get(...p);
export const all = (sql, ...p) => db.prepare(sql).all(...p);
export const run = (sql, ...p) => db.prepare(sql).run(...p);

export function tx(fn) {
  db.exec('BEGIN');
  try {
    const out = fn();
    db.exec('COMMIT');
    return out;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

export const nowIso = () => new Date().toISOString();

// Calendar day (YYYY-MM-DD) in the given IANA timezone. Daily limits reset on this boundary.
export function dayKey(timezone = 'UTC', date = new Date()) {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

// Next local midnight for a timezone, as a Date.
export function nextMidnight(timezone = 'UTC') {
  const today = dayKey(timezone);
  let t = Date.now();
  // step forward in 15-minute increments until the day key changes, then refine
  while (dayKey(timezone, new Date(t)) === today) t += 15 * 60 * 1000;
  let lo = t - 15 * 60 * 1000;
  while (t - lo > 1000) {
    const mid = Math.floor((lo + t) / 2);
    if (dayKey(timezone, new Date(mid)) === today) lo = mid; else t = mid;
  }
  return new Date(t);
}
