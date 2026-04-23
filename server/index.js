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

// ── LibertySwap API ────────────────────────────────
app.get('/api/libertyswap/*', async (req, res) => {
  const p = sanitise(req.params[0]);
  if (!p) return res.status(400).json({ error: 'Bad path' });
  const url = `https://api.libertyswap.finance/${p}${qs(req)}`;
  try {
    const r = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PulseCentral/1.0)', 'Accept': 'application/json' },
      signal: AbortSignal.timeout(12_000),
    });
    const text = await r.text();
    let data;
    try { data = JSON.parse(text); } catch { return res.status(502).json({ error: 'LibertySwap returned non-JSON' }); }
    res.setHeader('Content-Type', 'application/json');
    res.json(data);
  } catch (err) {
    console.error('[libertyswap]', err.message);
    res.status(502).json({ error: err.message });
  }
});

// ── Moralis API (PulseChain = chain 0x171 = 369) ──────
const MORALIS_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJub25jZSI6IjliZmFmN2YwLWM1N2MtNDk2MC04OWViLWM5NTBhZmZhODRmZSIsIm9yZ0lkIjoiNTExODQzIiwidXNlcklkIjoiNTI2Njc0IiwidHlwZUlkIjoiODgyNWFkNTQtOWE5Ny00YmU5LTk3MzUtN2EyZDA0ZDA0YzJkIiwidHlwZSI6IlBST0pFQ1QiLCJpYXQiOjE3NzY5MDY5MTcsImV4cCI6NDkzMjY2NjkxN30.X9n_kWwUpsuHR0D-SbGifEz57UpibbeJjt9FDF96uZs';
const MORALIS_BASE = 'https://deep-index.moralis.io/api/v2.2';
const PULSECHAIN_ID = '0x171'; // hex chainId for PulseChain (369)

