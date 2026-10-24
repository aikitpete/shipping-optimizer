import type { Limits, Service } from './schemas';

export type EffectiveLimits = Limits & { maxKg: number };

/** Limits that apply to one route of a service: the route override if present, otherwise the service default. */
export function limitsFor(svc: Service, routeId: string): EffectiveLimits {
  const l = svc.routeLimits?.[routeId] ?? svc.limits;
  return { ...l, maxKg: l.maxKg ?? svc.maxKg };
}

/** Human-readable limit parts: [i18n key, params]. Only parts the data actually knows. */
export function limitParts(l: EffectiveLimits): { key: string; params: Record<string, string | number> }[] {
  const out: { key: string; params: Record<string, string | number> }[] = [{ key: 'limits.max_kg', params: { n: l.maxKg } }];
  if (l.maxDimsCm?.length) out.push({ key: 'limits.box', params: { d: l.maxDimsCm.join(' × ') } });
  if (l.maxLengthCm !== undefined) out.push({ key: 'limits.longest', params: { n: l.maxLengthCm } });
  if (l.maxSumCm !== undefined) out.push({ key: 'limits.girth', params: { n: l.maxSumCm } });
  if (l.maxTotalCm !== undefined) out.push({ key: 'limits.total', params: { n: l.maxTotalCm } });
  if (l.maxSideSumCm !== undefined) out.push({ key: 'limits.sidesum', params: { n: l.maxSideSumCm } });
  if (l.minFaceCm) out.push({ key: 'limits.min_face', params: { a: l.minFaceCm[0], b: l.minFaceCm[1] } });
  return out;
}
