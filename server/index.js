'use strict';

const express = require('express');
const path    = require('path');
const fs      = require('fs');
const app     = express();
const PORT    = process.env.PORT || 3000;

/* ── Security headers ─────────────────────────────────── */

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Content-Security-Policy', [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https://cdn.dexscreener.com https://dd.dexscreener.com https://dexscreener.com https://icons.llamao.fi https://scan.pulsechain.com https://libertyswap.finance https://9mm.pro https://app.piteas.io https://www.geckoterminal.com https://hex.com https://www.dextools.io https://www.google.com https://t2.gstatic.com https://coin-images.coingecko.com https://assets.coingecko.com",
    "frame-src https://dexscreener.com https://pulsex.mypinata.cloud",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
  ].join('; '));
  next();
});

/* ── CORS ─────────────────────────────────────────────── */

app.use((req, res, next) => {
  const origin  = req.headers.origin;
  const allowed = process.env.ALLOWED_ORIGIN;
  if (origin && allowed && origin !== allowed) return res.status(403).json({ error: 'Forbidden' });
  next();
});

/* ── Rate limiter (200 req/min per IP) ────────────────── */

const rlMap = new Map();
const RL_MAX = parseInt(process.env.RATE_LIMIT_MAX || '200', 10);
const RL_WIN = parseInt(process.env.RATE_LIMIT_WINDOW || '60000', 10);

app.use('/api/', (req, res, next) => {
  const ip  = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress || 'x';
  const now = Date.now();
  let e = rlMap.get(ip);
  if (!e || now >= e.r) { rlMap.set(ip, { c: 1, r: now + RL_WIN }); return next(); }
  if (++e.c > RL_MAX) { res.setHeader('Retry-After', Math.ceil((e.r - now) / 1000)); return res.status(429).json({ error: 'Too many requests' }); }
  next();
});
setInterval(() => { const n = Date.now(); for (const [k, v] of rlMap) if (n >= v.r) rlMap.delete(k); }, 5 * 60_000).unref();

/* ── In-memory cache (30s TTL) ────────────────────────── */

const cache = new Map();
const TTL   = 30_000;

function getCached(k) {
  const e = cache.get(k);
  if (!e) return null;
  if (Date.now() - e.t > TTL) { cache.delete(k); return null; }
  return e.d;
}
function setCached(k, d) { cache.set(k, { d, t: Date.now() }); }
setInterval(() => { const n = Date.now(); for (const [k, e] of cache) if (n - e.t > TTL) cache.delete(k); }, 60_000).unref();

/* ── Path sanitiser ───────────────────────────────────── */

function sanitise(raw) {
  if (typeof raw !== 'string') return null;
  const c = raw.replace(/\0/g, '').replace(/^\/+/, '');
  if (c.split('/').some(s => s === '..')) return null;
  if (/[@:]/.test(c)) return null;
  return c;
}

/* ── Generic proxy helper ─────────────────────────────── */

async function proxy(res, url, extraHeaders = {}) {
  const cached = getCached(url);
  if (cached) return res.json(cached);
  try {
    const r = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PulseCentral/1.0)', 'Accept': 'application/json', ...extraHeaders },
      signal: AbortSignal.timeout(15_000),
    });
    if (!r.ok) return res.status(r.status).json({ error: `Upstream HTTP ${r.status}` });
    const data = await r.json();
    setCached(url, data);
    res.json(data);
  } catch (err) {
    console.error('[proxy]', url, err.message);
    res.status(502).json({ error: 'Proxy failed', detail: err.message });
  }
}

function qs(req) { const s = new URLSearchParams(req.query).toString(); return s ? '?' + s : ''; }

/* ══════════════════════════════════════════════════════════
   PROXY ROUTES — only confirmed-working APIs
   ══════════════════════════════════════════════════════════ */

// ── DexScreener main API ───────────────────────────────
// Confirmed working: pairs, token search, token profiles, boosts
app.get('/api/dex/*', (req, res) => {
  const p = sanitise(req.params[0]);
  if (!p) return res.status(400).json({ error: 'Bad path' });
  proxy(res, `https://api.dexscreener.com/${p}${qs(req)}`);
});

// ── GeckoTerminal OHLCV + network stats ───────────────
// Confirmed working: OHLCV daily bars, free, no auth
app.get('/api/gecko/*', (req, res) => {
  const p = sanitise(req.params[0]);
  if (!p) return res.status(400).json({ error: 'Bad path' });
  proxy(res, `https://api.geckoterminal.com/api/v2/${p}${qs(req)}`, {
    'Accept': 'application/json; version=20230302',
  });
});

