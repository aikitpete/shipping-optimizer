import { useEffect, useState, type ReactNode } from 'react';
import { useI18n } from '../i18n';
import { useApp } from '../hooks/useApp';
import { categories, type Shipment } from '../lib/data/schemas';
import { useCountryName } from './common';

export function NumInput({ value, onCommit, nullable, min = 0, step = 'any', id, ariaLabel }: { value: number | null; onCommit: (v: number | null) => void; nullable?: boolean; min?: number; step?: string; id?: string; ariaLabel?: string }) {
  const [txt, setTxt] = useState(value === null ? '' : String(value));
  useEffect(() => { setTxt(value === null ? '' : String(value)); }, [value]);
  const invalid = txt !== '' && !(Number(txt) > min - (min === 0 ? 0 : 1e-12) && Number.isFinite(Number(txt)));
  return (
    <input id={id} aria-label={ariaLabel} type="number" inputMode="decimal" step={step} min={min} value={txt} aria-invalid={invalid}
      onChange={(e) => {
        setTxt(e.target.value);
        const v = e.target.value.trim();
        if (v === '') { if (nullable) onCommit(null); return; }
        const n = Number(v);
        if (Number.isFinite(n) && n > 0) onCommit(n);
      }} />
  );
}

const CAT_ICON: Record<string, string> = { documents: '📄', original_documents: '📜', certified_copies: '📑', clothing: '👕', electronics: '🔌', books: '📚', gifts: '🎁', mixed_goods: '📦', other: '✳️' };
const DELIV_ICON: Record<string, string> = { any: '🔀', home: '🏠', facility_collection: '🏤' };
const BUDGET_ICON: Record<string, string> = { cheapest: '💶', balanced: '⚖️', fastest: '⚡' };
const PRESETS: { key: string; l: number; w: number; h: number }[] = [
  { key: 'envelope', l: 35, w: 25, h: 2 },
  { key: 'small', l: 25, w: 20, h: 10 },
  { key: 'shoe', l: 35, w: 22, h: 13 },
  { key: 'medium', l: 40, w: 30, h: 20 },
  { key: 'large', l: 60, w: 40, h: 30 },
];
const DEADLINES = [3, 7, 14, 30];

function Section({ icon, title, children }: { icon: string; title: string; children: ReactNode }) {
  return <section className="fsec"><h3><span aria-hidden="true">{icon}</span> {title}</h3>{children}</section>;
}

export function Chips<T extends string>({ value, options, onPick, label }: { value: T; options: { v: T; label: string; icon?: string }[]; onPick: (v: T) => void; label: string }) {
  return (
    <div className="chips" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button type="button" key={o.v} role="radio" aria-checked={o.v === value} className={`chip${o.v === value ? ' on' : ''}`} onClick={() => onPick(o.v)}>
          {o.icon && <span aria-hidden="true">{o.icon}</span>} {o.label}
        </button>
      ))}
    </div>
  );
}

function Toggle({ on, onToggle, icon, label }: { on: boolean; onToggle: (v: boolean) => void; icon: string; label: string }) {
  return <button type="button" role="switch" aria-checked={on} className={`chip tog${on ? ' on' : ''}`} onClick={() => onToggle(!on)}><span aria-hidden="true">{on ? '✓' : icon}</span> {label}</button>;
}

function BoxPreview({ l, w, h }: { l: number | null; w: number | null; h: number | null }) {
  if (!l || !w || !h) return <div className="boxprev empty" aria-hidden="true">📦</div>;
  const m = Math.max(l, w, h);
  const W = 120 * (l / m) + 8, D = 70 * (w / m) + 4, H = 70 * (h / m) + 4;
  const ox = 10, oy = 14 + D * 0.5;
  const pts = (a: [number, number][]) => a.map((p) => p.join(',')).join(' ');
  const x0 = ox, y0 = oy + H;
  return (
    <svg className="boxprev" viewBox="0 0 170 130" role="img" aria-label={`${l}×${w}×${h} cm`}>
      <polygon points={pts([[x0, y0], [x0 + W, y0], [x0 + W, y0 - H], [x0, y0 - H]])} fill="var(--c1)" opacity=".35" stroke="var(--c1)" />
      <polygon points={pts([[x0, y0 - H], [x0 + W, y0 - H], [x0 + W + D * .6, y0 - H - D * .5], [x0 + D * .6, y0 - H - D * .5]])} fill="var(--c1)" opacity=".15" stroke="var(--c1)" />
      <polygon points={pts([[x0 + W, y0], [x0 + W + D * .6, y0 - D * .5], [x0 + W + D * .6, y0 - H - D * .5], [x0 + W, y0 - H]])} fill="var(--c1)" opacity=".5" stroke="var(--c1)" />
      <text x="4" y="124" fontSize="11" fill="currentColor">{l}×{w}×{h} cm</text>
    </svg>
  );
}

