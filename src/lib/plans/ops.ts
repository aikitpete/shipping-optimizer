import type { Dataset } from '../data/dataset';
import { serviceById } from '../data/dataset';
import { CURRENT_SCHEMA, planSchema, shipmentSchema, type Plan, type Shipment } from '../data/schemas';
import { priceShipment } from '../pricing/price';
import { makeSnapshot } from './totals';

let counter = 0;
export function newId(prefix = 'id'): string {
  counter += 1;
  const rnd = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10);
  return `${prefix}-${Date.now().toString(36)}-${counter}${rnd}`;
}

export function createDefaultPlan(ds: Dataset, now: string, id: string = ds.config.defaultPlanId): Plan {
  const tpl = ds.templates.plans.find((p) => p.id === ds.config.defaultPlanId)!;
  return planSchema.parse({
    id, schemaVersion: CURRENT_SCHEMA, nameKey: tpl.nameKey, name: null, notes: '', createdAt: now, updatedAt: now,
    shipments: (tpl.shipments ?? []).map((s) => shipmentSchema.parse(s)),
  });
}

export function createBlankPlan(now: string, name: string | null, nameKey: string | null = 'tpl.blank.name'): Plan {
  return planSchema.parse({ id: newId('plan'), schemaVersion: CURRENT_SCHEMA, nameKey: name ? null : nameKey, name, createdAt: now, updatedAt: now, shipments: [] });
}

/** Copy a plan with new plan and shipment ids; dependsOn references are remapped. */
export function duplicatePlan(plan: Plan, now: string, name: string | null, nameKey: string | null): Plan {
  const map = new Map(plan.shipments.map((s) => [s.id, newId('ship')] as const));
  const copy = structuredClone(plan);
  return {
    ...copy, id: newId('plan'), name, nameKey: name ? null : nameKey, createdAt: now, updatedAt: now,
    shipments: copy.shipments.map((s) => ({ ...s, id: map.get(s.id)!, dependsOn: s.dependsOn.filter((d) => map.has(d)).map((d) => map.get(d)!) })),
  };
}

/** Replace one country in a plan (e.g. one destination replaced by a neighbouring one). Selections and snapshots are cleared because routes change. */
export function swapCountry(plan: Plan, from: string, to: string, now: string, name: string | null, nameKey: string | null): Plan {
  const p = duplicatePlan(plan, now, name, nameKey);
  p.shipments = p.shipments.map((s) => {
    const o = s.originCountry === from ? to : s.originCountry;
    const d = s.destinationCountry === from ? to : s.destinationCountry;
    return o === s.originCountry && d === s.destinationCountry ? s : { ...s, originCountry: o, destinationCountry: d, selectedServiceId: null, selectedPriceSnapshot: null };
  });
  return p;
}

export function addShipment(plan: Plan, s: Partial<Shipment> & Pick<Shipment, 'originCountry' | 'destinationCountry'>, now: string): Plan {
  const sh = shipmentSchema.parse({ ...s, id: newId('ship') });
  return { ...plan, updatedAt: now, shipments: [...plan.shipments, sh] };
}

export function updateShipment(plan: Plan, id: string, patch: Partial<Shipment>, now: string): Plan {
  return {
    ...plan, updatedAt: now,
    shipments: plan.shipments.map((s) => {
      if (s.id !== id) return s;
      const routeChanged = (patch.originCountry && patch.originCountry !== s.originCountry) || (patch.destinationCountry && patch.destinationCountry !== s.destinationCountry);
      return shipmentSchema.parse({ ...s, ...patch, ...(routeChanged ? { selectedServiceId: null, selectedPriceSnapshot: null } : {}) });
    }),
  };
}

export function removeShipment(plan: Plan, id: string, now: string): Plan {
  return { ...plan, updatedAt: now, shipments: plan.shipments.filter((s) => s.id !== id).map((s) => ({ ...s, dependsOn: s.dependsOn.filter((d) => d !== id) })) };
}

export function moveShipment(plan: Plan, id: string, dir: -1 | 1, now: string): Plan {
  const i = plan.shipments.findIndex((s) => s.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= plan.shipments.length) return plan;
  const arr = [...plan.shipments];
  [arr[i], arr[j]] = [arr[j], arr[i]];
  return { ...plan, updatedAt: now, shipments: arr };
}

/** Select a service for a shipment and snapshot the price at selection time. */
export function selectService(plan: Plan, ds: Dataset, shipmentId: string, serviceId: string | null, now: string, today: string): Plan {
  return {
    ...plan, updatedAt: now,
    shipments: plan.shipments.map((s) => {
      if (s.id !== shipmentId) return s;
      if (!serviceId) return { ...s, selectedServiceId: null, selectedPriceSnapshot: null };
      const svc = serviceById(ds, serviceId);
      const price = svc ? priceShipment(s, svc, ds, today) : null;
      return { ...s, selectedServiceId: serviceId, selectedPriceSnapshot: price && price.status === 'priced' ? makeSnapshot(price, serviceId, now) : null };
    }),
  };
}

/** Topological order by dependsOn; stable w.r.t. the original order; cycles fall back to original order for remaining items. */
export function sequenceOrder(plan: Plan): string[] {
  const ids = plan.shipments.map((s) => s.id);
  const done = new Set<string>();
  const out: string[] = [];
  let progress = true;
  while (out.length < ids.length && progress) {
    progress = false;
    for (const s of plan.shipments) {
      if (done.has(s.id)) continue;
      if (s.dependsOn.every((d) => done.has(d) || !ids.includes(d))) { out.push(s.id); done.add(s.id); progress = true; }
    }
  }
  for (const id of ids) if (!done.has(id)) out.push(id);
  return out;
}
