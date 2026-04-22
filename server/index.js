'use strict';

const express  = require('express');
const path     = require('path');
const fs       = require('fs');

const app  = express();
const PORT = process.env.PORT || 3000;

/* ── Security headers ───────────────────────────────────── */

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), camera=(), microphone=()');
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https://dd.dexscreener.com https://dexscreener.com https://libertyswap.finance https://9mm.pro https://swap.internetmoney.io https://app.piteas.io https://www.geckoterminal.com https://hex.com",
      "frame-src https://dexscreener.com https://pulsex.mypinata.cloud",
      "connect-src 'self'",
      "font-src 'self'",
      "object-src 'none'",
      "base-uri 'self'",
    ].join('; ')
  );
  next();
});

/* ── CORS — restrict to same-origin requests ────────────── */

app.use((req, res, next) => {
  const origin  = req.headers.origin;
  const allowed = process.env.ALLOWED_ORIGIN; // e.g. https://pulsecentral.io
  if (origin && allowed && origin !== allowed) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  next();
});

/* ── In-memory rate limiter (per-IP, sliding window) ────── */

const rateLimitWindows = new Map();
const RATE_LIMIT_MAX    = parseInt(process.env.RATE_LIMIT_MAX    || '200',   10);
const RATE_LIMIT_WINDOW = parseInt(process.env.RATE_LIMIT_WINDOW || '60000', 10); // ms

function rateLimiter(req, res, next) {
  const ip  = (req.headers['x-forwarded-for'] || '').split(',')[0].trim()
              || req.socket?.remoteAddress
              || 'unknown';
  const now = Date.now();
  let entry = rateLimitWindows.get(ip);

  if (!entry || now >= entry.resetAt) {
    rateLimitWindows.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
    return next();
  }

  entry.count++;
  if (entry.count > RATE_LIMIT_MAX) {
    res.setHeader('Retry-After', Math.ceil((entry.resetAt - now) / 1000));
    return res.status(429).json({ error: 'Too many requests. Please slow down.' });
  }
  next();
}

// Sweep expired entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [ip, e] of rateLimitWindows) {
    if (now >= e.resetAt) rateLimitWindows.delete(ip);
  }
}, 5 * 60_000).unref();

// Apply rate limiting to all proxy routes
app.use('/api/', rateLimiter);

/* ── In-memory response cache ───────────────────────────────── */

const cache     = new Map();
const CACHE_TTL = 30_000; // 30 seconds

function getCached(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL) { cache.delete(key); return null; }
  return entry.data;
}

function setCached(key, data) {
  cache.set(key, { data, ts: Date.now() });
}

// Periodically sweep expired cache entries to bound memory usage
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of cache) {
    if (now - entry.ts > CACHE_TTL) cache.delete(key);
  }
}, 60_000).unref();

/* ── Path sanitisation ──────────────────────────────────────── */

/**
 * Strip `..` segments and any embedded protocol/host characters from a
 * user-supplied sub-path so the constructed upstream URL always stays on
 * the expected host.  Returns null when the sanitised path looks unsafe.
 */
function sanitisePath(raw) {
  if (typeof raw !== 'string') return null;
  // Remove null bytes and collapse any leading slashes
  const cleaned = raw.replace(/\0/g, '').replace(/^\/+/, '');
  // Reject strings that still contain `..` sequences after splitting
  const segments = cleaned.split('/');
  if (segments.some(s => s === '..')) return null;
  // Reject anything that could smuggle a different host (@, scheme colon)
  if (/[@:]/.test(cleaned)) return null;
  return cleaned;
}

/* ── Shared proxy helper ─────────────────────────────────────── */

/**
 * Forward a GET request to `upstreamUrl`, cache the JSON response,
 * and send it back to the browser.
 */
async function proxyJson(res, upstreamUrl) {
  const cached = getCached(upstreamUrl);
  if (cached) return res.json(cached);

  try {
    const upstream = await fetch(upstreamUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; PulseCentral/1.0)',
        'Accept':     'application/json',
      },
      signal: AbortSignal.timeout(15_000),
    });

    if (!upstream.ok) {
      return res
        .status(upstream.status)
        .json({ error: `Upstream returned HTTP ${upstream.status}` });
    }

    const data = await upstream.json();
    setCached(upstreamUrl, data);
    res.json(data);
  } catch (err) {
    console.error('[PulseCentral proxy]', upstreamUrl, err.message);
    res.status(502).json({ error: 'Proxy request failed', detail: err.message });
  }
}

