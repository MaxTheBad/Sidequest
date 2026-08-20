# QuestHat platform privacy checklist

Last reviewed: 2026-08-20

This checklist keeps store and developer-console answers consistent with the public Privacy Policy and the shipping app. Re-check it whenever data collection, SDKs, permissions, authentication providers, or social publishing changes.

## Public URLs

- Privacy Policy: `https://questhat.com/privacy`
- Terms of Use: `https://questhat.com/terms`
- Account deletion and social disconnection: `https://questhat.com/delete-account`
- Support: `https://questhat.com/support`
- Meta deletion callback: `https://questhat.com/api/facebook-data-deletion`
- Privacy/support contact: `support@questhat.com`

## Apple App Store Connect

The App Privacy answers and the app privacy manifest should disclose these data types when the corresponding feature ships:

| Apple data type | Linked to user | Tracking | Primary purpose |
| --- | --- | --- | --- |
| Name | Yes | No | App functionality |
| Email address | Yes | No | App functionality; developer marketing only for opted-in users |
| Coarse location | Yes | No | App functionality and product personalization |
| Emails or text messages | Yes | No | App functionality |
| Photos or videos | Yes | No | App functionality |
| Audio data | Yes | No | App functionality |
| Customer support | Yes | No | App functionality |
| Other user content | Yes | No | App functionality |
| User ID | Yes | No | App functionality |
| Device ID | Yes | No | App functionality, including push delivery |
| Product interaction | Yes | No | App functionality and security |

Precise device location is currently processed and cached on-device for distance and safety checks. Reclassify it as collected if a future build transmits or retains device coordinates off-device. Exact meetup locations submitted by hosts are stored as user content with restricted access.

- Set Privacy Policy URL to the public Privacy Policy.
- Set Privacy Choices URL to the account-deletion page.
- Keep `Tracking` set to No unless QuestHat begins cross-company advertising tracking.
- Keep Sign in with Apple available anywhere other third-party primary-account login is offered on iOS.
- Account deletion must remain available in-app.
- **Open implementation item:** replace the current manual Sign in with Apple disconnect guidance with server-side Apple token revocation. Apple expects the token to be revoked when an Apple-authenticated account is deleted.
- If the updated Terms require renewed acceptance, release the new EULA version, database acceptance version, web gate, and mobile build together. Do not change only the server version because older mobile builds would be unable to accept it.

## Google Play Data safety

Complete the Data safety form even for testing tracks where Google requires it. Declare collection conservatively and consistently with the app:

- Personal info: name, email address, user IDs, and optional profile information.
- Location: approximate location. Also declare precise location if Play treats host-submitted exact meetup locations as precise location or if device coordinates are ever transmitted off-device.
- Messages: other in-app messages.
- Photos and videos: photos and videos.
- Audio files: voice or sound recordings.
- App activity: user-generated content and app interactions used for functionality/security.
- App info and performance: diagnostics actually collected by the shipping SDK set.
- Device or other IDs: push/Firebase installation or device identifiers.
- Purposes: app functionality, account management, fraud prevention/security/compliance, personalization, developer communications, and advertising/marketing only for opted-in first-party marketing.
- Data is encrypted in transit.
- Users can request deletion in-app and at the public account-deletion URL.
- Review every included SDK before answering whether data is shared. Service-provider transfers may qualify for Google exceptions, but optional user-directed publishing to Meta or X must match the final UI and the current Data safety definitions.

## Meta: Facebook and Instagram

- Configure the Privacy Policy, Terms, data-deletion instructions, and signed data-deletion callback URLs in the Meta app dashboard.
- Request only permissions used by shipping features. Consumer Facebook Login is separate from Page/Instagram professional publishing permissions.
- For Instagram publishing, use the official Instagram API and limit eligible accounts to the account types supported by Meta.
- Before each publish, show the exact content and destination and require an explicit user action.
- Store no Meta password. Protect app secrets and user/Page tokens server-side; never ship them in a client bundle.
- Delete or disable connected tokens and Meta-derived account data on disconnection, account deletion, expiry, or a valid Meta deletion request.
- Complete Meta App Review, business verification, Data Use Checkup, and data-handling questions for every requested advanced permission before production use.

## X

- Keep the X developer use-case description accurate and update it before materially changing the integration.
- Use only the official X API. Do not use browser automation or scrape X.
- Login and publishing permissions must be separate and clear. Authentication alone is not consent to publish.
- Before each post, show the exact text/media, destination account, and any location information, then require express consent.
- Do not add hashtags, mentions, links, or location without previewing them.
- Do not bulk post, post substantially duplicative content across accounts, manipulate engagement, or bypass API/rate limits.
- Provide logout/disconnection and honor revocation. Protect credentials and tokens server-side.
- Update or delete stored X content when it is deleted, restricted, or changed on X; honor valid user/X deletion requests within 24 hours when required.
- Do not use X data for surveillance, sensitive-trait inference, off-X matching without express opt-in, or AI-model training.

## Release gate for social publishing

Do not enable Facebook, Instagram, or X publishing in production until all of the following are true:

1. The user sees a per-platform connection screen describing requested permissions.
2. The composer previews the exact content and every selected destination.
3. Each publish is initiated by an explicit user action; no background or surprise posting.
4. Tokens are encrypted or otherwise protected server-side and are never logged or included in mobile/web clients.
5. Disconnect deletes or disables tokens and prevents future publishing.
6. Account deletion removes connected-account records and tokens.
7. Platform permission review/approval is complete.
8. App Store App Privacy, Google Play Data safety, Meta settings, X app settings, and the public policy all match the shipping behavior.
