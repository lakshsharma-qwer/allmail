import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { post, del } from '../api.js';
import { useAuth, useLoad, useAction, Loading, ErrorNote, Status, Icon, Empty, n, pct, when } from '../lib.jsx';

const FILTERS = [['', 'All'], ['draft', 'Drafts'], ['scheduled', 'Scheduled'], ['sending', 'Sending'], ['paused', 'Paused'], ['completed', 'Sent']];

export default function Campaigns() {
  const { user } = useAuth();
  const { data, error, reload } = useLoad('/campaigns', { poll: 6000 });
  const [filter, setFilter] = useState('');
  const [run] = useAction();
  const nav = useNavigate();
  if (error && !data) return <ErrorNote error={error} retry={reload} />;
  if (!data) return <Loading />;

  const rows = data.campaigns.filter((c) => !filter || c.status === filter);
  const duplicate = (c) => run(() => post(`/campaigns/${c.id}/duplicate`), 'Campaign duplicated').then((d) => d && nav(`/campaigns/${d.campaign.id}/edit`));
  const remove = (c) => confirm(`Delete “${c.name}” and its report?`) && run(() => del(`/campaigns/${c.id}`), 'Campaign deleted').then(reload);

  return (
    <div className="page">
      <div className="page-head">
        <div><div className="eyebrow">Marketing</div><h1>Campaigns</h1><p>Bulk emails sent through your mailbox relay.</p></div>
        <Link className="btn primary" to="/campaigns/new"><Icon name="plus" />New campaign</Link>
      </div>

      {data.campaigns.length === 0 ? (
        <div className="card">
          <Empty icon="send" title="No campaigns yet" action={<Link className="btn primary" to="/campaigns/new">Create your first campaign</Link>}>
            Write an email, choose who gets it and which mailboxes send it. allmail spreads the sending across your mailboxes’ daily limits.
          </Empty>
        </div>
      ) : (
        <>
          <div className="tabs" role="tablist">
            {FILTERS.map(([k, label]) => (
              <button key={k} role="tab" aria-selected={filter === k} onClick={() => setFilter(k)}>
                {label}<span className="count">{n(data.campaigns.filter((c) => !k || c.status === k).length)}</span>
              </button>
            ))}
          </div>
          <section className="card">
            {rows.length === 0 ? <p className="muted">No campaigns with this status.</p> : (
              <div className="table-wrap"><table>
                <thead><tr><th>Campaign</th><th>Status</th><th>Progress</th><th className="num">Opens</th><th className="num">Clicks</th><th /></tr></thead>
                <tbody>{rows.map((c) => {
                  const s = c.stats;
                  const editable = ['draft', 'scheduled', 'paused'].includes(c.status);
                  return (
                    <tr key={c.id}>
                      <td style={{ maxWidth: 360 }}>
                        <div className="cell-user">
                        <span className={`stat ico tone-${{ sending: 'blue', completed: 'green', paused: 'amber', scheduled: 'sky', draft: 'violet', cancelled: 'red' }[c.status] || 'blue'}`} style={{ width: 36, height: 36, borderRadius: 11, display: 'grid', placeItems: 'center', padding: 0, flex: 'none' }}><Icon name={c.status === 'completed' ? 'check' : c.status === 'scheduled' ? 'clock' : c.status === 'draft' ? 'edit' : 'send'} size={16} /></span>
                        <div style={{ minWidth: 0 }}>
                        <Link to={c.status === 'draft' ? `/campaigns/${c.id}/edit` : `/campaigns/${c.id}`} style={{ fontWeight: 600 }}>{c.name}</Link>
                        <div className="faint" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {c.status === 'scheduled' ? `Starts ${when(c.scheduled_at, user.timezone)}` : c.subject || 'No subject yet'}
                        </div>
                        </div></div>
                      </td>
                      <td><Status value={c.status} waiting={c.waiting_reason} /></td>
                      <td style={{ minWidth: 160 }}>
                        {s.total ? (<>
                          <div className="progress"><i style={{ width: `${(100 * (s.sent + s.failed)) / s.total}%` }} /></div>
                          <div className="faint mono" style={{ marginTop: 4 }}>{n(s.sent)} / {n(s.total)}{s.failed ? ` · ${n(s.failed)} failed` : ''}</div>
                        </>) : <span className="faint">—</span>}
                      </td>
                      <td className="num">{s.sent ? pct(s.opened, s.sent) : '—'}</td>
                      <td className="num">{s.sent ? pct(s.clicked, s.sent) : '—'}</td>
                      <td><div className="row" style={{ justifyContent: 'flex-end', flexWrap: 'nowrap' }}>
                        {editable && <Link className="btn sm" to={`/campaigns/${c.id}/edit`}>Edit</Link>}
                        {c.status !== 'draft' && <Link className="btn sm" to={`/campaigns/${c.id}`}>Report</Link>}
                        <button className="btn sm" onClick={() => duplicate(c)}>Duplicate</button>
                        {c.status !== 'sending' && <button className="btn sm danger" onClick={() => remove(c)}>Delete</button>}
                      </div></td>
                    </tr>
                  );
                })}</tbody>
              </table></div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
