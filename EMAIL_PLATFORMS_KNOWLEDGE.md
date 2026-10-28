# Email Sending Platforms — Knowledge Base

> Reference file for the **allmail** project. Compiled 2026-10-11.
> API shapes, endpoints, and auth schemes are stable. **Prices and free-tier limits change often** — re-verify on each vendor's pricing page before quoting. Items marked ⚠️ had conflicting third-party reports at time of writing.

---

## Table of Contents

1. [Categories of email platforms](#1-categories-of-email-platforms)
2. [Quick comparison matrix](#2-quick-comparison-matrix)
3. [Mailchimp (Marketing API + Transactional/Mandrill)](#3-mailchimp)
4. [Brevo (formerly Sendinblue)](#4-brevo-formerly-sendinblue)
5. [SendGrid (Twilio)](#5-sendgrid-twilio)
6. [Amazon SES](#6-amazon-ses)
7. [Mailgun (Sinch)](#7-mailgun-sinch)
8. [Postmark (ActiveCampaign)](#8-postmark)
9. [Resend](#9-resend)
10. [MailerSend](#10-mailersend)
11. [Mailjet (Sinch)](#11-mailjet-sinch)
12. [SparkPost / Bird](#12-sparkpost--bird)
13. [Other transactional APIs (Elastic Email, SMTP2GO, ZeptoMail, Loops, Plunk, SendPulse, Customer.io)](#13-other-transactional-apis)
14. [Other marketing platforms (Kit, MailerLite, Klaviyo, ActiveCampaign, Constant Contact, HubSpot, GetResponse, AWeber, Moosend, Omnisend)](#14-other-marketing-platforms)
15. [Mailbox providers as senders (Gmail API, Microsoft Graph, SMTP)](#15-mailbox-providers-as-senders)
16. [Self-hosted / open source](#16-self-hosted--open-source)
17. [Deliverability fundamentals (SPF, DKIM, DMARC, BIMI, bulk-sender rules)](#17-deliverability-fundamentals)
18. [Email events — normalized model](#18-email-events--normalized-model)
19. [Webhook signature verification cheat-sheet](#19-webhook-signature-verification-cheat-sheet)
20. [Legal & compliance](#20-legal--compliance)
21. [Design notes for a unified "allmail" abstraction](#21-design-notes-for-a-unified-allmail-abstraction)
22. [Choosing a provider — decision guide](#22-choosing-a-provider--decision-guide)

---

## 1. Categories of email platforms

| Category | Purpose | Examples |
|---|---|---|
| **Transactional / Email API (ESP for devs)** | 1:1 triggered mail: password resets, receipts, OTPs, notifications. API + SMTP relay. | Amazon SES, SendGrid, Mailgun, Postmark, Resend, MailerSend, SparkPost, Mailjet, Brevo (transactional), Mandrill, ZeptoMail, SMTP2GO, Elastic Email |
| **Marketing / Newsletter ESP** | Lists/audiences, campaigns, drag-and-drop editor, automations, segmentation, landing pages, forms. | Mailchimp, Brevo, Kit (ConvertKit), MailerLite, Klaviyo, ActiveCampaign, Constant Contact, HubSpot, GetResponse, AWeber, Moosend, Omnisend |
| **Hybrid (both)** | One account does transactional + marketing. | Brevo, SendGrid (Marketing Campaigns), Mailjet, Mailgun (Optimize/Send), Resend (Broadcasts), Postmark (Broadcast streams), Loops, Customer.io |
| **Customer-engagement / lifecycle** | Event-driven messaging across email, SMS, push, in-app. | Customer.io, Braze, Iterable, Klaviyo, Brevo, OneSignal |
| **Mailbox providers used to send** | Sending as a real user mailbox. Low volume. | Gmail API / Google Workspace SMTP, Microsoft Graph / Outlook SMTP, Zoho Mail |
| **Cold outreach tools** | Sales sequences from real mailboxes, warmup. (Different rules; not ESPs.) | Instantly, Smartlead, Lemlist, Apollo, Reply.io |
| **Self-hosted MTA / platforms** | Run your own sending infra. | Postal, Postfix, Haraka, listmonk, Mautic, Keila, Sendportal |

**Rule of thumb:** never send marketing and transactional mail from the same IP/subdomain. Use separate subdomains (e.g. `mail.example.com` for transactional, `news.example.com` for marketing) and, where offered, separate streams/IP pools.

---

## 2. Quick comparison matrix

Prices are entry-level USD/month, approximate as of 2026.

| Provider | Type | Free tier | Entry paid | API auth | REST send endpoint | SMTP host |
|---|---|---|---|---|---|---|
| **Mailchimp** | Marketing (+ Transactional add-on) | 250 contacts, ~500 sends/mo ⚠️ | Essentials ~$13 | Basic (`anystring:APIKEY`) or OAuth2 | Campaign API (no 1:1 send); Transactional: `mandrillapp.com/api/1.0/messages/send` | `smtp.mandrillapp.com` |
| **Brevo** | Hybrid | 300 emails/day | Starter ~$9 (5k emails) | `api-key` header | `POST api.brevo.com/v3/smtp/email` | `smtp-relay.brevo.com` |
| **SendGrid** | Hybrid | None (60-day trial, 100/day) | Essentials $19.95 (50k) | `Authorization: Bearer` | `POST api.sendgrid.com/v3/mail/send` | `smtp.sendgrid.net` (user `apikey`) |
| **Amazon SES** | Transactional infra | New-account credits / 3k/mo first year ⚠️ | $0.10 per 1,000 | AWS SigV4 (IAM) | SESv2 `SendEmail` | `email-smtp.<region>.amazonaws.com` |
| **Mailgun** | Transactional | 100/day | Basic ~$15 (10k) | Basic (`api:KEY`) | `POST api.mailgun.net/v3/<domain>/messages` | `smtp.mailgun.org` |
| **Postmark** | Transactional (+ broadcast) | 100/mo (dev) | ~$15 (10k) | `X-Postmark-Server-Token` | `POST api.postmarkapp.com/email` | `smtp.postmarkapp.com` |
| **Resend** | Transactional (+ broadcasts) | 3,000/mo, 100/day, 1 domain | Pro $20 (50k) | `Authorization: Bearer re_...` | `POST api.resend.com/emails` | `smtp.resend.com` (user `resend`) |
| **MailerSend** | Transactional | 500/mo ⚠️ | Hobby ~$7 (5k) | `Authorization: Bearer` | `POST api.mailersend.com/v1/email` | `smtp.mailersend.net` |
| **Mailjet** | Hybrid | 6,000/mo, 200/day | ~$15 | Basic (`APIKEY:SECRET`) | `POST api.mailjet.com/v3.1/send` | `in-v3.mailjet.com` |
| **SparkPost/Bird** | Transactional | Test account | Varies (Bird pricing) | `Authorization: <key>` | `POST api.sparkpost.com/api/v1/transmissions` | `smtp.sparkpostmail.com` |
| **Elastic Email** | Hybrid | Limited free | Pay-as-you-go ~$0.09/1k | `X-ElasticEmail-ApiKey` | `POST api.elasticemail.com/v4/emails` | `smtp.elasticemail.com` |
| **SMTP2GO** | Transactional | 1,000/mo, 200/day | ~$15 | `X-Smtp2go-Api-Key` | `POST api.smtp2go.com/v3/email/send` | `mail.smtp2go.com` |
| **ZeptoMail (Zoho)** | Transactional | 10k credits trial | ~$2.50 per 10k credits | `Authorization: Zoho-enczapikey ...` | `POST api.zeptomail.com/v1.1/email` | `smtp.zeptomail.com` |

---

## 3. Mailchimp

Owned by **Intuit**. The market-leading marketing ESP. It has two separate products with separate APIs and keys:

- **Mailchimp Marketing API** handles audiences, campaigns, automations and reports. It **cannot send 1:1 transactional email**.
- **Mailchimp Transactional (formerly Mandrill)** is a paid add-on for 1:1 API/SMTP sending.

### 3.1 Plans (2026, approx.)
| Plan | Price | Notes |
|---|---|---|
| Free | $0 | ~250 contacts, ~500 sends/mo, 250/day ⚠️ (reduced over the years: it was 2,000 contacts in 2022). Mailchimp branding, 1 audience, no automations beyond basic. |
| Essentials | from ~$13 | Send limit ≈ 10× contacts/mo. A/B tests, email support. |
| Standard | from ~$20 | ≈ 12× contacts. Automations (Customer Journeys), send-time optimization, dynamic content, Transactional add-on eligible. |
| Premium | from ~$350 | ≈ 15× contacts. Advanced segmentation, multivariate tests, phone support. |

- **Billing gotcha:** priced by **contact count, including unsubscribed contacts**, unless you archive them.
- **Transactional add-on:** bought in **blocks** (≈ $20 per 25k emails). Requires a Standard plan or higher.

### 3.2 Marketing API v3
- **Base URL:** `https://<dc>.api.mailchimp.com/3.0/`. `<dc>` is the data center suffix of the API key (`xxxxxxxx-us21` → `us21`). OAuth apps get the dc from `https://login.mailchimp.com/oauth2/metadata`.
- **Auth:** HTTP Basic with any username and the API key as the password, or `Authorization: Bearer <oauth_token>`.
- **OAuth2:** authorize at `https://login.mailchimp.com/oauth2/authorize`, token at `https://login.mailchimp.com/oauth2/token`. Tokens do not expire.
- **Rate limit:** **10 simultaneous connections** per API key/user (not req/s). Exceeding it returns `429`. Long-running work should use **Batch Operations**.
- **Timeouts:** calls time out after 120 s.
- **SDKs:** `@mailchimp/mailchimp_marketing` (Node), `mailchimp-marketing` (Python), PHP, Ruby.

**Key concepts:** Audience (= "list", `list_id`) → Members (contacts) → Tags, Merge fields (`FNAME`, `LNAME`…), Interests (groups), Segments.

**Core endpoints:**
| Action | Method & path |
|---|---|
| Health check | `GET /ping` |
| List audiences | `GET /lists` |
| Add/update member (upsert) | `PUT /lists/{list_id}/members/{subscriber_hash}` |
| Add member | `POST /lists/{list_id}/members` |
| Tag member | `POST /lists/{list_id}/members/{hash}/tags` |
| Batch subscribe | `POST /lists/{list_id}` with `members[]` (≤500) |
| Create campaign | `POST /campaigns` (`type: regular|plaintext|rss|variate`) |
| Set content | `PUT /campaigns/{id}/content` (`html` or `template.id`) |
| Send / schedule / test | `POST /campaigns/{id}/actions/send` · `/schedule` · `/test` |
| Reports | `GET /reports/{campaign_id}` |
| Batch operations | `POST /batches` (async; poll `GET /batches/{id}` or use batch webhooks) |
| Customer Journeys trigger | `POST /customer-journeys/journeys/{j}/steps/{s}/actions/trigger` |
| E-commerce | `/ecommerce/stores/...` (orders, carts, products) |

- **`subscriber_hash`** = MD5 of the **lowercased** email.
- **Member `status`:** `subscribed`, `unsubscribed`, `cleaned`, `pending` (double opt-in), `transactional`, `archived`. Use `status_if_new` on PUT upserts.

```bash
curl -X PUT "https://us21.api.mailchimp.com/3.0/lists/$LIST/members/$(echo -n 'jo@example.com' | md5)" \
  --user "any:$MC_KEY" \
  -d '{"email_address":"jo@example.com","status_if_new":"subscribed","merge_fields":{"FNAME":"Jo"}}'
```

**Webhooks:** configured per audience (`POST /lists/{id}/webhooks`). Events: `subscribe`, `unsubscribe`, `profile`, `cleaned`, `upemail`, `campaign`. They are sent as `application/x-www-form-urlencoded`. A GET validation request is sent on setup. **There is no signature**, so put a secret token in the URL.

**Errors:** RFC 7807 JSON `{type, title, status, detail, instance}`.

### 3.3 Mailchimp Transactional (Mandrill) API
- **Base:** `https://mandrillapp.com/api/1.0/`. **Every call is a POST** with JSON, and the **API key goes in the body** as `"key"`.
- **Send:** `POST /messages/send` → `{ key, message: { html, text, subject, from_email, from_name, to:[{email,name,type:"to"}], headers, merge_vars, global_merge_vars, tags, metadata, track_opens, track_clicks }, async, send_at }`
- **Template send:** `POST /messages/send-template` (`template_name`, `template_content`, merge language `mailchimp` `*|VAR|*` or `handlebars`).
- **Responses:** an array of `{email, status: sent|queued|scheduled|rejected|invalid, reject_reason, _id}`.
- **Other endpoints:** `/users/ping2`, `/senders/domains`, `/rejects/list` (suppression), `/allowlists`, `/webhooks/add`, `/inbound/*` (inbound routes), `/subaccounts/*`.
- **SMTP:** `smtp.mandrillapp.com`, ports 587/2525/465. Username is any string, password is the API key. Custom headers: `X-MC-Template`, `X-MC-MergeVars`, `X-MC-Tags`, `X-MC-Metadata`, `X-MC-Track`.
- **Webhooks:** events `send, deferral, hard_bounce, soft_bounce, open, click, spam, unsub, reject` plus inbound and sync events. Sent as POST form field `mandrill_events` (JSON array). **Signature:** `X-Mandrill-Signature` = base64(HMAC-SHA1(webhook_key, url + sorted concatenation of POST key+value)).
- **SDK:** `@mailchimp/mailchimp_transactional`.

---

## 4. Brevo (formerly Sendinblue)

French company (rebranded 2023). All-in-one: marketing email, **transactional email**, SMS, WhatsApp, chat, CRM, automations, landing pages. Good value for large lists because pricing is by **email volume, not contacts**.

### 4.1 Plans (2026, approx.)
| Plan | Price | Notes |
|---|---|---|
| Free | $0 | **300 emails/day** (~9k/mo). Large contact storage (reports vary: 100k or "unlimited") ⚠️. Brevo branding. |
| Starter | ~$9/mo (5k emails/mo; volume tiers) | No daily cap. Brevo logo removal is a paid add-on. ⚠️ Some reports mention new contact caps since Oct 2025. |
| Standard (formerly Business) | ~$18+ | Automations, A/B tests, send-time optimization, multi-user. |
| Professional / Enterprise | custom | Dedicated IP, SSO, advanced. |

Transactional email shares credits with the plan. Prepaid **email credits** (pay-as-you-go) are also sold.

### 4.2 API v3
- **Base URL:** `https://api.brevo.com/v3/` (the legacy host `api.sendinblue.com/v3/` still works).
- **Auth:** header `api-key: xkeysib-...`. Partner apps can use OAuth2.
- **Content-Type:** `application/json`; also send `accept: application/json`.
- **Rate limits:** vary by endpoint and plan. Transactional `/smtp/email` is high-throughput, while contacts and campaigns endpoints are lower (roughly 10 req/s range on lower plans). Response headers: `x-sib-ratelimit-limit`, `x-sib-ratelimit-remaining`, `x-sib-ratelimit-reset`. Back off on `429`.
- **IP restriction:** Brevo can block API calls from unknown IPs ("Authorised IPs" setting). Watch for this in serverless/CI.
- **SDKs:** `@getbrevo/brevo` (Node/TS), `brevo-python`, PHP, Ruby, Go, Java, C#.

**Transactional send:**
```http
POST https://api.brevo.com/v3/smtp/email
api-key: xkeysib-...
Content-Type: application/json

{
  "sender": {"name": "Acme", "email": "no-reply@mail.acme.com"},
  "to": [{"email": "jo@example.com", "name": "Jo"}],
  "cc": [], "bcc": [],
  "replyTo": {"email": "support@acme.com"},
  "subject": "Your receipt",
  "htmlContent": "<p>Hi {{params.name}}</p>",
  "textContent": "Hi",
  "params": {"name": "Jo"},
  "templateId": 12,
  "tags": ["receipt"],
  "headers": {"X-Mailin-custom": "order:123", "idempotencyKey": "abc-123"},
  "attachment": [{"name": "inv.pdf", "content": "<base64>"}],
  "scheduledAt": "2026-10-12T09:00:00+05:30",
  "messageVersions": []
}
```
- **Response:** `201 {"messageId": "<...@smtp-relay.mailin.fr>"}` (or `messageIds` when using `messageVersions`).
- **Templating:** Brevo templates use `{{ params.x }}`, `{{ contact.FIRSTNAME }}`, plus Django/Jinja-like `{% if %}`.
- **`messageVersions`** lets you batch-send different content and recipients in one call (up to ~1000 versions).

**Other key endpoints:**
| Action | Path |
|---|---|
| Account info | `GET /account` |
| Contacts CRUD | `POST /contacts`, `GET/PUT/DELETE /contacts/{identifier}` (email, id, or SMS) |
| Import contacts | `POST /contacts/import` |
| Lists & folders | `/contacts/lists`, `/contacts/folders` |
| Attributes | `/contacts/attributes` |
| Double opt-in | `POST /contacts/doubleOptinConfirmation` |
| Email campaigns | `POST /emailCampaigns`, `POST /emailCampaigns/{id}/sendNow`, `/sendTest` |
| Transactional templates | `/smtp/templates` |
| Transactional events/logs | `GET /smtp/statistics/events`, `/smtp/statistics/aggregatedReport` |
| Blocked/suppressed | `GET /smtp/blockedContacts`, `DELETE /smtp/blockedContacts/{email}` |
| Senders & domains | `/senders`, `/senders/domains` (authenticate domain) |
| Webhooks | `/webhooks` (type `transactional` or `marketing`) |
| SMS | `POST /transactionalSMS/sms` |
| WhatsApp | `POST /whatsapp/sendMessage` |
| Events (automation trigger) | `POST /events` |

**SMTP relay:** `smtp-relay.brevo.com`, ports **587** (STARTTLS), 465 (SSL), 2525. Username is your **SMTP login** (shown in SMTP & API settings, often `xxxx@smtp-brevo.com`), and the password is an **SMTP key** (not the API key).

**Webhooks:**
- **Transactional events:** `sent/request`, `delivered`, `opened`, `uniqueOpened`, `click`, `softBounce`, `hardBounce`, `invalid`, `deferred`, `spam`, `blocked`, `unsubscribed`, `error`, `proxy_open`.
- **Marketing events:** `delivered, opened, click, hardBounce, softBounce, spam, unsubscribed, listAddition`.
- **Security:** Brevo supports basic auth or a bearer token on the webhook URL, plus a list of Brevo IP ranges to allow. There is **no HMAC**.

**Domain authentication:** Brevo provides a TXT `brevo-code`, a DKIM CNAME/TXT, an SPF include `include:spf.brevo.com`, and DMARC.

---

## 5. SendGrid (Twilio)

- **Ownership and history:** one of the largest email APIs, acquired by Twilio in 2019.
- **Free plan:** ❗ The **permanent free plan was retired in mid-2025**. New accounts get a **60-day trial (100 emails/day)**. Pricing pages now live on twilio.com.

### 5.1 Plans
- **Email API:** Essentials **$19.95/mo for 50k** (100k ≈ $34.95), Pro **$89.95+** (dedicated IP, subusers, SSO), Premier custom.
- **Marketing Campaigns:** priced separately by contacts.
- **Add-ons:** Email Validation API (Pro+), dedicated IPs, Expert Services.

### 5.2 API v3
- **Base:** `https://api.sendgrid.com/v3/`. The EU region uses `https://api.eu.sendgrid.com/v3/` with an EU subuser.
- **Auth:** `Authorization: Bearer SG.xxxx`. Use scoped API keys.
- **Send:** `POST /mail/send` → **`202 Accepted`** with empty body. The message ID is in the `X-Message-Id` header.

```json
{
  "personalizations": [
    {"to": [{"email": "jo@example.com", "name": "Jo"}],
     "dynamic_template_data": {"name": "Jo"},
     "custom_args": {"order_id": "123"},
     "send_at": 1760000000}
  ],
  "from": {"email": "no-reply@mail.acme.com", "name": "Acme"},
  "reply_to": {"email": "support@acme.com"},
  "subject": "Hello",
  "content": [{"type": "text/plain", "value": "Hi"}, {"type": "text/html", "value": "<p>Hi</p>"}],
  "template_id": "d-xxxxxxxx",
  "categories": ["receipt"],
  "asm": {"group_id": 123},
  "tracking_settings": {"click_tracking": {"enable": true}},
  "mail_settings": {"sandbox_mode": {"enable": false}},
  "attachments": [{"content": "<b64>", "filename": "a.pdf", "type": "application/pdf"}],
  "ip_pool_name": "transactional",
  "batch_id": "..."
}
```

**Send limits and behaviour:**
- **Personalizations:** up to **1,000 per request**. Each personalization is a separate email, with ≤1,000 total recipients across to/cc/bcc.
- **Message size:** max total **30 MB**.
- **Dynamic templates:** use Handlebars (`{{name}}`, `{{#if}}`, `{{#each}}`). Template IDs start with `d-`.
- **Sandbox mode:** validates the request without sending.
- **Scheduling:** `send_at` up to 72 h ahead. Cancel or pause scheduled sends with `batch_id` + `/user/scheduled_sends`.

**Other endpoints:**
- **Suppressions:** `/suppression/bounces`, `/blocks`, `/spam_reports`, `/invalid_emails`, `/unsubscribes`, plus `/asm/groups` (unsubscribe groups).
- **Stats and logs:** `/stats`, and `/messages` for the Email Activity Feed (paid add-on).
- **Domain authentication:** `/whitelabel/domains`, now called "Sender Authentication". It uses CNAME-based automated security: `s1._domainkey` and `s2._domainkey` → sendgrid.net, `em123.domain` → sendgrid.net for SPF/return-path.
- **Link branding:** `/whitelabel/links`.
- **Marketing:** `/marketing/contacts` (async jobs), `/marketing/lists`, `/marketing/singlesends`.
- **Rate limits:** most non-mail endpoints return `X-RateLimit-Limit`, `X-RateLimit-Remaining` and `X-RateLimit-Reset`. `mail/send` is designed for very high throughput.

**SMTP:**
- **Host:** `smtp.sendgrid.net`, ports 587/25/2525 (TLS) or 465 (SSL).
- **Credentials:** username is literally `apikey`, password is the API key.
- **X-SMTPAPI header:** a JSON header for categories, unique_args and send_at.

**Event Webhook:**
- **Delivery:** POSTs a JSON array of events.
- **Event types:** `processed, dropped, delivered, deferred, bounce (type: bounce|blocked), open, click, spamreport, unsubscribe, group_unsubscribe, group_resubscribe`.
- **Signed Event Webhook:** **ECDSA** signature verification with headers `X-Twilio-Email-Event-Webhook-Signature` and `X-Twilio-Email-Event-Webhook-Timestamp`. Verify `timestamp + raw_body` against the public key using ECDSA P-256 / SHA-256.
- **Inbound Parse webhook:** receives incoming mail (MX → `mx.sendgrid.net`) and posts multipart/form-data.

**SDKs:** `@sendgrid/mail`, `sendgrid` (Python), `sendgrid-go`, PHP, Java, C#, Ruby.

---

## 6. Amazon SES

- **What it is:** AWS's raw sending infrastructure. It is the **cheapest at scale** and the most DIY: you build suppression handling, templates UI, analytics, and so on yourself.

### 6.1 Pricing
- **Outbound:** **$0.10 per 1,000 emails**, plus $0.12 per GB of attachments.
- **Inbound:** $0.10 per 1,000, plus $0.09 per 1,000 chunks.
- **Free usage:** historically 3,000 messages/mo for the first 12 months (it was 62k/mo from EC2 before Aug 2023). Since July 2025, new AWS accounts use a **credit-based Free Plan** ($100–$200 credits) ⚠️. Check aws.amazon.com/ses/pricing.
- **Dedicated IPs:** standard **$24.95/IP/mo**. **Managed dedicated IPs** (auto-warmup) cost $15/mo + $0.08/1k.
- **Virtual Deliverability Manager:** paid add-on (~$0.07/1k) providing advisor and insights.
- **Mail Manager:** inbound/outbound rules, archiving and add-ons, billed separately.

### 6.2 Key concepts
- **Sandbox:** new accounts start here. You can send only to **verified** addresses, with a limit of **200/day and 1/sec**. Request **production access** in the console with a use-case description.
- **Identities:** verify either a domain (Easy DKIM: 3 CNAMEs, or BYODKIM) or a single email address.
- **Custom MAIL FROM domain:** e.g. `bounce.example.com`, with an MX + SPF record, needed for SPF alignment under DMARC.
- **Configuration sets:** attach **event destinations** (SNS, EventBridge, CloudWatch, Kinesis Firehose, Pinpoint), IP pools, reputation metrics and tracking domains.
- **Account-level suppression list:** auto-adds bounces and complaints. Manage it via `PutSuppressedDestination` and `DeleteSuppressedDestination`.
- **Quotas:**
  - Per-account: max **send rate** (msgs/sec) and **24-hour sending quota**. Check them with `GetAccount`; they grow with good reputation.
  - Per-message: ≤ **50 recipients**, max **40 MB** message size (v2 API).
- **Reputation:** keep **bounce rate < 5%** (review at 10%) and **complaint rate < 0.1%** (review at 0.5%), or the account is paused.
- **Regions:** pick one close to you, e.g. `us-east-1`, `eu-west-1` or `ap-south-1` (Mumbai). Identities are per region.

### 6.3 API (SESv2)
- **Endpoint:** `https://email.<region>.amazonaws.com/v2/email/outbound-emails`, but **use the AWS SDK**. It handles SigV4 signing.
- **Auth:** IAM credentials or role, with permission `ses:SendEmail`.

```js
import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";
const ses = new SESv2Client({ region: "ap-south-1" });
await ses.send(new SendEmailCommand({
  FromEmailAddress: "Acme <no-reply@mail.acme.com>",
  Destination: { ToAddresses: ["jo@example.com"] },
  ReplyToAddresses: ["support@acme.com"],
  Content: {
    Simple: { Subject: { Data: "Hi" }, Body: { Html: { Data: "<p>Hi</p>" }, Text: { Data: "Hi" } },
              Headers: [{ Name: "List-Unsubscribe", Value: "<https://acme.com/u?t=..>" }] }
    // or Raw: { Data: mimeBuffer }   or Template: { TemplateName, TemplateData: JSON }
  },
  ConfigurationSetName: "default",
  EmailTags: [{ Name: "type", Value: "receipt" }],
  ListManagementOptions: { ContactListName: "news", TopicName: "weekly" } // auto unsubscribe headers
}));
```

**SESv2 operations:**
- **Sending:** `SendEmail`, and `SendBulkEmail` (up to 50 destinations with a template).
- **Templates:** `CreateEmailTemplate`, using Handlebars-like `{{var}}`.
- **Identities:** `CreateEmailIdentity`.
- **Configuration and lists:** `CreateConfigurationSet`, `PutConfigurationSetEventDestination`, `CreateContactList` (SES-managed subscriptions and unsubscribe).
- **Diagnostics:** `GetAccount`.

**SMTP:**
- **Host:** `email-smtp.<region>.amazonaws.com`, ports 587/25/2587 (STARTTLS) or 465/2465 (TLS).
- **Credentials:** SMTP credentials are **derived from IAM keys** (generate them in the console). They are not your raw secret key.

**Events:** Send, Delivery, Bounce (Permanent/Transient with subtypes), Complaint, Reject, Open, Click, RenderingFailure, DeliveryDelay, Subscription. Via SNS, verify the **SNS message signature** (`SignatureVersion` 1 = SHA1, 2 = SHA256; fetch `SigningCertURL` and check the host is `sns.<region>.amazonaws.com`) and confirm the subscription with `SubscribeURL`.

**Inbound:** receipt rules (S3, Lambda, SNS, WorkMail), with MX `inbound-smtp.<region>.amazonaws.com`.

---

## 7. Mailgun (Sinch)

- **What it is:** a developer-focused transactional API owned by Sinch (which also owns Mailjet, Mailgun Optimize and InboxReady). It has strong inbound **Routes**.
- **Plans:**
  - Free: **100 emails/day**, 1 domain, 1-day logs.
  - Basic: ~$15 for 10k.
  - Foundation: ~$35 for 50k (templates, more domains).
  - Scale: ~$90 for 100k (dedicated IP, send-time optimization).
- **Base URL:** `https://api.mailgun.net/v3/`. The **EU** region is `https://api.eu.mailgun.net/v3/`, and domains are bound to one region.
- **Auth:** HTTP Basic with username `api` and password the **private API key** (or a domain sending key).
- **Send:** `POST /v3/{domain}/messages` as **form-data** (not JSON).

```bash
curl -s --user "api:$MG_KEY" https://api.mailgun.net/v3/mg.acme.com/messages \
  -F from='Acme <no-reply@mg.acme.com>' -F to=jo@example.com \
  -F subject='Hi' -F text='Hi' -F html='<p>Hi</p>' \
  -F template='welcome' -F 't:variables={"name":"Jo"}' \
  -F o:tag=welcome -F o:tracking=yes -F 'h:Reply-To=support@acme.com' \
  -F 'v:order_id=123' -F 'recipient-variables={"jo@example.com":{"name":"Jo"}}' \
  -F o:deliverytime='Sun, 12 Oct 2026 09:00:00 +0000'
```

**Send options:**
- **Batch sending:** up to **1,000 recipients** per call with `recipient-variables`. Each recipient gets an individual email.
- **Prefixes:** `o:` options, `h:` custom headers, `v:` custom variables (returned in events), `t:` template options.
- **MIME:** `POST /v3/{domain}/messages.mime` sends raw MIME.
- **Test mode:** `o:testmode=yes`.

**Other endpoints:**
- **Events (logs):** `GET /v3/{domain}/events`.
- **Suppressions:** `/bounces`, `/unsubscribes`, `/complaints`, `/whitelists`.
- **Domains:** `/v4/domains` provides DNS records (SPF include `mailgun.org`, DKIM TXT, CNAME `email.` for tracking, MX for inbound).
- **Webhooks:** `/v3/domains/{domain}/webhooks`.
- **Templates:** `/v3/{domain}/templates`, using Handlebars.
- **Validation:** `/v4/address/validate`.

**Inbound Routes:** `POST /v3/routes` with expressions like `match_recipient(".*@acme.com")` and actions `forward("https://...")`, `store()`, `stop()`.

**Webhooks:**
- **Events:** `accepted, delivered, opened, clicked, unsubscribed, complained, permanent_fail, temporary_fail`.
- **Verification:** the JSON body has a `signature: {timestamp, token, signature}` object. Verify **HMAC-SHA256(webhook_signing_key, timestamp + token)** == signature, and reject old timestamps and reused tokens.

**SMTP:** `smtp.mailgun.org` (EU: `smtp.eu.mailgun.org`), ports 587/465/2525. Credentials are per-domain SMTP users.

**SDKs:** `mailgun.js` (+ `form-data`), Python (`mailgun` official or plain requests), PHP, Go, Ruby, Java.

---

## 8. Postmark

- **What it is:** owned by **ActiveCampaign**. It is known for the **best transactional deliverability and speed** and is strict about content: **no bulk marketing on transactional streams**.
- **Plans:** Free developer tier with **100 emails/mo**. Basic ~$15 for 10k, and Pro/Platform tiers add features and retention. Dedicated IPs require 300k+/mo.
- **Base:** `https://api.postmarkapp.com/`.
- **Auth:**
  - **Server token** (`X-Postmark-Server-Token`) for sending and server-level calls.
  - **Account token** (`X-Postmark-Account-Token`) for managing servers and domains.
- **Message Streams:** each server has `outbound` (transactional), `broadcast` (marketing/bulk) and `inbound`. Set `MessageStream` on every send. Broadcast streams require an unsubscribe link (`{{{ pm:unsubscribe }}}`).

```json
POST /email
{
  "From": "Acme <no-reply@acme.com>",
  "To": "jo@example.com",
  "Cc": "", "Bcc": "", "ReplyTo": "support@acme.com",
  "Subject": "Hi",
  "HtmlBody": "<p>Hi</p>", "TextBody": "Hi",
  "Tag": "welcome",
  "Metadata": {"order_id": "123"},
  "Headers": [{"Name": "X-Custom", "Value": "1"}],
  "TrackOpens": true, "TrackLinks": "HtmlAndText",
  "Attachments": [{"Name": "a.pdf", "Content": "<b64>", "ContentType": "application/pdf"}],
  "MessageStream": "outbound"
}
```

**Send endpoints and limits:**
- **Response:** `{ To, SubmittedAt, MessageID, ErrorCode: 0, Message: "OK" }`.
- **Batch:** `POST /email/batch` takes up to **500 messages**. Templated batch is `POST /email/batchWithTemplates`.
- **Templates:** `POST /email/withTemplate` with `TemplateId`/`TemplateAlias` + `TemplateModel`, using **Mustachio** (`{{name}}`, `{{#each}}`). Layouts are supported.
- **Limits:** max **10 MB** per message (including attachments) and **50 recipients** across To/Cc/Bcc.
- **Errors:** HTTP 422 with an `ErrorCode`. Examples: 300 = invalid email, 406 = inactive recipient (suppressed), 400 = sender signature not confirmed.

**Other endpoints:** `/messages/outbound` (search), `/bounces`, `/message-streams/{id}/suppressions`, `/domains`, `/senders`, `/stats/outbound`, `/webhooks`, `/templates`.

**SMTP:**
- **Hosts:** `smtp.postmarkapp.com` (transactional), `smtp-broadcasts.postmarkapp.com` (broadcast).
- **Ports:** 25/587/2525.
- **Credentials:** user and password are both the server token. Set the stream with header `X-PM-Message-Stream`. **SMTP tokens** (access key / secret) are also available.

**Webhooks:**
- **Events:** Delivery, Bounce, SpamComplaint, Open, Click, SubscriptionChange, plus Inbound (parsed JSON).
- **Security:** **no HMAC**. Use basic-auth credentials in the URL or custom headers, and/or allowlist Postmark IPs.

**SDKs:** `postmark` (Node), `postmarker` (Python), PHP, Ruby, .NET.

---

## 9. Resend

- **What it is:** a modern, developer-first API (YC, 2023) built around **React Email** (JSX email templates). Popular with Next.js and Vercel stacks.

**Plans:**
| Plan | Price | Allowance and features |
|---|---|---|
| Free | $0 | **3,000/mo, 100/day**, 1 domain. Sending pauses when the cap is hit. |
| Pro | $20 | 50k/mo, no daily cap. Overage ~$0.90/1k. |
| Scale | from $90 | 100k+/mo. Dedicated IP add-on. |
| Enterprise | custom | — |

Marketing (Broadcasts/Audiences) is priced separately by contacts.

**API basics:**
- **Base:** `https://api.resend.com`.
- **Auth:** `Authorization: Bearer re_xxx`.
- **Rate limit:** default ~**2 requests/second per team** (raisable on request). Responses carry `ratelimit-limit`, `ratelimit-remaining`, `ratelimit-reset` and `retry-after` on 429.
- **Idempotency:** `Idempotency-Key` header on POST /emails (24 h window).

```ts
import { Resend } from "resend";
const resend = new Resend(process.env.RESEND_API_KEY);
const { data, error } = await resend.emails.send({
  from: "Acme <no-reply@mail.acme.com>",
  to: ["jo@example.com"],           // up to 50
  subject: "Hi",
  react: <WelcomeEmail name="Jo" />, // or html / text
  replyTo: "support@acme.com",
  cc: [], bcc: [],
  headers: { "X-Entity-Ref-ID": "123" },
  tags: [{ name: "type", value: "welcome" }],
  attachments: [{ filename: "a.pdf", content: buffer }],
  scheduledAt: "in 1 hour"          // natural language or ISO 8601
});
// data = { id: "uuid" }
```

**Endpoints:**
- **Emails:**
  - `POST /emails`, `GET /emails/{id}`, `PATCH /emails/{id}` (reschedule), `POST /emails/{id}/cancel`.
  - `POST /emails/batch` sends up to **100 emails** per call. Batch does not support attachments or scheduling.
- **Domains:** `/domains` (create → DNS records: MX + TXT SPF on a `send.` subdomain, DKIM TXT `resend._domainkey`), `/domains/{id}/verify`.
- **Marketing and keys:** `/audiences`, `/audiences/{id}/contacts`, `/broadcasts`, `/api-keys` (full or sending-only, domain-scoped).
- **Templates (newer):** server-side templates with variables.
- **Inbound:** receiving email is supported (newer feature).

**Other details:**
- **SMTP:** `smtp.resend.com`, ports 465/2465 (TLS) or 587/2587/25 (STARTTLS). Username `resend`, password is the API key.
- **Webhooks:**
  - Events: `email.sent, email.delivered, email.delivery_delayed, email.bounced, email.complained, email.opened, email.clicked, email.failed, email.scheduled, contact.*, domain.*`.
  - Webhooks are signed via **Svix**: headers `svix-id`, `svix-timestamp`, `svix-signature`. Verify with `resend.webhooks.verify()` or the `svix` library (HMAC-SHA256 over `id.timestamp.body` with a `whsec_` secret).
- **SDKs:** Node, Python, PHP, Ruby, Go, Rust, Java, .NET, Elixir.
- **React Email:** `@react-email/components` is usable with any provider via `render()` → HTML.

---

## 10. MailerSend

- **What it is:** a transactional API from the MailerLite team. It has a friendly UI and template builder and also does SMS.

**Plans:**
| Plan | Price | Allowance |
|---|---|---|
| Free | $0 | ~**500 emails/mo** (≈100/day ⚠️), 1 domain, limited API requests/day |
| Hobby | ~$7 | 5k |
| Starter / Professional | — | 50k+ |

**API basics:**
- **Base:** `https://api.mailersend.com/v1/`.
- **Auth:** `Authorization: Bearer <token>`.
- **Send:** `POST /email` with `{from:{email,name}, to:[{email,name}], subject, html, text, template_id, personalization:[{email, data:{...}}], tags, attachments, send_at, in_reply_to, precedence_bulk}`. It returns **202** with an `X-Message-Id` header.
- **Bulk:** `POST /bulk-email` (array of up to 500 emails, async), then poll `GET /bulk-email/{id}`.

**Other details:**
- **Other endpoints:** `/activity/{domain_id}`, `/analytics`, `/domains`, `/inbound`, `/suppressions/*`, `/templates`, `/webhooks`, `/sms`.
- **Rate limits:** per-plan daily API quota plus about 60 req/min general. Response headers `x-ratelimit-limit` / `x-ratelimit-remaining`.
- **Webhooks:** events `activity.sent, delivered, soft_bounced, hard_bounced, opened, clicked, unsubscribed, spam_complaint, survey_opened…`. Header `Signature` = HMAC-SHA256(signing secret, raw body).
- **SMTP:** `smtp.mailersend.net`, port 587.

---

## 11. Mailjet (Sinch)

- **What it is:** a hybrid (transactional + marketing) provider from France, part of Sinch. It is GDPR-friendly with EU hosting.
- **Plans:** Free **6,000/mo, 200/day**. Essential ~$15 for 15k. Premium adds automation and segmentation.

**API basics:**
- **Base:** `https://api.mailjet.com/`.
- **Auth:** Basic with `API_KEY:SECRET_KEY`.
- **Send (v3.1):** `POST /v3.1/send` with `{"Messages":[{From:{Email,Name}, To:[...], Subject, TextPart, HTMLPart, TemplateID, TemplateLanguage:true, Variables:{}, CustomID, EventPayload}]}`.
  - Up to **50 messages per call**.
  - `SandboxMode: true` validates without sending.
- **Templating language:** `{{var:name}}`, `{% if %}`.
- **Contacts:** `/v3/REST/contact`, `/contactslist`, `/campaigndraft`.

**Other details:**
- **SMTP:** `in-v3.mailjet.com`, ports 587/465/25/2525. Username is the API key, password is the secret key.
- **Webhooks ("Event API"):** events `sent, open, click, bounce, spam, blocked, unsub`. There is **no signature**; use basic auth in the URL.
- **Inbound:** Parse API.
- **SDK:** `node-mailjet`, `mailjet_rest` (Python).

---

## 12. SparkPost / Bird

- **History:** SparkPost was acquired by MessageBird in 2021, which rebranded as **Bird** in 2024. It is enterprise-grade, high-volume infrastructure (sends a large share of the world's commercial email). Bird has been migrating customers into its own platform and pricing, so check bird.com for current state.
- **Base:** `https://api.sparkpost.com/api/v1/` (EU: `api.eu.sparkpost.com`).
- **Auth:** `Authorization: <API_KEY>` (no "Bearer").
- **Send:** `POST /transmissions` with `{options:{open_tracking, click_tracking, transactional:true, sandbox}, recipients:[{address:{email,name}, substitution_data:{}}], content:{from:{email,name}, subject, html, text} | {template_id}, substitution_data, campaign_id, metadata}`.
- **Other endpoints:** `/templates`, `/sending-domains`, `/suppression-list`, `/events/message`, `/webhooks`, `/metrics`, `/relay-webhooks` (inbound).
- **Webhooks:** batches of events. Auth is basic or OAuth2 (no HMAC).
- **SMTP:** `smtp.sparkpostmail.com`, port 587. Username `SMTP_Injection`, password is the API key.

---

## 13. Other transactional APIs

### Elastic Email
- **Pricing:** among the cheapest. Pay-as-you-go **~$0.09 per 1,000**, plus a marketing plan.
- **API v4:** `https://api.elasticemail.com/v4/`, header `X-ElasticEmail-ApiKey`.
- **Send:** `POST /emails` (bulk, with `Recipients[]`, `Content`) and `POST /emails/transactional`.
- **SMTP:** `smtp.elasticemail.com`, port 2525/587.

### SMTP2GO
- **Plans:** free **1,000/mo (200/day)**, paid ~$15 for 10k.
- **API:** `POST https://api.smtp2go.com/v3/email/send` with the API key header `X-Smtp2go-Api-Key` (or `api_key` in the body). Payload is `{sender, to:[], subject, html_body, text_body, template_id, template_data}`.
- **SMTP:** `mail.smtp2go.com`, ports 2525/587/8025/80/25.
- **Infra:** global servers including India and Singapore.

### ZeptoMail (Zoho)
- **Scope:** **transactional only**; Zoho rejects marketing on it.
- **Pricing:** credits-based, ≈ $2.50 per 10,000 emails (1 credit = 10k). Popular in India.
- **API:** `POST https://api.zeptomail.com/v1.1/email` (region hosts `api.zeptomail.in`, `.eu`, etc.) with header `Authorization: Zoho-enczapikey <token>`.
- **Templates:** `/v1.1/email/template` with `merge_info`.
- **Batch:** `/v1.1/email/batch`.
- **SMTP:** `smtp.zeptomail.com`, port 587/465. Username `emailapikey`, password is the token.
- **Mail Agents:** separate sending configurations per app.

### Loops
- **What it is:** a SaaS-focused email platform for marketing + transactional + event-triggered "loops".
- **Auth:** `Authorization: Bearer`.
- **Transactional:** `POST https://app.loops.so/api/v1/transactional` with `{transactionalId, email, dataVariables}`.
- **Contacts and events:** `/contacts/create|update`, `/events/send`.
- **Pricing:** by contacts (free tier ~1,000 contacts).

### Plunk
- **What it is:** open-source (AGPL) email platform for transactional + marketing + automations, built on top of AWS SES. Self-host or use the cloud.
- **API:** `POST https://api.useplunk.com/v1/send`, `/v1/track` (events).

### SendPulse
- **What it is:** multichannel (email, SMS, web push, chatbots).
- **Auth:** OAuth client-credentials token from `https://api.sendpulse.com/oauth/access_token`.
- **SMTP API:** `POST /smtp/emails`.

### Customer.io
- **What it is:** a lifecycle messaging platform.
- **Track API:** `https://track.customer.io/api/v1/` with Basic `site_id:api_key` for identify/events.
- **App API:** `https://api.customer.io/v1/` with a Bearer App API key.
- **Transactional:** `POST /v1/send/email` with `{transactional_message_id, to, identifiers, message_data}`.
- **Regions:** EU hosts `track-eu.customer.io` and `api-eu.customer.io`.

### Others worth knowing
- **Netcore Cloud (Pepipost):** India-based high-volume email API (`emailapi.netcorecloud.net/v5.1/mail/send`, header `api_key`).
- **Sendloop, Moosend, Mailtrap Email Sending:** Mailtrap is also the go-to **email testing sandbox**. It provides a fake SMTP inbox for dev (`sandbox.smtp.mailtrap.io`) and a sending API at `send.api.mailtrap.io/api/send`.
- **Testing tools:** Mailpit and MailHog (local SMTP catchers), Ethereal (nodemailer fake SMTP), Litmus and Email on Acid (rendering tests), mail-tester.com, GlockApps (inbox placement).

---

## 14. Other marketing platforms

| Platform | Best for | Free tier (approx.) | API |
|---|---|---|---|
| **Kit (ex-ConvertKit)** | Creators / newsletters, paid newsletters, tag-based automations | up to ~10,000 subscribers (Newsletter plan) | v4: `https://api.kit.com/v4/`, header `X-Kit-Api-Key` or OAuth2. Subscribers, tags, forms, sequences, broadcasts. |
| **MailerLite** | SMBs, simple + cheap, great editor | 500–1,000 subs, 12k emails/mo | `https://connect.mailerlite.com/api/`, Bearer token. **120 req/min**. Subscribers, groups, campaigns, automations, webhooks (signed `Signature` HMAC-SHA256). |
| **Klaviyo** | E-commerce (Shopify), deep event data, email + SMS | 250 profiles, 500 emails/mo | `https://a.klaviyo.com/api/`, header `Authorization: Klaviyo-API-Key pk_...` and **`revision: YYYY-MM-DD`** header (date-versioned). JSON:API format. Client API uses public key `company_id`. Events (`/events`), profiles, lists, segments, campaigns, flows. |
| **ActiveCampaign** | Advanced automation + CRM | trial only | `https://<account>.api-us1.com/api/3/`, header `Api-Token`. **5 req/s** per account. Contacts, deals, automations. |
| **Constant Contact** | Small businesses, nonprofits | trial | v3 `https://api.cc.email/v3/`, **OAuth2 only** (PKCE supported). Contacts, lists, email campaigns. |
| **HubSpot** | CRM-centric marketing | free CRM + limited email (2,000 sends/mo, branded) | `https://api.hubapi.com/`, private app token (Bearer). Marketing email "single send" API `/marketing/v3/transactional/single-email/send` needs the Marketing Hub Enterprise or **Transactional Email add-on**. |
| **GetResponse** | Webinars + email + funnels | free up to 500 contacts | `https://api.getresponse.com/v3/`, header `X-Auth-Token: api-key <key>`. ~80 req/min. |
| **AWeber** | Long-time SMB newsletter | free up to 500 subs | v1 `https://api.aweber.com/1.0/`, **OAuth2**. |
| **Moosend** | Cheap automation | trial | `https://api.moosend.com/v3/`, `apikey` query param. |
| **Omnisend** | E-commerce (Shopify/Woo), email + SMS | 250 contacts, 500 emails/mo | `https://api.omnisend.com/v5/` (also v3), header `X-API-KEY`. |
| **Beehiiv / Substack / Ghost** | Newsletter publishing + monetization | free tiers | Beehiiv API v2 (Bearer). Ghost uses Mailgun for bulk sending. |

---

## 15. Mailbox providers as senders

Good for "send as the user" features (CRM, outreach, helpdesk). **Not** for bulk or transactional volume.

### Gmail / Google Workspace
- **Gmail API:** `POST https://gmail.googleapis.com/gmail/v1/users/me/messages/send` with `{ raw: base64url(RFC 2822 message) }`.
  - **OAuth scope:** `https://www.googleapis.com/auth/gmail.send`. This is a sensitive/restricted scope and needs Google app verification, plus a CASA security assessment for restricted scopes.
- **Sending limits:**
  - Consumer Gmail: ~**500 recipients/day**.
  - Workspace: ~**2,000 messages/day**; 10,000 recipients/day; 3,000 external unique recipients/day.
- **SMTP:** `smtp.gmail.com` 587/465. Requires **App Passwords** (2FA on) or OAuth2 (XOAUTH2). "Less secure apps" is gone. Workspace also has an SMTP relay service, `smtp-relay.gmail.com`.

### Microsoft 365 / Outlook
- **Microsoft Graph:** `POST https://graph.microsoft.com/v1.0/me/sendMail` (or `/users/{id}/sendMail`), with permission `Mail.Send` (delegated or application).
- **Exchange Online limits:** **10,000 recipients/day**, 30 messages/min, 500 recipients/message.
- **SMTP AUTH:** `smtp.office365.com` 587. **Basic auth for SMTP AUTH is being retired by Microsoft (2026)**, so use OAuth2 (XOAUTH2) or Graph.
- **High Volume Email (HVE):** a separate preview feature for internal bulk sending.
- **Azure Communication Services Email:** Microsoft's own transactional email API, pay-per-email (≈$0.25/1k + data). Sends via the `azurecomm.net` domain or a custom domain.

### Zoho Mail
`smtp.zoho.com` / `smtp.zoho.in` 587/465. Zoho Mail API with OAuth2.

---

## 16. Self-hosted / open source

| Tool | What it is |
|---|---|
| **Postal** | Full-featured open-source mail server for websites and apps (like a self-hosted Mailgun/SendGrid). Ruby. HTTP API + SMTP, webhooks, click/open tracking. |
| **listmonk** | Fast, single-binary (Go + Postgres) newsletter and mailing-list manager. Sends via any SMTP (pair it with SES for cheap bulk). Has a REST API and transactional templates. |
| **Mautic** | Open-source marketing automation (PHP). Pairs with SES, Mailgun, etc. |
| **Keila, Sendportal, Mailtrain** | Open-source newsletter tools on top of SES/SMTP. |
| **Plunk** | Open-source SES-based platform (see §13). |
| **Postfix / Exim / Haraka / KumoMTA** | Raw MTAs. KumoMTA is a modern high-volume MTA (Lua config). PowerMTA and GreenArrow are commercial on-prem MTAs. |
| **Mail-in-a-Box / Mailcow / Stalwart** | Full mail server suites (mostly for mailboxes, not bulk). |

**Self-hosting reality:** you need clean static IPs with rDNS/PTR, IP warmup, feedback loops, bounce processing, and blocklist monitoring. Port 25 is often blocked on cloud VMs (AWS, GCP, Azure by default). Most teams use self-hosted *management* (listmonk/Mautic) plus a *relay* (SES).

---

## 17. Deliverability fundamentals

### 17.1 DNS authentication
| Record | Purpose | Example |
|---|---|---|
| **SPF** (TXT on the envelope/Return-Path domain) | Which servers may send for the domain. **Max 10 DNS lookups.** One SPF record per name. | `v=spf1 include:amazonses.com include:spf.brevo.com ~all` |
| **DKIM** (TXT/CNAME at `selector._domainkey`) | Cryptographic signature of headers and body. Use 2048-bit keys. | `s1._domainkey.acme.com CNAME s1.domainkey.u123.wl.sendgrid.net` |
| **DMARC** (TXT at `_dmarc`) | Policy when SPF/DKIM fail **alignment** with the visible From domain, plus reporting. | `v=DMARC1; p=none; rua=mailto:dmarc@acme.com; adkim=r; aspf=r` → move to `p=quarantine` then `p=reject` |
| **Return-Path / MAIL FROM / bounce domain** (CNAME/MX) | Gives SPF alignment. | `bounce.acme.com` |
| **Tracking / link-branding CNAME** | Branded click/open tracking domain. Avoids shared-domain reputation. | `links.acme.com CNAME sendgrid.net` |
| **BIMI** (TXT at `default._bimi`) | Brand logo in inbox. Needs DMARC at `quarantine`/`reject` + SVG Tiny PS logo + **VMC** (trademark) or **CMC** certificate for Gmail/Apple. | `v=BIMI1; l=https://acme.com/logo.svg; a=https://acme.com/vmc.pem` |
| **MTA-STS / TLS-RPT** | Enforce TLS on inbound mail to your domain. | — |

**Alignment:** DMARC passes if **either** SPF **or** DKIM passes **and** aligns with the From: domain. For third-party ESPs, **DKIM alignment via a custom DKIM domain** is the reliable path.

### 17.2 Gmail / Yahoo / Microsoft bulk sender requirements
- **Who:** Gmail and Yahoo since Feb 2024 (enforcement ramped through 2025), and Microsoft Outlook.com since May 2025. "Bulk" means ~5,000+ messages/day to Gmail.
- **Authentication:** both **SPF and DKIM**, plus **DMARC** (at least `p=none`) with From-domain **alignment**.
- **One-click unsubscribe** (RFC 8058) for marketing mail:
  ```
  List-Unsubscribe: <https://acme.com/u?t=TOKEN>, <mailto:unsub@acme.com?subject=unsub>
  List-Unsubscribe-Post: List-Unsubscribe=One-Click
  ```
  Honor unsubscribes within **2 days**.
- **Spam complaint rate:** keep it **< 0.1%**, and never reach **0.3%** (as measured in Google Postmaster Tools).
- **Infrastructure:** valid forward/reverse DNS (PTR) and TLS on the sending connection.
- **Content:** RFC 5322 compliant messages. Don't impersonate Gmail From: addresses.
- **Monitoring tools:** Google Postmaster Tools (v2), Microsoft SNDS + JMRP, Yahoo Sender Hub, Validity Everest, GlockApps, MXToolbox, Spamhaus/Barracuda blocklist checks.

### 17.3 Practices
- **Warm up** new domains and IPs gradually (e.g. 50 → 100 → 500 → 1k → 5k/day over 2–6 weeks). Send the most engaged recipients first.
- **Shared vs dedicated IP:** a dedicated IP only helps above ~100k emails/month with consistent volume. Below that, a good shared pool is better.
- **List hygiene:**
  - Use double opt-in.
  - Remove **hard bounces** immediately and suppress repeated soft bounces (e.g. 3–5).
  - Sunset unengaged contacts after 90–180 days.
  - Validate addresses (ZeroBounce, NeverBounce, Kickbox, provider validators).
- **Separate streams:** different subdomains and IP pools for transactional vs marketing.
- **Content:** include a text part, a good text-to-image ratio, no URL shorteners, consistent From name, a physical address in marketing mail, and avoid spammy subject lines. Keep HTML under ~102 KB (Gmail clips larger messages).
- **Open tracking is unreliable:** Apple Mail Privacy Protection (MPP) pre-fetches images and inflates opens. Treat clicks, replies and conversions as the real engagement signal.
- **Bounce codes:** 5.x.x = permanent (hard), 4.x.x = temporary (soft/deferral). Examples: 550 5.1.1 = user unknown, 552 = mailbox full, 421/451 = throttling.

---

## 18. Email events — normalized model

The canonical event set to map every provider onto:

| Normalized | SendGrid | SES | Mailgun | Postmark | Resend | Brevo | Mandrill |
|---|---|---|---|---|---|---|---|
| `queued/accepted` | processed | Send | accepted | — (API 200) | email.sent | request / sent | send |
| `delivered` | delivered | Delivery | delivered | Delivery | email.delivered | delivered | (send) |
| `deferred` | deferred | DeliveryDelay | temporary_fail | — | email.delivery_delayed | deferred | deferral |
| `bounced_hard` | bounce (type=bounce) | Bounce: Permanent | permanent_fail | Bounce (HardBounce) | email.bounced | hardBounce | hard_bounce |
| `bounced_soft` | bounce/blocked | Bounce: Transient | temporary_fail | Bounce (SoftBounce) | email.bounced | softBounce | soft_bounce |
| `rejected/dropped` | dropped | Reject | (failed, reason) | 406 on send | email.failed | blocked / invalid | reject |
| `opened` | open | Open | opened | Open | email.opened | opened / uniqueOpened | open |
| `clicked` | click | Click | clicked | Click | email.clicked | click | click |
| `complained` | spamreport | Complaint | complained | SpamComplaint | email.complained | spam | spam |
| `unsubscribed` | unsubscribe / group_unsubscribe | Subscription | unsubscribed | SubscriptionChange | contact.updated | unsubscribed | unsub |

**Suggested normalized event shape:**
```ts
type EmailEvent = {
  id: string;                 // provider event id or hash
  provider: "sendgrid" | "ses" | "mailgun" | "postmark" | "resend" | "brevo" | "mailchimp" | ...;
  providerMessageId: string;
  internalMessageId?: string; // our id, passed through custom args / metadata / tags
  type: "queued" | "delivered" | "deferred" | "bounced" | "rejected" | "opened" | "clicked" | "complained" | "unsubscribed";
  bounceType?: "hard" | "soft";
  recipient: string;
  timestamp: string;          // ISO
  url?: string;               // for clicks
  userAgent?: string; ip?: string;
  reason?: string; smtpCode?: string;
  raw: unknown;
};
```

**How to pass your own message ID through** so events can be correlated:

| Provider | Field |
|---|---|
| SendGrid | `custom_args` |
| SES | `EmailTags` |
| Mailgun | `v:` variables |
| Postmark | `Metadata` |
| Resend | `tags` or `headers` |
| Brevo | `headers["X-Mailin-custom"]` or `tags` |
| Mandrill | `metadata` |
| Mailjet | `CustomID` / `EventPayload` |

---

## 19. Webhook signature verification cheat-sheet

| Provider | Mechanism | Header / location | Signed payload |
|---|---|---|---|
| SendGrid | **ECDSA P-256, SHA-256** (public key) | `X-Twilio-Email-Event-Webhook-Signature`, `-Timestamp` | `timestamp + rawBody` |
| Mailgun | HMAC-SHA256 (webhook signing key) | body `signature.{timestamp,token,signature}` | `timestamp + token` |
| Resend | Svix HMAC-SHA256 (`whsec_`) | `svix-id`, `svix-timestamp`, `svix-signature` | `${id}.${timestamp}.${rawBody}` |
| Mandrill | HMAC-SHA1, base64 | `X-Mandrill-Signature` | `url + sorted(POST key+value)` |
| MailerSend | HMAC-SHA256 | `Signature` | rawBody |
| MailerLite | HMAC-SHA256 | `Signature` | rawBody |
| Amazon SES (via SNS) | X.509 cert signature | SNS JSON `Signature`, `SigningCertURL` | canonical SNS string |
| Postmark | none — basic auth / IP allowlist | — | — |
| Brevo | none — basic auth / bearer token / IP allowlist | — | — |
| Mailchimp Marketing | none — secret in URL | — | — |
| Mailjet | none — basic auth in URL | — | — |
| SparkPost | basic auth / OAuth2 | — | — |

**Always:**
- Verify using the **raw request body** (not re-serialized JSON).
- Use constant-time comparison.
- Reject stale timestamps (> 5 min).
- De-duplicate by event ID (webhooks are at-least-once).
- Return 2xx fast and process asynchronously.

---

## 20. Legal & compliance

| Law | Region | Key requirements |
|---|---|---|
| **CAN-SPAM** | USA | No deceptive headers or subjects, identify ads, **physical postal address**, working opt-out honored within **10 business days**. Opt-out (no prior consent) is allowed. |
| **GDPR + ePrivacy** | EU/UK | **Opt-in consent** (or soft opt-in for existing customers in the UK under PECR), proof of consent, right to erasure, a DPA with the ESP, lawful transfer (SCCs / EU-US Data Privacy Framework). |
| **CASL** | Canada | Express or implied consent, sender identification, unsubscribe within 10 days. Strict penalties. |
| **DPDP Act 2023 (+ Rules 2025)** | India | Free, specific, informed consent, a notice of purpose, an easy withdrawal option, data principal rights, Consent Managers. Phased enforcement. |
| **Spam Act 2003** | Australia | Consent, identification, unsubscribe within 5 business days. |
| **LGPD** | Brazil | Consent / legal basis similar to GDPR. |

Transactional mail is generally exempt from marketing consent rules, **but** adding promotional content to it can make it "commercial".

---

## 21. Design notes for a unified "allmail" abstraction

### 21.1 Core interface
```ts
interface EmailProvider {
  name: string;
  send(msg: EmailMessage, opts?: { idempotencyKey?: string }): Promise<SendResult>;
  sendBatch?(msgs: EmailMessage[]): Promise<SendResult[]>;
  verifyWebhook(req: { headers: Record<string,string>; rawBody: Buffer; url: string }): boolean;
  parseWebhook(rawBody: Buffer, headers: Record<string,string>): EmailEvent[];
  // optional: domains, suppressions, templates, contacts, campaigns
}

type Address = { email: string; name?: string };
type EmailMessage = {
  from: Address; to: Address[]; cc?: Address[]; bcc?: Address[]; replyTo?: Address;
  subject: string; html?: string; text?: string;
  templateId?: string; templateData?: Record<string, unknown>;   // provider-specific ids
  headers?: Record<string, string>;
  attachments?: { filename: string; content: Buffer | string; contentType?: string; cid?: string }[];
  tags?: string[]; metadata?: Record<string, string>;            // map to custom_args / v: / Metadata / tags
  scheduledAt?: Date;
  stream?: "transactional" | "marketing";
  unsubscribeUrl?: string;                                        // → List-Unsubscribe + -Post headers
};
type SendResult = { provider: string; providerMessageId: string; accepted: string[]; rejected: { email: string; reason: string }[] };
```

### 21.2 Provider mapping quirks to handle
- **Content type:** Mailgun uses **form-data**, everyone else JSON. Mandrill puts the key in the body. SES needs SigV4 (use the SDK).
- **Recipients per call:**
  - SES and Postmark: 50 recipients per message.
  - Resend: 50 `to` per email, 100 per batch.
  - SendGrid: 1,000 personalizations.
  - Mailgun: 1,000 batch recipients.
  - Mailjet: 50 messages per call.
  - Postmark: 500 per batch.
- **Size limits:** SES 40 MB, SendGrid 30 MB, Postmark 10 MB, Mailgun 25 MB, Resend 40 MB.
- **Template syntax differs:**
  - Handlebars: SendGrid, SES, Mailgun.
  - Mustachio: Postmark.
  - Jinja-like: Brevo.
  - `*|MERGE|*`: Mailchimp.
  - `{{var:x}}`: Mailjet.

  Prefer rendering HTML **yourself** (React Email / MJML / Handlebars) and sending raw HTML, which keeps providers swappable.
- **Success codes:** SendGrid/MailerSend return 202 with the ID in a header; others return 200/201 with the ID in the body.
- **Message IDs:** Postmark/Resend return UUIDs. SES returns its own ID. Mailgun returns `<...@domain>`, so strip the angle brackets.

### 21.3 Reliability patterns
- **Failover chain:** primary → secondary provider on 5xx/timeouts/429. Never retry on 4xx validation errors. Use exponential backoff with jitter.
- **Idempotency:** generate your own `messageId` and pass it as the idempotency key (Resend, Brevo) or as metadata. Dedupe in your DB before retrying.
- **Global suppression list** in your own DB (hard bounces, complaints, unsubscribes), checked **before** every send, regardless of provider.
- **Queue all sends** (BullMQ, SQS, Cloud Tasks). Respect per-provider rate limits with a token bucket.
- **Store outbound logs** (to, subject, provider, providerMessageId, status, timestamps). Update status from webhooks.
- **Secrets:** use per-environment keys with minimum scopes (SendGrid scoped keys, Resend sending-only keys, Postmark server tokens), and rotate them.
- **Dev:** route to Mailpit or Mailtrap in development. Never send real mail from test environments.
- **Libraries:** Node `nodemailer` (SMTP for any provider + transports for SES), Python `smtplib` / `django-anymail` (unified ESP backend — a great reference for mapping quirks), PHP Symfony Mailer / Laravel Mail (built-in drivers for SES, Postmark, Mailgun, Resend, Brevo…), Ruby ActionMailer.

### 21.4 Env-var naming suggestion
```
MAILCHIMP_API_KEY=xxxx-us21          MANDRILL_API_KEY=md-xxxx
BREVO_API_KEY=xkeysib-xxxx           BREVO_SMTP_LOGIN= / BREVO_SMTP_KEY=
SENDGRID_API_KEY=SG.xxxx             SENDGRID_WEBHOOK_PUBLIC_KEY=
AWS_REGION=ap-south-1                AWS_ACCESS_KEY_ID= / AWS_SECRET_ACCESS_KEY=   SES_CONFIGURATION_SET=
MAILGUN_API_KEY=                     MAILGUN_DOMAIN=mg.acme.com   MAILGUN_REGION=us|eu   MAILGUN_WEBHOOK_SIGNING_KEY=
POSTMARK_SERVER_TOKEN=               POSTMARK_MESSAGE_STREAM=outbound
RESEND_API_KEY=re_xxxx               RESEND_WEBHOOK_SECRET=whsec_xxxx
MAILERSEND_API_KEY=                  MAILJET_API_KEY= / MAILJET_SECRET_KEY=
```

---

## 22. Choosing a provider — decision guide

| Need | Good picks |
|---|---|
| Cheapest at high volume, OK with DIY | **Amazon SES** (+ listmonk for newsletters) |
| Best transactional deliverability, simple | **Postmark** |
| Modern DX, Next.js/React, quick start | **Resend** |
| Generous free tier for side projects | **Brevo** (300/day), **Mailjet** (6k/mo), **Resend** (3k/mo), **SMTP2GO** (1k/mo) |
| One tool for marketing + transactional + SMS/WhatsApp, cheap for big lists | **Brevo** |
| Classic marketing campaigns, templates, brand recognition | **Mailchimp** (expensive as lists grow) |
| E-commerce marketing (Shopify) | **Klaviyo**, Omnisend |
| Creators / newsletters | **Kit**, beehiiv, MailerLite |
| Powerful inbound parsing / routing | **Mailgun**, Postmark, SendGrid Inbound Parse, SES |
| Enterprise scale, mature tooling | **SendGrid**, SparkPost/Bird, SES |
| India-based / INR-friendly transactional | **ZeptoMail**, Netcore, SES `ap-south-1` |
| EU data residency | Mailjet, Brevo, Mailgun EU, SendGrid EU, SES eu-* regions |

---

### Sources (pricing verification, Oct 2026)
- Mailchimp pricing: https://tinycommand.com/blogs/mailchimp-pricing-explained · https://automationatlas.io/answers/mailchimp-pricing-explained-2026/
- Brevo pricing: https://automationatlas.io/answers/brevo-pricing-explained-2026/ · https://dreamlit.ai/blog/brevo-review
- SendGrid free-plan retirement: https://dreamlit.ai/blog/best-sendgrid-alternatives · https://automationatlas.io/answers/sendgrid-pricing-explained-2026/
- Resend pricing: https://automationatlas.io/answers/resend-pricing-explained-2026/ · https://www.usecarly.com/blog/resend-pricing/
- MailerSend pricing: https://www.mailersend.com/pricing · https://toolradar.com/tools/mailersend/pricing
- Amazon SES pricing: https://www.sequenzy.com/pricing/amazon-ses · https://aws.amazon.com/ses/pricing/

Official docs to consult for details:
- mailchimp.com/developer
- developers.brevo.com
- www.twilio.com/docs/sendgrid
- docs.aws.amazon.com/ses
- documentation.mailgun.com
- postmarkapp.com/developer
- resend.com/docs
- developers.mailersend.com
- dev.mailjet.com
- developers.sparkpost.com
- support.google.com/a/answer/81126 (Gmail sender guidelines)
