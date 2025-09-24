```jsx
tick={{ fill: "#aaa", fontSize: 12 }}
/>
<Tooltip
contentStyle={{ background: "#0f0f10", border: "1px solid #2a2a2a" }}
labelFormatter={(d) => new Date(d).toDateString()}
formatter={(v, name) => [
`$${v.toLocaleString()}`,
name === "price" ? "BTC Price" : name,
]}
/>
<Area type="monotone" dataKey="b1" stroke="none" fill="url(#g0)" baseValue={(d) => d.b0} />
<Area type="monotone" dataKey="b2" stroke="none" fill="url(#g1)" baseValue={(d) => d.b1} />
<Area type="monotone" dataKey="b3" stroke="none" fill="url(#g2)" baseValue={(d) => d.b2} />
<Area type="monotone" dataKey="b4" stroke="none" fill="url(#g3)" baseValue={(d) => d.b3} />
<Area type="monotone" dataKey="b5" stroke="none" fill="url(#g4)" baseValue={(d) => d.b4} />
<Area type="monotone" dataKey="b6" stroke="none" fill="url(#g5)" baseValue={(d) => d.b5} />
<Area type="monotone" dataKey="b7" stroke="none" fill="url(#g6)" baseValue={(d) => d.b6} />
<Line type="monotone" dataKey="price" stroke="#ffffff" dot={false} strokeWidth={1.6} />
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
<p className="text-[11px] opacity-60 mt-3">Bands are illustrative only. Not financial advice.</p>
</div>
)}
</main>

<footer className="p-4 pt-0 text-xs opacity-70 text-center">
<div>Tip: On mobile Safari/Chrome → Share → "Add to Home Screen" for app-like usage.</div>
</footer>
</div>
);
}
```
