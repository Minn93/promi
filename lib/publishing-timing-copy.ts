/**
 * Automatic scheduler polling is currently disabled (no Vercel cron), so publishing-time copy must not
 * promise automatic or minute-accurate publishing. Update these strings when beta automatic scheduling
 * is intentionally re-enabled (see docs/DEVELOPMENT.md, "Cost-safety: automatic polling is off").
 */
export const PUBLISHING_TIMING_NOTE =
  "During the beta, publishing isn't fully automatic yet. Posts are sent when Promi's publishing job runs, which can be later than the scheduled time.";

export const PUBLISHING_TIMING_SHORT = "Posts are sent when Promi's publishing job runs, which can be later than the scheduled time.";