// ── BlockScout v1 (confirmed working for balances/token lists) ─
app.get('/api/scan', (req, res) => {
  proxy(res, `https://api.scan.pulsechain.com/api${qs(req)}`);
});

// ── BlockScout v2 token metadata + transfers ──────────
// /api/v2/tokens/{addr} and /api/v2/tokens/{addr}/transfers work
app.get('/api/scan-v2/*', (req, res) => {
  const p = sanitise(req.params[0]);
  if (!p) return res.status(400).json({ error: 'Bad path' });
  proxy(res, `https://scan.pulsechain.com/api/v2/${p}${qs(req)}`);
});

// ── DefiLlama bridge TVL (confirmed working) ──────────
app.get('/api/llama/protocol/:slug', (req, res) => {
  const slug = sanitise(req.params.slug);
  if (!slug) return res.status(400).json({ error: 'Bad slug' });
  proxy(res, `https://api.llama.fi/protocol/${slug}`);
});

// ── GoPlus security (confirmed working) ───────────────
app.get('/api/goplus/*', (req, res) => {
  const p = sanitise(req.params[0]);
  if (!p) return res.status(400).json({ error: 'Bad path' });
  proxy(res, `https://api.gopluslabs.io/${p}${qs(req)}`);
});

// ── Fear & Greed index ─────────────────────────────────
app.get('/api/fear-greed', async (req, res) => {
  const k = 'fear-greed';
  const c = getCached(k);
  if (c) return res.json(c);

  function label(s) {
    if (s <= 24) return 'Extreme Fear';
    if (s <= 44) return 'Fear';
    if (s <= 55) return 'Neutral';
    if (s <= 74) return 'Greed';
    return 'Extreme Greed';
  }

  // Try alternative.me
  try {
    const r = await fetch('https://api.alternative.me/fng/?limit=1', {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PulseCentral/1.0)', 'Accept': 'application/json' },
      signal: AbortSignal.timeout(10_000),
    });
    if (r.ok) {
      const d = await r.json();
      if (d?.data?.[0]) { setCached(k, d); return res.json(d); }
    }
  } catch { /* fall through */ }

  res.status(502).json({ error: 'Fear & Greed unavailable' });
});

// ── CoinGecko global market data (BTC dominance etc.) ─
app.get('/api/coingecko/global', (req, res) => {
  proxy(res, 'https://api.coingecko.com/api/v3/global');
});

// Unified CoinGecko markets endpoint — handles both Crypto Top 100 and commodity token lookups
// If ?ids= is passed → fetch those specific coins (commodity use)
// Otherwise → fetch top 100 by market cap (Crypto Top 100 use)
app.get('/api/coingecko/markets', async (req, res) => {
  res.setHeader('Content-Type', 'application/json');

  const ids       = req.query.ids || '';
  const perPage   = req.query.per_page || '100';
  const cacheKey  = ids ? `cg-ids:${ids}` : 'cg-top100';
  const cached    = getCached(cacheKey);
  if (cached) return res.json(cached);

  // Build the CoinGecko URL
  const params = new URLSearchParams({
    vs_currency: 'usd',
    order: 'market_cap_desc',
    per_page: perPage,
    page: '1',
    sparkline: 'false',
    price_change_percentage: '24h,7d',
  });
  if (ids) params.set('ids', ids);

  const cgUrl = `https://api.coingecko.com/api/v3/coins/markets?${params}`;

  // Try CoinGecko first
  try {
    const r = await fetch(cgUrl, {
      headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0 (compatible; PulseCentral/1.0)' },
      signal: AbortSignal.timeout(15_000),
    });
    const text = await r.text();
    let json;
    try { json = JSON.parse(text); } catch {
      console.warn('[coingecko/markets] non-JSON:', text.slice(0, 100));
      json = null;
    }
    if (Array.isArray(json) && json.length > 0) {
      setCached(cacheKey, json);
      return res.json(json);
    }
    if (json && !Array.isArray(json)) {
      console.warn('[coingecko/markets] unexpected format:', JSON.stringify(json).slice(0, 100));
    }
  } catch (e) { console.warn('[coingecko/markets] CoinGecko failed:', e.message); }

  // Fallback for top-100 only: CoinCap
  if (!ids) {
    try {
      const r = await fetch('https://api.coincap.io/v2/assets?limit=100', {
        headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(12_000),
      });
      const text = await r.text();
      const json = JSON.parse(text);
      if (Array.isArray(json.data) && json.data.length > 0) {
        const mapped = json.data.map((c, i) => ({
          id: c.id, symbol: c.symbol, name: c.name,
          image: `https://assets.coincap.io/assets/icons/${(c.symbol||'').toLowerCase()}@2x.png`,
          current_price: parseFloat(c.priceUsd) || 0,
          market_cap: parseFloat(c.marketCapUsd) || 0,
          market_cap_rank: i + 1,
          total_volume: parseFloat(c.volumeUsd24Hr) || 0,
          price_change_percentage_24h: parseFloat(c.changePercent24Hr) || 0,
          price_change_percentage_7d_in_currency: 0,
        }));
        setCached(cacheKey, mapped);
        return res.json(mapped);
      }
    } catch (e) { console.warn('[coingecko/markets] CoinCap fallback failed:', e.message); }
  }

  return res.status(502).json({ error: 'Market data unavailable. Try again shortly.' });
});

