import type { Dataset } from '../data/dataset';
import type { Shipment } from '../data/schemas';
import { shipmentSchema, type PresetDef } from '../data/schemas';
import { recommend, type Candidate, type RankWeights } from './recommend';

export interface Preset extends PresetDef { group: string }

/** Package presets come from the active profile's config (guide.groups[].presets). */
export const presetsOf = (ds: Dataset): Preset[] => ds.config.guide.groups.flatMap((g) => g.presets.map((p) => ({ ...p, group: g.id })));
export const groupOf = (ds: Dataset, id: string) => ds.config.guide.groups.find((g) => g.id === id);
/** Does the route belong to the group the preset was written for? */
export const routeInGroup = (ds: Dataset, groupId: string, origin: string, dest: string) => !!groupOf(ds, groupId)?.routes.includes(`${origin}-${dest}`);

export function presetShipment(p: Preset, dest: string, origin: string, base?: Partial<Shipment>): Shipment {
  return shipmentSchema.parse({
    ...base, id: 'quick', nameKey: 'ship.quick', originCountry: origin, destinationCountry: dest, category: p.category, weightKg: p.weightKg,
    lengthCm: p.dims[0], widthCm: p.dims[1], heightCm: p.dims[2], dimsProvisional: false, weightProvisional: false,
    battery: { type: 'none', quantity: 0, installed: false },
  });
}

export interface GuideResult { standard: Candidate | null; faster: Candidate | null; fastest: Candidate | null; ranked: Candidate[] }

const maxDays = (c: Candidate) => c.transit?.maxDays ?? Infinity;

export function guideForRoute(p: Preset, origin: string, dest: string, ds: Dataset, weights: RankWeights, today: string): GuideResult {
  const grp = groupOf(ds, p.group);
  const r = recommend(presetShipment(p, dest, origin), ds, weights, today);
  // Documents: prefer the group's tracked document service over the plain cheapest parcel when it is priced.
  const standard = (p.docs && grp?.docServiceId ? r.ranked.find((c) => c.service.id === grp.docServiceId) : null) ?? r.top.cheapest;
  const rest = r.ranked.filter((c) => c !== standard);
  const faster = grp?.fasterRule === 'other_provider'
    ? (rest.find((c) => c.provider?.id !== standard?.provider?.id) ?? null)
    : rest.filter((c) => maxDays(c) <= 10 && (standard ? c.price.eur! > standard.price.eur! : true))[0] ?? null;
  const fast = r.top.fastest && r.top.fastest !== standard && r.top.fastest !== faster ? r.top.fastest : null;
  return { standard, faster, fastest: fast, ranked: r.ranked };
}
/** Convenience: preset on its group's default origin. */
export function guideFor(p: Preset, dest: string, ds: Dataset, weights: RankWeights, today: string, origin?: string): GuideResult {
  const g = groupOf(ds, p.group);
  return guideForRoute(p, origin ?? g?.defaultRoute.split('-')[0] ?? '', dest, ds, weights, today);
}
