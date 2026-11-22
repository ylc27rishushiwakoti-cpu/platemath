# PlateMath

**Know what every dish really earns.** PlateMath is a menu profitability calculator for cloud kitchens selling on Swiggy, Zomato and their own channel. Enter menu price, food cost and packaging; it takes out commission, payment fees, restaurant-funded discounts (with caps) and GST on platform fees, then shows the profit you actually keep per dish, per channel, plus the menu price needed to hit your target margin.

## Who it's for

Owners of small Indian cloud kitchens who set prices from food cost alone and find out at month end that delivery apps ate the margin. Built from running two cloud kitchens in Gurgaon (South Indian and Himalayan momos).

## Features

- Dish table with live profit and margin per channel, colour-coded against your target
- Per-dish waterfall: menu price → discount → commission → payment fee → fixed fee → GST on fees → payout → costs → profit, with a live "try a price" field
- Target price solver (works with discount caps) rounded up to the nearest rupee
- Per-channel settings for Swiggy, Zomato and direct orders, each can be switched off
- Autosave to the browser, share links (whole menu encoded in the URL hash, never sent to a server), CSV import and export
- Landing page with a live quick calculator, an SEO guide article, sitemap, robots, OG image, 404 page

## Tech and architecture

| Layer | Choice |
| --- | --- |
| Build | Vite 8, multi-page (landing, `/app/`, `/blog/...`, `404`) so marketing pages ship as static HTML for SEO |
| App | React 19 + TypeScript (strict) |
| Logic | `src/lib/calc.ts`: pure functions, no browser APIs, fully unit tested |
| Data | Local-first: `localStorage` with schema sanitising; share state via URL hash |
| Analytics | Microsoft Clarity, loaded only when `VITE_CLARITY_ID` is set, with custom events |
| Hosting | Vercel (static), security headers and immutable asset caching in `vercel.json` |
| CI | GitHub Actions runs tests and build on every push |

### Reliability and error handling

- Every external input (localStorage, share links, CSV files) goes through `sanitize()` which clamps numbers, caps lengths and list sizes, and never throws
- Numeric inputs keep raw text while typing and only emit clean, clamped numbers
- CSV export escapes spreadsheet formula injection; import skips and reports bad rows; 1 MB file limit
- Storage failures (private mode, quota) show a banner instead of silently losing work
- A React error boundary offers reload or reset instead of a blank screen
- Deleting a dish can be undone

## Run locally

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # unit tests for the money maths and storage
npm run build    # typecheck + production build + sitemap
```

Environment variables (see `.env.example`):

- `SITE_URL` your live domain, used in sitemap, robots and canonical tags
- `VITE_CLARITY_ID` Microsoft Clarity project ID (optional)

## How the maths works

For menu price `P` on a channel:

```
discount     = min(P × discount%, cap)
food value   = P − discount
commission   = food value × commission%
payment fee  = food value × (1 + food GST) × payment%
GST on fees  = (commission + payment fee + fixed fee) × 18%
payout       = food value − commission − payment fee − fixed fee − GST on fees
profit       = payout − food cost − packaging
```

GST on food is collected from the customer and remitted by the platform, so it is treated as pass-through. Default fee values are editable placeholders, not official platform rates.

## Built with AI

Designed and built with Claude (Anthropic) as a pair programmer: product scoping, the pricing model, the React UI, tests and deployment config were written in an AI-assisted workflow, then reviewed and verified against hand-worked examples.
