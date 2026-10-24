import { useRef, useState } from 'react';
import { useI18n } from '../i18n';
import { useApp } from '../hooks/useApp';
import { LANGUAGES } from '../i18n/languages';
import { ConfirmDialog, download } from '../components/common';
import { exportPlans, importPlans } from '../lib/persistence/db';
import { DEFAULT_WEIGHTS } from '../lib/recommendations/recommend';

export function SettingsPage() {
  const { t } = useI18n();
  const { ds, prefs, setPrefs, plans, reloadPlans, resetAll } = useApp();
  const file = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<string>('');
  const [confirm, setConfirm] = useState(false);
  const w = prefs.rankWeights;
  const setW = (k: keyof typeof w, v: number) => setPrefs({ rankWeights: { ...w, [k]: Math.max(0, Math.min(1, v)) } });
  return (
    <div className="page">
      <div className="panel">
        <h2>{t('settings.title')}</h2>
        <label className="field"><span>{t('settings.language')}</span>
          <select value={prefs.lang} onChange={(e) => setPrefs({ lang: e.target.value })}>{ds.config.languages.map((l) => <option key={l} value={l}>{LANGUAGES[l]?.label ?? l}</option>)}</select></label>
        <label className="field"><span>{t('settings.currency')}</span>
          <select value={prefs.currencyDisplay} onChange={(e) => setPrefs({ currencyDisplay: e.target.value as 'eur' | 'native' | 'both' })}>
            {(['both', 'eur', 'native'] as const).map((c) => <option key={c} value={c}>{t(`settings.currency.${c}`)}</option>)}</select></label>
        <p className="small muted">{t('settings.currency_note')}</p>
      </div>
      <div className="panel">
        <h3>{t('settings.weights')}</h3>
        <p className="small muted">{t('settings.weights_note')}</p>
        {(['price', 'speed', 'features'] as const).map((k) => (
          <label className="field" key={k}><span>{t(`settings.w.${k}`)}: {w[k].toFixed(2)}</span>
            <input type="range" min={0} max={1} step={0.05} value={w[k]} onChange={(e) => setW(k, Number(e.target.value))} /></label>
        ))}
        <button onClick={() => setPrefs({ rankWeights: DEFAULT_WEIGHTS })}>{t('settings.weights_reset')}</button>
      </div>
      <div className="panel">
        <h3>{t('settings.data')}</h3>
        <div className="row gap wrap">
          <button onClick={() => download(`shipping-plans-${new Date().toISOString().slice(0, 10)}.json`, exportPlans(plans, new Date().toISOString()))}>{t('settings.export')}</button>
          <button onClick={() => file.current?.click()}>{t('settings.import')}</button>
          <input ref={file} type="file" accept="application/json" hidden onChange={async (e) => {
            const f = e.target.files?.[0]; if (!f) return;
            const r = await importPlans(await f.text());
            await reloadPlans();
            setMsg(r.errors.length ? t('settings.import_errors', { n: r.imported, e: r.errors.length }) : t('settings.import_ok', { n: r.imported, r: r.renamedIds }));
            e.target.value = '';
          }} />
          <button className="danger" onClick={() => setConfirm(true)}>{t('settings.reset')}</button>
        </div>
        {msg && <p role="status">{msg}</p>}
        <p className="small muted">{t('settings.storage_note')}</p>
      </div>
      <ConfirmDialog open={confirm} title={t('settings.reset_title')} body={t('settings.reset_body')} confirmLabel={t('settings.reset')} onCancel={() => setConfirm(false)} onConfirm={() => { setConfirm(false); void resetAll(); }} />
    </div>
  );
}