async function moralisFetch(path, params = {}) {
  const url = new URL(`${MORALIS_BASE}${path}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const r = await fetch(url.toString(), {
    headers: { 'X-API-Key': MORALIS_KEY, 'Accept': 'application/json' },
    signal: AbortSignal.timeout(20_000),
  });
  if (!r.ok) throw new Error(`Moralis HTTP ${r.status}`);
  return r.json();
}

// Wallet token balances with prices (PulseChain)
app.get('/api/moralis/wallet/:address/tokens', async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  const addr = sanitise(req.params.address);
  if (!addr || !/^0x[0-9a-f]{40}$/i.test(addr)) return res.status(400).json({ error: 'Invalid address' });
  try {
    const data = await moralisFetch(`/wallets/${addr}/tokens`, {
      chain: PULSECHAIN_ID,
      exclude_spam: 'true',
      exclude_unverified_contracts: 'false',
    });
    res.json(data);
  } catch (e) {
    console.error('[moralis/tokens]', e.message);
    res.status(502).json({ error: e.message });
  }
});

// PLS price via Moralis token price endpoint
app.get('/api/moralis/pls-price', async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  const cacheKey = 'moralis-pls-price';
  const cached = getCached(cacheKey);
  if (cached) return res.json(cached);
  try {
    // WPLS contract address on PulseChain
    const WPLS = '0xA1077a294dDE1B09bB078844df40758a5D0f9a27';
    const data = await moralisFetch(`/erc20/${WPLS}/price`, {
      chain: PULSECHAIN_ID,
      include: 'percent_change',
    });
    setCached(cacheKey, data);
    res.json(data);
  } catch (e) {
    console.error('[moralis/pls-price]', e.message);
    res.status(502).json({ error: e.message });
  }
});

// Top PulseChain tokens by market cap (for markets page enrichment)
// ── Moralis: comprehensive PulseChain token search ────
// Searches for all significant PulseChain tokens using multiple strategies:
// 1. Token search with common terms filtered to PulseChain (chain=0x171)
// 2. Top movers/market data on PulseChain
// Results are merged, deduplicated by address, sorted by liquidity/volume
// Cached for 5 minutes to avoid hammering the API

let pcTokensCache = null;
let pcTokensFetchPromise = null;
const PC_TOKEN_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Comprehensive search terms to discover 200+ PulseChain tokens
const PC_SEARCH_TERMS = [
  // Core PulseChain tokens
  'PLS', 'PLSX', 'HEX', 'INC', 'WPLS', 'PRVX',
  // DeFi ecosystem
  'MAXI', 'HDRN', 'ICSA', 'TRIO', 'LOAN', 'PHIAT', 'TEAM',
  // DEX / exchange
  '9MM', '9INCH', 'PITEAS', 'PULSEX',
  // Stablecoins / bridges
  'USDC', 'USDT', 'DAI', 'WETH', 'WBTC',
  // PulseChain native
  'PLSD', 'PLSB', 'PLSR', 'PLSP', 'PLSF',
  // Community tokens
  'SPARK', 'WATT', 'GENI', 'MINT', 'BRSCO', 'CST',
  'DECI', 'BEAR', 'PINU', 'Atropa',
  // More ecosystem
  'PHEX', 'eHEX', 'PULSE', 'HEX1', 'PDAI', 'pDAI',
  'XEN', 'LUCKY', 'AXIS', 'NOPE', 'GOLD',
  'FIRE', 'PENT', 'MAX', 'MOPS', 'HBURN',
  'PITCH', 'ICETH', 'PWORLD',
];

async function fetchAllPulseChainTokens() {
  const seen = new Map(); // address → token object
  let totalFetched = 0;

  // Strategy 1: Token search by term, filtered to PulseChain
  const searchResults = await Promise.allSettled(
    PC_SEARCH_TERMS.map(async term => {
      try {
        const url = new URL(`${MORALIS_BASE}/tokens/search`);
        url.searchParams.set('query', term);
        url.searchParams.append('chains[]', PULSECHAIN_ID);
        url.searchParams.set('limit', '20');
        url.searchParams.set('sortBy', 'liquidity');
        const r = await fetch(url.toString(), {
          headers: { 'X-API-Key': MORALIS_KEY, 'Accept': 'application/json' },
          signal: AbortSignal.timeout(12_000),
        });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const data = await r.json();
        return data?.result || [];
      } catch (e) {
        console.warn(`[moralis/search] "${term}":`, e.message);
        return [];
      }
    })
  );

  for (const result of searchResults) {
    if (result.status !== 'fulfilled') continue;
    for (const tok of result.value) {
      // Only keep PulseChain tokens (chainId=0x171 or 369)
      const chainId = (tok.chainId || tok.chain_id || '').toLowerCase();
      if (chainId && chainId !== '0x171' && chainId !== '369') continue;
      const addr = (tok.tokenAddress || tok.token_address || tok.address || '').toLowerCase();
      if (!addr || seen.has(addr)) continue;
      seen.set(addr, normalizeMoralisToken(tok));
      totalFetched++;
    }
  }

  // Strategy 2: Top market cap tokens on PulseChain
  try {
    const url = new URL(`${MORALIS_BASE}/market-data/erc20s/top-tokens`);
    url.searchParams.set('chain', PULSECHAIN_ID);
    url.searchParams.set('limit', '200');
    const r = await fetch(url.toString(), {
      headers: { 'X-API-Key': MORALIS_KEY, 'Accept': 'application/json' },
      signal: AbortSignal.timeout(15_000),
    });
    if (r.ok) {
      const data = await r.json();
      const tokens = data?.result || data?.tokens || (Array.isArray(data) ? data : []);
      for (const tok of tokens) {
        const addr = (tok.tokenAddress || tok.token_address || tok.address || '').toLowerCase();
        if (!addr || seen.has(addr)) continue;
        seen.set(addr, normalizeMoralisToken(tok));
        totalFetched++;
      }
    }
  } catch (e) { console.warn('[moralis/top-tokens]', e.message); }

  // Strategy 3: Top movers on PulseChain
  try {
    const url = new URL(`${MORALIS_BASE}/market-data/erc20s/top-movers`);
    url.searchParams.set('chain', PULSECHAIN_ID);
    const r = await fetch(url.toString(), {
      headers: { 'X-API-Key': MORALIS_KEY, 'Accept': 'application/json' },
      signal: AbortSignal.timeout(12_000),
    });
    if (r.ok) {
      const data = await r.json();
      const tokens = data?.gainers || data?.result || (Array.isArray(data) ? data : []);
      for (const tok of tokens) {
        const addr = (tok.tokenAddress || tok.token_address || tok.address || '').toLowerCase();
        if (!addr || seen.has(addr)) continue;
        seen.set(addr, normalizeMoralisToken(tok));
        totalFetched++;
      }
    }
  } catch (e) { console.warn('[moralis/top-movers]', e.message); }

  // Sort: PLS first, then by total liquidity descending, filter out zero-value tokens
  const PRIORITY = ['0xa1077a294dde1b09bb078844df40758a5d0f9a27', // WPLS
                    '0x95b303987a60c71504d99aa1b13b4da07b0790ab', // PLSX
                    '0x2b591e99afe9f32eaa6214f7b7629768c40eeb39', // HEX
                    '0x2fa878ab3f87cc1c9737fc071108f904c0b0c95d']; // INC

  const sorted = [...seen.values()]
    .filter(t => t.priceUsd > 0 || t.totalLiquidityUsd > 0)
    .sort((a, b) => {
      const ap = PRIORITY.indexOf(a.address);
      const bp = PRIORITY.indexOf(b.address);
      if (ap !== -1 || bp !== -1) return (ap === -1 ? 999 : ap) - (bp === -1 ? 999 : bp);
      return (b.totalLiquidityUsd || 0) - (a.totalLiquidityUsd || 0);
    });

  console.log(`[moralis/pulsechain] ${sorted.length} tokens (${totalFetched} raw fetched)`);
  return sorted;
}

function normalizeMoralisToken(tok) {
  const addr = (tok.tokenAddress || tok.token_address || tok.address || '').toLowerCase();
  return {
    address:           addr,
    symbol:            tok.symbol || '?',
    name:              tok.name || tok.symbol || '?',
    logo:              tok.logo || tok.thumbnail || null,
    priceUsd:          parseFloat(tok.usdPrice || tok.usd_price || tok.price || 0) || 0,
    priceChange24h:    parseFloat(tok.usdPricePercentChange?.oneDay || tok.price_24h_percent_change || 0) || 0,
    volumeUsd24h:      parseFloat(tok.volumeUsd?.oneDay || tok.volume_24h_usd || 0) || 0,
    marketCapUsd:      parseFloat(tok.marketCap || tok.market_cap_usd || tok.fullyDilutedValuation || 0) || 0,
    totalLiquidityUsd: parseFloat(tok.totalLiquidityUsd || tok.liquidity_usd || 0) || 0,
    securityScore:     tok.securityScore || null,
    isVerified:        tok.isVerifiedContract || false,
  };
}

app.get('/api/moralis/pulsechain/tokens', async (req, res) => {
  res.setHeader('Content-Type', 'application/json');

  // Return cache if fresh
  if (pcTokensCache && (Date.now() - pcTokensCache.ts < PC_TOKEN_CACHE_TTL)) {
    return res.json(pcTokensCache.data);
  }
  // Deduplicate concurrent fetches
  if (pcTokensFetchPromise) {
    try { return res.json(await pcTokensFetchPromise); } catch { return res.status(502).json({ error: 'Fetch failed' }); }
  }

  pcTokensFetchPromise = fetchAllPulseChainTokens();
  try {
    const data = await pcTokensFetchPromise;
    pcTokensCache = { data, ts: Date.now() };
    pcTokensFetchPromise = null;
    return res.json(data);
  } catch (e) {
    pcTokensFetchPromise = null;
    console.error('[moralis/pulsechain/tokens]', e.message);
    return res.status(502).json({ error: e.message });
  }
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

/* ── Alpha Vantage Commodities — hourly exact-hour cache ─── */
// Functions: WTI, BRENT, NATURAL_GAS, COPPER, ALUMINUM, WHEAT, CORN, COTTON, SUGAR, COFFEE
// Fetches once per hour at the exact hour mark, shared across all users

const AV_KEY = 'YFAIAETGBN2H298Z';

// Map our Yahoo-style frontend IDs to Alpha Vantage function names
const AV_COMMODITY_MAP = [
  { id: 'GC=F',  fn: null,          name: 'Gold',          unit: '/oz'    }, // No AV endpoint for Gold/Silver/Platinum — use CoinGecko tokens
  { id: 'SI=F',  fn: null,          name: 'Silver',        unit: '/oz'    },
  { id: 'PL=F',  fn: null,          name: 'Platinum',      unit: '/oz'    },
  { id: 'CL=F',  fn: 'WTI',         name: 'WTI Crude',     unit: '/bbl'   },
  { id: 'BZ=F',  fn: 'BRENT',       name: 'Brent Crude',   unit: '/bbl'   },
  { id: 'NG=F',  fn: 'NATURAL_GAS', name: 'Natural Gas',   unit: '/MMBtu' },
  { id: 'HG=F',  fn: 'COPPER',      name: 'Copper',        unit: '/lb'    },
  { id: 'ZW=F',  fn: 'WHEAT',       name: 'Wheat',         unit: '/bu'    },
  { id: 'ZC=F',  fn: 'CORN',        name: 'Corn',          unit: '/bu'    },
  { id: 'CT=F',  fn: 'COTTON',      name: 'Cotton',        unit: '/lb'    },
  { id: 'SB=F',  fn: 'SUGAR',       name: 'Sugar',         unit: '/lb'    },
  { id: 'KC=F',  fn: 'COFFEE',      name: 'Coffee',        unit: '/lb'    },
];

// CoinGecko IDs for metals (no AV equivalent with free key)
const METALS_CG_IDS = 'pax-gold,tether-gold,silvercoin,platinum';
const METALS_CG_MAP = {
  'pax-gold':    'GC=F',
  'tether-gold': 'GC=F',
  'silvercoin':  'SI=F',
  'silver':      'SI=F',
  'platinum':    'PL=F',
};

let commodityHourlyCache = null;   // { data: {...}, hourKey: 'YYYY-MM-DDTHH' }
let commodityFetchPromise = null;  // deduplicate concurrent requests

function getHourKey() {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}T${String(d.getUTCHours()).padStart(2,'0')}`;
}

async function fetchAlphaVantageAll() {
  const result = {};
  const avItems = AV_COMMODITY_MAP.filter(c => c.fn);

  // Rate limit: free AV key = 25 calls/day, 500/month. Fetch 9 commodities.
  // Sequential with small delay to be safe
  for (const item of avItems) {
    try {
      const url = `https://www.alphavantage.co/query?function=${item.fn}&interval=daily&apikey=${AV_KEY}`;
      const r = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PulseCentral/1.0)' },
        signal: AbortSignal.timeout(15_000),
      });
      if (!r.ok) { console.warn(`[AV] ${item.fn} HTTP ${r.status}`); continue; }
      const data = await r.json();

      // AV returns: { "name": "...", "data": [ { "date": "YYYY-MM-DD", "value": "XX.XX" }, ... ] }
      const series = data?.data;
      if (!Array.isArray(series) || series.length < 2) {
        console.warn(`[AV] ${item.fn} no data:`, JSON.stringify(data).slice(0, 100)); continue;
      }

      // Latest non-null value
      const latest = series.find(d => d.value && d.value !== '.' && d.value !== 'null');
      const prev   = series.slice(1).find(d => d.value && d.value !== '.' && d.value !== 'null');
      if (!latest) { console.warn(`[AV] ${item.fn} no valid latest`); continue; }

      const price    = parseFloat(latest.value);
      const prevVal  = prev ? parseFloat(prev.value) : price;
      const change   = price - prevVal;
      const changePct= prevVal ? (change / prevVal) * 100 : 0;

      result[item.id] = { price, prevClose: prevVal, change, changePct, lastUpdate: Date.now(), source: 'AlphaVantage', date: latest.date };
      console.log(`[AV] ${item.fn}: $${price} (${latest.date})`);

      // Small delay between calls to respect rate limits
      await new Promise(res => setTimeout(res, 200));
    } catch (e) {
      console.warn(`[AV] ${item.fn} error:`, e.message);
    }
  }

  // Metals from CoinGecko (no AV equivalent on free tier)
  try {
    const cgUrl = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${METALS_CG_IDS}&order=market_cap_desc&per_page=10&page=1&sparkline=false&price_change_percentage=24h`;
    const cgR = await fetch(cgUrl, { headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(12_000) });
    if (cgR.ok) {
      const coins = await cgR.json();
      if (Array.isArray(coins)) {
        for (const coin of coins) {
          const sym = METALS_CG_MAP[coin.id];
          if (!sym || result[sym]) continue;
          result[sym] = {
            price:     coin.current_price || 0,
            prevClose: (coin.current_price || 0) - (coin.price_change_24h || 0),
            change:    coin.price_change_24h || 0,
            changePct: coin.price_change_percentage_24h || 0,
            lastUpdate: Date.now(),
            source: 'CoinGecko',
            image:  coin.image || null,
          };
        }
      }
    }
  } catch (e) { console.warn('[commodities] CoinGecko metals error:', e.message); }

  console.log(`[commodities] hourly fetch complete: ${Object.keys(result).length} symbols`);
  return result;
}

async function getCommodityData() {
  const hourKey = getHourKey();

  // Return cached if still same hour
  if (commodityHourlyCache && commodityHourlyCache.hourKey === hourKey) {
    return commodityHourlyCache.data;
  }

  // Deduplicate concurrent fetches
  if (commodityFetchPromise) return commodityFetchPromise;

  commodityFetchPromise = fetchAlphaVantageAll().then(data => {
    commodityHourlyCache = { data, hourKey };
    commodityFetchPromise = null;
    return data;
  }).catch(e => {
    commodityFetchPromise = null;
    console.error('[commodities] fetch failed:', e.message);
    return commodityHourlyCache?.data || {};
  });

  return commodityFetchPromise;
}

// Pre-warm at server start and then at the top of every hour
setTimeout(() => getCommodityData(), 5000);
function scheduleNextHour() {
  const now = new Date();
  const msToNextHour = (60 - now.getUTCMinutes()) * 60_000 - now.getUTCSeconds() * 1000 - now.getUTCMilliseconds();
  setTimeout(() => {
    getCommodityData();
    setInterval(() => getCommodityData(), 3_600_000); // every hour
  }, msToNextHour);
}
scheduleNextHour();

app.get('/api/commodities', async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  try {
    const data = await getCommodityData();
    res.json(data);
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

/* ── Weekly chart snapshot (served from disk cache) ───── */
// Server pre-builds weekly OHLCV snapshots using GeckoTerminal
// so the browser doesn't have to fetch large datasets on every load.

const SNAPSHOT_FILE = path.join(__dirname, 'data', 'chart-snapshots.json');

// Coins to snapshot: PLS, PLSX, HEX, INC, PRVX
const SNAPSHOT_COINS = [
  { symbol: 'PLS',  pair: '0x6753560538ECa67617a9Ce605178F788bE7E524e' }, // WPLS/USDC on PulseX — PLS is base, currency=usd gives PLS price directly
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

async function fetchGeckoBars(pairAddress, invertPrices = false) {
  const url = invertPrices
    ? `https://api.geckoterminal.com/api/v2/networks/pulsechain/pools/${pairAddress}/ohlcv/day?aggregate=1&limit=1000`
    : `https://api.geckoterminal.com/api/v2/networks/pulsechain/pools/${pairAddress}/ohlcv/day?aggregate=1&limit=1000&currency=usd`;
  const r = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PulseCentral/1.0)', 'Accept': 'application/json; version=20230302' },
    signal: AbortSignal.timeout(20_000),
  });
  if (!r.ok) throw new Error(`GeckoTerminal HTTP ${r.status}`);
  const data = await r.json();
  const raw  = data?.data?.attributes?.ohlcv_list || [];
  const bars = raw
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

  if (!invertPrices) return bars;

  // Auto-detect: if median close > 10, prices are in "DAI per WPLS" units → invert to get PLS price
  const medianClose = bars[Math.floor(bars.length / 2)]?.close || 0;
  if (medianClose > 10) {
    return bars
      .map(b => ({
        ...b,
        open:  b.open  > 0 ? 1 / b.open  : 0,
        high:  b.low   > 0 ? 1 / b.low   : 0,
        low:   b.high  > 0 ? 1 / b.high  : 0,
        close: b.close > 0 ? 1 / b.close : 0,
      }))
      .filter(b => b.close > 0 && b.close < 1);
  }
  return bars.filter(b => b.close > 0 && b.close < 1);
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
      // All pairs now use currency=usd with no inversion needed
      // PLS uses WPLS/USDC pair (WPLS is base token, so price is in USD directly)
      const bars = await fetchGeckoBars(pair, false);
      coins[symbol] = bars;
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


