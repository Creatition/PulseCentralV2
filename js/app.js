/**
 * PulseCentral – app.js
 * Complete UI layer for all tabs.
 */

/* ══════════════════════════════════════════════════════
   UTILITIES & FORMATTERS
   ══════════════════════════════════════════════════════ */

const $ = id => document.getElementById(id);
const qs = (sel, ctx = document) => ctx.querySelector(sel);
const hide = el => el && el.classList.add('hidden');
const show = el => el && el.classList.remove('hidden');
const isValidAddr = a => /^0x[0-9a-fA-F]{40}$/.test(a);

const SUBSCRIPT = '₀₁₂₃₄₅₆₇₈₉';

const fmt = {
  price(v) {
    const n = Number(v);
    if (!n || isNaN(n)) return '—';
    if (n >= 1000) return '$' + n.toLocaleString('en-US', { maximumFractionDigits: 2 });
    if (n >= 1)    return '$' + n.toFixed(4);
    if (n >= 0.001) return '$' + n.toFixed(6);
    const exp = Math.floor(Math.log10(n));
    const sub = Math.abs(exp) - 2;
    const mantissa = n.toExponential(3).split('e')[0].replace('.', '').replace(/0+$/, '') || '0';
    const subscript = String(sub).split('').map(d => SUBSCRIPT[+d]).join('');
    return '$0.0' + subscript + mantissa;
  },
  usd(v) {
    const n = Number(v);
    if (isNaN(n)) return '—';
    return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  },
  large(v) {
    const n = Number(v);
    if (!n || isNaN(n)) return '—';
    if (n >= 1e9) return '$' + (n/1e9).toFixed(2) + 'B';
    if (n >= 1e6) return '$' + (n/1e6).toFixed(2) + 'M';
    if (n >= 1e3) return '$' + (n/1e3).toFixed(2) + 'K';
    return '$' + n.toFixed(2);
  },
  compact(v) {
    const n = Number(v);
    if (!n || isNaN(n)) return '—';
    if (n >= 1e9) return (n/1e9).toFixed(2) + 'B';
    if (n >= 1e6) return (n/1e6).toFixed(2) + 'M';
    if (n >= 1e3) return (n/1e3).toFixed(1) + 'K';
    return n.toLocaleString('en-US', { maximumFractionDigits: 0 });
  },
  pls(v) {
    const n = Number(v);
    if (!n || isNaN(n)) return '—';
    if (n >= 1e9) return (n/1e9).toFixed(2) + 'B PLS';
    if (n >= 1e6) return (n/1e6).toFixed(2) + 'M PLS';
    if (n >= 1e3) return n.toLocaleString('en-US', { maximumFractionDigits: 0 }) + ' PLS';
    return n.toFixed(2) + ' PLS';
  },
  balance(v) {
    const n = Number(v);
    if (!n || isNaN(n)) return '0';
    if (n >= 1000)  return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
    if (n >= 1)     return n.toFixed(4);
    if (n >= 0.001) return n.toFixed(6);
    return n.toExponential(4);
  },
  change(v) {
    const n = Number(v);
    if (isNaN(n)) return { text: '—', cls: 'neu' };
    return {
      text: (n >= 0 ? '+' : '') + n.toFixed(2) + '%',
      cls:  n > 0 ? 'up' : n < 0 ? 'down' : 'neu',
    };
  },
  signedUsd(v) {
    const n = Number(v);
    if (isNaN(n)) return '—';
    return (n >= 0 ? '+$' : '-$') + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  },
};

function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

/* ══════════════════════════════════════════════════════
   TOKEN LOGO ELEMENT
   ══════════════════════════════════════════════════════ */

function buildLogo(primaryUrl, addr, symbol, size = '') {
  const urls = [];
  if (primaryUrl) urls.push(primaryUrl);
  if (addr) {
    const l = addr.toLowerCase();
    urls.push(`https://dd.dexscreener.com/ds-data/tokens/pulsechain/${l}.png`);
    urls.push(`https://scan.pulsechain.com/token-images/${l}.png`);
  }

  if (!urls.length) return buildLogoPh(symbol, size);

  const img = document.createElement('img');
  img.alt = symbol || '';
  img.className = `logo-img${size ? ' ' + size : ''}`;
  let idx = 0;
  const tryNext = () => {
    if (idx < urls.length) { img.src = urls[idx++]; }
    else { img.replaceWith(buildLogoPh(symbol, size)); }
  };
  img.onerror = tryNext;
  tryNext();
  return img;
}

function buildLogoPh(symbol, size = '') {
  const div = document.createElement('div');
  div.className = `logo-ph${size ? ' ' + size : ''}`;
  div.textContent = (symbol || '?').slice(0, 3).toUpperCase();
  return div;
}

/* ══════════════════════════════════════════════════════
   CHART SVG BUILDER
   ══════════════════════════════════════════════════════ */

function buildChartSvg(bars, color = '#7b2fff') {
  const W = 600, H = 110, pad = 8, labelW = 52;
  if (!bars || bars.length < 2) return null;

  const prices = bars.map(b => b.close).filter(v => v > 0);
  if (prices.length < 2) return null;

  const minP  = Math.min(...prices);
  const maxP  = Math.max(...prices);
  const range = maxP - minP || maxP * 0.05 || 1;
  const curP  = prices[prices.length - 1];
  const chartW = W - labelW - pad;

  const pts = prices.map((p, i) => [
    pad + (i / (prices.length - 1)) * chartW,
    pad + ((maxP - p) / range) * (H - pad * 2 - 14),
  ]);

  const linePath = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const areaPath = `${linePath} L${(pad + chartW).toFixed(1)},${H - 14} L${pad},${H - 14} Z`;
  const gid = 'g' + Math.random().toString(36).slice(2, 7);

  // Format price for label (compact)
  function fmtLabel(v) {
    if (v >= 1000) return '$' + (v/1000).toFixed(1) + 'K';
    if (v >= 1)    return '$' + v.toFixed(3);
    if (v >= 0.001) return '$' + v.toFixed(5);
    const exp = Math.floor(Math.log10(v));
    return '$' + v.toExponential(2);
  }

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  svg.className = 'coin-chart-svg';

  const curY = pts[pts.length - 1][1];
  const isUp = curP >= prices[0];
  const changeColor = isUp ? '#00e676' : '#ff5252';

  svg.innerHTML = `
    <defs>
      <linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${color}" stop-opacity="0.3"/>
        <stop offset="100%" stop-color="${color}" stop-opacity="0"/>
      </linearGradient>
    </defs>
    <path d="${areaPath}" fill="url(#${gid})"/>
    <path d="${linePath}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <!-- Current price label on right -->
    <line x1="${(pad + chartW).toFixed(1)}" y1="${curY.toFixed(1)}" x2="${(pad + chartW + 4).toFixed(1)}" y2="${curY.toFixed(1)}" stroke="${changeColor}" stroke-width="1" stroke-dasharray="2,2"/>
    <rect x="${(pad + chartW + 4).toFixed(1)}" y="${Math.max(4, curY - 8).toFixed(1)}" width="${labelW - 6}" height="14" rx="3" fill="${changeColor}" opacity="0.15"/>
    <text x="${(pad + chartW + labelW/2 + 1).toFixed(1)}" y="${Math.max(14, curY + 3).toFixed(1)}" text-anchor="middle" font-size="8.5" font-family="monospace" fill="${changeColor}" font-weight="700">${fmtLabel(curP)}</text>
    <!-- High label -->
    <text x="${(pad + chartW + labelW/2 + 1).toFixed(1)}" y="10" text-anchor="middle" font-size="7.5" font-family="monospace" fill="#888">${fmtLabel(maxP)}</text>
    <!-- Low label -->
    <text x="${(pad + chartW + labelW/2 + 1).toFixed(1)}" y="${H - 16}" text-anchor="middle" font-size="7.5" font-family="monospace" fill="#888">${fmtLabel(minP)}</text>`;

  return svg;
}

function dateLabel(bars) {
  if (!bars || bars.length < 2) return '';
  const fmt = ts => new Date(ts).toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
  return `${fmt(bars[0].time)} – ${fmt(bars[bars.length - 1].time)}`;
}

function filterBars(bars, days) {
  if (!bars || days >= 9999) return bars || [];
  const cutoff = Date.now() - days * 86_400_000;
  return bars.filter(b => b.time >= cutoff);
}

/* ══════════════════════════════════════════════════════
   THEME
   ══════════════════════════════════════════════════════ */

const THEMES = ['pulsechain', 'hex', 'pulsex', 'inc'];

function applyTheme(name) {
  if (!THEMES.includes(name)) name = 'pulsechain';
  document.documentElement.dataset.theme = name;
  try { localStorage.setItem('pc-theme', name); } catch {}
  document.querySelectorAll('.theme-swatch').forEach(b => b.classList.toggle('active', b.dataset.theme === name));
}

(function () {
  let t = 'pulsechain';
  try { t = localStorage.getItem('pc-theme') || 'pulsechain'; } catch {}
  applyTheme(t);
})();

document.querySelectorAll('.theme-swatch').forEach(b => b.addEventListener('click', () => applyTheme(b.dataset.theme)));

/* ══════════════════════════════════════════════════════
   WATCHLIST STORAGE
   ══════════════════════════════════════════════════════ */

const Watchlist = (() => {
  const KEY = 'pc-watchlist';
  const load = () => {
    try {
      const r = JSON.parse(localStorage.getItem(KEY) || '{}');
      let wallets = Array.isArray(r.wallets) ? r.wallets : [];
      wallets = wallets.map(w => typeof w === 'string' ? { addr: w, name: '' } : w);
      return { wallets, tokens: Array.isArray(r.tokens) ? r.tokens : [] };
    } catch { return { wallets: [], tokens: [] }; }
  };
  const save = d => { try { localStorage.setItem(KEY, JSON.stringify(d)); } catch {} };

  return {
    getWallets() { return load().wallets; },
    getTokens()  { return load().tokens; },
    hasWallet(a) { return load().wallets.some(w => w.addr.toLowerCase() === a.toLowerCase()); },
    hasToken(a)  { return load().tokens.some(t => t.address.toLowerCase() === a.toLowerCase()); },
    addWallet(a, n = '') { const d = load(); if (!d.wallets.find(w => w.addr.toLowerCase() === a.toLowerCase())) { d.wallets.push({ addr: a, name: n }); save(d); } },
    removeWallet(a) { const d = load(); d.wallets = d.wallets.filter(w => w.addr.toLowerCase() !== a.toLowerCase()); save(d); },
    getWalletName(a) { return load().wallets.find(w => w.addr.toLowerCase() === a.toLowerCase())?.name || ''; },
    updateWalletName(a, n) { const d = load(); const w = d.wallets.find(w => w.addr.toLowerCase() === a.toLowerCase()); if (w) { w.name = n; save(d); } },
    addToken(t) { const d = load(); if (!d.tokens.find(x => x.address.toLowerCase() === t.address.toLowerCase())) { d.tokens.push({ ...t, address: t.address.toLowerCase() }); save(d); } },
    removeToken(a) { const d = load(); d.tokens = d.tokens.filter(t => t.address.toLowerCase() !== a.toLowerCase()); save(d); },
    moveToken(a, dir) {
      const d = load(); const idx = d.tokens.findIndex(t => t.address.toLowerCase() === a.toLowerCase());
      if (idx === -1) return;
      const ni = dir === 'up' ? idx - 1 : idx + 1;
      if (ni < 0 || ni >= d.tokens.length) return;
      [d.tokens[idx], d.tokens[ni]] = [d.tokens[ni], d.tokens[idx]];
      save(d);
    },
  };
})();

/* ══════════════════════════════════════════════════════
   PORTFOLIO GROUPS
   ══════════════════════════════════════════════════════ */

const Groups = (() => {
  const KEY = 'pc-groups';
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; } };
  const save = d => { try { localStorage.setItem(KEY, JSON.stringify(d)); } catch {} };
  return {
    getAll()     { return load(); },
    get(id)      { return load().find(g => g.id === id) || null; },
    add(name, addresses) { const g = load(); const id = crypto.randomUUID(); g.push({ id, name, addresses }); save(g); return id; },
    update(id, name, addresses) { const g = load(); const i = g.findIndex(x => x.id === id); if (i !== -1) { g[i] = { id, name, addresses }; save(g); } },
    remove(id)   { save(load().filter(g => g.id !== id)); },
  };
})();

/* ══════════════════════════════════════════════════════
   PORTFOLIO HISTORY
   ══════════════════════════════════════════════════════ */

const History = (() => {
  const KEY = 'pc-history';
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; } };
  const save = d => { try { localStorage.setItem(KEY, JSON.stringify(d)); } catch {} };
  return {
    add(key, usd, pls) {
      const d = load();
      const today = new Date().toISOString().slice(0, 10);
      if (!d[key]) d[key] = [];
      d[key] = d[key].filter(s => s.date !== today);
      d[key].push({ date: today, usd, pls });
      d[key].sort((a, b) => a.date.localeCompare(b.date));
      if (d[key].length > 3650) d[key] = d[key].slice(-3650);
      save(d);
    },
    get(key)    { return (load()[key] || []).slice(); },
    clear(key)  { const d = load(); delete d[key]; save(d); },
  };
})();

/* ══════════════════════════════════════════════════════
   PRICE ALERTS
   ══════════════════════════════════════════════════════ */

const Alerts = (() => {
  const KEY = 'pc-alerts';
  let list = [];
  let unread = 0;
  const fired = new Map();
  const COOLDOWN = 10 * 60_000;
  const THRESH   = 10;

  try { list = JSON.parse(localStorage.getItem(KEY) || '[]'); } catch {}
  const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(list)); } catch {} };

  return {
    check(symbol, name, h6) {
      if (h6 < THRESH) return;
      const now = Date.now();
      if (fired.has(symbol) && now - fired.get(symbol) < COOLDOWN) return;
      fired.set(symbol, now);
      list.unshift({ symbol, name, change: h6, time: now });
      if (list.length > 50) list = list.slice(0, 50);
      unread++;
      persist();
      renderBellBadge();
    },
    getAll()   { return list; },
    getUnread(){ return unread; },
    markRead() { unread = 0; renderBellBadge(); },
    clear()    { list = []; unread = 0; persist(); renderBellBadge(); },
    remove(i)  { list.splice(i, 1); persist(); },
  };
})();

