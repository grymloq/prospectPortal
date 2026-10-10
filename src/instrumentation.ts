/** Explicit, unpromoted production validation only; normal deployments do no work. */
export async function register() {
  if (
    process.env.NEXT_RUNTIME === "nodejs" &&
    process.env.SCRIM_SCORE_PROBE_ENABLED === "1"
  ) {
    const { validateScrimScoreTransport } =
      await import("./server/scrim-score-probe");
    await validateScrimScoreTransport();
  }
}
