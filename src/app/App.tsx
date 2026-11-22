import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CHANNEL_IDS,
  breakdown,
  formatINR,
  health,
  targetPrice,
  type Breakdown,
  type ChannelId,
  type ChannelSettings,
  type Dish,
} from '../lib/calc';
import {
  SAMPLE_DISHES,
  decodeShare,
  emptyState,
  encodeShare,
  fromCSV,
  load,
  newId,
  save,
  toCSV,
  type AppState,
} from '../lib/storage';
import { NumberField } from './NumberField';
import { track } from '../lib/analytics';

type Toast = { id: number; text: string; tone: 'ok' | 'err' };

export function App() {
  const [state, setState] = useState<AppState>(() => load() ?? emptyState());
  const [pendingShare, setPendingShare] = useState<AppState | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [saveFailed, setSaveFailed] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const toast = (text: string, tone: Toast['tone'] = 'ok') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, text, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200);
  };

  // Shared link on load
  useEffect(() => {
    const shared = decodeShare(window.location.hash);
    if (window.location.hash.includes('menu=')) {
      if (shared) setPendingShare(shared);
      else toast('That share link looks broken, so we kept your own menu.', 'err');
      history.replaceState(null, '', window.location.pathname);
    }
  }, []);

  // Persist (debounced)
  useEffect(() => {
    const t = setTimeout(() => setSaveFailed(!save(state)), 250);
    return () => clearTimeout(t);
  }, [state]);

  const { settings, dishes } = state;
  const channels = CHANNEL_IDS.filter((id) => settings.channels[id].enabled);

  const results = useMemo(() => {
    const map = new Map<string, Record<ChannelId, { b: Breakdown; target: number | null }>>();
    for (const d of dishes) {
      const r = {} as Record<ChannelId, { b: Breakdown; target: number | null }>;
      for (const id of CHANNEL_IDS) {
        const ch = settings.channels[id];
        r[id] = { b: breakdown(d, ch, settings), target: targetPrice(d, ch, settings) };
      }
      map.set(d.id, r);
    }
    return map;
  }, [dishes, settings]);

  const updateDish = (id: string, patch: Partial<Dish>) =>
    setState((s) => ({ ...s, dishes: s.dishes.map((d) => (d.id === id ? { ...d, ...patch } : d)) }));

  const addDish = () => {
    const d: Dish = { id: newId(), name: '', price: 0, foodCost: 0, packagingCost: 0 };
    setState((s) => ({ ...s, dishes: [...s.dishes, d] }));
    requestAnimationFrame(() => document.getElementById(`name-${d.id}`)?.focus());
    track('dish_added');
  };

  const removeDish = (id: string) => {
    const removed = dishes.find((d) => d.id === id);
    const idx = dishes.findIndex((d) => d.id === id);
    setState((s) => ({ ...s, dishes: s.dishes.filter((d) => d.id !== id) }));
    if (selected === id) setSelected(null);
    if (removed) {
      const undoId = Date.now();
      setToasts((t) => [...t, { id: undoId, text: `Removed ${removed.name || 'dish'}`, tone: 'ok' }]);
      setTimeout(() => setToasts((t) => t.filter((x) => x.id !== undoId)), 3200);
      lastRemoved.current = { dish: removed, idx };
    }
  };
  const lastRemoved = useRef<{ dish: Dish; idx: number } | null>(null);
  const undoRemove = () => {
    const r = lastRemoved.current;
    if (!r) return;
    setState((s) => {
      const next = [...s.dishes];
      next.splice(r.idx, 0, r.dish);
      return { ...s, dishes: next };
    });
    lastRemoved.current = null;
    setToasts([]);
  };

  const loadSample = () => {
    setState((s) => ({ ...s, kitchenName: s.kitchenName || 'Sample kitchen', dishes: SAMPLE_DISHES.map((d) => ({ ...d, id: newId() })) }));
    track('sample_loaded');
  };

  const updateChannel = (id: ChannelId, patch: Partial<ChannelSettings>) =>
    setState((s) => ({
      ...s,
      settings: { ...s.settings, channels: { ...s.settings.channels, [id]: { ...s.settings.channels[id], ...patch } } },
    }));

  const share = async () => {
    const url = `${window.location.origin}/app/#menu=${encodeShare(state)}`;
    try {
      await navigator.clipboard.writeText(url);
      toast('Share link copied. Anyone with it sees a copy of this menu.');
    } catch {
      window.prompt('Copy this link', url);
    }
    track('share_link');
  };

  const exportCSV = () => {
    const blob = new Blob([toCSV(state)], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${(state.kitchenName || 'menu').replace(/[^\w-]+/g, '-').toLowerCase()}-margins.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    track('csv_export');
  };

  const importCSV = async (file: File) => {
    if (file.size > 1_000_000) return toast('That file is over 1 MB. Try a smaller CSV.', 'err');
    try {
      const { dishes: imported, skipped } = fromCSV(await file.text());
      if (!imported.length) return toast('No dishes found. Columns should be: name, price, food cost, packaging.', 'err');
      setState((s) => ({ ...s, dishes: [...s.dishes, ...imported].slice(0, 500) }));
      toast(`Imported ${imported.length} dishes${skipped ? `, skipped ${skipped} unreadable rows` : ''}.`);
      track('csv_import');
    } catch {
      toast('Could not read that file.', 'err');
    }
  };

  const selectedDish = dishes.find((d) => d.id === selected) ?? null;

  return (
    <div className="app">
      <header className="topbar">
        <a href="/" className="brand" aria-label="PlateMath home">
          <Logo /> <span>PlateMath</span>
        </a>
        <input
          className="kitchen-name"
          placeholder="Your kitchen name"
          aria-label="Kitchen name"
          maxLength={60}
          value={state.kitchenName}
          onChange={(e) => setState((s) => ({ ...s, kitchenName: e.target.value }))}
        />
        <div className="topbar-actions">
          <button className="btn ghost" onClick={() => fileRef.current?.click()}>Import CSV</button>
          <button className="btn ghost" onClick={exportCSV} disabled={!dishes.length}>Export CSV</button>
          <button className="btn ghost" onClick={share} disabled={!dishes.length}>Share</button>
          <button className="btn" onClick={() => setSettingsOpen(true)}>Fees &amp; channels</button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) importCSV(f);
            e.target.value = '';
          }}
        />
      </header>

      {saveFailed && (
        <div className="banner warn" role="status">
          Your browser is blocking storage, so changes will not be kept after you close this tab. Export a CSV to keep a copy.
        </div>
      )}

      <main className="workspace">
        <Summary state={state} results={results} channels={channels} />

        {dishes.length === 0 ? (
          <EmptyState onAdd={addDish} onSample={loadSample} onImport={() => fileRef.current?.click()} />
        ) : (
          <section className="card table-card" aria-label="Menu">
            <div className="table-scroll">
              <table className="menu-table">
                <thead>
                  <tr>
                    <th className="col-name">Dish</th>
                    <th>Menu price</th>
                    <th>Food cost</th>
                    <th>Packaging</th>
                    {channels.map((id) => (
                      <th key={id} className="col-channel">
                        {settings.channels[id].label}
                        <small>profit per order</small>
                      </th>
                    ))}
                    <th aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {dishes.map((d) => {
                    const r = results.get(d.id)!;
                    return (
                      <tr key={d.id} className={selected === d.id ? 'is-selected' : ''}>
                        <td className="col-name">
                          <input
                            id={`name-${d.id}`}
                            className="name-input"
                            value={d.name}
                            maxLength={80}
                            placeholder="Dish name"
                            aria-label="Dish name"
                            onChange={(e) => updateDish(d.id, { name: e.target.value })}
                          />
                        </td>
                        <td><NumberField hideLabel label={`Menu price for ${d.name}`} prefix="₹" value={d.price} max={100000} onChange={(n) => updateDish(d.id, { price: n })} /></td>
                        <td><NumberField hideLabel label={`Food cost for ${d.name}`} prefix="₹" value={d.foodCost} max={100000} onChange={(n) => updateDish(d.id, { foodCost: n })} /></td>
                        <td><NumberField hideLabel label={`Packaging for ${d.name}`} prefix="₹" value={d.packagingCost} max={100000} onChange={(n) => updateDish(d.id, { packagingCost: n })} /></td>
                        {channels.map((id) => {
                          const { b, target } = r[id];
                          const h = d.price > 0 ? health(b.marginPct, settings.targetMarginPct) : null;
                          return (
                            <td key={id} className="col-channel">
                              {d.price > 0 ? (
                                <button className={`result h-${h}`} onClick={() => setSelected(d.id)} title="See the full breakdown">
                                  <span className="result-profit">{formatINR(b.profit)}</span>
                                  <span className="result-margin">{b.marginPct.toFixed(0)}%</span>
                                </button>
                              ) : (
                                <span className="muted">Add a price</span>
                              )}
                              {d.price > 0 && h !== 'great' && (
                                <span className="target-hint">
                                  {target === null ? 'Target not reachable' : <>Price {formatINR(target)} for {settings.targetMarginPct}%</>}
                                </span>
                              )}
                            </td>
                          );
                        })}
                        <td className="col-actions">
                          <button className="icon-btn" onClick={() => setSelected(selected === d.id ? null : d.id)} aria-label={`Breakdown for ${d.name}`} title="Breakdown">
                            <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden><path d="M3 15h3V9H3v6Zm5 0h3V4H8v11Zm5 0h3v-4h-3v4Z" fill="currentColor" /></svg>
                          </button>
                          <button className="icon-btn danger" onClick={() => removeDish(d.id)} aria-label={`Remove ${d.name}`} title="Remove">
                            <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden><path d="M6 6l8 8M14 6l-8 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="table-foot">
              <button className="btn" onClick={addDish}>+ Add dish</button>
              <span className="muted small">
                Saved in this browser automatically. Target margin: {settings.targetMarginPct}% of menu price.
              </span>
            </div>
          </section>
        )}

        {selectedDish && (
          <BreakdownPanel
            dish={selectedDish}
            channels={channels}
            state={state}
            results={results.get(selectedDish.id)!}
            onClose={() => setSelected(null)}
            onPrice={(n) => updateDish(selectedDish.id, { price: n })}
          />
        )}

        <p className="disclaimer">
          Estimates only. Default fees are starting points, not any platform's official rates. Check your own contract and
          payout reports, then set the real numbers under Fees &amp; channels.
        </p>
      </main>

      {settingsOpen && (
        <SettingsSheet
          state={state}
          onClose={() => setSettingsOpen(false)}
          onChannel={updateChannel}
          onSettings={(patch) => setState((s) => ({ ...s, settings: { ...s.settings, ...patch } }))}
        />
      )}

      {pendingShare && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="share-title">
          <div className="modal">
            <h2 id="share-title">Open shared menu?</h2>
            <p>
              Someone shared <strong>{pendingShare.kitchenName || 'a menu'}</strong> with {pendingShare.dishes.length} dishes.
              {dishes.length > 0 && ' Opening it replaces the menu saved in this browser.'}
            </p>
            <div className="modal-actions">
              <button className="btn ghost" onClick={() => setPendingShare(null)}>Keep mine</button>
              <button
                className="btn"
                onClick={() => {
                  setState(pendingShare);
                  setPendingShare(null);
                  track('share_opened');
                }}
              >
                Open shared menu
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.tone}`}>
            {t.text}
            {t.text.startsWith('Removed') && lastRemoved.current && (
              <button className="toast-action" onClick={undoRemove}>Undo</button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function Summary({
  state,
  results,
  channels,
}: {
  state: AppState;
  results: Map<string, Record<ChannelId, { b: Breakdown }>>;
  channels: ChannelId[];
}) {
  const priced = state.dishes.filter((d) => d.price > 0);
  if (!priced.length) return null;
  const target = state.settings.targetMarginPct;
  return (
    <section className="summary" aria-label="Summary">
      {channels.map((id) => {
        const margins = priced.map((d) => ({ d, m: results.get(d.id)![id].b.marginPct }));
        const avg = margins.reduce((a, x) => a + x.m, 0) / margins.length;
        const losing = margins.filter((x) => x.m < 0).length;
        const below = margins.filter((x) => x.m < target).length;
        const worst = margins.reduce((a, x) => (x.m < a.m ? x : a));
        return (
          <div key={id} className={`summary-card h-${health(avg, target)}`}>
            <div className="summary-label">{state.settings.channels[id].label}</div>
            <div className="summary-big">{avg.toFixed(1)}%</div>
            <div className="summary-sub">average margin</div>
            <ul className="summary-facts">
              <li>{below === 0 ? 'Every dish hits target' : `${below} of ${priced.length} below ${target}%`}</li>
              {losing > 0 && <li className="loss-text">{losing} losing money per order</li>}
              {below > 0 && <li>Weakest: {worst.d.name || 'Untitled'}</li>}
            </ul>
          </div>
        );
      })}
    </section>
  );
}

function EmptyState({ onAdd, onSample, onImport }: { onAdd: () => void; onSample: () => void; onImport: () => void }) {
  return (
    <section className="card empty">
      <div className="empty-art" aria-hidden>
        <svg viewBox="0 0 120 80" width="160">
          <ellipse cx="60" cy="62" rx="52" ry="10" fill="var(--line)" />
          <path d="M22 58c0-22 17-38 38-38s38 16 38 38H22Z" fill="var(--paper-2)" stroke="var(--ink)" strokeWidth="2.5" />
          <path d="M40 30c5 4 10 5 20 5s15-1 20-5" stroke="var(--ink)" strokeWidth="2" fill="none" strokeLinecap="round" />
          <text x="60" y="52" textAnchor="middle" fontSize="16" fontWeight="700" fill="var(--accent)">₹?</text>
        </svg>
      </div>
      <h1>What does each dish really earn you?</h1>
      <p>
        Add a dish with its menu price, food cost and packaging. PlateMath takes out commission, payment fees, discounts and GST on
        fees, then shows the profit you keep on each channel.
      </p>
      <div className="empty-actions">
        <button className="btn" onClick={onAdd}>+ Add your first dish</button>
        <button className="btn ghost" onClick={onSample}>Try a sample menu</button>
        <button className="btn ghost" onClick={onImport}>Import CSV</button>
      </div>
      <p className="muted small">CSV columns: name, price, food cost, packaging. A header row is fine.</p>
    </section>
  );
}

function BreakdownPanel({
  dish,
  channels,
  state,
  results,
  onClose,
  onPrice,
}: {
  dish: Dish;
  channels: ChannelId[];
  state: AppState;
  results: Record<ChannelId, { b: Breakdown; target: number | null }>;
  onClose: () => void;
  onPrice: (n: number) => void;
}) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    ref.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [dish.id]);

  return (
    <section ref={ref} className="card breakdown" aria-label={`Breakdown for ${dish.name}`}>
      <div className="breakdown-head">
        <div>
          <div className="eyebrow">Where the money goes</div>
          <h2>{dish.name || 'Untitled dish'}</h2>
        </div>
        <div className="breakdown-tools">
          <NumberField label="Try a menu price" prefix="₹" value={dish.price} max={100000} step={5} onChange={onPrice} />
          <button className="icon-btn" onClick={onClose} aria-label="Close breakdown">
            <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden><path d="M6 6l8 8M14 6l-8 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
          </button>
        </div>
      </div>
      {dish.price <= 0 ? (
        <p className="muted">Add a menu price to see the breakdown.</p>
      ) : (
        <div className="breakdown-grid">
          {channels.map((id) => (
            <Waterfall key={id} label={state.settings.channels[id].label} b={results[id].b} target={results[id].target} targetPct={state.settings.targetMarginPct} />
          ))}
        </div>
      )}
    </section>
  );
}

function Waterfall({ label, b, target, targetPct }: { label: string; b: Breakdown; target: number | null; targetPct: number }) {
  type Row = { k: string; v: number; kind: 'base' | 'cut' | 'cost' | 'total' };
  const all: Row[] = [
    { k: 'Menu price', v: b.price, kind: 'base' },
    { k: 'Discount you fund', v: -b.discount, kind: 'cut' },
    { k: 'Commission', v: -b.commission, kind: 'cut' },
    { k: 'Payment fee', v: -b.paymentFee, kind: 'cut' },
    { k: 'Fixed fee', v: -b.fixedFee, kind: 'cut' },
    { k: 'GST on fees', v: -b.gstOnFees, kind: 'cut' },
    { k: 'Payout to you', v: b.payout, kind: 'total' },
    { k: 'Food + packaging', v: -b.cost, kind: 'cost' },
  ];
  const rows = all.filter((r) => r.kind !== 'cut' || r.v !== 0);
  const scale = Math.max(b.price, 1);
  const h = health(b.marginPct, targetPct);
  return (
    <div className="waterfall">
      <div className="waterfall-title">
        <span>{label}</span>
        <span className={`pill h-${h}`}>{b.marginPct.toFixed(1)}% margin</span>
      </div>
      <ul>
        {rows.map((r) => (
          <li key={r.k} className={`wf-${r.kind}`}>
            <span className="wf-k">{r.k}</span>
            <span className="wf-bar" aria-hidden>
              <span style={{ width: `${Math.min(100, (Math.abs(r.v) / scale) * 100)}%` }} />
            </span>
            <span className="wf-v">{formatINR(r.v, 2)}</span>
          </li>
        ))}
        <li className={`wf-profit h-${h}`}>
          <span className="wf-k">You keep</span>
          <span className="wf-bar" aria-hidden>
            <span style={{ width: `${Math.max(0, Math.min(100, (b.profit / scale) * 100))}%` }} />
          </span>
          <span className="wf-v">{formatINR(b.profit, 2)}</span>
        </li>
      </ul>
      <p className="wf-note">
        Customer pays {formatINR(b.customerPays, 2)} incl. GST on food. Platform takes {formatINR(b.totalPlatformCut, 2)} (
        {((b.totalPlatformCut / b.price) * 100).toFixed(0)}% of menu price).{' '}
        {target === null ? `No price reaches ${targetPct}% with these fees.` : `Price for ${targetPct}% margin: ${formatINR(target)}.`}
      </p>
    </div>
  );
}

function SettingsSheet({
  state,
  onClose,
  onChannel,
  onSettings,
}: {
  state: AppState;
  onClose: () => void;
  onChannel: (id: ChannelId, patch: Partial<ChannelSettings>) => void;
  onSettings: (patch: Partial<AppState['settings']>) => void;
}) {
  const s = state.settings;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="sheet-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside className="sheet" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <div className="sheet-head">
          <h2 id="settings-title">Fees &amp; channels</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close settings">
            <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden><path d="M6 6l8 8M14 6l-8 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
          </button>
        </div>
        <p className="muted small">Use the numbers from your own contract or a recent payout report. Everything recalculates as you type.</p>

        <fieldset className="field-group">
          <legend>Your goal and taxes</legend>
          <div className="grid-3">
            <NumberField label="Target margin" suffix="%" max={95} value={s.targetMarginPct} onChange={(n) => onSettings({ targetMarginPct: n })} />
            <NumberField label="GST on food" suffix="%" max={100} value={s.gstOnFoodPct} onChange={(n) => onSettings({ gstOnFoodPct: n })} />
            <NumberField label="GST on fees" suffix="%" max={100} value={s.gstOnFeesPct} onChange={(n) => onSettings({ gstOnFeesPct: n })} />
          </div>
        </fieldset>

        {CHANNEL_IDS.map((id) => {
          const c = s.channels[id];
          return (
            <fieldset key={id} className={`field-group ${c.enabled ? '' : 'is-off'}`}>
              <legend>
                <label className="toggle">
                  <input type="checkbox" checked={c.enabled} onChange={(e) => onChannel(id, { enabled: e.target.checked })} />
                  <span>{c.label}</span>
                </label>
              </legend>
              <div className="grid-3">
                <NumberField label="Commission" suffix="%" max={100} value={c.commissionPct} onChange={(n) => onChannel(id, { commissionPct: n })} />
                <NumberField label="Payment fee" suffix="%" max={100} step={0.1} value={c.paymentFeePct} onChange={(n) => onChannel(id, { paymentFeePct: n })} />
                <NumberField label={id === 'direct' ? 'Delivery cost' : 'Fixed fee / order'} prefix="₹" value={c.fixedFeePerOrder} onChange={(n) => onChannel(id, { fixedFeePerOrder: n })} />
                <NumberField label="Discount you fund" suffix="%" max={100} value={c.discountPct} onChange={(n) => onChannel(id, { discountPct: n })} />
                <NumberField label="Discount cap" prefix="₹" value={c.discountCap} onChange={(n) => onChannel(id, { discountCap: n })} />
              </div>
            </fieldset>
          );
        })}
        <div className="sheet-foot">
          <button className="btn" onClick={onClose}>Done</button>
        </div>
      </aside>
    </div>
  );
}

export function Logo() {
  return (
    <svg viewBox="0 0 32 32" width="26" height="26" aria-hidden>
      <circle cx="16" cy="16" r="14" fill="var(--accent)" />
      <circle cx="16" cy="16" r="9" fill="none" stroke="var(--paper)" strokeWidth="2" />
      <path d="M12 16h8M16 12v8" stroke="var(--paper)" strokeWidth="2.4" strokeLinecap="round" transform="rotate(45 16 16)" />
    </svg>
  );
}
