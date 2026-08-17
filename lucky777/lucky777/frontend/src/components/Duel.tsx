import { useEffect, useState } from "react";
import { api, type DuelResult, type DuelRules } from "../api";

interface Props {
  onBalance: (b: string) => void;
  onNonce: (n: number) => void;
}

export default function Duel({ onBalance, onNonce }: Props) {
  const [rules, setRules] = useState<DuelRules | null>(null);
  const [stake, setStake] = useState("1");
  const [last, setLast] = useState<DuelResult | null>(null);
  const [log, setLog] = useState<DuelResult[]>([]);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [tally, setTally] = useState({ n: 0, houseWins: 0, wagered: 0, returned: 0 });

  useEffect(() => { api.duelRules().then(setRules).catch(() => {}); }, []);

  async function take() {
    setErr(""); setBusy(true);
    try {
      const r = await api.duelBet(stake);
      setLast(r);
      setLog((p) => [r, ...p].slice(0, 10));
      onBalance(r.balance);
      onNonce(r.nonce);
      setTally((t) => ({
        n: t.n + 1,
        houseWins: t.houseWins + (r.house_wins ? 1 : 0),
        wagered: t.wagered + Number(r.stake),
        returned: t.returned + Number(r.payout),
      }));
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  }

  const threshold = Number(rules?.house_win_probability ?? 0.63);

  return (
    <div className="grid gap-5 lg:grid-cols-[300px_1fr]">
      {/* ---- the deal, stated plainly */}
      <section className="rounded-xl border border-white/5 bg-base-800 shadow-card p-4">
        <h2 className="mb-1 text-sm font-semibold text-slate-200">Duel — the house is favoured</h2>
        <p className="mb-3 text-xs leading-relaxed text-slate-400">
          {rules?.summary ?? "loading…"}
        </p>

        <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3">
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-red-400">
            House edge
          </div>
          <div className="font-mono text-2xl font-bold text-red-300">
            {rules?.house_edge_pct ?? "—"}%
          </div>
          <div className="mt-1 text-[11px] leading-snug text-red-200/70">
            You are expected to lose {rules?.house_edge_pct ?? "—"} credits of every 100 wagered.
            This is a bad bet by design, and it says so here.
          </div>
        </div>

        <label className="mb-1 block text-xs uppercase tracking-wide text-slate-500">Stake</label>
        <input className="mb-2 w-full rounded bg-base-700 px-3 py-2 font-mono text-sm outline-none"
          value={stake} onChange={(e) => setStake(e.target.value)} inputMode="decimal" />
        <div className="mb-4 flex gap-1">
          {["1", "5", "25", "100"].map((v) => (
            <button key={v} onClick={() => setStake(v)}
              className="flex-1 rounded bg-base-700 py-1 text-xs hover:bg-base-600">{v}</button>
          ))}
        </div>

        <button onClick={take} disabled={busy}
          className="w-full rounded-lg btn-gold py-3 text-sm font-bold text-base-900 disabled:opacity-50">
          Take the bet
        </button>

        {err && <div className="mt-3 rounded bg-red-950 px-2 py-1.5 text-xs text-red-300">{err}</div>}

        {rules && (
          <div className="mt-4 space-y-1 border-t border-base-700 pt-3 text-xs text-slate-400">
            <Row k="Win pays" v={`${rules.payout_multiplier}x`} />
          </div>
        )}

        {tally.n > 0 && (
          <div className="mt-3 space-y-1 border-t border-base-700 pt-3 text-xs text-slate-400">
            <div className="mb-1 text-[10px] uppercase tracking-wide text-slate-500">Your session</div>
            <Row k="Rounds" v={String(tally.n)} />
            <Row k="Net" v={(tally.returned - tally.wagered).toFixed(2)}
              cls={tally.returned - tally.wagered >= 0 ? "text-accent" : "text-red-400"} />
          </div>
        )}
      </section>

      {/* ---- the roll */}
      <section className="rounded-xl border border-white/5 bg-base-800 shadow-card p-6">
        <div className="mb-2 flex justify-between text-[11px] uppercase tracking-wide">
          <span className="text-red-400">house</span>
          <span className="text-accent">you</span>
        </div>

        {/* the number line, with the threshold drawn where it actually is */}
        <div className="relative h-14 overflow-hidden rounded-lg bg-base-900">
          <div className="absolute inset-y-0 left-0 bg-red-500/25"
            style={{ width: `${threshold * 100}%` }} />
          <div className="absolute inset-y-0 bg-accent/25"
            style={{ left: `${threshold * 100}%`, right: 0 }} />
          <div className="absolute inset-y-0 w-px bg-slate-300"
            style={{ left: `${threshold * 100}%` }} />
          {last && (
            <div className="absolute -top-1 flex flex-col items-center transition-all duration-300"
              style={{ left: `calc(${Number(last.roll) * 100}% - 10px)` }}>
              <div className={`h-16 w-1 rounded ${last.house_wins ? "bg-red-300" : "bg-accent"}`} />
            </div>
          )}
        </div>

        {last ? (
          <div className="mt-6 text-center">
            <div className={`text-3xl font-bold ${last.house_wins ? "text-red-300" : "text-accent"}`}>
              {last.house_wins ? "House takes it" : "You win"}
            </div>
            <div className={`mt-1 font-mono text-lg ${Number(last.profit) >= 0 ? "text-accent" : "text-red-400"}`}>
              {Number(last.profit) >= 0 ? "+" : ""}{Number(last.profit).toFixed(2)}
            </div>
          </div>
        ) : (
          <div className="mt-10 text-center text-sm text-slate-500">
            Take a bet to draw the line.
          </div>
        )}

        {log.length > 0 && (
          <div className="mt-8 border-t border-base-700 pt-3">
            <div className="mb-2 text-[10px] uppercase tracking-wide text-slate-500">Last rounds</div>
            <div className="space-y-1 font-mono text-xs">
              {log.map((r) => (
                <div key={r.round_id} className="flex justify-between text-slate-400">
                  <span>#{r.nonce}</span>
                  <span>{r.roll}</span>
                  <span className={r.house_wins ? "text-red-400" : "text-accent"}>
                    {r.house_wins ? "house" : "player"}
                  </span>
                  <span className={Number(r.profit) >= 0 ? "text-accent" : "text-red-400"}>
                    {Number(r.profit) >= 0 ? "+" : ""}{Number(r.profit).toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function Row({ k, v, cls = "" }: { k: string; v: string; cls?: string }) {
  return (
    <div className="flex justify-between py-0.5">
      <span>{k}</span><span className={`font-mono ${cls || "text-slate-200"}`}>{v}</span>
    </div>
  );
}