/**
 * Rebuild a query string from Express req.query so we can append it to the
 * upstream URL without inadvertently double-encoding or dropping parameters.
 */
function qs(req) {
  const str = new URLSearchParams(req.query).toString();
  return str ? '?' + str : '';
}

/* ── Weekly chart snapshot (PLSX, HEX, INC, PRVX) ──────────── */

/** Path to the persisted snapshot JSON file.
 *  The server/data/ directory is created automatically on first run.
 *  It is listed in .gitignore — do not commit snapshot files. */
const SNAPSHOT_FILE = path.join(__dirname, 'data', 'chart-snapshots.json');

/** PulseX V1 subgraph endpoint. */
const PULSEX_GRAPH = 'https://graph.v2b.pulsechain.com/subgraphs/name/pulsechain/v2b-pulsex';

/**
 * May 13 2023 00:00:00 UTC (seconds) — earliest bar included in snapshot charts.
 * This is the date chosen as the chart start to align with the week of PulseChain's
 * mainnet launch (May 12 2023).
 */
const CHART_START_SEC = 1683936000;

/** Timeout (ms) for individual PulseX subgraph requests during snapshot build. */
const SUBGRAPH_TIMEOUT_MS = 25_000;

/** How often (ms) to check whether a new Monday snapshot is needed. */
const REFRESH_INTERVAL_MS = 3_600_000; // 1 hour

/**
 * The four core coins whose charts are served as weekly snapshots.
 * PLS is excluded — its chart stays live.
 */
const SNAPSHOT_COINS = [
  { symbol: 'PLSX', address: '0x95b303987a60c71504d99aa1b13b4da07b0790ab' },
  { symbol: 'HEX',  address: '0x2b591e99afe9f32eaa6214f7b7629768c40eeb39' },
  { symbol: 'INC',  address: '0x2fa878ab3f87cc1c9737fc071108f904c0b0c95d' },
  { symbol: 'PRVX', address: '0xf6f8db0aba00007681f8faf16a0fda1c9b030b11' },
];

/**
 * Return the Unix timestamp in milliseconds for 00:00:00 UTC on the most-recent
 * Monday (today itself if today is Monday).
 */
function getMondayMs() {
  const now = new Date();
  const dow = now.getUTCDay();           // 0=Sun, 1=Mon … 6=Sat
  const daysBack = (dow + 6) % 7;        // days since last Monday
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - daysBack);
}

/**
 * Fetch all daily tokenDayData records from the PulseX subgraph for a single
 * token, from CHART_START_SEC onwards.  Paginates automatically.
 * @param {string} tokenAddress  Lowercase token contract address
 * @returns {Promise<Array<{time:number,open:number,high:number,low:number,close:number,volume:number}>>}
 *   Each bar's `time` is in milliseconds (UTC midnight for that day).
 */
async function fetchSubgraphHistory(tokenAddress) {
  // Validate address before interpolating into GraphQL query (injection defence)
  if (!/^0x[0-9a-f]{40}$/i.test(tokenAddress)) {
    throw new Error(`Invalid token address: ${tokenAddress}`);
  }
  const addr = tokenAddress.toLowerCase();
  let allRows = [];
  // Start query just before our desired window so the first included day is fetched
  let lastDate = CHART_START_SEC - 86400;
  let hasMore  = true;

  while (hasMore) {
    const query = `{
      tokenDayDatas(
        first: 1000
        orderBy: date
        orderDirection: asc
        where: { token: "${addr}", date_gt: ${lastDate} }
      ) {
        date
        priceUSD
        dailyVolumeUSD
      }
    }`;

    const r = await fetch(PULSEX_GRAPH, {
      method:  'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept':       'application/json',
        'User-Agent':   'Mozilla/5.0 (compatible; PulseCentral/1.0)',
      },
      body:   JSON.stringify({ query }),
      signal: AbortSignal.timeout(SUBGRAPH_TIMEOUT_MS),
    });

    if (!r.ok) throw new Error(`Subgraph HTTP ${r.status}`);
    const data = await r.json();
    const rows = data?.data?.tokenDayDatas || [];
    if (rows.length === 0) { hasMore = false; break; }

    allRows   = allRows.concat(rows);
    lastDate  = Number(rows[rows.length - 1].date);
    if (rows.length < 1000) hasMore = false;
  }

  return allRows
    .map(d => {
      const price = Number(d.priceUSD || 0);
      return {
        time:   Number(d.date) * 1000,   // convert seconds → milliseconds
        open:   price,
        high:   price,
        low:    price,
        close:  price,
        volume: Number(d.dailyVolumeUSD || 0),
      };
    })
    .filter(b => b.time >= CHART_START_SEC * 1000 && b.close > 0);
}

