/**
 * PulseCentral – api.js
 * Data layer. Only uses APIs confirmed working by live debug test:
 *   ✓ DexScreener  (pairs, search, profiles, boosts)
 *   ✓ GeckoTerminal (OHLCV bars — primary chart source)
 *   ✓ BlockScout v1 (balances, token lists)
 *   ✓ BlockScout v2 (token metadata, transfers)
 *   ✓ DefiLlama    (bridge TVL)
 *   ✓ GoPlus       (security)
 *   ✗ PulseX subgraph — DEAD (unreachable)
 *   ✗ DexScreener io chart API — DEAD (403)
 *   ✗ BlockScout v2 /stats — DEAD (404)
 */

const API = (() => {
  /* ── Proxy base paths ─────────────────────────────── */
  const DSX   = '/api/dex/latest/dex';
  const SCAN  = '/api/scan';
  const GECKO = '/api/gecko/networks/pulsechain/pools';

  /* ── PulseChain launch timestamp (seconds) ────────── */
  const LAUNCH_TS = 1683849600;

  /* ── Core coins shown on Home tab ────────────────── */
  const CORE_COINS = [
    // PLS pair: WPLS/USDC on PulseX — shows PLS price in USD correctly (PLS is base token)
    { symbol: 'PLS',  address: '0xA1077a294dDE1B09bB078844df40758a5D0f9a27', pair: '0xE56043671df55dE5CDf8459710433C10324DE0aE', color: '#7b2fff' },
    { symbol: 'PLSX', address: '0x95B303987A60C71504D99Aa1b13B4DA07b0790ab', pair: '0x1b45b9148791d3a104184cd5dfe5ce57193a3ee9', color: '#ff6d00' },
    { symbol: 'HEX',  address: '0x2b591e99afE9f32eAA6214f7B7629768c40Eeb39', pair: '0xf1f4ee610b2babb05c635f726ef8b0c568c8dc65', color: '#e8002d' },
    { symbol: 'INC',  address: '0x2fa878Ab3F87CC1C9737Fc071108F904c0B0C95d', pair: '0xf808bb6265e9ca27002c0a04562bf50d4fe37eaa', color: '#00e676' },
    { symbol: 'PRVX', address: '0xF6f8Db0aBa00007681F8fAF16A0FDa1c9B030b11', pair: '0x7f681a5ad615238357ba148c281e2eaefd2de55a', color: '#00bcd4' },
  ];

  /* ── WPLS address (for portfolio PLS price) ───────── */
  const WPLS = '0xa1077a294dde1b09bb078844df40758a5d0f9a27';

  /* ── Known tokens (Markets tab) ──────────────────── */
  const KNOWN_TOKENS = [
    { symbol: 'PLSX',  address: '0x95B303987A60C71504D99Aa1b13B4DA07b0790ab' },
    { symbol: 'HEX',   address: '0x2b591e99afE9f32eAA6214f7B7629768c40Eeb39' },
    { symbol: 'INC',   address: '0x2fa878Ab3F87CC1C9737Fc071108F904c0B0C95d' },
    { symbol: 'WPLS',  address: '0xA1077a294dDE1B09bB078844df40758a5D0f9a27' },
    { symbol: 'PRVX',  address: '0xF6f8Db0aBa00007681F8fAF16A0FDa1c9B030b11' },
    { symbol: 'eHex',  address: '0x57fde0a71132198BBeC939B98976993d8D89D225' },
    { symbol: 'MAXI',  address: '0x0d86b6aE6cA3E1a08E3d2C4796D30616897C1eE4' },
    { symbol: 'HDRN',  address: '0x3819f64f282bf135d62168C1e513280dAF905e06' },
    { symbol: 'ICSA',  address: '0xfc4913214444aF5c715cc9F7b52655e788A569ed' },
    { symbol: 'PLSD',  address: '0x34F0915a5f15a66Eba86F6a58bE1A471FB7836A7' },
    { symbol: 'PLSB',  address: '0x5ee84583f67d5ecea5420dbb42b462896e7f8d06' },
    { symbol: '9MM',   address: '0x7b39712Ef45F7dcED2bBDF11F3D5046bA61dA719' },
    { symbol: '9INCH', address: '0x3ca80d83277e721171284667829c686527b8b3c5' },
    { symbol: 'WETH',  address: '0x02DcdD04e3F455D838cd1249292C58f3B79e3C3C' },
    { symbol: 'USDC',  address: '0x15D38573d2feeb82e7ad5187aB8c1D52810B1f07' },
    { symbol: 'USDT',  address: '0x0Cb6F5a34ad42ec934882A05265A7d5F59b51A2f' },
    { symbol: 'DAI',   address: '0xefD766cCb38EaF1dfd701853BFCe31359239F305' },
    { symbol: 'LOAN',  address: '0x9159f1D2a9f51998Fc9Ab03fbd8f265ab14A1b3B' },
    { symbol: 'GENI',  address: '0x444444444444c1a66f394025ac839a535246fcc8' },
    { symbol: 'MINT',  address: '0x207e6b4529840a4fd518f73c68bc9c19b2a15944' },
    { symbol: 'Atropa', address: '0xCc78A0acDF847A2C1714D2A925bB4477df5d48a6' },
    { symbol: 'SPARK', address: '0x6386704cD6f7A584EA9d23cccA66aF7EBA5a727e' },
    { symbol: 'PHIAT', address: '0x96e035ae0905efac8f733f133462f971cfa45db1' },
    { symbol: 'TEAM',  address: '0xc6a2cDf807F251e4b82C236D9A23C5156D3fB3A2' },
    { symbol: 'WATT',  address: '0xDfdc2836FD2E63Bba9f0eE07901aD465Bff4DE71' },
  ];

  /* ── Denylist ─────────────────────────────────────── */
  const DENYLIST = new Set([
    '0x710420e9e2ceaae2b56ee389a2fb7f8c8435181a',
    '0x2b4b29bce9e3ed4913b8031e93ecaf4c15fa6bf5',
    '0xaa46fa6cf4f81b087ec3a968946fb2e705c6b89e',
    '0xee67825ef27588faee39cfefb465eb0a242a740c',
  ]);

  /* ── HTTP helpers ─────────────────────────────────── */

  async function get(url, ms = 12000) {
    const r = await fetch(url, { signal: AbortSignal.timeout(ms) });
    if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`);
    return r.json();
  }

  async function post(url, body, ms = 15000) {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(ms),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`);
    return r.json();
  }

  /* ── Logo resolution ──────────────────────────────── */

  /**
   * Get best logo URL for a token.
   * Priority: DexScreener profile image → DexScreener CDN → null
   * The CDN URL works for most tokens; the UI uses onerror to fall back gracefully.
   */
  function logoUrl(pair, addr) {
    if (pair?.info?.imageUrl) return pair.info.imageUrl;
    if (addr) return `https://dd.dexscreener.com/ds-data/tokens/pulsechain/${addr.toLowerCase()}.png`;
    return null;
  }

  /* ── Pair selection ───────────────────────────────── */

  /**
   * Given multiple pairs for the same token, pick the best one.
   * Prefers WPLS-quoted pairs (native chain pairs), then highest liquidity.
   */
  function bestPair(pairs) {
    if (!pairs || pairs.length === 0) return null;
    const WPLS_ADDR = '0xa1077a294dde1b09bb078844df40758a5d0f9a27';
    return pairs.reduce((best, p) => {
      if (!best) return p;
      const pLiq   = Number(p.liquidity?.usd || 0);
      const bLiq   = Number(best.liquidity?.usd || 0);
      const pWpls  = (p.quoteToken?.address || '').toLowerCase() === WPLS_ADDR;
      const bWpls  = (best.quoteToken?.address || '').toLowerCase() === WPLS_ADDR;
      // WPLS pairs win unless the non-WPLS pair has 10× more liquidity
      if (pWpls && !bWpls && pLiq >= bLiq * 0.1) return p;
      if (bWpls && !pWpls && bLiq >= pLiq * 0.1) return best;
      return pLiq > bLiq ? p : best;
    }, null);
  }

  /* ── DexScreener pair fetching ────────────────────── */

  /**
   * Fetch DexScreener pair data for up to 30 token addresses per request.
   * Returns Map<lowercaseAddr, bestPair>.
   */
  async function getPairsByAddresses(addresses) {
    if (!addresses.length) return new Map();
    const map = new Map();

    // Chunk into groups of 30
    const chunks = [];
    for (let i = 0; i < addresses.length; i += 30) chunks.push(addresses.slice(i, i + 30));

    await Promise.allSettled(chunks.map(async chunk => {
      const data  = await get(`${DSX}/tokens/${chunk.join(',')}`);
      const pairs = (data.pairs || []).filter(p => p.chainId === 'pulsechain');
      // Group by token address, pick best pair per token
      const grouped = new Map();
      for (const p of pairs) {
        const addr = p.baseToken?.address?.toLowerCase();
        if (!addr || DENYLIST.has(addr)) continue;
        const group = grouped.get(addr) || [];
        group.push(p);
        grouped.set(addr, group);
      }
      for (const [addr, ps] of grouped) {
        map.set(addr, bestPair(ps));
      }
    }));

    return map;
  }

  /* ── GeckoTerminal chart bars ─────────────────────── */

  /**
   * Fetch daily OHLCV bars from GeckoTerminal.
   * Returns bars with time in MILLISECONDS, sorted oldest→newest.
   * GeckoTerminal is confirmed working; returns timestamps in seconds.
   */
  async function getChartBars(pairAddress) {
    const url  = `${GECKO}/${pairAddress}/ohlcv/day?aggregate=1&limit=1000&currency=usd`;
    const data = await get(url, 15000);
    const raw  = data?.data?.attributes?.ohlcv_list || [];
    return raw
      .map(b => ({
        time:   b[0] > 1e10 ? b[0] : b[0] * 1000, // seconds → ms
        open:   Number(b[1] || 0),
        high:   Number(b[2] || 0),
        low:    Number(b[3] || 0),
        close:  Number(b[4] || 0),
        volume: Number(b[5] || 0),
      }))
      .filter(b => b.time > 0 && b.close > 0)
      .sort((a, b) => a.time - b.time);
  }

  /* ── Core coins (Home tab) ────────────────────────── */

  async function getCoreCoinPairs() {
    const pairAddrs = CORE_COINS.map(c => c.pair).join(',');
    const [pairData, snapshots] = await Promise.all([
      get(`${DSX}/pairs/pulsechain/${pairAddrs}`).catch(() => ({})),
      get('/api/chart-snapshots').catch(() => ({})),
    ]);

    const byPair = new Map();
    for (const p of (pairData.pairs || [])) {
      if (p.pairAddress) byPair.set(p.pairAddress.toLowerCase(), p);
    }

    // Fetch live bars for ALL core coins from GeckoTerminal (limit=1000 = ~2.7 years, covers PulseChain launch)
    // Run in parallel — each returns full history from day 1
    const barResults = await Promise.allSettled(
      CORE_COINS.map(coin => getChartBars(coin.pair))
    );

    return CORE_COINS.map((coin, i) => {
      const pair = byPair.get(coin.pair.toLowerCase()) || null;
      // Use live bars if we got them; fall back to snapshot
      const liveBars = barResults[i].status === 'fulfilled' ? barResults[i].value : [];
      const snapBars = Array.isArray(snapshots.coins?.[coin.symbol]) ? snapshots.coins[coin.symbol] : [];
      // Pick whichever has more data
      const bars = liveBars.length >= snapBars.length ? liveBars : snapBars;
      return { ...coin, pair, bars };
    });
  }

  /* ── Markets tab ──────────────────────────────────── */

  async function getTopPairs() {
    const SEARCHES = ['PLS', 'PLSX', 'HEX', 'INC', 'WPLS', 'MAXI', 'HDRN', 'ICSA', '9MM', 'PLSD', 'PLSB', 'GENI', 'MINT', 'Atropa', 'SPARK', 'WATT', 'LOAN', '9INCH'];

    const [profiles, boosts, ...searches] = await Promise.allSettled([
      get('/api/dex/token-profiles/latest/v1'),
      get('/api/dex/token-boosts/top/v1'),
      ...SEARCHES.map(q => get(`${DSX}/search?q=${encodeURIComponent(q)}`)),
    ]);

    const allAddrs = new Set();
    const searchPairs = new Map();

    // Collect addresses from profiles + boosts
    for (const res of [profiles, boosts]) {
      if (res.status === 'fulfilled') {
        for (const p of (res.value || [])) {
          if (p.chainId === 'pulsechain' && p.tokenAddress) allAddrs.add(p.tokenAddress);
        }
      }
    }

    // Collect pairs from search results
    for (const res of searches) {
      if (res.status !== 'fulfilled') continue;
      for (const p of (res.value?.pairs || [])) {
        if (p.chainId !== 'pulsechain' || !p.baseToken?.address) continue;
        const addr = p.baseToken.address.toLowerCase();
        const existing = searchPairs.get(addr);
        if (!existing || Number(p.liquidity?.usd || 0) > Number(existing.liquidity?.usd || 0)) {
          searchPairs.set(addr, p);
        }
      }
    }

    // Add known tokens
    for (const t of KNOWN_TOKENS) allAddrs.add(t.address);

    // Remove addresses already in searchPairs
    const toFetch = [...allAddrs].filter(a => !searchPairs.has(a.toLowerCase()));
    const fetched = await getPairsByAddresses(toFetch);

    // Merge: fetched is authoritative for known tokens; search fills the rest
    const merged = new Map(fetched);
    for (const [addr, pair] of searchPairs) {
      if (!merged.has(addr)) merged.set(addr, pair);
    }

    return [...merged.values()]
      .filter(p => p && !DENYLIST.has((p.baseToken?.address || '').toLowerCase()) && (p.marketCap || p.fdv || 0) >= 5000)
      .sort((a, b) => Number(b.volume?.h24 || 0) - Number(a.volume?.h24 || 0));
  }

  async function getTrendingPairs() {
    const pairs = await getTopPairs().catch(() => []);
    return [...pairs].sort((a, b) => {
      const as = Number(a.txns?.h6?.buys || 0) + Number(a.txns?.h6?.sells || 0);
      const bs = Number(b.txns?.h6?.buys || 0) + Number(b.txns?.h6?.sells || 0);
      return bs - as;
    });
  }

  /* ── Portfolio ────────────────────────────────────── */

  async function getPlsBalance(addr) {
    const data = await get(`${SCAN}?module=account&action=balance&address=${addr}&tag=latest`);
    if (data.status !== '1') throw new Error(data.message || 'Balance fetch failed');
    return Number(data.result) / 1e18;
  }

  async function getTokenList(addr) {
    const data = await get(`${SCAN}?module=account&action=tokenlist&address=${addr}`);
    if (data.status !== '1') {
      if (data.message === 'No tokens found') return [];
      throw new Error(data.message || 'Token list fetch failed');
    }
    return (data.result || []).map(t => ({
      symbol:          t.symbol,
      name:            t.name,
      balance:         Number(t.balance) / Math.pow(10, Number(t.decimals)),
      decimals:        Number(t.decimals),
      contractAddress: t.contractAddress,
    }));
  }

  async function getTotalSupply(addr) {
    try {
      const data = await get(`${SCAN}?module=stats&action=tokensupply&contractaddress=${addr}`, 8000);
      return data.status === '1' ? data.result : null;
    } catch { return null; }
  }

  /* ── Token details ────────────────────────────────── */

  async function getTokenSecurity(addr) {
    try {
      const data = await get(`/api/goplus/api/v1/token_security/369?contract_addresses=${addr.toLowerCase()}`, 12000);
      return data.code === 1 ? data.result?.[addr.toLowerCase()] || null : null;
    } catch { return null; }
  }

  async function getTokenMetadata(addr) {
    try { return await get(`/api/scan-v2/tokens/${addr}`, 10000); }
    catch { return null; }
  }

  async function getTokenTransfers(addr) {
    try {
      const data = await get(`/api/scan-v2/tokens/${addr}/transfers?limit=50`, 10000);
      return data?.items || [];
    } catch { return []; }
  }

  /* ── Trade import (wallet parse) ─────────────────── */

  async function getTokenTxs(addr) {
    const data = await get(`${SCAN}?module=account&action=tokentx&address=${addr}&page=1&offset=5000&sort=asc`, 30000);
    if (data.status !== '1') {
      if (data.message === 'No transactions found') return [];
      throw new Error(data.message);
    }
    return data.result || [];
  }

  async function getNormalTxs(addr) {
    const data = await get(`${SCAN}?module=account&action=txlist&address=${addr}&page=1&offset=5000&sort=asc`, 30000);
    if (data.status !== '1') {
      if (data.message === 'No transactions found') return [];
      throw new Error(data.message);
    }
    return data.result || [];
  }

  async function getInternalTxs(addr) {
    const data = await get(`${SCAN}?module=account&action=txlistinternal&address=${addr}&page=1&offset=5000&sort=asc`, 30000);
    if (data.status !== '1') {
      if (data.message === 'No transactions found') return [];
      throw new Error(data.message);
    }
    return data.result || [];
  }

  async function parseWalletTrades(address) {
    const addrLow = address.toLowerCase();
    const WPLS_LOW = WPLS.toLowerCase();

    const [tokenTxs, normalTxs, internalTxs] = await Promise.all([
      getTokenTxs(address),
      getNormalTxs(address),
      getInternalTxs(address),
    ]);

    const normalMap   = new Map(normalTxs.map(t => [t.hash.toLowerCase(), t]));
    const internalPls = new Map();
    for (const t of internalTxs) {
      if (t.to?.toLowerCase() !== addrLow) continue;
      const v = Number(t.value) / 1e18;
      if (v <= 0) continue;
      const h = t.hash.toLowerCase();
      internalPls.set(h, (internalPls.get(h) || 0) + v);
    }

    const groups = new Map();
    for (const t of tokenTxs) {
      if (!t.contractAddress) continue; // skip if no contract address
      if ((t.contractAddress || '').toLowerCase() === WPLS_LOW) continue;
      const h = (t.hash || '').toLowerCase();
      if (!h) continue;
      if (!groups.has(h)) groups.set(h, { in: [], out: [], ts: t.timeStamp });
      const g = groups.get(h);
      if ((t.to || '').toLowerCase() === addrLow)   g.in.push(t);
      else if ((t.from || '').toLowerCase() === addrLow) g.out.push(t);
    }

    const trades = [];
    for (const [hash, { in: inc, out, ts }] of groups) {
      const date    = new Date(Number(ts) * 1000).toISOString();
      const normal  = normalMap.get(hash);
      const shortH  = hash.slice(0, 10) + '…';

      if (inc.length > 0 && (normal?.from || '').toLowerCase() === addrLow) {
        const pls = Number(normal.value) / 1e18;
        if (pls > 0) {
          const plsPer = pls / inc.length;
          for (const t of inc) {
            if (!t.contractAddress) continue;
            const amt = Number(t.value) / Math.pow(10, Number(t.tokenDecimal) || 18);
            if (amt <= 0) continue;
            trades.push({ type: 'buy', tokenAddress: (t.contractAddress || '').toLowerCase(), tokenSymbol: t.tokenSymbol || '?', tokenName: t.tokenName || t.tokenSymbol || '?', date, tokenAmount: amt, plsAmount: plsPer, usdValue: 0, pricePerTokenPls: amt > 0 ? plsPer / amt : 0, notes: `Imported from tx ${shortH}`, txHash: hash });
          }
        }
      }

      if (out.length > 0 && internalPls.has(hash)) {
        const pls    = internalPls.get(hash);
        const plsPer = pls / out.length;
        for (const t of out) {
          if (!t.contractAddress) continue;
          const amt = Number(t.value) / Math.pow(10, Number(t.tokenDecimal) || 18);
          if (amt <= 0) continue;
          trades.push({ type: 'sell', tokenAddress: (t.contractAddress || '').toLowerCase(), tokenSymbol: t.tokenSymbol || '?', tokenName: t.tokenName || t.tokenSymbol || '?', date, tokenAmount: amt, plsAmount: plsPer, usdValue: 0, pricePerTokenPls: amt > 0 ? plsPer / amt : 0, notes: `Imported from tx ${shortH}`, txHash: hash });
        }
      }
    }

    return trades.sort((a, b) => new Date(a.date) - new Date(b.date));
  }

  /* ── Ecosystem stats ──────────────────────────────── */

  async function getBridgeStats() {
    // Confirmed working. bridge.tvl is an ARRAY, chain key is "Ethereum"
    try { return await get('/api/llama/protocol/pulsechain-bridge', 12000); }
    catch { return null; }
  }

  async function getFearGreed() {
    try { return await get('/api/fear-greed', 8000); }
    catch { return null; }
  }

  async function getGlobalMarket() {
    try { return await get('/api/coingecko/global', 10000); }
    catch { return null; }
  }

  /* ── Public surface ───────────────────────────────── */
  return {
    CORE_COINS,
    KNOWN_TOKENS,
    WPLS,
    logoUrl,
    getPairsByAddresses,
    getChartBars,
    getCoreCoinPairs,
    getTopPairs,
    getTrendingPairs,
    getPlsBalance,
    getTokenList,
    getTotalSupply,
    getTokenSecurity,
    getTokenMetadata,
    getTokenTransfers,
    parseWalletTrades,
    getBridgeStats,
    getFearGreed,
    getGlobalMarket,
  };
})();
