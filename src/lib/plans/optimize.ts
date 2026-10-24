import type { Dataset } from '../data/dataset';
import { DEFAULT_WEIGHTS, primaryPick, recommend, type Candidate, type Pick, type RankWeights } from '../recommendations/recommend';
import type { Plan, Shipment } from '../data/schemas';
import { activePlan, computePlanTotals, type PlanTotals } from './totals';
import { duplicatePlan, sequenceOrder } from './ops';

export type StrategyId = 'cheapest' | 'fastest' | 'bestValue' | 'bestDocuments';
export interface StrategyResult {
  id: StrategyId;
  picks: { shipmentId: string; serviceId: string | null }[];
  totals: PlanTotals;
  maxTransitDays: number | null;
}

function withSelections(plan: Plan, sel: Record<string, string | null>): Plan {
  return { ...plan, shipments: plan.shipments.map((s) => ({ ...s, selectedServiceId: sel[s.id] ?? null, selectedPriceSnapshot: null })) };
}

export function strategyResults(fullPlan: Plan, ds: Dataset, today: string, weights: RankWeights = DEFAULT_WEIGHTS): StrategyResult[] {
  const plan = activePlan(fullPlan);
  const recs = new Map(plan.shipments.map((s) => [s.id, recommend(s, ds, weights, today)] as const));
  const ids: StrategyId[] = ['cheapest', 'fastest', 'bestValue', 'bestDocuments'];
  return ids.map((id) => {
    const sel: Record<string, string | null> = {};
    const cands: (Candidate | null)[] = [];
    for (const s of plan.shipments) {
      const r = recs.get(s.id)!;
      const c = r.top[id as Pick] ?? r.top.cheapest ?? null;
      sel[s.id] = c?.service.id ?? null;
      cands.push(c);
    }
    const days = cands.map((c) => c?.transit?.maxDays).filter((d): d is number => d !== undefined);
    return { id, picks: plan.shipments.map((s) => ({ shipmentId: s.id, serviceId: sel[s.id] })), totals: computePlanTotals(withSelections(plan, sel), ds, today), maxTransitDays: days.length ? Math.max(...days) : null };
  });
}

export function currentChoiceTotals(plan: Plan, ds: Dataset, today: string) {
  return computePlanTotals(plan, ds, today);
}

export interface ConsolidationProposal {
  mergedShipmentId: string;      // shipment that absorbs the other
  absorbedShipmentId: string;    // removed in the proposal
  viaShipmentId: string;         // leg that carries the items to the merged origin
  beforeTotals: PlanTotals;
  afterTotals: PlanTotals;
  /** Positive = proposal is cheaper. Null when either side has an unpriced shipment. */
  savingEur: number | null;
  proposedPlan: Plan;
}

function bestSelection(plan: Plan, ds: Dataset, today: string, weights: RankWeights): Plan {
  const sel: Record<string, string | null> = {};
  for (const s of plan.shipments) sel[s.id] = primaryPick(s, recommend(s, ds, weights, today))?.service.id ?? null;
  return withSelections(plan, sel);
}

/**
 * Looks for: shipment A (X→D) and B (Y→D) to the same destination, plus a leg C (X→Y) that already
 * moves goods from A's origin to B's origin. Proposes forwarding A's items inside C, then merging them into B.
 * Never applied automatically.
 */
export function findConsolidation(fullPlan: Plan, ds: Dataset, today: string, weights: RankWeights = DEFAULT_WEIGHTS): ConsolidationProposal | null {
  const plan = activePlan(fullPlan);
  const ships = plan.shipments;
  for (const a of ships) for (const b of ships) {
    if (a.id === b.id || a.destinationCountry !== b.destinationCountry || a.originCountry === b.originCountry) continue;
    const via = ships.find((c) => c.id !== a.id && c.id !== b.id && c.originCountry === a.originCountry && c.destinationCountry === b.originCountry);
    if (!via) continue;
    const extra = a.weightKg;
    const next = structuredClone(plan);
    const nb = next.shipments.find((s) => s.id === b.id)!;
    const nv = next.shipments.find((s) => s.id === via.id)!;
    nb.weightKg = Math.round((nb.weightKg + extra) * 1000) / 1000;
    nb.weightProvisional = true; nb.dimsProvisional = true;
    nb.assumptions = [...new Set([...nb.assumptions, 'consolidated'])];
    nv.weightKg = Math.round((nv.weightKg + extra) * 1000) / 1000;
    nv.assumptions = [...new Set([...nv.assumptions, 'consolidated'])];
    next.shipments = next.shipments.filter((s) => s.id !== a.id).map((s) => ({ ...s, dependsOn: s.dependsOn.filter((d) => d !== a.id) }));
    nb.dependsOn = [...new Set([...nb.dependsOn, via.id])];
    // new ids for the proposed plan
    const proposed = duplicatePlan(bestSelection(next, ds, today, weights), new Date().toISOString(), null, 'plan.consolidated');
    const before = computePlanTotals(bestSelection(plan, ds, today, weights), ds, today);
    const after = computePlanTotals(proposed, ds, today);
    const saving = before.complete && after.complete ? before.grandTotalEur! - after.grandTotalEur! : null;
    return { mergedShipmentId: b.id, absorbedShipmentId: a.id, viaShipmentId: via.id, beforeTotals: before, afterTotals: after, savingEur: saving, proposedPlan: proposed };
  }
  return null;
}

export const sequencing = (plan: Plan) => sequenceOrder(plan);
export type { Shipment };
