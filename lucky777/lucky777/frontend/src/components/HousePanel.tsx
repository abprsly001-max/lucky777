import { useEffect, useState } from "react";
import { api, type HouseStats } from "../api";

export default function HousePanel() {
  const [s, setS] = useState<HouseStats | null>(null);
  const [err, setErr] = useState("");

  const load = () => api.houseStats().then(setS).catch((e) => setErr(e.message));
  useEffect(() => { load(); const t = setInterval(load, 4000); return () => clearInterval(t); }, []);

  if (err) return <div className="rounded-xl border border-white/5 bg-base-800 shadow-card p-6 text-sm text-red-400">{err}</div>;
  if (!s) return <div className="rounded-xl border border-white/5 bg-base-800 shadow-card p-6 text-sm text-slate-500">loading…</div>;

  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-white/5 bg-base-800 shadow-card p-6">
        <h2 className="text-sm font-semibold text-slate-200">Staff account</h2>
        <p className="mt-1 max-w-2xl text-xs leading-relaxed text-slate-400">{s.note}</p>
        <div className="mt-4 flex flex-wrap gap-8">
          <Stat label="House balance" value={Number(s.house_balance).toLocaleString(undefined, { maximumFractionDigits: 2 })}
            tone={Number(s.house_balance) >= 0 ? "up" : "down"} />
          <Stat label="Players" value={String(s.players)} />
        </div>
      </section>

      <div className="grid gap-5 md:grid-cols-2">
        <GameCard title="Sportsbook" data={s.sportsbook} />
        <GameCard title="Duel" data={s.duel} highlight />
      </div>

      <p className="px-1 text-[11px] leading-relaxed text-slate-500">
        Realised edge is computed from the ledger, not from the config — it is what the house
        actually kept. If it drifts away from the advertised number by more than sampling noise,
        the games are not doing what they claim, and this page is where you would see it.
      </p>
    </div>
  );
}

function GameCard({ title, data, highlight = false }: {
  title: string; data: Record<string, string | number>; highlight?: boolean;
}) {
  const rows: [string, string][] = [
    ["Rounds", String(data.rounds ?? 0)],
    ["Wagered", fmt(data.wagered)],
    ["Paid out", fmt(data.paid_out)],
    ["House profit", fmt(data.house_profit)],
    ["Realised edge", `${data.realised_edge_pct ?? "—"}%`],
    ["Advertised edge", `${data.advertised_edge_pct ?? "—"}%`],
  ];
  if (data.open_liability !== undefined) {
    rows.splice(4, 0, ["Open liability", fmt(data.open_liability)]);
  }
  if (data.house_win_rate_pct !== undefined) {
    rows.splice(1, 0,
      ["House win rate", `${data.house_win_rate_pct}%`],
      ["Advertised win rate", `${data.advertised_house_win_pct}%`]);
  }

  return (
    <section className={`rounded-xl p-5 ${highlight ? "bg-gold/10 ring-1 ring-gold/25" : "bg-base-800"}`}>
      <h3 className={`mb-3 text-sm font-semibold ${highlight ? "text-gold" : "text-slate-200"}`}>
        {title}
      </h3>
      <div className="space-y-1 text-xs">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between border-b border-white/5 py-1 last:border-0">
            <span className="text-slate-400">{k}</span>
            <span className="font-mono text-slate-100">{v}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "up" | "down" }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`font-mono text-2xl font-bold ${
        tone === "up" ? "text-accent" : tone === "down" ? "text-red-400" : "text-slate-100"}`}>
        {value}
      </div>
    </div>
  );
}

const fmt = (v: string | number | undefined) =>
  v === undefined ? "—" : Number(v).toLocaleString(undefined, { maximumFractionDigits: 2 });
