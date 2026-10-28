import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { get, post, patch } from '../api.js';
import { useAuth, useLoad, useAction, useToast, Loading, ErrorNote, Modal, Icon, n, when } from '../lib.jsx';
import HtmlEditor from '../components/HtmlEditor.jsx';
import Relay from '../components/Relay.jsx';

const STEPS = ['Details', 'Recipients', 'Content', 'Senders', 'Review'];

const BLANK = {
  name: '', subject: '', preheader: '', from_name: '', reply_to: '', html: '',
  rotation: 'sequential', track_opens: true, track_clicks: true, list_ids: [], account_ids: [],
};

export default function CampaignEditor() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const nav = useNavigate();
  const { user } = useAuth();
  const toast = useToast();
  const [c, setC] = useState(null);
  const [loadErr, setLoadErr] = useState(null);
  const [step, setStep] = useState(0);
  const [audience, setAudience] = useState(null);
  const [testOpen, setTestOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [run, busy] = useAction();
  const lists = useLoad('/lists').data?.lists;
  const accData = useLoad('/accounts').data;
  const templates = useLoad('/templates').data?.templates;

  useEffect(() => {
    (async () => {
      try {
        if (id) {
          const { campaign } = await get(`/campaigns/${id}`);
          if (!['draft', 'scheduled', 'paused'].includes(campaign.status)) { nav(`/campaigns/${id}`, { replace: true }); return; }
          setC({ ...campaign, list_ids: campaign.lists.map((l) => l.id), account_ids: campaign.accounts.map((a) => a.id) });
          setAudience(campaign.audience);
        } else {
          const base = { ...BLANK, from_name: user.name || '', name: `Campaign ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` };
          const tid = params.get('template');
          if (tid) {
            const { template } = await get(`/templates/${tid}`);
            Object.assign(base, { html: template.html, subject: template.subject, name: template.name });
          }
          setC(base);
        }
      } catch (e) { setLoadErr(e); }
    })();
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Default to every active mailbox for a new campaign.
  useEffect(() => {
    if (c && !id && accData && c.account_ids.length === 0 && !c._touchedAccounts) {
      setC((x) => ({ ...x, account_ids: accData.accounts.filter((a) => a.status === 'active').map((a) => a.id) }));
    }
  }, [accData, c, id]);

  const chosen = useMemo(() => {
    if (!accData || !c) return [];
    return c.account_ids.map((aid) => accData.accounts.find((a) => a.id === aid)).filter(Boolean);
  }, [accData, c]);

  if (loadErr) return <ErrorNote error={loadErr} />;
  if (!c || !lists || !accData) return <Loading />;

  const set = (k, v) => setC((x) => ({ ...x, [k]: v }));
  const editingLocked = c.status === 'paused';

  const body = () => ({
    name: c.name, subject: c.subject, preheader: c.preheader, from_name: c.from_name, reply_to: c.reply_to, html: c.html,
    rotation: c.rotation, track_opens: c.track_opens, track_clicks: c.track_clicks, list_ids: c.list_ids, account_ids: c.account_ids,
  });

  const save = async ({ quiet } = {}) => {
    const d = c.id ? await patch(`/campaigns/${c.id}`, body()) : await post('/campaigns', body());
    const saved = d.campaign;
    setC((x) => ({ ...x, id: saved.id, status: saved.status }));
    if (!c.id) window.history.replaceState(null, '', `/campaigns/${saved.id}/edit`);
    if (!quiet) toast('Draft saved');
    const fresh = await get(`/campaigns/${saved.id}`);
    setAudience(fresh.campaign.audience);
    return saved;
  };

  const go = (i) => run(async () => { await save({ quiet: true }); setStep(i); });

  const sumLimits = chosen.filter((a) => a.status === 'active').reduce((s, a) => s + a.daily_limit, 0);
  const leftToday = chosen.filter((a) => a.status === 'active').reduce((s, a) => s + a.remaining_today, 0);
  const aud = audience ?? 0;
  const days = sumLimits ? (aud <= leftToday ? 1 : 1 + Math.ceil((aud - leftToday) / sumLimits)) : null;

  const problems = [
    !c.subject.trim() && ['Add a subject line.', 0],
    !c.list_ids.length && ['Choose at least one list.', 1],
    !aud && c.list_ids.length && ['The chosen lists have no subscribed contacts.', 1],
    !c.html.trim() && ['Add email content.', 2],
    !c.account_ids.length && ['Choose at least one sender mailbox.', 3],
    c.account_ids.length && !chosen.some((a) => a.status === 'active') && ['All chosen mailboxes are paused or failing.', 3],
  ].filter(Boolean);

  const sendNow = () => run(async () => {
    await save({ quiet: true });
    if (editingLocked) await post(`/campaigns/${c.id}/resume`);
    else await post(`/campaigns/${c.id}/send`, {});
    nav(`/campaigns/${c.id}`);
  }, editingLocked ? 'Campaign resumed' : 'Campaign started');

  const move = (i, dir) => {
    const ids = [...c.account_ids];
    const j = i + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    set('account_ids', ids);
  };
  const toggleAccount = (aid) => setC((x) => ({ ...x, _touchedAccounts: true, account_ids: x.account_ids.includes(aid) ? x.account_ids.filter((v) => v !== aid) : [...x.account_ids, aid] }));
  const toggleList = (lid) => set('list_ids', c.list_ids.includes(lid) ? c.list_ids.filter((v) => v !== lid) : [...c.list_ids, lid]);

  return (
    <div className="page" style={{ maxWidth: step === 2 ? 1400 : 1000 }}>
      <div className="page-head">
        <div>
          <Link className="crumb" to="/campaigns">← Campaigns</Link>
          <h1>{c.id ? (editingLocked ? 'Edit paused campaign' : 'Edit campaign') : 'New campaign'}</h1>
        </div>
        <div className="row">
          <button className="btn" disabled={busy} onClick={() => run(() => save())}>Save draft</button>
          {step < 4 && <button className="btn primary" disabled={busy} onClick={() => go(step + 1)}>Next: {STEPS[step + 1]}<Icon name="arrow" /></button>}
        </div>
      </div>

      <nav className="steps" aria-label="Campaign steps">
        {STEPS.map((s, i) => (
          <button key={s} aria-current={step === i ? 'step' : undefined} className={i < step ? 'ok' : ''} onClick={() => go(i)}>
            <b>{i < step ? '✓' : i + 1}</b>{s}
          </button>
        ))}
      </nav>

      {editingLocked && <div className="notice amber" style={{ marginBottom: 16 }}><Icon name="alert" />This campaign is paused. Changes apply to emails not sent yet. The recipient list is fixed.</div>}

      {step === 0 && (
        <section className="card stack">
          <label className="field"><span>Campaign name</span><input className="input" value={c.name} onChange={(e) => set('name', e.target.value)} /><small>Only you see this.</small></label>
          <label className="field"><span>Subject line</span><input className="input" value={c.subject} onChange={(e) => set('subject', e.target.value)} placeholder="Hi {{first_name|there}}, …" /></label>
          <label className="field"><span>Preview text</span><input className="input" value={c.preheader} onChange={(e) => set('preheader', e.target.value)} placeholder="Shown after the subject in most inboxes" /></label>
          <div className="grid g2">
            <label className="field"><span>Sender name</span><input className="input" value={c.from_name} onChange={(e) => set('from_name', e.target.value)} /><small>The address is whichever mailbox sends each email.</small></label>
            <label className="field"><span>Reply-to address</span><input className="input" type="email" value={c.reply_to} onChange={(e) => set('reply_to', e.target.value)} placeholder="Optional: one inbox for all replies" /><small>Useful when several mailboxes send, so replies land in one place.</small></label>
          </div>
          <div className="row" style={{ gap: 24 }}>
            <label className="check"><input type="checkbox" checked={c.track_opens} onChange={(e) => set('track_opens', e.target.checked)} />Track opens</label>
            <label className="check"><input type="checkbox" checked={c.track_clicks} onChange={(e) => set('track_clicks', e.target.checked)} />Track link clicks</label>
          </div>
        </section>
      )}

      {step === 1 && (
        <section className="card stack">
          <div className="spread"><h2>Who should get this?</h2>{audience !== null && <span className="badge blue plain mono">{n(audience)} recipients</span>}</div>
          {editingLocked ? <p className="muted">Recipients: {c.lists?.map((l) => l.name).join(', ')}.</p> : lists.length ? (
            <div className="grid g2">
              {lists.map((l) => (
                <label key={l.id} className={`pick ${c.list_ids.includes(l.id) ? 'on' : ''}`}>
                  <input type="checkbox" checked={c.list_ids.includes(l.id)} onChange={() => toggleList(l.id)} />
                  <div style={{ flex: 1 }}><b>{l.name}</b><div className="faint">{n(l.subscribed_count)} subscribed</div></div>
                </label>
              ))}
            </div>
          ) : <div className="notice amber"><Icon name="alert" /><span>You don’t have any lists yet. <Link to="/contacts">Import contacts</Link> first.</span></div>}
          <p className="faint">Contacts in several chosen lists get one email. Unsubscribed, bounced and do-not-email addresses are left out automatically. The count updates when you move to the next step.</p>
        </section>
      )}

      {step === 2 && (
        <section className="card stack">
          <div className="spread">
            <h2>Content</h2>
            {templates?.length > 0 && (
              <select className="input" style={{ maxWidth: 260 }} value="" onChange={async (e) => {
                if (!e.target.value) return;
                if (c.html && !confirm('Replace the current content with this template?')) return;
                const { template } = await get(`/templates/${e.target.value}`);
                setC((x) => ({ ...x, html: template.html, subject: x.subject || template.subject }));
              }} aria-label="Load a template">
                <option value="">Load a template…</option>
                {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            )}
          </div>
          <HtmlEditor html={c.html} subject={c.subject} preheader={c.preheader} onChange={(v) => set('html', v)} />
        </section>
      )}

      {step === 3 && (
        <section className="card stack">
          <h2>Which mailboxes send it?</h2>
          {accData.accounts.length === 0 ? (
            <div className="notice amber"><Icon name="alert" /><span>No mailboxes yet. <Link to="/senders">Add a mailbox</Link> first.</span></div>
          ) : (<>
            <fieldset style={{ border: 0, padding: 0, margin: 0 }} className="grid g2">
              <legend className="sr-only" style={{ position: 'absolute', left: -9999 }}>Rotation</legend>
              {[
                ['sequential', 'Fill one, then move on', 'Send from mailbox #1 until it reaches its daily limit, then switch to #2, and so on.'],
                ['round_robin', 'Take turns', 'Spread emails across every mailbox at once. Faster, and each mailbox sends fewer emails per hour.'],
              ].map(([k, title, desc]) => (
                <label key={k} className={`pick ${c.rotation === k ? 'on' : ''}`} style={{ alignItems: 'flex-start' }}>
                  <input type="radio" name="rotation" checked={c.rotation === k} onChange={() => set('rotation', k)} style={{ marginTop: 3 }} />
                  <div><b>{title}</b><div className="faint">{desc}</div></div>
                </label>
              ))}
            </fieldset>

            <div>
              <h3 style={{ marginBottom: 8 }}>Mailboxes, in sending order</h3>
              <div className="stack" style={{ '--gap': '8px' }}>
                {[...chosen, ...accData.accounts.filter((a) => !c.account_ids.includes(a.id))].map((a) => {
                  const on = c.account_ids.includes(a.id);
                  const i = c.account_ids.indexOf(a.id);
                  return (
                    <div key={a.id} className={`pick ${on ? 'on' : ''}`} style={{ cursor: 'default' }}>
                      <input type="checkbox" checked={on} onChange={() => toggleAccount(a.id)} aria-label={`Use ${a.email}`} />
                      <span className="mono faint" style={{ width: 24 }}>{on ? `#${i + 1}` : ''}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <b>{a.email}</b>
                        <div className="faint">limit {n(a.daily_limit)}/day · {n(a.remaining_today)} left today{a.status !== 'active' ? ` · ${a.status}` : ''}</div>
                      </div>
                      {on && c.rotation === 'sequential' && (
                        <div className="row" style={{ flexWrap: 'nowrap' }}>
                          <button className="btn sm ghost" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up">↑</button>
                          <button className="btn sm ghost" disabled={i === c.account_ids.length - 1} onClick={() => move(i, 1)} aria-label="Move down">↓</button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
            {chosen.length > 0 && <Relay accounts={chosen} rotation={c.rotation} live />}
          </>)}
        </section>
      )}

      {step === 4 && (
        <div className="stack">
          <section className="card">
            <div className="card-head"><h2>Delivery plan</h2></div>
            <p className="capacity-line" style={{ fontSize: 22 }}>
              <span className="n">{n(aud)}</span> <span className="of">emails ·</span> <span className="n">{n(sumLimits)}</span><span className="of">/day across</span> <span className="n">{chosen.length}</span> <span className="of">mailbox{chosen.length === 1 ? '' : 'es'}</span>
            </p>
            <p className="muted" style={{ marginTop: 8 }}>
              {!sumLimits ? 'Choose an active mailbox to see the plan.'
                : days === 1 ? `Everything can go out today: ${n(leftToday)} sends are left in today’s limits.`
                : `About ${days} days. ${n(Math.min(aud, leftToday))} go out today, then up to ${n(sumLimits)} a day after the limits reset at midnight (${user.timezone}). Sending continues automatically.`}
            </p>
            <p className="faint" style={{ marginTop: 6 }}>Each mailbox waits {user.delay_min}–{user.delay_max} seconds between emails. Change this in Settings.</p>
          </section>

          <section className="card">
            <dl className="kv">
              <dt>Subject</dt><dd>{c.subject || <span style={{ color: 'var(--stamp)' }}>Missing</span>}</dd>
              <dt>Sender name</dt><dd>{c.from_name || '—'}</dd>
              <dt>Reply-to</dt><dd>{c.reply_to || 'Each sending mailbox'}</dd>
              <dt>Lists</dt><dd>{lists.filter((l) => c.list_ids.includes(l.id)).map((l) => l.name).join(', ') || '—'}</dd>
              <dt>Mailboxes</dt><dd>{chosen.map((a) => a.email).join(' → ') || '—'}</dd>
              <dt>Rotation</dt><dd>{c.rotation === 'sequential' ? 'Fill one, then move on' : 'Take turns'}</dd>
              <dt>Tracking</dt><dd>{[c.track_opens && 'opens', c.track_clicks && 'clicks'].filter(Boolean).join(' and ') || 'off'}</dd>
              {c.status === 'scheduled' && (<><dt>Scheduled</dt><dd>{when(c.scheduled_at, user.timezone)}</dd></>)}
            </dl>
          </section>

          {problems.length > 0 && (
            <div className="notice red" role="alert"><Icon name="alert" /><div>
              <b>Fix these before sending:</b>
              <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>{problems.map(([msg, s]) => <li key={msg}>{msg} <button className="btn sm ghost" onClick={() => setStep(s)}>Go to {STEPS[s]}</button></li>)}</ul>
            </div></div>
          )}

          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <button className="btn" onClick={() => setTestOpen(true)} disabled={!c.id || !chosen.length}>Send a test</button>
            {!editingLocked && <button className="btn" disabled={busy || problems.length > 0} onClick={() => setScheduleOpen(true)}><Icon name="clock" />Schedule</button>}
            <button className="btn blue" disabled={busy || problems.length > 0} onClick={sendNow}><Icon name="send" />{editingLocked ? 'Resume sending' : 'Send now'}</button>
          </div>
        </div>
      )}

      {testOpen && <TestModal id={c.id} onClose={() => setTestOpen(false)} save={() => save({ quiet: true })} />}
      {scheduleOpen && <ScheduleModal c={c} save={() => save({ quiet: true })} onClose={() => setScheduleOpen(false)} onDone={() => nav('/campaigns')} />}
    </div>
  );
}

function TestModal({ id, onClose, save }) {
  const [to, setTo] = useState('');
  const [run, busy] = useAction();
  return (
    <Modal title="Send a test email" onClose={onClose} footer={<>
      <button className="btn ghost" onClick={onClose}>Cancel</button>
      <button className="btn primary" disabled={busy} onClick={() => run(async () => { await save(); const r = await post(`/campaigns/${id}/test`, { to }); onClose(); return r; }, 'Test sent')}>Send test</button>
    </>}>
      <label className="field"><span>Send to</span><input className="input" type="email" value={to} onChange={(e) => setTo(e.target.value)} placeholder="Leave blank to send to yourself" />
        <small>Sent from the first mailbox with capacity. Tests don’t count towards the daily limit or the report.</small></label>
    </Modal>
  );
}

function ScheduleModal({ c, save, onClose, onDone }) {
  const local = new Date(Date.now() + 3600e3 - new Date().getTimezoneOffset() * 60e3).toISOString().slice(0, 16);
  const [at, setAt] = useState(local);
  const [run, busy] = useAction();
  return (
    <Modal title="Schedule campaign" onClose={onClose} footer={<>
      <button className="btn ghost" onClick={onClose}>Cancel</button>
      <button className="btn primary" disabled={busy || !at} onClick={() => run(async () => { await save(); await post(`/campaigns/${c.id}/send`, { scheduled_at: new Date(at).toISOString() }); onDone(); }, 'Campaign scheduled')}>Schedule</button>
    </>}>
      <label className="field"><span>Start sending at</span><input className="input" type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} /><small>Your browser’s local time.</small></label>
    </Modal>
  );
}
