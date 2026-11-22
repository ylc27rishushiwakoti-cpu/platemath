// Core profitability engine. Pure functions, no UI or browser APIs,
// so every number the app shows can be unit tested.

export type ChannelId = 'swiggy' | 'zomato' | 'direct';

export const CHANNEL_IDS: ChannelId[] = ['swiggy', 'zomato', 'direct'];

export interface ChannelSettings {
  label: string;
  enabled: boolean;
  /** Commission charged on the post-discount food value, in percent. */
  commissionPct: number;
  /** Payment gateway / collection fee on what the customer pays, in percent. */
  paymentFeePct: number;
  /** Any fixed per-order fee (long distance, platform fee share, etc.), in rupees. */
  fixedFeePerOrder: number;
  /** Restaurant-funded discount, in percent of menu price. */
  discountPct: number;
  /** Maximum discount in rupees per order. 0 means no cap. */
  discountCap: number;
}

export interface Settings {
  /** GST charged to the customer on food. Collected and remitted by the platform. */
  gstOnFoodPct: number;
  /** GST charged to the restaurant on platform fees (commission, payment fee, fixed fee). */
  gstOnFeesPct: number;
  /** Profit you want to keep, as a percent of menu price. */
  targetMarginPct: number;
  channels: Record<ChannelId, ChannelSettings>;
}

export interface Dish {
  id: string;
  name: string;
  /** Menu price, excluding GST. */
  price: number;
  /** Ingredient cost per portion. */
  foodCost: number;
  /** Box, bag, cutlery, sauces per order. */
  packagingCost: number;
}

export interface Breakdown {
  price: number;
  discount: number;
  foodValue: number;
  customerPays: number;
  commission: number;
  paymentFee: number;
  fixedFee: number;
  gstOnFees: number;
  totalPlatformCut: number;
  payout: number;
  cost: number;
  profit: number;
  /** Profit as a percent of menu price. NaN if price is 0. */
  marginPct: number;
}

export const DEFAULT_SETTINGS: Settings = {
  gstOnFoodPct: 5,
  gstOnFeesPct: 18,
  targetMarginPct: 20,
  channels: {
    swiggy: {
      label: 'Swiggy',
      enabled: true,
      commissionPct: 25,
      paymentFeePct: 2,
      fixedFeePerOrder: 0,
      discountPct: 0,
      discountCap: 0,
    },
    zomato: {
      label: 'Zomato',
      enabled: true,
      commissionPct: 25,
      paymentFeePct: 2,
      fixedFeePerOrder: 0,
      discountPct: 0,
      discountCap: 0,
    },
    direct: {
      label: 'Direct / own site',
      enabled: true,
      commissionPct: 0,
      paymentFeePct: 2,
      fixedFeePerOrder: 40,
      discountPct: 0,
      discountCap: 0,
    },
  },
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Treat anything that isn't a finite, non-negative number as 0. */
export function safeNum(n: unknown): number {
  const v = typeof n === 'string' ? parseFloat(n) : (n as number);
  return Number.isFinite(v) && v > 0 ? v : 0;
}

export function discountFor(price: number, ch: ChannelSettings): number {
  const pct = safeNum(ch.discountPct) / 100;
  let d = price * pct;
  const cap = safeNum(ch.discountCap);
  if (cap > 0) d = Math.min(d, cap);
  return Math.min(d, price);
}

export function breakdown(
  dish: Pick<Dish, 'price' | 'foodCost' | 'packagingCost'>,
  ch: ChannelSettings,
  s: Pick<Settings, 'gstOnFoodPct' | 'gstOnFeesPct'>,
): Breakdown {
  const price = safeNum(dish.price);
  const discount = discountFor(price, ch);
  const foodValue = price - discount;
  const customerPays = foodValue * (1 + safeNum(s.gstOnFoodPct) / 100);

  const commission = foodValue * (safeNum(ch.commissionPct) / 100);
  const paymentFee = customerPays * (safeNum(ch.paymentFeePct) / 100);
  const fixedFee = safeNum(ch.fixedFeePerOrder);
  const gstOnFees = (commission + paymentFee + fixedFee) * (safeNum(s.gstOnFeesPct) / 100);
  const totalPlatformCut = commission + paymentFee + fixedFee + gstOnFees;

  // Food GST passes through: the platform collects it from the customer and
  // remits it, so it is neither income nor cost for the kitchen.
  const payout = foodValue - totalPlatformCut;
  const cost = safeNum(dish.foodCost) + safeNum(dish.packagingCost);
  const profit = payout - cost;

  return {
    price: round2(price),
    discount: round2(discount),
    foodValue: round2(foodValue),
    customerPays: round2(customerPays),
    commission: round2(commission),
    paymentFee: round2(paymentFee),
    fixedFee: round2(fixedFee),
    gstOnFees: round2(gstOnFees),
    totalPlatformCut: round2(totalPlatformCut),
    payout: round2(payout),
    cost: round2(cost),
    profit: round2(profit),
    marginPct: price > 0 ? round2((profit / price) * 100) : NaN,
  };
}

export const MAX_PRICE = 100_000;

/**
 * Lowest whole-rupee menu price at which the dish keeps `targetMarginPct`
 * of the menu price as profit on this channel. Returns null when no price
 * can reach the target (fees plus target add up to 100% or more).
 */
export function targetPrice(
  dish: Pick<Dish, 'foodCost' | 'packagingCost'>,
  ch: ChannelSettings,
  s: Pick<Settings, 'gstOnFoodPct' | 'gstOnFeesPct' | 'targetMarginPct'>,
): number | null {
  const t = safeNum(s.targetMarginPct) / 100;
  const gap = (p: number) => breakdown({ ...dish, price: p }, ch, s).profit - t * p;

  if (gap(MAX_PRICE) < 0) return null;
  let lo = 0;
  let hi = MAX_PRICE;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (gap(mid) >= 0) hi = mid;
    else lo = mid;
  }
  let p = Math.ceil(hi);
  // Guard against rounding in breakdown(): step up until the target truly holds.
  while (p < MAX_PRICE && gap(p) < 0) p++;
  return p;
}

export type Health = 'loss' | 'thin' | 'ok' | 'great';

export function health(marginPct: number, targetPct: number): Health {
  if (!Number.isFinite(marginPct) || marginPct < 0) return 'loss';
  if (marginPct < targetPct * 0.5) return 'thin';
  if (marginPct < targetPct) return 'ok';
  return 'great';
}

export function formatINR(n: number, decimals = 0): string {
  if (!Number.isFinite(n)) return '–';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(n);
}
