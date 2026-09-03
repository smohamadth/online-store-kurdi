/**
 * Conversion funnel computation.
 *
 * Analytics tracked view / search / add_to_cart / purchase, but never
 * begin_checkout or remove_from_cart - so the store could see THAT people did
 * not convert, never WHERE they dropped. The two extra steps turn the events
 * already being collected into an actionable funnel.
 *
 * Pure so the arithmetic (especially the divide-by-zero and
 * more-purchases-than-views cases) can be tested exhaustively.
 */

/** Ordered funnel steps. Order defines the drop-off calculation. */
export const FUNNEL_STEPS = [
  'view',
  'add_to_cart',
  'begin_checkout',
  'purchase',
] as const;

export type FunnelStep = (typeof FUNNEL_STEPS)[number];

export type FunnelStage = {
  step: FunnelStep;
  count: number;
  /** Share of the FIRST step that reached here, 0..1. */
  conversionFromStart: number;
  /** Share of the PREVIOUS step that reached here, 0..1. */
  conversionFromPrevious: number;
  /** Users lost between the previous step and this one. */
  droppedFromPrevious: number;
};

function ratio(numerator: number, denominator: number): number {
  // A funnel with no traffic must report 0, not NaN or Infinity - those
  // serialise to null in JSON and render as a blank dashboard.
  if (!denominator || denominator <= 0) return 0;
  return Number((numerator / denominator).toFixed(4));
}

/**
 * Build the funnel from per-step unique-user counts.
 *
 * Counts are clamped to be non-increasing down the funnel. Event data is
 * noisy - a user can land mid-funnel from a saved link, or a purchase event
 * can arrive without its begin_checkout - and an un-clamped funnel then shows
 * a step converting at 130%, which makes the whole report untrustworthy.
 */
export function buildFunnel(counts: Partial<Record<FunnelStep, number>>): FunnelStage[] {
  const stages: FunnelStage[] = [];
  let previous = 0;
  let start = 0;

  FUNNEL_STEPS.forEach((step, i) => {
    const raw = Math.max(0, Math.floor(Number(counts[step] ?? 0)));
    const count = i === 0 ? raw : Math.min(raw, previous);

    if (i === 0) start = count;

    stages.push({
      step,
      count,
      conversionFromStart: i === 0 ? (count > 0 ? 1 : 0) : ratio(count, start),
      conversionFromPrevious: i === 0 ? (count > 0 ? 1 : 0) : ratio(count, previous),
      droppedFromPrevious: i === 0 ? 0 : Math.max(0, previous - count),
    });

    previous = count;
  });

  return stages;
}

/** The step with the largest proportional loss - i.e. where to look first. */
export function biggestDropOff(stages: FunnelStage[]): FunnelStage | null {
  const candidates = stages.slice(1).filter((s) => s.droppedFromPrevious > 0);
  if (candidates.length === 0) return null;
  return candidates.reduce((worst, s) =>
    s.droppedFromPrevious > worst.droppedFromPrevious ? s : worst);
}
