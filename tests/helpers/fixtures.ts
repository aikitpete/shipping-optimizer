import { bundledDataset } from '../../src/lib/data/nodeData';
import { shipmentSchema, type Shipment } from '../../src/lib/data/schemas';
import type { Dataset } from '../../src/lib/data/dataset';

export const TODAY = '2026-10-13';
export const ds: Dataset = bundledDataset;
export const clone = (): Dataset => structuredClone(bundledDataset);
export const ship = (o: Partial<Shipment> = {}): Shipment =>
  shipmentSchema.parse({ id: 's', originCountry: 'DEU', destinationCountry: 'USA', category: 'mixed_goods', weightKg: 1, ...o });
