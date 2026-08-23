# Apple Maps implementation clarification request

**To:** Apple Developer Technical Support / Apple Maps team<br>
**From:** Anlvio LLC, developer of QuestHat<br>
**Subject:** Request for written permission or guidance for persisting user-confirmed meetup locations

Hello,

Anlvio LLC is building QuestHat, a consumer social-planning application that helps adults create and join real-world activities. QuestHat is not used for fleet management, dispatch, asset tracking, route optimization, insurance-risk assessment, emergency response, or autonomous vehicle control.

We would like to use:

- native MapKit and `MKLocalSearch` in our iOS application;
- MapKit JS in our website and Android application; and
- Apple Maps Server API for user-initiated place and address searches where appropriate.

Apple search results would always be presented with the corresponding Apple map, with Apple and provider attribution unobscured. Searches would occur only after an explicit user action. We would not scrape results, bulk-download Map Data, create a location database from Apple results, train models, resell Map Data, or use Apple Maps to improve a competing mapping service.

QuestHat hosts need to publish a meetup location that remains available until their activity is completed or deleted. Approved attendees may need that location later for directions and for a proximity-based arrival check-in. We understand Attachment 6, section 2.5 of the Apple Developer Program License Agreement generally limits caching or storing Map Data to temporary and limited use unless Apple expressly permits otherwise in writing.

We also understand Apple's Place ID documentation states that Place IDs are exempt from the storage restrictions in Attachment 6, section 2.5. Our launch implementation therefore retains only the selected Place ID and the host's own search text, then retrieves current place details by ID when needed. Apple-formatted addresses and returned coordinates remain transient.

Could Apple please clarify or authorize the following narrow implementation?

1. A host explicitly searches for and selects a place on an Apple map.
2. QuestHat asks the host to review and affirmatively confirm that location for their meetup.
3. QuestHat stores only the confirmed display name, postal address, latitude, longitude, Apple Place ID if required, and applicable attribution—not the surrounding result set or unrelated place metadata.
4. The stored location is used only for that host's QuestHat meetup, is protected according to the host's visibility choice, and is deleted when the meetup/account is deleted or retention is no longer necessary.
5. Any stored Apple-derived location is displayed only with a corresponding Apple map. It is not displayed on OpenStreetMap, MapLibre, Leaflet, Google Maps, or another map provider.
6. Current attendee coordinates used for proximity check-in are processed transiently and are not stored; only check-in status and time are retained.

If persistent storage is not permitted, would Apple consider the following compliant: QuestHat stores only address text independently entered by the host, performs a fresh Apple geocode when the location must be displayed or used, shows the result on the corresponding Apple map, uses returned coordinates transiently, and immediately discards them after the interaction?

Please let us know whether either approach is permitted and whether specific attribution, retention, deletion, Place ID, privacy disclosure, or technical requirements apply. We would appreciate written guidance that we can retain with our compliance records.

Thank you,

Anlvio LLC<br>
QuestHat<br>
support@questhat.com<br>
https://questhat.com