/**
 * Aggregate an array of daily bars (time in ms) into weekly bars.
 * Each weekly bar's `time` is the Monday of that ISO week at 00:00:00 UTC (ms).
 * Only bars whose week-start Monday is <= `cutoffMs` are included.
 * @param {Array<{time:number,open:number,high:number,low:number,close:number,volume:number}>} dailyBars
 * @param {number} cutoffMs  Millisecond timestamp of the Monday cutoff (inclusive)
 * @returns {Array<{time:number,open:number,high:number,low:number,close:number,volume:number}>}
 */
function aggregateDailyToWeekly(dailyBars, cutoffMs) {
  const sorted = [...dailyBars].sort((a, b) => a.time - b.time);
  const weeks  = new Map();

  for (const bar of sorted) {
    const d   = new Date(bar.time);
    const dow = d.getUTCDay();              // 0=Sun … 6=Sat
    const daysBack = (dow + 6) % 7;
    const monday = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - daysBack);
    if (monday > cutoffMs) continue;        // exclude bars past the cutoff Monday

    if (!weeks.has(monday)) {
      weeks.set(monday, { time: monday, open: bar.open, high: bar.high, low: bar.low, close: bar.close, volume: bar.volume });
    } else {
      const w = weeks.get(monday);
      w.high   = Math.max(w.high, bar.high);
      w.low    = Math.min(w.low, bar.low);
      w.close  = bar.close;   // sorted asc → last bar of week becomes close
      w.volume += bar.volume;
    }
  }

  return [...weeks.values()].sort((a, b) => a.time - b.time);
}

/**
 * Fetch and build a fresh snapshot for all SNAPSHOT_COINS.
 * @returns {Promise<object>}  Snapshot object ready to persist.
 */
async function buildSnapshot() {
  const mondayMs = getMondayMs();
  const coins    = {};

  await Promise.all(SNAPSHOT_COINS.map(async ({ symbol, address }) => {
    try {
      const daily   = await fetchSubgraphHistory(address);
      coins[symbol] = aggregateDailyToWeekly(daily, mondayMs);
    } catch (err) {
      console.error(`[PulseCentral snapshot] Failed to fetch ${symbol}:`, err.message);
      coins[symbol] = [];
    }
  }));

  return { takenAt: Date.now(), weekCutoff: mondayMs, coins };
}

/** In-memory snapshot cache (avoids re-reading the file on every request). */
let snapshotCache = null;

/**
 * Load the snapshot from disk into the in-memory cache.
 * Returns null if the file does not exist or is unreadable.
 */
function loadSnapshot() {
  try {
    const raw = fs.readFileSync(SNAPSHOT_FILE, 'utf8');
    snapshotCache = JSON.parse(raw);
    return snapshotCache;
  } catch {
    return null;
  }
}

/** Persist `data` to disk and update the in-memory cache. */
function saveSnapshot(data) {
  try {
    fs.mkdirSync(path.dirname(SNAPSHOT_FILE), { recursive: true });
    fs.writeFileSync(SNAPSHOT_FILE, JSON.stringify(data));
    snapshotCache = data;
  } catch (err) {
    console.error('[PulseCentral snapshot] Failed to save snapshot:', err.message);
  }
}

