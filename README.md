# EghamatYar (اقامت‌یار)

A Persian RTL analytics dashboard for Jajiga hosts, beginning with residence and market analysis in Babolkenar, Mazandaran.

## Project status

Planning and product definition.

## Documentation

- [Product plan](docs/product-plan.md)
- [Residence baseline — Jajiga 3297585](docs/residence-baseline.md)
- [Data guide — what's in `data/`](docs/DATA-GUIDE.md)

## Data

The `data/` folder contains **real, verified Jajiga data** collected by the
owner's engineering agent (Hermes / jajiga-tracker pipeline): pricing factors
for 108 Babolkenar cabins, a full-Iran 2863-room catalog sweep, per-room
booking calendars (radar), reviews, supply history, and the owner's own cabin
revenue. See [docs/DATA-GUIDE.md](docs/DATA-GUIDE.md) before using any file —
it documents exact field meanings, caveats, and the refresh workflow. Do NOT
re-scrape Jajiga yourself; request updates through issues instead.

## Next milestone

Build an interactive Phase 1 dashboard prototype with editable fictional Babolkenar data.
