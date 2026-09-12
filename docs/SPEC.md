# Trippy — Product specification

Trippy is a collaborative trip planner delivered as a progressive web app. This document is the
source of truth for scope and behaviour. Sections are grouped by product area; each lists the
behaviours the app implements, edge cases, and the data it relies on. Terms in **bold** are
entity names that map to database tables (see `src/server/db/schema`).

## 1. Principles

1. **One document, four lifecycle states.** A **trip** is a single document that moves through
   *plan → travel → journal → guide*. All states share the same tables; only default sections
   and visibility differ.
2. **Free for collaborators.** Anyone invited can view/edit without a paid account. There is no
   paid tier; usage is bounded by free API allowances (Google Maps, Neon, Vercel Blob, Pusher).
3. **Google Maps content stays on Google maps.** Places data is displayed only on a Google map
   or with no map. Place IDs are stored indefinitely; coordinates are refreshed after 30 days;
   ratings, opening hours and photos are fetched live and never persisted.
4. **Works on a phone first.** Every screen is designed for ~390 px width, installed as a PWA,
   with a desktop split-pane layout as the enhancement.
5. **Graceful degradation.** Every optional integration (realtime, email, push, AI) is feature
   flagged by the presence of its environment variables.

## 2. Accounts, profiles and social graph

- Sign in with Google (OAuth 2.0 client from Google Cloud). Sessions live in the database with a
  five-minute signed cookie cache. Sign-out revokes the session server-side.
- On first sign-in a **user_profile** is created with a unique handle derived from the name.
- Profile fields: handle, display name, avatar (from Google or uploaded), bio, home currency,
  home destination, public/private toggle, theme (system/light/dark), notification toggles.
- **Friends** are symmetric: A requests, B accepts (`friendship` rows). **Follows** are
  asymmetric and used for guides. Friends unlock trips with *Friends* visibility.
- Public profile at `/u/[handle]`: public trips, guides, "places visited" map, stats.
- Delete account: cascades to trips owned (after transferring ownership where other editors
  exist), memberships, comments, expenses, photos. Confirmation requires typing the handle.

## 3. Destinations and the "Where are you going?" picker

- Search field with placeholder "e.g. Paris, Tokyo, Hawaii". Empty query shows
  **Popular destinations** (top by popularity). Typing shows ranked results with a name, a badge
  (**Country / Region / City / Island / Neighborhood / Park**) and a grey subtitle of the
  ancestor chain ("French Riviera - Cote d'Azur, France").
- Ranking: prefix match on name (1.0) > alternate name (0.9) > fuzzy trigram (0.6) > ancestor
  name match (0.35), multiplied by popularity and a kind boost (Country 1.15, Region 1.10,
  Island 1.05, City 1.0, Neighborhood 0.8). Children of a matched region therefore appear
  below the region itself.
- Source of truth is the **destinations** table (curated seed + optional GeoNames/Wikidata
  enrichment). When fewer than four local results exist and a server key is configured, Google
  Places Autocomplete (`(regions)` collection, session token) supplies provisional rows; picking
  one performs a single Place Details call and *promotes* it into the table permanently.
- A trip has one or more destinations in order ("+ Add more"). Each renders as a card with a hero
  photo (Wikipedia/Commons image resolved lazily and cached with credit) and a remove button.
- The union of destination bounding boxes sets the map's initial viewport and biases place search.
- Destination pages `/d/[slug]` list public trips and guides for that destination.

## 4. Trip creation

1. **Chooser**: three cards — *Plan your trip* (choose places and build itineraries), *Write a
   travel guide* (share tips and inspire others), *Start a trip journal* (save memories, notes,
   photos). Selecting sets `trip.kind`.
2. **Destinations** (section 3). Continue is disabled until at least one destination is chosen.
3. **Dates**: date-range picker or "I don't have dates yet" with a number of days (1–60).
4. **Name & cover**: name pre-filled from destinations ("Trip to Paris and Nice"), cover photo
   defaults to the first destination's hero; upload optional.
5. Creating the trip also creates: the owner **trip_member**, default **trip_sections**
   (Notes, Reservations, Places, Itinerary, Budget, Checklists; Journal for journal kind),
   a default "Places to visit" **trip_list**, and one **itinerary_day** per day.

Progress bar and back navigation across steps; state persists across reloads (session storage).

## 5. Trip workspace

- **Desktop**: left scrollable document with sections; right sticky Google map (≥ 1024 px).
- **Mobile**: tabs *Overview*, *Itinerary*, *Explore*, *Budget*; a floating pill toggles
  *List ↔ Map*; a floating "+" opens the add menu (Place, Note, Checklist, Expense, Reservation,
  Lodging).
