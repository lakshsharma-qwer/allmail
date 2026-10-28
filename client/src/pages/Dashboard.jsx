import { Link } from 'react-router-dom';
import { useAuth, useLoad, Loading, ErrorNote, Status, Stat, Icon, n, pct, when } from '../lib.jsx';
import Relay from '../components/Relay.jsx';
import { AreaChart, Donut } from '../components/Charts.jsx';

function greeting(tz) {
  const h = Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hourCycle: 'h23', timeZone: tz }).format(new Date()));
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

const SETUP = [
  ['inbox', 'Connect a mailbox', 'Add a Gmail address with an app password and give it a daily limit. Each extra mailbox adds to your daily total.', '/senders', 'Add mailbox', 'blue'],
  ['users', 'Bring your audience', 'Import a CSV or add people by hand, then group them into lists.', '/contacts', 'Add contacts', 'violet'],
  ['send', 'Send your first campaign', 'Write your email, pick a list and the mailboxes to send from, then start.', '/campaigns/new', 'Create campaign', 'green'],
];

export default function Dashboard() {
  const { user } = useAuth();
  const { data, error, reload } = useLoad('/stats/dashboard', { poll: 5000 });
  if (error && !data) return <ErrorNote error={error} retry={reload} />;
  if (!data) return <Loading />;

  const { capacity: cap, accounts, totals, daily, active_campaigns: active, recent_campaigns: recent, contacts } = data;
  const firstName = user.name?.split(' ')[0];
  const sending = active.some((c) => c.status === 'sending' && !c.waiting_reason);
  const usedPct = cap.limit ? cap.sent / cap.limit : 0;
  const series = daily.map((d) => ({
    label: new Date(`${d.day}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
    full: new Date(`${d.day}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }),
    value: d.sent,
  }));
  const sent14 = daily.reduce((s, d) => s + d.sent, 0);

  if (!accounts.length) {
    return (
      <div className="page">
        <div className="page-head">
          <div>
            <div className="eyebrow">Getting started</div>
            <h1>{greeting(user.timezone)}{firstName ? `, ${firstName}` : ''}</h1>
            <p>Three steps to your first campaign. It takes about five minutes.</p>
          </div>
        </div>
        <div className="grid g3">
          {SETUP.map(([icon, title, body, to, cta, tone], i) => (
            <div className="card stack" key={to} style={{ display: 'flex', flexDirection: 'column' }}>
              <div className="spread">
                <span className={`stat ico tone-${tone}`} style={{ padding: 0, width: 44, height: 44, borderRadius: 13, display: 'grid', placeItems: 'center' }}><Icon name={icon} /></span>
                <span className="badge plain">Step {i + 1}</span>
              </div>
              <h2 style={{ fontSize: 19 }}>{title}</h2>
              <p className="muted" style={{ flex: 1 }}>{body}</p>
              <Link className={`btn ${i === 0 ? 'primary' : ''}`} to={to}>{cta}</Link>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="eyebrow">{new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: user.timezone })}</div>
          <h1>{greeting(user.timezone)}{firstName ? `, ${firstName}` : ''}</h1>
          <p>{sending ? 'A campaign is sending right now. The relay below updates live.' : 'Here’s your sending capacity and how recent campaigns performed.'}</p>
        </div>
      </div>

      <section className="hero" aria-labelledby="cap">
        <div className="spread" style={{ alignItems: 'flex-start' }}>
          <div>
            <div className="eyebrow">Today’s sending capacity</div>
            <h2 id="cap">{n(cap.sent)} <span className="of">/ {n(cap.limit)} sent</span></h2>
            <p className="sub">Limits reset {when(data.resets_at, user.timezone)} · {user.timezone}</p>
          </div>
          <div className="row">
            {sending && <span className="badge live" style={{ background: 'rgba(74,222,128,.14)', color: '#86efac' }}>Sending now</span>}
            <Link className="btn sm" to="/senders">Manage mailboxes</Link>
          </div>
        </div>
        <div className="meter" role="progressbar" aria-valuenow={Math.round(usedPct * 100)} aria-valuemin={0} aria-valuemax={100} aria-label="Daily capacity used">
          <i style={{ width: `${usedPct * 100}%` }} />
        </div>
        <div className="hero-stats" style={{ marginBottom: 14 }}>
          <div><b>{n(cap.remaining)}</b>left today</div>
          <div><b>{cap.active}</b>active mailbox{cap.active === 1 ? '' : 'es'}</div>
          <div><b>{n(cap.limit)}</b>max per day</div>
          <div><b>{active.filter((c) => c.status === 'sending').length}</b>campaigns sending</div>
        </div>
        <Relay accounts={accounts} live={sending} dark />
      </section>

      <div className="grid g4" style={{ margin: '18px 0' }}>
        <Stat label="Emails sent" value={n(totals.sent)} sub="last 30 days" icon="send" tone="blue" />
        <Stat label="Open rate" value={pct(totals.opened, totals.sent)} sub={`${n(totals.opened)} unique opens`} icon="eye" tone="violet" />
        <Stat label="Click rate" value={pct(totals.clicked, totals.sent)} sub={`${n(totals.clicked)} unique clicks`} icon="pointer" tone="green" />
        <Stat label="Subscribed contacts" value={n(contacts.subscribed)} sub={`${n(contacts.total)} contacts in total`} icon="users" tone="sky" />
      </div>

      <div className="grid g-main">
        <section className="card">
          <div className="card-head">
            <div><h2>Sending activity</h2><p>Emails sent per day, last 14 days</p></div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ font: '700 22px var(--f-display)', letterSpacing: '-0.03em' }}>{n(sent14)}</div>
              <div className="faint">sent in 14 days</div>
            </div>
          </div>
          <AreaChart data={series} height={230} />
        </section>

        <section className="card">
          <div className="card-head"><div><h2>Engagement</h2><p>Last 30 days</p></div></div>
          <div style={{ display: 'grid', placeItems: 'center', margin: '4px 0 18px' }}>
            <Donut center={pct(totals.opened, totals.sent)} sub="open rate" segments={[
              { label: 'Clicked', value: totals.clicked, color: '#12a37a' },
              { label: 'Opened only', value: Math.max(0, totals.opened - totals.clicked), color: '#7a5af8' },
              { label: 'Not opened', value: Math.max(0, totals.sent - totals.opened), color: '#e3e6f3' },
            ]} />
          </div>
          <div className="stack" style={{ '--x': 0 }}>
            {[
              ['Clicked', totals.clicked, '#12a37a'],
              ['Opened', totals.opened, '#7a5af8'],
              ['Unsubscribed', totals.unsubscribed, '#e5484d'],
              ['Failed', totals.failed, '#c27c00'],
            ].map(([label, v, color]) => (
              <div className="spread" key={label} style={{ marginTop: 10 }}>
                <span className="row" style={{ gap: 8 }}><i style={{ width: 9, height: 9, borderRadius: 3, background: color, display: 'inline-block' }} />{label}</span>
                <b className="num-t">{n(v)}</b>
              </div>
            ))}
          </div>
        </section>
      </div>

      {active.length > 0 && (
        <section className="card" style={{ marginTop: 18 }}>
          <div className="card-head"><div><h2>In progress</h2><p>Sending, paused and scheduled campaigns</p></div><Link className="btn sm" to="/campaigns">All campaigns</Link></div>
          <div className="stack">
            {active.map((c) => (
              <div key={c.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: 8 }}>
                <div style={{ minWidth: 0 }}>
                  <div className="row" style={{ marginBottom: 8 }}>
                    <Link to={`/campaigns/${c.id}`} style={{ fontWeight: 600, color: 'var(--ink)' }}>{c.name}</Link>
                    <Status value={c.status} waiting={c.waiting_reason} />
                  </div>
                  <div className="progress"><i style={{ width: `${c.total ? (100 * c.sent) / c.total : 0}%` }} /></div>
                  {c.waiting_reason && <p className="faint" style={{ marginTop: 6 }}>{c.waiting_reason}</p>}
                  {c.status === 'scheduled' && <p className="faint" style={{ marginTop: 6 }}>Starts {when(c.scheduled_at, user.timezone)}</p>}
                </div>
                <div style={{ textAlign: 'right', alignSelf: 'end' }}>
                  <b className="num-t">{n(c.sent)}</b><span className="faint"> / {n(c.total)}</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="card" style={{ marginTop: 18 }}>
        <div className="card-head"><div><h2>Recently sent</h2><p>Finished campaigns and how they performed</p></div><Link className="btn sm" to="/campaigns">View all</Link></div>
        {recent.length ? (
          <div className="table-wrap"><table>
            <thead><tr><th>Campaign</th><th>Finished</th><th className="num">Sent</th><th className="num">Open rate</th><th className="num">Click rate</th></tr></thead>
            <tbody>{recent.map((c) => (
              <tr key={c.id}>
                <td><Link to={`/campaigns/${c.id}`} style={{ fontWeight: 600, color: 'var(--ink)' }}>{c.name}</Link></td>
                <td className="faint">{when(c.completed_at, user.timezone)}</td>
                <td className="num">{n(c.sent)}</td><td className="num">{pct(c.opened, c.sent)}</td><td className="num">{pct(c.clicked, c.sent)}</td>
              </tr>
            ))}</tbody>
          </table></div>
        ) : <p className="muted">When a campaign finishes, its open and click rates appear here.</p>}
      </section>
    </div>
  );
}
