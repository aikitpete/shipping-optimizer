import { useMemo, useState } from 'react';
import { useI18n } from '../i18n';
import { useApp } from '../hooks/useApp';
import { ConfirmDialog, Money, MsgList, StatusBadge, useCountryName, usePlanName, useShipmentName } from '../components/common';
import { ShipmentForm } from '../components/ShipmentForm';
import { Recommendations } from '../components/Recommendations';
import { ComparePlans, OptimizerPanel, PlanCostChart, SequencePanel, TotalsBox } from '../components/PlanPanels';
import { computePlanTotals } from '../lib/plans/totals';
import { addShipment, duplicatePlan, moveShipment, removeShipment, selectService, updateShipment } from '../lib/plans/ops';
import { planFromTemplate, shipmentFromTemplate } from '../lib/plans/templates';
import type { Plan, Shipment } from '../lib/data/schemas';

function ShipmentCard({ plan, s, index, line }: { plan: Plan; s: Shipment; index: number; line: ReturnType<typeof computePlanTotals>['lines'][number] }) {
  const { t } = useI18n();
  const { ds, today, savePlan } = useApp();
  const name = useShipmentName();
  const cname = useCountryName();
  const [edit, setEdit] = useState(false);
  const [options, setOptions] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const now = () => new Date().toISOString();
  const svc = ds.services.find((x) => x.id === s.selectedServiceId);
  return (
    <article className="card" aria-label={name(s)} style={s.enabled ? undefined : { opacity: 0.6 }}>
      <header className="card-head">
        <h3>{index + 1}. {name(s)}</h3>
        <div className="actions">
          <label className="small" style={{ display: 'inline-flex', gap: '0.35rem', alignItems: 'center' }}>
            <input type="checkbox" checked={s.enabled} onChange={(e) => void savePlan(updateShipment(plan, s.id, { enabled: e.target.checked }, now()))} aria-label={t('plan.leg_toggle')} />
            {s.enabled ? t('plan.leg_on') : t('plan.leg_off')}
          </label>
          <button onClick={() => void savePlan(moveShipment(plan, s.id, -1, now()))} aria-label={t('common.up')}>↑</button>
          <button onClick={() => void savePlan(moveShipment(plan, s.id, 1, now()))} aria-label={t('common.down')}>↓</button>
          <button onClick={() => setEdit(!edit)}>{edit ? t('common.close') : t('common.edit')}</button>
          <button className="danger" onClick={() => setConfirmDel(true)}>{t('common.remove')}</button>
        </div>
      </header>
      {!s.enabled && <p className="small muted">{t('plan.leg_off_note')}</p>}
      <p className="muted small">{s.descriptionKey ? t(s.descriptionKey) : s.description}</p>
      <p className="small"><strong>{cname(s.originCountry)} → {cname(s.destinationCountry)}</strong> · {t(`cat.${s.category}`)} · {s.weightKg} kg{s.packages > 1 ? ` × ${s.packages}` : ''}{s.weightProvisional && ` (${t('form.provisional')})`}</p>
      {s.enabled && (<>
      {s.assumptions.length > 0 && <p className="small warn">{t('assume.title')}: {s.assumptions.map((a) => t(`assume.${a}`)).join(' · ')}</p>}
      {edit && <ShipmentForm value={s} onChange={(patch) => void savePlan(updateShipment(plan, s.id, patch, now()))} />}
      <div className="selection">
        <strong>{t('plan.selected')}:</strong>{' '}
        {svc ? (
          <>
            {svc.name} — {line.state === 'priced' || line.state === 'unpriced' || line.state === 'ineligible' ? <Money amount={line.price?.nativeAmount ?? null} currency={line.price?.currency ?? null} /> : null}{' '}
            <StatusBadge status={line.price?.tariffStatus ?? null} />
            <button className="link" onClick={() => void savePlan(selectService(plan, ds, s.id, null, now(), today))}>{t('plan.clear')}</button>
            {line.state === 'ineligible' && <p className="bad small">{t('plan.now_ineligible')}</p>}
            {line.state === 'unpriced' && <p className="warn small">{t('plan.unpriced')}</p>}
            {line.priceChange && <p className="warn small">{t('plan.price_changed_detail', { old: line.priceChange.oldNative ?? 0, now: line.priceChange.newNative ?? 0, cur: line.priceChange.currency ?? '' })}</p>}
            <MsgList items={line.issues.filter((m) => !['plan.price_changed'].includes(m.key))} kind="bad" />
            <MsgList items={line.price?.warnings ?? []} kind="warn" />
          </>
        ) : <span className="muted">{t('plan.none_selected')}</span>}
      </div>
      <button onClick={() => setOptions(!options)}>{options ? t('plan.hide_options') : t('plan.show_options')}</button>
      {options && <Recommendations shipment={s} selectedId={s.selectedServiceId} onSelect={(id) => void savePlan(selectService(plan, ds, s.id, id, now(), today))} />}
      </>)}
      <ConfirmDialog open={confirmDel} title={t('confirm.remove_shipment')} body={name(s)} confirmLabel={t('common.remove')} onCancel={() => setConfirmDel(false)} onConfirm={() => { setConfirmDel(false); void savePlan(removeShipment(plan, s.id, now())); }} />
    </article>
  );
}

