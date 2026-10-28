// Public endpoints hit from inside sent emails: open pixel, click redirect, unsubscribe.
import express from 'express';
import { one, run, tx, nowIso } from '../db.js';

export const trackingRouter = express.Router();

const PIXEL = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const recipientBy = (token) => one('SELECT * FROM campaign_recipients WHERE token = ?', token);
// Opens/clicks only count for emails that were actually sent.
const sentRecipient = (token) => one(`SELECT * FROM campaign_recipients WHERE token = ? AND status = 'sent'`, token);

trackingRouter.get('/t/o/:token.gif', (req, res) => {
  const r = sentRecipient(req.params.token);
  if (r) run('UPDATE campaign_recipients SET open_count = open_count + 1, opened_at = COALESCE(opened_at, ?) WHERE id = ?', nowIso(), r.id);
  res.set({ 'Content-Type': 'image/gif', 'Cache-Control': 'no-store, no-cache, must-revalidate, private', Pragma: 'no-cache' });
  res.end(PIXEL);
});

trackingRouter.get('/t/c/:token', (req, res) => {
  const url = String(req.query.u || '');
  if (!/^https?:\/\//i.test(url)) return res.status(400).send('Invalid link.');
  const r = sentRecipient(req.params.token);
  if (r) {
    tx(() => {
      const now = nowIso();
      run('UPDATE campaign_recipients SET click_count = click_count + 1, clicked_at = COALESCE(clicked_at, ?), opened_at = COALESCE(opened_at, ?) WHERE id = ?', now, now, r.id);
      run('INSERT INTO link_clicks (recipient_id, url) VALUES (?, ?)', r.id, url.slice(0, 2000));
    });
  }
  res.redirect(302, url);
});

function unsubscribe(r) {
  const campaign = one('SELECT user_id FROM campaigns WHERE id = ?', r.campaign_id);
  if (!campaign) return;
  tx(() => {
    run('UPDATE campaign_recipients SET unsubscribed_at = COALESCE(unsubscribed_at, ?) WHERE id = ?', nowIso(), r.id);
    run(`INSERT OR IGNORE INTO suppressions (user_id, email, reason) VALUES (?, ?, 'unsubscribed')`, campaign.user_id, r.email);
    run(`UPDATE contacts SET status = 'unsubscribed' WHERE user_id = ? AND email = ? AND status = 'subscribed'`, campaign.user_id, r.email);
  });
}

const page = (title, body) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title><style>
body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f4f5fa;font:16px/1.55 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#1b2140;padding:16px}
main{background:#fff;max-width:420px;width:100%;padding:32px;border-radius:14px;box-shadow:0 1px 2px rgba(27,33,64,.06),0 8px 28px rgba(27,33,64,.08)}
h1{font-size:22px;margin:0 0 8px}p{margin:0 0 20px;color:#555b7a}
button{font:inherit;font-weight:600;background:#1b2140;color:#fff;border:0;border-radius:10px;padding:12px 18px;cursor:pointer;width:100%}
button:focus-visible{outline:3px solid #3346d3;outline-offset:2px}
</style></head><body><main>${body}</main></body></html>`;

trackingRouter.get('/u/:token', (req, res) => {
  const r = recipientBy(req.params.token);
  if (!r) return res.status(404).send(page('Link not recognised', '<h1>This link isn’t valid</h1><p>It may have been copied incompletely. Use the unsubscribe link in the original email.</p>'));
  if (r.unsubscribed_at) return res.send(page('Unsubscribed', `<h1>You’re unsubscribed</h1><p>${esc(r.email)} won’t receive these emails any more.</p>`));
  res.send(page('Unsubscribe', `<h1>Unsubscribe?</h1><p>Stop sending emails to <strong>${esc(r.email)}</strong>.</p>
<form method="post"><button type="submit">Unsubscribe</button></form>`));
});

// Form submit from the page above, and RFC 8058 one-click POST from mail clients.
trackingRouter.post('/u/:token', express.urlencoded({ extended: false }), (req, res) => {
  const r = recipientBy(req.params.token);
  if (r) unsubscribe(r);
  if (req.is('application/x-www-form-urlencoded') && req.body?.['List-Unsubscribe'] === 'One-Click') return res.status(200).end();
  res.send(page('Unsubscribed', `<h1>You’re unsubscribed</h1><p>${r ? esc(r.email) : 'This address'} won’t receive these emails any more.</p>`));
});
