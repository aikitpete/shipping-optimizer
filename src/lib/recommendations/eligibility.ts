import type { Dataset } from '../data/dataset';
import { transitFor } from '../data/dataset';
import type { Service, Shipment } from '../data/schemas';
import { msg, type Msg } from '../msg';
import { isDocCategory } from '../pricing/price';
import { sortedDims, weightInfo } from '../pricing/weight';
import { limitsFor } from '../data/limits';

export interface Eligibility { eligible: boolean; hard: Msg[]; warnings: Msg[] }

/**
 * Hard ineligibility ONLY when the data says so explicitly (false / prohibited / confirmed limit exceeded).
 * "unconfirmed" never excludes a service: it yields a warning.
 */
export function checkEligibility(s: Shipment, svc: Service, ds: Dataset): Eligibility {
  const hard: Msg[] = [];
  const warnings: Msg[] = [];
  const routeId = `${s.originCountry}-${s.destinationCountry}`;
  const name = { service: svc.name };

  if (svc.unavailableRoutes[routeId]) hard.push(msg(`reason.unavail.${svc.unavailableRoutes[routeId]}`, name));
  else if (!svc.routes.includes(routeId)) hard.push(msg('reason.route_unsupported', name));

  const docs = isDocCategory(s.category);
  if (svc.docsOnly && !docs) hard.push(msg('reason.docs_only', name));
  if (!svc.allowsMerchandise && !docs) hard.push(msg('reason.no_merchandise', name));

  const lim = limitsFor(svc, routeId);
  const w = weightInfo(s, svc);
  if (w.actualPerPackageKg > lim.maxKg + 1e-9) hard.push(msg('reason.too_heavy', { max: lim.maxKg, kg: Math.round(w.actualPerPackageKg * 1000) / 1000 }));

  const sd = sortedDims(s);
  if (sd) {
    const over =
      (lim.maxLengthCm !== undefined && sd[0] > lim.maxLengthCm + 1e-9) ||
      (lim.maxSumCm !== undefined && sd[0] + 2 * (sd[1] + sd[2]) > lim.maxSumCm + 1e-9) ||
      (lim.maxTotalCm !== undefined && sd[0] + sd[1] + sd[2] > lim.maxTotalCm + 1e-9) ||
      (lim.maxSideSumCm !== undefined && sd[0] + sd[2] > lim.maxSideSumCm + 1e-9) ||
      (lim.maxDimsCm !== undefined && lim.maxDimsCm.some((m, i) => sd[i] > m + 1e-9));
    if (over) (lim.confirmed ? hard : warnings).push(msg(lim.confirmed ? 'reason.too_large' : 'warn.limit_exceeds_unconfirmed'));
    if (lim.minFaceCm && (sd[0] < lim.minFaceCm[0] - 1e-9 || sd[1] < lim.minFaceCm[1] - 1e-9)) (lim.confirmed ? hard : warnings).push(msg('reason.too_small', { a: lim.minFaceCm[0], b: lim.minFaceCm[1] }));
  }
  if (!lim.confirmed) warnings.push(msg('warn.limits_unconfirmed'));

  const need = (flag: boolean, val: boolean | 'unconfirmed', hardKey: string, warnKey: string) => {
    if (!flag) return;
    if (val === false) hard.push(msg(hardKey, name));
    else if (val === 'unconfirmed') warnings.push(msg(warnKey));
  };
  need(s.trackingRequired, svc.tracking, 'reason.no_tracking', 'warn.tracking_unconfirmed');
  need(s.signatureRequired, svc.signature, 'reason.no_signature', 'warn.signature_unconfirmed');
  need(s.insuranceDesired, svc.insurance, 'reason.no_insurance', 'warn.insurance_unconfirmed');
  need(s.irreplaceable, svc.irreplaceable, 'reason.no_irreplaceable', 'warn.irreplaceable_unconfirmed');

  if (s.battery.type !== 'none') {
    if (svc.lithium === 'prohibited') hard.push(msg('reason.battery_prohibited', name));
    else warnings.push(msg(svc.lithium === 'restricted' ? 'warn.battery_restricted' : 'warn.battery_unconfirmed'));
  }

  if (s.senderType === 'business') {
    if (svc.senderTypes.business === false) hard.push(msg('reason.no_business', name));
    else if (svc.senderTypes.business === 'unconfirmed') warnings.push(msg('warn.business_unconfirmed'));
  } else {
    if (svc.senderTypes.private === false) hard.push(msg('reason.no_private', name));
    if (svc.businessAccountRequired === true) hard.push(msg('reason.account_required', name));
    else if (svc.businessAccountRequired === 'unconfirmed') warnings.push(msg('warn.account_unconfirmed'));
  }

  if (s.deliveryMethod === 'facility_collection') {
    const r = ds.restrictions.find((x) => x.kind === 'collection' && x.appliesTo.includes(svc.id) && x.routes.includes(routeId));
    if (r?.status === 'confirmed_restricted') hard.push(msg('reason.no_collection', name));
    else if (svc.collection === false) hard.push(msg('reason.no_collection', name));
    else warnings.push(msg('warn.collection_unconfirmed'));
  }
  if (s.pickupRequired && svc.dropoff === 'post_office') warnings.push(msg('warn.pickup_unconfirmed'));

  if (s.deadlineDays != null) {
    const t = transitFor(ds, svc.id, routeId);
    if (!t) warnings.push(msg('warn.transit_unknown'));
    else if (t.minDays > s.deadlineDays) warnings.push(msg('warn.deadline_unlikely', { days: s.deadlineDays }));
    else if (t.maxDays > s.deadlineDays) warnings.push(msg('warn.deadline_risky', { days: s.deadlineDays }));
  }
  if (svc.availability === 'lead') warnings.push(msg('warn.lead_only'));
  if (svc.availability === 'quote_only') warnings.push(msg('warn.quote_only_service'));
  return { eligible: hard.length === 0, hard, warnings };
}