export function PlannerPage() {
  const { t } = useI18n();
  const { ds, today, plans, plan, savePlan, addPlan, removePlan, selectPlan } = useApp();
  const planName = usePlanName();
  const [confirmDel, setConfirmDel] = useState(false);
  const [tplShip, setTplShip] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const totals = useMemo(() => (plan ? computePlanTotals(plan, ds, today) : null), [plan, ds, today]);
  if (!plan || !totals) return <p>{t('plan.loading')}</p>;
  const now = () => new Date().toISOString();
  return (
    <div className="page">
      <div className="panel">
        <div className="plantools">
          <label className="field"><span>{t('plan.current')}</span>
            <select value={plan.id} onChange={(e) => selectPlan(e.target.value)}>{plans.map((p) => <option key={p.id} value={p.id}>{planName(p)}</option>)}</select>
          </label>
          <label className="field"><span>{t('plan.rename')}</span>
            <input value={plan.name ?? planName(plan)} onChange={(e) => void savePlan({ ...plan, name: e.target.value || null, nameKey: e.target.value ? null : plan.nameKey, updatedAt: now() })} />
          </label>
          <div className="menu">
            <button aria-haspopup="menu" aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}>⋯ {t('plan.more')}</button>
            {menuOpen && (
              <div role="menu">
                <button role="menuitem" onClick={() => { setMenuOpen(false); void addPlan(duplicatePlan(plan, now(), `${planName(plan)} (${t('plan.copy')})`, null), true); }}>⧉ {t('plan.duplicate')}</button>
                {ds.templates.plans.map((tp) => <button role="menuitem" key={tp.id} onClick={() => { setMenuOpen(false); const p = planFromTemplate(ds, tp.id, now()); if (p) void addPlan(p, true); }}>＋ {t('plan.new_from')} {t(tp.nameKey)}</button>)}
                <button role="menuitem" className="danger" onClick={() => { setMenuOpen(false); setConfirmDel(true); }} disabled={plans.length <= 1}>🗑 {t('plan.delete')}</button>
              </div>
            )}
          </div>
        </div>
        {plans.length <= 1 && <p className="small muted">{t('plan.last_plan_note')}</p>}
      </div>

      <TotalsBox totals={totals} />
      <PlanCostChart plan={plan} totals={totals} />
      <OptimizerPanel plan={plan} />
      <SequencePanel plan={plan} />

      {plan.shipments.map((s, i) => <ShipmentCard key={s.id} plan={plan} s={s} index={i} line={totals.lines[i]} />)}

      <div className="panel row gap wrap">
        <button onClick={() => void savePlan(addShipment(plan, { originCountry: ds.config.newShipmentRoute.origin, destinationCountry: ds.config.newShipmentRoute.destination, nameKey: 'ship.new' }, now()))}>{t('plan.add_shipment')}</button>
        <select value={tplShip} onChange={(e) => setTplShip(e.target.value)} aria-label={t('plan.add_from_template')}>
          <option value="">{t('plan.add_from_template')}</option>
          {ds.templates.shipments.map((x) => <option key={x.id} value={x.id}>{t(x.nameKey)}</option>)}
        </select>
        <button disabled={!tplShip} onClick={() => { const sh = shipmentFromTemplate(ds, tplShip); if (sh) { void savePlan({ ...plan, updatedAt: now(), shipments: [...plan.shipments, sh] }); setTplShip(''); } }}>{t('plan.add')}</button>
      </div>

      <ComparePlans plan={plan} />
      <ConfirmDialog open={confirmDel} title={t('confirm.delete_plan')} body={planName(plan)} confirmLabel={t('plan.delete')} onCancel={() => setConfirmDel(false)} onConfirm={() => { setConfirmDel(false); void removePlan(plan.id); }} />
    </div>
  );
}