/**
 * Refresh the snapshot if it is stale (i.e. its `weekCutoff` predates the
 * current Monday) OR if any coin has insufficient bar data (< 3 bars).
 * Runs at startup and whenever the hourly timer fires.
 */
async function refreshSnapshotIfNeeded() {
  const mondayMs = getMondayMs();
  const current  = snapshotCache || loadSnapshot();

  // Check that every coin in the snapshot has at least 3 bars of real history.
  // If the initial build ran while the subgraph was unavailable, coins may have
  // empty arrays — in that case we must rebuild even if weekCutoff looks fresh.
  const hasAdequateData = current &&
    SNAPSHOT_COINS.every(({ symbol }) =>
      Array.isArray(current.coins?.[symbol]) && current.coins[symbol].length >= 3
    );

  // Already up-to-date for this Monday and has adequate data for every coin
  if (current && current.weekCutoff >= mondayMs && hasAdequateData) return;

  console.log('[PulseCentral snapshot] Building weekly chart snapshot…');
  try {
    const snapshot = await buildSnapshot();
    saveSnapshot(snapshot);
    console.log('[PulseCentral snapshot] Snapshot saved — weekCutoff:', new Date(snapshot.weekCutoff).toISOString());
  } catch (err) {
    console.error('[PulseCentral snapshot] Build failed:', err.message);
  }
}

// Kick off the first check immediately (non-blocking)
refreshSnapshotIfNeeded().catch(() => {});

// Re-check every hour so a Monday transition triggers a refresh even when the
// server stays running across the week boundary.
setInterval(() => refreshSnapshotIfNeeded().catch(() => {}), REFRESH_INTERVAL_MS).unref();

// GET /api/chart-snapshots — serve the stored weekly snapshot for PLSX/HEX/INC/PRVX
app.get('/api/chart-snapshots', (_req, res) => {
  const data = snapshotCache || loadSnapshot();
  if (!data) {
    return res.status(503).json({ error: 'Snapshot not yet available — please retry shortly' });
  }
  // Cache headers: allow client to cache for up to 1 hour
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.json(data);
});

/* ── Proxy routes ────────────────────────────────────────────── */

// PulseChain Scan v1 (BlockScout) API
// Frontend: /api/scan?module=account&action=balance&address=0x…
app.get('/api/scan', (req, res) => {
  proxyJson(res, `https://api.scan.pulsechain.com/api${qs(req)}`);
});

// DexScreener main API  (handles /latest/dex/…, /token-profiles/…, /token-boosts/…)
// Frontend: /api/dex/latest/dex/tokens/…  or  /api/dex/token-profiles/latest/v1
app.get('/api/dex/*', (req, res) => {
  const subPath = sanitisePath(req.params[0]);
  if (subPath === null) return res.status(400).json({ error: 'Invalid path' });
  proxyJson(res, `https://api.dexscreener.com/${subPath}${qs(req)}`);
});

// DexScreener chart / OHLCV API  (io.dexscreener.com)
// Frontend: /api/dex-io/dex/chart/amm/v2/pulsechain/<pairAddr>?res=W&from=…&cb=0
app.get('/api/dex-io/*', (req, res) => {
  const subPath = sanitisePath(req.params[0]);
  if (subPath === null) return res.status(400).json({ error: 'Invalid path' });
  proxyJson(res, `https://io.dexscreener.com/${subPath}${qs(req)}`);
});