/* ══════════════════════════════════════════════════════
   TAB NAVIGATION
   ══════════════════════════════════════════════════════ */

// Exclude the markets dropdown-trigger from the generic tab listener
const tabs = document.querySelectorAll('.tab-btn:not(.modal-tab-btn):not(.has-dropdown)');
const panels = document.querySelectorAll('.tab-panel');
let activeTab = 'home';

function switchTab(name) {
  activeTab = name;
  // Highlight correct nav button (including the has-dropdown one for markets)
  document.querySelectorAll('.tab-btn:not(.modal-tab-btn)').forEach(b => {
    const a = b.dataset.tab === name;
    b.classList.toggle('active', a);
    b.setAttribute('aria-selected', a);
  });
  panels.forEach(p => p.classList.toggle('active', p.id === `tab-${name}`));

  if (name === 'home')      loadHome();
  if (name === 'markets')   loadMarkets();
  if (name === 'portfolio') initPortfolioTab();
  if (name === 'watchlist') loadWatchlistTab();
  if (name === 'swap')      initSwap();
  if (name === 'trades')    renderTradeLog();
  if (name === 'ecosystem') loadEcosystem();
  if (name === 'links')     {}  // static
}

// Wire up all non-dropdown tabs normally
tabs.forEach(b => b.addEventListener('click', () => switchTab(b.dataset.tab)));
qs('.logo-link')?.addEventListener('click', () => switchTab('home'));

// Markets dropdown — handled separately so it doesn't conflict
const marketsDropWrap = document.querySelector('.tab-dropdown-wrap');
const marketsDropMenu = document.getElementById('markets-dropdown');
const marketsBtn      = marketsDropWrap?.querySelector('.tab-btn.has-dropdown');

if (marketsBtn && marketsDropMenu) {
  marketsBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    // Switch to markets tab
    switchTab('markets');
    // Toggle the dropdown open/closed
    const isOpen = marketsDropMenu.classList.contains('open');
    marketsDropMenu.classList.toggle('open', !isOpen);
  });

  // Clicking a dropdown item closes the menu
  marketsDropMenu.addEventListener('click', e => e.stopPropagation());

  // Clicking anywhere else closes it
  document.addEventListener('click', () => marketsDropMenu.classList.remove('open'));
}

let activeMarketsSubtab = 'pulsechain';
function switchMarketsSubtab(subtab) {
  activeMarketsSubtab = subtab;
  document.querySelectorAll('.markets-subtab').forEach(el => {
    el.classList.toggle('hidden', el.id !== `markets-sub-${subtab}`);
    el.classList.toggle('active-subtab', el.id === `markets-sub-${subtab}`);
  });
  document.querySelectorAll('.tab-dropdown-item').forEach(btn => {
    btn.classList.toggle('active-sub', btn.dataset.subtab === subtab);
  });
  if (marketsDropMenu) marketsDropMenu.classList.remove('open');
  if (subtab === 'crypto100')   loadCrypto100();
  if (subtab === 'commodities') loadCommodities();
}
window.switchMarketsSubtab = switchMarketsSubtab;

/* ══════════════════════════════════════════════════════
   TICKER BAR
   ══════════════════════════════════════════════════════ */

let tickerMode   = 'trending';
let tickerTimer  = null;
let tickerDur    = 60;

function buildTickerItem(pair, rank) {
  const symbol  = pair.baseToken?.symbol || '?';
  const price   = Number(pair.priceUsd || 0);
  const { text, cls } = fmt.change(Number(pair.priceChange?.h24 || 0));
  const pairAddr = pair.pairAddress || '';
  const tokenAddr = pair.baseToken?.address || '';
  const logoUrl  = API.logoUrl(pair, tokenAddr);

  const a = document.createElement('a');
  a.className = 'ticker-item';
  a.href = pairAddr ? `https://dexscreener.com/pulsechain/${pairAddr}` : '#';
  a.target = '_blank'; a.rel = 'noopener noreferrer';
  a.title = `${symbol} ${text}`;

  if (rank) {
    const r = document.createElement('span');
    r.className = 'ticker-rank';
    r.textContent = `#${rank}`;
    a.appendChild(r);
  }

  // Build logo properly — try image first, fallback to placeholder
  const logoWrap = document.createElement('span');
  logoWrap.className = 'ticker-logo-wrap';

  const urls = [];
  if (logoUrl) urls.push(logoUrl);
  if (tokenAddr) {
    const l = tokenAddr.toLowerCase();
    urls.push(`https://dd.dexscreener.com/ds-data/tokens/pulsechain/${l}.png`);
    urls.push(`https://scan.pulsechain.com/token-images/${l}.png`);
  }

  if (urls.length > 0) {
    const img = document.createElement('img');
    img.alt = symbol;
    img.className = 'ticker-logo-img';
    let idx = 0;
    const tryNext = () => {
      if (idx < urls.length) { img.src = urls[idx++]; }
      else {
        const ph = document.createElement('span');
        ph.className = 'ticker-logo-ph';
        ph.textContent = symbol.slice(0, 2);
        logoWrap.replaceWith(ph);
      }
    };
    img.onerror = tryNext;
    tryNext();
    logoWrap.appendChild(img);
  } else {
    logoWrap.className = 'ticker-logo-ph';
    logoWrap.textContent = symbol.slice(0, 2);
  }
  a.appendChild(logoWrap);

  const sym = document.createElement('span');
  sym.className = 'ticker-sym';
  sym.textContent = symbol;

  const priceEl = document.createElement('span');
  priceEl.style.fontFamily = 'var(--mono)';
  priceEl.style.fontSize = '.75rem';
  priceEl.textContent = price ? fmt.price(price) : '—';

  const chg = document.createElement('span');
  chg.className = cls;
  chg.style.fontSize = '.72rem';
  chg.textContent = text;

  a.append(sym, priceEl, chg);
  return a;
}

function renderTicker(pairs) {
  const track = $('ticker-track');
  if (!track) return;
  track.style.animation = 'none';
  track.innerHTML = '';

  const items = pairs.slice(0, 25);
  if (!items.length) {
    const m = document.createElement('span');
    m.className = 'ticker-msg';
    m.textContent = 'Loading…';
    track.appendChild(m);
    return;
  }

  const frag = document.createDocumentFragment();
  for (let pass = 0; pass < 2; pass++) {
    items.forEach((p, i) => frag.appendChild(buildTickerItem(p, pass === 0 ? i + 1 : 0)));
  }
  track.appendChild(frag);

  requestAnimationFrame(() => {
    const w = track.scrollWidth / 2;
    const spd = w / 120;
    tickerDur = spd;
    void track.offsetWidth;
    track.style.animation = `ticker-scroll ${spd}s linear infinite`;
  });
}

async function loadTicker() {
  try {
    const pairs = await API.getTrendingPairs();
    renderTicker(pairs.filter(p => (p.marketCap || p.fdv || 0) >= 5000));
  } catch (e) { console.warn('Ticker failed:', e); }
}

async function loadWatchlistTicker() {
  const tokens = Watchlist.getTokens();
  const track  = $('ticker-track');
  if (!track) return;
  if (!tokens.length) {
    track.style.animation = 'none';
    track.innerHTML = '<span class="ticker-msg">No tokens in watchlist</span>';
    return;
  }
  try {
    const map   = await API.getPairsByAddresses(tokens.map(t => t.address));
    const pairs = tokens.map(t => map.get(t.address.toLowerCase()) || { baseToken: { symbol: t.symbol, address: t.address }, priceUsd: 0, priceChange: {}, info: { imageUrl: t.logoUrl } });
    renderTicker(pairs);
  } catch { }
}

$('ticker-mode-btn')?.addEventListener('click', () => {
  tickerMode = tickerMode === 'trending' ? 'watchlist' : 'trending';
  const icon = $('ticker-mode-icon');
  const text = $('ticker-mode-text');
  if (icon) icon.textContent = tickerMode === 'watchlist' ? '⭐' : '🔥';
  if (text) text.textContent = tickerMode === 'watchlist' ? 'Watchlist' : 'Trending';
  clearInterval(tickerTimer);
  if (tickerMode === 'watchlist') { loadWatchlistTicker(); tickerTimer = setInterval(loadWatchlistTicker, 5 * 60_000); }
  else { loadTicker(); tickerTimer = setInterval(loadTicker, 5 * 60_000); }
});

loadTicker();
tickerTimer = setInterval(loadTicker, 5 * 60_000);

/* ══════════════════════════════════════════════════════
   BELL / PRICE ALERTS
   ══════════════════════════════════════════════════════ */

function renderBellBadge() {
  const n = Alerts.getUnread();
  const badge = $('bell-badge');
  if (!badge) return;
  if (n > 0) { badge.textContent = n > 99 ? '99+' : n; show(badge); }
  else hide(badge);
}

function renderAlertsDropdown() {
  const list = $('alerts-list');
  if (!list) return;
  list.innerHTML = '';
  const all = Alerts.getAll();
  if (!all.length) { list.innerHTML = '<div class="alerts-empty">No alerts yet. Tokens up +10% in 6h appear here.</div>'; return; }
  all.forEach(({ symbol, name, change, time }, i) => {
    const item = document.createElement('div');
    item.className = 'alert-item';
    item.innerHTML = `<span>🚀</span><span class="alert-sym">${escHtml(name && name !== symbol ? `${name} (${symbol})` : symbol)}</span><span class="alert-change">+${change.toFixed(1)}% 6h</span><span class="alert-time">${new Date(time).toLocaleTimeString()}</span>`;
    const del = document.createElement('button');
    del.className = 'alert-del';
    del.textContent = '✕';
    del.onclick = e => { e.stopPropagation(); Alerts.remove(i); renderAlertsDropdown(); };
    item.appendChild(del);
    list.appendChild(item);
  });
}

$('bell-btn')?.addEventListener('click', e => {
  e.stopPropagation();
  const dd = $('alerts-dropdown');
  if (!dd) return;
  const open = !dd.classList.contains('hidden');
  if (open) { hide(dd); } else { renderAlertsDropdown(); Alerts.markRead(); show(dd); }
});
$('alerts-clear-btn')?.addEventListener('click', e => { e.stopPropagation(); Alerts.clear(); renderAlertsDropdown(); });
document.addEventListener('click', e => {
  const wrap = $('bell-wrap');
  if (wrap && !wrap.contains(e.target)) hide($('alerts-dropdown'));
});

renderBellBadge();

/* ══════════════════════════════════════════════════════
   HOME TAB
   ══════════════════════════════════════════════════════ */

let homeLoaded = false;

async function loadHome() {
  if (homeLoaded) return;
  homeLoaded = true;

  const grid    = $('coin-grid');
  const loading = $('home-loading');
  const error   = $('home-error');

  show(loading); hide(error); if (grid) grid.innerHTML = '';

  try {
    const coins = await API.getCoreCoinPairs();
    hide(loading);
    if (grid) {
      grid.innerHTML = '';
      // PLS goes full-width first
      const plsCoin = coins.find(c => c.symbol === 'PLS');
      if (plsCoin && !plsCoin.hideFromHome) {
        grid.appendChild(buildCoinCard(plsCoin));
      }
      // Remaining 4 coins (HEX, PLSX, INC, PRVX) in a 2x2 sub-grid
      const subCoins = coins.filter(c => c.symbol !== 'PLS' && !c.hideFromHome);
      if (subCoins.length > 0) {
        const subGrid = document.createElement('div');
        subGrid.className = 'coin-subgrid';
        subCoins.forEach(coin => subGrid.appendChild(buildCoinCard(coin)));
        grid.appendChild(subGrid);
      }
    }
    updateHomeTimestamp();
    checkAlerts(coins);

    // Load ecosystem stats in background
    loadEcosystemStats();
  } catch (e) {
    hide(loading);
    if (error) { error.textContent = `Failed to load: ${e.message}`; show(error); }
  }
}

function updateHomeTimestamp() {
  const el = $('home-timestamp');
  if (el) el.textContent = `Updated ${new Date().toLocaleTimeString()}`;
}

function checkAlerts(coins) {
  coins.forEach(({ symbol, pair }) => {
    if (!pair) return;
    const h6   = Number(pair.priceChange?.h6 || 0);
    const disp = symbol === 'WPLS' ? 'PLS' : symbol;
    const name = symbol === 'PLS' || symbol === 'WPLS' ? 'PulseChain' : (pair.baseToken?.name || symbol);
    Alerts.check(disp, name, h6);
  });
}

$('home-refresh-btn')?.addEventListener('click', () => { homeLoaded = false; loadHome(); });
setInterval(() => { if (activeTab === 'home') { homeLoaded = false; loadHome(); } }, 5 * 60_000);

/* ── Coin card ─────────────────────────────────────── */

