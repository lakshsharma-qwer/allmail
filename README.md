# allmail

Self-hosted bulk email marketing that sends through **your own mailboxes** (Gmail, Google Workspace, Outlook, Zoho or any SMTP). It is a Brevo-style platform, but you bring the sending infrastructure.

## How sending works (the relay)

Every mailbox you connect has a **daily limit** that you choose. Your daily capacity is the sum of all active mailboxes' limits:

```
2 mailboxes × 500/day  →  1,000 emails a day
5 mailboxes × 400/day  →  2,000 emails a day
```

Each campaign has an ordered pool of mailboxes and one of two rotation modes:

| Mode | Behaviour |
|---|---|
| **Fill one, then move on** (default) | Mailbox #1 sends until it hits its limit, then sending shifts to #2, then #3… |
| **Take turns** | Every mailbox with capacity sends in parallel. |

Sending pauses and resumes on its own:

- **All mailboxes full:** the campaign shows *Waiting* and resumes automatically after midnight, in your timezone, when the counters reset.
- **Gmail says the daily quota is exceeded before your limit:** that mailbox is marked full for today and the next one takes over.
- **Sign-in fails** (e.g. a revoked app password): that mailbox is taken out of rotation and the email is retried on another one.
- **Pacing:** each mailbox waits a random 8–20 s between emails. You can change this in Settings.

## Features

| Area | What it does |
|---|---|
| **Sender mailboxes** | Gmail, Outlook, Zoho and custom SMTP presets. Test sign-in, send a test email, set the daily limit inline, pause or resume. App passwords are encrypted at rest with AES-256-GCM. |
| **Contacts and lists** | CSV import with column mapping and custom fields, de-duplication, search and filters, bulk add or remove from lists, bulk delete. |
| **Templates** | HTML editor with a live desktop and mobile preview, personalisation tags (`{{first_name\|there}}`, custom fields), and 3 starter designs. |
| **Campaigns** | 5-step builder (details → recipients → content → senders → review), a delivery plan that tells you how many days the send will take, test sends, scheduling, pause, resume, cancel, and retry failed. |
| **Reports** | Live relay view, sent / failed / opened / clicked / unsubscribed counts, sends per mailbox, top links, and a per-recipient log. |
| **Compliance** | Unsubscribe page plus RFC 8058 one-click `List-Unsubscribe` headers, an automatic footer with your postal address, a do-not-email list (unsubscribes and hard bounces are added automatically), and the list is checked before every send. |
| **Dashboard** | Today's capacity across all mailboxes, campaigns in progress, 30-day stats and a 14-day send chart. |

## Run it

Requires **Node 22.13+** (uses the built-in `node:sqlite`, so there is no database to install).

```bash
npm install
cp .env.example .env      # optional; sensible defaults are used without it
npm run dev               # API on :4000, UI on http://localhost:5173
```

Production:

```bash
npm run build             # builds the UI into dist/
npm start                 # serves API + UI on PORT (default 4000)
```

Data lives in `data/allmail.db`. Back up the whole `data/` folder: `data/secret.key` is needed to decrypt the stored mailbox passwords.

Run `npm run test:relay` to check the relay engine end to end against a local fake SMTP server. It sets up 2 mailboxes × limit 3 with 8 contacts, then checks that exactly 6 are sent, that sending shifts from mailbox #1 to #2, that the campaign waits for tomorrow, and that unsubscribe and tracking work.

## Connecting a Gmail account

1. Turn on **2-Step Verification** on the Google account.
2. Go to <https://myaccount.google.com/apppasswords> and create an app password.
3. In allmail, open **Sender mailboxes → Add mailbox → Gmail** and paste the 16-character code.

The preset is `smtp.gmail.com:587` with STARTTLS. Recommended daily limits:

| Account type | Google's cap | Suggested limit in allmail |
|---|---|---|
| New personal Gmail | ~500/day | Start at 50–100/day and raise it over 2–4 weeks |
| Google Workspace | ~2,000/day | Up to ~1,500/day |

## Before sending real campaigns

- **Set `APP_URL`** in `.env` to the public URL of the server. Open tracking, click tracking and unsubscribe links point there, so they must be reachable from recipients' inboxes.
- **Add your postal address** in Settings. CAN-SPAM and similar laws require it in the footer.
- **Only email people who opted in.** Google's sender rules ask bulk senders to keep spam complaints under 0.1% and to honour one-click unsubscribe. Accounts that get complaints get suspended.
- **Personal Gmail accounts are meant for personal mail.** For serious volume, use Workspace mailboxes on your own domain with SPF, DKIM and DMARC set up. See `EMAIL_PLATFORMS_KNOWLEDGE.md` §17.
- **Reply-to:** when several mailboxes send one campaign, set a reply-to so all replies land in one inbox.

## Project layout

```
server/
  index.js            Express app, routes, static UI
  db.js               SQLite schema + helpers, timezone day keys
  engine/sender.js    the relay: rotation, pacing, retries, daily-limit waiting
  engine/pool.js      per-mailbox usage, capacity, SMTP transports
  engine/render.js    personalisation, tracking links/pixel, unsubscribe footer
  routes/             accounts, contacts+lists, templates, campaigns, stats, tracking
client/src/
  components/Relay.jsx   the relay rail (mailbox tanks)
  pages/                 Dashboard, Senders, Contacts, Templates, Campaigns, …
scripts/relay-test.js    end-to-end engine test
```
