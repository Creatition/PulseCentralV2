# PulseCentral

A lightweight, privacy-first PulseChain portfolio tracker built with vanilla JS and Node/Express.

**[Live Features]**
- 📊 Live prices & charts for PLS, PLSX, HEX, INC, PRVX and 50+ tokens
- 💼 Portfolio tracker — load any wallet to see balances, values & composition
- 🗂 Portfolio Groups — combine multiple wallets into one aggregate view
- ⭐ Watchlist — track your favourite tokens with live price alerts
- 🔄 DEX Swap — embedded PulseX swap interface
- 🔗 Links hub — curated ecosystem tools & resources
- 🔐 Security analysis — GoPlus honeypot & risk checks per token
- 🐋 Whale tracker — large transfer monitoring per token

---

## Getting Started

### Prerequisites
- Node.js 18+ (uses native `fetch`)

### Install & Run

```bash
git clone https://github.com/Creatition/PulseCentral.git
cd PulseCentral
npm install
npm start
```

Open `http://localhost:3000` in your browser.

For development with auto-restart on file changes:
```bash
npm run dev
```

### Environment Variables

Copy `.env.example` to `.env` and configure as needed:

```bash
cp .env.example .env
```

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | Server port |
| `RATE_LIMIT_MAX` | `200` | Max API requests per IP per window |
| `RATE_LIMIT_WINDOW` | `60000` | Rate limit window in ms (1 minute) |
| `ALLOWED_ORIGIN` | *(unset)* | Set to your domain in production to lock CORS |

---

## Architecture

```
PulseCentral/
├── index.html          # Single-page app shell
├── css/
│   └── style.css       # All styles (CSS custom properties + themes)
├── js/
│   ├── app.js          # UI: tabs, charts, portfolio, watchlist, modals
│   ├── api.js          # Data fetching layer (DexScreener, BlockScout, etc.)
│   └── trades.js       # Trade log CRUD + FIFO P&L engine
├── assets/
│   └── favicon.svg
└── server/
    └── index.js        # Express proxy server + weekly chart snapshot builder
```

**Data flow:** The browser talks only to the local Express server (`/api/*`). The server proxies requests to DexScreener, PulseChain Scan, GoPlus, DexTools, etc. — keeping API keys and upstream origins server-side, and adding caching + rate limiting.

**All user data** (watchlist, portfolio history, trades, user profiles) is stored in the browser's `localStorage` only. Nothing is sent to any server.

---

## Security

- **No API keys required** — all upstream APIs used are free/public
- **Path sanitisation** — all proxy paths are validated before forwarding
- **GraphQL injection defence** — token addresses validated as `0x[0-9a-f]{40}` before interpolation
- **Rate limiting** — 200 req/min per IP (configurable)
- **Security headers** — CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy
- **XSS prevention** — all API-sourced strings inserted via `textContent` or `escHtml()`

---

## Production Deployment

1. Set `ALLOWED_ORIGIN` to your domain (prevents cross-site relay abuse)
2. Run behind a reverse proxy (nginx/Caddy) with TLS
3. Use a process manager like PM2: `pm2 start server/index.js --name pulsecentral`
4. Optionally set `RATE_LIMIT_MAX` lower (e.g. `100`) for stricter throttling

---

## Known Limitations

- Portfolio history is per-browser (localStorage). Clearing browser data loses it.
- The User Profile feature stores hashed passwords in localStorage — it is a convenience feature, not a security-hardened auth system. Don't reuse important passwords.
- DexScreener rate limits may cause temporary data gaps under heavy load.

---

## License

MIT
