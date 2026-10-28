import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Papa from 'papaparse';
import { post, patch, del } from '../api.js';
import { useLoad, useAction, Loading, ErrorNote, Modal, Status, Pager, Icon, Avatar, Empty, n } from '../lib.jsx';

// ---------- import ----------
const GUESS = {
  email: /^(e-?mail|email address|mail)$/i,
  first_name: /^(first|first ?name|given ?name|fname|name)$/i,
  last_name: /^(last|last ?name|surname|family ?name|lname)$/i,
};

function ImportModal({ lists, onClose, onDone }) {
  const [file, setFile] = useState(null);
  const [parsed, setParsed] = useState(null);
  const [map, setMap] = useState({});
  const [target, setTarget] = useState({ list: lists[0]?.id ? String(lists[0].id) : 'new', newList: '' });
  const [result, setResult] = useState(null);
  const [over, setOver] = useState(false);
  const [run, busy] = useAction();
  const input = useRef();

  const load = (f) => {
    if (!f) return;
    setFile(f);
    Papa.parse(f, {
      header: true, skipEmptyLines: true,
      complete: (res) => {
        const cols = res.meta.fields || [];
        const m = {};
        for (const c of cols) {
          const key = Object.keys(GUESS).find((k) => GUESS[k].test(c.trim()) && !Object.values(m).includes(k));
          m[c] = key || 'field';
        }
        if (!Object.values(m).includes('email')) {
          const c = cols.find((col) => res.data.slice(0, 5).some((r) => /@/.test(r[col] || '')));
          if (c) m[c] = 'email';
        }
        setMap(m);
        setParsed(res);
        if (target.list === 'new' && !target.newList) setTarget({ ...target, newList: f.name.replace(/\.[^.]+$/, '') });
      },
    });
  };

  const rows = useMemo(() => {
    if (!parsed) return [];
    return parsed.data.map((r) => {
      const out = { fields: {} };
      for (const [col, role] of Object.entries(map)) {
        if (role === 'skip') continue;
        if (role === 'field') out.fields[col.trim().toLowerCase().replace(/\W+/g, '_')] = r[col];
        else out[role] = r[col];
      }
      return out;
    });
  }, [parsed, map]);

  const hasEmail = Object.values(map).includes('email');
  const submit = () => run(async () => {
    const body = { rows, lists: target.list !== 'new' ? [Number(target.list)] : [], new_list: target.list === 'new' ? target.newList || 'Imported' : undefined };
    setResult(await post('/contacts/import', body));
  });

  if (result) {
    return (
      <Modal title="Import finished" onClose={() => { onDone(); onClose(); }} footer={<button className="btn primary" onClick={() => { onDone(); onClose(); }}>Done</button>}>
        <div className="grid g3">
          <div className="stat card"><div className="label">New</div><div className="value">{n(result.created)}</div></div>
          <div className="stat card"><div className="label">Updated</div><div className="value">{n(result.updated)}</div></div>
          <div className="stat card"><div className="label">Skipped</div><div className="value">{n(result.invalid)}</div></div>
        </div>
        {result.invalid > 0 && <p className="faint" style={{ marginTop: 12 }}>Skipped rows had no valid email, e.g. {result.invalid_samples.join(', ')}.</p>}
      </Modal>
    );
  }

  return (
    <Modal title="Import contacts from CSV" onClose={onClose} wide footer={<>
      <button className="btn ghost" onClick={onClose}>Cancel</button>
      <button className="btn primary" disabled={!parsed || !hasEmail || busy} onClick={submit}>{busy ? <span className="spin" /> : `Import ${n(rows.length)} contacts`}</button>
    </>}>
      {!parsed ? (
        <div className={`drop ${over ? 'over' : ''}`} role="button" tabIndex={0}
          onClick={() => input.current.click()} onKeyDown={(e) => e.key === 'Enter' && input.current.click()}
          onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); load(e.dataTransfer.files[0]); }}>
          <Icon name="upload" size={28} />
          <h3 style={{ marginTop: 10 }}>Drop a CSV file here, or click to choose one</h3>
          <p className="faint" style={{ marginTop: 4 }}>The first row must be column names. You need an email column; first name, last name and any other columns are optional.</p>
          <input ref={input} type="file" accept=".csv,text/csv" hidden onChange={(e) => load(e.target.files[0])} />
        </div>
      ) : (
        <div className="stack">
          <p className="muted"><b>{file?.name}</b>: {n(parsed.data.length)} rows. Match each column to a contact field.</p>
          <div className="table-wrap" style={{ margin: 0 }}><table>
            <thead><tr><th>Column in file</th><th>Example</th><th>Import as</th></tr></thead>
            <tbody>{Object.keys(map).map((col) => (
              <tr key={col}>
                <td style={{ fontWeight: 600 }}>{col}</td>
                <td className="faint" style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{parsed.data[0]?.[col]}</td>
                <td>
                  <select className="input" style={{ height: 34 }} value={map[col]} onChange={(e) => setMap({ ...map, [col]: e.target.value })}>
                    <option value="email">Email</option>
                    <option value="first_name">First name</option>
                    <option value="last_name">Last name</option>
                    <option value="field">Custom field ({`{{${col.trim().toLowerCase().replace(/\W+/g, '_')}}}`})</option>
                    <option value="skip">Don’t import</option>
                  </select>
                </td>
              </tr>
            ))}</tbody>
          </table></div>
          {!hasEmail && <div className="notice red"><Icon name="alert" />Choose which column holds the email address.</div>}
          <div className="grid g2">
            <label className="field"><span>Add to list</span>
              <select className="input" value={target.list} onChange={(e) => setTarget({ ...target, list: e.target.value })}>
                <option value="new">New list…</option>
                {lists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </label>
            {target.list === 'new' && <label className="field"><span>New list name</span><input className="input" value={target.newList} onChange={(e) => setTarget({ ...target, newList: e.target.value })} /></label>}
          </div>
          <p className="faint">Existing contacts are updated, not duplicated. Addresses on your do-not-email list are imported as unsubscribed.</p>
        </div>
      )}
    </Modal>
  );
}

