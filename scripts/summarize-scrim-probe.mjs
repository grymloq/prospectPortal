// Accept Vercel JSONL; emit only the allowlisted transport-probe measurements.
import { readFileSync } from "node:fs";
const groups = { legacy: [], cell: [] };
let failed = false;
for (const line of readFileSync(process.argv[2] || 0, "utf8").split(/\r?\n/)) {
  try {
    const envelope = JSON.parse(line), seen = new Set();
    for (const entry of [envelope, ...(Array.isArray(envelope.logs) ? envelope.logs : [])]) {
      try {
        const record = typeof entry.message === "string" ? JSON.parse(entry.message) : entry;
        const key = JSON.stringify(record);
        if (seen.has(key)) continue;
        seen.add(key);
        if (record.event !== "scrim_transport_probe") continue;
        if (record.failed === true) { failed = true; continue; }
        if (!Object.hasOwn(groups, record.mode) || record.rolledBack !== true) continue;
        const sample = {};
        for (const field of ["readMs", "commitMs", "elapsedMs", "writeBytes"]) {
          if (typeof record[field] === "number" && Number.isFinite(record[field]) && record[field] >= 0) sample[field] = record[field];
        }
        if (Object.keys(sample).length === 4) groups[record.mode].push(sample);
      } catch {}
    }
  } catch {}
}
console.log(JSON.stringify({ failed, groups }, null, 2));