/* ── Pump.Tires tokens via Moralis + DexScreener ───── */
// pump.tires is a PulseChain token launchpad
// We fetch new/hot tokens using DexScreener search filtered to recently-added
// and supplement with Moralis for wallet data and token metadata

let pumpTokensCache = null;
let pumpTokensPromise = null;
const PUMP_CACHE_TTL = 3 * 60 * 1000; // 3 minutes

// Known pump.tires deployer/factory address (tokens launched on the platform)
const PUMP_TIRES_FACTORY = '0xba5fee6e6b166a4b68b875f8a2dda96e7c35a73f'; // pump.tires factory on PulseChain

async function fetchPumpTiresTokens() {
  const results = new Map();

  // Strategy 1: DexScreener search for pump.tires tokens (searches by platform name)
  const dexSearches = ['pump.tires', 'pumptires', 'PUMP'];
  await Promise.allSettled(dexSearches.map(async q => {
    try {
      const r = await fetch(`https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(q)}`, {
        headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' },
        signal: AbortSignal.timeout(10_000),
      });
      if (!r.ok) return;
      const data = await r.json();
      for (const pair of (data.pairs || [])) {
        if (pair.chainId !== 'pulsechain') continue;
        const addr = (pair.baseToken?.address || '').toLowerCase();
        if (!addr || results.has(addr)) continue;
        results.set(addr, {
          address:     addr,
          symbol:      pair.baseToken?.symbol || '?',
          name:        pair.baseToken?.name || pair.baseToken?.symbol || '?',
          logo:        pair.info?.imageUrl || `https://dd.dexscreener.com/ds-data/tokens/pulsechain/${addr}.png`,
          priceUsd:    parseFloat(pair.priceUsd || 0) || 0,
          priceChange24h: parseFloat(pair.priceChange?.h24 || 0) || 0,
          volume24h:   parseFloat(pair.volume?.h24 || 0) || 0,
          liquidity:   parseFloat(pair.liquidity?.usd || 0) || 0,
          marketCap:   parseFloat(pair.marketCap || pair.fdv || 0) || 0,
          pairAddress: pair.pairAddress || null,
          launchedOnPumpTires: true,
          createdAt:   pair.pairCreatedAt || null,
          txns24h:     (pair.txns?.h24?.buys || 0) + (pair.txns?.h24?.sells || 0),
          source:      'dexscreener',
        });
      }
    } catch(e) { console.warn('[pump.tires] dex search error:', e.message); }
  }));

  // Strategy 2: Moralis token search for pump.tires tokens
  try {
    const url = new URL(`${MORALIS_BASE}/tokens/search`);
    url.searchParams.set('query', 'pump');
    url.searchParams.append('chains[]', PULSECHAIN_ID);
    url.searchParams.set('limit', '20');
    url.searchParams.set('sortBy', 'volume');
    const r = await fetch(url.toString(), {
      headers: { 'X-API-Key': MORALIS_KEY, 'Accept': 'application/json' },
      signal: AbortSignal.timeout(12_000),
    });
    if (r.ok) {
      const data = await r.json();
      for (const tok of (data?.result || [])) {
        const chainId = (tok.chainId || '').toLowerCase();
        if (chainId && chainId !== '0x171' && chainId !== '369') continue;
        const addr = (tok.tokenAddress || tok.address || '').toLowerCase();
        if (!addr || results.has(addr)) continue;
        results.set(addr, {
          address:     addr,
          symbol:      tok.symbol || '?',
          name:        tok.name || tok.symbol || '?',
          logo:        tok.logo || tok.thumbnail || `https://dd.dexscreener.com/ds-data/tokens/pulsechain/${addr}.png`,
          priceUsd:    parseFloat(tok.usdPrice || 0) || 0,
          priceChange24h: parseFloat(tok.usdPricePercentChange?.oneDay || 0) || 0,
          volume24h:   parseFloat(tok.volumeUsd?.oneDay || 0) || 0,
          liquidity:   parseFloat(tok.totalLiquidityUsd || 0) || 0,
          marketCap:   parseFloat(tok.marketCap || tok.fullyDilutedValuation || 0) || 0,
          pairAddress: null,
          launchedOnPumpTires: true,
          createdAt:   null,
          txns24h:     0,
          source:      'moralis',
        });
      }
    }
  } catch(e) { console.warn('[pump.tires] moralis search error:', e.message); }

  // Sort by volume then liquidity, newest first
  const sorted = [...results.values()]
    .filter(t => t.priceUsd > 0 || t.liquidity > 0)
    .sort((a, b) => (b.volume24h - a.volume24h) || (b.liquidity - a.liquidity));

  console.log(`[pump.tires] ${sorted.length} tokens`);
  return sorted;
}

