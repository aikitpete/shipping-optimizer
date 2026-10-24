import type { Service, Shipment } from '../data/schemas';

export interface WeightInfo {
  actualPerPackageKg: number;
  dimPerPackageKg: number | null;
  billablePerPackageKg: number;
  dimUsed: boolean;
  dimsMissingForDivisor: boolean;
}

export const hasDims = (s: Shipment) => !!(s.lengthCm && s.widthCm && s.heightCm);
export const sortedDims = (s: Shipment): [number, number, number] | null =>
  hasDims(s) ? ([s.lengthCm!, s.widthCm!, s.heightCm!].sort((a, b) => b - a) as [number, number, number]) : null;

/** Dimensional weight is only applied where the carrier divisor is known (service.dimDivisor). */
export function weightInfo(s: Shipment, svc: Service): WeightInfo {
  const actual = s.weightKg / s.packages;
  const divisor = svc.dimDivisor;
  let dim: number | null = null;
  if (divisor && hasDims(s)) dim = (s.lengthCm! * s.widthCm! * s.heightCm!) / divisor;
  const billable = dim !== null ? Math.max(actual, dim) : actual;
  return {
    actualPerPackageKg: actual,
    dimPerPackageKg: dim,
    billablePerPackageKg: billable,
    dimUsed: dim !== null && dim > actual,
    dimsMissingForDivisor: !!divisor && !hasDims(s),
  };
}
