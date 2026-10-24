import { useEffect, useRef, type ReactNode } from 'react';
import { useI18n } from '../i18n';
import { useApp } from '../hooks/useApp';
import { fmtMoney, toEur } from '../lib/pricing/currency';
import type { Msg } from '../lib/msg';
import type { Shipment, Plan } from '../lib/data/schemas';

export function StatusBadge({ status }: { status: string | null }) {
  const { t } = useI18n();
  if (!status) return null;
  return <span className={`badge st-${status}`} title={t(`status.${status}.help`)}>{t(`status.${status}`)}</span>;
}

export function Money({ amount, currency, partial }: { amount: number | null; currency: string | null; partial?: boolean }) {
  const { lang, t } = useI18n();
  const { prefs, ds } = useApp();
  if (amount === null || currency === null) return <span className="muted">{t('money.none')}</span>;
  const eur = toEur(amount, currency, ds.rates);
  const native = fmtMoney(amount, currency, lang);
  const eurS = eur === null ? null : fmtMoney(eur, 'EUR', lang);
  const pre = partial ? '≥ ' : '';
  if (currency === 'EUR') return <strong>{pre}{native}</strong>;
  if (prefs.currencyDisplay === 'native') return <strong>{pre}{native}</strong>;
  if (prefs.currencyDisplay === 'eur') return <strong>{pre}{eurS ?? `${native} (${t('money.no_rate')})`}</strong>;
  return <span><strong>{pre}{native}</strong> <span className="muted">{eurS ? `≈ ${eurS}` : `(${t('money.no_rate')})`}</span></span>;
}

export function MsgList({ items, kind }: { items: Msg[]; kind?: 'warn' | 'bad' }) {
  const { tm } = useI18n();
  if (!items.length) return null;
  return <ul className={`msgs ${kind ?? ''}`}>{items.map((m, i) => <li key={i}>{tm(m)}</li>)}</ul>;
}

/** Country display name in the active language, from the data profile (routes file). */
export function useCountryName() {
  const { lang } = useI18n();
  const { ds } = useApp();
  return (code: string) => ds.countries.find((c) => c.code === code)?.name[lang] ?? code;
}
export function useShipmentName() {
  const { t } = useI18n();
  return (s: Shipment) => s.name ?? (s.nameKey ? t(s.nameKey) : s.id);
}
export function usePlanName() {
  const { t } = useI18n();
  return (p: Plan) => p.name ?? (p.nameKey ? t(p.nameKey) : p.id);
}

export function ConfirmDialog({ open, title, body, confirmLabel, onConfirm, onCancel }: { open: boolean; title: string; body: string; confirmLabel: string; onConfirm: () => void; onCancel: () => void }) {
  const { t } = useI18n();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (open) ref.current?.focus(); }, [open]);
  if (!open) return null;
  return (
    <div className="overlay" role="presentation" onClick={onCancel}>
      <div className="dialog" role="alertdialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={ref} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.key === 'Escape' && onCancel()}>
        <h3>{title}</h3>
        <p>{body}</p>
        <div className="row end"><button onClick={onCancel}>{t('common.cancel')}</button><button className="danger" onClick={onConfirm}>{confirmLabel}</button></div>
      </div>
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return <label className="field"><span>{label}</span>{children}{hint && <small className="muted">{hint}</small>}</label>;
}

export function download(filename: string, text: string, mime = 'application/json') {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
