/**
 * Dump all host-owned data (expenses, recurrings, reservations, blocks) to a
 * portable JSON file for backup: `npm run db:export [-- path/to/file.json]`
 */
import { writeFileSync } from "node:fs";

import { getDb } from "../src/lib/db";
import { dumpHostData } from "../src/lib/db/repo";

const target = process.argv[2] ?? `var/host-data-${new Date().toISOString().slice(0, 10)}.json`;
const dump = dumpHostData(getDb());
writeFileSync(target, JSON.stringify(dump, null, 2), "utf8");
console.log(
  `exported ${dump.expenses.length} expenses, ${dump.recurrings.length} recurrings, ` +
    `${dump.reservations.length} reservations, ${dump.blocks.length} blocks -> ${target}`,
);
