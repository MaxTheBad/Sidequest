# Email Branding And Deliverability

QuestHat email branding has two parts:

1. The message itself should include a branded logo and clean transactional HTML.
2. The sending domain should be authenticated so mail providers trust the message.

## What The App Already Does

- The welcome email now includes the QuestHat logo in the body.
- The moderation alert email also includes the QuestHat logo in the body.
- Both messages use multipart MIME with plain text and HTML.
- Both messages now include a `Reply-To` address separate from the sender.

## What Still Needs DNS / Mail-Provider Setup

To reduce spam-folder delivery, publish and align the following for the sender domain:

- SPF
- DKIM
- DMARC

The practical sender setup should look like:

- `From:` `QuestHat <no-reply@questhat.com>`
- authenticated SMTP user on the same domain
- optional `Reply-To:` `support@questhat.com`

If those identities do not align, inbox providers are much more likely to treat mail as suspicious.

## BIMI

If you want the QuestHat logo to appear as a provider-level brand mark in supporting inboxes, BIMI is the relevant standard.

BIMI usually requires:

- a square, brand-approved SVG logo file
- a strong DMARC policy
- a Verified Mark Certificate for most major providers

The existing `public/questhat-logo.png` is suitable for the email body and is already square, but it is not by itself a BIMI asset.

## Spam-Folder Reality Check

Code can help, but inbox placement is mostly driven by:

- domain authentication
- sender reputation
- complaint rate
- bounce rate
- whether the message is transactional or promotional

For QuestHat, the best practical move is:

- keep transaction emails short and useful
- send from the same domain you authenticate
- avoid spammy subject lines and marketing-heavy wording in account emails
- keep promotional mail separate from transactional mail

## Recommended Next Step

If you want, the next thing to do is publish the DNS records at your DNS host and then verify them with a mail deliverability test.
