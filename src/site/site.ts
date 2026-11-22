import { initAnalytics, track } from '../lib/analytics';
import { breakdown, formatINR, DEFAULT_SETTINGS } from '../lib/calc';
import '../styles/base.css';
import '../styles/site.css';

initAnalytics();

document.querySelectorAll<HTMLAnchorElement>('[data-cta]').forEach((a) =>
  a.addEventListener('click', () => track(`cta_${a.dataset.cta}`)),
);

// Live receipt in the hero
const form = document.getElementById('quick') as HTMLFormElement | null;
if (form) {
  const out = document.getElementById('quick-out')!;
  const lines = document.getElementById('quick-lines')!;
  const get = (n: string) => parseFloat((form.elements.namedItem(n) as HTMLInputElement).value);
  const row = (k: string, v: number) =>
    `<div class="t-row"><span>${k}</span><span>${v ? '−' : ''}${formatINR(Math.abs(v), 2)}</span></div>`;
  const render = () => {
    const ch = { ...DEFAULT_SETTINGS.channels.swiggy, commissionPct: get('commission') || 0 };
    const b = breakdown({ price: get('price'), foodCost: get('cost'), packagingCost: 0 }, ch, DEFAULT_SETTINGS);
    lines.innerHTML =
      row('Commission', b.commission) +
      row('Payment fee', b.paymentFee) +
      row('GST on fees', b.gstOnFees) +
      `<div class="t-row t-strong"><span>Payout to you</span><span>${formatINR(b.payout, 2)}</span></div>`;
    if (!Number.isFinite(b.marginPct)) {
      out.innerHTML = '<span class="t-hint">Enter a menu price to see what you keep.</span>';
      return;
    }
    out.className = `t-total ${b.profit < 0 ? 'neg' : ''}`;
    out.innerHTML = `<span>You keep</span><span class="mark">${formatINR(b.profit, 2)}</span><small>${b.marginPct.toFixed(0)}% of menu price</small>`;
  };
  form.addEventListener('input', render);
  form.addEventListener('submit', (e) => e.preventDefault());
  render();
}

const y = document.getElementById('year');
if (y) y.textContent = String(new Date().getFullYear());
