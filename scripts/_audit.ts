import { bundledDataset as ds } from '../src/lib/data/nodeData';
import { shipmentSchema } from '../src/lib/data/schemas';
import { recommend, DEFAULT_WEIGHTS } from '../src/lib/recommendations/recommend';
const [o, d, kg, cat] = [process.argv[2], process.argv[3], Number(process.argv[4]), process.argv[5] ?? 'documents'];
const s = shipmentSchema.parse({ id: 's', originCountry: o, destinationCountry: d, category: cat, weightKg: kg });
const r = recommend(s, ds, DEFAULT_WEIGHTS, '2026-10-28');
const row = (c: any, tag: string) => console.log(tag.padEnd(10), c.service.id.padEnd(28), String(c.price.eur?.toFixed(2) ?? '-').padStart(8), (c.price.tariffStatus ?? '-').padEnd(18), c.transit ? `${c.transit.minDays}-${c.transit.maxDays} ${c.transit.status}` : 'NO TRANSIT', (c.price.reason?.key ?? ''));
r.ranked.forEach((c) => row(c, 'priced')); r.needsQuote.forEach((c) => row(c, 'quote')); r.ineligible.forEach((i) => row(i.candidate, 'inelig:' + i.reasons.map((x) => x.key).join(',')));
