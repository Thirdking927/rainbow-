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
function polyEval2({ a, b, c }, x) { return a * x * x + b * x + c; }

/* ---------- data fetchers with fallbacks ---------- */
async function fetchCoinGecko() {
  const url = "https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=usd&days=max";
  const res = await fetch(url, { headers: { accept: "application/json" }, cache: "no-store" });
  if (!res.ok) throw new Error(`CoinGecko ${res.status}`);
  const j = await res.json();
  return j.prices.map(([t, p]) => ({ t, price: Number(p) })); // t = timestamp (ms)
}
async function fetchCoinCap() {
  const start = 1367107200000; // 2013-04-28T00:00:00Z
  const end = Date.now();
  const url = `https://api.coincap.io/v2/assets/bitcoin/history?interval=d1&start=${start}&end=${end}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`CoinCap ${res.status}`);
  const j = await res.json();
  if (!j.data) throw new Error("CoinCap bad payload");
  return j.data.map((d) => ({ t: Number(d.time), price: Number(d.priceUsd) }));
}
async function fetchBlockchain() {
  const url = "https://api.blockchain.info/charts/market-price?format=json&cors=true";
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Blockchain.info ${res.status}`);
  const j = await res.json();
  if (!j.values) throw new Error("Blockchain bad payload");
  return j.values.map((v) => ({ t: Number(v.x) * 1000, price: Number(v.y) }));
}
async function loadBTCSeries() {
  const errs = [];
  try { return await fetchCoinGecko(); } catch (e) { errs.push(e.message); }
  try { return await fetchCoinCap(); } catch (e) { errs.push(e.message); }
  try { return await fetchBlockchain(); } catch (e) { errs.push(e.message); }
  throw new Error(`All data providers failed: ${errs.join(" | ")}`);
}