// PulseX V1 subgraph (The Graph) — GraphQL POST endpoint for full price history
// Frontend: POST /api/graph/pulsex  body: { query: "{ tokenDayDatas(…) { … } }" }
app.post('/api/graph/pulsex', express.json({ limit: '16kb' }), async (req, res) => {
  const query = req.body?.query;
  if (typeof query !== 'string' || !query.trim()) {
    return res.status(400).json({ error: 'Missing or invalid GraphQL query' });
  }
  const PULSEX_GRAPH = 'https://graph.v2b.pulsechain.com/subgraphs/name/pulsechain/v2b-pulsex';
  try {
    const upstream = await fetch(PULSEX_GRAPH, {
      method:  'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept':        'application/json',
        'User-Agent':    'Mozilla/5.0 (compatible; PulseCentral/1.0)',
      },
      body:   JSON.stringify({ query }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!upstream.ok) {
      return res.status(upstream.status).json({ error: `Upstream returned HTTP ${upstream.status}` });
    }
    const data = await upstream.json();
    res.json(data);
  } catch (err) {
    console.error('[PulseCentral proxy] PulseX graph:', err.message);
    res.status(502).json({ error: 'Proxy request failed', detail: err.message });
  }
});

// DexTools shared-data pair API
// Frontend: /api/dextools?address=<pair>&chain=pulse&audit=true&locks=true
app.get('/api/dextools', (req, res) => {
  proxyJson(res, `https://www.dextools.io/shared/data/pair${qs(req)}`);
});

// PulseChain Scan v2 REST API  (scan.pulsechain.com/api/v2/…)
// Frontend: /api/scan-v2/tokens/<addr>   or   /api/scan-v2/tokens/<addr>/transfers
app.get('/api/scan-v2/*', (req, res) => {
  const subPath = sanitisePath(req.params[0]);
  if (subPath === null) return res.status(400).json({ error: 'Invalid path' });
  proxyJson(res, `https://scan.pulsechain.com/api/v2/${subPath}${qs(req)}`);
});

// GoPlus Security API
// Frontend: /api/goplus/api/v1/token_security/369?contract_addresses=<addr>
app.get('/api/goplus/*', (req, res) => {
  const subPath = sanitisePath(req.params[0]);
  if (subPath === null) return res.status(400).json({ error: 'Invalid path' });
  proxyJson(res, `https://api.gopluslabs.io/${subPath}${qs(req)}`);
});

/** Map a 0–100 Fear & Greed score to a label (used by the /api/fear-greed proxy). */
function fgLabel(s) {
  if (s <= 24) return 'Extreme Fear';
  if (s <= 44) return 'Fear';
  if (s <= 55) return 'Neutral';
  if (s <= 74) return 'Greed';
  return 'Extreme Greed';
}

// Crypto Fear & Greed Index
// Tries CoinGlass (public, no auth) first; falls back to alternative.me.
// Always responds with the alternative.me shape: { data: [{ value, value_classification, timestamp }] }
// Frontend: /api/fear-greed
app.get('/api/fear-greed', async (req, res) => {
  const cacheKey = 'fear-greed';
  const cached = getCached(cacheKey);
  if (cached) return res.json(cached);

  // --- Helper: fetch with timeout ---
  async function tryFetch(url, headers = {}) {
    const r = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; PulseCentral/1.0)',
        'Accept':     'application/json',
        ...headers,
      },
      signal: AbortSignal.timeout(10_000),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  }

  // --- Source 1: CoinGlass public endpoint (no key required) ---
  try {
    const raw = await tryFetch('https://api.coinglass.com/pub/v2/index/fear_greed_history');
    // CoinGlass shape: { code: "0", data: [{ value, createTime }, ...] }
    const entry = raw?.data?.[0];
    if (entry && entry.value != null) {
      const score = Number(entry.value);
      // Normalise to the shape the frontend expects
      const normalised = {
        data: [{
          value:                String(score),
          value_classification: fgLabel(score),
          timestamp:            String(Math.floor(Date.now() / 1000)),
        }],
      };
      setCached(cacheKey, normalised);
      return res.json(normalised);
    }
  } catch (_) { /* fall through to next source */ }

  // --- Source 2: alternative.me (original) ---
  try {
    const raw = await tryFetch('https://api.alternative.me/fng/?limit=1');
    if (raw?.data?.[0]) {
      setCached(cacheKey, raw);
      return res.json(raw);
    }
  } catch (_) { /* fall through */ }

  // --- All sources failed ---
  console.error('[PulseCentral] fear-greed: all upstream sources failed');
  res.status(502).json({ error: 'Fear & Greed data unavailable' });
});

// CoinGecko Global Market Data (BTC dominance, total market cap)
// Frontend: /api/coingecko/global
app.get('/api/coingecko/global', (req, res) => {
  proxyJson(res, 'https://api.coingecko.com/api/v3/global');
});