app.get('/api/pump-tires/tokens', async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  if (pumpTokensCache && (Date.now() - pumpTokensCache.ts < PUMP_CACHE_TTL)) {
    return res.json(pumpTokensCache.data);
  }
  if (pumpTokensPromise) {
    try { return res.json(await pumpTokensPromise); } catch { return res.status(502).json({ error: 'Fetch failed' }); }
  }
  pumpTokensPromise = fetchPumpTiresTokens();
  try {
    const data = await pumpTokensPromise;
    pumpTokensCache = { data, ts: Date.now() };
    pumpTokensPromise = null;
    return res.json(data);
  } catch(e) {
    pumpTokensPromise = null;
    return res.status(502).json({ error: e.message });
  }
});

/* ── Moralis: auto-discover new PulseChain tokens ─── */
// Store all discovered PulseChain tokens persistently in memory (no limit)
// Updated every 10 minutes, merging new tokens in

let pulseTokenLibrary = new Map(); // addr → token
let libraryLastUpdate = 0;
const LIBRARY_UPDATE_INTERVAL = 10 * 60 * 1000; // 10 minutes

// Pinned tokens — always present in the library regardless of Moralis results
const PINNED_TOKENS = [
  {
    address:           '0xfc64556faa683e6087f425819c7ca3c558e13ac1',
    symbol:            'pDAI',
    name:              'PulseChain DAI',
    logo:              null,
    priceUsd:          0,
    priceChange24h:    0,
    volumeUsd24h:      0,
    marketCapUsd:      0,
    totalLiquidityUsd: 0,
    securityScore:     null,
    isVerified:        false,
    _pinned:           true,
  },
];
for (const t of PINNED_TOKENS) pulseTokenLibrary.set(t.address, t);