export function ShipmentForm({ value, onChange }: { value: Shipment; onChange: (patch: Partial<Shipment>) => void }) {
  const { t } = useI18n();
  const { ds } = useApp();
  const [name, setName] = useState(value.name ?? (value.nameKey ? t(value.nameKey) : ''));
  const [more, setMore] = useState(false);
  useEffect(() => { setName(value.name ?? (value.nameKey ? t(value.nameKey) : '')); }, [value.id, value.name, value.nameKey, t]);
  const set = <K extends keyof Shipment>(k: K, v: Shipment[K]) => onChange({ [k]: v } as Partial<Shipment>);
  const cname = useCountryName();
  const flagPick = (cur: string, label: string, pick: (c: Shipment['originCountry']) => void) => (
    <Chips value={cur} label={label} onPick={(c) => pick(c as Shipment['originCountry'])} options={ds.countries.map((c) => ({ v: c.code, icon: c.flag, label: cname(c.code) }))} />
  );
  const routeOk = value.originCountry === value.destinationCountry || ds.routes.some((r) => r.origin === value.originCountry && r.destination === value.destinationCountry);
  const bat = value.battery;
  return (
    <div className="sform">
      <label className="field"><span>{t('form.name')}</span>
        <input className="bigname" value={name} onChange={(e) => { setName(e.target.value); onChange({ name: e.target.value || null, nameKey: e.target.value ? null : value.nameKey }); }} />
      </label>

      <Section icon="🌍" title={t('f2.route')}>
        <div className="routebar">
          <div><small className="muted">{t('form.origin')}</small>{flagPick(value.originCountry, t('form.origin'), (c) => set('originCountry', c))}</div>
          <button type="button" className="swap" title={t('f2.swap')} aria-label={t('f2.swap')} onClick={() => onChange({ originCountry: value.destinationCountry, destinationCountry: value.originCountry })}>⇄</button>
          <div><small className="muted">{t('form.destination')}</small>{flagPick(value.destinationCountry, t('form.destination'), (c) => set('destinationCountry', c))}</div>
        </div>
        {value.originCountry === value.destinationCountry && <p className="err">{t('form.same_country')}</p>}
        {!routeOk && <p className="warn">{t('form.route_not_supported')}</p>}
      </Section>

      <Section icon="📦" title={t('f2.what')}>
        <div className="tiles" role="radiogroup" aria-label={t('form.category')}>
          {categories.map((c) => (
            <button type="button" key={c} role="radio" aria-checked={value.category === c} className={`tile${value.category === c ? ' on' : ''}`} onClick={() => set('category', c)}>
              <span className="ic" aria-hidden="true">{CAT_ICON[c]}</span><span>{t(`cat.${c}`)}</span>
            </button>
          ))}
        </div>
      </Section>

      <Section icon="⚖️" title={t('f2.size')}>
        <div className="sizegrid">
          <div className="sizefields">
            <div className="row2">
              <label className="field"><span>{t('form.weight')}</span><NumInput value={value.weightKg} onCommit={(v) => v && set('weightKg', v)} /></label>
              <div className="field"><span>{t('form.packages')}</span>
                <div className="stepper">
                  <button type="button" aria-label="−" disabled={value.packages <= 1} onClick={() => set('packages', Math.max(1, value.packages - 1))}>−</button>
                  <output aria-label={t('form.packages')}>{value.packages}</output>
                  <button type="button" aria-label="+" onClick={() => set('packages', value.packages + 1)}>+</button>
                </div>
              </div>
            </div>
            <div className="presets" aria-label={t('f2.presets')}>
              {PRESETS.map((p) => (
                <button type="button" key={p.key} className={`chip sm${value.lengthCm === p.l && value.widthCm === p.w && value.heightCm === p.h ? ' on' : ''}`}
                  onClick={() => onChange({ lengthCm: p.l, widthCm: p.w, heightCm: p.h })}>{t(`f2.preset_${p.key}`)} <small>{p.l}×{p.w}×{p.h}</small></button>
              ))}
            </div>
            <div className="row3">
              <label className="field"><span>{t('form.length')}</span><NumInput value={value.lengthCm} nullable onCommit={(v) => set('lengthCm', v)} /></label>
              <label className="field"><span>{t('form.width')}</span><NumInput value={value.widthCm} nullable onCommit={(v) => set('widthCm', v)} /></label>
              <label className="field"><span>{t('form.height')}</span><NumInput value={value.heightCm} nullable onCommit={(v) => set('heightCm', v)} /></label>
            </div>
            <div className="chips">
              <Toggle on={value.weightProvisional} onToggle={(v) => set('weightProvisional', v)} icon="≈" label={t('form.weight_provisional')} />
              <Toggle on={value.dimsProvisional} onToggle={(v) => set('dimsProvisional', v)} icon="≈" label={t('form.dims_provisional')} />
            </div>
          </div>
          <BoxPreview l={value.lengthCm} w={value.widthCm} h={value.heightCm} />
        </div>
      </Section>

      <Section icon="✅" title={t('f2.needs')}>
        <div className="chips">
          <Toggle on={value.trackingRequired} onToggle={(v) => set('trackingRequired', v)} icon="📍" label={t('form.tracking')} />
          <Toggle on={value.signatureRequired} onToggle={(v) => set('signatureRequired', v)} icon="✍️" label={t('form.signature')} />
          <Toggle on={value.insuranceDesired} onToggle={(v) => set('insuranceDesired', v)} icon="🛡️" label={t('form.insurance')} />
          <Toggle on={value.irreplaceable} onToggle={(v) => set('irreplaceable', v)} icon="💎" label={t('form.irreplaceable')} />
          <Toggle on={value.servicePointDropoff} onToggle={(v) => set('servicePointDropoff', v)} icon="🏤" label={t('form.dropoff')} />
          <Toggle on={value.pickupRequired} onToggle={(v) => set('pickupRequired', v)} icon="🚚" label={t('form.pickup')} />
        </div>
      </Section>

      <Section icon="🎯" title={t('f2.prefs')}>
        <div className="prefrow"><small className="muted">{t('form.budget')}</small>
          <Chips value={value.budgetPreference} label={t('form.budget')} onPick={(b) => set('budgetPreference', b)} options={(['cheapest', 'balanced', 'fastest'] as const).map((b) => ({ v: b, icon: BUDGET_ICON[b], label: t(`budget.${b}`) }))} /></div>
        <div className="prefrow"><small className="muted">{t('form.delivery')}</small>
          <Chips value={value.deliveryMethod} label={t('form.delivery')} onPick={(d) => set('deliveryMethod', d)} options={(['any', 'home', 'facility_collection'] as const).map((d) => ({ v: d, icon: DELIV_ICON[d], label: t(`f2.delivery_${d}`) }))} /></div>
        <div className="prefrow"><small className="muted">{t('form.sender')}</small>
          <Chips value={value.senderType} label={t('form.sender')} onPick={(s) => set('senderType', s)} options={[{ v: 'private', icon: '🧑', label: t('sender.private') }, { v: 'business', icon: '🏢', label: t('sender.business') }]} /></div>
      </Section>

      <button type="button" className="morebtn" aria-expanded={more} onClick={() => setMore(!more)}>{more ? '▾' : '▸'} {t('f2.more')}</button>
      {more && (
        <div className="fsec more">
          <div className="row2">
            <label className="field"><span>{t('form.declared_value')}</span><NumInput value={value.declaredValueEur} nullable onCommit={(v) => set('declaredValueEur', v)} /></label>
            <label className="field"><span>{t('form.deadline')}</span><NumInput value={value.deadlineDays} nullable step="1" onCommit={(v) => set('deadlineDays', v)} /></label>
          </div>
          <div className="chips">
            {DEADLINES.map((d) => <button type="button" key={d} className={`chip sm${value.deadlineDays === d ? ' on' : ''}`} onClick={() => set('deadlineDays', value.deadlineDays === d ? null : d)}>≤ {d} {t('f2.days')}</button>)}
          </div>
          <div className="prefrow"><small className="muted">{t('form.battery')}</small>
            <Chips value={bat.type} label={t('form.battery')} onPick={(b) => set('battery', { ...bat, type: b, quantity: b === 'none' ? 0 : Math.max(1, bat.quantity) })}
              options={(['none', 'lithium_ion', 'lithium_metal'] as const).map((b) => ({ v: b, icon: b === 'none' ? '🚫' : '🔋', label: t(`battery.${b}`) }))} /></div>
          {bat.type !== 'none' && <div className="chips"><Toggle on={bat.installed} onToggle={(v) => set('battery', { ...bat, installed: v })} icon="🔋" label={t('form.battery_installed')} /></div>}
          <label className="field"><span>{t('form.customs')}</span><input value={value.customsNotes} onChange={(e) => set('customsNotes', e.target.value)} /></label>
          <label className="field"><span>{t('form.notes')}</span><textarea value={value.notes} rows={2} onChange={(e) => set('notes', e.target.value)} /></label>
        </div>
      )}
    </div>
  );
}
