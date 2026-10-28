import { useState } from 'react';
import { post, patch, del } from '../api.js';
import { useLoad, useAction, useToast, Loading, ErrorNote, Modal, Status, Empty, Icon, n, ago } from '../lib.jsx';
import { Ring } from '../components/Charts.jsx';
import Relay from '../components/Relay.jsx';

const PROVIDERS = [
  ['gmail', 'Gmail / Google Workspace'],
  ['outlook', 'Outlook / Microsoft 365'],
  ['zoho', 'Zoho Mail'],
  ['custom', 'Other SMTP'],
];

const LIMIT_HINT = {
  gmail: 'Google caps personal Gmail at about 500 recipients a day and Workspace at about 2,000. Stay below that.',
  outlook: 'Microsoft 365 allows up to 10,000 recipients a day, but new mailboxes should start much lower.',
  zoho: 'Zoho limits depend on your plan. Check your Zoho admin console.',
  custom: 'Use the daily limit your provider allows for this mailbox.',
};

function MailboxForm({ initial, presets, onClose, onSaved }) {
  const editing = !!initial;
  const [f, setF] = useState(() => initial
    ? { ...initial, smtp_pass: '' }
    : { provider: 'gmail', label: '', from_name: '', email: '', smtp_pass: '', daily_limit: 500, ...presets.gmail, smtp_user: '' });
  const [verified, setVerified] = useState(null);
  const [run, busy] = useAction();
  const [checking, setChecking] = useState(false);
  const set = (k) => (e) => { setVerified(null); setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }); };
  const choose = (p) => { setVerified(null); setF({ ...f, provider: p, ...presets[p], smtp_host: presets[p].smtp_host || (f.provider === 'custom' ? f.smtp_host : '') }); };

  const verify = async () => {
    setChecking(true);
    try {
      await post('/accounts/verify', f);
      setVerified({ ok: true });
    } catch (e) {
      setVerified({ ok: false, error: e.message });
    } finally {
      setChecking(false);
    }
  };

  const save = () => run(async () => {
    const body = { ...f, daily_limit: Number(f.daily_limit), smtp_port: Number(f.smtp_port) };
    if (editing && !body.smtp_pass) delete body.smtp_pass;
    const d = editing ? await patch(`/accounts/${initial.id}`, body) : await post('/accounts', body);
    onSaved(d.account);
  }, editing ? 'Mailbox saved' : 'Mailbox added to your pool');

  const isGmail = f.provider === 'gmail';
  const canVerify = f.email && f.smtp_pass && f.smtp_host;

  return (
    <Modal title={editing ? 'Edit mailbox' : 'Add a sender mailbox'} onClose={onClose} wide footer={<>
      <button className="btn ghost" onClick={onClose}>Cancel</button>
      <button className="btn" onClick={verify} disabled={!canVerify || checking}>{checking ? <span className="spin" /> : 'Test sign-in'}</button>
      <button className="btn primary" onClick={save} disabled={busy || !f.email || (!editing && !f.smtp_pass)}>{editing ? 'Save mailbox' : 'Add mailbox'}</button>
    </>}>
      <div className="stack">
        <div className="grid g4" role="radiogroup" aria-label="Provider" style={{ gap: 10 }}>
          {PROVIDERS.map(([k, label]) => (
            <button key={k} type="button" role="radio" aria-checked={f.provider === k} className={`pick ${f.provider === k ? 'on' : ''}`}
              style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 10, font: 'inherit', textAlign: 'left' }} onClick={() => choose(k)}>
              <span className={`prov ${k}`} style={{ width: 34, height: 34, fontSize: 14, borderRadius: 10 }}>{{ gmail: 'G', outlook: 'O', zoho: 'Z', custom: '@' }[k]}</span>
              <b style={{ fontSize: 13 }}>{label}</b>
            </button>
          ))}
        </div>

        {isGmail && (
          <div className="notice blue">
            <Icon name="alert" />
            <div>
              Gmail needs an <b>app password</b>, not your normal password.
              <ol style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                <li>Turn on 2-Step Verification for the Google account.</li>
                <li>Open <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noreferrer">myaccount.google.com/apppasswords</a>, create one named “allmail”.</li>
                <li>Paste the 16-character code below.</li>
              </ol>
            </div>
          </div>
        )}

        <div className="grid g2">
          <label className="field"><span>Email address</span><input className="input" type="email" value={f.email} onChange={set('email')} placeholder="you@gmail.com" /></label>
          <label className="field"><span>{isGmail ? 'App password' : 'Password'}</span>
            <input className="input mono" type="password" autoComplete="new-password" value={f.smtp_pass} onChange={set('smtp_pass')} placeholder={editing ? 'Leave blank to keep the current one' : isGmail ? 'abcd efgh ijkl mnop' : ''} />
          </label>
          <label className="field"><span>Sender name</span><input className="input" value={f.from_name} onChange={set('from_name')} placeholder="Shown as the From name" /></label>
          <label className="field"><span>Nickname <small>(optional)</small></span><input className="input" value={f.label} onChange={set('label')} placeholder="e.g. Sales Gmail 1" /></label>
        </div>

        <div className="card" style={{ padding: 16, background: 'var(--paper)' }}>
          <label className="field">
            <span>Daily sending limit</span>
            <div className="row">
              <input className="input mono" style={{ maxWidth: 140 }} type="number" min="1" max="100000" value={f.daily_limit} onChange={set('daily_limit')} />
              <span className="muted">emails per day from this mailbox</span>
            </div>
            <small>{LIMIT_HINT[f.provider]} When this mailbox reaches its limit, sending moves to the next mailbox in the campaign.</small>
          </label>
        </div>

        <details open={f.provider === 'custom'}>
          <summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: 14 }}>SMTP server settings</summary>
          <div className="grid g3" style={{ marginTop: 12 }}>
            <label className="field"><span>Host</span><input className="input mono" value={f.smtp_host} onChange={set('smtp_host')} placeholder="smtp.example.com" /></label>
            <label className="field"><span>Port</span><input className="input mono" type="number" value={f.smtp_port} onChange={set('smtp_port')} /></label>
            <label className="field"><span>Username</span><input className="input mono" value={f.smtp_user} onChange={set('smtp_user')} placeholder="Same as email" /></label>
          </div>
          <label className="check" style={{ marginTop: 12 }}>
            <input type="checkbox" checked={!!f.smtp_secure} onChange={set('smtp_secure')} />
            <span>Use SSL from the start (port 465). Leave this off for port 587, which upgrades with STARTTLS.</span>
          </label>
        </details>

        {verified?.ok && <div className="notice blue"><Icon name="check" />Signed in successfully. This mailbox is ready to send.</div>}
        {verified && !verified.ok && <div className="notice red" role="alert"><Icon name="alert" />{verified.error}</div>}
      </div>
    </Modal>
  );
}