function buildCoinCard(coin) {
  const { symbol, address, pair, bars, color } = coin;
  const isPls = symbol === 'PLS';
  const price = Number(pair?.priceUsd || 0);
  const change24 = Number(pair?.priceChange?.h24 || 0);
  const { text: chgText, cls: chgCls } = fmt.change(change24);
  const liq  = pair?.liquidity?.usd;
  const mcap = pair?.marketCap || pair?.fdv;
  const logo = pair?.info?.imageUrl || null;
  const displayName = isPls ? 'PulseChain' : (pair?.baseToken?.name || symbol);
  const displaySym  = isPls ? 'PLS' : symbol;
  const pairAddr = pair?.pairAddress || '';
  const tokenAddr = pair?.baseToken?.address || address;

  const card = document.createElement('article');
  card.className = `coin-card coin-card-accent${isPls ? ' coin-card-full' : ''}`;
  card.style.setProperty('--coin-color', color);

  // Head row
  const head = document.createElement('div');
  head.className = 'coin-card-head';
  const logoEl = buildLogo(logo, tokenAddr, displaySym, 'lg');
  const nameBlock = document.createElement('div');
  nameBlock.className = 'coin-name-block';
  const nm = document.createElement('div'); nm.className = 'coin-name'; nm.textContent = displayName;
  const sm = document.createElement('div'); sm.className = 'coin-sym'; sm.textContent = displaySym;
  nameBlock.append(nm, sm);

  const priceEl = document.createElement('div');
  priceEl.className = 'coin-price';
  priceEl.textContent = price ? fmt.price(price) : '—';

  const badge = document.createElement('div');
  badge.className = `badge badge-${chgCls}`;
  badge.textContent = chgText;

  // Star button
  const tokenAddrLow = tokenAddr.toLowerCase();
  const starBtn = document.createElement('button');
  starBtn.className = `star-btn${Watchlist.hasToken(tokenAddrLow) ? ' active' : ''}`;
  starBtn.textContent = Watchlist.hasToken(tokenAddrLow) ? '★' : '☆';
  starBtn.onclick = e => {
    e.stopPropagation();
    if (Watchlist.hasToken(tokenAddrLow)) {
      Watchlist.removeToken(tokenAddrLow);
      starBtn.textContent = '☆'; starBtn.classList.remove('active');
    } else {
      Watchlist.addToken({ address: tokenAddrLow, symbol: displaySym, name: displayName, logoUrl: logo });
      starBtn.textContent = '★'; starBtn.classList.add('active');
    }
  };

  head.append(logoEl, nameBlock, priceEl, badge, starBtn);

  // Stats row
  const statsRow = document.createElement('div');
  statsRow.className = 'coin-stats-row';
  [
    ['Mkt Cap',   fmt.large(mcap)],
    ['Liquidity', fmt.large(liq)],
    ['24h Vol',   fmt.large(pair?.volume?.h24)],
    ['1h',        fmt.change(pair?.priceChange?.h1).text],
    ['6h',        fmt.change(pair?.priceChange?.h6).text],
  ].forEach(([label, val]) => {
    const s = document.createElement('div');
    s.className = 'coin-stat';
    s.innerHTML = `<div class="coin-stat-label">${label}</div><div class="coin-stat-value mono-val">${escHtml(val)}</div>`;
    statsRow.appendChild(s);
  });

  // Chart area
  const chartArea = document.createElement('div');
  chartArea.className = 'coin-chart-area';

  const tfBar = document.createElement('div');
  tfBar.className = 'coin-chart-tf';
  const TFS = [{ l: '7D', d: 7 }, { l: '30D', d: 30 }, { l: '90D', d: 90 }, { l: 'ALL', d: 9999 }];
  let activeTf = 'ALL';

  const chartSlot = document.createElement('div');
  const dateLbl   = document.createElement('div');
  dateLbl.className = 'coin-chart-date';

  function renderChart(tfd) {
    activeTf = tfd.l;
    tfBar.querySelectorAll('.tf-btn').forEach(b => b.classList.toggle('active', b.dataset.tf === tfd.l));
    chartSlot.innerHTML = '';
    const filtered = filterBars(bars, tfd.d);
    const svg = buildChartSvg(filtered, color);
    if (svg) {
      chartSlot.appendChild(svg);
      dateLbl.textContent = dateLabel(filtered);
    } else {
      const no = document.createElement('div');
      no.className = 'coin-chart-nodata';
      no.textContent = bars && bars.length > 0 ? 'Not enough data for this range' : 'Chart loading…';
      chartSlot.appendChild(no);
      dateLbl.textContent = '';
    }
  }

  TFS.forEach(tf => {
    const btn = document.createElement('button');
    btn.className = 'tf-btn';
    btn.dataset.tf = tf.l;
    btn.textContent = tf.l;
    btn.onclick = () => renderChart(tf);
    tfBar.appendChild(btn);
  });

  renderChart(TFS[3]); // default ALL

  // DexScreener link
  const dexLink = document.createElement('a');
  dexLink.className = 'coin-dex-link';
  dexLink.href = pairAddr ? `https://dexscreener.com/pulsechain/${pairAddr}` : 'https://dexscreener.com/pulsechain';
  dexLink.target = '_blank'; dexLink.rel = 'noopener';
  dexLink.textContent = '📈 Full chart on DexScreener ↗';

  chartArea.append(tfBar, chartSlot, dateLbl, dexLink);
  card.append(head, statsRow, chartArea);
  return card;
}

/* ══════════════════════════════════════════════════════
   ECOSYSTEM STATS
   ══════════════════════════════════════════════════════ */

function miniChartSvg(values, color) {
  const W = 200, H = 44, pad = 3;
  if (!values || values.length < 2) return '';
  const min = Math.min(...values), max = Math.max(...values);
  const range = max - min || max * 0.05 || 1;
  const pts = values.map((v, i) => [
    pad + (i / (values.length - 1)) * (W - pad * 2),
    H - pad - ((v - min) / range) * (H - pad * 2),
  ]);
  const line = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const area = `${line} L${(W-pad).toFixed(1)},${H} L${pad},${H} Z`;
  const gid  = 'm' + Math.random().toString(36).slice(2, 6);
  return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none"><defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${color}" stop-opacity="0.3"/><stop offset="100%" stop-color="${color}" stop-opacity="0"/></linearGradient></defs><path d="${area}" fill="url(#${gid})"/><path d="${line}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

async function loadEcosystemStats() {
  const section = $('ecosystem-stats');

  // Run all in parallel
  const [bridge, fear, global_] = await Promise.allSettled([
    API.getBridgeStats(),
    API.getFearGreed(),
    API.getGlobalMarket(),
  ]);

  // ── Helper: set text safely
  const setText = (id, v) => { const e = $(id); if (e) e.textContent = v; };
  const pct = (n, t) => (!t || !n) ? '—' : (((n - t) / t) * 100 >= 0 ? '+' : '') + (((n - t) / t) * 100).toFixed(1) + '%';

  // ── Bridge TVL — confirmed: bridge.tvl is an array, chain key is "Ethereum"
  if (bridge.status === 'fulfilled' && bridge.value) {
    const b = bridge.value;
    let history = [];
    if (Array.isArray(b.tvl) && b.tvl.length > 0) history = b.tvl;
    else if (Array.isArray(b.chainTvls?.Ethereum?.tvl)) history = b.chainTvls.Ethereum.tvl;

    const vals = history.map(d => Number(d.totalLiquidityUSD || 0)).filter(v => v > 0);
    const now  = vals.length > 0 ? vals[vals.length - 1] : 0;
    const ago7 = vals.length >= 7  ? vals[vals.length - 7]  : now;
    const ago30= vals.length >= 30 ? vals[vals.length - 30] : now;
    const chartSvg = vals.length >= 2 ? miniChartSvg(vals.slice(-90), '#00bcd4') : '';

    // Home tab eco-bridge card (uses data-eco attributes)
    const homeCard = $('eco-bridge');
    if (homeCard) {
      const setM = (key, v) => { const e = homeCard.querySelector(`[data-eco="${key}"]`); if (e) e.textContent = v; };
      setM('bridge-now', now ? fmt.large(now) : '—');
      setM('bridge-7d',  pct(now, ago7));
      setM('bridge-30d', pct(now, ago30));
      const chart = homeCard.querySelector('[data-eco="bridge-chart"]');
      if (chart && chartSvg) chart.innerHTML = chartSvg;
    }

    // Ecosystem tab dedicated elements
    setText('eco-bridge-tvl-now', now ? fmt.large(now) : '—');
    setText('eco-bridge-tvl-7d',  pct(now, ago7));
    setText('eco-bridge-tvl-30d', pct(now, ago30));
    const ecoChart = $('eco-bridge-chart-full');
    if (ecoChart && chartSvg) ecoChart.innerHTML = chartSvg;
  }

  // ── Fear & Greed
  if (fear.status === 'fulfilled' && fear.value) {
    const entry = fear.value?.data?.[0];
    if (entry) {
      const label = `${entry.value} — ${entry.value_classification}`;
      const heroFear = $('hero-fear');
      if (heroFear) heroFear.querySelector('.hero-stat-value').textContent = label;
      setText('eco-fear-value', label);
    }
  }

  // ── Global market
  if (global_.status === 'fulfilled' && global_.value) {
    const d = global_.value?.data;
    if (d) {
      const btcDomText = (d.market_cap_percentage?.btc || 0).toFixed(1) + '%';
      const herobtc = $('hero-btc-dom');
      if (herobtc) herobtc.querySelector('.hero-stat-value').textContent = btcDomText;
      setText('eco-btc-dom', btcDomText);
      const mcap = fmt.large(d.total_market_cap?.usd);
      const heroMcap = $('hero-total-mcap');
      if (heroMcap) heroMcap.querySelector('.hero-stat-value').textContent = mcap;
      setText('eco-total-mcap', mcap);
      setText('eco-total-vol', fmt.large(d.total_volume?.usd));
    }
  }

  // Hide eco-loading spinner and show content
  hide($('eco-loading'));
  if (section) show(section);
}

/* ══════════════════════════════════════════════════════
   MARKETS TAB
   ══════════════════════════════════════════════════════ */

let marketPairs = [];
let marketLoaded = false;
let sortCol = 'vol', sortDir = 'desc';
let marketPage = 1;
const PAGE_SIZE = 50;

async function loadMarkets() {
  if (marketLoaded) return;
  marketLoaded = true;
  const loading = $('markets-loading');
  const error   = $('markets-error');
  show(loading); hide(error);
  try {
    marketPairs = await API.getTopPairs();
    hide(loading);
    renderMarketList();
  } catch (e) {
    hide(loading);
    if (error) { error.textContent = `Failed: ${e.message}`; show(error); }
  }
}

function sortedPairs() {
  const get = p => {
    switch (sortCol) {
      case 'price':  return Number(p.priceUsd || 0);
      case 'change': return Number(p.priceChange?.h24 || 0);
      case 'vol':    return Number(p.volume?.h24 || 0);
      case 'liq':    return Number(p.liquidity?.usd || 0);
      default:       return Number(p.marketCap || p.fdv || 0);
    }
  };
  return [...marketPairs].sort((a, b) => sortDir === 'desc' ? get(b) - get(a) : get(a) - get(b));
}

function renderMarketList() {
  const rows = $('market-rows');
  if (!rows) return;
  const sorted = sortedPairs();
  const total  = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  marketPage   = Math.max(1, Math.min(marketPage, total));
  const slice  = sorted.slice((marketPage - 1) * PAGE_SIZE, marketPage * PAGE_SIZE);
  const offset = (marketPage - 1) * PAGE_SIZE;

  rows.innerHTML = '';
  slice.forEach((pair, i) => {
    rows.appendChild(buildMarketRow(offset + i + 1, pair));
  });

  // Update sort indicators
  document.querySelectorAll('.sort-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.col === sortCol);
    b.querySelector('.sort-arrow')?.remove();
    if (b.dataset.col === sortCol) {
      const arr = document.createElement('span');
      arr.className = 'sort-arrow';
      arr.textContent = sortDir === 'desc' ? ' ↓' : ' ↑';
      b.appendChild(arr);
    }
  });

  // Pagination
  ['page-info', 'page-info-bot'].forEach(id => { const e = $(id); if (e) e.textContent = `${marketPage} / ${total}`; });
  ['prev-btn', 'prev-btn-bot'].forEach(id => { const e = $(id); if (e) e.disabled = marketPage <= 1; });
  ['next-btn', 'next-btn-bot'].forEach(id => { const e = $(id); if (e) e.disabled = marketPage >= total; });
  show($('market-list'));
}

function buildMarketRow(rank, pair) {
  const token   = pair.baseToken || {};
  const price   = pair.priceUsd;
  const { text: chgText, cls: chgCls } = fmt.change(pair.priceChange?.h24);
  const logoUrl = API.logoUrl(pair, token.address);
  const tokenAddr = (token.address || '').toLowerCase();

  const row = document.createElement('a');
  row.className = 'market-row';
  row.href = pair.pairAddress ? `https://dexscreener.com/pulsechain/${pair.pairAddress}` : '#';
  row.target = '_blank'; row.rel = 'noopener';

  const rankEl = document.createElement('span');
  rankEl.className = 'market-rank';
  rankEl.textContent = rank;

  const tokenCol = document.createElement('span');
  tokenCol.className = 'market-token';
  const logo = buildLogo(logoUrl, token.address, token.symbol, 'sm');
  if (logo.tagName === 'IMG') logo.style.cssText = 'width:20px;height:20px;border-radius:50%;object-fit:cover;flex-shrink:0;background:var(--bg-3);';
  else logo.style.cssText = 'width:20px;height:20px;font-size:.5rem;flex-shrink:0;';
  const nameWrap = document.createElement('div');
  const nameEl = document.createElement('div'); nameEl.className = 'market-token-name'; nameEl.textContent = token.name || token.symbol || '—';
  const symEl  = document.createElement('div'); symEl.className  = 'market-token-sym';  symEl.textContent  = token.symbol || '—';
  nameWrap.append(nameEl, symEl);

  const star = document.createElement('button');
  star.className = `star-btn${Watchlist.hasToken(tokenAddr) ? ' active' : ''}`;
  star.style.cssText = 'margin-left:.25rem;width:24px;height:24px;font-size:.8rem;';
  star.textContent = Watchlist.hasToken(tokenAddr) ? '★' : '☆';
  star.onclick = e => {
    e.preventDefault(); e.stopPropagation();
    if (Watchlist.hasToken(tokenAddr)) {
      Watchlist.removeToken(tokenAddr); star.textContent = '☆'; star.classList.remove('active');
    } else {
      Watchlist.addToken({ address: tokenAddr, symbol: token.symbol || '', name: token.name || token.symbol || '', logoUrl });
      star.textContent = '★'; star.classList.add('active');
    }
  };
  tokenCol.append(logo, nameWrap, star);

  const mkCol = (val, cls = '') => {
    const s = document.createElement('span');
    s.className = `market-col${cls ? ' ' + cls : ''}`;
    s.textContent = val;
    return s;
  };

  row.append(
    rankEl, tokenCol,
    mkCol(price ? fmt.price(price) : '—'),
    mkCol(chgText, chgCls),
    mkCol(fmt.large(pair.marketCap || pair.fdv), 'hide-mobile'),
    mkCol(fmt.large(pair.volume?.h24), 'hide-mobile'),
    mkCol(fmt.large(pair.liquidity?.usd), 'hide-mobile'),
  );
  return row;
}

// Sort buttons
document.querySelectorAll('.sort-btn').forEach(b => {
  b.addEventListener('click', () => {
    const col = b.dataset.col;
    if (sortCol === col) sortDir = sortDir === 'desc' ? 'asc' : 'desc';
    else { sortCol = col; sortDir = 'desc'; }
    marketPage = 1;
    renderMarketList();
  });
});