async function updatePulseTokenLibrary() {
  console.log('[token-library] Updating...');
  const newTokens = await fetchAllPulseChainTokens().catch(e => {
    console.warn('[token-library] fetch error:', e.message);
    return [];
  });

  let added = 0;
  for (const tok of newTokens) {
    if (!pulseTokenLibrary.has(tok.address)) {
      pulseTokenLibrary.set(tok.address, tok);
      added++;
    } else {
      // Update price data on existing tokens
      pulseTokenLibrary.set(tok.address, { ...pulseTokenLibrary.get(tok.address), ...tok });
    }
  }
  libraryLastUpdate = Date.now();
  console.log(`[token-library] ${added} new tokens added, total: ${pulseTokenLibrary.size}`);
}

// Start updating immediately and then every 10 minutes
setTimeout(() => updatePulseTokenLibrary(), 8000);
setInterval(() => updatePulseTokenLibrary(), LIBRARY_UPDATE_INTERVAL);

app.get('/api/pulsechain/token-library', async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  const page     = parseInt(req.query.page || '1', 10);
  const pageSize = parseInt(req.query.pageSize || '100', 10);
  const sortBy   = req.query.sortBy || 'liquidity'; // liquidity | volume | marketCap
  const search   = (req.query.q || '').toLowerCase();

  let tokens = [...pulseTokenLibrary.values()];

  if (search) {
    tokens = tokens.filter(t =>
      t.symbol?.toLowerCase().includes(search) ||
      t.name?.toLowerCase().includes(search) ||
      t.address?.includes(search)
    );
  }

  tokens.sort((a, b) => {
    if (sortBy === 'volume')    return (b.volumeUsd24h || 0) - (a.volumeUsd24h || 0);
    if (sortBy === 'marketCap') return (b.marketCapUsd || 0) - (a.marketCapUsd || 0);
    return (b.totalLiquidityUsd || 0) - (a.totalLiquidityUsd || 0);
  });

  const total = tokens.length;
  const slice = tokens.slice((page - 1) * pageSize, page * pageSize);

  res.json({
    total,
    page,
    pageSize,
    lastUpdate: libraryLastUpdate,
    tokens: slice,
  });
});


/* ── Static files ─────────────────────────────────────── */

app.use(express.static(path.join(__dirname, '..')));

/* ── Start ────────────────────────────────────────────── */

const server = app.listen(PORT, () => console.log(`PulseCentral → http://localhost:${PORT}`));

process.on('SIGTERM', () => server.close(() => process.exit(0)));
process.on('SIGINT',  () => server.close(() => process.exit(0)));
