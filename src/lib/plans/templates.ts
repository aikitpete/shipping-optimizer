import type { Dataset } from '../data/dataset';
import { shipmentSchema, type Plan, type Shipment } from '../data/schemas';
import { createBlankPlan, createDefaultPlan, newId, swapCountry } from './ops';

export function planFromTemplate(ds: Dataset, templateId: string, now: string): Plan | null {
  const tpl = ds.templates.plans.find((p) => p.id === templateId);
  if (!tpl) return null;
  if (tpl.id === 'blank') return createBlankPlan(now, null, tpl.nameKey);
  if (tpl.basedOn && tpl.countrySwap) {
    const base = createDefaultPlan(ds, now, newId('plan'));
    const [from, to] = Object.entries(tpl.countrySwap)[0];
    return swapCountry(base, from, to, now, null, tpl.nameKey);
  }
  const p = createDefaultPlan(ds, now, newId('plan'));
  return { ...p, nameKey: tpl.nameKey };
}

export function shipmentFromTemplate(ds: Dataset, templateId: string): Shipment | null {
  const t = ds.templates.shipments.find((s) => s.id === templateId);
  return t ? shipmentSchema.parse({ ...t.shipment, id: newId('ship') }) : null;
}