function ContactModal({ contact, lists, onClose, onSaved }) {
  const [f, setF] = useState(() => ({
    email: contact?.email || '', first_name: contact?.first_name || '', last_name: contact?.last_name || '',
    status: contact?.status || 'subscribed', lists: contact?.lists || [],
    fields: Object.entries(contact?.fields || {}).map(([k, v]) => ({ k, v })),
  }));
  const [run, busy] = useAction();
  const toggleList = (id) => setF({ ...f, lists: f.lists.includes(id) ? f.lists.filter((x) => x !== id) : [...f.lists, id] });
  const save = () => run(async () => {
    const fields = Object.fromEntries(f.fields.filter((x) => x.k.trim()).map((x) => [x.k.trim().toLowerCase().replace(/\W+/g, '_'), x.v]));
    const body = { ...f, fields };
    if (contact) await patch(`/contacts/${contact.id}`, body); else await post('/contacts', body);
    onSaved();
  }, contact ? 'Contact saved' : 'Contact added');

  return (
    <Modal title={contact ? 'Edit contact' : 'Add a contact'} onClose={onClose} footer={<>
      <button className="btn ghost" onClick={onClose}>Cancel</button>
      <button className="btn primary" disabled={busy || !f.email} onClick={save}>{contact ? 'Save contact' : 'Add contact'}</button>
    </>}>
      <div className="stack">
        <label className="field"><span>Email</span><input className="input" type="email" disabled={!!contact} value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></label>
        <div className="grid g2">
          <label className="field"><span>First name</span><input className="input" value={f.first_name} onChange={(e) => setF({ ...f, first_name: e.target.value })} /></label>
          <label className="field"><span>Last name</span><input className="input" value={f.last_name} onChange={(e) => setF({ ...f, last_name: e.target.value })} /></label>
        </div>
        {contact && (
          <label className="field"><span>Status</span>
            <select className="input" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>
              <option value="subscribed">Subscribed</option><option value="unsubscribed">Unsubscribed</option><option value="bounced">Bounced</option>
            </select>
          </label>
        )}
        {lists.length > 0 && (
          <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
            <legend style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>Lists</legend>
            <div className="row">{lists.map((l) => (
              <label key={l.id} className="check" style={{ alignItems: 'center' }}><input type="checkbox" checked={f.lists.includes(l.id)} onChange={() => toggleList(l.id)} />{l.name}</label>
            ))}</div>
          </fieldset>
        )}
        <div>
          <div className="spread" style={{ marginBottom: 6 }}><b style={{ fontSize: 13 }}>Custom fields</b><button className="btn sm ghost" onClick={() => setF({ ...f, fields: [...f.fields, { k: '', v: '' }] })}><Icon name="plus" />Add field</button></div>
          {f.fields.map((x, i) => (
            <div className="row" key={i} style={{ marginBottom: 6, flexWrap: 'nowrap' }}>
              <input className="input mono" placeholder="company" value={x.k} onChange={(e) => setF({ ...f, fields: f.fields.map((y, j) => (j === i ? { ...y, k: e.target.value } : y)) })} />
              <input className="input" placeholder="Value" value={x.v} onChange={(e) => setF({ ...f, fields: f.fields.map((y, j) => (j === i ? { ...y, v: e.target.value } : y)) })} />
              <button className="btn sm ghost" aria-label="Remove field" onClick={() => setF({ ...f, fields: f.fields.filter((_, j) => j !== i) })}><Icon name="x" /></button>
            </div>
          ))}
          {!f.fields.length && <p className="faint">Use custom fields in emails as {'{{field_name}}'}.</p>}
        </div>
      </div>
    </Modal>
  );
}