// Pagination
['prev-btn','prev-btn-bot'].forEach(id => $(id)?.addEventListener('click', () => { if (marketPage > 1) { marketPage--; renderMarketList(); } }));
['next-btn','next-btn-bot'].forEach(id => $(id)?.addEventListener('click', () => { marketPage++; renderMarketList(); }));
$('markets-refresh-btn')?.addEventListener('click', () => { marketLoaded = false; marketPairs = []; marketPage = 1; loadMarkets(); });

/* ── Crypto Top 100 ────────────────────────────────── */

let crypto100Loaded = false;

async function loadCrypto100(forceRefresh = false) {
  if (crypto100Loaded && !forceRefresh) return;
  crypto100Loaded = true;
  const loading = $('crypto100-loading');
  const error   = $('crypto100-error');
  const list    = $('crypto100-list');
  const btn     = $('crypto100-refresh-btn');
  show(loading); hide(error); hide(list);
  if (btn) { btn.disabled = true; btn.textContent = '↻ …'; }
  try {
    const data = await fetch('/api/coingecko/markets?vs_currency=usd&order=market_cap_desc&per_page=100&page=1&sparkline=false&price_change_percentage=24h,7d').then(r => r.json());
    if (!Array.isArray(data)) throw new Error('Invalid response from CoinGecko');
    hide(loading);
    renderCrypto100(data);
    show(list);
  } catch (e) {
    hide(loading);
    if (error) { error.textContent = `Failed: ${e.message}`; show(error); }
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '↻ Refresh'; }
  }
}

$('crypto100-refresh-btn')?.addEventListener('click', () => loadCrypto100(true));

function renderCrypto100(coins) {
  const rows = $('crypto100-rows');
  if (!rows) return;
  rows.innerHTML = '';
  coins.forEach((coin, i) => {
    const chg24 = fmt.change(coin.price_change_percentage_24h);
    const chg7d = fmt.change(coin.price_change_percentage_7d_in_currency);
    const row = document.createElement('a');
    row.className = 'market-row crypto100-row';
    row.href = `https://www.coingecko.com/en/coins/${coin.id}`;
    row.target = '_blank'; row.rel = 'noopener';

    const rank = document.createElement('span');
    rank.className = 'market-rank';
    rank.textContent = i + 1;

    const tokenCol = document.createElement('span');
    tokenCol.className = 'market-token';
    const img = document.createElement('img');
    img.src = coin.image || '';
    img.alt = coin.symbol || '';
    img.style.cssText = 'width:24px;height:24px;border-radius:50%;flex-shrink:0;background:var(--bg-3);object-fit:cover;';
    img.onerror = () => { img.style.display='none'; };
    const nameWrap = document.createElement('div');
    nameWrap.innerHTML = `<div class="market-token-name">${escHtml(coin.name || '—')}</div><div class="market-token-sym">${escHtml((coin.symbol||'').toUpperCase())}</div>`;
    tokenCol.append(img, nameWrap);

    const mkCol = (val, cls = '') => {
      const s = document.createElement('span');
      s.className = `market-col r${cls ? ' ' + cls : ''}`;
      s.textContent = val; return s;
    };

    row.append(
      rank, tokenCol,
      mkCol(coin.current_price ? fmt.price(coin.current_price) : '—'),
      mkCol(chg24.text, chg24.cls),
      mkCol(chg7d.text, chg7d.cls + ' hide-mobile'),
      mkCol(fmt.large(coin.market_cap), 'hide-mobile'),
      mkCol(fmt.large(coin.total_volume), 'hide-mobile'),
    );
    rows.appendChild(row);
  });
}

/* ── Commodities ───────────────────────────────────── */

// Static commodity data with live prices via open APIs
const COMMODITIES = [
  // Energy
  { id: 'CL=F',  name: 'WTI Crude Oil',    symbol: 'WTI',    unit: '/bbl',  category: 'Energy',      icon: '🛢️',  color: '#8B4513' },
  { id: 'BZ=F',  name: 'Brent Crude Oil',   symbol: 'BRENT',  unit: '/bbl',  category: 'Energy',      icon: '🛢️',  color: '#A0522D' },
  { id: 'NG=F',  name: 'Natural Gas',       symbol: 'NATGAS', unit: '/MMBtu',category: 'Energy',      icon: '🔥',  color: '#FF8C00' },
  { id: 'RB=F',  name: 'RBOB Gasoline',     symbol: 'GAS',    unit: '/gal',  category: 'Energy',      icon: '⛽',  color: '#DC143C' },
  // Metals
  { id: 'GC=F',  name: 'Gold',              symbol: 'GOLD',   unit: '/oz',   category: 'Metals',      icon: '🥇',  color: '#FFD700' },
  { id: 'SI=F',  name: 'Silver',            symbol: 'SILVER', unit: '/oz',   category: 'Metals',      icon: '🥈',  color: '#C0C0C0' },
  { id: 'PL=F',  name: 'Platinum',          symbol: 'PLAT',   unit: '/oz',   category: 'Metals',      icon: '💎',  color: '#E5E4E2' },
  { id: 'PA=F',  name: 'Palladium',         symbol: 'PALL',   unit: '/oz',   category: 'Metals',      icon: '⚗️',  color: '#B4A7D6' },
  { id: 'HG=F',  name: 'Copper',            symbol: 'COPPER', unit: '/lb',   category: 'Metals',      icon: '🔶',  color: '#B87333' },
  // Agriculture
  { id: 'ZW=F',  name: 'Wheat',             symbol: 'WHEAT',  unit: '/bu',   category: 'Agriculture', icon: '🌾',  color: '#DAA520' },
  { id: 'ZC=F',  name: 'Corn',              symbol: 'CORN',   unit: '/bu',   category: 'Agriculture', icon: '🌽',  color: '#F4D03F' },
  { id: 'ZS=F',  name: 'Soybeans',          symbol: 'SOY',    unit: '/bu',   category: 'Agriculture', icon: '🫘',  color: '#6B8E23' },
  { id: 'CC=F',  name: 'Cocoa',             symbol: 'COCOA',  unit: '/t',    category: 'Agriculture', icon: '🍫',  color: '#5C3317' },
  { id: 'KC=F',  name: 'Coffee',            symbol: 'COFFEE', unit: '/lb',   category: 'Agriculture', icon: '☕',  color: '#6F4E37' },
  { id: 'CT=F',  name: 'Cotton',            symbol: 'COTTON', unit: '/lb',   category: 'Agriculture', icon: '🌿',  color: '#F5F5DC' },
  { id: 'SB=F',  name: 'Sugar',             symbol: 'SUGAR',  unit: '/lb',   category: 'Agriculture', icon: '🍬',  color: '#FF69B4' },
  // Livestock
  { id: 'LE=F',  name: 'Live Cattle',       symbol: 'CATTLE', unit: '/lb',   category: 'Livestock',   icon: '🐄',  color: '#8B4513' },
  { id: 'GF=F',  name: 'Feeder Cattle',     symbol: 'FCAT',   unit: '/lb',   category: 'Livestock',   icon: '🐂',  color: '#A0522D' },
  { id: 'HE=F',  name: 'Lean Hogs',         symbol: 'HOGS',   unit: '/lb',   category: 'Livestock',   icon: '🐷',  color: '#FFB6C1' },
  // Timber
  { id: 'LBS=F', name: 'Lumber',            symbol: 'LUMBER', unit: '/MBF',  category: 'Timber',      icon: '🪵',  color: '#8B6914' },
  // Other
  { id: 'OJ=F',  name: 'Orange Juice',      symbol: 'OJ',     unit: '/lb',   category: 'Agriculture', icon: '🍊',  color: '#FF8C00' },
  { id: 'ZL=F',  name: 'Soybean Oil',       symbol: 'SOYO',   unit: '/lb',   category: 'Agriculture', icon: '🫙',  color: '#9ACD32' },
];

let commoditiesLoaded = false;
let commodityData = [];
let commoditiesAutoTimer = null;

async function loadCommodities(forceRefresh = false) {
  if (commoditiesLoaded && !forceRefresh) return;
  commoditiesLoaded = true;
  const loading = $('commodities-loading');
  const error   = $('commodities-error');
  const list    = $('commodities-list');
  const btn     = $('commodities-refresh-btn');
  const ts      = $('commodities-timestamp');
  show(loading); hide(error); hide(list);
  if (btn) { btn.disabled = true; btn.textContent = '↻ …'; }

  try {
    const symbols = COMMODITIES.map(c => c.id).join(',');
    const data = await fetch(`/api/commodities?symbols=${encodeURIComponent(symbols)}`).then(r => r.json());

    commodityData = COMMODITIES.map(c => {
      const q = data[c.id] || {};
      return {
        ...c,
        price:      q.price      || null,
        change:     q.change     || 0,
        changePct:  q.changePct  || 0,
        prevClose:  q.prevClose  || null,
        high52w:    q.high52w    || null,
        low52w:     q.low52w     || null,
        lastUpdate: q.lastUpdate || null,
      };
    });

    hide(loading);
    renderCommodities(commodityData);
    show(list);
    if (ts) ts.textContent = `Updated ${new Date().toLocaleTimeString()}`;

    // Auto-refresh every 60s while this subtab is active
    clearInterval(commoditiesAutoTimer);
    commoditiesAutoTimer = setInterval(() => {
      if (activeMarketsSubtab === 'commodities') loadCommodities(true);
    }, 60_000);

  } catch (e) {
    hide(loading);
    if (error) { error.textContent = `Failed to load commodity prices: ${e.message}`; show(error); }
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '↻ Refresh'; }
  }
}

$('commodities-refresh-btn')?.addEventListener('click', () => loadCommodities(true));

function renderCommodities(data) {
  const list = $('commodities-list');
  if (!list) return;
  list.innerHTML = '';

  // Group by category
  const categories = {};
  data.forEach(c => {
    if (!categories[c.category]) categories[c.category] = [];
    categories[c.category].push(c);
  });

  const catOrder = ['Energy', 'Metals', 'Agriculture', 'Livestock', 'Timber'];
  catOrder.forEach(cat => {
    if (!categories[cat]) return;
    const section = document.createElement('div');
    section.className = 'commodity-section';

    const title = document.createElement('div');
    title.className = 'commodity-section-title';
    title.textContent = cat;
    section.appendChild(title);

    const grid = document.createElement('div');
    grid.className = 'commodity-grid';

    categories[cat].forEach(c => {
      const card = document.createElement('div');
      card.className = 'commodity-card';
      const chg = fmt.change(c.changePct);

      const priceStr = c.price != null
        ? (c.price >= 1000
            ? '$' + c.price.toLocaleString('en-US', { maximumFractionDigits: 2 })
            : '$' + c.price.toFixed(c.price >= 10 ? 2 : 4))
        : '—';

      const chgStr = c.changePct !== 0
        ? `${c.changePct >= 0 ? '+' : ''}${c.changePct.toFixed(2)}%`
        : '—';

      const absChgStr = c.change !== 0
        ? `${c.change >= 0 ? '+' : ''}${c.change >= 1 ? c.change.toFixed(2) : c.change.toFixed(4)}`
        : '';

      card.innerHTML = `
        <div class="commodity-card-head">
          <span class="commodity-icon" style="color:${c.color}">${c.icon}</span>
          <div class="commodity-name-wrap">
            <div class="commodity-name">${escHtml(c.name)}</div>
            <div class="commodity-sym">${escHtml(c.symbol)} <span style="color:var(--text-3);font-size:.65rem">${escHtml(c.unit)}</span></div>
          </div>
        </div>
        <div class="commodity-price">${priceStr}</div>
        <div class="commodity-change-row">
          <span class="${chg.cls}" style="font-size:.82rem;font-weight:600">${chgStr}</span>
          ${absChgStr ? `<span style="font-size:.72rem;color:var(--text-3)">${escHtml(absChgStr)}</span>` : ''}
        </div>
        ${c.high52w && c.low52w ? `<div class="commodity-range"><span class="commodity-range-label">52w</span><span>${escHtml('$' + Number(c.low52w).toFixed(2))} – ${escHtml('$' + Number(c.high52w).toFixed(2))}</span></div>` : ''}
      `;
      grid.appendChild(card);
    });

    section.appendChild(grid);
    list.appendChild(section);
  });
}

// Market search
let searchDebounce = null;
const searchInput = $('market-search');
const searchDrop  = $('search-dropdown');

if (searchInput) {
  searchInput.addEventListener('input', () => {
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(() => runSearch(searchInput.value), 350);
  });
  searchInput.addEventListener('blur', () => setTimeout(() => hide(searchDrop), 150));
  searchInput.addEventListener('focus', () => { if (searchInput.value.trim()) show(searchDrop); });
}

document.addEventListener('click', e => {
  if (searchDrop && !searchDrop.contains(e.target) && e.target !== searchInput) hide(searchDrop);
});

async function runSearch(q) {
  const s = q.trim();
  if (!s) { hide(searchDrop); return; }
  if (searchDrop) { searchDrop.innerHTML = '<div class="search-loading"><div class="spinner"></div></div>'; show(searchDrop); }
  try {
    const data  = await fetch(`/api/dex/latest/dex/search?q=${encodeURIComponent(s)}`).then(r => r.json());
    const pairs = (data?.pairs || [])
      .filter(p => (p.marketCap || p.fdv || 0) >= 1000)
      .sort((a, b) => Number(b.liquidity?.usd || 0) - Number(a.liquidity?.usd || 0))
      .slice(0, 30);
    renderSearchResults(pairs);
  } catch (e) {
    if (searchDrop) searchDrop.innerHTML = `<div class="search-empty">Error: ${escHtml(e.message)}</div>`;
  }
}

