/**
 * PulseCentral – api.js
 * Handles all external data fetching: PulseChain Scan + DexScreener + DexTools.
 */

const API = (() => {
  /* ── Constants ─────────────────────────────────────────── */

  /** PulseChain Scan (BlockScout) base URL — routed through local proxy */
  const SCAN_BASE = '/api/scan';

  /** DexScreener API base URL — routed through local proxy */
  const DSX_BASE = '/api/dex/latest/dex';

  /**
   * DexScreener chart / OHLCV API base URLs — routed through local proxy.
   * PulseX V1 is a Uniswap V2-style AMM (constant product).  Try v2 first
   * and fall back to v3 in case the pair is on a concentrated-liquidity fork.
   */
  const DSX_CHART_BASE_V2 = '/api/dex-io/dex/chart/amm/v2/pulsechain';
  const DSX_CHART_BASE_V3 = '/api/dex-io/dex/chart/amm/v3/pulsechain';

  /** Unix timestamp (seconds) of PulseChain mainnet launch — 12 May 2023 */
  const PULSECHAIN_LAUNCH_TS = 1683849600;

  /** PulseX V1 subgraph proxy endpoint */
  const PULSEX_GRAPH_URL = '/api/graph/pulsex';

  /** DexTools shared-data API base URL — routed through local proxy */
  const DEXTOOLS_BASE = '/api/dextools';

  /** PulseChain native coin decimals */
  const PLS_DECIMALS = 18;

  /**
   * Well-known PulseChain token addresses used for the Markets / Trending tabs.
   * Keyed by symbol for easy lookup.
   */
  const KNOWN_TOKENS = [
    { symbol: 'PLSX',         address: '0x95B303987A60C71504D99Aa1b13B4DA07b0790ab' },
    { symbol: 'HEX',          address: '0x2b591e99afE9f32eAA6214f7B7629768c40Eeb39' },
    { symbol: 'INC',          address: '0x2fa878Ab3F87CC1C9737Fc071108F904c0B0C95d' },
    { symbol: 'WPLS',         address: '0xA1077a294dDE1B09bB078844df40758a5D0f9a27' },
    { symbol: 'DAI',          address: '0xefD766cCb38EaF1dfd701853BFCe31359239F305' },
    { symbol: 'USDC',         address: '0x15D38573d2feeb82e7ad5187aB8c1D52810B1f07' },
    { symbol: 'USDT',         address: '0x0Cb6F5a34ad42ec934882A05265A7d5F59b51A2f' },
    { symbol: 'WETH',         address: '0x02DcdD04e3F455D838cd1249292C58f3B79e3C3C' },
    { symbol: 'WBTC',         address: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599', pairAddress: '0xe0e1F83A1C64Cf65C1a86D7f3445fc4F58f7Dcbf' },
    { symbol: 'pDAI',         address: '0x6B175474E89094C44Da98b954EedeAC495271d0F', pairAddress: '0xfC64556FAA683e6087F425819C7Ca3C558e13aC1' },
    { symbol: 'eHex',         address: '0x57fde0a71132198BBeC939B98976993d8D89D225' },
    { symbol: 'PRVX',         address: '0xF6f8Db0aBa00007681F8fAF16A0FDa1c9B030b11' },
    { symbol: 'usdl',         address: '0x0dEEd1486bc52aA0d3E6f8849cEC5adD6598A162' },
    { symbol: 'emit',         address: '0x32fB5663619A657839A80133994E45c5e5cDf427' },
    { symbol: 'pulseguy',     address: '0x67922D590BA6C784f468B6B562d201113a8FbD2D' },
    { symbol: 'Peacock',      address: '0xc10A4Ed9b4042222d69ff0B374eddd47ed90fC1F', pairAddress: '0xCb99800B71B7FB0696D19c3aaAa20c03d2D7e449' },
    { symbol: 'Zero',         address: '0xf6703DBff070F231eEd966D33B1B6D7eF5207d26', pairAddress: '0xf6703DBff070F231eEd966D33B1B6D7eF5207d26' },
    { symbol: 'pTGC',         address: '0x94534EeEe131840b1c0F61847c572228bdfDDE93' },
    { symbol: 'pTiger',       address: '0xC2ACde27428d292C4E8e5A4A38148d6b7A2215f5', pairAddress: '0x4501F821970214a8C7B2FB2478AF9E2B570C341a' },
    { symbol: 'UFO',          address: '0x456548A9B56eFBbD89Ca0309edd17a9E20b04018', pairAddress: '0xbeA0e55b82Eb975280041F3b49C4D0bD937b72d5' },
    { symbol: 'Most',         address: '0xe33a5AE21F93aceC5CfC0b7b0FDBB65A0f0Be5cC', pairAddress: '0x908B5490414518981ce5c473Ff120A6b338feF67' },
    { symbol: 'Pump',         address: '0xec4252e62C6dE3D655cA9Ce3AfC12E553ebBA274', pairAddress: '0x96Fefb743B1D180363404747bf09BD32657D8B78' },
    { symbol: 'Soil',         address: '0xbd63FA573A120013804e51B46C56F9b3e490f53C', pairAddress: '0x4581E25b434c1cEd7a93449B229469f03cA4451e' },
    { symbol: 'mafia',        address: '0x562866b6483894240739211049E109312E9A9A67' },
    { symbol: 'Atropa',       address: '0xCc78A0acDF847A2C1714D2A925bB4477df5d48a6', pairAddress: '0x5EF7AaC0DE4F2012CB36730Da140025B113FAdA4' },
    { symbol: 'FeD',          address: '0x1D177CB9EfEEa49A8B97ab1C72785a3A37ABc9Ff' },
    { symbol: 'Helgo',        address: '0x0567CA0dE35606E9C260CC2358404B11DE21DB44' },
    { symbol: 'Teddy Bear',   address: '0xd6c31bA0754C4383A41c0e9DF042C62b5e918f6d' },
    { symbol: 'stax',         address: '0xA78A54fB941E56514Fa1ccABAd49bCd02039F9d3' },
    { symbol: 'remember',     address: '0x2401E09acE92C689570a802138D6213486407B24' },
    { symbol: 'Sparta',       address: '0x52347C33Cf6Ca8D2cfb864AEc5aA0184C8fd4c9b' },
    { symbol: 'Tophat',       address: '0xc2472877F596D5052883B93777325dD7F7d11c96' },
    { symbol: 'Incd',         address: '0x144Cd22AaA2a80FEd0Bb8B1DeADDc51A53Df1d50' },
    { symbol: 'Pepe',         address: '0x1B71505D95Ab3e7234ed2239b8EC7aa65b94ae7B' },
    { symbol: 'Unity',        address: '0xC70CF25DFCf5c5e9757002106C096ab72fab299E' },
    { symbol: 'Zen',          address: '0xebeCbffA46Eaee7CB3B3305cCE9283cf05CfD1BB' },
    { symbol: 'Doubt',        address: '0x6ba0876e30CcE2A9AfC4B82D8BD8A8349DF4Ca96' },
    { symbol: '9MM',          address: '0x7b39712Ef45F7dcED2bBDF11F3D5046bA61dA719' },
    { symbol: 'zkp',          address: '0x90F055196778e541018482213Ca50648cEA1a050' },
    { symbol: 'dominance',    address: '0x116D162d729E27E2E1D6478F1d2A8AEd9C7a2beA' },
    { symbol: 'cvre',         address: '0x483287DEd4F43552f201a103670853b5dc57D59d' },
    { symbol: 'devc',         address: '0xA804b9E522A2D1645a19227514CFe856Ad8C2fbC' },
    { symbol: 'finvesta',     address: '0x1C81b4358246d3088Ab4361aB755F3D8D4dd62d2' },
    { symbol: 'vouch',        address: '0xD34f5ADC24d8Cc55C1e832Bdf65fFfDF80D1314f' },
    { symbol: 'scada',        address: '0x69e23263927Ae53E5FF3A898d082a83B7D6fB438' },
    { symbol: 'trufarm',      address: '0xCA942990EF21446Db490532E66992eD1EF76A82b' },
    { symbol: 'steth',        address: '0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84' },
    { symbol: 'rhino',        address: '0x6C6D7De6C5f366a1995ed5f1e273C5B3760C6043' },
    { symbol: 'firew',        address: '0x03b4652C8565BC8c257Fbd9fA935AAE41160fc4C' },
    { symbol: 'pdai printer', address: '0x770CFA2FB975E7bCAEDDe234D92c3858C517Adca' },
    { symbol: 'solidx',       address: '0x8Da17Db850315A34532108f0f5458fc0401525f6' },
    { symbol: 'lbrty',        address: '0xB261Fa283aBf9CcE0b493B50b57cb654A490f339' },
    { symbol: 'coffee',       address: '0x707C905DF6104eAE3B116eD9635cBee0A9EBA6E6' },
    { symbol: 'ICSA',         address: '0xfc4913214444aF5c715cc9F7b52655e788A569ed' },
    { symbol: 'LOAN',         address: '0x9159f1D2a9f51998Fc9Ab03fbd8f265ab14A1b3B' },
    { symbol: 'PLSD',         address: '0x34F0915a5f15a66Eba86F6a58bE1A471FB7836A7' },
    { symbol: '9INCH',        address: '0x3ca80d83277e721171284667829c686527b8b3c5' },
    { symbol: 'GENI',         address: '0x444444444444c1a66f394025ac839a535246fcc8' },
    { symbol: 'MAXI',         address: '0x0d86b6aE6cA3E1a08E3d2C4796D30616897C1eE4' },
    { symbol: 'PHIAT',        address: '0x96e035ae0905efac8f733f133462f971cfa45db1' },
    { symbol: 'MINT',         address: '0x207e6b4529840a4fd518f73c68bc9c19b2a15944' },
    { symbol: 'WATT',         address: '0xDfdc2836FD2E63Bba9f0eE07901aD465Bff4DE71' },
    { symbol: 'HDRN',         address: '0x3819f64f282bf135d62168C1e513280dAF905e06' },
    { symbol: 'PLSB',         address: '0x5ee84583f67d5ecea5420dbb42b462896e7f8d06' },
    { symbol: 'TEAM',         address: '0xc6a2cDf807F251e4b82C236D9A23C5156D3fB3A2' },
    { symbol: 'BASE',         address: '0x7B3cFA85D9F31E0DB007D12aC6f47982C2Ac41fc' },
    { symbol: 'EARN',         address: '0xb513038bbfdf9d40b676f41606f4f61d4b02c4a2' },
    // Tokens added via CoinGecko / DexScreener / GoPulse scan
    { symbol: 'TEXAN',        address: '0xcfcffe432a48db53f59c301422d2edd77b2a88d7', pairAddress: '0x53bf2cc26381ea7ebb927e220008bbff3447a2ec' },
    { symbol: 'SPARK',        address: '0x6386704cD6f7A584EA9d23cccA66aF7EBA5a727e' },
    { symbol: 'TIME',         address: '0xCA35638A3fdDD02fEC597D8c1681198C06b23F58' },
    { symbol: 'IM',           address: '0xBBcF895BFCb57d0f457D050bb806d1499436c0CE' },
    { symbol: 'TRIO',         address: '0xf55c9850C528bA2533d53A5D980C8A5D7A5c3308' },
    { symbol: 'Whale',        address: '0x03B1A1B10151733bcEfa52178aadf9d7239407b4', pairAddress: '0x944a98723B506f7350A2F9D6505F22503Ac1d5DE' },
    { symbol: 'BullX',        address: '0x35B5F0Bd6264FfE48a848809Bb44583ed25CDd18', pairAddress: '0xa3be5A792Bf5934F0B858739aA53c4F9558F9f92' },
    { symbol: '',             address: '0x27557d148293d1C8e8f8c5DEEAb93545B1Eb8410' },
    { symbol: '',             address: '0xf034ddFeC9492b2D69BcABE6e8375A20C3697A8C' },
    { symbol: '',             address: '0x3a90E3e4aE060E14695440346f2B20C2B850Cb86' },
    { symbol: '',             address: '0xCEc5dDF67B77243d5004032E336d5454DD1A89DD' },
    { symbol: '',             address: '0xb31cA779511Ffb3546aeCCcaB0133AC091285F9f' },
    { symbol: '',             address: '0x03bb886995f4F699dE817582859686388aCB1D56' },
    { symbol: '',             address: '0xe98250BB335f5662edcA64C76C37c95a3334f358' },
    { symbol: '',             address: '0x547d2D9Eb1493c8DE0a64Bb34DAA4aD8060fcB3a' },
    { symbol: '',             address: '0xA5533dD99a4D0129ccFd747350c7D844F08b43Fb' },
    { symbol: '',             address: '0x5f3109A32B1c3298156B82f184d8071245D9Ea0c' },
    { symbol: '',             address: '0x2921c412A387f504C007A80B2D6008916Ca5D5DF' },
    { symbol: '',             address: '0x71423f29f8376eF8EFdB9207343a5ff32604C2E3' },
    { symbol: '',             address: '0x615CfD552E98eB97e5557B03aa41D0E85e98167B' },
    { symbol: '',             address: '0xE1d2bdbA58D34109c547883dC9c2f9E01cebB003' },
    { symbol: '',             address: '0xFf1eFdf60A84268cB5CDB310f05ff47b242EBc20' },
    { symbol: '',             address: '0x0a022e7591749B0ed0D9e3b7B978f26978440DC7' },
    { symbol: '',             address: '0x02f7EeD5950c81d7b7C23aa03004828F26B5e651' },
    { symbol: '',             address: '0x8B60F1dBc4AAFfA220C24395921C1625af5B70c1' },
    { symbol: '',             address: '0x82684c2A4FCa3BCFDD1eA116401Cb7A23D0dac72' },
    { symbol: '',             address: '0xD8836E8975A6BBeafBDe651E4D1fF59Dc99D45c0' },
  ];

  /**
   * Token addresses that are permanently excluded from all feeds and listings.
   * Tokens are identified by their lowercase contract address.
   */
  const DENYLIST = new Set([
    '0x710420e9e2ceaae2b56ee389a2fb7f8c8435181a', // buck rogers
    '0x2b4b29bce9e3ed4913b8031e93ecaf4c15fa6bf5', // lambo
    '0xaa46fa6cf4f81b087ec3a968946fb2e705c6b89e', // mule
    '0xf1f402518b025194eeb14ec00124160fd0db7a0c', // nananax
    '0xee67825ef27588faee39cfefb465eb0a242a740c', // loan
    '0x6800be3dcafdaaca28007007a0589e01a982048b', // buhbye
  ]);

  /**
   * The 6 core coins shown on the Home landing page (in display order).
   * `pairAddress`  – specific DEX pair contract for price + chart data.
   * `color`        – brand/accent colour used for the card border.
   * `chartRes`     – DexScreener chart resolution: 'W' = weekly bars.
   *                  Weekly resolution returns bars from pair inception with no
   *                  count cap, giving full coverage from PulseChain launch
   *                  (May 2023) to the present day.
   */
  const CORE_COINS = [
    { symbol: 'PLS',  address: '0xA1077a294dDE1B09bB078844df40758a5D0f9a27', pairAddress: '0xe56043671df55de5cdf8459710433c10324de0ae', color: '#7b2fff', chartRes: 'W' }, // address is the WPLS wrapper contract
    { symbol: 'PLSX', address: '0x95B303987A60C71504D99Aa1b13B4DA07b0790ab', pairAddress: '0x1b45b9148791d3a104184cd5dfe5ce57193a3ee9', color: '#ff6d00', chartRes: 'W' },
    { symbol: 'HEX',  address: '0x2b591e99afE9f32eAA6214f7B7629768c40Eeb39', pairAddress: '0xf1f4ee610b2babb05c635f726ef8b0c568c8dc65', color: '#e8002d', chartRes: 'W' },
    { symbol: 'eHex', address: '0x57fde0a71132198BBeC939B98976993d8D89D225', pairAddress: '0xF0eA3efE42C11c8819948Ec2D3179F4084863D3F', color: '#f59e0b', chartRes: 'W', hideFromHome: true },
    { symbol: 'INC',  address: '0x2fa878Ab3F87CC1C9737Fc071108F904c0B0C95d', pairAddress: '0xf808bb6265e9ca27002c0a04562bf50d4fe37eaa', color: '#00e676', chartRes: 'W' },
    { symbol: 'PRVX', address: '0xF6f8Db0aBa00007681F8fAF16A0FDa1c9B030b11', pairAddress: '0x7f681a5ad615238357ba148c281e2eaefd2de55a', color: '#00bcd4', chartRes: 'W' },
  ];

  /**
   * Maps token address (lowercase) → designated pair address for each core coin
   * that has a known token address. Used in getPairsByAddresses to pin the exact
   * trading pair for Portfolio, Watchlist, Trades, and any other price lookup.
   */
  const CORE_PAIR_OVERRIDES = new Map([
    ...CORE_COINS
      .filter(c => c.address && c.pairAddress)
      .map(c => [c.address.toLowerCase(), c.pairAddress]),
    ...KNOWN_TOKENS
      .filter(t => t.pairAddress)
      .map(t => [t.address.toLowerCase(), t.pairAddress]),
  ]);

  /**
   * Token addresses (lowercase) whose pair data must be fetched from DexTools
   * because DexScreener does not index their designated pair contract.
   * Maps token address → pair address.
   */
  const DEXTOOLS_PAIR_OVERRIDES = new Map([
    // pDAI – PulseX V1 pair not indexed by DexScreener
    ['0x6b175474e89094c44da98b954eedeac495271d0f', '0xfC64556FAA683e6087F425819C7Ca3C558e13aC1'],
  ]);

  /* ── Helpers ────────────────────────────────────────────── */

  /**
   * Fetch JSON from a URL with a configurable timeout.
   * @param {string} url
   * @param {number} [timeoutMs=12000]
   * @returns {Promise<any>}
   */
  async function fetchJSON(url, timeoutMs = 12000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status} — ${res.statusText}`);
      return await res.json();
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * POST a JSON body to a URL with a configurable timeout and return the response JSON.
   * @param {string} url
   * @param {object} body
   * @param {number} [timeoutMs=15000]
   * @returns {Promise<any>}
   */
  async function postJSON(url, body, timeoutMs = 15000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
        signal:  controller.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} — ${res.statusText}`);
      return await res.json();
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Aggregate an array of daily OHLCV bars into weekly bars (ISO weeks, Monday start).
   * open = first day's open, high/low = extremes across the week,
   * close = last day's close, volume = sum, time = Monday's midnight UTC timestamp.
   * @param {Array<{time:number,open:number,high:number,low:number,close:number,volume:number}>} dailyBars
   * @returns {Array<{time:number,open:number,high:number,low:number,close:number,volume:number}>}
   */
  function aggregateDailyToWeekly(dailyBars) {
    if (!dailyBars || dailyBars.length === 0) return [];
    // Sort ascending by time so that the first/last bars within each week are correct.
    const sorted = [...dailyBars].sort((a, b) => a.time - b.time);
    const weeks = new Map();
    for (const bar of sorted) {
      const d = new Date(bar.time);
      // Map any weekday back to the previous (or same) Monday.
      // Sunday (0) → subtract 6, Monday (1) → subtract 0, …, Saturday (6) → subtract 5.
      const dow = d.getUTCDay(); // 0=Sun, 1=Mon … 6=Sat
      const daysToMonday = (dow + 6) % 7;
      const monday = new Date(d);
      monday.setUTCDate(d.getUTCDate() - daysToMonday);
      monday.setUTCHours(0, 0, 0, 0);
      const weekKey = monday.getTime();
      if (!weeks.has(weekKey)) {
        weeks.set(weekKey, { time: weekKey, open: bar.open, high: bar.high, low: bar.low, close: bar.close, volume: bar.volume });
      } else {
        const w = weeks.get(weekKey);
        w.high   = Math.max(w.high, bar.high);
        w.low    = Math.min(w.low, bar.low);
        w.close  = bar.close; // sorted ascending, so last iteration is the week's final day
        w.volume += bar.volume;
      }
    }
    return [...weeks.entries()].sort((a, b) => a[0] - b[0]).map(([, bar]) => bar);
  }

  /**
   * Fetch daily token price history from the PulseX V1 subgraph (The Graph).
   * Returns full daily bars from PulseChain launch (May 2023) to present.
   * Normalised to the OHLCV shape expected by buildDetailedChartSvg.
   * @param {string} tokenAddress  Token contract address (0x-prefixed)
   * @returns {Promise<Array<{time:number,open:number,high:number,low:number,close:number,volume:number}>>}
   */
  async function fetchPulseXTokenHistory(tokenAddress) {
    const addr = tokenAddress.toLowerCase();
    let allRows = [];
    let lastDate = 0;

    // Paginate through all daily data — the subgraph caps at 1000 per query
    let hasMoreData = true;
    while (hasMoreData) {
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
      try {
        const result = await postJSON(PULSEX_GRAPH_URL, { query }, 20000);
        const rows = result?.data?.tokenDayDatas || [];
        if (rows.length === 0) { hasMoreData = false; break; }

        allRows = allRows.concat(rows);
        lastDate = Number(rows[rows.length - 1].date);

        // If we got fewer than 1000, we've reached the end
        if (rows.length < 1000) hasMoreData = false;
      } catch (err) {
        // If a page fails, return whatever we've collected so far
        console.error('[fetchPulseXTokenHistory] pagination error:', err);
        hasMoreData = false;
      }
    }

    return allRows
      .map(d => {
        const price = Number(d.priceUSD || 0);
        return {
          time:   Number(d.date) * 1000,
          open:   price,
          high:   price,
          low:    price,
          close:  price,
          volume: Number(d.dailyVolumeUSD || 0),
        };
      })
      .filter(b => b.time > 0 && b.close > 0);
  }

  /**
   * Convert a token balance from its raw on-chain value to a human-readable
   * decimal string.
   * @param {string|number} rawBalance
   * @param {number} decimals
   * @returns {number}
   */
  function toDecimal(rawBalance, decimals) {
    if (!rawBalance) return 0;
    const factor = Math.pow(10, decimals);
    return Number(rawBalance) / factor;
  }

  /* ── DexTools API ───────────────────────────────────────── */

  /**
   * Fetch pair data from the DexTools shared-data API and normalise it into
   * the DexScreener pair-object shape consumed by the rest of the app.
   *
   * DexTools uses "pulse" as the chain slug for PulseChain.
   * The baseToken is whichever of token0/token1 matches `tokenAddress`.
   *
   * Returns null on any error so callers can skip silently.
   *
   * @param {string} pairAddress   DEX pair contract address (0x-prefixed)
   * @param {string} tokenAddress  Token contract address that should be the base token
   * @returns {Promise<object|null>}
   */
  async function fetchDexToolsPairData(pairAddress, tokenAddress) {
    const url = `${DEXTOOLS_BASE}?address=${pairAddress}&chain=pulse&audit=true&locks=true`;
    try {
      const data = await fetchJSON(url, 12000);
      const d = data?.data;
      if (!d) return null;

      const tokenAddrLower = tokenAddress.toLowerCase();

      // Determine which slot (token0 / token1) is the base token we care about
      const token0Addr = (d.token0?.id || d.token0?.address || '').toLowerCase();
      const t0 = { address: d.token0?.id || d.token0?.address, name: d.token0?.name, symbol: d.token0?.symbol };
      const t1 = { address: d.token1?.id || d.token1?.address, name: d.token1?.name, symbol: d.token1?.symbol };

      let baseToken, quoteToken, priceUsd;
      if (token0Addr === tokenAddrLower) {
        baseToken  = t0;
        quoteToken = t1;
        priceUsd   = d.price ?? d.price0;
      } else {
        baseToken  = t1;
        quoteToken = t0;
        priceUsd   = d.price1 ?? d.price;
      }

      // Normalise price-change percentages (DexTools uses variation*)
      const priceChange = {
        m5:  Number(d.variation5m  ?? 0),
        h1:  Number(d.variation1h  ?? 0),
        h6:  Number(d.variation6h  ?? 0),
        h24: Number(d.variation24h ?? 0),
      };

      return {
        chainId:     'pulsechain',
        pairAddress: pairAddress.toLowerCase(),
        baseToken,
        quoteToken,
        priceUsd:    priceUsd != null ? String(priceUsd) : undefined,
        priceChange,
        txns: {
          m5:  { buys: 0, sells: 0 },
          h1:  { buys: 0, sells: 0 },
          h6:  { buys: 0, sells: 0 },
          h24: { buys: d.buys24h ?? 0, sells: d.sells24h ?? 0 },
        },
        volume:    { h24: Number(d.volume24h ?? 0) },
        liquidity: { usd: Number(d.liquidity ?? 0) },
        fdv:       Number(d.fdv ?? d.mcap ?? 0) || undefined,
        marketCap: Number(d.mcap ?? 0) || undefined,
        url:       `https://www.dextools.io/app/pulse/pair-explorer/${pairAddress}`,
        _source:   'dextools',
      };
    } catch (err) {
      console.warn('[PulseCentral] DexTools fetch failed for', pairAddress, err);
      return null;
    }
  }

  /* ── PulseChain Scan API ────────────────────────────────── */

  /**
   * Fetch the native PLS balance (in whole PLS) for a wallet address.
   * @param {string} address  0x-prefixed wallet address
   * @returns {Promise<number>}
   */
  async function getPlsBalance(address) {
    const url = `${SCAN_BASE}?module=account&action=balance&address=${address}&tag=latest`;
    const data = await fetchJSON(url);
    if (data.status !== '1') throw new Error(data.message || 'Failed to fetch PLS balance');
    return toDecimal(data.result, PLS_DECIMALS);
  }

  /**
   * Fetch a page of ERC-20 token transfer events for a wallet address.
   * @param {string} address   0x-prefixed wallet address
   * @param {number} [page=1]
   * @param {number} [offset=5000]  records per page (max 10 000)
   * @returns {Promise<object[]>}
   */
  async function getTokenTransfers(address, page = 1, offset = 5000) {
    const url = `${SCAN_BASE}?module=account&action=tokentx&address=${address}&page=${page}&offset=${offset}&sort=asc`;
    const data = await fetchJSON(url, 30000);
    if (data.status !== '1') {
      if (data.message === 'No transactions found') return [];
      throw new Error(data.message || 'Failed to fetch token transfers');
    }
    return data.result || [];
  }

  /**
   * Fetch a page of normal (native PLS) transactions for a wallet address.
   * @param {string} address
   * @param {number} [page=1]
   * @param {number} [offset=5000]
   * @returns {Promise<object[]>}
   */
  async function getNormalTxs(address, page = 1, offset = 5000) {
    const url = `${SCAN_BASE}?module=account&action=txlist&address=${address}&page=${page}&offset=${offset}&sort=asc`;
    const data = await fetchJSON(url, 30000);
    if (data.status !== '1') {
      if (data.message === 'No transactions found') return [];
      throw new Error(data.message || 'Failed to fetch transactions');
    }
    return data.result || [];
  }

  /**
   * Fetch a page of internal transactions (contract-initiated PLS transfers) for a wallet.
   * @param {string} address
   * @param {number} [page=1]
   * @param {number} [offset=5000]
   * @returns {Promise<object[]>}
   */
  async function getInternalTxs(address, page = 1, offset = 5000) {
    const url = `${SCAN_BASE}?module=account&action=txlistinternal&address=${address}&page=${page}&offset=${offset}&sort=asc`;
    const data = await fetchJSON(url, 30000);
    if (data.status !== '1') {
      if (data.message === 'No transactions found') return [];
      throw new Error(data.message || 'Failed to fetch internal transactions');
    }
    return data.result || [];
  }

  /**
   * Wrapped PLS contract address — derived from KNOWN_TOKENS and excluded from
   * trade imports since wrapping/unwrapping PLS→WPLS is not a swap trade.
   */
  const WPLS_ADDRESS = KNOWN_TOKENS.find(t => t.symbol === 'WPLS').address.toLowerCase();

  /**
   * Fetch all token transfers, normal transactions, and internal transactions for
   * a wallet address, then parse them into structured buy/sell trade records.
   *
   * Detection rules:
   *   BUY  — wallet receives token(s) in the same tx where it sent PLS (normal tx, value > 0, from == wallet)
   *   SELL — wallet sends token(s) in the same tx where it received PLS via an internal transfer
   *
   * Token-to-token swaps and transactions where PLS amount cannot be determined
   * are excluded.  WPLS (wrapped PLS) transfers are always excluded.
   *
   * @param {string} address  0x-prefixed wallet address
   * @returns {Promise<Array<{type,tokenAddress,tokenSymbol,tokenName,date,tokenAmount,plsAmount,usdValue,pricePerTokenPls,notes,txHash}>>}
   */
  async function parseWalletTrades(address) {
    const addrLower = address.toLowerCase();

    // Fetch all three data sources in parallel
    const [tokenTxs, normalTxs, internalTxs] = await Promise.all([
      getTokenTransfers(address),
      getNormalTxs(address),
      getInternalTxs(address),
    ]);

    // Index normal txs by hash for O(1) lookup
    const normalTxMap = new Map();
    for (const tx of normalTxs) {
      normalTxMap.set(tx.hash.toLowerCase(), tx);
    }

    // Sum PLS received via internal txs per tx hash
    const internalPlsMap = new Map(); // hash → total PLS received by wallet
    for (const tx of internalTxs) {
      if (tx.to?.toLowerCase() !== addrLower) continue;
      const plsVal = toDecimal(tx.value, PLS_DECIMALS);
      if (plsVal <= 0) continue;
      const hash = tx.hash.toLowerCase();
      internalPlsMap.set(hash, (internalPlsMap.get(hash) || 0) + plsVal);
    }

    // Group token transfers by tx hash, separating incoming from outgoing
    const txGroups = new Map(); // hash → { incoming: [], outgoing: [], timeStamp }
    for (const tx of tokenTxs) {
      // Exclude WPLS wrapping/unwrapping
      if (tx.contractAddress?.toLowerCase() === WPLS_ADDRESS) continue;

      const hash = tx.hash.toLowerCase();
      if (!txGroups.has(hash)) {
        txGroups.set(hash, { incoming: [], outgoing: [], timeStamp: tx.timeStamp });
      }
      const group = txGroups.get(hash);
      if (tx.to?.toLowerCase() === addrLower) {
        group.incoming.push(tx);
      } else if (tx.from?.toLowerCase() === addrLower) {
        group.outgoing.push(tx);
      }
    }

    const trades = [];

    for (const [hash, { incoming, outgoing, timeStamp }] of txGroups) {
      const date     = new Date(Number(timeStamp) * 1000).toISOString();
      const shortHash = hash.slice(0, 10) + '…';
      const normalTx = normalTxMap.get(hash);

      // ── BUY: wallet sent PLS and received token(s) ──────────────────────
      if (
        incoming.length > 0 &&
        normalTx &&
        normalTx.from?.toLowerCase() === addrLower
      ) {
        const plsSpent = toDecimal(normalTx.value, PLS_DECIMALS);
        if (plsSpent > 0) {
          // Split PLS evenly across all received tokens in this tx.
          // Note: this is an approximation — in rare multi-token swaps the actual
          // PLS per token may differ; users can edit individual trades if needed.
          const plsPerToken = plsSpent / incoming.length;
          for (const transfer of incoming) {
            const tokenAmount = toDecimal(transfer.value, Number(transfer.tokenDecimal) || 18);
            if (tokenAmount <= 0) continue;
            trades.push({
              type:            'buy',
              tokenAddress:    transfer.contractAddress.toLowerCase(),
              tokenSymbol:     transfer.tokenSymbol || '?',
              tokenName:       transfer.tokenName   || transfer.tokenSymbol || '?',
              date,
              tokenAmount,
              plsAmount:       plsPerToken,
              usdValue:        0,
              pricePerTokenPls: tokenAmount > 0 ? plsPerToken / tokenAmount : 0,
              notes:           `Imported from tx ${shortHash}`,
              txHash:          hash,
            });
          }
        }
      }

      // ── SELL: wallet sent token(s) and received PLS internally ──────────
      if (outgoing.length > 0 && internalPlsMap.has(hash)) {
        const plsReceived  = internalPlsMap.get(hash);
        // Split PLS evenly across all sent tokens in this tx (same approximation as buys above).
        const plsPerToken  = plsReceived / outgoing.length;
        for (const transfer of outgoing) {
          const tokenAmount = toDecimal(transfer.value, Number(transfer.tokenDecimal) || 18);
          if (tokenAmount <= 0) continue;
          trades.push({
            type:            'sell',
            tokenAddress:    transfer.contractAddress.toLowerCase(),
            tokenSymbol:     transfer.tokenSymbol || '?',
            tokenName:       transfer.tokenName   || transfer.tokenSymbol || '?',
            date,
            tokenAmount,
            plsAmount:       plsPerToken,
            usdValue:        0,
            pricePerTokenPls: tokenAmount > 0 ? plsPerToken / tokenAmount : 0,
            notes:           `Imported from tx ${shortHash}`,
            txHash:          hash,
          });
        }
      }
    }

    // Sort chronologically
    trades.sort((a, b) => new Date(a.date) - new Date(b.date));
    return trades;
  }

  /**
   * Fetch all ERC-20 token balances held by a wallet.
   * Returns an array of token objects with symbol, name, balance, decimals, contractAddress.
   * @param {string} address  0x-prefixed wallet address
   * @returns {Promise<Array<{symbol:string, name:string, balance:number, decimals:number, contractAddress:string}>>}
   */
  async function getTokenList(address) {
    const url = `${SCAN_BASE}?module=account&action=tokenlist&address=${address}`;
    const data = await fetchJSON(url);
    if (data.status !== '1') {
      // status '0' with empty result means no tokens — not an error
      if (data.message === 'No tokens found') return [];
      throw new Error(data.message || 'Failed to fetch token list');
    }
    return (data.result || []).map(t => ({
      symbol:          t.symbol,
      name:            t.name,
      balance:         toDecimal(t.balance, Number(t.decimals)),
      decimals:        Number(t.decimals),
      contractAddress: t.contractAddress,
    }));
  }

  /* ── DexScreener API ────────────────────────────────────── */

  /**
   * Fetch DEX pair data for a list of token contract addresses from DexScreener.
   * Filters to PulseChain pairs only and picks the most liquid pair per token.
   * @param {string[]} addresses  array of 0x contract addresses
   * @returns {Promise<Map<string, object>>} map of lowercased address → pair data
   */
  async function getPairsByAddresses(addresses) {
    if (!addresses.length) return new Map();

    // DexScreener accepts up to 30 comma-separated addresses per request
    const chunks = [];
    for (let i = 0; i < addresses.length; i += 30) {
      chunks.push(addresses.slice(i, i + 30));
    }

    const pairMap = new Map();

    await Promise.allSettled(
      chunks.map(async chunk => {
        const url = `${DSX_BASE}/tokens/${chunk.join(',')}`;
        const data = await fetchJSON(url);
        const pairs = (data.pairs || []).filter(
          p => p.chainId === 'pulsechain'
        );
        // Group by token address, keep the most liquid pair
        for (const pair of pairs) {
          const addr = pair.baseToken?.address?.toLowerCase();
          if (!addr) continue;
          const existing = pairMap.get(addr);
          const liq = Number(pair.liquidity?.usd || 0);
          if (!existing || liq > Number(existing.liquidity?.usd || 0)) {
            pairMap.set(addr, pair);
          }
        }
      })
    );

    // Override price data for core coins with their designated pair addresses.
    // This ensures the correct pair is always used regardless of liquidity ranking.
    const overrideTokenAddrs = addresses
      .map(a => a.toLowerCase())
      .filter(a => CORE_PAIR_OVERRIDES.has(a));

    if (overrideTokenAddrs.length > 0) {
      const pairAddrs = overrideTokenAddrs.map(a => CORE_PAIR_OVERRIDES.get(a));
      try {
        const url = `${DSX_BASE}/pairs/pulsechain/${pairAddrs.join(',')}`;
        const data = await fetchJSON(url);
        for (const pair of (data.pairs || [])) {
          const tokenAddr = pair.baseToken?.address?.toLowerCase();
          if (tokenAddr) pairMap.set(tokenAddr, pair);
        }
      } catch (err) {
        console.warn('[PulseCentral] Core pair override fetch failed:', err);
      }
    }

    // DexTools fallback: for tokens whose pair is not indexed by DexScreener,
    // fetch price data directly from the DexTools shared-data API.
    const dextoolsTokenAddrs = addresses
      .map(a => a.toLowerCase())
      .filter(a => DEXTOOLS_PAIR_OVERRIDES.has(a) && !pairMap.has(a));

    if (dextoolsTokenAddrs.length > 0) {
      await Promise.allSettled(
        dextoolsTokenAddrs.map(async tokenAddr => {
          const pairAddr = DEXTOOLS_PAIR_OVERRIDES.get(tokenAddr);
          const pair = await fetchDexToolsPairData(pairAddr, tokenAddr);
          if (pair) pairMap.set(tokenAddr, pair);
        })
      );
    }

    return pairMap;
  }

  /**
   * Fetch top PulseChain pairs from DexScreener sorted by 24-hour volume.
   * Collects addresses from token profiles, boosted tokens (latest and top),
   * DexScreener search results for popular PulseChain symbols, and hardcoded
   * KNOWN_TOKENS, then deduplicates by token address.
   *
   * @returns {Promise<object[]>} array of DexScreener pair objects sorted by 24h volume
   */
  async function getTopPulsechainPairs() {
    // Search terms that reliably surface active PulseChain pairs on DexScreener.
    const SEARCH_TERMS = [
      'PLS', 'PLSX', 'HEX', 'INC', 'WPLS', 'PLSD', 'PLSB', 'eHex',
      '9MM', 'MAXI', 'HDRN', 'ICSA', 'PHIAT', 'LOAN', 'TEAM', 'BASE',
      'EARN', 'GENI', 'MINT', 'WATT', 'Atropa', '9INCH', 'SPARK', 'TIME',
    ];

    // Step 1: Fetch token profiles, boosted tokens, and search results in parallel
    const profileAddresses = [];
    const [profiles, latestBoosts, topBoosts, ...searchResults] = await Promise.allSettled([
      fetchJSON('/api/dex/token-profiles/latest/v1'),
      fetchJSON('/api/dex/token-boosts/latest/v1'),
      fetchJSON('/api/dex/token-boosts/top/v1'),
      ...SEARCH_TERMS.map(q => fetchJSON(`/api/dex/latest/dex/search?q=${encodeURIComponent(q)}`)),
    ]);

    if (profiles.status === 'fulfilled') {
      (profiles.value || [])
        .filter(p => p.chainId === 'pulsechain' && p.tokenAddress)
        .forEach(p => profileAddresses.push(p.tokenAddress));
    }
    if (latestBoosts.status === 'fulfilled') {
      (latestBoosts.value || [])
        .filter(p => p.chainId === 'pulsechain' && p.tokenAddress)
        .forEach(p => profileAddresses.push(p.tokenAddress));
    }
    if (topBoosts.status === 'fulfilled') {
      (topBoosts.value || [])
        .filter(p => p.chainId === 'pulsechain' && p.tokenAddress)
        .forEach(p => profileAddresses.push(p.tokenAddress));
    }

    // Collect direct pair objects from search results (PulseChain only).
    // Keyed by baseToken address; keep the most-liquid pair per token.
    const searchPairs = new Map();
    for (const result of searchResults) {
      if (result.status !== 'fulfilled') continue;
      for (const p of (result.value?.pairs || [])) {
        if (p.chainId !== 'pulsechain' || !p.baseToken?.address) continue;
        const addr = p.baseToken.address.toLowerCase();
        const existing = searchPairs.get(addr);
        const liq = Number(p.liquidity?.usd || 0);
        if (!existing || liq > Number(existing.liquidity?.usd || 0)) {
          searchPairs.set(addr, p);
        }
      }
    }

    // Step 2: Merge with hardcoded known tokens (de-duplicated by token address),
    // skipping tokens already retrieved from search results.
    const seen = new Set(searchPairs.keys());
    const allAddresses = [];
    for (const addr of [...profileAddresses, ...KNOWN_TOKENS.map(t => t.address)]) {
      const lower = addr.toLowerCase();
      if (!seen.has(lower)) {
        seen.add(lower);
        allAddresses.push(addr);
      }
    }

    // Step 3: Fetch pair data for all addresses (getPairsByAddresses deduplicates by token address)
    const rawMap = await getPairsByAddresses(allAddresses);

    // Merge search results: rawMap is authoritative for core/known tokens (CORE_PAIR_OVERRIDES
    // applied inside); search results fill in any extra tokens not in rawMap.
    for (const [addr, pair] of searchPairs) {
      if (!rawMap.has(addr)) rawMap.set(addr, pair);
    }

    // Step 3.5: For KNOWN_TOKENS pairs that have a price but lack both marketCap
    // and fdv (DexScreener omits these when it doesn't know the token's total
    // supply), fetch on-chain total supply from PulseChain BlockScout v2 and
    // compute an FDV estimate.  This prevents valid meme coins from being
    // silently dropped by the (marketCap || fdv) > 0 filter in the UI.
    const knownAddrs = new Set(KNOWN_TOKENS.map(t => t.address.toLowerCase()));
    const noCapPairs = [...rawMap.entries()].filter(
      ([addr, pair]) =>
        knownAddrs.has(addr) &&
        !pair.marketCap && !pair.fdv &&
        Number(pair.priceUsd || 0) > 0
    );

    if (noCapPairs.length > 0) {
      await Promise.allSettled(
        noCapPairs.map(async ([, pair]) => {
          try {
            const meta = await fetchJSON(
              `/api/scan-v2/tokens/${pair.baseToken.address}`,
              8000
            );
            const decimals  = Number(meta?.decimals  || 18);
            const rawSupply = meta?.total_supply;
            if (rawSupply && rawSupply !== '0') {
              const supply = Number(rawSupply) / Math.pow(10, decimals);
              pair.fdv = supply * Number(pair.priceUsd);
            }
          } catch {
            // Non-fatal – pair remains without fdv and may still appear via volume ranking
          }
        })
      );
    }

    // Sort by 24h volume descending – no additional filters, dedup is the only constraint
    return [...rawMap.values()]
      .filter(p => !DENYLIST.has((p.baseToken?.address || '').toLowerCase()))
      .sort((a, b) => Number(b.volume?.h24 || 0) - Number(a.volume?.h24 || 0));
  }

  /**
   * Fetch trending PulseChain pairs, sorted by 6-hour transaction activity
   * as an approximation of trending tokens.  Note: this is not an exact replica
   * of DexScreener's proprietary trendingScoreH6 — it uses (h6 buys + h6 sells)
   * as a publicly available proxy that correlates with recent trading momentum.
   * Mirrors the spirit of: https://dexscreener.com/pulsechain?rankBy=trendingScoreH6&order=desc
   *
   * In addition to the profile/boost/KNOWN_TOKENS approach, this now also
   * queries the DexScreener search endpoint for several popular PulseChain
   * token symbols to widen the candidate pool and reliably surface 25+ tokens.
   * @returns {Promise<object[]>}
   */
  async function getTrendingPairs() {
    const profileAddresses = [];

    // Search terms that reliably surface active PulseChain pairs on DexScreener.
    const SEARCH_TERMS = ['PLS', 'PLSX', 'HEX', 'INC', '9MM', 'PLSB'];

    const [profiles, latestBoosts, topBoosts, ...searchResults] = await Promise.allSettled([
      fetchJSON('/api/dex/token-profiles/latest/v1'),
      fetchJSON('/api/dex/token-boosts/latest/v1'),
      fetchJSON('/api/dex/token-boosts/top/v1'),
      ...SEARCH_TERMS.map(q => fetchJSON(`/api/dex/latest/dex/search?q=${encodeURIComponent(q)}`)),
    ]);

    if (profiles.status === 'fulfilled') {
      (profiles.value || [])
        .filter(p => p.chainId === 'pulsechain' && p.tokenAddress)
        .forEach(p => profileAddresses.push(p.tokenAddress));
    }
    if (latestBoosts.status === 'fulfilled') {
      (latestBoosts.value || [])
        .filter(p => p.chainId === 'pulsechain' && p.tokenAddress)
        .forEach(p => profileAddresses.push(p.tokenAddress));
    }
    if (topBoosts.status === 'fulfilled') {
      (topBoosts.value || [])
        .filter(p => p.chainId === 'pulsechain' && p.tokenAddress)
        .forEach(p => profileAddresses.push(p.tokenAddress));
    }

    // Collect direct pair objects from search results (PulseChain only).
    // Keyed by baseToken address; keep the most-liquid pair per token.
    const searchPairs = new Map();
    for (const result of searchResults) {
      if (result.status !== 'fulfilled') continue;
      for (const p of (result.value?.pairs || [])) {
        if (p.chainId !== 'pulsechain' || !p.baseToken?.address) continue;
        const addr = p.baseToken.address.toLowerCase();
        const existing = searchPairs.get(addr);
        const liq = Number(p.liquidity?.usd || 0);
        if (!existing || liq > Number(existing.liquidity?.usd || 0)) {
          searchPairs.set(addr, p);
        }
      }
    }

    // Build the address list for the standard token lookup, skipping tokens
    // already retrieved from search results.
    const seen = new Set(searchPairs.keys());
    const allAddresses = [];
    for (const addr of [...profileAddresses, ...KNOWN_TOKENS.map(t => t.address)]) {
      const lower = addr.toLowerCase();
      if (!seen.has(lower)) {
        seen.add(lower);
        allAddresses.push(addr);
      }
    }

    const rawMap = await getPairsByAddresses(allAddresses);

    // Merge: rawMap is authoritative for core/known tokens (CORE_PAIR_OVERRIDES
    // applied inside); search results fill in any extra tokens not in rawMap.
    for (const [addr, pair] of searchPairs) {
      if (!rawMap.has(addr)) rawMap.set(addr, pair);
    }

    // Sort by 6-hour transaction count (buys + sells) as trendingScoreH6 proxy
    return [...rawMap.values()]
      .filter(p => !DENYLIST.has((p.baseToken?.address || '').toLowerCase()))
      .sort((a, b) => {
        const aScore = Number(a.txns?.h6?.buys || 0) + Number(a.txns?.h6?.sells || 0);
        const bScore = Number(b.txns?.h6?.buys || 0) + Number(b.txns?.h6?.sells || 0);
        return bScore - aScore;
      });
  }

  /**
   * Fetch pair data for the well-known token list (Markets tab warm-up).
   * @returns {Promise<object[]>}
   */
  async function getKnownTokenPairs() {
    const addresses = KNOWN_TOKENS.map(t => t.address);
    const pairMap = await getPairsByAddresses(addresses);
    return [...pairMap.values()];
  }

  /**
   * Fetch OHLCV chart bars for a single core coin.
   * Strategy (in order of preference):
   *  1. PulseX V1 subgraph — full daily history from PulseChain launch (May 2023).
   *  2. DexScreener io API with amm/v2 path (PulseX V1 is a V2-style AMM).
   *  3. DexScreener io API with amm/v3 path (fallback for concentrated-liquidity forks).
   * Returns an empty array when all sources fail so callers degrade gracefully.
   * @param {string} pairAddress   DEX pair contract address
   * @param {string} resolution    DexScreener chart resolution string ('W', 'D', '60', etc.)
   * @param {string} [tokenAddress] Token contract address — enables subgraph lookup
   * @returns {Promise<Array<{time:number,open:number,high:number,low:number,close:number,volume:number}>>}
   */
  async function getCoreCoinChartBars(pairAddress, resolution, tokenAddress) {
    // ── 1. PulseX subgraph (preferred — full history since May 2023) ──────
    if (tokenAddress) {
      const subgraphBars = await fetchPulseXTokenHistory(tokenAddress);
      // Only trust subgraph data when it reaches back close to PulseChain
      // launch (within 90 days).  If the subgraph is a fresh deployment with
      // only a few recent days indexed, its oldest bar will be far from launch
      // and we fall through to DexScreener which has the real long-term history.
      const LAUNCH_WINDOW_END_MS = (PULSECHAIN_LAUNCH_TS + 90 * 86_400) * 1000;
      const oldestBarTime = subgraphBars.length > 0 ? subgraphBars[0].time : Infinity;
      if (subgraphBars.length >= 3 && oldestBarTime <= LAUNCH_WINDOW_END_MS) {
        // Aggregate daily bars into weekly bars so charts display in weekly time frames.
        const weeklyBars = aggregateDailyToWeekly(subgraphBars);
        return { bars: weeklyBars, resolution: 'W' };
      }
    }

    // ── Helper: normalise a bars array from the DexScreener chart response ─
    function normaliseDsxBars(rawBars) {
      return rawBars
        .map(b => ({
          time:   b.time   ?? b.t ?? 0,
          open:   b.open   ?? b.o ?? 0,
          high:   b.high   ?? b.h ?? 0,
          low:    b.low    ?? b.l ?? 0,
          close:  b.close  ?? b.c ?? 0,
          volume: b.volume ?? b.v ?? 0,
        }))
        .filter(b => b.time > 0);
    }

    // Build DexScreener chart URL — request all history from PulseChain launch.
    // Use the caller-supplied resolution; fall back to 'W' (weekly) if not
    // specified since weekly bars maximise the time span per API call.
    const res = resolution || 'W';
    const dsxParams = `?res=${res}&from=${PULSECHAIN_LAUNCH_TS}&cb=0`;

    // ── 2. DexScreener amm/v2 (PulseX V1 = Uniswap V2 fork) ─────────────
    try {
      const data = await fetchJSON(`${DSX_CHART_BASE_V2}/${pairAddress}${dsxParams}`, 10000);
      const bars = normaliseDsxBars(data?.bars || []);
      if (bars.length >= 2) return { bars, resolution: res };
    } catch { /* fall through */ }

    // ── 3. DexScreener amm/v3 (concentrated-liquidity fallback) ──────────
    try {
      const data = await fetchJSON(`${DSX_CHART_BASE_V3}/${pairAddress}${dsxParams}`, 10000);
      const bars = normaliseDsxBars(data?.bars || []);
      if (bars.length > 0) return { bars, resolution: res };
    } catch { /* fall through */ }

    return { bars: [], resolution: res };
  }

  /**
   * Fetch the weekly chart snapshot from the server for PLSX, HEX, INC, and PRVX.
   * Returns a map of symbol → weekly bar array, or an empty map on failure.
   * @returns {Promise<Map<string, object[]>>}
   */
  async function fetchChartSnapshots() {
    try {
      const data = await fetchJSON('/api/chart-snapshots', 10000);
      const result = new Map();
      if (data && data.coins) {
        for (const [symbol, bars] of Object.entries(data.coins)) {
          result.set(symbol, Array.isArray(bars) ? bars : []);
        }
      }
      return result;
    } catch (err) {
      console.warn('[PulseCentral] fetchChartSnapshots failed:', err.message);
      return new Map();
    }
  }

  /**
   * Fetch live pair data for the 6 core coins shown on the Home landing page
   * using the exact pair contract addresses defined in CORE_COINS.
   * - PLS gets live OHLCV chart bars fetched from DexScreener / subgraph.
   * - PLSX, HEX, INC, PRVX use the server-side weekly snapshot (taken each Monday).
   * Returns an array of { symbol, pair, chartBars, chartRes, color } objects
   * in the order defined by CORE_COINS. `pair` is null when unavailable.
   * @returns {Promise<Array<{symbol:string, pair:object|null, chartBars:object[], chartRes:string, color:string}>>}
   */
  async function getCoreCoinPairs() {
    const pairAddresses = CORE_COINS.map(c => c.pairAddress).filter(Boolean);
    const url = `${DSX_BASE}/pairs/pulsechain/${pairAddresses.join(',')}`;

    const plsCoin = CORE_COINS.find(c => c.symbol === 'PLS' || c.symbol === 'WPLS');

    // Fetch live price data, the weekly snapshot, and PLS live chart bars in parallel.
    const [pairData, snapshots, plsChart] = await Promise.all([
      fetchJSON(url).catch(err => { console.warn('[PulseCentral] getCoreCoinPairs failed:', err); return {}; }),
      fetchChartSnapshots(),
      plsCoin
        ? getCoreCoinChartBars(plsCoin.pairAddress, plsCoin.chartRes, plsCoin.address)
        : Promise.resolve({ bars: [], resolution: 'W' }),
    ]);

    // For non-PLS coins whose snapshot has fewer than 3 bars (e.g. the snapshot
    // failed to build because the subgraph was unavailable), fall back to fetching
    // live chart data directly so charts always show full history.
    const coinsNeedingLive = CORE_COINS.filter(c => {
      const isPls = c.symbol === 'PLS' || c.symbol === 'WPLS';
      if (isPls) return false;
      return (snapshots.get(c.symbol) || []).length < 3;
    });

    const liveChartEntries = await Promise.all(
      coinsNeedingLive.map(c =>
        getCoreCoinChartBars(c.pairAddress, c.chartRes, c.address)
          .catch(() => ({ bars: [], resolution: 'W' }))
          .then(result => [c.symbol, result])
      )
    );
    const liveChartMap = new Map(liveChartEntries);

    const pairsById = new Map();
    for (const pair of (pairData.pairs || [])) {
      if (pair.pairAddress) {
        pairsById.set(pair.pairAddress.toLowerCase(), pair);
      }
    }

    return CORE_COINS.map(coin => {
      const isPls = coin.symbol === 'PLS' || coin.symbol === 'WPLS';
      let bars, resolution;
      if (isPls) {
        bars       = plsChart.bars;
        resolution = plsChart.resolution;
      } else {
        const snapshotBars = snapshots.get(coin.symbol) || [];
        if (snapshotBars.length >= 3) {
          bars       = snapshotBars;
          resolution = 'W';
        } else {
          // Snapshot insufficient — use live chart data fetched above
          const live = liveChartMap.get(coin.symbol) || { bars: [], resolution: 'W' };
          bars       = live.bars;
          resolution = live.resolution;
        }
      }
      return {
        symbol:       coin.symbol,
        address:      coin.address,
        pair:         pairsById.get(coin.pairAddress.toLowerCase()) || null,
        chartBars:    bars,
        chartRes:     resolution,
        color:        coin.color,
        hideFromHome: coin.hideFromHome || false,
      };
    });
  }

  /* ── Enhanced Market Data API ───────────────────────────── */

  /**
   * Fetch token security information from GoPlus Security API.
   * PulseChain chain ID is 369.
   * Returns null when the token is not found or on network error.
   * @param {string} address  Token contract address (0x-prefixed)
   * @returns {Promise<object|null>}
   */
  async function getTokenSecurity(address) {
    const addr = address.toLowerCase();
    const url = `/api/goplus/api/v1/token_security/369?contract_addresses=${addr}`;
    try {
      const data = await fetchJSON(url, 12000);
      if (data.code !== 1) return null;
      return data.result?.[addr] || null;
    } catch {
      return null;
    }
  }

  /**
   * Fetch token metadata (holder count, total supply, token type) from the
   * PulseChain Scan BlockScout v2 REST API.
   * Returns null on error.
   * @param {string} address  Token contract address (0x-prefixed)
   * @returns {Promise<object|null>}
   */
  async function getTokenMetadata(address) {
    const url = `/api/scan-v2/tokens/${address}`;
    try {
      const data = await fetchJSON(url, 12000);
      return data || null;
    } catch {
      return null;
    }
  }

  /**
   * Fetch recent transfer events for a specific token contract from the
   * PulseChain Scan BlockScout v2 REST API.
   * Used by the Whale Tracker to surface large token movements.
   * @param {string} address  Token contract address (0x-prefixed)
   * @returns {Promise<object[]>}  Array of BlockScout transfer objects
   */
  async function getTokenTransferHistory(address) {
    const url = `/api/scan-v2/tokens/${address}/transfers?limit=50`;
    try {
      const data = await fetchJSON(url, 12000);
      return data?.items || [];
    } catch {
      return [];
    }
  }

  /**
   * Fetch the total supply of an ERC-20 token (raw on-chain value as a string).
   * Uses the PulseChain Scan BlockScout v1 stats endpoint.
   * Returns null on error or when the token is not found.
   * @param {string} contractAddress  Token contract address (0x-prefixed)
   * @returns {Promise<string|null>}  Raw total supply string, e.g. "1000000000000000000000000"
   */
  async function getTotalSupply(contractAddress) {
    const url = `${SCAN_BASE}?module=stats&action=tokensupply&contractaddress=${contractAddress}`;
    try {
      const data = await fetchJSON(url, 10000);
      if (data.status !== '1' || !data.result) return null;
      return data.result;
    } catch {
      return null;
    }
  }

  /* ── Public API ─────────────────────────────────────────── */
  return {
    getPlsBalance,
    getTokenList,
    getPairsByAddresses,
    getTopPulsechainPairs,
    getTrendingPairs,
    getKnownTokenPairs,
    getCoreCoinPairs,
    parseWalletTrades,
    getTokenSecurity,
    getTokenMetadata,
    getTokenTransferHistory,
    getTotalSupply,
    KNOWN_TOKENS,
    CORE_COINS,
  };
})();
