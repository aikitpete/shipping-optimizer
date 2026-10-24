import { useMemo, useState } from 'react';
import { useI18n } from '../i18n';
import { useApp } from '../hooks/useApp';
import type { Plan } from '../lib/data/schemas';
import { activePlan, computePlanTotals, type PlanTotals } from '../lib/plans/totals';
import { findConsolidation, strategyResults } from '../lib/plans/optimize';
import { sequenceOrder } from '../lib/plans/ops';
import { fmtMoney } from '../lib/pricing/currency';
import { useShipmentName, usePlanName } from './common';
import { BarChart, StackedBar, eur0 } from './charts';

export function TotalsBox({ totals }: { totals: PlanTotals }) {
  const { t, lang } = useI18n();
  const eur = (n: number) => fmtMoney(n, 'EUR', lang);
  if (totals.shipmentCount === 0) return <div className="totals"><span className="muted">{t('totals.empty')}</span></div>;
  return (
    <div className={`totals sticky ${totals.complete ? 'complete' : 'incomplete'}`} role="status">
      {totals.complete ? (
        <>
          <div className="small muted">{t('totals.total_complete', { n: totals.shipmentCount })}</div>
          <div className="big">{eur(totals.grandTotalEur!)}</div>
        </>
      ) : (
        <>
          <div className="small bad">{t('totals.incomplete', { missing: totals.unpricedCount, n: totals.shipmentCount })}</div>
          <div className="big">{t('totals.subtotal_atleast', { amount: eur(totals.knownSubtotalEur) })}</div>
          <div className="small muted">{t('totals.not_final')}</div>
        </>
      )}
      {totals.unverifiedCount > 0 && <div className="small warn">{t('totals.unverified', { k: totals.unverifiedCount, n: totals.pricedCount })}</div>}
      {Object.keys(totals.byCurrency).length > 0 && (
        <div className="small muted">{t('totals.native')}: {Object.entries(totals.byCurrency).map(([c, v]) => fmtMoney(v, c, lang)).join(' + ')}</div>
      )}
    </div>
  );
}

export function SequencePanel({ plan }: { plan: Plan }) {
  const { t } = useI18n();
  const name = useShipmentName();
  const act = activePlan(plan);
  const order = sequenceOrder(act);
  const byId = new Map(act.shipments.map((s) => [s.id, s]));
  if (!act.shipments.length) return null;
  return (
    <div className="panel">
      <h3>{t('seq.title')}</h3>
      <ol>{order.map((id) => {
        const s = byId.get(id)!;
        const deps = s.dependsOn.map((d) => byId.get(d)).filter(Boolean).map((d) => name(d!));
        return <li key={id}><strong>{name(s)}</strong>{deps.length > 0 && <span className="muted small"> — {t('seq.after', { list: deps.join(', ') })}</span>}</li>;
      })}</ol>
    </div>
  );
}

export function OptimizerPanel({ plan }: { plan: Plan }) {
  const { t, lang } = useI18n();
  const { ds, today, prefs, addPlan, savePlan } = useApp();
  const name = useShipmentName();
  const [open, setOpen] = useState(true);
  const strategies = useMemo(() => (open ? strategyResults(plan, ds, today, prefs.rankWeights) : []), [open, plan, ds, today, prefs.rankWeights]);
  const cons = useMemo(() => (open ? findConsolidation(plan, ds, today, prefs.rankWeights) : null), [open, plan, ds, today, prefs.rankWeights]);
  const eur = (n: number) => fmtMoney(n, 'EUR', lang);
  const byId = new Map(plan.shipments.map((s) => [s.id, s]));
  const svcName = (id: string | null) => (id ? ds.services.find((s) => s.id === id)?.name ?? id : t('opt.none'));
  const apply = (selections: { shipmentId: string; serviceId: string | null }[]) => {
    const now = new Date().toISOString();
    void savePlan({ ...plan, updatedAt: now, shipments: plan.shipments.map((s) => ({ ...s, selectedServiceId: selections.find((x) => x.shipmentId === s.id)?.serviceId ?? s.selectedServiceId, selectedPriceSnapshot: null })) });
  };
  return (
    <div className="panel">
      <div className="row between"><h3>{t('opt.suggest_title')}</h3><button onClick={() => setOpen(!open)}>{open ? t('common.hide') : t('opt.run')}</button></div>
      {open && (
        <>
          <p className="small muted">{t('opt.suggest_note')} {t('opt.note')}</p>
          {strategies.some((x) => x.totals.complete) && (
            <BarChart ariaLabel={t('chart.strat_aria')} rows={strategies.map((x) => ({ id: x.id, label: t(`pick.${x.id}`), value: x.totals.complete ? x.totals.grandTotalEur : null, valueText: x.totals.complete ? `${eur0(x.totals.grandTotalEur!)} €` : '—', solid: x.totals.unverifiedCount === 0, sub: x.maxTransitDays !== null ? t('transit.days', { d: x.maxTransitDays }) : undefined }))} />
          )}
          <table className="tbl stack"><thead><tr><th>{t('opt.strategy')}</th><th>{t('opt.total')}</th><th>{t('opt.longest')}</th><th /></tr></thead>
            <tbody>{strategies.map((s) => (
              <tr key={s.id}>
                <td data-label=""><strong>{t(`pick.${s.id}`)}</strong>
                  <details><summary className="small">{t('opt.picks')}</summary><ul className="small">{s.picks.map((p) => <li key={p.shipmentId}>{name(byId.get(p.shipmentId)!)}: {svcName(p.serviceId)}</li>)}</ul></details></td>
                <td data-label={t('opt.total')}>{s.totals.complete ? <strong>{eur(s.totals.grandTotalEur!)}</strong> : <span className="bad">{t('totals.subtotal_atleast', { amount: eur(s.totals.knownSubtotalEur) })}<div className="small">{t('totals.incomplete', { missing: s.totals.unpricedCount, n: s.totals.shipmentCount })}</div></span>}
                  {s.totals.unverifiedCount > 0 && <div className="small warn">{t('totals.unverified', { k: s.totals.unverifiedCount, n: s.totals.pricedCount })}</div>}</td>
                <td className="small" data-label={t('opt.longest')}>{s.maxTransitDays !== null ? t('transit.days', { d: s.maxTransitDays }) : '—'}</td>
                <td data-label=""><button className="primary" onClick={() => apply(s.picks)}>{t('opt.apply')}</button></td>
              </tr>))}</tbody></table>
          <h4>{t('opt.consolidation')}</h4>
          {cons ? (
            <div className="proposal">
              <p>{t('opt.cons_text', { absorbed: name(byId.get(cons.absorbedShipmentId)!), merged: name(byId.get(cons.mergedShipmentId)!), via: name(byId.get(cons.viaShipmentId)!) })}</p>
              <p>{cons.savingEur === null ? <span className="warn">{t('opt.cons_unknown')}</span> : cons.savingEur > 0 ? <strong>{t('opt.cons_saving', { amount: eur(cons.savingEur) })}</strong> : <span>{t('opt.cons_no_saving', { amount: eur(-cons.savingEur) })}</span>}</p>
              <p className="small muted">{t('opt.cons_assumptions')}</p>
              <button onClick={() => void addPlan(cons.proposedPlan, true)}>{t('opt.cons_apply')}</button>
            </div>
          ) : <p className="muted">{t('opt.cons_none')}</p>}
        </>
      )}
    </div>
  );
}

