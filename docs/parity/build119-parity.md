# QuestHat Build 119 Web Parity

CURRENT SCREEN: Create Quest

NEXT SCREEN: Create Quest continued

| Screen | iOS inspected | iOS screenshot | Web implemented | Visual checked | Functional checked | API checked | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Home / Discover | Yes | `build119/home.png` | In progress | In progress | In progress | Yes — existing Supabase feed/filter/location contracts retained | In progress |
| Create Quest | Yes — Build 119 Create Quest source/category/date/location/advanced/publish sections inspected in `apps/mobile/src/App.tsx` | `build119/create-category-row.png`, `build119/create-category-picker.png`, `build119/create-quest-after-rebuild.png` | Current focused rebuild pass complete for visible legacy form removal | Web screenshots captured: `web/create-quest-after-rebuild.png`, `web/create-category-picker-after-rebuild.png` | Category More modal, title chips, cover Add photo/suggestions, date/time cards, time-flexible toggle, Where mode switch, Make it yours toggle, and publish panel wired to existing state | Partial — existing category/hobby, media upload, location search, Turnstile, and createQuest submit paths retained | In progress — continue Create Quest comparison before Inbox |
| Inbox | Partial prior inspection | Pending | Partial prior implementation | No | No | Partial | Not started in this sequence |
| Quests | Partial prior inspection | Pending | Partial prior implementation | No | No | Partial | Not started in this sequence |

## Completed screens

None yet. A screen is not complete until its golden-master comparison and interactions are verified.

## Known blockers

- Local web login cannot pass Turnstile because the local environment intentionally has no public Turnstile site key. Authenticated comparison uses the existing shared production account/session; no credentials are stored here.
- Existing mobile/iOS working-tree changes predate this parity sequence and must remain untouched.

## Create Quest discrepancy checklist

- Category icons: traced Build 119 top-row definitions from `apps/mobile/src/App.tsx` and mapped web to the same Ionicons references. Web now renders inline Ionicons SVGs so outline strokes display correctly.
- Removed visible legacy `CATEGORY * / Select a category`, old extra suggestion/category block, old `DATE AND START TIME *`, old `Remote` label, old Location/Meeting Type visual structure, and sticky white `Post quest` dock.
- Rebuilt Create Quest visible order to match Build 119: category cards → Quest title → title input → suggested title chips → Add a cover photo → photo suggestions → When cards/toggle → Where cards/search/privacy → Make it yours → verification → in-content publish panel.
- More picker: added Build 119-style dark modal with dimmed backdrop, header/subtitle, close control, two-column category grid, selected state, and immediate close on category selection.
- Remaining verification: continue full Create Quest visual comparison for lower advanced states and interaction checks for date picker, location search results, virtual selected, Make it yours expanded details, validation, and submit state.

## Home discrepancy checklist

- Removed obsolete mobile marketing hero and Filter Quests hierarchy.
- Added Build 119 search wording, category rail, Find People card, Fresh Picks heading, result count, and mobile shell treatment.
- Reused existing list/map state, category filtering, quest cards, location calculations, notification route, bottom navigation, and Supabase data.
- Remaining verification: authenticated mobile web screenshot with the same account/data, list/map interaction, search/category interaction, and final card spacing comparison.
