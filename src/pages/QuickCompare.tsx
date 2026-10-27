import { useState } from 'react';
import { useI18n } from '../i18n';
import { useApp } from '../hooks/useApp';
import { ShipmentForm } from '../components/ShipmentForm';
import { Recommendations } from '../components/Recommendations';
import { shipmentSchema, type Shipment } from '../lib/data/schemas';
import { addShipment, selectService } from '../lib/plans/ops';
import { useRemembered } from '../lib/persistence/remember';
import { PackageGuide } from '../components/PackageGuide';
import { groupOf, presetShipment, routeInGroup, type Preset } from '../lib/recommendations/guide';

export function QuickComparePage() {
  const { t } = useI18n();
  const { plan, savePlan, ds, today } = useApp();
  const fresh = () => shipmentSchema.parse({ id: 'quick', nameKey: 'ship.quick', originCountry: ds.config.quickDefault.origin, destinationCountry: ds.config.quickDefault.destination, category: ds.config.quickDefault.category, weightKg: ds.config.quickDefault.weightKg });
  // The last used Compare form is remembered on this device; it is dropped if it no longer fits the loaded data (e.g. a country was removed).
  const [s, setS] = useRemembered<Shipment>('compare.shipment', fresh, (raw) => {
    const r = shipmentSchema.safeParse(raw);
    const codes = ds.countries.map((c) => c.code) as string[];
    return r.success && codes.includes(r.data.originCountry) && codes.includes(r.data.destinationCountry) ? { ...r.data, id: 'quick' } : null;
  });
  const [added, setAdded] = useState(false);
  const guide = (part: 'chips' | 'result') => <PackageGuide part={part} shipment={s} onPreset={(p: Preset) => { setAdded(false); setS((prev) => { const ok = routeInGroup(ds, p.group, prev.originCountry, prev.destinationCountry); const [o, d] = (ok ? `${prev.originCountry}-${prev.destinationCountry}` : groupOf(ds, p.group)!.defaultRoute).split('-'); return presetShipment(p, d, o); }); }} />;
  return (
    <div className="cmp">
      <aside className="cmp-side">
        {guide('chips')}
        <div className="panel"><h2>{t('quick.title')}</h2><ShipmentForm value={s} onChange={(p) => { setAdded(false); setS((prev) => shipmentSchema.parse({ ...prev, ...p })); }} /></div>
      </aside>
      <div className="cmp-main">
        {guide('result')}
        <div className="panel">
          <Recommendations shipment={s} onSelect={plan ? (serviceId) => {
            const now = new Date().toISOString();
            const withShip = addShipment(plan, s, now);
            const added = withShip.shipments[withShip.shipments.length - 1];
            void savePlan(selectService(withShip, ds, added.id, serviceId, now, today));
            setAdded(true);
          } : undefined} />
          {added && <p className="ok">{t('quick.added')}</p>}
        </div>
      </div>
    </div>
  );
}