export function ComparePlans({ plan }: { plan: Plan }) {
  const { t, lang } = useI18n();
  const { plans, ds, today } = useApp();
  const planName = usePlanName();
  const others = plans.filter((p) => p.id !== plan.id);
  const [otherId, setOtherId] = useState<string>('');
  const other = others.find((p) => p.id === otherId);
  const a = useMemo(() => computePlanTotals(plan, ds, today), [plan, ds, today]);
  const b = useMemo(() => (other ? computePlanTotals(other, ds, today) : null), [other, ds, today]);
  const eur = (n: number) => fmtMoney(n, 'EUR', lang);
  const cell = (x: PlanTotals) => x.complete ? <strong>{eur(x.grandTotalEur!)}</strong> : <span className="bad">{t('totals.subtotal_atleast', { amount: eur(x.knownSubtotalEur) })} · {t('totals.incomplete', { missing: x.unpricedCount, n: x.shipmentCount })}</span>;
  return (
    <div className="panel">
      <h3>{t('cmp.title')}</h3>
      {others.length === 0 ? <p className="muted">{t('cmp.none')}</p> : (
        <>
          <select value={otherId} onChange={(e) => setOtherId(e.target.value)} aria-label={t('cmp.choose')}>
            <option value="">{t('cmp.choose')}</option>
            {others.map((p) => <option key={p.id} value={p.id}>{planName(p)}</option>)}
          </select>
          {b && other && (
            <table className="tbl"><thead><tr><th /><th>{planName(plan)}</th><th>{planName(other)}</th></tr></thead><tbody>
              <tr><td>{t('cmp.total')}</td><td>{cell(a)}</td><td>{cell(b)}</td></tr>
              <tr><td>{t('cmp.shipments')}</td><td>{a.shipmentCount}</td><td>{b.shipmentCount}</td></tr>
              <tr><td>{t('cmp.priced')}</td><td>{a.pricedCount}</td><td>{b.pricedCount}</td></tr>
              <tr><td>{t('cmp.unverified')}</td><td>{a.unverifiedCount}</td><td>{b.unverifiedCount}</td></tr>
              {a.complete && b.complete && <tr><td>{t('cmp.diff')}</td><td colSpan={2}>{eur(b.grandTotalEur! - a.grandTotalEur!)}</td></tr>}
            </tbody></table>
          )}
        </>
      )}
    </div>
  );
}

export function PlanCostChart({ plan, totals }: { plan: Plan; totals: PlanTotals }) {
  const { t } = useI18n();
  const { ds } = useApp();
  const name = useShipmentName();
  const rows = plan.shipments.map((s, i) => {
    const l = totals.lines[i];
    const svc = ds.services.find((x) => x.id === l.serviceId)?.name;
    const eur = l.state === 'priced' ? l.price?.eur ?? null : null;
    return {
      id: s.id, label: name(s), sub: svc, value: eur,
      valueText: l.state === 'off' ? t('plan.leg_off') : eur === null ? '—' : `${eur0(eur)} €`,
      solid: l.verified, tip: <>{name(s)}<br />{l.state === 'off' ? t('plan.leg_off') : svc ?? t('plan.none_selected')}</>,
    };
  });
  if (rows.every((r) => r.value === null)) return null;
  const segs = plan.shipments.flatMap((s, i) => {
    const e = totals.lines[i].state === 'priced' ? totals.lines[i].price?.eur ?? 0 : 0;
    return e > 0 ? [{ id: s.id, label: name(s), value: e, color: `var(--c${(i % 4) + 1})` }] : [];
  });
  return (
    <div className="chartbox">
      <h4>{t('chart.plan_title')}</h4>
      <p className="sub">{t('chart.plan_sub')}</p>
      <BarChart rows={rows} ariaLabel={t('chart.plan_aria')} />
      {segs.length > 1 && <StackedBar segs={segs} ariaLabel={t('chart.share_aria')} fmt={(n) => `${eur0(n)} €`} />}
    </div>
  );
}