function renderSearchResults(pairs) {
  if (!searchDrop) return;
  searchDrop.innerHTML = '';
  if (!pairs.length) { searchDrop.innerHTML = '<div class="search-empty">No results found</div>'; show(searchDrop); return; }
  pairs.forEach(pair => {
    const token = pair.baseToken || {};
    const chain = pair.chainId || 'unknown';
    const { text: chgText, cls: chgCls } = fmt.change(pair.priceChange?.h24);
    const a = document.createElement('a');
    a.className = 'search-item';
    a.href = pair.pairAddress ? `https://dexscreener.com/${chain}/${pair.pairAddress}` : `https://dexscreener.com/${chain}`;
    a.target = '_blank'; a.rel = 'noopener';

    const logo = buildLogo(API.logoUrl(pair, token.address), token.address, token.symbol, 'sm');
    logo.style.cssText = 'width:28px;height:28px;flex-shrink:0;';

    const chainLabel = chain.replace('pulsechain', 'PulseChain').replace('ethereum', 'ETH').replace('bsc', 'BSC').replace('base', 'Base').replace('solana', 'SOL').replace('polygon', 'MATIC');

    const info = document.createElement('div');
    info.className = 'search-item-info';
    info.innerHTML = `<div class="search-item-sym">${escHtml(token.symbol || '—')}<span class="search-item-chain" style="margin-left:.35rem">${escHtml(chainLabel)}</span></div><div class="search-item-name">${escHtml(token.name || token.symbol || '')}</div>`;

    const stats = document.createElement('div');
    stats.className = 'search-item-stats';
    const priceEl = document.createElement('div'); priceEl.className = 'search-item-price'; priceEl.textContent = pair.priceUsd ? fmt.price(pair.priceUsd) : '—';
    const chgEl   = document.createElement('div'); chgEl.className = `badge badge-${chgCls}`; chgEl.style.float = 'right'; chgEl.textContent = chgText;
    stats.append(priceEl, chgEl);

    a.append(logo, info, stats);
    searchDrop.appendChild(a);
  });
  show(searchDrop);
}

/* ══════════════════════════════════════════════════════
   PORTFOLIO TAB
   ══════════════════════════════════════════════════════ */

const WPLS_ADDR    = API.WPLS.toLowerCase();
const WPLS_FALLBACK = `https://dd.dexscreener.com/ds-data/tokens/pulsechain/${WPLS_ADDR}.png`;

let cachedTokens = [], cachedPlsBal = 0, cachedPlsPrice = 0, cachedPlsLogo = null, cachedPlsPair = null;
let currentAddr  = null;
let hideSmall    = true;
let sumUsd = 0, sumPls = 0, showPls = false;

function initPortfolioTab() {
  renderSavedWallets();
  renderGroupSelect();
  autoLoadLast();
}

// Saved wallets bar
function renderSavedWallets() {
  const bar = $('saved-wallets-bar');
  if (!bar) return;
  const wallets = Watchlist.getWallets();
  bar.innerHTML = '';
  if (!wallets.length) { hide(bar); return; }
  show(bar);
  wallets.forEach(({ addr, name }) => {
    const chip = document.createElement('button');
    chip.className = `saved-wallet-chip${currentAddr === addr.toLowerCase() ? ' active' : ''}`;
    chip.textContent = name || addr.slice(0, 10) + '…';
    chip.title = addr;
    chip.onclick = () => { $('wallet-input').value = addr; loadPortfolio(addr); };
    const rm = document.createElement('span');
    rm.className = 'chip-remove'; rm.textContent = '✕';
    rm.onclick = e => {
      e.stopPropagation();
      if (!confirm(`Remove ${name || addr}?`)) return;
      Watchlist.removeWallet(addr);
      renderSavedWallets();
      renderGroupSelect();
    };
    chip.appendChild(rm);
    bar.appendChild(chip);
  });
}

// Group quick-select
function renderGroupSelect() {
  const sel = $('group-select');
  if (!sel) return;
  const groups = Groups.getAll();
  sel.innerHTML = '<option value="">— Load a group —</option>';
  groups.forEach(g => {
    const opt = document.createElement('option');
    opt.value = g.id;
    opt.textContent = `${g.name} (${g.addresses.length} wallets)`;
    sel.appendChild(opt);
  });
  const row = $('group-select-row');
  if (row) { if (groups.length) show(row); else hide(row); }
}

$('group-select')?.addEventListener('change', e => {
  const id    = e.target.value;
  if (!id) return;
  const group = Groups.get(id);
  if (group) loadGroupPortfolio(group);
  e.target.value = '';
});

// Auto-load last
let autoLoaded = false;
function autoLoadLast() {
  if (autoLoaded) return;
  autoLoaded = true;
  try {
    const last = localStorage.getItem('pc-last-portfolio');
    if (!last) return;
    if (last.startsWith('wallet:')) {
      const addr = last.slice(7);
      $('wallet-input').value = addr;
      loadPortfolio(addr);
    } else if (last.startsWith('group:')) {
      const g = Groups.get(last.slice(6));
      if (g) loadGroupPortfolio(g);
    }
  } catch {}
}

// Load wallet
$('load-btn')?.addEventListener('click', () => {
  const addr = $('wallet-input').value.trim();
  if (!addr) return showPortfolioErr('Enter a wallet address.');
  if (!isValidAddr(addr)) return showPortfolioErr('Invalid address format (must be 0x + 40 hex chars).');
  loadPortfolio(addr);
});
$('wallet-input')?.addEventListener('keydown', e => { if (e.key === 'Enter') $('load-btn')?.click(); });

// Save wallet button
$('save-wallet-btn')?.addEventListener('click', () => {
  const addr = $('wallet-input').value.trim();
  const name = $('wallet-name-input')?.value.trim() || '';
  if (!addr || !isValidAddr(addr)) return;
  if (Watchlist.hasWallet(addr)) {
    Watchlist.removeWallet(addr);
  } else {
    Watchlist.addWallet(addr, name);
    if (currentAddr === addr.toLowerCase() && (cachedTokens.length || cachedPlsBal)) {
      History.add(addr.toLowerCase(), sumUsd, cachedPlsPrice > 0 ? sumUsd / cachedPlsPrice : 0);
    }
  }
  updateSaveBtn();
  renderSavedWallets();
  renderGroupSelect();
});

$('wallet-input')?.addEventListener('input', updateSaveBtn);

function updateSaveBtn() {
  const btn  = $('save-wallet-btn');
  const addr = $('wallet-input').value.trim();
  if (!btn) return;
  const saved = addr && Watchlist.hasWallet(addr);
  btn.textContent = saved ? '★ Saved' : '☆ Save';
  btn.classList.toggle('active', !!saved);
}

function showPortfolioErr(msg) { const e = $('portfolio-error'); if (e) { e.textContent = msg; show(e); } }
function hidePortfolioErr()    { const e = $('portfolio-error'); if (e) hide(e); }
function setLoading(on) {
  const btn = $('load-btn');
  const sp  = $('load-spinner');
  const tx  = $('load-btn-text');
  if (btn) btn.disabled = on;
  if (sp)  on ? show(sp) : hide(sp);
  if (tx)  on ? hide(tx) : show(tx);
}

async function loadPortfolio(address) {
  hidePortfolioErr();
  setLoading(true);
  ['portfolio-summary','portfolio-table-wrap','portfolio-pie','portfolio-history'].forEach(id => hide($(id)));
  show($('portfolio-empty'));

  try {
    const [plsBal, tokens] = await Promise.all([
      API.getPlsBalance(address),
      API.getTokenList(address),
    ]);

    const active = tokens.filter(t => t.balance > 0);
    const addrs  = active.map(t => t.contractAddress);
    if (!addrs.some(a => a.toLowerCase() === WPLS_ADDR)) addrs.push(API.WPLS);

    const [pairMap, supplies] = await Promise.all([
      API.getPairsByAddresses(addrs),
      Promise.allSettled(active.map(t => API.getTotalSupply(t.contractAddress))),
    ]);

    const enriched = active.map((t, i) => {
      const pair  = pairMap.get(t.contractAddress.toLowerCase());
      const price = Number(pair?.priceUsd || 0);
      const value = price * t.balance;
      const logoUrl = API.logoUrl(pair, t.contractAddress);
      const pairAddr = pair?.pairAddress || null;
      const rawSup = supplies[i].status === 'fulfilled' ? supplies[i].value : null;
      const totalSup = rawSup ? Number(rawSup) / Math.pow(10, t.decimals) : null;
      const supplyPct = totalSup && totalSup > 0 ? (t.balance / totalSup) * 100 : null;
      return { ...t, price, change24h: Number(pair?.priceChange?.h24 || 0), value, logoUrl, pairAddr, supplyPct };
    }).sort((a, b) => b.value - a.value);

    const wplsPair  = pairMap.get(WPLS_ADDR);
    const plsPrice  = Number(wplsPair?.priceUsd || 0);
    const plsLogo   = API.logoUrl(wplsPair, API.WPLS);
    const plsPairAddr = wplsPair?.pairAddress || null;

    cachedTokens   = enriched;
    cachedPlsBal   = plsBal;
    cachedPlsPrice = plsPrice;
    cachedPlsLogo  = plsLogo;
    cachedPlsPair  = plsPairAddr;
    currentAddr    = address.toLowerCase();

    sumUsd = enriched.reduce((s, t) => s + t.value, 0) + plsBal * plsPrice;
    sumPls = plsPrice > 0 ? sumUsd / plsPrice : 0;

    try { localStorage.setItem('pc-last-portfolio', 'wallet:' + address.toLowerCase()); } catch {}

    renderPortfolioSummary();
    renderPortfolioPie();
    renderPortfolioTable();
    hide($('portfolio-empty'));
    ['portfolio-summary','portfolio-table-wrap','portfolio-pie'].forEach(id => show($(id)));

    // Collapse add wallet panel
    hide($('add-wallet-panel'));
    const toggleBtn = $('add-wallet-toggle');
    if (toggleBtn) { toggleBtn.textContent = '+ Add Wallet'; toggleBtn.setAttribute('aria-expanded', 'false'); }

    // Always record history snapshot and show chart (for all wallets, not just saved)
    const historyKey = address.toLowerCase();
    History.add(historyKey, sumUsd, sumPls);
    renderHistoryChart(historyKey);

    updateSaveBtn();
    renderSavedWallets();
  } catch (e) {
    showPortfolioErr(`Failed to load portfolio: ${e.message}`);
  } finally {
    setLoading(false);
  }
}

async function loadGroupPortfolio(group) {
  if (!group.addresses.length) return showPortfolioErr('Group has no addresses.');
  hidePortfolioErr();
  setLoading(true);
  ['portfolio-summary','portfolio-table-wrap','portfolio-pie','portfolio-history'].forEach(id => hide($(id)));
  show($('portfolio-empty'));
  currentAddr = null;

  try {
    const results = await Promise.all(
      group.addresses.map(({ addr }) => Promise.all([API.getPlsBalance(addr), API.getTokenList(addr)]))
    );

    let totalPls = 0;
    const tokenMap = new Map();
    results.forEach(([bal, tokens]) => {
      totalPls += bal;
      tokens.filter(t => t.balance > 0).forEach(t => {
        const k = t.contractAddress.toLowerCase();
        if (tokenMap.has(k)) tokenMap.get(k).balance += t.balance;
        else tokenMap.set(k, { ...t });
      });
    });

    const active = [...tokenMap.values()];
    const addrs  = active.map(t => t.contractAddress);
    if (!addrs.some(a => a.toLowerCase() === WPLS_ADDR)) addrs.push(API.WPLS);

    const [pairMap, supplies] = await Promise.all([
      API.getPairsByAddresses(addrs),
      Promise.allSettled(active.map(t => API.getTotalSupply(t.contractAddress))),
    ]);

    const enriched = active.map((t, i) => {
      const pair  = pairMap.get(t.contractAddress.toLowerCase());
      const price = Number(pair?.priceUsd || 0);
      const value = price * t.balance;
      const rawSup = supplies[i].status === 'fulfilled' ? supplies[i].value : null;
      const totalSup = rawSup ? Number(rawSup) / Math.pow(10, t.decimals) : null;
      const supplyPct = totalSup && totalSup > 0 ? (t.balance / totalSup) * 100 : null;
      return { ...t, price, change24h: Number(pair?.priceChange?.h24 || 0), value, logoUrl: API.logoUrl(pair, t.contractAddress), pairAddr: pair?.pairAddress || null, supplyPct };
    }).sort((a, b) => b.value - a.value);

    const wplsPair = pairMap.get(WPLS_ADDR);
    const plsPrice = Number(wplsPair?.priceUsd || 0);

    cachedTokens = enriched; cachedPlsBal = totalPls; cachedPlsPrice = plsPrice;
    cachedPlsLogo = API.logoUrl(wplsPair, API.WPLS); cachedPlsPair = wplsPair?.pairAddress || null;

    sumUsd = enriched.reduce((s, t) => s + t.value, 0) + totalPls * plsPrice;
    sumPls = plsPrice > 0 ? sumUsd / plsPrice : 0;

    try { localStorage.setItem('pc-last-portfolio', 'group:' + group.id); } catch {}

    renderPortfolioSummary();
    renderPortfolioPie();
    renderPortfolioTable();
    hide($('portfolio-empty'));
    ['portfolio-summary','portfolio-table-wrap','portfolio-pie'].forEach(id => show($(id)));

    // Group history — always record and display
    const hKey = 'group:' + group.id;
    History.add(hKey, sumUsd, sumPls);
    renderHistoryChart(hKey);
    show($('portfolio-history'));

    // Show group banner
    const banner = $('group-banner');
    if (banner) {
      const nm = banner.querySelector('[data-group-name]');
      const wc = banner.querySelector('[data-group-count]');
      if (nm) nm.textContent = group.name;
      if (wc) wc.textContent = `${group.addresses.length} wallet${group.addresses.length !== 1 ? 's' : ''}`;
      show(banner);
    }
  } catch (e) {
    showPortfolioErr(`Group load failed: ${e.message}`);
  } finally {
    setLoading(false);
  }
}

// Summary cards
$('summary-currency-btn')?.addEventListener('click', () => {
  showPls = !showPls;
  renderPortfolioSummary();
});

function renderPortfolioSummary() {
  const setEl = (id, v) => { const e = $(id); if (e) e.textContent = v; };
  setEl('summary-total', showPls ? fmt.pls(sumPls) : fmt.usd(sumUsd));
  setEl('summary-total-label', showPls ? 'Total (PLS)' : 'Total (USD)');
  setEl('summary-pls-bal', fmt.balance(cachedPlsBal) + ' PLS');
  setEl('summary-token-count', cachedTokens.length + 1);
  setEl('summary-pls-val', cachedPlsPrice ? fmt.usd(cachedPlsBal * cachedPlsPrice) : '—');
}