// Top Coins by Market Cap via CoinCap (free, no API key required)
// Proxy for CoinGecko coins/markets — returns data already in the shape the
// frontend expects so no normalisation is required.
// Frontend: /api/coingecko/markets?vs_currency=usd&order=market_cap_desc&per_page=100&page=1
app.get('/api/coingecko/markets', async (req, res) => {
  const cacheKey = 'coingecko-markets';
  const cached = getCached(cacheKey);
  if (cached) return res.json(cached);

  const perPage = Math.min(parseInt(req.query.per_page, 10) || 100, 250);
  const params = new URLSearchParams({
    vs_currency: req.query.vs_currency || 'usd',
    order: req.query.order || 'market_cap_desc',
    per_page: String(perPage),
    page: req.query.page || '1',
    sparkline: 'false',
    price_change_percentage: '24h',
  });

  try {
    const upstream = await fetch(
      `https://api.coingecko.com/api/v3/coins/markets?${params}`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; PulseCentral/1.0)',
          'Accept': 'application/json',
        },
        signal: AbortSignal.timeout(15_000),
      }
    );

    if (!upstream.ok) {
      return res.status(upstream.status).json({ error: `Upstream returned HTTP ${upstream.status}` });
    }

    const data = await upstream.json();
    if (!Array.isArray(data)) {
      return res.status(502).json({ error: 'Unexpected response from CoinGecko' });
    }

    setCached(cacheKey, data);
    res.json(data);
  } catch (err) {
    console.error('[PulseCentral proxy] CoinGecko markets:', err);
    res.status(502).json({ error: 'Proxy request failed', detail: err.message });
  }
});

// PulseX V1 subgraph TVL / factory stats
// Frontend: POST /api/graph/pulsex/factory  (no body needed)
app.get('/api/pulsex/factory', async (req, res) => {
  const cacheKey = 'pulsex-factory';
  const cached = getCached(cacheKey);
  if (cached) return res.json(cached);

  const query = `{
    uniswapFactories(first: 1) {
      totalLiquidityUSD
      totalVolumeUSD
      totalTransactions
      pairCount
    }
  }`;
  const PULSEX_GRAPH = 'https://graph.v2b.pulsechain.com/subgraphs/name/pulsechain/v2b-pulsex';
  try {
    const upstream = await fetch(PULSEX_GRAPH, {
      method:  'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept':        'application/json',
        'User-Agent':    'Mozilla/5.0 (compatible; PulseCentral/1.0)',
      },
      body:   JSON.stringify({ query }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!upstream.ok) {
      return res.status(upstream.status).json({ error: `Upstream returned HTTP ${upstream.status}` });
    }
    const data = await upstream.json();
    setCached(cacheKey, data);
    res.json(data);
  } catch (err) {
    console.error('[PulseCentral proxy] PulseX factory:', err.message);
    res.status(502).json({ error: 'Proxy request failed', detail: err.message });
  }
});

// DefiLlama TVL API — simple numeric TVL for a named protocol
// Frontend: /api/llama/tvl/pulsechain-bridge
app.get('/api/llama/tvl/:protocol', (req, res) => {
  const protocol = sanitisePath(req.params.protocol);
  if (!protocol) return res.status(400).json({ error: 'Invalid protocol' });
  proxyJson(res, `https://api.llama.fi/tvl/${protocol}`);
});

// DefiLlama protocol detail (includes historical TVL array)
// Frontend: /api/llama/protocol/pulsechain-bridge
app.get('/api/llama/protocol/:protocol', (req, res) => {
  const protocol = sanitisePath(req.params.protocol);
  if (!protocol) return res.status(400).json({ error: 'Invalid protocol' });
  proxyJson(res, `https://api.llama.fi/protocol/${protocol}`);
});



// Serve the entire repo root (index.html, js/, css/, assets/)
app.use(express.static(path.join(__dirname, '..')));

/* ── Start server ────────────────────────────────────────────── */

const server = app.listen(PORT, () => {
  console.log(`PulseCentral running at http://localhost:${PORT}`);
});

/* ── Graceful shutdown ───────────────────────────────────── */

function shutdown(signal) {
  console.log(`[PulseCentral] ${signal} received — shutting down gracefully`);
  server.close(() => {
    console.log('[PulseCentral] HTTP server closed.');
    process.exit(0);
  });
  // Force exit after 10 s if still open
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));
