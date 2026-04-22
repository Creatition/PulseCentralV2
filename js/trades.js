/**
 * PulseCentral – trades.js
 * Trade log CRUD (localStorage) and FIFO profit/loss engine.
 */

/* ── TradesDB ────────────────────────────────────────────── */

/**
 * Persistent store for trade records.
 * localStorage key: 'pc-trades'
 * Shape: { trades: TradeRecord[] }
 *
 * TradeRecord: {
 *   id              string   — unique id
 *   type            'buy'|'sell'
 *   tokenAddress    string   — lowercase 0x address
 *   tokenSymbol     string
 *   tokenName       string
 *   date            string   — ISO-8601 UTC
 *   tokenAmount     number   — token units traded
 *   plsAmount       number   — PLS spent (buy) or received (sell)
 *   usdValue        number   — USD value at trade time (optional, 0 if unknown)
 *   pricePerTokenPls number  — derived: plsAmount / tokenAmount
 *   notes           string
 * }
 */
const TradesDB = (() => {
  const KEY = 'pc-trades';

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        return { trades: Array.isArray(parsed.trades) ? parsed.trades : [] };
      }
    } catch { /* ignore corrupt data */ }
    return { trades: [] };
  }

  function save(data) {
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { /* ignore */ }
  }

  let _idCounter = 0;
  function generateId() {
    return Date.now().toString(36) + (++_idCounter).toString(36) + Math.random().toString(36).slice(2, 5);
  }

  function getTrades() {
    return load().trades;
  }

  function addTrade(trade) {
    const data = load();
    const newTrade = { ...trade, id: generateId() };
    data.trades.push(newTrade);
    save(data);
    return newTrade;
  }

  function editTrade(id, updates) {
    const data = load();
    const idx = data.trades.findIndex(t => t.id === id);
    if (idx === -1) return false;
    data.trades[idx] = { ...data.trades[idx], ...updates, id };
    save(data);
    return true;
  }

  function deleteTrade(id) {
    const data = load();
    data.trades = data.trades.filter(t => t.id !== id);
    save(data);
  }

  /**
   * Return a Set of all txHash values already present in the trade log.
   * Used for duplicate detection during wallet import.
   * @returns {Set<string>}
   */
  function getImportedTxHashes() {
    return new Set(
      load().trades
        .map(t => t.txHash)
        .filter(Boolean)
    );
  }

  return { getTrades, addTrade, editTrade, deleteTrade, getImportedTxHashes };
})();

/* ── FIFO P&L engine ─────────────────────────────────────── */

/**
 * Compute realized and unrealized P&L for all trades using FIFO cost basis.
 *
 * Example (from the spec):
 *   Buy  3,000,000 PLS worth of PLSX  ($20 USD)
 *   Sell 5,000,000 PLS worth of PLSX  ($35 USD)
 *   → realizedPls = +2,000,000   realizedUsd = +$15
 *
 * @param {object[]} trades        All trade records from TradesDB.getTrades()
 * @param {Map<string,object>} livePriceMap  Map<lowercaseAddress, DexScreener pair>
 * @returns {{ summary: object, byToken: object[] }}
 */
