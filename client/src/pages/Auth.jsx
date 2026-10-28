import { useState } from 'react';
import { Link } from 'react-router-dom';
import { post } from '../api.js';
import { useAuth, Icon } from '../lib.jsx';
import { Logo } from '../components/Layout.jsx';
import Relay from '../components/Relay.jsx';

const DEMO = [
  { id: 1, email: 'hello@yourbrand.com', daily_limit: 500, sent_today: 500, remaining_today: 0, status: 'active' },
  { id: 2, email: 'team@yourbrand.com', daily_limit: 500, sent_today: 212, remaining_today: 288, status: 'active' },
  { id: 3, email: 'news@yourbrand.com', daily_limit: 500, sent_today: 0, remaining_today: 500, status: 'active' },
];

function Art() {
  return (
    <div className="auth-art">
      <div className="brand" style={{ padding: 0 }}><Logo /> allmail</div>
      <div>
        <h1>Email marketing that sends from <em>your own mailboxes.</em></h1>
        <p>Connect Gmail or any SMTP mailbox and give each one a daily limit. Campaigns send from one mailbox until it hits its limit, then move on to the next.</p>
        <div style={{ marginTop: 30 }}><Relay accounts={DEMO} live dark /></div>
      </div>
      <div className="auth-points">
        <span><Icon name="zap" />Automatic mailbox switching</span>
        <span><Icon name="shield" />One-click unsubscribe built in</span>
        <span><Icon name="trend" />Open and click tracking</span>
      </div>
    </div>
  );
}

function useSubmit(path) {
  const { signIn } = useAuth();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e, body) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      const d = await post(path, body);
      signIn(d.token, d.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  return { submit, error, busy };
}

export function Login() {
  const [f, setF] = useState({ email: '', password: '' });
  const { submit, error, busy } = useSubmit('/auth/login');
  return (
    <div className="auth">
      <Art />
      <div className="auth-form">
        <form onSubmit={(e) => submit(e, f)} className="stack">
          <h1>Welcome back</h1>
          <p className="sub">Sign in to manage your campaigns.</p>
          {error && <div className="notice red" role="alert"><Icon name="alert" />{error}</div>}
          <label className="field"><span>Email</span><input className="input" type="email" autoComplete="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></label>
          <label className="field"><span>Password</span><input className="input" type="password" autoComplete="current-password" required value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></label>
          <button className="btn primary lg" style={{ width: '100%' }} disabled={busy}>{busy ? <span className="spin" /> : 'Sign in'}</button>
          <p className="muted">New here? <Link to="/signup">Create an account</Link></p>
        </form>
      </div>
    </div>
  );
}

export function Signup() {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const [f, setF] = useState({ name: '', email: '', password: '' });
  const { submit, error, busy } = useSubmit('/auth/signup');
  return (
    <div className="auth">
      <Art />
      <div className="auth-form">
        <form onSubmit={(e) => submit(e, { ...f, timezone: tz })} className="stack">
          <h1>Create your account</h1>
          <p className="sub">Free and self-hosted. Your data stays on your server.</p>
          {error && <div className="notice red" role="alert"><Icon name="alert" />{error}</div>}
          <label className="field"><span>Your name</span><input className="input" autoComplete="name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
          <label className="field"><span>Email</span><input className="input" type="email" autoComplete="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></label>
          <label className="field"><span>Password</span><input className="input" type="password" autoComplete="new-password" minLength={8} required value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /><small>At least 8 characters.</small></label>
          <p className="faint">Daily limits reset at midnight in {tz}. You can change this in Settings.</p>
          <button className="btn primary lg" style={{ width: '100%' }} disabled={busy}>{busy ? <span className="spin" /> : 'Create account'}</button>
          <p className="muted">Already have an account? <Link to="/login">Sign in</Link></p>
        </form>
      </div>
    </div>
  );
}
