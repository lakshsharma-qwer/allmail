import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Icon, Avatar, useAuth, useLoad, n } from '../lib.jsx';

const GROUPS = [
  [null, [['/', 'Dashboard', 'home']]],
  ['Marketing', [['/campaigns', 'Campaigns', 'send'], ['/templates', 'Templates', 'layout']]],
  ['Audience', [['/contacts', 'Contacts', 'users'], ['/suppressions', 'Do-not-email list', 'ban']]],
  ['Sending', [['/senders', 'Sender mailboxes', 'inbox']]],
];

export const Logo = () => (
  <span className="brand-mark" aria-hidden="true">
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" strokeWidth="2.3" strokeLinejoin="round" strokeLinecap="round"><path d="M3 6h18v12H3zM3 7l9 6 9-6" /></svg>
  </span>
);

function AccountMenu() {
  const { user, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef();
  useEffect(() => {
    const close = (e) => !ref.current?.contains(e.target) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button className="avatar-btn" onClick={() => setOpen(!open)} aria-expanded={open} aria-haspopup="menu">
        <Avatar name={user?.name} email={user?.email} />
        <span className="nm">{user?.name || 'Account'}<small>{user?.company || user?.email}</small></span>
        <Icon name="down" size={15} />
      </button>
      {open && (
        <div className="menu" role="menu" onClick={() => setOpen(false)}>
          <div style={{ padding: '8px 10px 10px' }}>
            <b style={{ display: 'block' }}>{user?.name || 'Your account'}</b>
            <span className="faint">{user?.email}</span>
          </div>
          <hr />
          <Link to="/settings" role="menuitem"><Icon name="gear" />Settings</Link>
          <Link to="/senders" role="menuitem"><Icon name="inbox" />Sender mailboxes</Link>
          <hr />
          <button role="menuitem" onClick={signOut}><Icon name="logout" />Sign out</button>
        </div>
      )}
    </div>
  );
}

export default function Layout() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [q, setQ] = useState('');
  const loc = useLocation();
  const nav = useNavigate();
  const searchRef = useRef();
  const { data } = useLoad('/accounts', { poll: 20000, deps: [loc.pathname] });
  const camps = useLoad('/campaigns', { poll: 20000 }).data;
  useEffect(() => setOpen(false), [loc.pathname]);
  useEffect(() => {
    const s = () => setScrolled(window.scrollY > 4);
    window.addEventListener('scroll', s, { passive: true });
    const k = (e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); searchRef.current?.focus(); } };
    window.addEventListener('keydown', k);
    return () => { window.removeEventListener('scroll', s); window.removeEventListener('keydown', k); };
  }, []);
  const cap = data?.capacity;
  const accounts = (data?.accounts || []).filter((a) => a.status === 'active');
  const sendingCount = camps?.campaigns.filter((c) => c.status === 'sending').length || 0;

  const search = (e) => {
    e.preventDefault();
    nav(`/contacts?q=${encodeURIComponent(q.trim())}`);
    setQ('');
    searchRef.current?.blur();
  };

  return (
    <div className="shell">
      {open && <div className="side-scrim" onClick={() => setOpen(false)} />}
      <aside className={`side ${open ? 'open' : ''}`}>
        <div className="brand"><Logo /> allmail</div>
        <nav className="nav" aria-label="Main">
          {GROUPS.map(([label, items]) => (
            <div key={label || 'top'}>
              {label && <div className="nav-label">{label}</div>}
              {items.map(([to, text, icon]) => (
                <NavLink key={to} to={to} end={to === '/'}>
                  <Icon name={icon} />{text}
                  {to === '/campaigns' && sendingCount > 0 && <span className="pill">{sendingCount} live</span>}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div style={{ height: 18 }} />
        {cap && (
          <div className="side-cap">
            <div>Left to send today</div>
            <div className="big">{n(cap.remaining)} <span style={{ fontSize: 13, color: '#8a92c8', fontWeight: 500 }}>/ {n(cap.limit)}</span></div>
            {accounts.length > 0 && (
              <div className="seg" aria-hidden="true">
                {accounts.map((a) => <i key={a.id} title={a.email}><b style={{ width: `${Math.min(100, (100 * a.sent_today) / a.daily_limit)}%` }} /></i>)}
              </div>
            )}
            <Link to="/senders">{cap.active ? `${cap.active} mailbox${cap.active === 1 ? '' : 'es'} in the relay →` : 'Add a mailbox →'}</Link>
          </div>
        )}
        <nav className="nav" style={{ marginTop: 12 }} aria-label="Account">
          <NavLink to="/settings"><Icon name="gear" />Settings</NavLink>
        </nav>
      </aside>

      <div className="main">
        <header className={`topbar ${scrolled ? 'scrolled' : ''}`}>
          <button className="btn ghost icon burger" onClick={() => setOpen(true)} aria-label="Open menu"><Icon name="menu" /></button>
          <form className="search" onSubmit={search} role="search">
            <Icon name="search" />
            <input ref={searchRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search contacts by name or email" aria-label="Search contacts" />
            <kbd>⌘K</kbd>
          </form>
          <div className="grow" />
          <Link className="btn primary" to="/campaigns/new" style={{ display: loc.pathname.startsWith('/campaigns/new') ? 'none' : undefined }}><Icon name="plus" /><span className="hide-sm">Create campaign</span></Link>
          <AccountMenu />
        </header>
        <div className="content"><Outlet /></div>
      </div>
    </div>
  );
}
