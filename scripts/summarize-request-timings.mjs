// Accept JSONL runtime events, or Vercel --json records containing a message.
// Print aggregate numeric measurements only; never echo other log contents.
// Usage: node scripts/summarize-request-timings.mjs [file.jsonl]
import { readFileSync } from "node:fs";
const operations = new Set([
  "state.read",
  "state.write",
  "matrix.score",
  "library.lists",
  "library.archetypes",
  "library.detail",
  "library.versions",
  "library.maintenance",
  "notifications.read",
]);
const phases = new Set([
  "auth",
  "db.read",
  "state.prepare",
  "state.command",
  "state.notifications",
  "state.project",
  "db.commit",
  "serialize",
  "local.read",
  "local.commit",
  "local.work",
]);
const groups = new Map();
const numeric = (value) =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;
function events(line) {
  try {
    const envelope = JSON.parse(line);
    const seen = new Set();
    return [
      envelope,
      ...(Array.isArray(envelope.logs) ? envelope.logs : []),
    ].flatMap((entry) => {
      try {
        const record =
          typeof entry.message === "string" ? JSON.parse(entry.message) : entry;
        const key = JSON.stringify(record);
        // Vercel can repeat the same console event in the envelope message and
        // nested logs. Deduplicate within this request, never across requests.
        if (seen.has(key)) return [];
        seen.add(key);
        return [record];
      } catch {
        return [];
      }
    });
  } catch {
    return [];
  }
}
for (const entry of readFileSync(process.argv[2] || 0, "utf8")
  .split(/\r?\n/)
  .flatMap(events)) {
  try {
    const record = entry;
    if (
      record.event !== "portal_timing" ||
      record.version !== 1 ||
      !operations.has(record.operation) ||
      !Number.isInteger(record.status) ||
      record.status < 100 ||
      record.status > 599 ||
      !numeric(record.elapsedMs)
    )
      continue;
    const first = record.firstRequestInProcess === true;
    const key = JSON.stringify([record.operation, record.status, first]);
    const group = groups.get(key) || {
      operation: record.operation,
      status: record.status,
      firstRequestInProcess: first,
      measurements: new Map(),
    };
    const values = {
      elapsedMs: record.elapsedMs,
      responseBytes: record.responseBytes,
      retries: record.retries,
      ...Object.fromEntries(
        Object.entries(record.phasesMs || {})
          .filter(([phase]) => phases.has(phase))
          .map(([phase, value]) => [`phase:${phase}`, value]),
      ),
    };
    for (const [name, value] of Object.entries(values)) {
      if (!numeric(value)) continue;
      const samples = group.measurements.get(name) || [];
      samples.push(value);
      group.measurements.set(name, samples);
    }
    groups.set(key, group);
  } catch {
    /* Ignore unrelated, incomplete or malformed log records. */
  }
}
const percentile = (samples, fraction) =>
  samples[Math.ceil(samples.length * fraction) - 1];
const result = [...groups.values()].map(({ measurements, ...group }) => ({
  ...group,
  samples: measurements.get("elapsedMs").length,
  measurements: Object.fromEntries(
    [...measurements].map(([name, samples]) => {
      samples.sort((a, b) => a - b);
      return [
        name,
        { median: percentile(samples, 0.5), p95: percentile(samples, 0.95) },
      ];
    }),
  ),
}));
process.stdout.write(JSON.stringify(result, null, 2) + "\n");
