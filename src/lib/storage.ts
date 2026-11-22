import {
  CHANNEL_IDS,
  DEFAULT_SETTINGS,
  breakdown,
  safeNum,
  targetPrice,
  type Dish,
  type Settings,
} from './calc';

export interface AppState {
  version: 1;
  kitchenName: string;
  dishes: Dish[];
  settings: Settings;
}

const KEY = 'platemath:v1';

export const emptyState = (): AppState => ({
  version: 1,
  kitchenName: '',
  dishes: [],
  settings: structuredClone(DEFAULT_SETTINGS),
});

export function newId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return Math.random().toString(36).slice(2) + Date.now().toString(36);
  }
}

function str(v: unknown, max = 80): string {
  return typeof v === 'string' ? v.slice(0, max) : '';
}

/**
 * Validate untrusted input (localStorage, a shared link, an imported file)
 * and coerce it into a well-formed AppState. Never throws.
 */
export function sanitize(raw: unknown): AppState {
  const base = emptyState();
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as Record<string, unknown>;

  const dishes: Dish[] = Array.isArray(r.dishes)
    ? r.dishes.slice(0, 500).flatMap((d): Dish[] => {
        if (!d || typeof d !== 'object') return [];
        const o = d as Record<string, unknown>;
        return [
          {
            id: str(o.id, 64) || newId(),
            name: str(o.name) || 'Untitled dish',
            price: safeNum(o.price),
            foodCost: safeNum(o.foodCost),
            packagingCost: safeNum(o.packagingCost),
          },
        ];
      })
    : [];

  const s = (r.settings && typeof r.settings === 'object' ? r.settings : {}) as Record<string, unknown>;
  const settings: Settings = structuredClone(DEFAULT_SETTINGS);
  if (s.gstOnFoodPct !== undefined) settings.gstOnFoodPct = Math.min(safeNum(s.gstOnFoodPct), 100);
  if (s.gstOnFeesPct !== undefined) settings.gstOnFeesPct = Math.min(safeNum(s.gstOnFeesPct), 100);
  if (s.targetMarginPct !== undefined) settings.targetMarginPct = Math.min(safeNum(s.targetMarginPct), 95);

  const chans = (s.channels && typeof s.channels === 'object' ? s.channels : {}) as Record<string, unknown>;
  for (const id of CHANNEL_IDS) {
    const c = chans[id] as Record<string, unknown> | undefined;
    if (!c || typeof c !== 'object') continue;
    const t = settings.channels[id];
    t.label = str(c.label, 30) || t.label;
    t.enabled = typeof c.enabled === 'boolean' ? c.enabled : t.enabled;
    t.commissionPct = Math.min(safeNum(c.commissionPct), 100);
    t.paymentFeePct = Math.min(safeNum(c.paymentFeePct), 100);
    t.fixedFeePerOrder = safeNum(c.fixedFeePerOrder);
    t.discountPct = Math.min(safeNum(c.discountPct), 100);
    t.discountCap = safeNum(c.discountCap);
  }

  return { version: 1, kitchenName: str(r.kitchenName, 60), dishes, settings };
}

export function load(): AppState | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? sanitize(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

/** Returns false if the browser refused to save (private mode, quota). */
export function save(state: AppState): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

// ---------- Share links (state lives in the URL hash, never hits a server) ----------

function toBase64Url(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s: string): string {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

export function encodeShare(state: AppState): string {
  return toBase64Url(JSON.stringify(state));
}

export function decodeShare(hash: string): AppState | null {
  const m = hash.match(/(?:^#|&)menu=([A-Za-z0-9_-]+)/);
  if (!m) return null;
  try {
    return sanitize(JSON.parse(fromBase64Url(m[1])));
  } catch {
    return null;
  }
}

// ---------- CSV ----------

function csvCell(v: string | number): string {
  const s = String(v);
  // Neutralise spreadsheet formula injection and quote when needed.
  const safe = /^[=+\-@]/.test(s) && typeof v === 'string' ? `'${s}` : s;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCSV(state: AppState): string {
  const chans = CHANNEL_IDS.filter((id) => state.settings.channels[id].enabled);
  const header = ['Dish', 'Menu price', 'Food cost', 'Packaging'];
  for (const id of chans) {
    const l = state.settings.channels[id].label;
    header.push(`${l} payout`, `${l} profit`, `${l} margin %`, `${l} price for ${state.settings.targetMarginPct}% margin`);
  }
  const rows = state.dishes.map((d) => {
    const row: (string | number)[] = [d.name, d.price, d.foodCost, d.packagingCost];
    for (const id of chans) {
      const ch = state.settings.channels[id];
      const b = breakdown(d, ch, state.settings);
      const tp = targetPrice(d, ch, state.settings);
      row.push(b.payout, b.profit, Number.isFinite(b.marginPct) ? b.marginPct : '', tp ?? 'Not reachable');
    }
    return row;
  });
  return [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\n');
}

function parseCSVLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',') {
      out.push(cur);
      cur = '';
    } else cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

/**
 * Import dishes from a CSV. Expects columns: name, price, food cost, packaging
 * (header row optional). Returns the dishes plus the number of skipped lines.
 */
export function fromCSV(text: string): { dishes: Dish[]; skipped: number } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  const dishes: Dish[] = [];
  let skipped = 0;
  lines.forEach((line, i) => {
    const [name, price, food, pack] = parseCSVLine(line);
    const p = parseFloat(price);
    if (i === 0 && !Number.isFinite(p)) return; // header row
    if (!name || !Number.isFinite(p)) {
      skipped++;
      return;
    }
    dishes.push({
      id: newId(),
      name: name.replace(/^'/, '').slice(0, 80),
      price: safeNum(p),
      foodCost: safeNum(food),
      packagingCost: safeNum(pack),
    });
  });
  return { dishes: dishes.slice(0, 500), skipped };
}

export const SAMPLE_DISHES: Omit<Dish, 'id'>[] = [
  { name: 'Steamed chicken momos (8 pc)', price: 199, foodCost: 52, packagingCost: 14 },
  { name: 'Jhol momos, veg (8 pc)', price: 219, foodCost: 48, packagingCost: 18 },
  { name: 'Pan-fried pork momos (8 pc)', price: 279, foodCost: 88, packagingCost: 14 },
  { name: 'Masala dosa', price: 149, foodCost: 34, packagingCost: 16 },
  { name: 'Idli sambar (3 pc)', price: 99, foodCost: 22, packagingCost: 15 },
  { name: 'Filter coffee', price: 79, foodCost: 14, packagingCost: 12 },
];
