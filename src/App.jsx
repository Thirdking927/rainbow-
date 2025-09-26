import React, { useEffect, useMemo, useState } from "react";
import {
  AreaChart,
  Area,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Legend,
  CartesianGrid,
} from "recharts";

const HALVINGS = [
  "2012-11-28T00:00:00Z",
  "2016-07-09T00:00:00Z",
  "2020-05-11T00:00:00Z",
  "2024-04-20T00:00:00Z",
];

const RAINBOW = [
  { key: "fire_sale", color: "#4575b4", label: "Fire sale!" },
  { key: "buy", color: "#91bfdb", label: "BUY!" },
  { key: "accumulate", color: "#a6d96a", label: "Accumulate" },
  { key: "cheap", color: "#ffffbf", label: "Still cheap" },
  { key: "bubble?", color: "#fee08b", label: "Is this a bubble?" },
  { key: "sell", color: "#f46d43", label: "Sell. Seriously, sell!" },
  { key: "max_bubble", color: "#d73027", label: "Maximum bubble territory" },
];

/* ---------- math helpers ---------- */
function quadFitLnY(x, yLn) {
  let Sx = 0, Sx2 = 0, Sx3 = 0, Sx4 = 0, Sy = 0, Sxy = 0, Sx2y = 0;
  const n = x.length;
  for (let i = 0; i < n; i++) {
    const xi = x[i];
    const xi2 = xi * xi;
    const yi = yLn[i];
    Sx += xi;
    Sx2 += xi2;
    Sx3 += xi2 * xi;
    Sx4 += xi2 * xi2;
    Sy += yi;
    Sxy += xi * yi;
    Sx2y += xi2 * yi;
  }
  function det3(m) {
    const [a,b,c,d,e,f,g,h,i] = m;
    return a*(e*i - f*h) - b*(d*i - f*g) + c*(d*h - e*g);
  }
  const A  = [Sx4, Sx3, Sx2,  Sx3, Sx2, Sx,  Sx2, Sx, n];
  const B1 = [Sx2y, Sx3, Sx2,  Sxy, Sx2, Sx,  Sy, Sx, n];
  const B2 = [Sx4, Sx2y, Sx2,  Sx3, Sxy, Sx,  Sx2, Sy, n];
  const B3 = [Sx4, Sx3, Sx2y,  Sx3, Sx2, Sxy,  Sx2, Sx, Sy];
  const D  = det3(A);
  const Da = det3(B1);
  const Db = det3(B2);
  const Dc = det3(B3);
  return { a: Da / D, b: Db / D, c: Dc / D };
}
function polyEval2({ a, b, c }, x) {
  return a * x * x + b * x + c;
}

/* ---------- data fetchers with fallbacks ---------- */
async function fetchCoinGecko() {
  const url = "https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=usd&days=max";
  const res = await fetch(url, { headers: { accept: "application/json" }, cache: "no-store" });
  if (!res.ok) throw new Error(`CoinGecko ${res.status}`);
  const j = await res.json();
  return j.prices.map(([t, p]) => ({ date: new Date(t), close: Number(p) }));
}
async function fetchCoinCap() {
  const start = 1367107200000; // 2013-04-28T00:00:00Z
  const end = Date.now();
  const url = `https://api.coincap.io/v2/assets/bitcoin/history?interval=d1&start=${start}&end=${end}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`CoinCap ${res.status}`);
  const j = await res.json();
  if (!j.data) throw new Error("CoinCap bad payload");
  return j.data.map((d) => ({ date: new Date(d.time), close: Number(d.priceUsd) }));
}
async function fetchBlockchain() {
  const url = "https://api.blockchain.info/charts/market-price?format=json&cors=true";
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Blockchain.info ${res.status}`);
  const j = await res.json();
  if (!j.values) throw new Error("Blockchain bad payload");
  return j.values.map((v) => ({ date: new Date(v.x * 1000), close: Number(v.y) }));
}
async function loadBTCSeries() {
  const errs = [];
  try { return await fetchCoinGecko(); } catch (e) { errs.push(e.message); }
  try { return await fetchCoinCap(); } catch (e) { errs.push(e.message); }
  try { return await fetchBlockchain(); } catch (e) { errs.push(e.message); }
  throw new Error(`All data providers failed: ${errs.join(" | ")}`);
}