// Pie chart
const PIE_COLORS = ['#7b2fff','#ff2f7b','#00bcd4','#ff6d00','#00e676','#f59e0b','#e8002d','#29b6f6','#ab47bc','#26a69a','#d4e157','#ec407a'];

function renderPortfolioPie() {
  const svgEl  = $('pie-svg');
  const legend = $('pie-legend');
  if (!svgEl || !legend) return;

  const plsVal = cachedPlsBal * cachedPlsPrice;
  const total  = cachedTokens.reduce((s, t) => s + t.value, 0) + plsVal;
  if (total <= 0) return;

  const items = [
    { symbol: 'PLS', value: plsVal },
    ...cachedTokens.map(t => ({ symbol: t.symbol, value: t.value })),
  ].filter(t => t.value > 0).sort((a, b) => b.value - a.value);

  const MAX = 9;
  let slices = items;
  if (items.length > MAX) {
    const top   = items.slice(0, MAX - 1);
    const other = items.slice(MAX - 1).reduce((s, t) => s + t.value, 0);
    slices = [...top, { symbol: 'Other', value: other }];
  }

  const CX = 110, CY = 110, R = 90, RI = 52;
  const NS = 'http://www.w3.org/2000/svg';
  svgEl.innerHTML = '';
  let startAngle = -Math.PI / 2;
  const GAP = 0.012;

  const drawn = slices.map((s, i) => {
    const pct   = s.value / total;
    const sweep = pct * 2 * Math.PI - GAP;
    const end   = startAngle + sweep;
    const color = PIE_COLORS[i % PIE_COLORS.length];

    const x1 = CX + R * Math.cos(startAngle), y1 = CY + R * Math.sin(startAngle);
    const x2 = CX + R * Math.cos(end),         y2 = CY + R * Math.sin(end);
    const xi1= CX + RI* Math.cos(end),          yi1= CY + RI* Math.sin(end);
    const xi2= CX + RI* Math.cos(startAngle),   yi2= CY + RI* Math.sin(startAngle);
    const lg = sweep > Math.PI ? 1 : 0;
    const d  = `M ${x1} ${y1} A ${R} ${R} 0 ${lg} 1 ${x2} ${y2} L ${xi1} ${yi1} A ${RI} ${RI} 0 ${lg} 0 ${xi2} ${yi2} Z`;

    const path = document.createElementNS(NS, 'path');
    path.setAttribute('d', d);
    path.setAttribute('fill', color);
    path.setAttribute('stroke', 'var(--bg-1)');
    path.setAttribute('stroke-width', '1.5');
    svgEl.appendChild(path);
    startAngle = end + GAP;
    return { s, pct, color };
  });

  // Centre text
  const ct = document.createElementNS(NS, 'text');
  ct.setAttribute('x', CX); ct.setAttribute('y', CY - 8); ct.setAttribute('text-anchor', 'middle');
  ct.setAttribute('font-size', '10'); ct.setAttribute('fill', 'var(--text-2)'); ct.textContent = 'Total';
  svgEl.appendChild(ct);
  const cv = document.createElementNS(NS, 'text');
  cv.setAttribute('x', CX); cv.setAttribute('y', CY + 10); cv.setAttribute('text-anchor', 'middle');
  cv.setAttribute('font-size', '12'); cv.setAttribute('font-weight', '700'); cv.setAttribute('fill', 'var(--text)');
  cv.textContent = fmt.usd(total);
  svgEl.appendChild(cv);

  // Legend
  legend.innerHTML = '';
  drawn.forEach(({ s, pct, color }) => {
    const li = document.createElement('div');
    li.className = 'pie-legend-item';
    li.innerHTML = `<span class="pie-swatch" style="background:${color}"></span><span class="pie-sym">${escHtml(s.symbol)}</span><span class="pie-pct mono-val">${(pct*100).toFixed(1)}%</span><span class="pie-val mono-val">${fmt.usd(s.value)}</span>`;
    legend.appendChild(li);
  });
}

// Portfolio table
$('hide-small-toggle')?.addEventListener('change', e => {
  hideSmall = e.target.checked;
  renderPortfolioTable();
});

function renderPortfolioTable() {
  const tbody = $('portfolio-tbody');
  if (!tbody) return;
  tbody.innerHTML = '';

  const DUST = 0.05;
  const visible = hideSmall ? cachedTokens.filter(t => t.value >= DUST) : cachedTokens;
  const hidden  = cachedTokens.length - visible.length;
  const dustEl  = $('dust-count');
  if (dustEl) { dustEl.textContent = hideSmall && hidden > 0 ? `(${hidden} hidden)` : ''; }

  // PLS row
  tbody.appendChild(buildPortfolioRow(1, {
    symbol: 'PLS', name: 'PulseChain', logoUrl: cachedPlsLogo, contractAddress: API.WPLS,
  }, cachedPlsBal, cachedPlsPrice, 0, cachedPlsPair, null));

  visible.forEach((t, i) => {
    tbody.appendChild(buildPortfolioRow(i + 2, t, t.balance, t.price, t.change24h, t.pairAddr, t.supplyPct));
  });
}

function getLeague(pct) {
  if (pct === null || pct === undefined) return null;
  if (pct >= 10) return { n: 'Poseidon', e: '🔱' };
  if (pct >= 1)  return { n: 'Whale',    e: '🐋' };
  if (pct >= 0.1)return { n: 'Shark',    e: '🦈' };
  if (pct >= 0.01)return{ n: 'Dolphin',  e: '🐬' };
  if (pct >= 0.001)return{ n:'Squid',    e: '🦑' };
  if (pct >= 0.0001)return{n:'Turtle',   e: '🐢' };
  return null;
}

function buildPortfolioRow(idx, token, balance, price, change24h, pairAddr, supplyPct) {
  const tr = document.createElement('tr');
  tr.onclick = () => { if (pairAddr) window.open(`https://dexscreener.com/pulsechain/${pairAddr}`, '_blank', 'noopener'); };

  // Styled rank badge
  const tdIdx = document.createElement('td');
  const rankBadge = document.createElement('span');
  rankBadge.className = `portfolio-rank${idx === 1 ? ' top1' : idx === 2 ? ' top2' : idx === 3 ? ' top3' : ''}`;
  rankBadge.textContent = idx === 1 ? '🥇' : idx === 2 ? '🥈' : idx === 3 ? '🥉' : String(idx);
  tdIdx.appendChild(rankBadge);

  const tdToken = document.createElement('td');
  const cell = document.createElement('div'); cell.className = 'token-cell';
  const logo = buildLogo(token.logoUrl, token.contractAddress || token.address, token.symbol);
  const nameDiv = document.createElement('div');
  nameDiv.innerHTML = `<div class="token-cell-name">${escHtml(token.name || token.symbol)}</div><div class="token-cell-sym">${escHtml(token.symbol)}</div>`;
  cell.append(logo, nameDiv);
  const league = getLeague(supplyPct);
  if (league) {
    const badge = document.createElement('span'); badge.className = 'league-badge';
    badge.textContent = league.e; badge.title = `${league.n} — ${supplyPct?.toFixed?.(4)}% of supply`;
    cell.appendChild(badge);
  }
  tdToken.appendChild(cell);

  const mkTd = (v, right = true, cls = '') => {
    const td = document.createElement('td');
    if (right) td.style.textAlign = 'right';
    if (cls) td.className = cls;
    td.textContent = v;
    return td;
  };

  const { text: chgText, cls: chgCls } = fmt.change(change24h);
  const chgTd = document.createElement('td');
  chgTd.style.textAlign = 'right';
  const chgSpan = document.createElement('span'); chgSpan.className = chgCls; chgSpan.textContent = chgText;
  chgTd.appendChild(chgSpan);

  tr.append(
    tdIdx, tdToken,
    mkTd(fmt.balance(balance), true, 'mono-val'),
    mkTd(price ? fmt.price(price) : '—', true, 'mono-val'),
    mkTd(price ? fmt.usd(balance * price) : '—', true, 'mono-val'),
    chgTd,
  );
  return tr;
}

// Portfolio history chart
let histKey = null, histCurrency = 'usd', histTf = 'daily';