function TestSend({ account, onClose }) {
  const [to, setTo] = useState('');
  const [run, busy] = useAction();
  return (
    <Modal title="Send a test email" onClose={onClose} footer={<>
      <button className="btn ghost" onClick={onClose}>Cancel</button>
      <button className="btn primary" disabled={busy} onClick={() => run(() => post(`/accounts/${account.id}/test`, { to }), `Test sent from ${account.email}`).then((r) => r && onClose())}>Send test</button>
    </>}>
      <label className="field"><span>Send to</span><input className="input" type="email" value={to} onChange={(e) => setTo(e.target.value)} placeholder="Leave blank to send to yourself" /><small>Sent from {account.email}. It doesn’t count towards the daily limit.</small></label>
    </Modal>
  );
}

const PROVIDER_MARK = { gmail: 'G', outlook: 'O', zoho: 'Z', custom: '@' };

function MailboxCard({ a, index, onEdit, onTest, onCheck, onToggle, onRemove, onLimit }) {
  const fill = a.daily_limit ? Math.min(1, a.sent_today / a.daily_limit) : 0;
  const ringColor = a.status === 'error' ? '#e5484d' : fill >= 1 ? '#0f1430' : '#3b4ce0';
  return (
    <div className="card mbox">
      <div className="head">
        <span className={`prov ${a.provider in PROVIDER_MARK ? a.provider : 'custom'}`} aria-hidden="true">{PROVIDER_MARK[a.provider] || '@'}</span>
        <div className="id"><b title={a.email}>{a.email}</b><small>{a.label || a.from_name || a.smtp_host} · #{index + 1} in relay</small></div>
        {a.exhausted_today ? <span className="badge amber">Quota hit</span> : <Status value={a.status} />}
      </div>
      <div className="usage">
        <Ring value={fill} color={ringColor} size={58} label={`${Math.round(fill * 100)}%`} />
        <div style={{ flex: 1 }}>
          <div className="lbl">Sent today</div>
          <div className="v">{n(a.sent_today)} <small>/ {n(a.daily_limit)}</small></div>
          <div className="lbl">{n(a.remaining_today)} left · {n(a.total_sent)} all time</div>
        </div>
      </div>
      <div className="spread">
        <label className="limit faint" htmlFor={`lim-${a.id}`}>Daily limit</label>
        <div className="limit">
          <input id={`lim-${a.id}`} key={`${a.id}-${a.daily_limit}`} className="input" type="number" min="1" defaultValue={a.daily_limit}
            onBlur={(e) => onLimit(a, e.target.value)} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} />
          <span className="faint">/ day</span>
        </div>
      </div>
      {a.last_error && <div className="err">{a.last_error}</div>}
      <div className="faint">Last sent {ago(a.last_used_at)}</div>
      <div className="actions">
        <button className="btn sm" onClick={() => onCheck(a)}><Icon name="shield" />Test sign-in</button>
        <button className="btn sm" onClick={() => onTest(a)}><Icon name="mail" />Send test</button>
        <button className="btn sm" onClick={() => onToggle(a)}><Icon name={a.status === 'paused' ? 'play' : 'pause'} />{a.status === 'paused' ? 'Resume' : 'Pause'}</button>
        <button className="btn sm ghost icon" onClick={() => onEdit(a)} aria-label={`Edit ${a.email}`} title="Edit"><Icon name="edit" /></button>
        <button className="btn sm ghost icon danger" onClick={() => onRemove(a)} aria-label={`Remove ${a.email}`} title="Remove"><Icon name="trash" /></button>
      </div>
    </div>
  );
}