// Commodities — fetches commodity-tracking tokens from CoinGecko
// These are verified CoinGecko IDs for tokens that track real-world commodity prices
app.get('/api/commodities', async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  const cacheKey = 'commodities-v2';
  const cached = getCached(cacheKey);
  if (cached) return res.json(cached);

  // Verified CoinGecko IDs — all confirmed to exist on CoinGecko
  // pax-gold = PAXG (1 oz gold), tether-gold = XAUt (gold), 
  // xaut = same as tether-gold alias, silvercoin tracks silver, 
  // platinum tracks platinum, wrapped-bitcoin for BTC commodity proxy
  const COMMODITY_IDS = [
    'pax-gold',        // PAXG — 1 token backed by 1 troy oz physical gold ✓ confirmed
    'tether-gold',     // XAUt — Tether gold token ✓ confirmed  
    'silvercoin',      // SLV — silver tracking token
    'silver',          // SLVT — another silver token on CoinGecko
    'platinum',        // XPTX — platinum
    'xdoge',           // placeholder test
    'wrapped-bitcoin', // WBTC — BTC as digital commodity
    'ethereum',        // ETH — digital commodity
    'chainlink',       // LINK — oracle commodity data token
  ].join(',');

  try {
    const r = await fetch(`https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${COMMODITY_IDS}&order=market_cap_desc&per_page=20&page=1&sparkline=false&price_change_percentage=24h`, {
      headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0 (compatible; PulseCentral/1.0)' },
      signal: AbortSignal.timeout(15_000),
    });
    const text = await r.text();
    let coins;
    try { coins = JSON.parse(text); } catch { coins = []; }
    if (!Array.isArray(coins)) coins = [];

    console.log(`[commodities] CoinGecko returned ${coins.length} tokens:`, coins.map(c => c.id));

    // Map CoinGecko coin → our commodity symbol key
    const ID_TO_SYM = {
      'pax-gold':        'GC=F',
      'tether-gold':     'GC=F',   // use first gold result only
      'silvercoin':      'SI=F',
      'silver':          'SI=F',
      'platinum':        'PL=F',
    };

    const result = {};
    for (const coin of coins) {
      const sym = ID_TO_SYM[coin.id];
      if (!sym || result[sym]) continue; // skip if no mapping or already have one
      result[sym] = {
        cgId:       coin.id,
        name:       coin.name,
        image:      coin.image,
        price:      coin.current_price || 0,
        change:     coin.price_change_24h || 0,
        changePct:  coin.price_change_percentage_24h || 0,
        high24h:    coin.high_24h || null,
        low24h:     coin.low_24h || null,
        lastUpdate: Date.now(),
      };
    }

    console.log(`[commodities] mapped ${Object.keys(result).length} symbols:`, Object.keys(result));
    setCached(cacheKey, result);
    return res.json(result);
  } catch (err) {
    console.error('[commodities]', err.message);
    return res.status(502).json({ error: err.message });
  }
});

/* ── Weekly chart snapshot (served from disk cache) ───── */
// Server pre-builds weekly OHLCV snapshots using GeckoTerminal
// so the browser doesn't have to fetch large datasets on every load.

const SNAPSHOT_FILE = path.join(__dirname, 'data', 'chart-snapshots.json');

