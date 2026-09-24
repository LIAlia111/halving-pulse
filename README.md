# Halving Pulse

比特币减半周期心跳节律可视化 — 用区块高度而非日历时间做时间轴，追踪每 21 万个区块一个完整牛熊周期。

**在线访问**：https://LIAlia111.github.io/halving-pulse/

## 方法论

不用日历时间，用比特币区块高度作为唯一时间轴。每 21 万个区块（约 4 年）算一个完整周期，与减半事件对齐：

- 每周期 75%（157500 个区块）为牛市阶段，25%（52500 个区块）为熊市阶段
- 减半事件精确卡在牛市阶段的中点：减半后 78750 个区块见顶
- 公式：设 `s = (h + 78750) mod 210000`
  - `s < 157500` → 牛市，指数 `= s / 157500`（0 → 1 线性上涨）
  - `s >= 157500` → 熊市，指数 `= 1 - (s - 157500) / 52500`（1 → 0 线性下跌）

思路参考自开源项目 [wolfyxbt/wolfy-wave-index](https://github.com/wolfyxbt/wolfy-wave-index)，本仓库为独立实现，配色/命名/视觉风格均不同。

## 数据来源（全部为浏览器直接调用的公开 API，无需 key）

- 实时区块高度：`mempool.space/api/blocks/tip/height`
- 实时 & 历史价格（日线K线）：Binance 公开行情接口 `api.binance.com`
- 区块高度 → 日期：已知减半日期做锚点分段线性插值，未来区块按平均出块 10 分钟外推

## 技术栈

纯静态页面，无构建工具、无后端：

- `index.html` / `style.css` / `app.js`
- 图表库：[TradingView Lightweight Charts](https://github.com/tradingview/lightweight-charts) v5（CDN 引入）

## 本地运行

```bash
python3 -m http.server 8080
# 打开 http://localhost:8080
```

## 部署

纯静态站点，直接用 GitHub Pages（main 分支根目录）托管。
