import { describe, expect, it } from 'vitest';
import { recommend, DEFAULT_WEIGHTS } from '../src/lib/recommendations/recommend';
import { toEur } from '../src/lib/pricing/currency';
import { ds, ship, TODAY } from './helpers/fixtures';

const price = (s: ReturnType<typeof ship>, id: string) => recommend(s, ds, DEFAULT_WEIGHTS, TODAY).ranked.find((c) => c.service.id === id)?.price;

describe('pricing engine on the demo tariffs', () => {
  it('weight brackets: 1.4 kg to the US falls in the 2 kg bracket', () => {
    expect(price(ship({ weightKg: 1.4, lengthCm: 20, widthCm: 15, heightCm: 5 }), 'mx-express')?.nativeAmount).toBe(56.9);
  });
  it('dimensional weight (L×W×H ÷ 5000) is charged when larger than actual weight', () => {
    const light = price(ship({ weightKg: 1, lengthCm: 40, widthCm: 40, heightCm: 40 }), 'mx-express')!; // 12.8 kg billable
    const dense = price(ship({ weightKg: 1, lengthCm: 20, widthCm: 15, heightCm: 5 }), 'mx-express')!;
    expect(light.nativeAmount!).toBeGreaterThan(dense.nativeAmount!);
    expect(price(ship({ weightKg: 1, lengthCm: 40, widthCm: 40, heightCm: 40 }), 'np-parcel-economy')?.nativeAmount).toBe(price(ship({ weightKg: 1, lengthCm: 20, widthCm: 15, heightCm: 5 }), 'np-parcel-economy')?.nativeAmount);
  });
  it('fixed packages: a 0.3 kg document takes the envelope, a 1.5 kg box the small box', () => {
    expect(price(ship({ category: 'documents', weightKg: 0.3, lengthCm: 30, widthCm: 20, heightCm: 1 }), 'mx-envelope')?.packageName).toMatch(/Envelope/);
    expect(price(ship({ weightKg: 1.5, lengthCm: 25, widthCm: 18, heightCm: 8 }), 'mx-envelope')?.packageName).toMatch(/Small Box/);
  });
  it('USD estimates convert to EUR through the profile rate and stay flagged as estimates', () => {
    const p = price(ship({ weightKg: 2, lengthCm: 20, widthCm: 15, heightCm: 10 }), 'ph-best-rate');
    if (p) { expect(p.currency).toBe('USD'); expect(p.tariffStatus).toBe('research_estimate'); expect(p.eur).toBeCloseTo(toEur(p.nativeAmount!, 'USD', ds.rates)!, 6); }
    expect(toEur(10, 'USD', ds.rates)).toBeCloseTo(10 / ds.rates.rates.USD, 6);
  });
});