export default function App() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setError("");
        const rows = await loadBTCSeries();
        // normalize + sort
        const clean = rows
          .filter((r) => isFinite(r.close) && r.close > 0 && r.date instanceof Date)
          .sort((a, b) => a.date - b.date);
        setData(clean);
      } catch (e) {
        setError(String(e?.message || e));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const prepared = useMemo(() => {
    if (!data.length) return null;

    const x = data.map((_, i) => i);
    const yLn = data.map((d) => Math.log(Math.max(d.close, 1e-9)));
    const coeffs = quadFitLnY(x, yLn);
    const fitLn = x.map((xi) => polyEval2(coeffs, xi));
    const residuals = yLn.map((yi, i) => yi - fitLn[i]);
    const meanRes = residuals.reduce((a, b) => a + b, 0) / residuals.length;
    const sdRes = Math.sqrt(
      residuals.reduce((a, b) => a + Math.pow(b - meanRes, 2), 0) / residuals.length
    );

    // boundaries b0..b7 (8 lines → 7 bands)
    const multipliers = [-3, -2, -1, 0, 1, 2, 3, 3.5];
    const boundaries = multipliers.map((m) =>
      data.map((_, i) => Math.exp(fitLn[i] + m * sdRes))
    );

    // prepare stacked spans (no baseValue; more stable in Recharts v2)
    const rows = data.map((d, i) => {
      const b = boundaries.map((arr) => arr[i]);
      const base = b[0];
      return {
        date: d.date,
        price: d.close,
        // cumulative base (transparent)
        base,
        // band spans (upper - lower)
        span1: b[1] - b[0],
        span2: b[2] - b[1],
        span3: b[3] - b[2],
        span4: b[4] - b[3],
        span5: b[5] - b[4],
        span6: b[6] - b[5],
        span7: b[7] - b[6],
      };
    });

    const minY = Math.max(
      1,
      Math.min(
        ...rows.map((r) => Math.min(r.base, r.price))
      )
    );

    return { rows, yMin: minY };
  }, [data]);

  const halvingXs = useMemo(() => {
    if (!prepared) return [];
    const series = prepared.rows;
    return HALVINGS.map((iso) => new Date(iso)).filter(
      (d) => d >= series[0].date && d <= series[series.length - 1].date
    );
  }, [prepared]);

  return (
    <div className="min-h-screen w-full bg-neutral-950 text-neutral-100 flex flex-col">
      <header className="p-4 pb-2">
        <h1 className="text-2xl font-bold">Bitcoin Rainbow Price Chart</h1>
        <p className="text-sm opacity-80">Log-regression bands + halvings • Mobile ready</p>
      </header>

      <main className="flex-1 p-2">
        {loading && <div className="p-6 text-center">Loading BTC history…</div>}
        {error && (
          <div className="p-4 text-red-400 text-sm">
            {error}. Try refresh — or it will retry on next visit.
          </div>
        )}

        {prepared && (
          <div className="h-[70vh] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={prepared.rows} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  {RAINBOW.map((r, idx) => (
                    <linearGradient id={`g${idx}`} x1="0" y1="0" x2="0" y2="1" key={r.key}>
                      <stop offset="0%" stopColor={r.color} stopOpacity={0.75} />
                      <stop offset="100%" stopColor={r.color} stopOpacity={0.15} />
                    </linearGradient>
                  ))}
                </defs>

                <CartesianGrid stroke="#222" vertical={false} />
                <XAxis
                  dataKey="date"
                  tickFormatter={(d) => new Date(d).getFullYear()}
                  tick={{ fill: "#aaa", fontSize: 12 }}
                />
                <YAxis
                  scale="log"
                  domain={[prepared.yMin, "auto"]}
                  tickFormatter={(v) =>
                    `$${Intl.NumberFormat("en", { notation: "compact" }).format(v)}`
                  }
                  tick={{ fill: "#aaa", fontSize: 12 }}
                />
                <Tooltip
                  contentStyle={{ background: "#0f0f10", border: "1px solid #2a2a2a" }}
                  labelFormatter={(d) => new Date(d).toDateString()}
                  formatter={(v, name) => [`$${Number(v).toLocaleString()}`, name]}
                />

                {/* Transparent base to offset stack from zero */}
                <Area type="monotone" dataKey="base" stackId="bands" stroke="none" fill="transparent" />

                {/* 7 stacked spans as rainbow bands */}
                <Area type="monotone" dataKey="span1" stackId="bands" stroke="none" fill="url(#g0)" />
                <Area type="monotone" dataKey="span2" stackId="bands" stroke="none" fill="url(#g1)" />
                <Area type="monotone" dataKey="span3" stackId="bands" stroke="none" fill="url(#g2)" />
                <Area type="monotone" dataKey="span4" stackId="bands" stroke="none" fill="url(#g3)" />
                <Area type="monotone" dataKey="span5" stackId="bands" stroke="none" fill="url(#g4)" />
                <Area type="monotone" dataKey="span6" stackId="bands" stroke="none" fill="url(#g5)" />
                <Area type="monotone" dataKey="span7" stackId="bands" stroke="none" fill="url(#g6)" />

                {/* Price line on top */}
                <Line type="monotone" dataKey="price" stroke="#ffffff" dot={false} strokeWidth={1.6} />

                {/* Halving markers */}
                {halvingXs.map((d) => (
                  <ReferenceLine key={d.toISOString()} x={d} stroke="#888" strokeDasharray="4 4" />
                ))}

                <Legend verticalAlign="bottom" height={36} wrapperStyle={{ color: "#ddd" }} />
              </AreaChart>
            </ResponsiveContainer>

            <div className="grid grid-cols-2 gap-2 mt-3 text-xs">
              {RAINBOW.map((r) => (
                <div key={r.key} className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded" style={{ background: r.color }} />
                  <span className="opacity-90">{r.label}</span>
                </div>
              ))}
            </div>

            <p className="text-[11px] opacity-60 mt-3">
              Bands are illustrative only. Not financial advice.
            </p>
          </div>
        )}
      </main>

      <footer className="p-4 pt-0 text-xs opacity-70 text-center">
        <div>Tip: On mobile Safari/Chrome → Share → "Add to Home Screen" for app-like usage.</div>
      </footer>
    </div>
  );
}

