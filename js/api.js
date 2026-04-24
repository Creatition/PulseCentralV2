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
    // PLS: E56043 pair for DexScreener price. chartPair=WPLS/USDC gives clean USD bars (no inversion needed)
    { symbol: 'PLS',  address: '0xA1077a294dDE1B09bB078844df40758a5D0f9a27', pair: '0xE56043671df55dE5CDf8459710433C10324DE0aE', chartPair: '0x6753560538ECa67617a9Ce605178F788bE7E524e', color: '#7b2fff' },
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
    { symbol: 'pDAI',  address: '0xfC64556FAA683e6087F425819C7Ca3C558e13aC1' },
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
  /**
   * Parse a raw DexScreener pairs array into the result map.
   * Prefers PulseChain pairs; when allChains=false, skips non-PulseChain.
   */
  function _ingestPairs(pairs, map, allChains) {
    const grouped = new Map();
    for (const p of (pairs || [])) {
      if (!allChains && p.chainId !== 'pulsechain') continue;
      const addr = (p.baseToken?.address || '').toLowerCase();
      if (!addr || DENYLIST.has(addr)) continue;
      const g = grouped.get(addr) || [];
      g.push(p);
      grouped.set(addr, g);
    }
    for (const [addr, ps] of grouped) {
      if (map.has(addr)) continue;          // already resolved by an earlier method
      const plsPairs = ps.filter(p => p.chainId === 'pulsechain');
      map.set(addr, bestPair(plsPairs.length ? plsPairs : ps));
    }
  }

  async function getPairsByAddresses(addresses, allChains = false) {
    if (!addresses.length) return new Map();
    const map = new Map();
    const lowers = addresses.map(a => a.toLowerCase());

    // ── Stage 1: /tokens/ batch (30 per request) ──────────────────────────
    // This is fast but misses tokens with no DexScreener "token profile".
    const chunks = [];
    for (let i = 0; i < lowers.length; i += 30) chunks.push(lowers.slice(i, i + 30));

    await Promise.allSettled(chunks.map(async chunk => {
      try {
        const data = await get(`${DSX}/tokens/${chunk.join(',')}`, 15000);
        _ingestPairs(data.pairs, map, allChains);
      } catch (e) { console.warn('[getPairsByAddresses] /tokens/ chunk failed:', e.message); }
    }));

    // ── Stage 2: DexScreener search fallback for any address still missing ─
    // /latest/dex/search?q=ADDRESS always finds the best pair for that address.
    const missing = lowers.filter(a => !map.has(a));
    if (missing.length) {
      await Promise.allSettled(missing.map(async addr => {
        try {
          const data = await get(`${DSX}/search?q=${encodeURIComponent(addr)}`, 12000);
          _ingestPairs(data.pairs, map, allChains);
          // DexScreener search may return the token as quoteToken — check both sides
          for (const p of (data.pairs || [])) {
            const qt = (p.quoteToken?.address || '').toLowerCase();
            if (qt === addr && !map.has(addr) && !DENYLIST.has(addr)) {
              map.set(addr, p);
            }
          }
        } catch (e) { console.warn('[getPairsByAddresses] /search fallback failed for', addr, e.message); }
      }));
    }

    return map;
  }

  /* ── GeckoTerminal chart bars ─────────────────────── */

  /**
   * Fetch daily OHLCV bars from GeckoTerminal.
   * currency=usd: GeckoTerminal returns the BASE token price in USD.
   * For the WPLS/DAI pool (E56043), DAI is the base token, so close ≈ $1.
   * Setting invertPrices=true inverts to get WPLS (PLS) price in USD.
   */
  async function getChartBars(pairAddress, invertPrices = false) {
    // Fetch WITHOUT currency=usd so we get the raw pool ratio (token0/token1 price)
    // For WPLS/DAI pool: this gives us WPLS price in DAI, which ≈ PLS price in USD
    const url = invertPrices
      ? `${GECKO}/${pairAddress}/ohlcv/day?aggregate=1&limit=1000`
      : `${GECKO}/${pairAddress}/ohlcv/day?aggregate=1&limit=1000&currency=usd`;

    const data = await get(url, 15000);
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

    // Without currency=usd, GeckoTerminal returns token0/token1 ratio.
    // For WPLS/DAI pool where DAI is token0 and WPLS is token1:
    //   close = price of DAI expressed in WPLS units (e.g. 10000 = 1 DAI costs 10000 WPLS)
    //   So PLS price in USD = 1 / close
    // For WPLS/DAI where WPLS is token0 and DAI is token1:
    //   close = price of WPLS in DAI (e.g. 0.0001 = 1 WPLS costs 0.0001 DAI)
    //   This is already PLS price in USD, no inversion needed

    // Detect orientation by checking if close values look like PLS price (< 1) or DAI/WPLS ratio (> 100)
    const medianClose = bars[Math.floor(bars.length / 2)]?.close || 0;
    const needsInvert = medianClose > 10; // if close > 10, it's DAI-per-WPLS count, invert it

    if (!needsInvert) {
      // close already represents PLS price in DAI (which ≈ PLS price in USD)
      return bars.filter(b => b.close > 0 && b.close < 1);
    }

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

  /* ── Core coins (Home tab) ────────────────────────── */

  async function getCoreCoinPairs() {
    const pairAddrs = CORE_COINS.map(c => c.pair).join(',');
    const [pairData, snapshots, moralisPlsPrice] = await Promise.all([
      get(`${DSX}/pairs/pulsechain/${pairAddrs}`).catch(() => ({})),
      get('/api/chart-snapshots').catch(() => ({})),
      // Use Moralis for reliable PLS price data
      get('/api/moralis/pls-price').catch(() => null),
    ]);

    const byPair = new Map();
    for (const p of (pairData.pairs || [])) {
      if (p.pairAddress) byPair.set(p.pairAddress.toLowerCase(), p);
    }

    // Fetch live bars for ALL core coins from GeckoTerminal with currency=usd
    // PLS uses chartPair (WPLS/USDC on PulseX) — WPLS is base token so currency=usd gives PLS price directly
    // No inversion needed — all pairs return base-token price in USD
    const barResults = await Promise.allSettled(
      CORE_COINS.map(coin => {
        const pairForChart = coin.chartPair || coin.pair;
        return getChartBars(pairForChart, false); // always use currency=usd, no inversion
      })
    );

    // If Moralis gives us PLS price, inject it into the PLS pair data
    const plsUsdPrice = moralisPlsPrice?.usdPrice || moralisPlsPrice?.usd_price || null;

    return CORE_COINS.map((coin, i) => {
      const pair = byPair.get(coin.pair.toLowerCase()) || null;
      const liveBars = barResults[i].status === 'fulfilled' ? barResults[i].value : [];
      const snapBars = Array.isArray(snapshots.coins?.[coin.symbol]) ? snapshots.coins[coin.symbol] : [];
      const bars = liveBars.length >= snapBars.length ? liveBars : snapBars;

      // For PLS: override priceUsd with Moralis price if available
      let resolvedPair = pair;
      if (coin.symbol === 'PLS' && plsUsdPrice && pair) {
        resolvedPair = { ...pair, priceUsd: String(plsUsdPrice) };
      } else if (coin.symbol === 'PLS' && plsUsdPrice && !pair) {
        resolvedPair = { priceUsd: String(plsUsdPrice) };
      }

      return { ...coin, pair: resolvedPair, bars };
    });
  }

  /* ── Markets tab ──────────────────────────────────── */

  async function getTopPairs() {
    // Expanded search list targeting 200+ PulseChain tokens
    const SEARCHES = [
      // Core tokens
      'PLS', 'PLSX', 'HEX', 'INC', 'WPLS', 'PRVX',
      // DeFi / lending
      'MAXI', 'HDRN', 'ICSA', 'LOAN', 'TRIO', 'PHIAT',
      // DEX tokens
      '9MM', '9INCH', 'PITEAS', 'PULSEX',
      // Stable / bridge
      'USDC', 'USDT', 'DAI', 'WETH', 'WBTC',
      // Ecosystem
      'PLSD', 'PLSB', 'PLSR', 'SPARK', 'WATT', 'GENI', 'MINT', 'TEAM',
      // Community
      'Atropa', 'BEAR', 'PINU', 'DECI', 'CST', 'BRSCO',
      // More PulseChain native tokens
      'PULSE', 'PHEX', 'eHEX', 'PDAI', 'HEX1',
      'PWORLD', 'PLSP', 'PLSF', 'XEN', 'LUCKY',
      'AXIS', 'NOPE', 'GOLD', 'FIRE', 'PENT',
      'MAX', 'MOPS', 'HBURN', 'PITCH', 'ICETH',
    ];

    const [profiles, boosts, moralisTokens, ...searches] = await Promise.allSettled([
      get('/api/dex/token-profiles/latest/v1'),
      get('/api/dex/token-boosts/top/v1'),
      fetch('/api/moralis/pulsechain/tokens').then(r => r.json()).catch(() => []),
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

    // Add addresses from Moralis token list (enriches coverage significantly)
    if (moralisTokens.status === 'fulfilled' && Array.isArray(moralisTokens.value)) {
      for (const tok of moralisTokens.value) {
        if (tok.address) allAddrs.add(tok.address);
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

    // Also inject Moralis-only tokens that didn't get a DexScreener pair
    // (gives us more tokens to hit the 200 target)
    if (moralisTokens.status === 'fulfilled' && Array.isArray(moralisTokens.value)) {
      for (const tok of moralisTokens.value) {
        if (!tok.address) continue;
        const addr = tok.address.toLowerCase();
        if (merged.has(addr)) {
          // Enrich existing entry with Moralis logo
          const existing = merged.get(addr);
          if (!existing.logoUrl && tok.logo) existing.logoUrl = tok.logo;
        } else if (tok.priceUsd > 0 || tok.totalLiquidityUsd > 0) {
          // Add Moralis-only token as a market pair entry
          merged.set(addr, {
            baseToken:   { address: addr, symbol: tok.symbol, name: tok.name },
            quoteToken:  { symbol: 'USD' },
            priceUsd:    tok.priceUsd ? String(tok.priceUsd) : '0',
            priceChange: { h24: tok.priceChange24h || 0 },
            volume:      { h24: tok.volumeUsd24h || 0 },
            marketCap:   tok.marketCapUsd || 0,
            fdv:         tok.marketCapUsd || 0,
            liquidity:   { usd: tok.totalLiquidityUsd || 0 },
            pairAddress: null,
            logoUrl:     tok.logo || null,
            _moralis:    true,
          });
        }
      }
    }

    const result = [...merged.values()]
      .filter(p => {
        if (!p) return false;
        const addr = (p.baseToken?.address || '').toLowerCase();
        if (DENYLIST.has(addr)) return false;
        // For Moralis-only tokens, require some price/liquidity signal
        if (p._moralis) return parseFloat(p.priceUsd || 0) > 0 || (p.liquidity?.usd || 0) > 100;
        return (p.marketCap || p.fdv || 0) >= 1000; // lower threshold to get more tokens
      })
      .sort((a, b) => Number(b.volume?.h24 || 0) - Number(a.volume?.h24 || 0));

    console.log(`[getTopPairs] ${result.length} total PulseChain tokens`);
    return result;
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
    // Try Moralis first — returns rich data with logos, prices, metadata
    try {
      const moralis = await get(`/api/moralis/wallet/${addr}/tokens`, 20000);
      if (moralis && !moralis.error && Array.isArray(moralis.result)) {
        const tokens = moralis.result
          .filter(t => t.symbol && t.balance && t.balance !== '0')
          .map(t => {
            const decimals = Number(t.decimals || 18);
            const rawBal   = BigInt(t.balance || '0');
            const balance  = Number(rawBal) / Math.pow(10, decimals);
            // Moralis returns usd_price as null for some tokens — keep null so
            // the portfolio enrichment step can fill it in via DexScreener pairs.
            const priceUsd = (t.usd_price != null) ? Number(t.usd_price) : null;
            const valueUsd = (t.usd_value != null) ? Number(t.usd_value)
                           : (priceUsd != null)     ? priceUsd * balance
                           : null;
            return {
              symbol:          t.symbol,
              name:            t.name || t.symbol,
              balance,
              decimals,
              contractAddress: t.token_address,
              logoUrl:         t.logo || t.thumbnail || null,
              priceUsd,
              valueUsd,
              source:          'moralis',
            };
          });
        if (tokens.length > 0) return tokens;
      }
    } catch (e) { console.warn('[getTokenList] Moralis failed:', e.message); }

    // Fallback: BlockScout (no price data — portfolio will enrich via DexScreener)
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
      logoUrl:         null,
      priceUsd:        null,
      valueUsd:        null,
      source:          'blockscout',
    }));
  }

  // Fetch live PLS/USD price: Moralis first, DexScreener WPLS pair as fallback.
  async function getPlsPrice() {
    try {
      const data = await get('/api/moralis/pls-price', 12000);
      const p = data && (data.usdPrice != null ? data.usdPrice : data.usd_price);
      if (p && Number(p) > 0) return Number(p);
    } catch (e) { console.warn('[getPlsPrice] Moralis failed:', e.message); }
    try {
      const pairs = await getPairsByAddresses([WPLS]);
      const pair  = pairs.get(WPLS.toLowerCase());
      const p     = Number(pair && pair.priceUsd || 0);
      if (p > 0) return p;
    } catch (e) { console.warn('[getPlsPrice] DexScreener fallback failed:', e.message); }
    return 0;
  }

  /**
   * Fetch token prices from Moralis for a list of PulseChain addresses.
   * Stage 1: batch POST /erc20/prices (fast, up to 25 per call).
   * Stage 2: individual GET /erc20/ADDRESS/price for any address still missing.
   * Returns Map<lowercaseAddr, {priceUsd, priceChange24h, logo}>.
   */
  async function getMoralisTokenPrices(addresses) {
    const map = new Map();
    const filtered = addresses.filter(a => a && !a.startsWith('cg:'));
    if (!filtered.length) return map;

    function ingestMoralisItem(t) {
      const addr = (t.tokenAddress || t.token_address || '').toLowerCase();
      if (!addr) return;
      const priceUsd = t.usdPrice != null ? Number(t.usdPrice) : (t.usd_price != null ? Number(t.usd_price) : null);
      const priceChange24h = t.usdPricePercentChange?.oneDay != null
        ? Number(t.usdPricePercentChange.oneDay)
        : (t['24hrPercentChange'] != null ? Number(t['24hrPercentChange']) : null);
      const logo = t.tokenLogo || t.thumbnail || t.logo || null;
      if (!map.has(addr) || priceUsd != null) {
        map.set(addr, { priceUsd, priceChange24h, logo });
      }
    }

    // Stage 1: batch
    try {
      const addrs = filtered.join(',');
      const data = await get(`/api/moralis/token-prices?addresses=${encodeURIComponent(addrs)}`, 20000);
      if (Array.isArray(data)) data.forEach(ingestMoralisItem);
    } catch (e) { console.warn('[getMoralisTokenPrices] batch failed:', e.message); }

    // Stage 2: individual fallback for addresses still missing or with null price
    const stillMissing = filtered.filter(a => {
      const entry = map.get(a);
      return !entry || entry.priceUsd == null;
    });
    if (stillMissing.length) {
      await Promise.allSettled(stillMissing.map(async addr => {
        try {
          const data = await get(`/api/moralis/token-price/${encodeURIComponent(addr)}`, 10000);
          if (data && !data.error) {
            const entry = {
              priceUsd:       data.usdPrice != null ? Number(data.usdPrice) : null,
              priceChange24h: data.usdPricePercentChange?.oneDay != null
                              ? Number(data.usdPricePercentChange.oneDay)
                              : null,
              logo:           data.tokenLogo || null,
            };
            // Only store if we got a price
            if (entry.priceUsd != null) map.set(addr, entry);
          }
        } catch { /* silently skip — token simply not indexed by Moralis */ }
      }));
    }

    return map;
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

  async function getBeaconChainStats() {
    try { return await get('/api/beacon/chain-stats', 15000); }
    catch { return null; }
  }

  async function getExecStats() {
    try { return await get('/api/chain/exec-stats', 15000); }
    catch { return null; }
  }

  async function getPiteasTokenlist() {
    try { return await get('/api/piteas/tokenlist', 30000); }
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
    getPlsPrice,
    getMoralisTokenPrices,
    getTotalSupply,
    getTokenSecurity,
    getTokenMetadata,
    getTokenTransfers,
    parseWalletTrades,
    getBridgeStats,
    getFearGreed,
    getGlobalMarket,
    getBeaconChainStats,
    getExecStats,
    getPiteasTokenlist,
  };
})();