export default function Senders() {
  const { data, error, reload } = useLoad('/accounts', { poll: 8000 });
  const [form, setForm] = useState(null);
  const [testing, setTesting] = useState(null);
  const [run] = useAction();
  const toast = useToast();
  if (error && !data) return <ErrorNote error={error} retry={reload} />;
  if (!data) return <Loading />;
  const { accounts, capacity: cap, presets } = data;

  const toggle = (a) => run(() => patch(`/accounts/${a.id}`, { status: a.status === 'paused' ? 'active' : 'paused' }), a.status === 'paused' ? 'Mailbox resumed' : 'Mailbox paused').then(reload);
  const check = async (a) => {
    try { await post(`/accounts/${a.id}/check`); toast(`${a.email} signed in successfully`); } catch (e) { toast(e.message, 'err'); }
    reload();
  };
  const remove = (a) => {
    if (!confirm(`Remove ${a.email}? Campaigns using it will send from their other mailboxes.`)) return;
    run(() => del(`/accounts/${a.id}`), 'Mailbox removed').then(reload);
  };
  const setLimit = (a, v) => {
    const limit = Number(v);
    if (!limit || limit === a.daily_limit) return;
    run(() => patch(`/accounts/${a.id}`, { daily_limit: limit }), `Daily limit set to ${n(limit)}`).then(reload);
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="eyebrow">Sending</div>
          <h1>Sender mailboxes</h1>
          <p>Each mailbox sends up to its own daily limit. When one is full, sending moves to the next. Your daily total is the sum of all active limits.</p>
        </div>
        <button className="btn primary" onClick={() => setForm({})}><Icon name="plus" />Add mailbox</button>
      </div>

      {!accounts.length ? (
        <div className="card">
          <Empty icon="inbox" title="Connect your first mailbox" action={<button className="btn primary" onClick={() => setForm({})}><Icon name="plus" />Add mailbox</button>}>
            Add a Gmail address with an app password and give it a daily limit. Add more mailboxes to send more each day.
          </Empty>
        </div>
      ) : (
        <>
          <section className="hero" style={{ marginBottom: 18 }}>
            <div className="spread" style={{ alignItems: 'flex-start' }}>
              <div>
                <div className="eyebrow">Your relay</div>
                <h2>{cap.active} <span className="of">×</span> mailbox{cap.active === 1 ? '' : 'es'} <span className="of">=</span> {n(cap.limit)} <span className="of">a day</span></h2>
                <p className="sub">{n(cap.sent)} sent today · {n(cap.remaining)} left until midnight</p>
              </div>
            </div>
            <div className="meter"><i style={{ width: `${cap.limit ? (100 * cap.sent) / cap.limit : 0}%` }} /></div>
            <Relay accounts={accounts} dark />
          </section>

          <div className="grid g3">
            {accounts.map((a, i) => (
              <MailboxCard key={a.id} a={a} index={i} onEdit={setForm} onTest={setTesting} onCheck={check} onToggle={toggle} onRemove={remove} onLimit={setLimit} />
            ))}
            <button className="add-tile" onClick={() => setForm({})}>
              <div><div className="plus"><Icon name="plus" /></div><b>Add another mailbox</b><div className="faint" style={{ marginTop: 4 }}>Each mailbox adds its limit to your daily total</div></div>
            </button>
          </div>
        </>
      )}

      {form && <MailboxForm initial={form.id ? form : null} presets={presets} onClose={() => setForm(null)} onSaved={() => { setForm(null); reload(); }} />}
      {testing && <TestSend account={testing} onClose={() => setTesting(null)} />}
    </div>
  );
}
