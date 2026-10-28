import { useState } from 'react';
import { patch, post } from '../api.js';
import { useAuth, useAction, useLoad } from '../lib.jsx';

const ZONES = (() => {
  try { return Intl.supportedValuesOf('timeZone'); } catch { return ['UTC', 'Asia/Kolkata', 'Europe/London', 'America/New_York']; }
})();

export default function Settings() {
  const { user, setUser } = useAuth();
  const meta = useLoad('/meta').data;
  const [f, setF] = useState({ name: user.name, company: user.company, address: user.address, timezone: user.timezone, delay_min: user.delay_min, delay_max: user.delay_max });
  const [pw, setPw] = useState({ current: '', next: '' });
  const [run, busy] = useAction();
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const save = (e) => { e.preventDefault(); run(() => patch('/settings', { ...f, delay_min: Number(f.delay_min), delay_max: Number(f.delay_max) }), 'Settings saved').then((d) => d && setUser(d.user)); };
  const changePw = (e) => { e.preventDefault(); run(() => post('/settings/password', pw), 'Password changed').then((d) => d && setPw({ current: '', next: '' })); };

  const perHour = Math.round(3600 / Math.max(1, (Number(f.delay_min) + Number(f.delay_max)) / 2 + 1));

  return (
    <div className="page" style={{ maxWidth: 820 }}>
      <div className="page-head"><div><div className="eyebrow">Account</div><h1>Settings</h1><p>Sending pace, timezone, footer details and your password.</p></div></div>

      <form className="card stack" onSubmit={save}>
        <h2>Sending</h2>
        <div className="grid g2">
          <label className="field"><span>Shortest pause between emails</span><div className="row"><input className="input mono" style={{ maxWidth: 110 }} type="number" min="0" max="600" value={f.delay_min} onChange={set('delay_min')} /><span className="muted">seconds</span></div></label>
          <label className="field"><span>Longest pause between emails</span><div className="row"><input className="input mono" style={{ maxWidth: 110 }} type="number" min="0" max="600" value={f.delay_max} onChange={set('delay_max')} /><span className="muted">seconds</span></div></label>
        </div>
        <p className="faint">Each mailbox waits a random time in this range between emails, about {perHour} emails per hour per mailbox. Steady, human-paced sending keeps Gmail from flagging the mailbox.</p>
        <label className="field"><span>Timezone</span>
          <select className="input" value={f.timezone} onChange={set('timezone')}>{ZONES.map((z) => <option key={z}>{z}</option>)}</select>
          <small>Daily limits reset at midnight in this timezone.</small>
        </label>

        <h2 style={{ marginTop: 12 }}>Footer details</h2>
        <p className="faint">Shown in the unsubscribe footer of every campaign. Anti-spam laws such as CAN-SPAM require a postal address.</p>
        <div className="grid g2">
          <label className="field"><span>Your name</span><input className="input" value={f.name} onChange={set('name')} /></label>
          <label className="field"><span>Company or brand</span><input className="input" value={f.company} onChange={set('company')} /></label>
        </div>
        <label className="field"><span>Postal address</span><input className="input" value={f.address} onChange={set('address')} placeholder="Street, city, PIN, country" /></label>
        <div className="row" style={{ justifyContent: 'flex-end' }}><button className="btn primary" disabled={busy}>Save settings</button></div>
      </form>

      <section className="card stack">
        <h2>Tracking address</h2>
        <p className="muted">Open-tracking pixels, click links and unsubscribe links in your emails point to <code>{meta?.app_url}</code>. Recipients must be able to reach this address, so set <code>APP_URL</code> in <code>.env</code> to your public domain before sending real campaigns.</p>
      </section>

      <form className="card stack" onSubmit={changePw}>
        <h2>Password</h2>
        <div className="grid g2">
          <label className="field"><span>Current password</span><input className="input" type="password" autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} required /></label>
          <label className="field"><span>New password</span><input className="input" type="password" autoComplete="new-password" minLength={8} value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} required /></label>
        </div>
        <div className="row" style={{ justifyContent: 'flex-end' }}><button className="btn" disabled={busy}>Change password</button></div>
      </form>

      <p className="faint">Signed in as {user.email}.</p>
    </div>
  );
}
