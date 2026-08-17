# EghamatYar — Data Guide (راهنمای دیتا)

This file tells you (the coding agent) exactly what data exists in `data/`,
what every field means, what is reliable and what is NOT, and how to refresh it.

## 1. Where this data comes from

All datasets are **real, scraped/collected data from Jajiga** (api.jajiga.com) by
Hermes (the owner's engineering agent) from a separate local project
(`jajiga-tracker`). Nothing here is fictional or mocked.

Three sources:

1. **Public listing API** — prices, amenities, capacity, ratings, titles for
   thousands of rooms (`/api/room/{id}`, search endpoints).
2. **Public reviews API** — individual guest reviews per room.
3. **Owner's own host account** — the owner's cabin (room `3297585`) future
   bookings/revenue via `/api/nights`, plus manually tracked owner blocks.
   ⚠️ The owner explicitly approved publishing this revenue data publicly.

Refresh cadence: the datasets are refreshed on demand (manual runs of fetch
scripts), NOT by a background cron for this repo. If you need fresher data, do
NOT re-scrape from your own side — ask the owner (or file an issue) so the
existing pipeline refreshes it. Re-scraping the same APIs from a second
automated user risks rate limits and duplicates.

## 2. Directory map

| Path | What it is | Records | Notes |
|---|---|---|---|
| `data/pricing-dataset.json` | Full pricing-factor dataset: 4 Babolkenar villages | 104 cabins | richest schema (see §3) |
| `data/pricing-dataset.csv` | Same as above, CSV | 104 rows | |
| `data/seydkola-pricing.json` | Village subset: Seyed Kola | 33 | |
| `data/shirdarkola-pricing.json` | Village subset: Shirdarkola | 32 | |
| `data/gonehkola-pricing.json` | Village subset: Guneh Kola | 28 | |
| `data/quran_talar-pricing.json` | Village subset: Quran Talar | 11 | |
| `data/top_rooms_sweep.json` | Full Iran cottage catalog sweep | 2870 rooms | id/title/city/price/books/rating/reviews |
| `data/hosts-babolkenar.json` | All hosts in Babolkenar region | 346 hosts | nested rooms |
| `data/all-cabins.json` | Village-grouped cabin list | by village | legacy listing |
| `data/supply-data.json` | Supply timeline: hosts/rooms growth + monthly stats | 346 hosts / 467 rooms | dashboard source |
| `data/supply/room-dates.json` | Per-room date availability | 467 rooms | booked/free per day |
| `data/snapshots/supply-YYYY-MM-DD.json` | Daily supply snapshots | ~13 days | history for growth curves |
| `data/reviews/{id}_reviews.json` | Full guest reviews per key room | 4 rooms | incl. owner's 3297585 |
| `data/rooms_meta_cache.json` | Room title/price cache for reviews pipeline | 2+ rooms | |
| `data/radar/{id}.json` | Per-room booking calendar (nights) | 35 rooms | incl. owner's cabin + competitors |
| `data/revenue/past-revenue-*.json` | Revenue projection per radar room | 35 rooms | future bookings only |
| `data/revenue/seldkola-mordad-1405.json` | Owner cabin revenue snapshot | 1 room | private, published by owner |
| `data/revenue/realized-seydkola-mordad-1405.json` | Owner cabin realized earnings | 1 room | private, published by owner |
| `data/manual-blocks.json` | Owner's manually blocked dates (non-booking) | small | see §4 caveat |
| `data/jajiga_master.json` | Unified master export (SQLite → JSON) | all of the above | 7 tables flattened |
| `data/jajiga_complete_dataset.json` | **Lossless aggregate** of everything | superset | use this for global context |

## 3. Field dictionary — pricing-dataset.json (MOST IMPORTANT)

Each entry is one cabin. Key fields:

| Field | Meaning |
|---|---|
| `id` | Jajiga room id — URL = `https://www.jajiga.com/room/{id}` |
| `title`, `url` | Listing title / public URL |
| `village` | Babolkenar village (سیدکلا / شیردارکلا / گونه کلا / قرآن تالار) |
| `floor_area`, `land_area` | m² of building / grounds |
| `bedrooms`, `guest_number`, `max_guest_number` | capacity |
| `sleep_arrange` | beds: `double`, `mattress` (floor bedding), etc. |
| `types` | cottage / swiss_cottage / wooden_cottage → "swiss" matters for owner's cabin |
| `stays_min`, `stays_max` | min/max stay nights |
| `min_price` | **BASE rate from the «نرخ هر شب از» box (toman)** — NOT a discounted/last-minute price |
| `extra_price` | fee per extra guest per night (toman) |
| `cancellation_policy` | easy/middle/strict |
| `is_instant`, `is_plus`, `is_clean`, `is_new` | listing badges |
| `features[]` | amenity codes: barbecue, pool, jacuzzi, heating, cooler, parking, town_water... |
| `properties[]` | premium badges incl. `خوش منظره` (nice view) |
| `rating`, `review_count` | from API at collection time |
| `sub_ratings` | category scores (cleanliness, host, location, value...) — value_for_money is a known weak point |
| `price_by_day` / `calendar` | date → price map if captured |
| `books` | successful reservations count |
| `discounts` | e.g. 10% ≥6 nights, 20% ≥15 nights |
| `geo` | approximate lat/lng |

**Pricing rule:** always trust `min_price` (base box), never a discounted card
price. Discounts are separate fields.

## 4. Field dictionary — radar room files & revenue

`data/radar/{room_id}.json` (one file per tracked room):

| Field | Meaning |
|---|---|
| `room_id`, `meta.title`, `meta.village`, `meta.host_name`, `meta.host_id` | identity — host profile = `jajiga.com/user/{host_id}` |
| `meta.min_price` | base nightly rate (toman) |
| `meta.own` | `true` for the owner's own cabin (3297585) |
| `fetched_at` | ISO timestamp of this snapshot |
| `nights[]` | one entry per night: `date`, `is_unavailable` (booked OR manually blocked), `price` (price for that night if known) |

`data/revenue/past-revenue-*.json`: map room_id → revenue projection. **This is
future bookings only** (Jajiga's `/api/nights` does not expose historical
bookings). Past realized revenue exists ONLY for the owner's cabin in
`realized-seydkola-mordad-1405.json` (computed manually for Mordad 1405).

## 5. ⚠️ Critical caveats (facts verified by Hermes, Aug 2026)

1. **Displayed Jajiga rating = average of LAST 12 MONTHS only** (tooltip on
   room page: «بر اساس امتیازات ۱ سال اخیر»). A "5.0 with 400 reviews" card is
   window+rounding, NOT all-time. Always also compute avg over fetched reviews.
2. **Reviews API returns ~10% FEWER total reviews than the card count**
   (e.g. 359 vs 402, 301 vs 327). Show both numbers, never treat API total as complete.
3. **`is_unavailable: true` in nights = a booking OR an owner manual block.**
   Manual blocks (host closed dates for non-customer reasons) are tagged in
   `data/manual-blocks.json` and must be shown as a distinct "blocked" state,
   contributing ZERO revenue.
4. **No room `created_at` in the API** — estimated creation dates for the
   supply timeline come from earliest review/photo timestamps (approximation).
5. **All prices are in toman.** Dates are ISO (Gregorian) in JSON; the product
   must render Jalali (Persian calendar) in the UI.
6. Some room API responses return `rating: null` — fall back to the sweep file
   (`top_rooms_sweep.json`) for rating/reviews/books.
7. Owner's cabin 3297585 price history: base rate was ~2,750,000 toman on
   2026-08-10, now **2,400,000** (verified 2026-08-17) — prices change; do not
   hardcode.

## 6. Recommended dataset per EghamatYar module

| Module | Use this |
|---|---|
| Overview dashboard (owner) | `radar/3297585.json`, `revenue/*`, `manual-blocks.json` |
| Market comparison (Babolkenar) | `pricing-dataset.json` (filter `village`), `top_rooms_sweep.json` |
| Pricing calendar | `pricing-dataset.json` `price_by_day`, `radar/*.json` nights, `manual-blocks.json` |
| Competitor explorer | `pricing-dataset.json` (amenities/capacity/price), `radar/*.json` (availability) |
| Insights (amenities → price/rating) | `pricing-dataset.json` `features[]`/`properties[]`, `reviews/*.json` (guest complaints/praise) |
| Reviews analysis | `reviews/*.json` + `fetch_reviews.py` for any other room id |
| Supply / market growth | `supply-data.json`, `snapshots/*.json` |

## 7. Refreshing data (do NOT scrape yourself)

All refresh scripts live in the owner's local `jajiga-tracker` project
(C:\Users\Ma\projects\jajiga-tracker) and are run by Hermes. To refresh, ask
the owner in an issue: "update data". The exact commands:

```bash
python scripts/fetch_pricing_dataset.py     # pricing-dataset.json (4 villages)
python scripts/find_top_rooms.py            # top_rooms_sweep.json (2863 rooms)
python scripts/fetch_reviews.py <room_id>   # one room's reviews
python scripts/fetch_radar.py               # radar/{id}.json for 35 tracked rooms
python scripts/fetch_revenue.py             # revenue projection (future bookings)
python scripts/supply_snapshot.py           # daily supply snapshot
python scripts/db_build.py && python scripts/db_export.py   # jajiga_master.json
python scripts/aggregate_jajiga_dataset.py && python scripts/verify_aggregation.py  # jajiga_complete_dataset.json
```

To add a new competitor room to the radar: `python scripts/radar_bulk_add.py <id1> <id2> ...`

## 8. Owner's cabin quick facts (3297585, کلبه سوئیسی سیدکلا)

- Type: Swiss wooden cottage, 100 m² building / 200 m² grounds, 1 bedroom
- Capacity 4 (+2 extra), 1 double + 4 floor mattresses
- Base rate **2,400,000 toman/night**; weekend high-rate ~3,650,000; extra
  guest 750,000/night; discounts 10% ≥6 nights, 20% ≥15 nights
- Rating 5.0 from 9 reviews (small sample — show count with the average)
- Badges: ممتاز, رزرو فوری, خوش منظره, مهمان‌نواز — pool, jacuzzi, parking,
  heating, cooling, TV, piped water, 17 amenities total
- Value-for-money (4.8) is the only sub-rating below 5.0
- Host approval 88%, response <5 min