function ListsTab({ lists, reload }) {
  const [name, setName] = useState('');
  const [run, busy] = useAction();
  const create = (e) => { e.preventDefault(); run(() => post('/lists', { name }), 'List created').then(() => { setName(''); reload(); }); };
  const rename = (l) => { const v = prompt('Rename list', l.name); if (v && v !== l.name) run(() => patch(`/lists/${l.id}`, { name: v }), 'List renamed').then(reload); };
  const remove = (l) => {
    if (!confirm(`Delete the list “${l.name}”? Contacts stay in your account.`)) return;
    run(() => del(`/lists/${l.id}`), 'List deleted').then(reload);
  };
  return (
    <div className="stack">
      <form className="row" onSubmit={create}>
        <input className="input" style={{ maxWidth: 320 }} placeholder="New list name" value={name} onChange={(e) => setName(e.target.value)} required />
        <button className="btn primary" disabled={busy}>Create list</button>
      </form>
      {lists.length ? (
        <div className="grid g3">{lists.map((l) => (
          <div className="card list-card" key={l.id}>
            <div className="spread"><span className="prov custom" style={{ width: 38, height: 38 }}><Icon name="users" /></span><span className="badge go">{n(l.subscribed_count)} subscribed</span></div>
            <div><h3 style={{ fontSize: 16 }}>{l.name}</h3><span className="faint">{n(l.contact_count)} contacts</span></div>
            <div className="progress green"><i style={{ width: `${l.contact_count ? (100 * l.subscribed_count) / l.contact_count : 0}%` }} /></div>
            <div className="row">
              <button className="btn sm" onClick={() => rename(l)}>Rename</button>
              <button className="btn sm danger" onClick={() => remove(l)}>Delete</button>
            </div>
          </div>
        ))}</div>
      ) : <p className="muted">Lists group contacts so you can choose who a campaign goes to.</p>}
    </div>
  );
}