- Header: cover, name, dates, destinations, members' avatars with presence dots, Share button,
  overflow menu (Settings, Print, Export, Duplicate, Convert to guide/journal, Archive, Delete).
- Sections are collapsible and reorderable (`trip_sections.position`); custom sections can be
  added (e.g. "Day-trip ideas") and hold places or notes.
- **Compact view** toggle for the itinerary (one line per stop, no photos).
- Trip settings: name, dates, day count, destinations, currency, default travel mode,
  visibility, members and roles, invite links, danger zone (archive, delete).

Changing dates never reorders days: days keep their content and shift with the new start date.
Shortening a trip moves items from removed days to an "Unscheduled" list; lengthening appends
empty days.

## 6. Places and lists

- Search (Google Places Autocomplete biased to the trip viewport; Text Search for categories).
  Results show name, type, address; selecting fetches details and adds a **place** row (cached
  identity) plus a **trip_place** in the active list.
- Place card: photo (live), name, rating and count (live), price level, open-now / hours (live),
  address, website, phone, "Open in Google Maps", description; per-trip notes, cost, visited
  toggle, colour override, start/end time when scheduled, comments and reactions.
- Lists: create, rename, reorder, delete (with items moved to "Places to visit"), colour + icon
  per list, hide on map. Kinds: places, restaurants, hotels, custom.
- Moving: drag handle (within a list, between lists, into a day), checkbox + "Move to…",
  multi-select bulk move / copy / delete, "Select all" on a list or day. A place can be *copied*
  so it lives in a shortlist and on a day.
- Copy list to another trip; save a list as a reusable template (**list_templates**).
- Manual places (no Google ID): name + pin dropped on the map or typed coordinates.

## 7. Itinerary

- One block per day: "Day 3 · Wed, 14 Oct", editable title, notes, colour; collapsible.
- Items: place, note, checklist, break, expense, plus auto-rendered lodging and time-anchored
  reservations. Ordering via drag-and-drop (dnd-kit, touch friendly) with keyboard support.
- Times: optional start and/or end time per stop, optional duration; conflicts are highlighted.
- **Legs**: between consecutive places the row shows distance and duration for the day's travel
  mode (drive / walk / transit / bicycle), overridable per leg. Computed through the Routes API
  and cached in **route_legs** for 30 days. Tapping opens directions in Google Maps (Apple Maps
  on iOS as an alternative). If no route is available (e.g. transit gaps) the row says
  "No estimate" instead of failing.
- Day totals: stops, total distance, total travel time, first/last time.
- **Optimize day**: pick start and end (lodging suggested automatically or "auto") → route matrix
  for the day's places → nearest-neighbour + 2-opt → preview of the new order and time saved →
  Apply (undoable).
- Map shows numbered markers per day in the day's colour and a route polyline per day; the
  layers panel toggles lists and days.
- Print stylesheet produces a clean PDF via the browser (free). "Open day in Google Maps"
  builds a multi-stop directions URL.

## 8. Lodging

- **Hotel search** inside the trip (Places Text Search, lodging types, within the destination
  viewport), results on the map with a bed icon, price level and rating live.
- Pick check-in and check-out dates → **lodging** row. Each itinerary day whose date lies in
  `[check_in, check_out)` shows a pinned "Staying at …" header (one row, editable from any day).
  Overlapping lodgings are allowed (e.g. two rooms) and both are shown.
- Manual "Add lodging" form: name, address (geocoded), dates, times, confirmation number, price,
  booking URL, notes. External links open Google Hotels or Booking search pre-filled with the
  hotel and dates (no affiliate tracking).
- Lodgings appear in the Reservations section too, and their cost can be turned into an expense.

## 9. Reservations and attachments

- Kinds: flight, train, bus, ferry, car rental, restaurant, activity, other. Structured fields
  (carrier/number/from/to/seat for transport; pickup/drop-off/vehicle for cars; party size/venue
  for restaurants) with start/end times in a time zone.
- Reservations show in the itinerary at their time (transport as "leave/arrive" rows).
- **Paste to parse**: paste confirmation email text; a parser extracts kind, codes, dates, times,
  confirmation numbers for review before saving (AI-assisted when enabled).
- Attachments (PDF, images) on the trip or a reservation/lodging: uploaded from the browser
  directly to Vercel Blob; private by default (short-lived signed URLs); quota shown in settings.

## 10. Collaboration and permissions

