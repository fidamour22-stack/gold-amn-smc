/* GOLD AMN + SMC live-feed add-on
   Uses Yahoo Finance public XAUUSD=X candles. Feed access, history and delays
   are controlled by Yahoo; this is an experimental public endpoint.
   Refreshes once per minute while the app page remains open.
*/
(() => {
  const $ = id => document.getElementById(id);
  if (!$('liveConnect') || !$('liveStatus')) return;

  async function getCandles(range, interval) {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/XAUUSD=X?range=${range}&interval=${interval}`;
    const res = await fetch(url, {cache: 'no-store'});
    if (!res.ok) throw new Error(`Data provider HTTP ${res.status}`);
    const json = await res.json();
    const r = json.chart?.result?.[0];
    if (!r?.timestamp?.length) throw new Error(`No ${interval} candles received`);
    const q = r.indicators.quote[0];
    return r.timestamp.map((t, i) => ({
      time: new Date(t * 1000).toISOString(),
      open: q.open[i], high: q.high[i], low: q.low[i], close: q.close[i]
    })).filter(c => [c.open,c.high,c.low,c.close].every(Number.isFinite));
  }

  function resample(candles, mins) {
    const map = new Map();
    for (const c of candles) {
      const bucket = Math.floor(Date.parse(c.time) / (mins * 60000)) * mins * 60000;
      if (!map.has(bucket)) map.set(bucket, {
        time: new Date(bucket).toISOString(),
        open: c.open, high: c.high, low: c.low, close: c.close
      });
      else {
        const b = map.get(bucket);
        b.high = Math.max(b.high, c.high);
        b.low = Math.min(b.low, c.low);
        b.close = c.close;
      }
    }
    return [...map.values()].sort((a,b) => Date.parse(a.time)-Date.parse(b.time));
  }

  let timer = null, busy = false;
  async function refresh() {
    if (busy) return;
    busy = true;
    $('liveStatus').textContent = 'Fetching XAUUSD candles…';
    try {
      const [hourly, fifteen, one] = await Promise.all([
        getCandles('1mo','1h'), getCandles('5d','15m'), getCandles('1d','1m')
      ]);
      const h4 = resample(hourly, 240).slice(-120);
      if (h4.length < 10 || fifteen.length < 10 || one.length < 10)
        throw new Error('Not enough candle history was supplied');
      // Integrates with the existing analyzer's global data object.
      window.data.h4 = h4;
      window.data.m15 = fifteen.slice(-500);
      window.data.m1 = one.slice(-500);
      window.analyze();
      $('liveStatus').textContent =
        `Connected · updated ${new Date().toLocaleTimeString()} · ${h4.length} 4H / ${fifteen.length} 15M / ${one.length} 1M candles.`;
      const msg = $('loadmsg');
      if (msg) msg.textContent = 'Live XAUUSD candles loaded. Verify spread and chart before trading.';
    } catch (err) {
      $('liveStatus').textContent =
        `Live feed unavailable: ${err.message}. Manual CSV upload remains available.`;
    } finally { busy = false; }
  }

  $('liveConnect').addEventListener('click', async () => {
    if (timer) clearInterval(timer);
    await refresh();
    timer = setInterval(refresh, 60000);
  });
  $('liveStop').addEventListener('click', () => {
    if (timer) clearInterval(timer);
    timer = null;
    $('liveStatus').textContent = 'Auto-refresh stopped.';
  });
  window.refreshGoldLiveData = refresh;
})();