export default function Contacts() {
  const [tab, setTab] = useState('contacts');
  const [params] = useSearchParams();
  const [q, setQ] = useState({ q: params.get('q') || '', list: '', status: '', page: 1 });
  useEffect(() => { if (params.get('q') !== null) { setQ((x) => ({ ...x, q: params.get('q'), page: 1 })); setTab('contacts'); } }, [params]);
  const qs = new URLSearchParams(Object.entries(q).filter(([, v]) => v)).toString();
  const { data, error, reload } = useLoad(`/contacts?${qs}`);
  const listsQ = useLoad('/lists');
  const lists = listsQ.data?.lists || [];
  const [selected, setSelected] = useState([]);
  const [modal, setModal] = useState(null);
  const [bulkList, setBulkList] = useState('');
  const [run] = useAction();
  const refresh = () => { reload(); listsQ.reload(); setSelected([]); };

  const bulk = (action) => {
    if (action === 'delete' && !confirm(`Delete ${selected.length} contact(s)? This can’t be undone.`)) return;
    run(() => post('/contacts/bulk', { ids: selected, action, list_id: Number(bulkList) }), action === 'delete' ? 'Contacts deleted' : 'Lists updated').then(refresh);
  };

  const rows = data?.contacts || [];
  const allOn = rows.length > 0 && rows.every((r) => selected.includes(r.id));
  const listName = (id) => lists.find((l) => l.id === id)?.name;

  return (
    <div className="page">
      <div className="page-head">
        <div><div className="eyebrow">Audience</div><h1>Contacts</h1><p>Everyone you can email, grouped into lists.</p></div>
        <div className="row">
          <button className="btn" onClick={() => setModal({ type: 'import' })}><Icon name="upload" />Import CSV</button>
          <button className="btn primary" onClick={() => setModal({ type: 'contact' })}><Icon name="plus" />Add contact</button>
        </div>
      </div>

      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'contacts'} onClick={() => setTab('contacts')}>All contacts<span className="count">{data ? n(data.total) : ''}</span></button>
        <button role="tab" aria-selected={tab === 'lists'} onClick={() => setTab('lists')}>Lists<span className="count">{n(lists.length)}</span></button>
      </div>

      {tab === 'lists' ? <ListsTab lists={lists} reload={listsQ.reload} /> : (
        <section className="card">
          <div className="row" style={{ marginBottom: 14 }}>
            <input className="input" style={{ maxWidth: 300 }} type="search" placeholder="Search by email or name" value={q.q} onChange={(e) => setQ({ ...q, q: e.target.value, page: 1 })} aria-label="Search contacts" />
            <select className="input" style={{ maxWidth: 200 }} value={q.list} onChange={(e) => setQ({ ...q, list: e.target.value, page: 1 })} aria-label="Filter by list">
              <option value="">All lists</option>{lists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
            <select className="input" style={{ maxWidth: 180 }} value={q.status} onChange={(e) => setQ({ ...q, status: e.target.value, page: 1 })} aria-label="Filter by status">
              <option value="">Any status</option><option value="subscribed">Subscribed</option><option value="unsubscribed">Unsubscribed</option><option value="bounced">Bounced</option>
            </select>
          </div>

          {selected.length > 0 && (
            <div className="notice blue" style={{ marginBottom: 14, alignItems: 'center', flexWrap: 'wrap' }}>
              <b>{selected.length} selected</b>
              <select className="input" style={{ maxWidth: 200, height: 32 }} value={bulkList} onChange={(e) => setBulkList(e.target.value)} aria-label="List for bulk action">
                <option value="">Choose a list…</option>{lists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
              <button className="btn sm" disabled={!bulkList} onClick={() => bulk('add_to_list')}>Add to list</button>
              <button className="btn sm" disabled={!bulkList} onClick={() => bulk('remove_from_list')}>Remove from list</button>
              <button className="btn sm danger" onClick={() => bulk('delete')}>Delete</button>
            </div>
          )}

          <ErrorNote error={error} retry={reload} />
          {!data ? <Loading /> : rows.length === 0 ? (
            <Empty icon={q.q || q.list || q.status ? 'search' : 'users'} title={q.q || q.list || q.status ? 'No contacts match these filters' : 'No contacts yet'}
              action={!(q.q || q.list || q.status) ? <button className="btn primary" onClick={() => setModal({ type: 'import' })}><Icon name="upload" />Import CSV</button> : <button className="btn" onClick={() => setQ({ q: '', list: '', status: '', page: 1 })}>Clear filters</button>}>
              {q.q || q.list || q.status ? 'Clear the search or filters to see everyone.' : 'Import a CSV or add contacts one at a time.'}
            </Empty>
          ) : (
            <>
              <div className="table-wrap"><table>
                <thead><tr>
                  <th style={{ width: 40 }}><input type="checkbox" aria-label="Select all on this page" checked={allOn} onChange={() => setSelected(allOn ? [] : rows.map((r) => r.id))} /></th>
                  <th>Contact</th><th>Lists</th><th>Status</th><th>Added</th><th />
                </tr></thead>
                <tbody>{rows.map((c) => (
                  <tr key={c.id}>
                    <td><input type="checkbox" aria-label={`Select ${c.email}`} checked={selected.includes(c.id)} onChange={() => setSelected(selected.includes(c.id) ? selected.filter((x) => x !== c.id) : [...selected, c.id])} /></td>
                    <td>
                      <div className="cell-user">
                        <Avatar name={[c.first_name, c.last_name].filter(Boolean).join(' ')} email={c.email} size="sm" />
                        <div style={{ minWidth: 0 }}><b>{[c.first_name, c.last_name].filter(Boolean).join(' ') || c.email.split('@')[0]}</b><small>{c.email}</small></div>
                      </div>
                    </td>
                    <td><div className="row" style={{ gap: 6 }}>{c.lists.map(listName).filter(Boolean).map((l) => <span key={l} className="badge plain">{l}</span>)}{!c.lists.length && <span className="faint">—</span>}</div></td>
                    <td><Status value={c.status} /></td>
                    <td className="faint">{new Date(c.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                    <td style={{ textAlign: 'right' }}><button className="btn sm" onClick={() => setModal({ type: 'contact', contact: c })}>Edit</button></td>
                  </tr>
                ))}</tbody>
              </table></div>
              <Pager page={data.page} size={data.size} total={data.total} onPage={(p) => setQ({ ...q, page: p })} />
            </>
          )}
        </section>
      )}

      {modal?.type === 'import' && <ImportModal lists={lists} onClose={() => setModal(null)} onDone={refresh} />}
      {modal?.type === 'contact' && <ContactModal contact={modal.contact} lists={lists} onClose={() => setModal(null)} onSaved={() => { setModal(null); refresh(); }} />}
    </div>
  );
}
