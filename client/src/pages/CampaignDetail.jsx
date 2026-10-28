import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { post } from '../api.js';
import { useAuth, useLoad, useAction, Loading, ErrorNote, Status, Pager, Icon, Stat, Avatar, n, pct, when } from '../lib.jsx';
import { Funnel, Donut } from '../components/Charts.jsx';
import Relay from '../components/Relay.jsx';

const FILTERS = [['', 'All'], ['sent', 'Sent'], ['queued', 'Waiting'], ['failed', 'Failed'], ['opened', 'Opened'], ['clicked', 'Clicked'], ['unsubscribed', 'Unsubscribed']];

export default function CampaignDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const nav = useNavigate();
  const { data, error, reload } = useLoad(`/campaigns/${id}`, { poll: 3000 });
  const [rq, setRq] = useState({ filter: '', q: '', page: 1 });
  const qs = new URLSearchParams(Object.entries(rq).filter(([, v]) => v)).toString();
  const recips = useLoad(`/campaigns/${id}/recipients?${qs}`, { poll: data?.campaign.status === 'sending' ? 5000 : 0 });
  const [run, busy] = useAction();

  if (error && !data) return <ErrorNote error={error} retry={reload} />;
  if (!data) return <Loading />;
  const c = data.campaign;
  const s = c.stats;
  const done = s.sent + s.failed;

  const act = (path, msg, confirmMsg) => {
    if (confirmMsg && !confirm(confirmMsg)) return;
    run(() => post(`/campaigns/${id}/${path}`), msg).then(() => { reload(); recips.reload(); });
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <Link className="crumb" to="/campaigns">← Campaigns</Link>
          <div className="row"><h1>{c.name}</h1><Status value={c.status} waiting={c.waiting_reason} /></div>
          <p><span className="faint">Subject</span> {c.subject}</p>
        </div>
        <div className="row">
          {c.status === 'sending' && <button className="btn" disabled={busy} onClick={() => act('pause', 'Campaign paused')}><Icon name="pause" />Pause</button>}
          {c.status === 'paused' && <>
            <button className="btn" onClick={() => nav(`/campaigns/${id}/edit`)}>Edit</button>
            <button className="btn primary" disabled={busy} onClick={() => act('resume', 'Campaign resumed')}><Icon name="play" />Resume</button>
          </>}
          {c.status === 'scheduled' && <button className="btn" disabled={busy} onClick={() => act('unschedule', 'Moved back to drafts')}>Unschedule</button>}
          {['sending', 'paused', 'scheduled'].includes(c.status) && (
            <button className="btn danger" disabled={busy} onClick={() => act('cancel', 'Campaign cancelled', 'Cancel this campaign? Emails not sent yet will not be sent.')}>Cancel campaign</button>
          )}
          {s.failed > 0 && c.status !== 'cancelled' && <button className="btn" disabled={busy} onClick={() => act('retry-failed', 'Failed emails queued again')}><Icon name="refresh" />Retry failed</button>}
        </div>
      </div>

      {c.waiting_reason && (
        <div className={`notice ${/limit/.test(c.waiting_reason) ? 'amber' : 'red'}`} style={{ marginBottom: 16 }} role="status">
          <Icon name={/limit/.test(c.waiting_reason) ? 'clock' : 'alert'} /><span>{c.waiting_reason}</span>
        </div>
      )}
      {c.status === 'scheduled' && <div className="notice blue" style={{ marginBottom: 16 }}><Icon name="clock" />Starts sending {when(c.scheduled_at, user.timezone)}.</div>}

      <section className="hero">
        <div className="spread" style={{ alignItems: 'flex-start' }}>
          <div>
            <div className="eyebrow">Delivery progress</div>
            <h2>{n(s.sent)} <span className="of">/ {n(s.total || c.audience)} sent</span></h2>
            <p className="sub">{c.started_at ? `Started ${when(c.started_at, user.timezone)}` : 'Not started yet'}{c.completed_at ? ` · Finished ${when(c.completed_at, user.timezone)}` : ''}</p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ font: '700 34px var(--f-display)', letterSpacing: '-0.04em' }}>{s.total ? Math.round((100 * done) / s.total) : 0}%</div>
            <div className="sub" style={{ fontSize: 12.5 }}>{c.rotation === 'sequential' ? 'Fill one, then move on' : 'Taking turns'}</div>
          </div>
        </div>
        <div className="meter"><i style={{ width: `${s.total ? (100 * s.sent) / s.total : 0}%` }} /></div>
        <div className="hero-stats" style={{ marginBottom: 12 }}>
          <div><b>{n(s.queued)}</b>waiting</div>
          <div><b>{n(s.failed)}</b>failed</div>
          <div><b>{c.accounts.length}</b>mailbox{c.accounts.length === 1 ? '' : 'es'} in the relay</div>
        </div>
        {c.accounts.length > 0 && <Relay accounts={c.accounts} rotation={c.rotation} live={c.status === 'sending' && !c.waiting_reason} dark />}
      </section>

      <div className="grid g4" style={{ margin: '18px 0' }}>
        <Stat label="Sent" value={n(s.sent)} sub={`${n(s.queued)} waiting · ${n(s.failed)} failed`} icon="send" tone="blue" />
        <Stat label="Open rate" value={pct(s.opened, s.sent)} sub={`${n(s.opened)} people opened`} icon="eye" tone="violet" />
        <Stat label="Click rate" value={pct(s.clicked, s.sent)} sub={`${n(s.clicked)} people clicked`} icon="pointer" tone="green" />
        <Stat label="Unsubscribe rate" value={pct(s.unsubscribed, s.sent)} sub={`${n(s.unsubscribed)} people`} icon="userx" tone="red" />
      </div>

      <div className="grid g-main" style={{ marginBottom: 18 }}>
        <section className="card">
          <div className="card-head"><div><h2>Engagement funnel</h2><p>Unique people at each step</p></div></div>
          <Funnel steps={[
            { label: 'Sent', value: s.sent, color: 'linear-gradient(90deg,#6c7bff,#3b4ce0)' },
            { label: 'Opened', value: s.opened, color: 'linear-gradient(90deg,#a48bff,#7a5af8)' },
            { label: 'Clicked', value: s.clicked, color: 'linear-gradient(90deg,#3fd0a4,#12a37a)' },
            { label: 'Unsubscribed', value: s.unsubscribed, color: 'linear-gradient(90deg,#ff8f92,#e5484d)' },
          ]} />
          <p className="faint" style={{ marginTop: 16 }}>Open rates are estimates: some mail apps load images automatically and others block them.</p>
        </section>
        <section className="card">
          <div className="card-head"><div><h2>Delivery</h2><p>All recipients</p></div></div>
          <div style={{ display: 'grid', placeItems: 'center' }}>
            <Donut center={n(s.total)} sub="recipients" segments={[
              { label: 'Sent', value: s.sent, color: '#3b4ce0' },
              { label: 'Waiting', value: s.queued, color: '#c9cef5' },
              { label: 'Failed', value: s.failed, color: '#e5484d' },
            ]} />
          </div>
          <div className="legend" style={{ justifyContent: 'center', marginTop: 16 }}>
            <span><i style={{ background: '#3b4ce0' }} />Sent {n(s.sent)}</span>
            <span><i style={{ background: '#c9cef5' }} />Waiting {n(s.queued)}</span>
            <span><i style={{ background: '#e5484d' }} />Failed {n(s.failed)}</span>
          </div>
        </section>
      </div>

      <div className="grid g2">
        <section className="card">
          <div className="card-head"><h2>Sent per mailbox</h2></div>
          {c.by_account.length ? c.by_account.map((a) => (
            <div key={a.id} style={{ marginBottom: 12 }}>
              <div className="spread" style={{ marginBottom: 6 }}><span className="cell-user" style={{ gap: 10 }}><Avatar email={a.email} name={a.label} size="sm" square /><span>{a.email}</span></span><b className="num-t">{n(a.sent)}</b></div>
              <div className="progress"><i style={{ width: `${(100 * a.sent) / Math.max(1, s.sent)}%` }} /></div>
            </div>
          )) : <p className="muted">Nothing sent yet.</p>}
        </section>
        <section className="card">
          <div className="card-head"><h2>Most-clicked links</h2></div>
          {c.top_links.length ? (
            <div className="table-wrap"><table>
              <thead><tr><th>Link</th><th className="num">People</th><th className="num">Clicks</th></tr></thead>
              <tbody>{c.top_links.map((l) => (
                <tr key={l.url}><td style={{ maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}><a href={l.url} target="_blank" rel="noreferrer">{l.url}</a></td><td className="num">{n(l.unique_clicks)}</td><td className="num">{n(l.clicks)}</td></tr>
              ))}</tbody>
            </table></div>
          ) : <p className="muted">{c.track_clicks ? 'No clicks yet.' : 'Click tracking is off for this campaign.'}</p>}
        </section>
      </div>

      <section className="card" style={{ marginTop: 16 }}>
        <div className="card-head">
          <h2>Recipients</h2>
          <input className="input" style={{ maxWidth: 260 }} type="search" placeholder="Search email" value={rq.q} onChange={(e) => setRq({ ...rq, q: e.target.value, page: 1 })} aria-label="Search recipients" />
        </div>
        <div className="tabs" role="tablist">
          {FILTERS.map(([k, label]) => <button key={k} role="tab" aria-selected={rq.filter === k} onClick={() => setRq({ ...rq, filter: k, page: 1 })}>{label}</button>)}
        </div>
        {!recips.data ? <Loading /> : recips.data.recipients.length === 0 ? <p className="muted">No recipients match.</p> : (
          <>
            <div className="table-wrap"><table>
              <thead><tr><th>Email</th><th>Status</th><th>Sent from</th><th>Sent</th><th className="num">Opens</th><th className="num">Clicks</th></tr></thead>
              <tbody>{recips.data.recipients.map((r) => (
                <tr key={r.id}>
                  <td><div className="cell-user"><Avatar email={r.email} size="sm" /><span>{r.email}</span>{r.unsubscribed_at && <span className="badge red plain">Unsubscribed</span>}</div></td>
                  <td><Status value={r.status === 'sending' ? 'queued' : r.status} />{r.error && r.status !== 'sent' && <div className="faint" style={{ maxWidth: 300, color: r.status === 'failed' ? 'var(--stamp)' : undefined }}>{r.error}</div>}</td>
                  <td className="faint">{r.sender || '—'}</td>
                  <td className="faint">{when(r.sent_at, user.timezone)}</td>
                  <td className="num">{r.open_count || '—'}</td>
                  <td className="num">{r.click_count || '—'}</td>
                </tr>
              ))}</tbody>
            </table></div>
            <Pager page={recips.data.page} size={recips.data.size} total={recips.data.total} onPage={(p) => setRq({ ...rq, page: p })} />
          </>
        )}
      </section>
    </div>
  );
}