export default function App() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setError("");
        const series = await loadBTCSeries();
        const clean = series
          .filter((r) => isFinite(r.price) && r.price > 0 && isFinite(r.t))
          .sort((a, b) => a.t - b.t);
        setRows(clean);
      } catch (e) {
        setError(String(e?.message || e));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const prepared = useMemo(() => {
    if (!rows.length) return null;

    const x = rows.map((_, i) => i);
    const yLn = rows.map((d) => Math.log(Math.max(d.price, 1e-9)));
    const coeffs = quadFitLnY(x, yLn);
    const fitLn = x.map((xi) => polyEval2(coeffs, xi));
    const residuals = yLn.map((yi, i) => yi - fitLn[i]);
    const meanRes = residuals.reduce((a, b) => a + b, 0) / residuals.length;
    const sdRes = Math.sqrt(
      residuals.reduce((a, b) => a + Math.pow(b - meanRes, 2), 0) / residuals.length
    );

    // boundaries → stacked spans
    const multipliers = [-3, -2, -1, 0, 1, 2, 3, 3.5];
    const boundaries = multipliers.map((m) =>
      rows.map((_, i) => Math.exp(fitLn[i] + m * sdRes))
    );

    const data = rows.map((d, i) => {
      const b = boundaries.map((arr) => arr[i]);
      const base = b[0];
      return {
        t: d.t,
        price: d.price,
        base,
        span1: b[1] - b[0],
        span2: b[2] - b[1],
        span3: b[3] - b[2],
        span4: b[4] - b[3],
        span5: b[5] - b[4],
        span6: b[6] - b[5],
        span7: b[7] - b[6],
      };
    });

    const yMin = Math.max(1, Math.min(...data.map((r) => Math.min(r.base, r.price))));
    const halvingTs = HALVINGS.map((iso) => Date.parse(iso)).filter(
      (t) => t >= data[0].t && t <= data[data.length - 1].t
    );

    return { data, yMin, halvingTs };
  }, [rows]);

  return (
    <div style={{ minHeight: "100vh", width: "100%", background: "#0f0f10", color: "#eee", display: "flex", flexDirection: "column" }}>
      <header style={{ padding: "16px 16px 8px 16px" }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>Bitcoin Rainbow Price Chart</h1>
        <p style={{ margin: "4px 0 0 0", fontSize: 13, opacity: 0.8 }}>Log-regression bands + halvings • Mobile ready</p>
      </header>

      <main style={{ flex: 1, padding: 8 }}>
        {loading && <div style={{ padding: 24, textAlign: "center" }}>Loading BTC history…</div>}
        {error && (
          <div style={{ padding: 12, color: "#fca5a5", fontSize: 13 }}>
            {error}. Try refresh — we’ll switch providers automatically.
          </div>
        )}

        {prepared && (
          <div style={{ width: "100%", height: 420 /* fixed height so it renders everywhere */ }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={prepared.data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
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
                  dataKey="t"
                  type="number"
                  scale="time"
                  tickFormatter={(ms) => new Date(ms).getFullYear()}
                  tick={{ fill: "#aaa", fontSize: 12 }}
                />
                <YAxis
                  scale="log"
                  domain={[prepared.yMin, "auto"]}
                  tickFormatter={(v) => `$${Intl.NumberFormat("en", { notation: "compact" }).format(v)}`}
                  tick={{ fill: "#aaa", fontSize: 12 }}
                />
                <Tooltip
                  contentStyle={{ background: "#0f0f10", border: "1px solid #2a2a2a" }}
                  labelFormatter={(ms) => new Date(ms).toDateString()}
                  formatter={(v, name) => [`$${Number(v).toLocaleString()}`, name]}
                />

                {/* stacked rainbow */}
                <Area type="monotone" dataKey="base"  stackId="bands" stroke="none" fill="transparent" isAnimationActive={false} />
                <Area type="monotone" dataKey="span1" stackId="bands" stroke="none" fill="url(#g0)" isAnimationActive={false} />
                <Area type="monotone" dataKey="span2" stackId="bands" stroke="none" fill="url(#g1)" isAnimationActive={false} />
                <Area type="monotone" dataKey="span3" stackId="bands" stroke="none" fill="url(#g2)" isAnimationActive={false} />
                <Area type="monotone" dataKey="span4" stackId="bands" stroke="none" fill="url(#g3)" isAnimationActive={false} />
                <Area type="monotone" dataKey="span5" stackId="bands" stroke="none" fill="url(#g4)" isAnimationActive={false} />
                <Area type="monotone" dataKey="span6" stackId="bands" stroke="none" fill="url(#g5)" isAnimationActive={false} />
                <Area type="monotone" dataKey="span7" stackId="bands" stroke="none" fill="url(#g6)" isAnimationActive={false} />

                {/* price line */}
                <Line type="monotone" dataKey="price" stroke="#ffffff" dot={false} strokeWidth={1.6} isAnimationActive={false} />

                {/* halvings */}
                {prepared.halvingTs.map((t) => (
                  <ReferenceLine key={t} x={t} stroke="#888" strokeDasharray="4 4" />
                ))}

                <Legend verticalAlign="bottom" height={36} wrapperStyle={{ color: "#ddd" }} />
              </AreaChart>
            </ResponsiveContainer>

            {/* legend below chart */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 12, fontSize: 12 }}>
              {RAINBOW.map((r) => (
                <div key={r.key} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ width: 12, height: 12, borderRadius: 4, background: r.color, display: "inline-block" }} />
                  <span style={{ opacity: 0.9 }}>{r.label}</span>
                </div>
              ))}
            </div>

            <p style={{ fontSize: 11, opacity: 0.6, marginTop: 12 }}>
              Bands are illustrative only. Not financial advice.
            </p>
          </div>
        )}
      </main>

      <footer style={{ padding: "0 16px 16px 16px", fontSize: 12, opacity: 0.7, textAlign: "center" }}>
        <div>Tip: On mobile Safari/Chrome → Share → "Add to Home Screen" for app-like usage.</div>
      </footer>
    </div>
  );
}
