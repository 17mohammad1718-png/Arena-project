# MizbanYar (میزبان‌یار) — Product Plan

## Vision

Build a Persian, RTL analytics dashboard for short-term rental hosts on Jajiga. The product will begin with one residence in Babolkenar and provide market comparisons, pricing intelligence, and practical recommendations. It can later expand to Mazandaran, northern Iran, and eventually all of Iran.

## The problem

Jajiga's host tools already provide operational statistics such as views, reservations, and sales. MizbanYar should not simply recreate those reports. Its differentiator will be answering questions such as:

- How is my residence performing over time?
- Is my nightly price competitive?
- Which nearby residences are my real competitors?
- Which amenities may improve price, ratings, or demand?
- On which dates should I consider raising or lowering my price?
- How does Babolkenar compare with Babol, Mazandaran, and northern Iran?
- What practical changes could help attract more reservations?

## Product scope

We will expand geographically in stages:

1. The owner's residence
2. Similar residences in Babolkenar
3. Babol and nearby areas
4. Mazandaran
5. Northern provinces
6. All of Iran

Starting locally lets us validate the product with a manageable, useful dataset before scaling.

## Target users

### Initial user

A Jajiga host in Babolkenar who wants to understand revenue, occupancy, pricing, and nearby competition.

### Future users

- Other Jajiga hosts
- Multi-property managers
- Local tourism and rental-market analysts

## MVP features

### 1. Overview dashboard

Show the most important performance indicators:

- Total revenue
- Number of reservations
- Occupancy rate
- Average nightly rate (ADR)
- Revenue per available night (RevPAN)
- Average stay length
- Cancellation rate
- Views-to-reservation conversion rate, when view data is available
- Revenue and reservations over time

### 2. Market comparison

Compare the user's property with genuinely similar residences using:

- Location and distance
- Property type
- Guest capacity
- Number of bedrooms
- Amenities
- Rating
- Number of reviews

Useful comparison results include:

- Price percentile
- Median market price
- Rating position
- Missing or differentiating amenities
- Overall competitive position

### 3. Pricing calendar

Provide a Persian/Jalali calendar containing:

- Current nightly price
- Local median price
- Weekday and weekend differences
- Iranian public holidays
- High- and low-demand periods
- Suggested price range

Pricing recommendations must be described as estimates rather than guaranteed predictions.

### 4. Competitor explorer

Provide a searchable and filterable table, with a map in a later phase. Suggested fields:

| Field | Example use |
|---|---|
| Residence | Identify the listing |
| Location | Filter local competitors |
| Property type | Compare like-for-like listings |
| Capacity | Normalize the comparison |
| Weekday price | Find regular price differences |
| Weekend price | Analyze demand-based pricing |
| Rating | Compare guest satisfaction |
| Review count | Add confidence to ratings |

Users should be able to select a competitor set and compare it directly with their property.

### 5. Actionable insights

Charts should be accompanied by clear Persian recommendations, for example:

- «قیمت آخر هفته شما ۱۸٪ پایین‌تر از میانگین اقامتگاه‌های مشابه است.»
- «۷۰٪ اقامتگاه‌های پربازدید منطقه دارای آتشدان هستند.»
- «امتیاز نظافت شما از میانگین بابلکنار بالاتر است.»
- «برای تعطیلات آینده احتمال افزایش تقاضا وجود دارد.»

## Data strategy

Data quality and compliant access are core product requirements.

### Private host data

Initially, the host can enter data manually or import it from CSV/Excel:

- Reservation and checkout dates
- Nightly rate
- Gross revenue
- Jajiga fees
- Property expenses
- Cancellations
- Number of guests
- Listing views, when available

The product should distinguish gross revenue, fees, expenses, and net profit.

### Public market data

Potentially useful publicly visible listing fields include:

- Listing title and public URL
- Region
- Property type
- Capacity and rooms
- Amenities
- Public nightly prices
- Rating and review count
- Publicly displayed availability

Before automating collection, Jajiga's terms, robots policy, rate limits, and any applicable legal requirements must be reviewed. The project must avoid aggressive or unauthorized scraping.

Preferred acquisition options, in order:

1. Official API or partnership access
2. A dataset collected with explicit permission
3. User-assisted/manual competitor entry
4. A compliant public-data collection process, only if permitted

An unavailable date does not necessarily prove that a reservation occurred; a host may have manually blocked it. Therefore, inferred market occupancy must always be labeled as an **availability estimate**, not confirmed occupancy.

### Initial prototype data

Until a compliant real market-data source is established, use realistic fictional Babolkenar competitor data. All sample data must be visibly marked as demo data and remain editable.

## Suggested technology

- **Next.js** with the App Router
- **TypeScript**
- **Tailwind CSS**
- **Recharts** for data visualization
- **SQLite** for the local prototype
- **PostgreSQL** for production
- Persian RTL layout and typography
- Jalali calendar support
- Responsive desktop and mobile design
- Map integration in a later iteration