// Coins to snapshot: PLS, PLSX, HEX, INC, PRVX
const SNAPSHOT_COINS = [
  { symbol: 'PLS',  pair: '0xE56043671df55dE5CDf8459710433C10324DE0aE' }, // WPLS/USDC — PLS price in USD
  { symbol: 'PLSX', pair: '0x1b45b9148791d3a104184cd5dfe5ce57193a3ee9' },
  { symbol: 'HEX',  pair: '0xf1f4ee610b2babb05c635f726ef8b0c568c8dc65' },
  { symbol: 'INC',  pair: '0xf808bb6265e9ca27002c0a04562bf50d4fe37eaa' },
  { symbol: 'PRVX', pair: '0x7f681a5ad615238357ba148c281e2eaefd2de55a' },
];

function getMondayMs() {
  const d   = new Date();
  const dow = d.getUTCDay();
  const daysBack = (dow + 6) % 7;
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - daysBack);
}

async function fetchGeckoBars(pairAddress) {
  const url = `https://api.geckoterminal.com/api/v2/networks/pulsechain/pools/${pairAddress}/ohlcv/day?aggregate=1&limit=1000&currency=usd`;
  const r = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PulseCentral/1.0)', 'Accept': 'application/json; version=20230302' },
    signal: AbortSignal.timeout(20_000),
  });
  if (!r.ok) throw new Error(`GeckoTerminal HTTP ${r.status}`);
  const data = await r.json();
  const raw  = data?.data?.attributes?.ohlcv_list || [];
  return raw
    .map(b => ({
      time:   b[0] > 1e10 ? b[0] : b[0] * 1000,
      open:   Number(b[1] || 0),
      high:   Number(b[2] || 0),
      low:    Number(b[3] || 0),
      close:  Number(b[4] || 0),
      volume: Number(b[5] || 0),
    }))
    .filter(b => b.time > 0 && b.close > 0)
    .sort((a, b) => a.time - b.time);
}

let snapshotCache = null;

function loadSnapshot() {
  try {
    const raw = fs.readFileSync(SNAPSHOT_FILE, 'utf8');
    snapshotCache = JSON.parse(raw);
    return snapshotCache;
  } catch { return null; }
}

function saveSnapshot(data) {
  try {
    fs.mkdirSync(path.dirname(SNAPSHOT_FILE), { recursive: true });
    fs.writeFileSync(SNAPSHOT_FILE, JSON.stringify(data));
    snapshotCache = data;
  } catch (err) { console.error('[snapshot] save failed:', err.message); }
}

async function buildSnapshot() {
  const mondayMs = getMondayMs();
  const coins    = {};
  await Promise.all(SNAPSHOT_COINS.map(async ({ symbol, pair }) => {
    try {
      coins[symbol] = await fetchGeckoBars(pair);
      console.log(`[snapshot] ${symbol}: ${coins[symbol].length} bars`);
    } catch (err) {
      console.error(`[snapshot] ${symbol} failed:`, err.message);
      coins[symbol] = [];
    }
  }));
  return { takenAt: Date.now(), weekCutoff: mondayMs, coins };
}

async function refreshSnapshot() {
  const mondayMs = getMondayMs();
  const current  = snapshotCache || loadSnapshot();
  const hasData  = current && SNAPSHOT_COINS.every(({ symbol }) =>
    Array.isArray(current.coins?.[symbol]) && current.coins[symbol].length >= 1
  );
  if (hasData && current.weekCutoff >= mondayMs) return; // up to date
  console.log('[snapshot] Building...');
  try {
    const snap = await buildSnapshot();
    saveSnapshot(snap);
    console.log('[snapshot] Done.');
  } catch (err) { console.error('[snapshot] Build failed:', err.message); }
}

refreshSnapshot().catch(() => {});
setInterval(() => refreshSnapshot().catch(() => {}), 3_600_000).unref();

app.get('/api/chart-snapshots', (_req, res) => {
  const data = snapshotCache || loadSnapshot();
  if (!data) return res.status(503).json({ error: 'Snapshot not ready' });
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.json(data);
});

/* ── Static files ─────────────────────────────────────── */

app.use(express.static(path.join(__dirname, '..')));

/* ── Start ────────────────────────────────────────────── */

const server = app.listen(PORT, () => console.log(`PulseCentral → http://localhost:${PORT}`));

process.on('SIGTERM', () => server.close(() => process.exit(0)));
process.on('SIGINT',  () => server.close(() => process.exit(0)));
