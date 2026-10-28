import { useEffect, useRef, useState } from 'react';
import { post } from '../api.js';

const VARS = ['first_name', 'last_name', 'full_name', 'email', 'unsubscribe_url'];

/** HTML source on the left, rendered preview (with a sample contact) on the right. */
export default function HtmlEditor({ html, subject = '', preheader = '', onChange }) {
  const ta = useRef();
  const [preview, setPreview] = useState({ html: '', subject: '' });
  const [view, setView] = useState('desktop');

  useEffect(() => {
    const t = setTimeout(() => {
      post('/campaigns/preview', { html, subject, preheader }).then(setPreview).catch(() => {});
    }, 300);
    return () => clearTimeout(t);
  }, [html, subject, preheader]);

  const insert = (v) => {
    const el = ta.current;
    const token = v === 'first_name' ? '{{first_name|there}}' : `{{${v}}}`;
    const start = el.selectionStart ?? html.length;
    const end = el.selectionEnd ?? html.length;
    onChange(html.slice(0, start) + token + html.slice(end));
    requestAnimationFrame(() => { el.focus(); el.selectionStart = el.selectionEnd = start + token.length; });
  };

  return (
    <div className="stack">
      <div className="spread">
        <div className="chips" aria-label="Insert a personalisation tag">
          <span className="faint" style={{ alignSelf: 'center' }}>Insert:</span>
          {VARS.map((v) => <button type="button" key={v} className="chip" onClick={() => insert(v)}>{`{{${v}}}`}</button>)}
        </div>
        <div className="row">
          <div className="tabs" style={{ margin: 0 }} role="tablist" aria-label="Preview size">
            <button type="button" role="tab" aria-selected={view === 'desktop'} onClick={() => setView('desktop')}>Desktop</button>
            <button type="button" role="tab" aria-selected={view === 'mobile'} onClick={() => setView('mobile')}>Mobile</button>
          </div>
        </div>
      </div>
      <div className="editor">
        <label className="field" style={{ height: '100%' }}>
          <span className="sr-only" style={{ position: 'absolute', left: -9999 }}>Email HTML</span>
          <textarea ref={ta} className="input code" spellCheck={false} value={html} onChange={(e) => onChange(e.target.value)} placeholder="<p>Hi {{first_name|there}},</p>" />
        </label>
        <div className="preview-shell">
          <div className="preview-bar">
            <i /><i /><i />
            <span className="subj">{preview.subject ? <><b style={{ color: 'var(--ink)' }}>{preview.subject}</b> · previewed for Jane Doe</> : 'Preview'}</span>
          </div>
          <div style={{ flex: 1, display: 'flex', justifyContent: 'center', padding: view === 'mobile' ? 16 : 0 }}>
            <iframe title="Email preview" className="preview-frame" sandbox="" srcDoc={preview.html} style={{ maxWidth: view === 'mobile' ? 380 : '100%', borderRadius: view === 'mobile' ? 20 : 0, boxShadow: view === 'mobile' ? 'var(--sh-3)' : 'none' }} />
          </div>
        </div>
      </div>
      <p className="faint">
        Use <code>{'{{first_name|there}}'}</code> to fall back to “there” when a name is missing. If you don’t include <code>{'{{unsubscribe_url}}'}</code>, an unsubscribe footer is added for you.
      </p>
    </div>
  );
}
