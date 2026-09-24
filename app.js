/* Halving Pulse — 比特币区块高度周期指数
 * 公式：每 210000 个区块一周期，减半事件卡在牛市阶段中点（减半后 78750 区块见顶）
 * s = (h + 78750) mod 210000
 * s < 157500  → 牛市：index = s / 157500        （0 → 1 线性上涨）
 * s >= 157500 → 熊市：index = 1 - (s-157500)/52500 （1 → 0 线性下跌）
 */

const CYCLE_BLOCKS = 210000;
const BULL_BLOCKS = 157500;
const BEAR_BLOCKS = 52500;
const HALVING_OFFSET = 78750;
const MS_PER_BLOCK = 10 * 60 * 1000; // 平均出块 10 分钟

// 已知真实减半区块高度 + 日期（用于区块高度→日期的分段线性对齐）
const KNOWN_HALVINGS = [
  { height: 0, date: '2009-01-03T00:00:00Z', label: '创世区块' },
  { height: 210000, date: '2012-11-28T00:00:00Z', label: '第一次减半' },
  { height: 420000, date: '2016-07-09T00:00:00Z', label: '第二次减半' },
  { height: 630000, date: '2020-05-11T00:00:00Z', label: '第三次减半' },
  { height: 840000, date: '2024-04-20T00:00:00Z', label: '第四次减半' },
];

// 下一次减半（预计）：从 840000 锚点按平均 10 分钟/区块推算
const NEXT_HALVING_HEIGHT = 1050000;
const lastKnown = KNOWN_HALVINGS[KNOWN_HALVINGS.length - 1];
const nextHalvingDateMs = new Date(lastKnown.date).getTime() + (NEXT_HALVING_HEIGHT - lastKnown.height) * MS_PER_BLOCK;
const ANCHORS = KNOWN_HALVINGS.map(a => ({ height: a.height, ms: new Date(a.date).getTime(), label: a.label }))
  .concat([{ height: NEXT_HALVING_HEIGHT, ms: nextHalvingDateMs, label: '预计第五次减半' }]);

// 区块高度 → 估算日期（毫秒）：锚点区间内线性插值，锚点区间外按 10 分钟/区块外推
function heightToMs(h) {
  if (h <= ANCHORS[0].height) {
    return ANCHORS[0].ms + (h - ANCHORS[0].height) * MS_PER_BLOCK;
  }
  for (let i = 0; i < ANCHORS.length - 1; i++) {
    const a = ANCHORS[i], b = ANCHORS[i + 1];
    if (h >= a.height && h <= b.height) {
      const ratio = (h - a.height) / (b.height - a.height);
      return a.ms + ratio * (b.ms - a.ms);
    }
  }
  const last = ANCHORS[ANCHORS.length - 1];
  return last.ms + (h - last.height) * MS_PER_BLOCK;
}

// 核心周期指数公式
function heightToIndex(h) {
  const s = ((h + HALVING_OFFSET) % CYCLE_BLOCKS + CYCLE_BLOCKS) % CYCLE_BLOCKS;
  if (s < BULL_BLOCKS) {
    return { value: s / BULL_BLOCKS, phase: 'bull' };
  }
  const decline = (s - BULL_BLOCKS) / BEAR_BLOCKS;
  return { value: 1 - decline, phase: 'bear' };
}

