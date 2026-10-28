import { useState } from 'react';
import { post, del } from '../api.js';
import { useLoad, useAction, Loading, ErrorNote, Modal, Status, Icon, Empty, Avatar, n, ago } from '../lib.jsx';

export default function Suppressions() {
  const [q, setQ] = useState({ q: '', reason: '' });
  const qs = new URLSearchParams(Object.entries(q).filter(([, v]) => v)).toString();
  const { data, error, reload } = useLoad(`/suppressions?${qs}`);
  const [adding, setAdding] = useState(false);
  const [emails, setEmails] = useState('');
  const [run, busy] = useAction();

  const add = () => run(() => post('/suppressions', { emails }), null).then((r) => {
    if (!r) return;
    setAdding(false); setEmails(''); reload();
  });
  const remove = (s) => {
    const resub = s.reason !== 'bounced' && confirm(`Remove ${s.email} from the list.\n\nOK: also mark them as subscribed again.\nCancel: remove from this list only.`);
    run(() => del(`/suppressions/${s.id}${resub ? '?resubscribe=1' : ''}`), 'Removed from the do-not-email list').then(reload);
  };

  return (
    <div className="page">
      <div className="page-head">
        <div><div className="eyebrow">Audience</div><h1>Do-not-email list</h1><p>These addresses are never sent to, from any campaign or mailbox. Unsubscribes and hard bounces are added automatically.</p></div>
        <button className="btn primary" onClick={() => setAdding(true)}><Icon name="plus" />Add addresses</button>
      </div>
      <section className="card">
        <div className="row" style={{ marginBottom: 14 }}>
          <input className="input" style={{ maxWidth: 280 }} type="search" placeholder="Search email" value={q.q} onChange={(e) => setQ({ ...q, q: e.target.value })} aria-label="Search" />
          <select className="input" style={{ maxWidth: 200 }} value={q.reason} onChange={(e) => setQ({ ...q, reason: e.target.value })} aria-label="Filter by reason">
            <option value="">Any reason</option><option value="unsubscribed">Unsubscribed</option><option value="bounced">Bounced</option><option value="manual">Added manually</option>
          </select>
          {data && <span className="faint">{n(data.total)} addresses</span>}
        </div>
        <ErrorNote error={error} retry={reload} />
        {!data ? <Loading /> : data.suppressions.length === 0 ? (
          <Empty icon="shield" title="Nobody here yet">When someone unsubscribes or an address bounces, it’s listed here so it’s never emailed again.</Empty>
        ) : (
          <div className="table-wrap"><table>
            <thead><tr><th>Email</th><th>Reason</th><th>Added</th><th /></tr></thead>
            <tbody>{data.suppressions.map((s) => (
              <tr key={s.id}>
                <td><div className="cell-user"><Avatar email={s.email} size="sm" /><span>{s.email}</span></div></td><td><Status value={s.reason} /></td><td className="faint">{ago(s.created_at)}</td>
                <td style={{ textAlign: 'right' }}><button className="btn sm" onClick={() => remove(s)}>Remove</button></td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </section>

      {adding && (
        <Modal title="Add to do-not-email list" onClose={() => setAdding(false)} footer={<>
          <button className="btn ghost" onClick={() => setAdding(false)}>Cancel</button>
          <button className="btn primary" disabled={busy || !emails.trim()} onClick={add}>Add addresses</button>
        </>}>
          <label className="field"><span>Email addresses</span><textarea className="input" rows={6} value={emails} onChange={(e) => setEmails(e.target.value)} placeholder={'one@example.com\ntwo@example.com'} /><small>Separate with new lines, commas or spaces. Matching contacts are marked unsubscribed.</small></label>
        </Modal>
      )}
    </div>
  );
}
