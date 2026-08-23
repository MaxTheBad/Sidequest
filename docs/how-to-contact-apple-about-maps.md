# How to request Apple Maps storage permission

Apple's standard developer-support form is the practical first contact. Because the request concerns both implementation and an exception under Attachment 6, ask Developer Support to route the contractual portion to the Apple Maps team or Developer Relations Legal. Do not rely on a public forum answer as written permission.

## Submit the request

1. Sign in with the Apple Developer account for **Anlvio LLC** at [Apple Developer Support](https://developer.apple.com/support/).
2. Under **Tell us how we can help**, choose **Contact us by phone or email**. If the form offers product categories, choose **Maps and Location**, **MapKit**, **MapKit JS**, or **Maps Server API**—whichever is available.
3. If that path does not provide an email form, open [Code-level Support](https://developer.apple.com/support/technical/) and choose **Start your request**.
4. Use this subject:

   `Request for written guidance under Apple Maps Attachment 6 §2.5 — QuestHat`

5. Paste the text from `docs/apple-maps-data-storage-request.md`.
6. Add these identifiers near the top of the message:

   - Legal entity: **Anlvio LLC**
   - Product: **QuestHat**
   - Apple bundle ID: **com.questhat.app**
   - Website: **https://questhat.com**
   - Apple Developer Team ID: copy it from the Membership page; do not post it publicly.
   - Maps ID: copy the identifier associated with the QuestHat Maps key.

7. Add this routing sentence before the closing:

   `Because this request asks for express written permission under Attachment 6, section 2.5—not only code-level assistance—please route it to the Apple Maps licensing team or Developer Relations Legal if Developer Technical Support cannot provide binding written authorization.`

8. Save the case number and Apple's complete response. If support answers only with documentation or says it cannot interpret the agreement, reply once asking for escalation rather than treating that as approval.

## What counts as approval

Treat the request as approved only if Apple clearly confirms in writing that QuestHat may retain the user-confirmed Apple-derived fields described in the request. Silence, an automated reply, a forum response, or successful API behavior is not permission.

Until then, QuestHat's compliant fallback is:

- Apple results stay temporary and appear with an Apple map.
- QuestHat retains only the Apple Place ID, which Apple's Place ID documentation says is exempt from Attachment 6 section 2.5 storage restrictions.
- The current address and coordinates are retrieved by that ID when needed and otherwise remain temporary.
- QuestHat does not persist Apple's formatted address or returned coordinates; a host may alternatively choose a one-time device-location pin.
