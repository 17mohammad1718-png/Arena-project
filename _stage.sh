#!/usr/bin/env bash
# Stage refreshed Jajiga data from jajiga-tracker into Arena-project repo (run AFTER refresh chain)
set -e
SRC=/c/Users/Ma/projects/jajiga-tracker
DST=/c/Users/Ma/projects/arena-project

# core datasets
cp "$SRC/data/pricing/pricing-dataset.json"      "$DST/data/"
cp "$SRC/data/pricing/pricing-dataset.csv"       "$DST/data/" 2>/dev/null || true
cp "$SRC/data/pricing/seydkola-pricing.json"     "$DST/data/" 2>/dev/null || true
cp "$SRC/data/pricing/shirdarkola-pricing.json"  "$DST/data/" 2>/dev/null || true
cp "$SRC/data/pricing/gonehkola-pricing.json"    "$DST/data/" 2>/dev/null || true
cp "$SRC/data/pricing/quran_talar-pricing.json"  "$DST/data/" 2>/dev/null || true
cp "$SRC/data/top_rooms_sweep.json"              "$DST/data/"

# reviews
cp "$SRC"/data/reviews/*_reviews.json            "$DST/data/reviews/" 2>/dev/null || true

# supply + snapshots
cp "$SRC/data/supply-data.json"                  "$DST/data/"
mkdir -p "$DST/data/supply"
cp "$SRC/data/supply/room-dates.json"            "$DST/data/supply/" 2>/dev/null || true
cp "$SRC"/data/snapshots/*.json                  "$DST/data/snapshots/" 2>/dev/null || true

# hosts / cabins / cache
cp "$SRC/data/hosts-babolkenar.json"             "$DST/data/"
cp "$SRC/data/all-cabins.json"                   "$DST/data/"
cp "$SRC/data/rooms_meta_cache.json"             "$DST/data/"

# radar (per-room nights incl own cabin)
cp "$SRC"/data/radar/*.json                      "$DST/data/radar/" 2>/dev/null || true

# revenue (private - user approved public)
cp "$SRC"/data/revenue/*.json                    "$DST/data/revenue/" 2>/dev/null || true

# manual blocks (private - user approved public)
cp "$SRC/data/manual-blocks.json"                "$DST/data/"

# unified export + aggregate
cp "$SRC/jajiga_master.json"                     "$DST/data/"
cp "$SRC/jajiga_complete_dataset.json"           "$DST/data/"

echo "STAGED:"
find "$DST/data" -type f | wc -l | xargs echo "  file count:"
du -sh "$DST/data" | awk '{print "  total size:", $1}'
