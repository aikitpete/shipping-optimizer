import { DEFAULT_WEIGHTS, type RankWeights } from '../recommendations/recommend';

export type Lang = string;
export type CurrencyDisplay = 'eur' | 'native' | 'both';
export interface Prefs { lang: Lang; selectedPlanId: string | null; currencyDisplay: CurrencyDisplay; rankWeights: RankWeights }
export const DEFAULT_PREFS: Prefs = { lang: 'en', selectedPlanId: null, currencyDisplay: 'both', rankWeights: DEFAULT_WEIGHTS };
const KEY = 'shipping-optimizer:prefs';

function storage(): Storage | null {
  try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; }
}

export function loadPrefs(store: Storage | null = storage()): Prefs {
  try {
    const raw = store?.getItem(KEY);
    if (!raw) return { ...DEFAULT_PREFS };
    const p = JSON.parse(raw) as Partial<Prefs>;
    return {
      lang: typeof p.lang === 'string' && /^[a-z]{2}$/.test(p.lang) ? p.lang : 'en',
      selectedPlanId: typeof p.selectedPlanId === 'string' ? p.selectedPlanId : null,
      currencyDisplay: p.currencyDisplay === 'eur' || p.currencyDisplay === 'native' ? p.currencyDisplay : 'both',
      rankWeights: p.rankWeights && [p.rankWeights.price, p.rankWeights.speed, p.rankWeights.features].every((n) => typeof n === 'number' && n >= 0) ? p.rankWeights : DEFAULT_WEIGHTS,
    };
  } catch { return { ...DEFAULT_PREFS }; }
}
export function savePrefs(p: Prefs, store: Storage | null = storage()) {
  try { store?.setItem(KEY, JSON.stringify(p)); } catch { /* storage unavailable: ignore */ }
}
