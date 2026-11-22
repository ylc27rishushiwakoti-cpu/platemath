import { initAnalytics, track } from '../lib/analytics';
import { breakdown, formatINR, DEFAULT_SETTINGS } from '../lib/calc';
import '../styles/base.css';
import '../styles/site.css';

initAnalytics();

document.querySelectorAll<HTMLAnchorElement>('[data-cta]').forEach((a) =>
  a.addEventListener('click', () => track(`cta_${a.dataset.cta}`)),
);

// Live mini-calculator in the hero
const form = document.getElementById('quick') as HTMLFormElement | null;
if (form) {
  const out = document.getElementById('quick-out')!;
  const get = (n: string) => parseFloat((form.elements.namedItem(n) as HTMLInputElement).value);
  const render = () => {
    const ch = { ...DEFAULT_SETTINGS.channels.swiggy, commissionPct: get('commission') || 0 };
    const b = breakdown({ price: get('price'), foodCost: get('cost'), packagingCost: 0 }, ch, DEFAULT_SETTINGS);
    const ok = Number.isFinite(b.marginPct);
    out.innerHTML = ok
      ? `<span class="q-big ${b.profit < 0 ? 'neg' : ''}">${formatINR(b.profit)}</span><span class="q-sub">you keep per order, ${b.marginPct.toFixed(0)}% of menu price. The platform takes ${formatINR(b.totalPlatformCut)}.</span>`
      : `<span class="q-sub">Enter a menu price to see your profit.</span>`;
  };
  form.addEventListener('input', render);
  form.addEventListener('submit', (e) => e.preventDefault());
  render();
}

const y = document.getElementById('year');
if (y) y.textContent = String(new Date().getFullYear());
