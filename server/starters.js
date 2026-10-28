// Starter email designs offered when creating a template. Table-based for email-client compatibility.

const shell = (inner, bg = '#f3f4f8') => `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title></title></head>
<body style="margin:0;padding:0;background:${bg}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${bg}"><tr><td align="center" style="padding:32px 12px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden">
${inner}
</table></td></tr></table></body></html>`;

export const STARTERS = [
  {
    key: 'letter',
    name: 'Plain letter',
    description: 'Reads like a personal note. Best inbox placement.',
    subject: 'Quick note, {{first_name|there}}',
    html: `<!doctype html><html><body style="margin:0;padding:24px;font:16px/1.6 Arial,Helvetica,sans-serif;color:#1f2937">
<p>Hi {{first_name|there}},</p>
<p>I wanted to share something we’ve been working on. Write your message here: keep it short, specific and useful.</p>
<p>If it’s relevant to you, <a href="https://example.com">here’s the link</a>.</p>
<p>Thanks,<br>Your name</p>
</body></html>`,
  },
  {
    key: 'newsletter',
    name: 'Newsletter',
    description: 'Header, lead story and two short updates.',
    subject: 'This month at {{company|our team}}',
    html: shell(`<tr><td style="background:#1b2140;padding:28px 32px;font:700 22px Arial,sans-serif;color:#ffffff">Your brand</td></tr>
<tr><td style="padding:32px 32px 8px;font:16px/1.6 Arial,sans-serif;color:#1f2937">
<p style="margin:0 0 12px">Hi {{first_name|there}},</p>
<h1 style="margin:0 0 12px;font:700 26px/1.25 Arial,sans-serif;color:#111827">The headline of this issue</h1>
<p style="margin:0 0 20px">Lead with the single most useful thing you have to say this month. Two or three sentences is enough.</p>
<a href="https://example.com" style="display:inline-block;background:#3346d3;color:#ffffff;text-decoration:none;font:700 15px Arial,sans-serif;padding:12px 22px;border-radius:8px">Read the full story</a>
</td></tr>
<tr><td style="padding:24px 32px;font:15px/1.6 Arial,sans-serif;color:#374151">
<h2 style="margin:0 0 6px;font:700 17px Arial,sans-serif;color:#111827">Second update</h2>
<p style="margin:0 0 18px">A short paragraph about something else worth knowing.</p>
<h2 style="margin:0 0 6px;font:700 17px Arial,sans-serif;color:#111827">Third update</h2>
<p style="margin:0">One more item, then sign off.</p>
</td></tr>
<tr><td style="padding:20px 32px;background:#f9fafb;font:12px/1.5 Arial,sans-serif;color:#6b7280">
You’re receiving this because you subscribed. <a href="{{unsubscribe_url}}" style="color:#6b7280">Unsubscribe</a>
</td></tr>`),
  },
  {
    key: 'announcement',
    name: 'Announcement',
    description: 'One message, one button. For launches and offers.',
    subject: '{{first_name|Hey}}, something new is here',
    html: shell(`<tr><td style="padding:48px 40px 16px;text-align:center;font:16px/1.6 Arial,sans-serif;color:#1f2937">
<p style="margin:0 0 8px;font:700 12px Arial,sans-serif;letter-spacing:2px;text-transform:uppercase;color:#3346d3">Now available</p>
<h1 style="margin:0 0 16px;font:800 30px/1.2 Arial,sans-serif;color:#111827">Say what you launched in a few words</h1>
<p style="margin:0 0 28px">Explain the one benefit that matters to {{first_name|you}}, in a sentence or two.</p>
<a href="https://example.com" style="display:inline-block;background:#1b2140;color:#ffffff;text-decoration:none;font:700 16px Arial,sans-serif;padding:14px 28px;border-radius:999px">Try it now</a>
</td></tr>
<tr><td style="padding:32px 40px 40px;text-align:center;font:12px/1.5 Arial,sans-serif;color:#9ca3af">
<a href="{{unsubscribe_url}}" style="color:#9ca3af">Unsubscribe</a>
</td></tr>`, '#eef0fb'),
  },
];