function renderHistoryChart(key) {
  histKey = key;
  const section = $('portfolio-history');
  if (!section) return;
  const history = History.get(key);

  // Always show the section — even with 1 data point, show a helpful state
  show(section);

  if (history.length === 0) {
    // No data at all — hide
    hide(section);
    return;
  }

  if (history.length === 1) {
    // Only today's snapshot — show a friendly "building" message
    const svgEl = $('history-svg');
    if (svgEl) svgEl.innerHTML = '';
    const overlay = $('history-overlay');
    const tooltip = $('history-tooltip');
    if (overlay) overlay.onmousemove = null;
    if (tooltip) hide(tooltip);

    // Show a placeholder message inside the chart area
    const existing = section.querySelector('.history-building-msg');
    if (existing) existing.remove();
    const msg = document.createElement('div');
    msg.className = 'history-building-msg';
    const val = histCurrency === 'usd'
      ? '$' + Number(history[0].usd || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : Number(history[0].pls || 0).toLocaleString('en-US', { maximumFractionDigits: 0 }) + ' PLS';
    msg.innerHTML = `
      <div class="history-building-icon">📈</div>
      <div class="history-building-title">Chart is building</div>
      <div class="history-building-sub">Today's value: <strong>${escHtml(val)}</strong></div>
      <div class="history-building-sub" style="margin-top:.25rem">Load again tomorrow to start seeing your portfolio history chart grow day by day.</div>
    `;
    const chartWrap = section.querySelector('.history-chart-wrap');
    if (chartWrap) chartWrap.appendChild(msg);
    return;
  }

  // 2+ data points — remove any placeholder message and draw the chart
  const existing = section.querySelector('.history-building-msg');
  if (existing) existing.remove();
  drawHistoryChart(history);
}

function drawHistoryChart(history) {
  const svgEl = $('history-svg');
  if (!svgEl) return;
  svgEl.innerHTML = '';
  const NS = 'http://www.w3.org/2000/svg';

  const agg = histTf === 'daily' ? history : history.filter((_, i, a) => {
    if (histTf === 'weekly')  return new Date(a[i].date + 'T12:00:00Z').getUTCDay() === 1 || i === a.length - 1;
    if (histTf === 'monthly') return i === a.length - 1 || a[i].date.slice(8) === '01';
    return true;
  });

  if (agg.length < 2) return;
  const values = agg.map(p => histCurrency === 'usd' ? p.usd : p.pls);
  const minV = Math.min(...values), maxV = Math.max(...values);
  const yRange = maxV - minV || maxV * 0.1 || 1;
  const W = 720, H = 200;
  const PAD = { t: 20, r: 20, b: 40, l: 70 };
  const CW = W - PAD.l - PAD.r, CH = H - PAD.t - PAD.b;
  const toX = i => PAD.l + (agg.length > 1 ? (i / (agg.length - 1)) * CW : CW / 2);
  const toY = v => PAD.t + (1 - (v - minV) / yRange) * CH;

  // Grid
  for (let i = 0; i <= 4; i++) {
    const v = minV + (i / 4) * yRange;
    const y = toY(v);
    const gl = document.createElementNS(NS, 'line');
    gl.setAttribute('x1', PAD.l); gl.setAttribute('x2', W - PAD.r);
    gl.setAttribute('y1', y);     gl.setAttribute('y2', y);
    gl.setAttribute('stroke', 'var(--border)'); gl.setAttribute('stroke-width', '.5');
    svgEl.appendChild(gl);
    const lbl = document.createElementNS(NS, 'text');
    lbl.setAttribute('x', PAD.l - 6); lbl.setAttribute('y', y + 4);
    lbl.setAttribute('text-anchor', 'end'); lbl.setAttribute('fill', 'var(--text-2)'); lbl.setAttribute('font-size', '10');
    lbl.textContent = histCurrency === 'usd' ? fmt.large(v) : fmt.compact(v);
    svgEl.appendChild(lbl);
  }

  // X labels
  const step = Math.max(1, Math.floor(agg.length / 6));
  for (let i = 0; i < agg.length; i += step) {
    const lbl = document.createElementNS(NS, 'text');
    lbl.setAttribute('x', toX(i).toFixed(1)); lbl.setAttribute('y', PAD.t + CH + 20);
    lbl.setAttribute('text-anchor', 'middle'); lbl.setAttribute('fill', 'var(--text-2)'); lbl.setAttribute('font-size', '10');
    lbl.textContent = new Date(agg[i].date + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
    svgEl.appendChild(lbl);
  }

  // Area + line
  const pts = agg.map((_, i) => [toX(i), toY(values[i])]);
  const line = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const area = `${line} L${pts[pts.length-1][0].toFixed(1)},${PAD.t+CH} L${pts[0][0].toFixed(1)},${PAD.t+CH} Z`;

  const gid = 'hg' + Math.random().toString(36).slice(2, 6);
  const defs = document.createElementNS(NS, 'defs');
  const grad = document.createElementNS(NS, 'linearGradient');
  grad.id = gid; grad.setAttribute('x1','0'); grad.setAttribute('y1','0'); grad.setAttribute('x2','0'); grad.setAttribute('y2','1');
  const s1 = document.createElementNS(NS,'stop'); s1.setAttribute('offset','0%'); s1.setAttribute('stop-color','var(--primary)'); s1.setAttribute('stop-opacity','0.3');
  const s2 = document.createElementNS(NS,'stop'); s2.setAttribute('offset','100%'); s2.setAttribute('stop-color','var(--primary)'); s2.setAttribute('stop-opacity','0');
  grad.append(s1, s2); defs.appendChild(grad); svgEl.appendChild(defs);

  const areaEl = document.createElementNS(NS,'path'); areaEl.setAttribute('d',area); areaEl.setAttribute('fill',`url(#${gid})`); svgEl.appendChild(areaEl);
  const lineEl = document.createElementNS(NS,'path'); lineEl.setAttribute('d',line); lineEl.setAttribute('fill','none'); lineEl.setAttribute('stroke','var(--primary)'); lineEl.setAttribute('stroke-width','2'); lineEl.setAttribute('stroke-linecap','round'); svgEl.appendChild(lineEl);

  // Hover
  const hline = document.createElementNS(NS,'line'); hline.id='h-crosshair'; hline.setAttribute('y1',PAD.t); hline.setAttribute('y2',PAD.t+CH); hline.setAttribute('stroke','var(--text-2)'); hline.setAttribute('stroke-width','1'); hline.setAttribute('stroke-dasharray','4 2'); hline.setAttribute('opacity','0'); svgEl.appendChild(hline);

  const overlay = $('history-overlay');
  const tooltip = $('history-tooltip');
  if (!overlay || !tooltip) return;

  overlay.onmousemove = e => {
    const rect = svgEl.getBoundingClientRect();
    const mx = (e.clientX - rect.left) * (W / rect.width);
    let ni = 0, nd = Infinity;
    pts.forEach(([x], i) => { const d = Math.abs(x - mx); if (d < nd) { nd = d; ni = i; } });
    hline.setAttribute('x1', pts[ni][0]); hline.setAttribute('x2', pts[ni][0]); hline.setAttribute('opacity','1');
    const snap = agg[ni];
    const val  = histCurrency === 'usd' ? fmt.usd(snap.usd) : fmt.pls(snap.pls);
    const dateEl = tooltip.querySelector('.chart-tooltip-date');
    const valEl  = tooltip.querySelector('.chart-tooltip-val');
    if (dateEl) dateEl.textContent = snap.date;
    if (valEl)  valEl.textContent  = val;
    const xPct = (pts[ni][0] / W) * 100;
    tooltip.style.left = xPct + '%';
    tooltip.style.top  = '30%';
    tooltip.style.transform = ni > pts.length / 2 ? 'translate(calc(-100% - 8px), 0)' : 'translate(8px, 0)';
    show(tooltip);
  };
  overlay.onmouseleave = () => { hline.setAttribute('opacity','0'); hide(tooltip); };
}

// History toolbar
document.querySelectorAll('[data-hist-currency]').forEach(b => {
  b.addEventListener('click', () => {
    histCurrency = b.dataset.histCurrency;
    document.querySelectorAll('[data-hist-currency]').forEach(x => x.classList.toggle('active', x === b));
    if (histKey) { const h = History.get(histKey); if (h.length >= 2) drawHistoryChart(h); }
  });
});
document.querySelectorAll('[data-hist-tf]').forEach(b => {
  b.addEventListener('click', () => {
    histTf = b.dataset.histTf;
    document.querySelectorAll('[data-hist-tf]').forEach(x => x.classList.toggle('active', x === b));
    if (histKey) { const h = History.get(histKey); if (h.length >= 2) drawHistoryChart(h); }
  });
});

// Add wallet panel toggle
$('add-wallet-toggle')?.addEventListener('click', () => {
  const panel = $('add-wallet-panel');
  if (!panel) return;
  const open = !panel.classList.contains('hidden');
  if (open) { hide(panel); $('add-wallet-toggle').textContent = '+ Add Wallet'; }
  else { show(panel); $('add-wallet-toggle').textContent = '✕ Close'; }
});

// Groups modal
let groupAddresses = [];

$('create-group-btn')?.addEventListener('click', () => {
  groupAddresses = []; $('group-name-input').value = ''; $('group-id-input').value = '';
  $('group-modal-title').textContent = 'New Group';
  renderGroupAddrList();
  show($('group-modal'));
  $('group-name-input').focus();
});

$('group-modal-close')?.addEventListener('click', () => hide($('group-modal')));
$('group-modal-cancel')?.addEventListener('click', () => hide($('group-modal')));

$('group-add-addr-btn')?.addEventListener('click', () => {
  const a = $('group-addr-input').value.trim();
  if (!a) return;
  if (!isValidAddr(a)) { alert('Invalid address'); return; }
  if (groupAddresses.some(x => x.addr.toLowerCase() === a.toLowerCase())) { alert('Already added'); return; }
  groupAddresses.push({ addr: a, label: $('group-label-input')?.value.trim() || '' });
  $('group-addr-input').value = '';
  if ($('group-label-input')) $('group-label-input').value = '';
  renderGroupAddrList();
});

function renderGroupAddrList() {
  const list = $('group-addr-list');
  if (!list) return;
  list.innerHTML = '';
  if (!groupAddresses.length) { list.innerHTML = '<div style="color:var(--text-3);font-size:.8rem;padding:.5rem 0">No addresses added yet</div>'; return; }
  groupAddresses.forEach((a, i) => {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:.5rem;padding:.35rem 0;border-bottom:1px solid var(--border);font-size:.8rem;';
    row.innerHTML = `<span style="color:var(--text-2);flex:1">${a.label ? `<strong>${escHtml(a.label)}</strong> ` : ''}${escHtml(a.addr)}</span>`;
    const rm = document.createElement('button');
    rm.textContent = '✕'; rm.style.cssText = 'color:var(--text-3);font-size:.75rem;';
    rm.onclick = () => { groupAddresses.splice(i, 1); renderGroupAddrList(); };
    row.appendChild(rm);
    list.appendChild(row);
  });
}

$('group-modal-save')?.addEventListener('click', () => {
  const name = $('group-name-input').value.trim();
  if (!name) { alert('Enter a group name'); return; }
  if (!groupAddresses.length) { alert('Add at least one address'); return; }
  const id = $('group-id-input').value;
  if (id) Groups.update(id, name, groupAddresses);
  else    Groups.add(name, groupAddresses);
  hide($('group-modal'));
  renderGroupSelect();
  renderSavedWallets();
});

/* ══════════════════════════════════════════════════════
   WATCHLIST TAB
   ══════════════════════════════════════════════════════ */

async function loadWatchlistTab() {
  const tokens = Watchlist.getTokens();
  const count  = $('wl-count');
  if (count) count.textContent = tokens.length;

  const empty   = $('wl-empty');
  const loading = $('wl-loading');
  const wrap    = $('wl-table-wrap');

  if (!tokens.length) { show(empty); hide(loading); hide(wrap); return; }
  hide(empty); show(loading); hide(wrap);

  try {
    const map = await API.getPairsByAddresses(tokens.map(t => t.address));
    hide(loading); show(wrap);
    renderWatchlistTable(tokens, map);
  } catch {
    hide(loading); show(wrap);
    renderWatchlistTable(tokens, new Map());
  }
}

function renderWatchlistTable(tokens, pairMap) {
  const tbody = $('wl-tbody');
  if (!tbody) return;
  tbody.innerHTML = '';
  tokens.forEach((token, idx) => {
    const pair = pairMap.get(token.address.toLowerCase());
    const price = Number(pair?.priceUsd || 0);
    const { text: chgText, cls: chgCls } = fmt.change(pair?.priceChange?.h24);
    const logo = API.logoUrl(pair, token.address) || token.logoUrl;

    const tr = document.createElement('tr');
    if (pair?.pairAddress) {
      tr.style.cursor = 'pointer';
      tr.onclick = () => window.open(`https://dexscreener.com/pulsechain/${pair.pairAddress}`, '_blank', 'noopener');
    }

    // Move buttons
    const tdMove = document.createElement('td');
    tdMove.style.cssText = 'white-space:nowrap;';
    const up = document.createElement('button'); up.className = 'wl-move-btn'; up.textContent = '▲'; up.disabled = idx === 0;
    up.onclick = e => { e.stopPropagation(); Watchlist.moveToken(token.address, 'up'); loadWatchlistTab(); };
    const dn = document.createElement('button'); dn.className = 'wl-move-btn'; dn.textContent = '▼'; dn.disabled = idx === tokens.length - 1;
    dn.onclick = e => { e.stopPropagation(); Watchlist.moveToken(token.address, 'down'); loadWatchlistTab(); };
    tdMove.append(up, dn);

    // Token
    const tdToken = document.createElement('td');
    const cell = document.createElement('div'); cell.className = 'token-cell';
    cell.append(buildLogo(logo, token.address, token.symbol), (() => { const d = document.createElement('div'); d.innerHTML = `<div class="token-cell-name">${escHtml(token.name || token.symbol)}</div><div class="token-cell-sym">${escHtml(token.symbol)}</div>`; return d; })());
    tdToken.appendChild(cell);

    const mkTd = (v, right = true, cls = '') => {
      const td = document.createElement('td');
      if (right) td.className = 'r'; if (cls) td.classList.add(cls);
      td.textContent = v; return td;
    };

    const chgTd = document.createElement('td'); chgTd.className = 'r';
    const cs = document.createElement('span'); cs.className = chgCls; cs.textContent = chgText; chgTd.appendChild(cs);

    const rmTd = document.createElement('td'); rmTd.className = 'r';
    const rm = document.createElement('button'); rm.className = 'wl-remove-btn'; rm.textContent = '✕';
    rm.onclick = e => { e.stopPropagation(); Watchlist.removeToken(token.address); loadWatchlistTab(); };
    rmTd.appendChild(rm);

    tr.append(tdMove, tdToken, mkTd(price ? fmt.price(price) : '—', true, 'mono-val'), chgTd, mkTd(fmt.large(pair?.volume?.h24), true, 'mono-val'), mkTd(fmt.large(pair?.marketCap || pair?.fdv), true, 'mono-val'), mkTd(fmt.large(pair?.liquidity?.usd), true, 'mono-val'), rmTd);
    tbody.appendChild(tr);
  });
}

// Add token by address
$('wl-add-btn')?.addEventListener('click', addWatchlistToken);
$('wl-add-input')?.addEventListener('keydown', e => { if (e.key === 'Enter') addWatchlistToken(); });

async function addWatchlistToken() {
  const addr  = $('wl-add-input')?.value.trim();
  const errEl = $('wl-add-error');
  if (errEl) hide(errEl);
  if (!addr) return;
  if (!isValidAddr(addr)) { if (errEl) { errEl.textContent = 'Invalid address'; show(errEl); } return; }
  if (Watchlist.hasToken(addr.toLowerCase())) { if (errEl) { errEl.textContent = 'Already in watchlist'; show(errEl); } return; }
  try {
    const map  = await API.getPairsByAddresses([addr]);
    const pair = map.get(addr.toLowerCase());
    if (!pair) { if (errEl) { errEl.textContent = 'Token not found on PulseChain'; show(errEl); } return; }
    Watchlist.addToken({ address: addr.toLowerCase(), symbol: pair.baseToken?.symbol || '', name: pair.baseToken?.name || '', logoUrl: API.logoUrl(pair, addr) });
    if ($('wl-add-input')) $('wl-add-input').value = '';
    loadWatchlistTab();
  } catch (e) {
    if (errEl) { errEl.textContent = `Error: ${e.message}`; show(errEl); }
  }
}

/* ══════════════════════════════════════════════════════
   SWAP TAB
   ══════════════════════════════════════════════════════ */

let swapInited = false;
function initSwap() {
  if (swapInited) return;
  swapInited = true;
  const iframe = $('swap-iframe');
  if (iframe) iframe.src = 'https://pulsex.mypinata.cloud/ipfs/bafybeiaq4jgcpz4hdzwid6letizdnhijlp6lu5ivcjcp5vbgpgf54jknn4/';
}

/* ══════════════════════════════════════════════════════
   TRADE LOG TAB
   ══════════════════════════════════════════════════════ */

function renderTradeLog() {
  const trades = TradesDB.getTrades();
  const count  = $('trade-count');
  if (count) count.textContent = trades.length;

  const empty = $('trades-empty');
  const wrap  = $('trades-table-wrap');
  if (!trades.length) { show(empty); hide(wrap); renderTradeSummary([]); return; }
  hide(empty); show(wrap);

  renderTradeSummary(trades);

  const tbody = $('trades-tbody');
  if (!tbody) return;
  tbody.innerHTML = '';

  const sorted = [...trades].sort((a, b) => new Date(b.date) - new Date(a.date));
  sorted.forEach(t => {
    const tr = document.createElement('tr');
    const type = document.createElement('td');
    type.innerHTML = `<span class="trade-type-${t.type}">${t.type.toUpperCase()}</span>`;
    const date = new Date(t.date);
    const mkTd = (v, right = false) => { const td = document.createElement('td'); if (right) td.className = 'r'; td.textContent = v; return td; };
    const delTd = document.createElement('td'); delTd.className = 'r';
    const del = document.createElement('button'); del.className = 'wl-remove-btn'; del.textContent = '✕';
    del.onclick = () => { if (!confirm('Delete this trade?')) return; TradesDB.deleteTrade(t.id); renderTradeLog(); };
    delTd.appendChild(del);
    tr.append(type, mkTd(date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' })), mkTd(t.tokenSymbol), mkTd(fmt.balance(t.tokenAmount), true), mkTd(fmt.pls(t.plsAmount), true), mkTd(t.pricePerTokenPls > 0 ? t.pricePerTokenPls.toFixed(6) + ' PLS' : '—', true), delTd);
    tbody.appendChild(tr);
  });
}

function renderTradeSummary(trades) {
  const pairMap = new Map(); // We don't have live prices here, keep it simple
  const { summary } = computeProfits(trades, new Map());
  const setEl = (id, v) => { const e = $(id); if (e) e.textContent = v; };
  setEl('summary-realized', fmt.signedUsd(summary.totalRealizedUsd));
  setEl('summary-unrealized', '—');
  setEl('summary-tokens-traded', summary.tokenCount);
}

// Add trade form
$('add-trade-btn')?.addEventListener('click', () => {
  const panel = $('add-trade-panel');
  if (panel) panel.classList.toggle('hidden');
});

$('trade-form-submit')?.addEventListener('click', () => {
  const type    = $('trade-type-select')?.value;
  const addr    = $('trade-addr-input')?.value.trim();
  const sym     = $('trade-sym-input')?.value.trim();
  const amt     = parseFloat($('trade-amt-input')?.value);
  const pls     = parseFloat($('trade-pls-input')?.value);
  const dateVal = $('trade-date-input')?.value;

  if (!type || !addr || !sym || isNaN(amt) || isNaN(pls) || !dateVal) {
    alert('Fill in all fields'); return;
  }
  TradesDB.addTrade({
    type, tokenAddress: addr.toLowerCase(), tokenSymbol: sym, tokenName: sym,
    date: new Date(dateVal).toISOString(), tokenAmount: amt, plsAmount: pls,
    usdValue: 0, pricePerTokenPls: amt > 0 ? pls / amt : 0, notes: '', txHash: '',
  });
  hide($('add-trade-panel'));
  renderTradeLog();
});

// Import from wallet
$('import-trades-btn')?.addEventListener('click', async () => {
  const addr = $('import-addr-input')?.value.trim();
  if (!addr || !isValidAddr(addr)) { alert('Enter a valid wallet address'); return; }
  const btn = $('import-trades-btn');
  btn.disabled = true; btn.textContent = 'Importing…';
  try {
    const trades = await API.parseWalletTrades(addr);
    const existing = TradesDB.getImportedTxHashes();
    let added = 0;
    trades.forEach(t => {
      if (t.txHash && existing.has(t.txHash)) return;
      TradesDB.addTrade(t); added++;
    });
    alert(`Imported ${added} trades (${trades.length - added} duplicates skipped).`);
    renderTradeLog();
  } catch (e) {
    alert(`Import failed: ${e.message}`);
  } finally {
    btn.disabled = false; btn.textContent = '📥 Import from Wallet';
  }
});

/* ══════════════════════════════════════════════════════
   ECOSYSTEM TAB
   ══════════════════════════════════════════════════════ */

let ecoLoaded = false;
async function loadEcosystem() {
  if (ecoLoaded) return;
  ecoLoaded = true;
  // Ecosystem tab re-runs the home ecosystem load but shows full detail
  loadEcosystemStats();
}

/* ══════════════════════════════════════════════════════
   KEYBOARD SHORTCUTS
   ══════════════════════════════════════════════════════ */

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    hide($('alerts-dropdown'));
    hide($('group-modal'));
    hide($('token-modal'));
  }
});

/* ══════════════════════════════════════════════════════
   TOKEN DETAILS MODAL (Markets/Watchlist click)
   ══════════════════════════════════════════════════════ */

let modalPair = null;
let modalSecLoaded = false, modalWhaleLoaded = false;

function openTokenModal(pair) {
  modalPair = pair; modalSecLoaded = false; modalWhaleLoaded = false;
  const modal = $('token-modal');
  if (!modal) return;

  // Header
  const token = pair.baseToken || {};
  const logoWrap = $('modal-logo-wrap');
  if (logoWrap) { logoWrap.innerHTML = ''; logoWrap.appendChild(buildLogo(API.logoUrl(pair, token.address), token.address, token.symbol, 'lg')); }
  const nm = $('modal-token-name'); if (nm) nm.textContent = token.name || token.symbol || '—';
  const sm = $('modal-token-sym');  if (sm) sm.textContent = token.symbol || '';

  // Switch to overview
  switchModalTab('overview');
  renderModalOverview(pair);
  show(modal);
}

function closeTokenModal() { hide($('token-modal')); modalPair = null; }
$('token-modal-close')?.addEventListener('click', closeTokenModal);
$('token-modal')?.addEventListener('click', e => { if (e.target === $('token-modal')) closeTokenModal(); });

function switchModalTab(tab) {
  document.querySelectorAll('.modal-tab-btn').forEach(b => b.classList.toggle('active', b.dataset.modalTab === tab));
  document.querySelectorAll('.modal-tab-panel').forEach(p => p.classList.toggle('hidden', p.id !== `modal-${tab}`));
  if (tab === 'security' && !modalSecLoaded) { modalSecLoaded = true; loadModalSecurity(); }
  if (tab === 'whales'   && !modalWhaleLoaded) { modalWhaleLoaded = true; loadModalWhales(); }
}
document.querySelectorAll('.modal-tab-btn').forEach(b => b.addEventListener('click', () => switchModalTab(b.dataset.modalTab)));

function renderModalOverview(pair) {
  const c = $('modal-overview');
  if (!c) return;
  c.innerHTML = '';
  const token = pair.baseToken || {};
  const addr  = (token.address || '').toLowerCase();

  if (addr) {
    const sec = document.createElement('div'); sec.className = 'modal-section';
    sec.innerHTML = `<div class="modal-section-title">Contract Address</div>
      <div style="display:flex;align-items:center;gap:.5rem;font-family:var(--mono);font-size:.78rem;color:var(--text-2);word-break:break-all;">${escHtml(addr)}
      <button onclick="navigator.clipboard.writeText('${escHtml(addr)}').then(()=>{this.textContent='✅';setTimeout(()=>this.textContent='📋',1500)})" style="flex-shrink:0;color:var(--text-3);">📋</button>
      <a href="https://scan.pulsechain.com/token/${escHtml(addr)}" target="_blank" rel="noopener" style="flex-shrink:0;color:var(--primary);font-size:.78rem;">🔗 Scan</a></div>`;
    c.appendChild(sec);
  }

  const grid = document.createElement('div'); grid.className = 'modal-section';
  grid.innerHTML = '<div class="modal-section-title">Price Stats</div>';
  const gg = document.createElement('div'); gg.style.cssText = 'display:grid;grid-template-columns:repeat(2,1fr);gap:.5rem;';
  [
    ['Price',      fmt.price(pair.priceUsd)],
    ['24h Change', fmt.change(pair.priceChange?.h24).text],
    ['1h Change',  fmt.change(pair.priceChange?.h1).text],
    ['6h Change',  fmt.change(pair.priceChange?.h6).text],
    ['Volume 24h', fmt.large(pair.volume?.h24)],
    ['Market Cap', fmt.large(pair.marketCap || pair.fdv)],
    ['Liquidity',  fmt.large(pair.liquidity?.usd)],
    ['Txns 24h',   pair.txns?.h24 ? String(Number(pair.txns.h24.buys||0)+Number(pair.txns.h24.sells||0)) : '—'],
  ].forEach(([l, v]) => {
    const s = document.createElement('div'); s.style.cssText = 'background:var(--bg-2);border-radius:6px;padding:.5rem .625rem;';
    s.innerHTML = `<div style="font-size:.68rem;color:var(--text-2);text-transform:uppercase;letter-spacing:.04em;margin-bottom:.2rem">${escHtml(l)}</div><div style="font-weight:700;font-family:var(--mono);font-size:.82rem">${escHtml(v)}</div>`;
    gg.appendChild(s);
  });
  grid.appendChild(gg); c.appendChild(grid);

  const links = [...(pair.info?.websites||[]), ...(pair.info?.socials||[])];
  if (pair.pairAddress || links.length) {
    const ls = document.createElement('div'); ls.className = 'modal-section';
    ls.innerHTML = '<div class="modal-section-title">Links</div>';
    const lw = document.createElement('div'); lw.style.cssText = 'display:flex;flex-wrap:wrap;gap:.4rem;';
    if (pair.pairAddress) {
      const a = document.createElement('a'); a.className = 'swap-link-chip'; a.href = `https://dexscreener.com/pulsechain/${pair.pairAddress}`; a.target='_blank'; a.rel='noopener'; a.textContent = '📈 DexScreener'; lw.appendChild(a);
    }
    (pair.info?.websites||[]).forEach(({ url, label }) => { const a = document.createElement('a'); a.className='swap-link-chip'; a.href=url||'#'; a.target='_blank'; a.rel='noopener'; a.textContent=`🌐 ${label||'Website'}`; lw.appendChild(a); });
    (pair.info?.socials||[]).forEach(({ type, url }) => {
      if (!url) return;
      const labels = { twitter:'𝕏', x:'𝕏', telegram:'✈️', discord:'💬', github:'</>' };
      const a = document.createElement('a'); a.className='swap-link-chip'; a.href=url; a.target='_blank'; a.rel='noopener'; a.textContent=`${labels[type]||'🔗'} ${type||'Link'}`; lw.appendChild(a);
    });
    ls.appendChild(lw); c.appendChild(ls);
  }
}

async function loadModalSecurity() {
  const c = $('modal-security');
  if (!c || !modalPair) return;
  c.innerHTML = '<div class="page-loader"><div class="spinner"></div></div>';
  const addr = (modalPair.baseToken?.address || '').toLowerCase();
  const [sec, meta] = await Promise.all([API.getTokenSecurity(addr), API.getTokenMetadata(addr)]);
  c.innerHTML = '';

  if (!sec) {
    c.innerHTML = '<div style="padding:1rem;color:var(--text-2);font-size:.85rem;">Security data not available for this token.</div>';
    return;
  }

  const isHoneypot = sec.is_honeypot === '1';
  const buyTax     = Number(sec.buy_tax  || 0) * 100;
  const sellTax    = Number(sec.sell_tax || 0) * 100;
  const checks = [
    { l: 'Honeypot',             pass: !isHoneypot,               v: isHoneypot ? 'YES ⚠️' : 'No',  crit: true  },
    { l: 'Open Source',          pass: sec.is_open_source==='1',   v: sec.is_open_source==='1' ? 'Yes' : 'No' },
    { l: 'Buy Tax',              pass: buyTax<=5,                  v: buyTax>0 ? `${buyTax.toFixed(1)}%` : 'None' },
    { l: 'Sell Tax',             pass: sellTax<=5,                 v: sellTax>0 ? `${sellTax.toFixed(1)}%` : 'None' },
    { l: 'Mintable',             pass: sec.is_mintable!=='1',      v: sec.is_mintable==='1' ? 'Yes' : 'No' },
    { l: 'Transfer Pausable',    pass: sec.transfer_pausable!=='1',v: sec.transfer_pausable==='1' ? 'Yes' : 'No' },
    { l: 'Blacklist Function',   pass: sec.is_blacklisted!=='1',   v: sec.is_blacklisted==='1' ? 'Yes' : 'No' },
    { l: 'Hidden Owner',         pass: sec.hidden_owner!=='1',     v: sec.hidden_owner==='1' ? 'Yes' : 'No',    crit: true },
    { l: 'Can Take Back Owner',  pass: sec.can_take_back_ownership!=='1', v: sec.can_take_back_ownership==='1' ? 'Yes' : 'No', crit: true },
  ];

  const crit = checks.filter(c => !c.pass && c.crit).length;
  const warn = checks.filter(c => !c.pass && !c.crit).length;

  const banner = document.createElement('div');
  if (isHoneypot) { banner.className = 'risk-banner risk-high'; banner.textContent = '🚨 HONEYPOT — This token may trap your funds.'; }
  else if (crit > 0) { banner.className = 'risk-banner risk-high'; banner.textContent = '⚠️ HIGH RISK — Multiple critical flags.'; }
  else if (warn > 0) { banner.className = 'risk-banner risk-warn'; banner.textContent = '⚡ MODERATE RISK — Some flags detected. DYOR.'; }
  else { banner.className = 'risk-banner risk-ok'; banner.textContent = '✅ LOW RISK — No major issues detected.'; }
  c.appendChild(banner);

  const list = document.createElement('div'); list.className = 'security-checks';
  checks.forEach(({ l, pass, v, crit }) => {
    const row = document.createElement('div'); row.className = 'security-check';
    const icon = document.createElement('div'); icon.className = `check-icon ${pass ? 'pass' : crit ? 'fail' : 'warn'}`; icon.textContent = pass ? '✓' : '✗';
    const label = document.createElement('span'); label.className = 'check-label'; label.textContent = l;
    const val   = document.createElement('span'); val.className = `check-value ${pass ? 'pass' : crit ? 'fail' : 'warn'}`; val.textContent = v;
    row.append(icon, label, val); list.appendChild(row);
  });
  c.appendChild(list);

  const attr = document.createElement('p'); attr.style.cssText = 'font-size:.68rem;color:var(--text-3);margin-top:.75rem;';
  attr.innerHTML = 'Security data from <a href="https://gopluslabs.io" target="_blank" rel="noopener" style="color:var(--text-2)">GoPlus Security</a>. Always DYOR.';
  c.appendChild(attr);
}

async function loadModalWhales() {
  const c = $('modal-whales');
  if (!c || !modalPair) return;
  c.innerHTML = '<div class="page-loader"><div class="spinner"></div></div>';
  const addr     = (modalPair.baseToken?.address || '').toLowerCase();
  const price    = Number(modalPair.priceUsd || 0);
  const sym      = modalPair.baseToken?.symbol || '';
  const THRESH   = 10_000;
  const transfers = await API.getTokenTransfers(addr);
  c.innerHTML = '';

  const whales = transfers.map(t => {
    const raw = Number(t.total?.value || 0);
    const dec = Number(t.total?.decimals || 18);
    const amount = raw / Math.pow(10, dec);
    return { from: t.from?.hash||'', to: t.to?.hash||'', amount, usd: amount * price, ts: t.timestamp||'', tx: t.tx_hash||'' };
  }).filter(t => price > 0 ? t.usd >= THRESH : t.amount > 0).sort((a,b) => b.usd - a.usd);

  if (!whales.length) { c.innerHTML = `<div style="padding:2rem;text-align:center;color:var(--text-2);font-size:.85rem">🐋 No whale transactions found (≥${fmt.usd(THRESH)})</div>`; return; }

  const hdr = document.createElement('p'); hdr.style.cssText = 'font-size:.78rem;color:var(--text-2);margin-bottom:.75rem;'; hdr.textContent = `${whales.length} large transfer${whales.length!==1?'s':''} found (≥${fmt.usd(THRESH)})`;
  c.appendChild(hdr);

  whales.forEach(({ from, to, amount, usd, ts, tx }) => {
    const row = document.createElement('div'); row.className = 'whale-row';
    const time = ts ? new Date(ts) : null;
    const fmtAddr = h => h ? `<a href="https://scan.pulsechain.com/address/${escHtml(h)}" target="_blank" rel="noopener">${escHtml(h.slice(0,8)+'…'+h.slice(-4))}</a>` : '—';

    row.innerHTML = `
      <div class="whale-time">${time ? time.toLocaleDateString('en-US',{month:'short',day:'numeric',timeZone:'UTC'}) + '<br>' + time.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit',timeZone:'UTC'}) : '—'}</div>
      <div class="whale-addrs"><div class="whale-addr"><span class="whale-dir">From</span>${fmtAddr(from)}</div><div class="whale-addr"><span class="whale-dir">To</span>${fmtAddr(to)}</div></div>
      <div class="whale-val"><div class="whale-usd">${price>0?fmt.usd(usd):'—'}</div><div class="whale-amt">${fmt.balance(amount)} ${escHtml(sym)}</div></div>
      ${tx ? `<a class="whale-tx" href="https://scan.pulsechain.com/tx/${escHtml(tx)}" target="_blank" rel="noopener">🔗</a>` : ''}`;
    c.appendChild(row);
  });
}

/* ══════════════════════════════════════════════════════
   INITIAL LOAD
   ══════════════════════════════════════════════════════ */

switchTab('home');
