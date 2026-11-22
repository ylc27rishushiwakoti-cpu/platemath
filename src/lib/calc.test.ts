import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, breakdown, discountFor, health, targetPrice, type ChannelSettings } from './calc';
import { decodeShare, emptyState, encodeShare, fromCSV, sanitize, toCSV } from './storage';

const s = { gstOnFoodPct: 5, gstOnFeesPct: 18, targetMarginPct: 20 };
const ch = (o: Partial<ChannelSettings> = {}): ChannelSettings => ({
  label: 'Test',
  enabled: true,
  commissionPct: 25,
  paymentFeePct: 2,
  fixedFeePerOrder: 0,
  discountPct: 0,
  discountCap: 0,
  ...o,
});

describe('breakdown', () => {
  it('computes a ₹200 dish at 25% commission + 2% PG', () => {
    const b = breakdown({ price: 200, foodCost: 50, packagingCost: 10 }, ch(), s);
    expect(b.commission).toBe(50);
    expect(b.customerPays).toBe(210);
    expect(b.paymentFee).toBe(4.2);
    expect(b.gstOnFees).toBe(9.76); // 18% of 54.2
    expect(b.payout).toBe(136.04);
    expect(b.profit).toBe(76.04);
    expect(b.marginPct).toBe(38.02);
  });

  it('applies the discount before commission', () => {
    const b = breakdown({ price: 200, foodCost: 0, packagingCost: 0 }, ch({ discountPct: 50, discountCap: 0 }), s);
    expect(b.discount).toBe(100);
    expect(b.commission).toBe(25);
  });

  it('respects the discount cap', () => {
    expect(discountFor(300, ch({ discountPct: 40, discountCap: 80 }))).toBe(80);
    expect(discountFor(100, ch({ discountPct: 40, discountCap: 80 }))).toBe(40);
  });

  it('never discounts below zero', () => {
    expect(discountFor(50, ch({ discountPct: 100 }))).toBe(50);
  });

  it('treats junk input as zero instead of NaN', () => {
    const b = breakdown({ price: NaN, foodCost: -5, packagingCost: Infinity }, ch(), s);
    expect(b.profit).toBe(0);
    expect(Number.isNaN(b.marginPct)).toBe(true);
  });

  it('shows a loss when costs exceed payout', () => {
    const b = breakdown({ price: 100, foodCost: 70, packagingCost: 20 }, ch(), s);
    expect(b.profit).toBeLessThan(0);
    expect(health(b.marginPct, 20)).toBe('loss');
  });
});

describe('targetPrice', () => {
  it('finds the lowest price hitting the target margin', () => {
    const dish = { foodCost: 60, packagingCost: 15 };
    const p = targetPrice(dish, ch(), s)!;
    expect(breakdown({ ...dish, price: p }, ch(), s).marginPct).toBeGreaterThanOrEqual(20);
    expect(breakdown({ ...dish, price: p - 1 }, ch(), s).marginPct).toBeLessThan(20);
  });

  it('works with a capped discount', () => {
    const dish = { foodCost: 60, packagingCost: 15 };
    const c = ch({ discountPct: 50, discountCap: 100 });
    const p = targetPrice(dish, c, s)!;
    expect(breakdown({ ...dish, price: p }, c, s).marginPct).toBeGreaterThanOrEqual(20);
  });

  it('returns null when fees + target leave nothing', () => {
    expect(targetPrice({ foodCost: 50, packagingCost: 0 }, ch({ commissionPct: 90 }), s)).toBeNull();
  });
});

describe('storage', () => {
  it('round-trips through a share link', () => {
    const st = emptyState();
    st.kitchenName = 'Mokto';
    st.dishes = [{ id: 'a', name: 'Momo ₹ "special"', price: 199, foodCost: 50, packagingCost: 12 }];
    const back = decodeShare('#menu=' + encodeShare(st));
    expect(back).toEqual(st);
  });

  it('rejects broken share links', () => {
    expect(decodeShare('#menu=!!!')).toBeNull();
    expect(decodeShare('#menu=bm90anNvbg')).toBeNull();
    expect(decodeShare('#other=1')).toBeNull();
  });

  it('sanitizes hostile input', () => {
    const st = sanitize({ dishes: [{ name: 5, price: '-3' }, null, 'x'], settings: { targetMarginPct: 500 } });
    expect(st.dishes).toHaveLength(1);
    expect(st.dishes[0].price).toBe(0);
    expect(st.settings.targetMarginPct).toBe(95);
    expect(st.settings.channels.swiggy.commissionPct).toBe(DEFAULT_SETTINGS.channels.swiggy.commissionPct);
  });

  it('imports CSV with header and quoted names, skips bad rows', () => {
    const { dishes, skipped } = fromCSV('name,price,food,pack\n"Momo, large",199,50,12\nbad,row\nDosa,149,34,16');
    expect(dishes.map((d) => d.name)).toEqual(['Momo, large', 'Dosa']);
    expect(skipped).toBe(1);
  });

  it('exports CSV and escapes formulas', () => {
    const st = emptyState();
    st.dishes = [{ id: 'a', name: '=HYPERLINK("x")', price: 100, foodCost: 10, packagingCost: 5 }];
    const csv = toCSV(st);
    expect(csv.split('\n')[1].startsWith(`"'=HYPERLINK`)).toBe(true);
  });
});
