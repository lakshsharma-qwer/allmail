// End-to-end check of the relay engine against a local fake SMTP server.
// Two mailboxes with daily_limit = 3 and 8 contacts: expect exactly 6 sent (3 + 3),
// mailbox #1 used first (sequential), and the campaign waiting for tomorrow.
// Run: npm run test:relay
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SMTPServer } from 'smtp-server';

const API_PORT = 4555;
const SMTP_PORT = 2526;
const base = `http://localhost:${API_PORT}/api`;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'allmail-test-'));

const received = [];
const smtp = new SMTPServer({
  authOptional: false,
  disabledCommands: ['STARTTLS'],
  onAuth(auth, _s, cb) { cb(null, { user: auth.username }); },
  onData(stream, session, cb) {
    let raw = '';
    stream.on('data', (d) => (raw += d));
    stream.on('end', () => { received.push({ user: session.user, to: session.envelope.rcptTo.map((r) => r.address), raw }); cb(); });
  },
});
await new Promise((r) => smtp.listen(SMTP_PORT, r));

const server = spawn(process.execPath, ['server/index.js'], {
  env: { ...process.env, PORT: String(API_PORT), APP_URL: `http://localhost:${API_PORT}`, ALLMAIL_DATA_DIR: dataDir, APP_SECRET: 'test-secret' },
  stdio: ['ignore', 'pipe', 'inherit'],
});
await new Promise((resolve) => server.stdout.on('data', (d) => d.toString().includes('engine started') && resolve()));

let token = '';
async function call(method, url, body) {
  const res = await fetch(base + url, { method, headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: body ? JSON.stringify(body) : undefined });
  const json = await res.json();
  if (!res.ok) throw new Error(`${method} ${url} → ${res.status} ${json.error}`);
  return json;
}
const assert = (cond, msg) => { if (!cond) throw new Error(`FAIL: ${msg}`); console.log(`  ✓ ${msg}`); };

try {
  ({ token } = await call('POST', '/auth/signup', { email: 'owner@test.dev', password: 'password123', name: 'Owner' }));
  await call('PATCH', '/settings', { delay_min: 0, delay_max: 0, company: 'Test Co', address: '1 Test Street' });

  const mk = (email) => call('POST', '/accounts', { provider: 'custom', email, smtp_host: '127.0.0.1', smtp_port: SMTP_PORT, smtp_secure: false, smtp_user: email, smtp_pass: 'x', daily_limit: 3 });
  const a1 = (await mk('first@relay.dev')).account;
  const a2 = (await mk('second@relay.dev')).account;

  const rows = Array.from({ length: 8 }, (_, i) => ({ email: `person${i}@example.com`, first_name: `P${i}` }));
  rows.push({ email: 'not-an-email' }, { email: 'person0@example.com' });
  const imp = await call('POST', '/contacts/import', { rows, new_list: 'Test list' });
  assert(imp.created === 8 && imp.invalid === 1, `import created 8, rejected 1 invalid, de-duplicated 1 (got ${JSON.stringify(imp)})`);
  const list = (await call('GET', '/lists')).lists[0];

  const { campaign } = await call('POST', '/campaigns', {
    name: 'Relay test', subject: 'Hello {{first_name|friend}}', from_name: 'Owner',
    html: '<html><body><p>Hi {{first_name}}</p><a href="https://example.com/x">link</a></body></html>',
    list_ids: [list.id], account_ids: [a1.id, a2.id], rotation: 'sequential',
  });
  await call('POST', `/campaigns/${campaign.id}/send`, {});

  let c;
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 500));
    c = (await call('GET', `/campaigns/${campaign.id}`)).campaign;
    if (c.stats.sent === 6 && c.waiting_reason) break;
  }
  console.log('  campaign:', c.status, c.stats, '\n  waiting:', c.waiting_reason);
  assert(c.stats.sent === 6, 'exactly 6 sent = 2 mailboxes × limit 3');
  assert(c.stats.queued === 2, '2 recipients still queued for tomorrow');
  assert(c.status === 'sending' && /limit/.test(c.waiting_reason || ''), 'campaign is waiting on the daily limit');
  assert(received.slice(0, 3).every((m) => m.user === 'first@relay.dev'), 'sequential: first 3 went through mailbox #1');
  assert(received.slice(3, 6).every((m) => m.user === 'second@relay.dev'), 'then shifted to mailbox #2');
  const sample = received[0].raw;
  assert(/Subject: Hello P\d/.test(sample), 'subject personalised');
  assert(/List-Unsubscribe-Post: List-Unsubscribe=One-Click/.test(sample), 'one-click unsubscribe header present');
  assert(/\/t\/c\//.test(sample.replace(/=\r?\n/g, '')), 'links rewritten for click tracking');

  const { accounts, capacity } = await call('GET', '/accounts');
  assert(accounts.every((a) => a.sent_today === 3 && a.remaining_today === 0), 'both mailboxes show 3/3 used today');
  assert(capacity.limit === 6 && capacity.remaining === 0, 'pool capacity 6/day, 0 remaining');

  // Raise mailbox #2's limit: the waiting campaign should finish on its own.
  await call('PATCH', `/accounts/${a2.id}`, { daily_limit: 5 });
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 500));
    c = (await call('GET', `/campaigns/${campaign.id}`)).campaign;
    if (c.status === 'completed') break;
  }
  assert(c.status === 'completed' && c.stats.sent === 8, 'raising a limit lets the campaign finish (8/8)');

  // Unsubscribe through the public link → suppressed.
  const recips = (await call('GET', `/campaigns/${campaign.id}/recipients`)).recipients;
  const tokenMatch = received[0].raw.replace(/=\r?\n/g, '').match(/\/u\/([A-Za-z0-9_-]+)/);
  await fetch(`http://localhost:${API_PORT}/u/${tokenMatch[1]}`, { method: 'POST' });
  const sup = await call('GET', '/suppressions');
  assert(sup.total === 1, `unsubscribe link adds to suppression list (${sup.suppressions[0]?.email})`);
  assert(recips.length === 8, 'recipient log lists all 8');

  console.log('\nAll relay checks passed.');
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
} finally {
  server.kill();
  smtp.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
}
