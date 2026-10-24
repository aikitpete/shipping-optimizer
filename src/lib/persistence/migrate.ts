import { CURRENT_SCHEMA, planSchema, type Plan } from '../data/schemas';

/**
 * Brings stored plans up to CURRENT_SCHEMA.
 *  v2 → v3: shipments gain `enabled` (default true).
 *  v0/v1 → v2: shipments gain defaults for fields added later (zod defaults), `schemaVersion` is stamped,
 *  and legacy `selectedService` strings become `selectedServiceId`.
 */
export function migratePlan(raw: unknown): Plan {
  const r = structuredClone(raw) as Record<string, unknown>;
  const v = typeof r.schemaVersion === 'number' ? r.schemaVersion : 0;
  if (v > CURRENT_SCHEMA) throw new Error(`Plan schema ${v} is newer than supported ${CURRENT_SCHEMA}`);
  if (v < 2 && Array.isArray(r.shipments)) {
    r.shipments = (r.shipments as Record<string, unknown>[]).map((s) => {
      if (s.selectedService && !s.selectedServiceId) { s.selectedServiceId = s.selectedService; delete s.selectedService; }
      return s;
    });
  }
  const now = new Date().toISOString();
  return planSchema.parse({ createdAt: now, updatedAt: now, ...r, schemaVersion: CURRENT_SCHEMA });
}
