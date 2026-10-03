# QuestHat web parity audit — iOS Build 119

Reference reviewed: `apps/mobile/src/App.tsx` and the Build 119 iOS project configuration. The iOS project is read-only for this effort.

## Shared production contracts

- Supabase Auth and the existing production Supabase schema remain authoritative.
- Web and Build 119 already share quest, profile, membership, messaging, friend, notification, invitation, discovery, reporting, location-access, and media records.
- Existing IDs, enum values, message privacy prefixes, media URLs, and RPC signatures must remain backward-compatible.
- Browser-only behavior belongs in web components or adapters. No Build 119 source, assets, configuration, or dependencies may be changed.

## Screen and feature checklist

| Area | Build 119 behavior | Web audit | Status |
| --- | --- | --- | --- |
| Authentication | Email/password, social providers, recovery, EULA, onboarding | Present on home/auth callback/reset flows | Covered; visual polish remains |
| Home discovery | Search, categories, list/map, location, quest cards | Present | Covered; visual comparison remains |
| Create Quest | Category/title suggestions, seeded and uploaded media, schedule, location privacy, group/skill/join controls | Present | Covered; visual parity needs a dedicated pass |
| Quest details | Media, host, guests, approvals, location access, comments/DM, save/join, reports | Present | Covered |
| Presence check-in | Time-windowed, proximity-verified check-in and participant presence | Missing at audit start | Implemented in web parity pass |
| Host coordination | Pending-request/location checklist and per-quest reminder controls | Missing at audit start | Pending-request checklist and reminders implemented; bulk location-share checklist remains |
| Calendar | Add or update a quest in the device calendar | Native EventKit behavior | Browser equivalent pending |
| Saved quests | Saved list | Present | Covered |
| Your quests | Active/completed, hosted/joined/pending, search/sort | Present | Covered; card styling differs |
| Inbox | Quest and private conversations, search, invitations, realtime refresh | Present | Covered |
| People discovery | Opt-in filters, message, multi-select invitations | Present on quest details and settings | Covered |
| Profiles | Own/other profile, hosted/joined history, friends, reports | Present | Covered |
| Settings | Profile, account, preferences, notifications, friends, blocked users, lifecycle, support/legal | Present | Covered; hierarchy/styling differs |
| Notifications | Delivered notifications, derived fallback, unread state, navigation | Present | Covered |
| Maps/location | Browser geolocation, Apple location search, Leaflet discovery map, exact-location privacy | Present | Browser-native equivalent covered |
| Native push/live activity | APNs/Android push and native live activity | Not directly reproducible in standard web | Preserve underlying notification UI/data; native-only difference |

## Remaining acceptance work

1. Finish the host bulk location-share checklist for approved guests whose exact meetup access is still withheld.
2. Complete a route-by-route visual parity pass, starting with Create Quest, quest details, Your Quests, Inbox, Settings, and profiles.
3. Exercise authenticated production-like test users through signup/login, onboarding, creation, join approval, messaging, invitations, notifications, check-in, and account lifecycle.
4. Verify loading, empty, failure, expired-session, missing-media, and denied-location states at mobile, tablet, and desktop widths.
