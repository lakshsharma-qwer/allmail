// Personalisation, tracking injection and unsubscribe footer.
import { APP_URL } from '../config.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function contactVars(contact, recipient) {
  let fields = {};
  try { fields = JSON.parse(contact?.fields || '{}'); } catch { /* ignore */ }
  return {
    ...fields,
    email: recipient?.email || contact?.email || '',
    first_name: contact?.first_name || '',
    last_name: contact?.last_name || '',
    full_name: [contact?.first_name, contact?.last_name].filter(Boolean).join(' '),
    unsubscribe_url: recipient ? `${APP_URL}/u/${recipient.token}` : `${APP_URL}/u/preview`,
  };
}

// {{ name }} or {{ name | fallback }}. In HTML context values are escaped.
export function fill(text, vars, { html = false } = {}) {
  return String(text || '').replace(/\{\{\s*([\w.]+)\s*(?:\|\s*([^}]*?)\s*)?\}\}/g, (_, key, fallback) => {
    const v = vars[key];
    const out = v === undefined || v === null || v === '' ? (fallback ?? '') : String(v);
    return html && key !== 'unsubscribe_url' ? esc(out) : out;
  });
}

function rewriteLinks(html, token) {
  return html.replace(/(<a\b[^>]*?\bhref\s*=\s*)(["'])(.*?)\2/gi, (m, pre, q, url) => {
    if (!/^https?:\/\//i.test(url) || url.includes('/u/') && url.startsWith(APP_URL)) return m;
    const tracked = `${APP_URL}/t/c/${token}?u=${encodeURIComponent(url.replace(/&amp;/g, '&'))}`;
    return `${pre}${q}${tracked}${q}`;
  });
}

function footer(user, unsubscribeUrl) {
  const addr = [user.company, user.address].filter(Boolean).map(esc).join(' · ');
  return `<div style="margin:32px auto 0;max-width:600px;padding:16px;border-top:1px solid #e5e7eb;font:12px/1.5 Arial,sans-serif;color:#6b7280;text-align:center">
${addr ? `${addr}<br>` : ''}You received this email because you subscribed to updates from ${esc(user.company || user.name || 'us')}.
<a href="${unsubscribeUrl}" style="color:#6b7280">Unsubscribe</a></div>`;
}

function withPreheader(html, preheader) {
  if (!preheader) return html;
  const block = `<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(preheader)}&#847;&zwnj;&nbsp;</div>`;
  return /<body[^>]*>/i.test(html) ? html.replace(/<body[^>]*>/i, (b) => b + block) : block + html;
}

export function htmlToText(html) {
  return String(html || '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_, href, label) => `${label.replace(/<[^>]+>/g, '')} (${href})`)
    .replace(/<(br|\/p|\/div|\/h\d|\/li|\/tr)\s*\/?>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * Build the final message for one recipient.
 * Returns { subject, html, text, unsubscribeUrl }.
 */
export function renderMessage({ campaign, contact, recipient, user }) {
  const vars = contactVars(contact, recipient);
  const subject = fill(campaign.subject, vars);
  let html = fill(campaign.html, vars, { html: true });

  if (!/\{\{\s*unsubscribe_url/.test(campaign.html)) {
    const f = footer(user, vars.unsubscribe_url);
    html = /<\/body>/i.test(html) ? html.replace(/<\/body>/i, `${f}</body>`) : html + f;
  }
  html = withPreheader(html, fill(campaign.preheader, vars));

  if (recipient && campaign.track_clicks) html = rewriteLinks(html, recipient.token);
  if (recipient && campaign.track_opens) {
    const pixel = `<img src="${APP_URL}/t/o/${recipient.token}.gif" width="1" height="1" alt="" style="display:block;border:0;width:1px;height:1px">`;
    html = /<\/body>/i.test(html) ? html.replace(/<\/body>/i, `${pixel}</body>`) : html + pixel;
  }

  return { subject, html, text: htmlToText(html.replace(/<img[^>]*>/gi, '')), unsubscribeUrl: vars.unsubscribe_url };
}
