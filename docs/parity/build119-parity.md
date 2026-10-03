# QuestHat Build 119 Web Parity

CURRENT SCREEN: Home / Discover

NEXT SCREEN: Create Quest

| Screen | iOS inspected | iOS screenshot | Web implemented | Visual checked | Functional checked | API checked | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Home / Discover | Yes | `build119/home.png` | In progress | In progress | In progress | Yes — existing Supabase feed/filter/location contracts retained | In progress |
| Create Quest | Partial prior inspection | Pending complete reference set | Partial prior implementation | No | No | Partial | Not started in this sequence |
| Inbox | Partial prior inspection | Pending | Partial prior implementation | No | No | Partial | Not started in this sequence |
| Quests | Partial prior inspection | Pending | Partial prior implementation | No | No | Partial | Not started in this sequence |

## Completed screens

None yet. A screen is not complete until its golden-master comparison and interactions are verified.

## Known blockers

- Local web login cannot pass Turnstile because the local environment intentionally has no public Turnstile site key. Authenticated comparison uses the existing shared production account/session; no credentials are stored here.
- Existing mobile/iOS working-tree changes predate this parity sequence and must remain untouched.

## Home discrepancy checklist

- Removed obsolete mobile marketing hero and Filter Quests hierarchy.
- Added Build 119 search wording, category rail, Find People card, Fresh Picks heading, result count, and mobile shell treatment.
- Reused existing list/map state, category filtering, quest cards, location calculations, notification route, bottom navigation, and Supabase data.
- Remaining verification: authenticated mobile web screenshot with the same account/data, list/map interaction, search/category interaction, and final card spacing comparison.
