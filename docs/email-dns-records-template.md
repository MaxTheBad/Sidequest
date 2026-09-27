# QuestHat Email DNS Records

Use these records for `questhat.com` in Cloudflare DNS.

QuestHat currently uses Zoho SMTP for outbound mail.

## 1. SPF

Create one TXT record at the root domain:

- Name: `@`
- Type: `TXT`
- Content: `v=spf1 include:zoho.com -all`

Zoho’s SPF guidance is to authorize its mail servers for the sending domain. If Zoho shows a different SPF include for your tenant or region, use the value Zoho publishes in the Admin Console.

## 2. DKIM

Create the DKIM record(s) exactly as Zoho gives them in the Admin Console.

Zoho will return either:

- a CNAME target such as `selector1._domainkey.questhat.com -> selector1.provider.example`
- or a TXT record under a selector host such as `selector1._domainkey`

Do not change the selector name or value.

## 3. DMARC

Create one TXT record:

- Name: `_dmarc`
- Type: `TXT`
- Content:

```txt
v=DMARC1; p=quarantine; adkim=s; aspf=s; rua=mailto:dmarc@questhat.com; fo=1
```

Once delivery is stable, you can move from `p=quarantine` to `p=reject`.

## 4. BIMI

BIMI is optional. It helps some inboxes show your logo, but it is not the main fix for spam placement.

If you want BIMI later, you will need:

- a square SVG Tiny PS logo file
- a strong DMARC policy
- often a Verified Mark Certificate

Suggested record:

- Name: `default._bimi`
- Type: `TXT`
- Content:

```txt
v=BIMI1; l=https://questhat.com/bimi/questhat.svg; a=
```

Only publish that after the SVG is ready and validated for BIMI use.

## 5. Sender Shape That Helps Deliverability

Use:

- From: `QuestHat <no-reply@questhat.com>`
- Reply-To: `support@questhat.com`

Keep the same domain in the authenticated SMTP server and the visible `From` address so SPF, DKIM, and DMARC can align.

## 6. What To Check After Publishing

- SPF passes
- DKIM passes
- DMARC passes
- message body logo loads
- inbox placement improves after a small warm-up period
