import { describe, expect, it } from 'vitest';
import { createDefaultPlan } from '../src/lib/plans/ops';
import { DEFAULT_WEIGHTS, recommend } from '../src/lib/recommendations/recommend';
import { computePlanTotals } from '../src/lib/plans/totals';
import { ds, TODAY } from './helpers/fixtures';

const plan = createDefaultPlan(ds, '2026-10-13T00:00:00.000Z');
const rec = (id: string) => recommend(plan.shipments.find((s) => s.id === id)!, ds, DEFAULT_WEIGHTS, TODAY);
const ranked = (id: string) => rec(id).ranked.map((c) => c.service.id);
const inel = (id: string) => rec(id).ineligible.map((c: any) => (c.service ?? c).id ?? c.serviceId);

describe('the demo story: each shipment teaches one thing', () => {
  it('has the six launch shipments with dependencies', () => {
    expect(plan.shipments.map((s) => s.id)).toEqual(['ship-1', 'ship-2', 'ship-3', 'ship-4', 'ship-5', 'ship-6']);
    expect(plan.shipments[1].dependsOn).toEqual(['ship-1']);
  });
  it('1 · urgent signed documents: the express envelope is the fastest pick, the postal letter the cheapest', () => {
    const r = rec('ship-1');
    expect(r.top.fastest?.service.id).toBe('mx-envelope');
    expect(r.top.cheapest?.service.id).toBe('np-letter-registered');
  });
  it('2 · installed lithium-ion battery rules out the prohibited postal parcel', () => {
    expect(ranked('ship-2')).not.toContain('np-parcel-economy');
    expect(JSON.stringify(rec('ship-2').ineligible)).toContain('reason.battery_prohibited');
  });
  it('3 · a bulky light carton: volumetric weight makes the postal parcel cheapest by a wide margin', () => {
    const r = rec('ship-3');
    expect(r.top.cheapest?.service.id).toBe('np-parcel-economy');
    const express = r.ranked.find((c) => c.service.id === 'mx-express')!;
    expect(express.price.eur!).toBeGreaterThan(2.5 * r.top.cheapest!.price.eur!);
  });
  it('4 · Brazil: estimates and quote-only freight keep the answer honest', () => {
    const r = rec('ship-4');
    expect(r.needsQuote.map((c) => c.service.id)).toContain('af-consolidated');
    expect(r.needsQuote.map((c) => c.service.id)).toContain('ph-best-rate');
  });
  it('5 · the return leg runs on its own route and only the express carrier serves it', () => {
    expect(new Set(ranked('ship-5'))).toEqual(new Set(['mx-express', 'mx-economy']));
  });
  it('6 · a 22 kg, 100 cm flight case is over every postal limit', () => {
    expect(ranked('ship-6')).toContain('mx-express');
    for (const id of ['np-parcel-economy', 'np-parcel-priority', 'np-letter-registered']) expect(ranked('ship-6')).not.toContain(id);
  });
  it('an unpriced plan is flagged incomplete, never silently summed', () => {
    const t = computePlanTotals(plan, ds, TODAY);
    expect(t.complete).toBe(false);
  });
});
