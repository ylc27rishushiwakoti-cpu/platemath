// Microsoft Clarity. Loads only when VITE_CLARITY_ID is set at build time,
// so local dev and forks never send data anywhere.
declare global {
  interface Window {
    clarity?: ((...args: unknown[]) => void) & { q?: unknown[] };
  }
}

const id = import.meta.env.VITE_CLARITY_ID as string | undefined;

export function initAnalytics() {
  if (!id || typeof window === 'undefined' || window.clarity) return;
  if (!/^[a-z0-9]{6,20}$/i.test(id)) return;
  const c = ((...args: unknown[]) => {
    (c.q = c.q || []).push(args);
  }) as NonNullable<Window['clarity']>;
  window.clarity = c;
  const s = document.createElement('script');
  s.async = true;
  s.src = `https://www.clarity.ms/tag/${id}`;
  document.head.appendChild(s);
}

/** Custom event, visible under Clarity's "Smart events / Custom tags". */
export function track(event: string) {
  try {
    window.clarity?.('event', event);
  } catch {
    /* analytics must never break the app */
  }
}