- Roles: **owner** (all rights, transfers ownership, deletes), **editor** (edit everything
  except settings' danger zone and member roles), **viewer** (read-only, can comment).
- Invites: role-scoped links (token, optional expiry / max uses, revocable) shared via the
  system share sheet; optional email invites (Resend). Accepting requires sign-in; the invite
  page previews the trip name, cover and inviter.
- Visibility: **Private** (members only), **Link** (anyone with the link can view), **Friends**
  (friends of any member can view), **Public** (listed on profiles, destination pages, Explore;
  indexable at `/p/[slug]`).
- Live updates: Pusher channel per trip carries invalidation hints; clients refetch and merge.
  Presence shows who is viewing; optimistic updates make local edits instant; edits use
  version checks (last write wins with an automatic refresh on conflict).
- Comments on places, days, lodgings and reservations; emoji reactions and 👍 voting on places.
- Activity log ("Dana moved Louvre to Day 2") with undo for deletes and moves.

## 11. Budget and expenses

- Trip budget (group) and personal budgets; progress bars per category and per day.
- Expenses: title, amount + currency, category, paid by, date/day, optional link to a place,
  lodging or reservation, notes, receipt attachment.
- Splits: equal, exact amounts, shares, percentages, or none (personal). Balances compute
  who owes whom with minimal transfers; **settlements** record payments and appear in history.
- Multi-currency: each expense in its own currency, converted to the trip currency using
  **fx_rates** refreshed daily (GitHub Actions → `/api/cron/fx`). Rates are also editable.
- Charts: spend by category, by day, per person. CSV export of all expenses.

## 12. Notes and checklists

- Trip notes and per-day notes are rich text (Tiptap JSON): headings, lists, links, checkboxes.
- Checklists: packing, to-do, custom; templates (default packing list, user templates);
  items with assignee and done state; a checklist can be pinned to a day.

## 13. Trip journal

- A journal trip (or a plan after its dates) shows the itinerary stops as a timeline; each stop
  or day accepts photos, notes, mood and a timestamp.
- Photos are resized client-side (≤ 1600 px WebP), uploaded to Blob, with EXIF time/location
  read for placement. Gallery view, photo map, per-entry captions.
- Collaborative: any editor can add entries; shareable story page (`/p/[slug]`) when public.

## 14. Explore and guides

- Explore tab: category chips (Top sights, Restaurants, Cafés, Bars, Museums, Nature, Kids,
  Nightlife, Shopping) → Places Text Search inside the destination viewport → small muted
  "suggested" pins on the map and a list with Save buttons.
- Public guides and trips for the destination from other users ("Guides for Lisbon").
- Guides: a trip of kind *guide* with lists, notes and optional days; publish → appears at
  `/p/[slug]`, on the author's profile and on destination pages. Like, view counts, and
  "Copy to my trips" (creates a plan trip with the same lists).
- "Convert to guide": copies a completed plan into a guide with visited places pre-selected.

## 15. Learn from past trips

- When a trip's end date passes (or "Mark as completed"), the owner's **user_travel_profile** is
  recomputed: trips analysed, average stops per day, typical start time, mode share, category
  and cuisine share, average price level, countries and destinations visited, favourite places
  (visited + high rating + reactions).
- Uses:
  - Pacing hints while planning ("You usually plan ~4 stops a day; Day 3 has 8").
  - Suggestions in Explore: "Places you loved" in the same destination; categories you favour.
  - "Copy a day from a past trip" when the new trip shares a destination.
  - Friend signals: "3 friends saved X" on place cards when they have visited the destination.

## 16. Import and export

- Import: paste a Google Maps list share URL (names extracted where possible, each resolved
  through Places with a review step); paste any article URL (place names extracted from the
  page text, reviewed with checkboxes before adding).
- Export: print/PDF, CSV (places, itinerary, expenses), `.ics` calendar feed per trip
  (days, timed stops, reservations, lodging), "Open day in Google Maps".

## 17. Offline and notifications

- App shell precached by the service worker; trip data cached network-first so recently opened
  trips render offline; an offline banner appears and edits queue in an outbox that replays on
  reconnect (server rejects stale versions gracefully).
- Web push (when configured): invite accepted, comment mentions, "trip starts tomorrow", trip
  day reminders. iOS requires the PWA to be installed; the app shows a one-time coach-mark.

## 18. Non-functional requirements

- Accessibility: keyboard operable drag-and-drop, labelled controls, focus rings, colour
  contrast AA, reduced motion respected.
- Performance: server components for data-heavy pages, TanStack Query for interactive state,
  map loaded lazily, images served directly from their CDN.
- Security: server-only Google key, per-user rate limits on proxy routes, signed invite tokens,
  role checks in every action, private attachments via short-lived signed URLs.
- Cost guardrails: strict Places field masks, 30-day route cache, curated destination DB before
  any Google call, static maps for thumbnails.
