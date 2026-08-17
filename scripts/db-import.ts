/**
 * Restore a backup produced by db-export: `npm run db:import -- path/to/file.json`
 * Rows are appended (duplicates by unique constraints are ignored for blocks).
 */
import { readFileSync } from "node:fs";

import { getDb } from "../src/lib/db";
import { importHostData } from "../src/lib/db/repo";
import type { HostDataDump } from "../src/lib/db/repo";

const source = process.argv[2];
if (!source) {
  console.error("usage: npm run db:import -- <backup.json>");
  process.exit(1);
}

const dump = JSON.parse(readFileSync(source, "utf8")) as HostDataDump;
importHostData(getDb(), dump);
console.log(
  `imported ${dump.expenses.length} expenses, ${dump.recurrings.length} recurrings, ` +
    `${dump.reservations.length} reservations, ${dump.blocks.length} blocks from ${source}`,
);