function fmtUSD(n) {
  return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(ms) {
  const d = new Date(ms);
  return d.toISOString().slice(0, 10);
}

// ---------- 数据获取 ----------

async function fetchBlockHeight() {
  const res = await fetch('https://mempool.space/api/blocks/tip/height');
  if (!res.ok) throw new Error('mempool.space 区块高度请求失败: ' + res.status);
  const text = await res.text();
  return parseInt(text, 10);
}

async function fetchPrice() {
  // 2026-09-24治本：原来用Binance API，在中国大陆网络环境下大概率被合规屏蔽访问
  // （老大反馈页面数据一直卡在"加载中"，本服务器境外测试正常但老大浏览器打不开，
  // 换成CoinGecko——不属于交易所，无地域限制，CORS支持良好）
  const res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd');
  if (!res.ok) throw new Error('CoinGecko 价格请求失败: ' + res.status);
  const data = await res.json();
  return data.bitcoin.usd;
}

async function fetchKlines() {
  // 同上原因换成CoinGecko OHLC接口。免费版对days=365只返回约90根4天K线
  // (数据粒度比原来Binance的1000根日K线粗，但换来国内也能正常打开)
  const res = await fetch('https://api.coingecko.com/api/v3/coins/bitcoin/ohlc?vs_currency=usd&days=365');
  if (!res.ok) throw new Error('CoinGecko K线请求失败: ' + res.status);
  const raw = await res.json();
  return raw.map(k => ({
    time: Math.floor(k[0] / 1000),
    open: k[1],
    high: k[2],
    low: k[3],
    close: k[4],
  }));
}

// ---------- 顶部信息栏 ----------

async function refreshTopBar() {
  try {
    const [height, price] = await Promise.all([fetchBlockHeight(), fetchPrice()]);
    document.getElementById('stat-price').textContent = fmtUSD(price);
    document.getElementById('stat-price-src').textContent = 'Binance BTCUSDT';
    document.getElementById('stat-height').textContent = height.toLocaleString('en-US');

    const { value, phase } = heightToIndex(height);
    document.getElementById('stat-index').textContent = value.toFixed(3);

    const badge = document.getElementById('phase-badge');
    const sub = document.getElementById('stat-phase-sub');
    if (phase === 'bull') {
      badge.textContent = '牛市 🐂';
      badge.className = 'phase-badge bull';
      sub.textContent = '指数正朝顶点上涨';
    } else {
      badge.textContent = '熊市 🐻';
      badge.className = 'phase-badge bear';
      sub.textContent = '指数正朝谷底下跌';
    }
    return height;
  } catch (err) {
    console.error('[HalvingPulse] 顶部信息栏刷新失败:', err);
    document.getElementById('stat-price-src').textContent = '获取失败，稍后重试';
  }
}

// ---------- 减半表格 ----------

function renderHalvingTable(currentHeight) {
  const rows = ANCHORS.filter(a => a.height > 0).map(a => {
    const isFuture = currentHeight != null && a.height > currentHeight;
    return `<tr>
      <td>${a.height.toLocaleString('en-US')}</td>
      <td>${fmtDate(a.ms)}</td>
      <td class="${isFuture ? 'future' : ''}">${a.label}${isFuture ? '（预计）' : ''}</td>
    </tr>`;
  }).join('');
  document.getElementById('halving-table').innerHTML = `
    <table>
      <thead><tr><th>区块高度</th><th>估算日期</th><th>事件</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

// ---------- 价格 K 线图 ----------

async function renderPriceChart() {
  const container = document.getElementById('price-chart');
  const chart = LightweightCharts.createChart(container, {
    layout: { background: { color: '#FFFFFF' }, textColor: '#8A8072', fontFamily: 'Inter, sans-serif' },
    grid: { vertLines: { color: '#F3EEE4' }, horzLines: { color: '#F3EEE4' } },
    rightPriceScale: { borderColor: '#ECE6DC' },
    timeScale: { borderColor: '#ECE6DC' },
    autoSize: true,
  });

  const candleSeries = chart.addSeries(LightweightCharts.CandlestickSeries, {
    upColor: '#F7931A',
    downColor: '#4C5C77',
    borderVisible: false,
    wickUpColor: '#F7931A',
    wickDownColor: '#4C5C77',
  });

  try {
    const klines = await fetchKlines();
    candleSeries.setData(klines);

    const firstTime = klines[0].time * 1000;
    const lastTime = klines[klines.length - 1].time * 1000;
    const markers = KNOWN_HALVINGS
      .filter(h => h.height > 0 && new Date(h.date).getTime() >= firstTime && new Date(h.date).getTime() <= lastTime)
      .map(h => ({
        time: Math.floor(new Date(h.date).getTime() / 1000),
        position: 'aboveBar',
        color: '#C0392B',
        shape: 'arrowDown',
        text: h.label,
      }));
    if (markers.length > 0) {
      LightweightCharts.createSeriesMarkers(candleSeries, markers);
    }
    chart.timeScale().fitContent();
  } catch (err) {
    console.error('[HalvingPulse] K线加载失败:', err);
    container.insertAdjacentHTML('beforeend', '<p style="padding:12px;color:#8A8072">价格K线加载失败，请稍后刷新页面重试。</p>');
  }

  window.addEventListener('resize', () => chart.resize(container.clientWidth, container.clientHeight));
}

// ---------- 周期指数波形图 ----------

function renderIndexChart(currentHeight) {
  const container = document.getElementById('index-chart');
  const chart = LightweightCharts.createChart(container, {
    layout: { background: { color: '#FFFFFF' }, textColor: '#8A8072', fontFamily: 'Inter, sans-serif' },
    grid: { vertLines: { color: '#F3EEE4' }, horzLines: { color: '#F3EEE4' } },
    rightPriceScale: { borderColor: '#ECE6DC', visible: false },
    timeScale: { borderColor: '#ECE6DC' },
    autoSize: true,
  });

  const bullSeries = chart.addSeries(LightweightCharts.AreaSeries, {
    lineColor: '#F7931A',
    topColor: 'rgba(247, 147, 26, 0.35)',
    bottomColor: 'rgba(247, 147, 26, 0.02)',
    lineWidth: 2,
    priceLineVisible: false,
    lastValueVisible: false,
  });
  const bearSeries = chart.addSeries(LightweightCharts.AreaSeries, {
    lineColor: '#4C5C77',
    topColor: 'rgba(76, 92, 119, 0.35)',
    bottomColor: 'rgba(76, 92, 119, 0.02)',
    lineWidth: 2,
    priceLineVisible: false,
    lastValueVisible: false,
  });

  const END_HEIGHT = 1200000; // 覆盖到下一次预计减半之后一段
  const STEP = 1500; // 约 10.4 天一个采样点
  const bullData = [];
  const bearData = [];
  const seenTimes = new Set();

  for (let h = 0; h <= END_HEIGHT; h += STEP) {
    const t = Math.floor(heightToMs(h) / 1000);
    if (seenTimes.has(t)) continue; // lightweight-charts 要求时间严格递增
    seenTimes.add(t);
    const { value, phase } = heightToIndex(h);
    if (phase === 'bull') {
      bullData.push({ time: t, value });
      bearData.push({ time: t, value: null });
    } else {
      bearData.push({ time: t, value });
      bullData.push({ time: t, value: null });
    }
  }

  bullSeries.setData(bullData);
  bearSeries.setData(bearData);

  const markers = ANCHORS.filter(a => a.height > 0).map(a => ({
    time: Math.floor(a.ms / 1000),
    position: 'inBar',
    color: '#C0392B',
    shape: 'circle',
    text: a.height > (currentHeight || 0) ? '预计减半' : '减半',
  }));
  LightweightCharts.createSeriesMarkers(bullSeries, markers);

  chart.timeScale().fitContent();
  window.addEventListener('resize', () => chart.resize(container.clientWidth, container.clientHeight));
}

// ---------- 启动 ----------

async function init() {
  const height = await refreshTopBar();
  renderHalvingTable(height);
  renderIndexChart(height);
  await renderPriceChart();

  setInterval(refreshTopBar, 60000);
}

init();
