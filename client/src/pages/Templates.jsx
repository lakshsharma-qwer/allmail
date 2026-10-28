import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { get, post, patch, del } from '../api.js';
import { useLoad, useAction, Loading, ErrorNote, Modal, Icon, Empty, ago } from '../lib.jsx';
import HtmlEditor from '../components/HtmlEditor.jsx';

export default function Templates() {
  const { data, error, reload } = useLoad('/templates');
  const [choosing, setChoosing] = useState(false);
  const [run] = useAction();
  const nav = useNavigate();
  if (error && !data) return <ErrorNote error={error} retry={reload} />;
  if (!data) return <Loading />;

  const create = (starter) => run(async () => {
    const d = await post('/templates', { name: starter ? starter.name : 'Untitled template', subject: starter?.subject || '', html: starter?.html || '' });
    nav(`/templates/${d.template.id}`);
  });
  const duplicate = (t) => run(() => post(`/templates/${t.id}/duplicate`), 'Template duplicated').then(reload);
  const remove = (t) => confirm(`Delete “${t.name}”?`) && run(() => del(`/templates/${t.id}`), 'Template deleted').then(reload);

  return (
    <div className="page">
      <div className="page-head">
        <div><div className="eyebrow">Marketing</div><h1>Templates</h1><p>Reusable email designs. Start a campaign from any of them.</p></div>
        <button className="btn primary" onClick={() => setChoosing(true)}><Icon name="plus" />New template</button>
      </div>

      {data.templates.length ? (
        <div className="grid g3">
          {data.templates.map((t) => (
            <div key={t.id} className="card mbox" style={{ padding: 0, overflow: 'hidden', gap: 0 }}>
              <Link to={`/templates/${t.id}`} aria-label={`Edit ${t.name}`} style={{ display: 'block', height: 210, overflow: 'hidden', background: 'var(--paper)', borderBottom: '1px solid var(--line)', position: 'relative' }}>
                <iframe title={t.name} srcDoc={t.html} sandbox="" tabIndex={-1} style={{ width: '200%', height: 420, border: 0, transform: 'scale(.5)', transformOrigin: '0 0', pointerEvents: 'none', background: '#fff' }} />
              </Link>
              <div style={{ padding: '16px 18px' }}>
                <Link to={`/templates/${t.id}`} style={{ fontWeight: 600, color: 'var(--ink)' }}>{t.name}</Link>
                <div className="faint" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.subject || 'No default subject'} · edited {ago(t.updated_at)}</div>
                <div className="row" style={{ marginTop: 14, gap: 6 }}>
                  <Link className="btn sm primary" to={`/campaigns/new?template=${t.id}`}><Icon name="send" />Use</Link>
                  <Link className="btn sm" to={`/templates/${t.id}`}><Icon name="edit" />Edit</Link>
                  <button className="btn sm ghost icon" onClick={() => duplicate(t)} aria-label="Duplicate" title="Duplicate"><Icon name="copy" /></button>
                  <button className="btn sm ghost icon danger" onClick={() => remove(t)} aria-label="Delete" title="Delete"><Icon name="trash" /></button>
                </div>
              </div>
            </div>
          ))}
          <button className="add-tile" onClick={() => setChoosing(true)}><div><div className="plus"><Icon name="plus" /></div><b>New template</b><div className="faint" style={{ marginTop: 4 }}>Start from a design or blank HTML</div></div></button>
        </div>
      ) : (
        <div className="card">
          <Empty icon="layout" title="No templates yet" action={<button className="btn primary" onClick={() => setChoosing(true)}>Choose a starting point</button>}>
            Start from a plain letter, a newsletter or an announcement, or write your own HTML.
          </Empty>
        </div>
      )}

      {choosing && (
        <Modal title="Start a template" onClose={() => setChoosing(false)} wide>
          <div className="grid g2">
            {data.starters.map((s) => (
              <button key={s.key} className="pick" style={{ flexDirection: 'column', alignItems: 'stretch', textAlign: 'left', font: 'inherit' }} onClick={() => create(s)}>
                <iframe title={s.name} srcDoc={s.html} sandbox="" style={{ width: '100%', height: 180, border: 0, pointerEvents: 'none', borderRadius: 8, background: '#fff' }} tabIndex={-1} />
                <b>{s.name}</b><span className="faint">{s.description}</span>
              </button>
            ))}
            <button className="pick" style={{ flexDirection: 'column', justifyContent: 'center', minHeight: 200, font: 'inherit' }} onClick={() => create(null)}>
              <Icon name="plus" size={24} /><b>Blank HTML</b><span className="faint">Paste your own code.</span>
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

export function TemplateEditor() {
  const { id } = useParams();
  const [t, setT] = useState(null);
  const [error, setError] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [run, busy] = useAction();

  useEffect(() => { get(`/templates/${id}`).then((d) => setT(d.template)).catch(setError); }, [id]);
  if (error) return <ErrorNote error={error} />;
  if (!t) return <Loading />;

  const set = (k, v) => { setT({ ...t, [k]: v }); setDirty(true); };
  const save = () => run(() => patch(`/templates/${id}`, t), 'Template saved').then((d) => d && setDirty(false));

  return (
    <div className="page" style={{ maxWidth: 1400 }}>
      <div className="page-head">
        <div style={{ flex: 1, minWidth: 260 }}>
          <Link className="crumb" to="/templates">← Templates</Link>
          <input className="input" style={{ font: '800 24px var(--f-display)', height: 48, border: 0, padding: 0, background: 'transparent' }} value={t.name} onChange={(e) => set('name', e.target.value)} aria-label="Template name" />
        </div>
        <div className="row">
          {dirty && <span className="faint">Unsaved changes</span>}
          <Link className="btn" to={`/campaigns/new?template=${id}`}>Use in campaign</Link>
          <button className="btn primary" disabled={busy || !dirty} onClick={save}>Save template</button>
        </div>
      </div>
      <section className="card stack">
        <label className="field"><span>Default subject line</span><input className="input" value={t.subject} onChange={(e) => set('subject', e.target.value)} placeholder="Hi {{first_name|there}}, …" /></label>
        <HtmlEditor html={t.html} subject={t.subject} onChange={(v) => set('html', v)} />
      </section>
    </div>
  );
}