## Delivery phases

### Phase 1 — Interactive prototype ✅ Delivered

- ✅ Persian RTL application shell with Vazirmatn typography
- ✅ Responsive desktop and mobile layout
- ✅ Owner property profile
- ✅ Overview KPI cards and charts (revenue, net profit, occupancy, ADR, RevPAN, cancellation, conversion)
- ✅ Competitor comparison with an explainable similarity score
- ✅ Jalali pricing calendar with holidays, demand seasons and suggested price bands
- ✅ Realistic fictional Babolkenar dataset (deterministic, seeded)
- ✅ Clear demo-data labeling on every page
- ✅ Automatic real-dataset loader with validation and per-entity source reporting

Phase 1 is implemented in this repository. See the [README](../README.md) for the page map and
architecture, and [`data/README.md`](../data/README.md) for the import contract.

### Phase 2 — Real host data

Planned in detail in [`docs/phase-2-plan.md`](phase-2-plan.md).

- Manual reservation entry
- CSV/Excel import
- Field mapping and import validation
- Revenue and occupancy calculations
- Expense and net-profit reporting
- Jalali date entry and filtering

### Phase 3 — Market intelligence

Planned in detail in [`docs/phase-3-plan.md`](phase-3-plan.md).

- Competitor records
- Saved competitor sets
- Price history
- Geographic and property filters
- Benchmarking
- Rule-based Persian recommendations
- Compliant market-data ingestion

### Phase 4 — Advanced analytics

- Iranian holiday and seasonal-demand analysis
- Weather correlation
- Data-driven pricing recommendations
- Weekly reports
- Alerts such as “your next weekend is priced below the local market”
- Multi-property and multi-user support

## Important metric definitions

Metrics should have transparent definitions so hosts can trust them:

- **Occupancy rate:** booked nights divided by nights available for booking
- **Average nightly rate (ADR):** accommodation revenue divided by booked nights
- **Revenue per available night (RevPAN):** accommodation revenue divided by available nights
- **Average stay length:** booked nights divided by completed reservations
- **Conversion rate:** confirmed reservations divided by listing views, when both are available
- **Net profit:** revenue minus platform fees and recorded property expenses

The app should document how cancellations, owner-blocked nights, refunds, and incomplete stays affect each calculation.

## Product principles

- Make insights understandable to a host, not only to an analyst.
- Prefer practical recommendations over decorative charts.
- Be transparent about estimates and missing data.
- Protect private reservation and financial information.
- Never present demo or inferred information as confirmed fact.
- Build for Persian and RTL from the beginning.
- Validate the Babolkenar use case before scaling nationally.

## First implementation milestone

Build an interactive Persian RTL prototype focused on one Babolkenar residence. Use editable demo data to demonstrate:

1. Monthly performance KPIs
2. Revenue and occupancy trends
3. Comparison with similar local residences
4. A nightly pricing calendar
5. Three to five useful Persian recommendations

## Information needed from the host

Real data is optional for the first prototype. When available, the following will improve realism:

- Public Jajiga listing URL
- Property type
- Maximum guest capacity
- Number of bedrooms
- Amenities
- Approximate weekday and weekend prices
- A few months of reservation data
- Desired audience: private personal tool or future product for other hosts

If the host does not want to share this information yet, development can proceed entirely with editable fictional data.

## Data ingestion contract (implemented)

The loader in `src/lib/load-dataset.ts` scans `data/` and swaps demo values for real records
per entity. This means the host can migrate to real data incrementally instead of all at once.

| Entity | File | Required columns |
|---|---|---|
| Property | `property.csv` | `title`, `capacity`, `basePrice` |
| Reservations | `reservations.csv` | `checkIn`, `checkOut` or `nights`, `grossAmount` |
| Blocked nights | `blocked.csv` | `date` |
| Expenses | `expenses.csv` | `date`, `amount` |
| Daily prices | `prices.csv` | `date`, `price` |
| Views | `views.csv` | `date`, `views` |
| Competitors | `competitors.csv` | `title`, `weekdayPrice` |

Jalali and Gregorian dates, Persian digits, Persian column names, thousands separators and the
word «تومان» are all normalized on import. Rows that fail validation are skipped and surfaced on
the «منبع داده» page rather than silently dropped.

## Immediate next step

The real Babolkenar dataset is being prepared by the host. Once it lands in `data/`:

1. Review the «منبع داده» page for validation warnings and fix any column mismatches.
2. Re-check whether the metric definitions match how the host actually reasons about the
   business (especially blocked nights, refunds and fee handling).
3. Recalibrate the pricing suggestion band against real competitor prices instead of the
   demo baseline.
4. Then start Phase 2 — in-app reservation entry, UI-driven file upload and persistent storage.