function computeProfits(trades, livePriceMap) {
  // Group trades by token address
  const grouped = new Map();
  for (const trade of trades) {
    const addr = (trade.tokenAddress || '').toLowerCase();
    if (!addr) continue;
    if (!grouped.has(addr)) {
      grouped.set(addr, {
        tokenAddress: addr,
        tokenSymbol:  trade.tokenSymbol || '',
        tokenName:    trade.tokenName   || '',
        trades: [],
      });
    }
    grouped.get(addr).trades.push(trade);
  }

  let totalRealizedUsd   = 0;
  let totalRealizedPls   = 0;
  let totalUnrealizedUsd = 0;
  const byToken = [];

  for (const [addr, info] of grouped) {
    // Sort by date ascending for correct FIFO ordering
    const sorted = [...info.trades].sort((a, b) => new Date(a.date) - new Date(b.date));

    // FIFO buy queue: each lot tracks remaining token units + per-unit costs
    const buyQueue = [];

    let totalBuyPls    = 0, totalBuyUsd    = 0, totalBuyTokens    = 0;
    let totalSellPls   = 0, totalSellUsd   = 0, totalSellTokens   = 0;
    let realizedPls    = 0, realizedUsd    = 0;

    for (const trade of sorted) {
      const tokenAmt = Number(trade.tokenAmount) || 0;
      const plsAmt   = Number(trade.plsAmount)   || 0;
      const usdVal   = Number(trade.usdValue)     || 0;

      if (trade.type === 'buy') {
        totalBuyPls    += plsAmt;
        totalBuyUsd    += usdVal;
        totalBuyTokens += tokenAmt;
        buyQueue.push({
          remaining:    tokenAmt,
          plsPerToken:  tokenAmt > 0 ? plsAmt / tokenAmt : 0,
          usdPerToken:  tokenAmt > 0 ? usdVal / tokenAmt : 0,
        });
      } else {
        // sell — FIFO-match against oldest buy lots
        totalSellPls    += plsAmt;
        totalSellUsd    += usdVal;
        totalSellTokens += tokenAmt;

        const sellPlsPerToken = tokenAmt > 0 ? plsAmt / tokenAmt : 0;
        const sellUsdPerToken = tokenAmt > 0 ? usdVal / tokenAmt : 0;

        let toMatch = tokenAmt;
        while (toMatch > 0 && buyQueue.length > 0) {
          const lot     = buyQueue[0];
          const matched = Math.min(lot.remaining, toMatch);
          realizedPls  += matched * (sellPlsPerToken - lot.plsPerToken);
          realizedUsd  += matched * (sellUsdPerToken - lot.usdPerToken);
          lot.remaining -= matched;
          toMatch       -= matched;
          if (lot.remaining <= 0) buyQueue.shift();
        }
      }
    }

    // Remaining unsold tokens (sum of all un-matched buy lots)
    const remainingTokens = buyQueue.reduce((s, l) => s + l.remaining, 0);

    // Weighted-average cost basis of remaining tokens
    let avgCostUsd = 0, avgCostPls = 0;
    if (remainingTokens > 0) {
      avgCostUsd = buyQueue.reduce((s, l) => s + l.remaining * l.usdPerToken, 0) / remainingTokens;
      avgCostPls = buyQueue.reduce((s, l) => s + l.remaining * l.plsPerToken, 0) / remainingTokens;
    }

    // Unrealized P&L uses live DexScreener price
    const livePair      = livePriceMap.get(addr);
    const livePrice     = Number(livePair?.priceUsd || 0);
    const unrealizedUsd = remainingTokens > 0 && livePrice > 0
      ? remainingTokens * (livePrice - avgCostUsd)
      : 0;

    // Overall return %: (realized + unrealized) / total invested in USD
    const returnPct = totalBuyUsd > 0
      ? ((realizedUsd + unrealizedUsd) / totalBuyUsd) * 100
      : 0;

    totalRealizedUsd   += realizedUsd;
    totalRealizedPls   += realizedPls;
    totalUnrealizedUsd += unrealizedUsd;

    byToken.push({
      tokenAddress:   addr,
      tokenSymbol:    info.tokenSymbol,
      tokenName:      info.tokenName,
      totalBuyPls,    totalBuyUsd,
      totalSellPls,   totalSellUsd,
      realizedUsd,    realizedPls,
      remainingTokens,
      avgCostUsd,     avgCostPls,
      unrealizedUsd,  livePrice,
      returnPct,
      tradeCount:     info.trades.length,
    });
  }

  return {
    summary: {
      totalRealizedUsd,
      totalRealizedPls,
      totalUnrealizedUsd,
      tokenCount: byToken.length,
    },
    byToken,
  };
}
