import type { Dataset } from '../data/dataset';
import { serviceById } from '../data/dataset';
import type { Plan, PriceSnapshot, Shipment } from '../data/schemas';
import { msg, type Msg } from '../msg';
import { priceShipment, type PriceResult } from '../pricing/price';
import { checkEligibility } from '../recommendations/eligibility';

export type LineState = 'off' | 'unselected' | 'priced' | 'unpriced' | 'ineligible';

export interface PlanLine {
  shipmentId: string;
  serviceId: string | null;
  state: LineState;
  price: PriceResult | null;
  verified: boolean;
  issues: Msg[];
  priceChange: { oldEur: number | null; newEur: number | null; oldNative: number | null; newNative: number | null; currency: string | null } | null;
}

export interface PlanTotals {
  lines: PlanLine[];
  shipmentCount: number;
  pricedCount: number;
  unpricedCount: number;
  unverifiedCount: number;
  /** Sum of EUR of the lines that have a price (a lower bound unless complete). */
  knownSubtotalEur: number;
  /** Non-null only when EVERY shipment has a usable price. Never present an incomplete total as final. */
  grandTotalEur: number | null;
  complete: boolean;
  byCurrency: Record<string, number>;
  hasWarnings: boolean;
}

export function makeSnapshot(price: PriceResult, serviceId: string, now: string): PriceSnapshot {
  return { serviceId, tariffId: price.tariffId, nativeAmount: price.nativeAmount, currency: price.currency, eur: price.eur, capturedAt: now };
}

export function activePlan(plan: Plan): Plan {
  if (plan.shipments.every((s) => s.enabled)) return plan;
  const ids = new Set(plan.shipments.filter((s) => s.enabled).map((s) => s.id));
  return { ...plan, shipments: plan.shipments.filter((s) => s.enabled).map((s) => ({ ...s, dependsOn: s.dependsOn.filter((d) => ids.has(d)) })) };
}

export function lineFor(s: Shipment, ds: Dataset, today: string): PlanLine {
  if (!s.enabled) return { shipmentId: s.id, serviceId: s.selectedServiceId, state: 'off', price: null, verified: false, issues: [], priceChange: null };
  if (!s.selectedServiceId) return { shipmentId: s.id, serviceId: null, state: 'unselected', price: null, verified: false, issues: [], priceChange: null };
  const svc = serviceById(ds, s.selectedServiceId);
  if (!svc) return { shipmentId: s.id, serviceId: s.selectedServiceId, state: 'ineligible', price: null, verified: false, issues: [msg('plan.service_missing')], priceChange: null };
  const elig = checkEligibility(s, svc, ds);
  const price = priceShipment(s, svc, ds, today);
  const issues: Msg[] = [...elig.hard];
  if (price.status === 'no_fit' && price.reason) issues.push(price.reason);
  let change: PlanLine['priceChange'] = null;
  const snap = s.selectedPriceSnapshot;
  if (snap && price.status === 'priced' && snap.nativeAmount !== null && price.nativeAmount !== null && Math.abs(snap.nativeAmount - price.nativeAmount) > 0.005) {
    change = { oldEur: snap.eur, newEur: price.eur, oldNative: snap.nativeAmount, newNative: price.nativeAmount, currency: price.currency };
    issues.push(msg('plan.price_changed'));
  }
  const ok = issues.filter((m) => m.key !== 'plan.price_changed').length === 0;
  const state: LineState = !ok ? 'ineligible' : price.status === 'priced' && price.eur !== null ? 'priced' : 'unpriced';
  if (state === 'unpriced' && price.reason) issues.push(price.reason);
  return { shipmentId: s.id, serviceId: s.selectedServiceId, state, price, verified: price.verified, issues, priceChange: change };
}

export function computePlanTotals(plan: Plan, ds: Dataset, today: string): PlanTotals {
  const lines = plan.shipments.map((s) => lineFor(s, ds, today));
  const on = lines.filter((l) => l.state !== 'off');
  const priced = lines.filter((l) => l.state === 'priced');
  const byCurrency: Record<string, number> = {};
  for (const l of priced) byCurrency[l.price!.currency!] = (byCurrency[l.price!.currency!] ?? 0) + l.price!.nativeAmount!;
  const known = priced.reduce((a, l) => a + l.price!.eur!, 0);
  const complete = on.length > 0 && priced.length === on.length;
  return {
    lines,
    shipmentCount: on.length,
    pricedCount: priced.length,
    unpricedCount: on.length - priced.length,
    unverifiedCount: priced.filter((l) => !l.verified).length,
    knownSubtotalEur: known,
    grandTotalEur: complete ? known : null,
    complete,
    byCurrency,
    hasWarnings: on.some((l) => l.issues.length > 0),
  };
}
