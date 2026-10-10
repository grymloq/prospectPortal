import { AsyncLocalStorage } from "node:async_hooks";
import { NextResponse } from "next/server";

const operations = [
  "state.read",
  "state.write",
  "matrix.score",
  "scrim.score",
  "library.lists",
  "library.archetypes",
  "library.detail",
  "library.versions",
  "library.maintenance",
  "notifications.read",
] as const;
export type TimingOperation = (typeof operations)[number];
const phases = [
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
] as const;
type TimingPhase = (typeof phases)[number];
export type TimingRecord = {
  event: "portal_timing";
  version: 1;
  operation: TimingOperation;
  status: number;
  elapsedMs: number;
  phasesMs: Partial<Record<TimingPhase, number>>;
  responseBytes: number;
  retries: number;
  firstRequestInProcess: boolean;
};
type Context = {
  phasesMs: TimingRecord["phasesMs"];
  responseBytes: number;
  retries: number;
};
const context = new AsyncLocalStorage<Context>();
let hasHandledRequest = false;
const rounded = (ms: number) => Math.round(Math.max(0, ms) * 100) / 100;

function recordPhase(phase: TimingPhase, start: number) {
  const current = context.getStore();
  if (current && phases.includes(phase))
    current.phasesMs[phase] =
      (current.phasesMs[phase] || 0) + performance.now() - start;
}
export function timedSync<T>(phase: TimingPhase, work: () => T): T {
  if (!context.getStore()) return work();
  const start = performance.now();
  try {
    return work();
  } finally {
    recordPhase(phase, start);
  }
}
export async function timed<T>(
  phase: TimingPhase,
  work: () => Promise<T>,
): Promise<T> {
  if (!context.getStore()) return work();
  const start = performance.now();
  try {
    return await work();
  } finally {
    recordPhase(phase, start);
  }
}
export function timingRetry() {
  const current = context.getStore();
  if (current) current.retries++;
}

/** Serialize once, measuring bytes without cloning/reading a response stream. */
export function timingJson(value: unknown, init?: ResponseInit): NextResponse {
  return timedSync("serialize", () => {
    const json = JSON.stringify(value);
    const headers = new Headers(init?.headers);
    if (!headers.has("Content-Type"))
      headers.set("Content-Type", "application/json");
    const response = new NextResponse(json, { ...init, headers });
    const current = context.getStore();
    if (current) current.responseBytes = Buffer.byteLength(json);
    return response;
  });
}

/** No URLs, filters, bodies, identity, cookies, tokens or error messages enter logs. */
export async function withRequestTiming(
  operation: TimingOperation,
  work: () => Promise<Response>,
  emit?: (record: TimingRecord) => void,
): Promise<Response> {
  if (!operations.includes(operation))
    throw new Error("Unknown timing operation.");
  const firstRequestInProcess = !hasHandledRequest;
  hasHandledRequest = true;
  const start = performance.now();
  const current: Context = { phasesMs: {}, responseBytes: 0, retries: 0 };
  return context.run(current, async () => {
    let status = 500;
    try {
      const response = await work();
      status = response.status;
      return response;
    } finally {
      const record: TimingRecord = {
        event: "portal_timing",
        version: 1,
        operation,
        status,
        elapsedMs: rounded(performance.now() - start),
        phasesMs: Object.fromEntries(
          Object.entries(current.phasesMs).map(([key, ms]) => [
            key,
            rounded(ms!),
          ]),
        ),
        responseBytes: current.responseBytes,
        retries: current.retries,
        firstRequestInProcess,
      };
      try {
        if (emit) emit(record);
        else if (
          process.env.NODE_ENV === "production" &&
          process.env.PORTAL_TIMING_ENABLED !== "0"
        )
          console.info(JSON.stringify(record));
      } catch {
        /* Observability must never fail a request. */
      }
    }
  });
}
