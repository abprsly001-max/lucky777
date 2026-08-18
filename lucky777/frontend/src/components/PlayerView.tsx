import { useEffect, useState } from "react";
import { api, clearToken, type SbBet } from "../api";
import { APP_VERSION, setOddsFmt, useOddsFmt, type OddsFmt } from "../prefs";
import Duel from "./Duel";
import GameArt, { SYMBOL_GLYPH } from "./GameArt";
import Sportsbook from "./Sportsbook";

type Tab = "board" | "casino" | "wagers" | "figures" | "rules"
  | "transactions" | "scores" | "settings" | "horses";

const money = (v: string | number) =>
  Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function PlayerView({ onBalance, username }: {
  onBalance: (b: string) => void; username?: string;
}) {
  const [tab, setTab] = useState<Tab>("board");
  const [fp, setFp] = useState("0");
  const [menu, setMenu] = useState(false);
  const [fig, setFig] = useState<Awaited<ReturnType<typeof api.myFigures>> | null>(null);

  const refresh = () => {
    api.balance().then((b) => setFp(b.free_play)).catch(() => {});
    api.myFigures().then(setFig).catch(() => {});
  };
  useEffect(() => { refresh(); }, []);

  const balanced = (b: string) => { onBalance(b); refresh(); };

  const tabs: { id: Tab; label: string }[] = [
    { id: "board", label: "Sportsbook" },
    { id: "casino", label: "Casino" },
    { id: "wagers", label: "My Wagers" },
    { id: "figures", label: "My Figures" },
    { id: "rules", label: "Rules" },
  ];

  const MENU: { id: Tab; icon: string; label: string }[] = [
    { id: "figures", icon: "📈", label: "Weekly Figures" },
    { id: "wagers", icon: "📝", label: "Pending Wagers" },
    { id: "transactions", icon: "🔁", label: "Transactions" },
    { id: "rules", icon: "ℹ️", label: "Rules" },
    { id: "scores", icon: "🗓️", label: "Scores" },
    { id: "horses", icon: "🐎", label: "Horses" },
    { id: "casino", icon: "🎲", label: "Casino" },
    { id: "settings", icon: "⚙️", label: "Settings" },
  ];

  return (
    <div className="space-y-4 pb-16 sm:pb-0">
      <nav className="hidden flex-wrap items-center gap-1.5 sm:flex">
        <button onClick={() => setMenu(true)}
          className="rounded-lg border border-white/5 bg-base-800 shadow-card px-3 py-1.5 text-base leading-none text-gold hover:bg-base-700"
          aria-label="menu">
          ☰
        </button>
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition ${
              tab === t.id ? "btn-gold text-base-900"
                : "border border-white/5 bg-base-800 text-slate-300 shadow-card hover:border-white/15 hover:bg-base-700 hover:text-slate-100"}`}>
            {t.label}
          </button>
        ))}
        {Number(fp) > 0 && (
          <span className="ml-auto rounded-lg bg-sky-500/15 px-3 py-1.5 font-mono text-xs font-semibold text-sky-300">
            Free play {money(fp)}
          </span>
        )}
      </nav>

      {/* ------------- the drawer: stats + everything, one tap away ------------- */}
      {menu && (
        <>
          <div className="fixed inset-0 z-30 bg-black/60 backdrop-blur-[2px]" onClick={() => setMenu(false)} />
          <aside className="fixed inset-y-0 left-0 z-40 w-[290px] overflow-y-auto border-r border-white/10 bg-base-800/95 shadow-pop backdrop-blur">
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
              <span className="flex items-center gap-2.5 text-sm font-bold text-slate-100">
                <span className="grid h-8 w-8 place-items-center rounded-full bg-gradient-to-b from-gold-400/25 to-gold-600/10 text-xs font-black uppercase text-gold ring-1 ring-gold/30">
                  {(username ?? "me").slice(0, 2)}
                </span>
                {username ?? "My account"}
              </span>
              <button onClick={() => setMenu(false)}
                className="grid h-7 w-7 place-items-center rounded-lg border border-white/10 text-xs text-slate-400 hover:border-white/20 hover:text-slate-200">✕</button>
            </div>

            <div className="space-y-2 border-b border-white/10 px-4 py-3 text-sm">
              {([
                ["Balance", fig?.balance, Number(fig?.balance ?? 0) < 0 ? "text-red-400" : "text-accent"],
                ["Pending", fig?.pending, "text-amber-300"],
                ["Available", fig?.available, "text-accent"],
                ["Free Play", fig?.free_play, "text-sky-300"],
              ] as const).map(([k, v, cls]) => (
                <div key={k} className="flex items-baseline justify-between border-b border-base-700/60 pb-1.5 last:border-0 last:pb-0">
                  <span className="text-slate-400">{k}</span>
                  <span className={`font-mono font-bold ${cls}`}>{v !== undefined ? money(v) : "…"}</span>
                </div>
              ))}
            </div>

            <div>
              {MENU.map((m) => (
                <button key={m.id}
                  onClick={() => { setTab(m.id); setMenu(false); }}
                  className={`flex w-full items-center gap-3 border-b border-base-700/60 px-4 py-3 text-left text-sm ${
                    tab === m.id ? "bg-base-700/60 text-gold" : "text-slate-200 hover:bg-base-700/40"}`}>
                  <span className="text-base">{m.icon}</span> {m.label}
                </button>
              ))}
              <button onClick={() => { clearToken(); location.reload(); }}
                className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-red-300 hover:bg-base-700/40">
                <span className="text-base">⏻</span> Sign Out
              </button>
            </div>
          </aside>
        </>
      )}

      {/* phone app bar */}
      <div className="fixed inset-x-0 bottom-0 z-50 grid h-14 grid-cols-5 border-t border-white/10 bg-base-900/95 backdrop-blur sm:hidden">
        {([["board", "🏈", "Sports"], ["casino", "🎰", "Casino"],
           ["wagers", "🧾", "My Bets"], ["figures", "📊", "Figures"]] as const)
          .map(([id, icon, label]) => (
          <button key={id} onClick={() => setTab(id)}
            className={`flex flex-col items-center justify-center gap-0.5 text-[9px] font-bold ${
              tab === id ? "text-gold" : "text-slate-400"}`}>
            <span className="text-lg leading-none">{icon}</span>{label}
          </button>
        ))}
        <button onClick={() => setMenu(true)}
          className="flex flex-col items-center justify-center gap-0.5 text-[9px] font-bold text-slate-400">
          <span className="text-lg leading-none">☰</span>Menu
        </button>
      </div>

      {tab === "board" && <Sportsbook onBalance={balanced} isAdmin={false}
        onCasino={() => setTab("casino")} onHorses={() => setTab("horses")} />}
      {tab === "casino" && <Casino onBalance={balanced} />}
      {tab === "wagers" && <MyWagers />}
      {tab === "figures" && <MyFigures />}
      {tab === "rules" && <Rules />}
      {tab === "transactions" && <MyTransactions />}
      {tab === "scores" && <Scores />}
      {tab === "settings" && <Settings />}
      {tab === "horses" && <Horses onBalance={balanced} />}
    </div>
  );
}

// ------------------------------------------------------------- transactions --
function MyTransactions() {
  const [wb, setWb] = useState(0);
  const [d, setD] = useState<Awaited<ReturnType<typeof api.myTransactions>> | null>(null);
  useEffect(() => {
    setD(null);
    api.myTransactions(wb).then(setD).catch(() => {});
  }, [wb]);

  const bal = (v: string) =>
    Number(v) < 0 ? "text-red-400" : Number(v) > 0 ? "text-accent" : "text-slate-400";

  return (
    <div className="space-y-3">
      <select value={wb} onChange={(e) => setWb(Number(e.target.value))}
        className="w-full rounded-xl border border-white/5 bg-base-800 shadow-card px-4 py-2.5 text-sm font-semibold text-slate-100 outline-none">
        {Array.from({ length: 14 }, (_, i) => (
          <option key={i} value={i}>
            {i === 0 ? "This Week" : i === 1 ? "Last Week" : `${i} Weeks Ago`}
          </option>
        ))}
      </select>

      {!d ? (
        <Card><p className="py-8 text-center text-sm text-slate-500">loading…</p></Card>
      ) : (
        <div className="overflow-hidden rounded-xl border border-white/5 bg-base-800 shadow-card">
          <div className="grid grid-cols-[1fr_90px_100px] gap-2 border-b border-base-600 px-4 py-2 text-[10px] font-bold uppercase tracking-wide text-slate-500">
            <span>Transaction</span>
            <span className="text-right">Amount</span>
            <span className="text-right">Balance</span>
          </div>
          <div className="grid grid-cols-[1fr_90px_100px] items-baseline gap-2 border-b border-base-700/60 px-4 py-2.5">
            <span className="text-xs italic text-slate-400">Balance Forward</span>
            <span />
            <span className={`text-right font-mono text-sm font-bold ${bal(d.balance_forward)}`}>
              {money(d.balance_forward)}
            </span>
          </div>
          {d.rows.length === 0 && (
            <p className="px-4 py-6 text-center text-sm text-slate-500">
              No transactions this week.
            </p>
          )}
          {d.rows.map((r) => {
            const n = Number(r.amount);
            return (
              <div key={r.id}
                className="grid grid-cols-[1fr_90px_100px] items-baseline gap-2 border-b border-base-700/60 px-4 py-2 last:border-0">
                <span className="min-w-0">
                  <span className="block text-[10px] text-slate-500">
                    {new Date(r.at).toLocaleString(undefined,
                      { month: "long", day: "numeric", hour: "numeric", minute: "2-digit" })}
                  </span>
                  <span className="block truncate text-xs text-slate-200">{r.description}</span>
                </span>
                <span className={`text-right font-mono text-sm font-semibold ${
                  n > 0 ? "text-accent" : n < 0 ? "text-red-400" : "text-slate-500"}`}>
                  {n > 0 ? "+" : ""}{money(r.amount)}
                </span>
                <span className={`text-right font-mono text-sm font-bold ${bal(r.balance)}`}>
                  {money(r.balance)}
                </span>
              </div>
            );
          })}
        </div>
      )}
      <p className="px-1 text-[11px] leading-relaxed text-slate-500">
        Cash movements only, with the running balance. Free play is tracked separately
        on the Figures page.
      </p>
    </div>
  );
}

// -------------------------------------------------------------------- scores --
function Scores() {
  const [rows, setRows] = useState<Awaited<ReturnType<typeof api.myScores>> | null>(null);
  const [league, setLeague] = useState("");

  useEffect(() => {
    let alive = true;
    const load = () => api.myScores().then((r) => {
      if (!alive) return;
      setRows(r);
      setLeague((cur) => {
        if (cur && r.some((g) => g.league === cur)) return cur;
        const lv = r.find((g) => g.status === "live");
        return (lv ?? r[0])?.league ?? "";
      });
    }).catch(() => {});
    load();
    const t = setInterval(load, 8000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  if (!rows) return <Card><p className="py-8 text-center text-sm text-slate-500">loading…</p></Card>;

  const leagues = [...new Set(rows.map((g) => g.league))];
  const liveLeagues = new Set(rows.filter((g) => g.status === "live").map((g) => g.league));
  const games = rows.filter((g) => g.league === league);

  return (
    <div className="mx-auto max-w-2xl space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-bold text-slate-100">Scoreboard</h3>
        <span className="text-[10px] text-slate-500">updates every few seconds</span>
      </div>

      <select value={league} onChange={(e) => setLeague(e.target.value)}
        className="w-full rounded-xl border border-white/5 bg-base-800 shadow-card px-4 py-2.5 text-sm font-bold text-slate-100 outline-none">
        {leagues.map((l) => (
          <option key={l} value={l}>{l}{liveLeagues.has(l) ? " ● LIVE" : ""}</option>
        ))}
      </select>

      <div className="overflow-hidden rounded-xl border border-white/5 bg-base-800 shadow-card">
        {games.map((g, i) => {
          const live = g.status === "live";
          const final = !live && g.status !== "scheduled" && g.home_score !== null;
          return (
            <div key={i} className="border-b border-base-700/60 last:border-0">
              <div className={`bg-base-900/60 px-4 py-1.5 text-[11px] font-semibold ${
                live ? "text-red-400" : final ? "text-accent" : "text-slate-400"}`}>
                {live ? `● LIVE ${g.period ?? ""}` : final ? "Final"
                  : new Date(g.starts_at).toLocaleString(undefined,
                      { weekday: "short", month: "short", day: "numeric",
                        hour: "numeric", minute: "2-digit" })}
              </div>
              {([[g.away, g.away_score], [g.home, g.home_score]] as const).map(([team, score], j) => (
                <div key={j} className="flex items-baseline justify-between px-4 py-1.5">
                  <span className="flex items-center gap-2 text-sm text-slate-200">
                    <span className="text-xs">{g.icon}</span> {team}
                  </span>
                  <span className={`font-mono text-sm font-bold ${
                    live ? "text-gold" : final ? "text-slate-100" : "text-transparent"}`}>
                    {live || final ? score : "0"}
                  </span>
                </div>
              ))}
            </div>
          );
        })}
        {games.length === 0 && (
          <p className="px-4 py-8 text-center text-sm text-slate-500">No games in this league.</p>
        )}
      </div>
      <p className="px-1 text-[10px] text-slate-500">
        Times shown in your device's timezone.
      </p>
    </div>
  );
}

// ------------------------------------------------------------------ settings --
function Settings() {
  const oddsFmt = useOddsFmt();
  const [fig, setFig] = useState<Awaited<ReturnType<typeof api.myFigures>> | null>(null);
  useEffect(() => { api.myFigures().then(setFig).catch(() => {}); }, []);
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function change() {
    setMsg(""); setErr("");
    if (next.length < 6) { setErr("New password needs at least 6 characters."); return; }
    if (next !== confirm) { setErr("New passwords don't match."); return; }
    setBusy(true);
    try {
      await api.myChangePassword(cur, next);
      setMsg("Password changed.");
      setCur(""); setNext(""); setConfirm("");
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }

  const cls = "w-full rounded border border-base-600 bg-base-700 px-3 py-2 text-sm " +
    "text-slate-200 outline-none focus:border-gold";
  const PrefRow = ({ k, children }: { k: string; children: React.ReactNode }) => (
    <div className="flex items-center justify-between border-b border-base-700/60 px-4 py-3 text-sm last:border-0">
      <span className="text-slate-300">{k}</span>
      {children}
    </div>
  );
  return (
    <div className="mx-auto max-w-xl space-y-3">
      <h3 className="text-base font-bold text-slate-100">My Account</h3>

      {/* -------- the money at a glance, like the reference modal -------- */}
      <div className="overflow-hidden rounded-xl border border-white/5 bg-base-800 shadow-card">
        {([
          ["Balance", fig?.balance, Number(fig?.balance ?? 0) < 0 ? "text-red-400" : "text-accent"],
          ["Pending", fig?.pending, "text-amber-300"],
          ["Available", fig?.available, "text-accent"],
          ["Free Play", fig?.free_play, "text-sky-300"],
        ] as const).map(([k, v, tone]) => (
          <div key={k} className="flex items-baseline justify-between border-b border-base-700/60 px-4 py-2.5 last:border-0">
            <span className="text-sm text-slate-300">{k}</span>
            <span className={`font-mono text-sm font-bold ${tone}`}>
              {v !== undefined ? money(v) : "…"}
            </span>
          </div>
        ))}
      </div>

      {/* ------------------------ display preferences ------------------------ */}
      <div className="overflow-hidden rounded-xl border border-white/5 bg-base-800 shadow-card">
        <PrefRow k="Available Odds">
          <select value={oddsFmt} onChange={(e) => setOddsFmt(e.target.value as OddsFmt)}
            className="rounded-lg bg-base-700 px-3 py-1.5 text-xs font-semibold text-slate-100 outline-none">
            <option value="american">American (-110)</option>
            <option value="decimal">Decimal (1.91)</option>
            <option value="both">Both</option>
          </select>
        </PrefRow>
        <PrefRow k="Game Sort (Display)">
          <span className="text-xs text-slate-400">By League · By Time</span>
        </PrefRow>
        <PrefRow k="Time">
          <span className="text-xs text-slate-400">Your device's timezone</span>
        </PrefRow>
        <PrefRow k="Version">
          <span className="font-mono text-xs text-slate-400">{APP_VERSION}</span>
        </PrefRow>
      </div>

      <Card>
      <h3 className="mb-3 text-sm font-semibold text-slate-200">Change password</h3>
      <div className="max-w-sm space-y-3">
        <label className="block text-xs">
          <span className="mb-1 block text-[10px] uppercase tracking-wide text-slate-500">Current password</span>
          <input type="password" value={cur} onChange={(e) => setCur(e.target.value)} className={cls} />
        </label>
        <label className="block text-xs">
          <span className="mb-1 block text-[10px] uppercase tracking-wide text-slate-500">New password</span>
          <input type="password" value={next} onChange={(e) => setNext(e.target.value)} className={cls} />
        </label>
        <label className="block text-xs">
          <span className="mb-1 block text-[10px] uppercase tracking-wide text-slate-500">Confirm new password</span>
          <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className={cls} />
        </label>
        <button onClick={change} disabled={busy}
          className="rounded-lg btn-gold px-4 py-2 text-sm font-bold text-base-900 hover:brightness-110 disabled:opacity-50">
          {busy ? "…" : "Change password"}
        </button>
        {msg && <p className="text-xs text-accent">{msg}</p>}
        {err && <p className="text-xs text-red-300">{err}</p>}
        <p className="pt-2 text-[11px] leading-relaxed text-slate-500">
          For limits, credit, or anything about your account standing, talk to
          your agent.
        </p>
      </div>
      </Card>
    </div>
  );
}

// ------------------------------------------------------------------ casino --
function Casino({ onBalance }: { onBalance: (b: string) => void }) {
  const [lobby, setLobby] = useState<Awaited<ReturnType<typeof api.casinoLobby>> | null>(null);
  const [cat, setCat] = useState<"all" | "slots" | "table" | "quick">("all");
  const [game, setGame] = useState<string | null>(null);

  const load = () => {};
  useEffect(() => {
    api.casinoLobby().then(setLobby).catch(() => {});
  }, []);

  if (game) {
    return (
      <div className="space-y-3">
        <button onClick={() => setGame(null)}
          className="rounded-lg border border-white/5 bg-base-800 shadow-card px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-base-700">
          ← Casino lobby
        </button>
        <div className="mx-auto max-w-2xl">
          <div className="min-w-0">
            {game === "duel" && <Duel onBalance={onBalance} onNonce={() => load()} />}
            {game === "blackjack" && <Blackjack onBalance={onBalance} onPlayed={load} />}
            {game === "dice" && <DiceGame onBalance={onBalance} onPlayed={load} />}
            {game === "wheel" && <WheelGame onBalance={onBalance} onPlayed={load} />}
            {game === "roulette" && <Roulette onBalance={onBalance} onPlayed={load} />}
            {game === "videopoker" && <VideoPoker onBalance={onBalance} onPlayed={load} />}
            {game === "baccarat" && <Baccarat onBalance={onBalance} onPlayed={load} />}
            {game === "mines" && <Mines onBalance={onBalance} onPlayed={load} />}
            {game === "plinko" && (() => {
              const def = lobby?.games.find((g) => g.key === "plinko");
              return def?.plinko
                ? <Plinko def={def.plinko} onBalance={onBalance} onPlayed={load} />
                : null;
            })()}
            {game === "crash" && <Crash onBalance={onBalance} onPlayed={load} />}
            {game === "keno" && (() => {
              const def = lobby?.games.find((g) => g.key === "keno");
              return def?.keno ? <Keno def={def.keno} onBalance={onBalance} onPlayed={load} /> : null;
            })()}
            {game === "limbo" && (() => {
              const def = lobby?.games.find((g) => g.key === "limbo");
              return def?.limbo ? <Limbo def={def.limbo} onBalance={onBalance} onPlayed={load} /> : null;
            })()}
            {game === "towers" && (() => {
              const def = lobby?.games.find((g) => g.key === "towers");
              return def?.towers ? <Towers def={def.towers} onBalance={onBalance} onPlayed={load} /> : null;
            })()}
            {game === "dragontiger" && <DragonTiger onBalance={onBalance} onPlayed={load} />}
            {game === "hilo" && <HiLo onBalance={onBalance} onPlayed={load} />}
            {game === "tumble" && (() => {
              const def = lobby?.games.find((g) => g.key === "tumble");
              return def?.tumble
                ? <SugarBlast def={def.tumble} onBalance={onBalance} onPlayed={load} />
                : null;
            })()}
            {game === "dragon" && (() => {
              const def = lobby?.games.find((g) => g.key === "dragon");
              return def?.dragon
                ? <GoldenDragon def={def.dragon} onBalance={onBalance} onPlayed={load} />
                : null;
            })()}
            {game === "holdspin" && (() => {
              const def = lobby?.games.find((g) => g.key === "holdspin");
              return def?.holdspin
                ? <PiggyBlast def={def.holdspin} onBalance={onBalance} onPlayed={load} />
                : null;
            })()}
            {game.startsWith("vslot:") && (() => {
              const def = lobby?.games.find((g) => g.key === game);
              return def?.vslot
                ? <VideoSlot def={def} onBalance={onBalance} onPlayed={load} />
                : null;
            })()}
            {game.startsWith("slot:") && (() => {
              const def = lobby?.games.find((g) => g.key === game);
              return def?.slot
                ? <SlotGame def={def} onBalance={onBalance} onPlayed={load} />
                : null;
            })()}
          </div>
        </div>
      </div>
    );
  }

  const games = (lobby?.games ?? []).filter((g) => cat === "all" || g.category === cat);
  return (
    <div className="mx-auto max-w-3xl space-y-3">
      <div className="grid grid-cols-4 overflow-hidden rounded-xl border border-white/5 bg-base-800 shadow-card text-center text-xs font-semibold">
        {([["all", "Lobby"], ["slots", "Slots"], ["table", "Table Games"], ["quick", "Quick Games"]] as const)
          .map(([id, label]) => (
          <button key={id} onClick={() => setCat(id)}
            className={`py-2.5 transition ${
              cat === id ? "btn-gold text-base-900" : "text-slate-300 hover:bg-base-700"}`}>
            {label}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {games.map((g) => (
          <button key={g.key} onClick={() => setGame(g.key)}
            className="group overflow-hidden rounded-xl border border-white/5 bg-base-800 shadow-card text-left transition hover:-translate-y-0.5 hover:border-gold/40 hover:shadow-pop">
            <div className="relative h-20 overflow-hidden sm:h-24">
              <div className="h-full w-full transition duration-300 group-hover:scale-105">
                <GameArt k={g.key} />
              </div>
              <span className="absolute left-1.5 top-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-widest text-gold">
                Original
              </span>
            </div>
            <div className="flex items-center justify-between px-2.5 py-2">
              <span className="truncate text-[13px] font-bold text-slate-100">{g.name}</span>
              <span className="text-slate-600 transition group-hover:translate-x-0.5 group-hover:text-gold">›</span>
            </div>
          </button>
        ))}
      </div>
      <p className="px-1 text-[10px] leading-relaxed text-slate-500">
        Table games, slots and quick games, all against the house book. Every game
        settles instantly to your balance and shows in your weekly figures.
      </p>
    </div>
  );
}


// ----------------------------------------------------------------- slots ----
function SlotSymbol({ sym, size = "text-4xl" }: { sym: string; size?: string }) {
  const spec = SYMBOL_GLYPH[sym] ?? { g: sym };
  if (spec.cls === "slot-bar") {
    return (
      <span className="rounded-md btn-gold px-2 py-0.5 font-sans text-sm font-black tracking-tight text-base-900">
        BAR
      </span>
    );
  }
  if (spec.cls === "slot-gold") {
    return (
      <span className={`${size} font-black bg-gradient-to-b from-gold-400 to-gold-600 bg-clip-text text-transparent`}>
        {spec.g}
      </span>
    );
  }
  if (spec.cls === "slot-blank") {
    return <span className={`${size} text-slate-600`}>—</span>;
  }
  return <span className={size}>{spec.g}</span>;
}

function SlotGame({ def, onBalance, onPlayed }: {
  def: { key: string; name: string; min: string; max: string; edge: string;
         rules: string; slot?: import("../api").SlotDef };
  onBalance: (b: string) => void; onPlayed: () => void;
}) {
  const slot = def.slot!;
  const [stake, setStake] = useState("10");
  const [reels, setReels] = useState<string[]>([slot.symbols[0], slot.symbols[1], slot.symbols[2] ?? slot.symbols[0]]);
  // per-reel state: each reel spins and stops on its own clock, like a machine
  const [live, setLive] = useState<[boolean, boolean, boolean]>([false, false, false]);
  const [popped, setPopped] = useState<[boolean, boolean, boolean]>([false, false, false]);
  const [spinning, setSpinning] = useState(false);
  const [last, setLast] = useState<{ multiplier: string; payout: string; win: boolean } | null>(null);
  const [err, setErr] = useState("");

  async function spin() {
    setErr(""); setLast(null); setSpinning(true);
    setLive([true, true, true]); setPopped([false, false, false]);
    const ticks = [0, 1, 2].map((i) => window.setInterval(() => {
      setReels((r) => {
        const n = [...r];
        n[i] = slot.symbols[Math.floor(Math.random() * slot.symbols.length)];
        return n;
      });
    }, 65 + i * 12));
    const stopReel = (i: number, sym: string) => {
      window.clearInterval(ticks[i]);
      setReels((r) => { const n = [...r]; n[i] = sym; return n; });
      setLive((l) => { const n = [...l] as typeof live; n[i] = false; return n; });
      setPopped((pp) => { const n = [...pp] as typeof popped; n[i] = true; return n; });
    };
    try {
      const r = await api.slotSpin(slot.machine, stake);
      [0, 1, 2].forEach((i) => window.setTimeout(() => {
        stopReel(i, r.reels[i]);
        if (i === 2) {
          setLast({ multiplier: r.multiplier, payout: r.payout, win: r.win });
          onBalance(r.balance);
          onPlayed();
          setSpinning(false);
        }
      }, 500 + i * 380));
    } catch (e: any) {
      ticks.forEach((t) => window.clearInterval(t));
      setLive([false, false, false]);
      setErr(e.message);
      setSpinning(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-white/5 bg-base-800 shadow-card p-4">
        <div className="mb-3 flex items-baseline justify-between">
          <h3 className="text-sm font-bold text-slate-100">🎰 {def.name}</h3>

        </div>

        {/* the machine */}
        <div className="rounded-xl border border-gold/25 bg-gradient-to-b from-base-900 to-base-950 p-4">
          {/* marquee */}
          <div className="mb-2 flex justify-center gap-1.5">
            {Array.from({ length: 9 }, (_, i) => (
              <span key={i} className={`h-1.5 w-1.5 rounded-full ${
                spinning ? "animate-pulse bg-gold" : i % 2 ? "bg-gold/70" : "bg-gold/25"}`} />
            ))}
          </div>
          <div className="mx-auto grid max-w-xs grid-cols-3 gap-2">
            {reels.map((sym, i) => (
              <div key={i}
                className={`relative grid h-24 place-items-center overflow-hidden rounded-lg border bg-base-900 ${
                  last && last.win && !spinning
                    ? "border-accent/60 shadow-[0_0_18px_-4px_rgba(74,222,128,0.5)]"
                    : live[i] ? "border-gold/40" : "border-white/10"}`}>
                <div className="pointer-events-none absolute inset-x-0 top-0 h-5 bg-gradient-to-b from-black/50 to-transparent" />
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-5 bg-gradient-to-t from-black/50 to-transparent" />
                <span className={live[i] ? "blur-[2px] opacity-80" : popped[i] ? "reel-pop" : ""}>
                  <SlotSymbol sym={sym} />
                </span>
              </div>
            ))}
          </div>

          <div className="mt-3 text-center text-sm font-bold">
            {spinning ? (
              <span className="text-slate-400">Spinning…</span>
            ) : last ? (
              last.win ? (
                <span className="text-accent">WIN {last.multiplier}× — paid {money(last.payout)}</span>
              ) : (
                <span className="text-slate-500">No hit — spin again</span>
              )
            ) : (
              <span className="text-slate-500">Good luck.</span>
            )}
          </div>
        </div>

        <div className="mt-3 flex items-end gap-2">
          <label className="text-xs">
            <span className="mb-1 block text-[10px] uppercase tracking-wide text-slate-500">Stake</span>
            <input value={stake} onChange={(e) => setStake(e.target.value)}
              className="w-24 rounded-lg bg-base-700 px-3 py-2 font-mono text-sm text-slate-100 outline-none" />
          </label>
          <button onClick={spin} disabled={spinning}
            className="ml-auto rounded-lg btn-gold px-8 py-2 text-sm font-black uppercase tracking-wider text-base-900 disabled:opacity-50">
            {spinning ? "…" : "Spin"}
          </button>
        </div>
        {err && <p className="mt-2 text-xs text-red-300">{err}</p>}
      </div>

      {/* the paytable IS the game -- printed in full */}
      <div className="rounded-xl border border-white/5 bg-base-800 shadow-card p-4">
        <h4 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-400">Paytable</h4>
        <div className="space-y-1.5">
          {Object.entries(slot.triples).map(([sym, mult]) => (
            <div key={sym} className="flex items-center justify-between rounded-lg bg-base-900/50 px-3 py-1.5">
              <span className="flex items-center gap-1.5">
                <SlotSymbol sym={sym} size="text-lg" />
                <SlotSymbol sym={sym} size="text-lg" />
                <SlotSymbol sym={sym} size="text-lg" />
              </span>
              <span className="font-mono text-sm font-bold text-gold">{mult}×</span>
            </div>
          ))}
          {slot.partial && (
            <>
              <div className="flex items-center justify-between rounded-lg bg-base-900/50 px-3 py-1.5">
                <span className="flex items-center gap-1.5">
                  <SlotSymbol sym={slot.partial.symbol} size="text-lg" />
                  <SlotSymbol sym={slot.partial.symbol} size="text-lg" />
                  <span className="text-xs text-slate-500">any two spots</span>
                </span>
                <span className="font-mono text-sm font-bold text-slate-200">{slot.partial.two}×</span>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-base-900/50 px-3 py-1.5">
                <span className="flex items-center gap-1.5">
                  <SlotSymbol sym={slot.partial.symbol} size="text-lg" />
                  <span className="text-xs text-slate-500">any one spot</span>
                </span>
                <span className="font-mono text-sm font-bold text-slate-200">{slot.partial.one}×</span>
              </div>
            </>
          )}
        </div>
        <p className="mt-3 text-[10px] leading-relaxed text-slate-500">
          Three reels, one line. Line up a triple to hit the big pays.
        </p>
      </div>
    </div>
  );
}




// ------------------------------------------------------------ hold & spin ----
function PiggyBlast({ def, onBalance, onPlayed }: {
  def: import("../api").HoldSpinDef;
  onBalance: (b: string) => void; onPlayed: () => void;
}) {
  const [stake, setStake] = useState("10");
  const [locked, setLocked] = useState<Record<string, string>>({});
  const [fresh, setFresh] = useState<Set<number>>(new Set());
  const [respins, setRespins] = useState(0);
  const [inFeature, setInFeature] = useState(false);
  const [collected, setCollected] = useState("0");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [spinCells, setSpinCells] = useState(false);

  useEffect(() => {
    api.holdspinActive().then((r) => {
      if (r.active) {
        setLocked(r.active.locked); setRespins(r.active.respins);
        setCollected(r.active.collected); setInFeature(true);
        setStake(String(Number(r.active.stake)));
      }
    }).catch(() => {});
  }, []);

  async function run(kind: "spin" | "respin") {
    setErr(""); setBusy(true); setMsg(null); setSpinCells(true); setFresh(new Set());
    try {
      const r = kind === "spin"
        ? await api.holdspinSpin(stake)
        : await api.holdspinRespin();
      await new Promise((res) => setTimeout(res, 700));
      setSpinCells(false);
      setLocked(r.locked);
      setFresh(new Set(Object.keys(r.coins).map(Number)));
      setRespins(r.respins);
      setCollected(r.collected);
      onBalance(r.balance);
      onPlayed();
      const grand = (r as any).grand && Number((r as any).grand) > 0;
      if (kind === "spin" && (r as any).triggered) {
        setInFeature(true);
        setMsg(`🐷 HOLD & SPIN! ${Object.keys(r.locked).length} coins locked`);
      } else if (r.status === "settled") {
        setInFeature(false);
        if (grand) setMsg(`💰 FULL GRID — GRAND +${money((r as any).grand)}! Total ${money(r.collected)}`);
        else if (kind === "respin") setMsg(`Feature over — collected ${money(r.collected)}`);
        else if (Number(r.win) > 0) setMsg(`Coins paid ${money(r.win)}`);
        if (kind === "spin" && !(r as any).triggered) setLockedSoon(r);
      } else if (kind === "respin" && Number(r.win) > 0) {
        setMsg(`+${money(r.win)} — respins reset`);
      }
    } catch (e: any) {
      setSpinCells(false); setErr(e.message);
    } finally { setBusy(false); }
  }

  function setLockedSoon(_r: unknown) { /* base coins stay shown until next spin */ }

  const filled = Object.keys(locked).length;

  return (
    <div className="rounded-xl border border-white/5 bg-base-800 shadow-card p-4">
      <div className="mb-2 flex items-baseline justify-between">
        <h3 className="text-sm font-bold text-slate-100">🐷 Piggy Bank Blast</h3>
        <span className="font-mono text-[10px] text-slate-500">Grand {def.grand}× at 15/15</span>
      </div>

      {inFeature && (
        <div className="mb-2 flex items-center justify-between rounded-lg border border-gold/40 bg-gold/10 px-3 py-1.5 text-xs font-bold text-gold">
          <span>HOLD & SPIN · {filled}/15 · {respins} respin{respins !== 1 ? "s" : ""} left</span>
          <span className="font-mono">{money(collected)}</span>
        </div>
      )}
      {msg && (
        <div className="mb-2 rounded-lg border border-gold/50 bg-gold/15 px-3 py-2 text-center text-sm font-black text-gold">
          {msg}
        </div>
      )}

      <div className="rounded-xl border border-fuchsia-500/30 bg-gradient-to-b from-[#2b0a24] via-[#160512] to-black p-3">
        <div className="grid grid-cols-5 gap-1.5">
          {Array.from({ length: 15 }, (_, i) => {
            const v = locked[String(i)];
            return (
              <div key={i}
                className={`grid aspect-square place-items-center rounded-md border transition ${
                  v ? (fresh.has(i)
                        ? "reel-pop border-gold bg-gradient-to-b from-gold/30 to-amber-900/40 shadow-gold"
                        : "border-gold/50 bg-gradient-to-b from-gold/15 to-base-900")
                    : spinCells ? "animate-pulse border-white/10 bg-base-900"
                    : "border-white/10 bg-base-900/80"}`}>
                {v ? (
                  <span className="grid h-9 w-9 place-items-center rounded-full btn-gold font-mono text-[10px] font-black text-base-900">
                    {Number(v) >= 1 ? `${Number(v).toFixed(Number(v) % 1 ? 1 : 0)}x` : `${Number(v).toFixed(2)}x`}
                  </span>
                ) : (
                  <span className="text-lg opacity-20">🐷</span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-3 flex items-end gap-2">
        <label className="text-xs">
          <span className="mb-1 block text-[10px] uppercase tracking-wide text-slate-500">Bet</span>
          <input value={stake} onChange={(e) => setStake(e.target.value)}
            disabled={busy || inFeature}
            className="w-20 rounded-lg bg-base-700 px-3 py-2 font-mono text-sm text-slate-100 outline-none disabled:opacity-50" />
        </label>
        {inFeature ? (
          <button onClick={() => run("respin")} disabled={busy}
            className="ml-auto animate-pulse rounded-lg btn-gold px-8 py-2.5 text-sm font-black uppercase tracking-wider text-base-900 disabled:opacity-50">
            Respin ({respins})
          </button>
        ) : (
          <button onClick={() => run("spin")} disabled={busy}
            className="ml-auto rounded-lg btn-gold px-8 py-2.5 text-sm font-black uppercase tracking-wider text-base-900 disabled:opacity-50">
            Spin
          </button>
        )}
      </div>
      {err && <p className="mt-2 text-xs text-red-300">{err}</p>}
      <p className="mt-3 text-[10px] leading-relaxed text-slate-500">
        Every coin pays its printed value instantly. Land {def.trigger}+ coins to lock
        them and start {def.respins} respins — any new coin resets the counter.
        Fill the grid for the {def.grand}× Grand on top.
      </p>
    </div>
  );
}

// ------------------------------------------------------------------- keno ----
function Keno({ def, onBalance, onPlayed }: {
  def: import("../api").KenoDef;
  onBalance: (b: string) => void; onPlayed: () => void;
}) {
  const [stake, setStake] = useState("10");
  const [picks, setPicks] = useState<Set<number>>(new Set());
  const [drawn, setDrawn] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState("");

  const toggle = (n: number) => {
    if (busy) return;
    setDrawn(new Set()); setMsg(null);
    setPicks((p) => {
      const c = new Set(p);
      if (c.has(n)) c.delete(n);
      else if (c.size < def.max_picks) c.add(n);
      return c;
    });
  };

  async function play() {
    if (!picks.size) { setErr("pick some numbers first"); return; }
    setErr(""); setBusy(true); setMsg(null); setDrawn(new Set());
    try {
      const r = await api.kenoPlay(stake, [...picks]);
      // balls drop one at a time
      for (const b of r.drawn) {
        await new Promise((res) => setTimeout(res, 160));
        setDrawn((d) => new Set([...d, b]));
      }
      onBalance(r.balance); onPlayed();
      setMsg(Number(r.win) > 0
        ? `${r.hits} catches — ${r.multiplier}x paid ${money(r.win)}`
        : `${r.hits} catch${r.hits === 1 ? "" : "es"} — no pay`);
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  }

  const table = def.tables[String(picks.size)] ?? {};
  return (
    <div className="rounded-xl border border-white/5 bg-base-800 shadow-card p-4">
      <div className="mb-2 flex items-baseline justify-between">
        <h3 className="text-sm font-bold text-slate-100">🎱 Keno</h3>
        <span className="font-mono text-[10px] text-slate-500">{picks.size}/{def.max_picks} picked</span>
      </div>
      {msg && (
        <div className="mb-2 rounded-lg border border-gold/50 bg-gold/15 px-3 py-2 text-center text-sm font-black text-gold">{msg}</div>
      )}
      <div className="rounded-xl border border-violet-500/30 bg-gradient-to-b from-[#160b2e] via-[#0c0619] to-black p-3">
        <div className="grid grid-cols-8 gap-1">
          {Array.from({ length: def.pool }, (_, i) => i + 1).map((n) => {
            const p = picks.has(n), d = drawn.has(n);
            return (
              <button key={n} onClick={() => toggle(n)}
                className={`aspect-square rounded-md font-mono text-xs font-bold transition ${
                  p && d ? "reel-pop btn-gold text-base-900 shadow-gold"
                  : d ? "bg-violet-500/40 text-white"
                  : p ? "border border-gold/70 bg-gold/15 text-gold"
                  : "border border-white/10 bg-base-900/70 text-slate-400 hover:border-gold/40"}`}>
                {n}
              </button>
            );
          })}
        </div>
      </div>
      {picks.size > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {Object.entries(table).map(([h, m]) => (
            <span key={h} className="rounded bg-base-900/70 px-2 py-1 font-mono text-[10px] text-slate-300">
              {h} hits → <span className="font-bold text-gold">{m}x</span>
            </span>
          ))}
        </div>
      )}
      <div className="mt-3 flex items-end gap-2">
        <label className="text-xs">
          <span className="mb-1 block text-[10px] uppercase tracking-wide text-slate-500">Bet</span>
          <input value={stake} onChange={(e) => setStake(e.target.value)} disabled={busy}
            className="w-20 rounded-lg bg-base-700 px-3 py-2 font-mono text-sm text-slate-100 outline-none disabled:opacity-50" />
        </label>
        <button onClick={() => { setPicks(new Set()); setDrawn(new Set()); setMsg(null); }}
          disabled={busy}
          className="rounded-lg border border-white/10 bg-base-900 px-3 py-2.5 text-xs font-bold text-slate-300 hover:bg-base-700 disabled:opacity-50">
          Clear
        </button>
        <button onClick={play} disabled={busy || !picks.size}
          className="ml-auto rounded-lg btn-gold px-8 py-2.5 text-sm font-black uppercase tracking-wider text-base-900 disabled:opacity-50">
          {busy ? "…" : "Draw"}
        </button>
      </div>
      {err && <p className="mt-2 text-xs text-red-300">{err}</p>}
    </div>
  );
}

// ------------------------------------------------------------------ limbo ----
function Limbo({ def, onBalance, onPlayed }: {
  def: import("../api").LimboDef;
  onBalance: (b: string) => void; onPlayed: () => void;
}) {
  const [stake, setStake] = useState("10");
  const [target, setTarget] = useState("2.00");
  const [result, setResult] = useState<{ n: string; win: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [rolling, setRolling] = useState(false);
  const [err, setErr] = useState("");

  async function play() {
    setErr(""); setBusy(true); setRolling(true); setResult(null);
    try {
      const r = await api.limboPlay(stake, target);
      // count-up flourish
      const final = Number(r.result);
      const frames = 14;
      for (let i = 1; i <= frames; i++) {
        await new Promise((res) => setTimeout(res, 45));
        const v = 1 + (Math.min(final, 30) - 1) * (i / frames) ** 2;
        setResult({ n: v.toFixed(2), win: false });
      }
      setRolling(false);
      setResult({ n: r.result, win: r.win });
      onBalance(r.balance); onPlayed();
    } catch (e: any) { setRolling(false); setErr(e.message); }
    finally { setBusy(false); }
  }

  const win = result && !rolling && result.win;
  const lose = result && !rolling && !result.win;
  return (
    <div className="rounded-xl border border-white/5 bg-base-800 shadow-card p-4">
      <div className="mb-2 flex items-baseline justify-between">
        <h3 className="text-sm font-bold text-slate-100">🎯 Limbo</h3>
        <span className="font-mono text-[10px] text-slate-500">up to {Number(def.max).toLocaleString()}x</span>
      </div>
      <div className="grid h-40 place-items-center rounded-xl border border-cyan-500/25 bg-gradient-to-b from-[#03222e] via-[#021017] to-black">
        <span className={`font-mono text-5xl font-black tabular-nums ${
          win ? "text-accent drop-shadow-[0_0_18px_rgba(74,222,128,0.5)]"
          : lose ? "text-red-400" : "text-slate-200"}`}>
          {result ? `${result.n}×` : "—"}
        </span>
      </div>
      <div className="mt-3 flex items-end gap-2">
        <label className="text-xs">
          <span className="mb-1 block text-[10px] uppercase tracking-wide text-slate-500">Bet</span>
          <input value={stake} onChange={(e) => setStake(e.target.value)} disabled={busy}
            className="w-20 rounded-lg bg-base-700 px-3 py-2 font-mono text-sm text-slate-100 outline-none disabled:opacity-50" />
        </label>
        <label className="text-xs">
          <span className="mb-1 block text-[10px] uppercase tracking-wide text-slate-500">Target ×</span>
          <input value={target} onChange={(e) => setTarget(e.target.value)} disabled={busy}
            className="w-24 rounded-lg bg-base-700 px-3 py-2 font-mono text-sm text-slate-100 outline-none disabled:opacity-50" />
        </label>
        <span className="pb-2 font-mono text-[10px] text-slate-500">
          pays {Number(target) > 0 ? Number(target).toFixed(2) : "—"}x
        </span>
        <button onClick={play} disabled={busy}
          className="ml-auto rounded-lg btn-gold px-8 py-2.5 text-sm font-black uppercase tracking-wider text-base-900 disabled:opacity-50">
          {busy ? "…" : "Bet"}
        </button>
      </div>
      {err && <p className="mt-2 text-xs text-red-300">{err}</p>}
      <p className="mt-3 text-[10px] leading-relaxed text-slate-500">
        Name any multiplier from {def.min}x to {Number(def.max).toLocaleString()}x.
        Beat it and you're paid your number.
      </p>
    </div>
  );
}

// ----------------------------------------------------------------- towers ----
function Towers({ def, onBalance, onPlayed }: {
  def: import("../api").TowersDef;
  onBalance: (b: string) => void; onPlayed: () => void;
}) {
  const [stake, setStake] = useState("10");
  const [level, setLevel] = useState("medium");
  const [st, setSt] = useState<import("../api").TowersState | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    api.towersActive().then((r) => { if (r.active) { setSt(r.active); setLevel(r.active.level); } }).catch(() => {});
  }, []);

  const live = st && st.status === "open";
  const tiles = live ? st.tiles : def.levels[level].tiles;

  async function start() {
    setErr(""); setBusy(true); setMsg(null);
    try {
      const r = await api.towersStart(stake, level);
      setSt(r); if (r.balance) onBalance(r.balance); onPlayed();
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  }
  async function pick(tile: number) {
    if (!st || busy) return;
    setErr(""); setBusy(true);
    try {
      const r = await api.towersPick(st.round_id, tile);
      setSt(r); if (r.balance) onBalance(r.balance); onPlayed();
      if (r.outcome === "bust") setMsg("💥 Trap — the stake is gone");
      else if (r.outcome === "topped") setMsg(`🏆 TOP FLOOR — paid ${money(r.payout!)}`);
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  }
  async function cashout() {
    if (!st) return;
    setErr(""); setBusy(true);
    try {
      const r = await api.towersCashout(st.round_id);
      setSt(r); if (r.balance) onBalance(r.balance); onPlayed();
      setMsg(`Cashed out ${r.multiplier}x — ${money(r.payout!)}`);
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  }

  const mults = def.levels[live ? st!.level : level].mults;
  return (
    <div className="rounded-xl border border-white/5 bg-base-800 shadow-card p-4">
      <div className="mb-2 flex items-baseline justify-between">
        <h3 className="text-sm font-bold text-slate-100">🗼 Towers</h3>
        {live && <span className="font-mono text-xs font-bold text-gold">{st!.multiplier}x locked</span>}
      </div>
      {msg && (
        <div className="mb-2 rounded-lg border border-gold/50 bg-gold/15 px-3 py-2 text-center text-sm font-black text-gold">{msg}</div>
      )}
      <div className="rounded-xl border border-emerald-500/25 bg-gradient-to-b from-[#04261b] via-[#02140e] to-black p-3">
        <div className="space-y-1.5">
          {Array.from({ length: def.rows }, (_, i) => def.rows - 1 - i).map((row) => {
            const active = live && st!.row === row;
            const done = live ? row < st!.row : false;
            const pickedTile = st?.picked[row];
            const trap = st?.traps?.[row];
            return (
              <div key={row} className="flex items-center gap-1.5">
                <span className={`w-14 text-right font-mono text-[10px] ${
                  active ? "font-bold text-gold" : done ? "text-accent" : "text-slate-600"}`}>
                  {mults[row]}x
                </span>
                <div className="grid flex-1 gap-1.5" style={{ gridTemplateColumns: `repeat(${tiles}, 1fr)` }}>
                  {Array.from({ length: tiles }, (_, t) => {
                    const isPicked = pickedTile === t && (done || st?.status === "settled");
                    const isTrap = trap !== undefined && trap === t;
                    const revealed = st?.traps !== undefined;
                    return (
                      <button key={t} onClick={() => active && pick(t)}
                        disabled={!active || busy}
                        className={`h-8 rounded-md border text-xs font-bold transition ${
                          revealed && isTrap ? "border-red-500/60 bg-red-500/20 text-red-300"
                          : isPicked ? "border-accent/60 bg-accent/15 text-accent"
                          : active ? "border-gold/50 bg-gold/10 text-gold hover:bg-gold/25"
                          : done ? "border-white/5 bg-base-900/60 text-slate-700"
                          : "border-white/5 bg-base-900/60 text-slate-700"}`}>
                        {revealed && isTrap ? "💀" : isPicked ? "✓" : active ? "?" : ""}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="mt-3 flex items-end gap-2">
        {!live ? (
          <>
            <label className="text-xs">
              <span className="mb-1 block text-[10px] uppercase tracking-wide text-slate-500">Bet</span>
              <input value={stake} onChange={(e) => setStake(e.target.value)} disabled={busy}
                className="w-20 rounded-lg bg-base-700 px-3 py-2 font-mono text-sm text-slate-100 outline-none disabled:opacity-50" />
            </label>
            <label className="text-xs">
              <span className="mb-1 block text-[10px] uppercase tracking-wide text-slate-500">Difficulty</span>
              <select value={level} onChange={(e) => setLevel(e.target.value)} disabled={busy}
                className="rounded-lg bg-base-700 px-2 py-2 text-sm text-slate-100 outline-none">
                {Object.entries(def.levels).map(([k, v]) => (
                  <option key={k} value={k}>{k} · {v.tiles} tiles</option>
                ))}
              </select>
            </label>
            <button onClick={start} disabled={busy}
              className="ml-auto rounded-lg btn-gold px-8 py-2.5 text-sm font-black uppercase tracking-wider text-base-900 disabled:opacity-50">
              Climb
            </button>
          </>
        ) : (
          <button onClick={cashout} disabled={busy || st!.row === 0}
            className="ml-auto rounded-lg btn-gold px-8 py-2.5 text-sm font-black uppercase tracking-wider text-base-900 disabled:opacity-50">
            Cash out {st!.multiplier}x
          </button>
        )}
      </div>
      {err && <p className="mt-2 text-xs text-red-300">{err}</p>}
    </div>
  );
}

// ----------------------------------------------------------- dragon tiger ----
function DragonTiger({ onBalance, onPlayed }: {
  onBalance: (b: string) => void; onPlayed: () => void;
}) {
  const [stake, setStake] = useState("10");
  const [bet, setBet] = useState("dragon");
  const [cards, setCards] = useState<{ d: string; t: string } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function deal() {
    setErr(""); setBusy(true); setMsg(null);
    setCards({ d: "??", t: "??" });
    try {
      const r = await api.dtDeal(stake, bet);
      await new Promise((res) => setTimeout(res, 350));
      setCards({ d: r.dragon, t: "??" });
      await new Promise((res) => setTimeout(res, 350));
      setCards({ d: r.dragon, t: r.tiger });
      onBalance(r.balance); onPlayed();
      const won = Number(r.payout) > Number(stake);
      setMsg(r.result === "tie"
        ? (bet === "tie" ? `🀄 TIE — paid ${money(r.payout)}` : `Tie — half back, ${money(r.payout)}`)
        : won ? `${r.result.toUpperCase()} wins — paid ${money(r.payout)}`
        : `${r.result.toUpperCase()} wins — no good`);
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  }

  return (
    <div className="rounded-xl border border-white/5 bg-base-800 shadow-card p-4">
      <h3 className="mb-2 text-sm font-bold text-slate-100">🐯 Dragon Tiger</h3>
      {msg && (
        <div className="mb-2 rounded-lg border border-gold/50 bg-gold/15 px-3 py-2 text-center text-sm font-black text-gold">{msg}</div>
      )}
      <div className="grid grid-cols-2 gap-3 rounded-xl border border-orange-500/25 bg-gradient-to-b from-[#2e1004] via-[#170802] to-black p-4">
        {(["d", "t"] as const).map((side) => (
          <div key={side} className="grid place-items-center gap-2">
            <span className={`text-[10px] font-black uppercase tracking-widest ${
              side === "d" ? "text-red-400" : "text-orange-400"}`}>
              {side === "d" ? "🐉 Dragon" : "🐯 Tiger"}
            </span>
            {cards ? <PlayingCard c={side === "d" ? cards.d : cards.t} />
              : <div className="h-16 w-11 rounded-lg border border-dashed border-white/15" />}
          </div>
        ))}
      </div>
      <div className="mt-3 grid grid-cols-3 gap-1.5 text-xs font-bold">
        {[["dragon", "Dragon 1:1"], ["tie", "Tie 11:1"], ["tiger", "Tiger 1:1"]].map(([k, label]) => (
          <button key={k} onClick={() => setBet(k)} disabled={busy}
            className={`rounded-lg border py-2 transition ${
              bet === k ? "border-gold bg-gold/15 text-gold" : "border-white/10 bg-base-900 text-slate-400 hover:border-gold/40"}`}>
            {label}
          </button>
        ))}
      </div>
      <div className="mt-3 flex items-end gap-2">
        <label className="text-xs">
          <span className="mb-1 block text-[10px] uppercase tracking-wide text-slate-500">Bet</span>
          <input value={stake} onChange={(e) => setStake(e.target.value)} disabled={busy}
            className="w-20 rounded-lg bg-base-700 px-3 py-2 font-mono text-sm text-slate-100 outline-none disabled:opacity-50" />
        </label>
        <button onClick={deal} disabled={busy}
          className="ml-auto rounded-lg btn-gold px-8 py-2.5 text-sm font-black uppercase tracking-wider text-base-900 disabled:opacity-50">
          Deal
        </button>
      </div>
      {err && <p className="mt-2 text-xs text-red-300">{err}</p>}
      <p className="mt-3 text-[10px] leading-relaxed text-slate-500">
        One card each, high card wins — ace low, king high. A rank tie pays the
        Tie bet 11:1 and returns half of Dragon/Tiger bets.
      </p>
    </div>
  );
}

// ------------------------------------------------------------------ hi-lo ----
function HiLo({ onBalance, onPlayed }: {
  onBalance: (b: string) => void; onPlayed: () => void;
}) {
  const [stake, setStake] = useState("10");
  const [st, setSt] = useState<import("../api").HiLoState | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    api.hiloActive().then((r) => { if (r.active) setSt(r.active); }).catch(() => {});
  }, []);

  const live = st && st.status === "open";

  async function start() {
    setErr(""); setBusy(true); setMsg(null);
    try {
      const r = await api.hiloStart(stake);
      setSt(r); if (r.balance) onBalance(r.balance); onPlayed();
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  }
  async function guess(g: "higher" | "lower") {
    if (!st) return;
    setErr(""); setBusy(true);
    try {
      const r = await api.hiloGuess(st.round_id, g);
      setSt(r); if (r.balance) onBalance(r.balance); onPlayed();
      if (r.outcome === "bust") setMsg(`💔 ${r.card} — busted`);
      else setMsg(`✓ ${r.card} — riding ${r.multiplier}x`);
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  }
  async function cashout() {
    if (!st) return;
    setErr(""); setBusy(true);
    try {
      const r = await api.hiloCashout(st.round_id);
      setSt(r); if (r.balance) onBalance(r.balance); onPlayed();
      setMsg(`Cashed out ${r.multiplier}x — ${money(r.payout!)}`);
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  }

  return (
    <div className="rounded-xl border border-white/5 bg-base-800 shadow-card p-4">
      <div className="mb-2 flex items-baseline justify-between">
        <h3 className="text-sm font-bold text-slate-100">🂱 Hi-Lo</h3>
        {live && <span className="font-mono text-xs font-bold text-gold">{st!.multiplier}x riding</span>}
      </div>
      {msg && (
        <div className="mb-2 rounded-lg border border-gold/50 bg-gold/15 px-3 py-2 text-center text-sm font-black text-gold">{msg}</div>
      )}
      <div className="rounded-xl border border-sky-500/25 bg-gradient-to-b from-[#04202e] via-[#021018] to-black p-4">
        <div className="flex items-center justify-center gap-2">
          {(st?.history ?? []).slice(-6, -1).map((c, i) => (
            <span key={i} className="opacity-40 scale-90"><PlayingCard c={c} /></span>
          ))}
          {st ? <span className="reel-pop"><PlayingCard c={st.card} /></span>
            : <PlayingCard c="??" />}
        </div>
        {live && (
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button onClick={() => guess("higher")}
              disabled={busy || Number(st!.higher_mult) <= 0}
              className="rounded-lg border border-accent/50 bg-accent/10 py-2.5 text-sm font-black text-accent hover:bg-accent/20 disabled:opacity-30">
              ▲ Higher · {st!.higher_mult}x
            </button>
            <button onClick={() => guess("lower")}
              disabled={busy || Number(st!.lower_mult) <= 0}
              className="rounded-lg border border-red-400/50 bg-red-500/10 py-2.5 text-sm font-black text-red-300 hover:bg-red-500/20 disabled:opacity-30">
              ▼ Lower · {st!.lower_mult}x
            </button>
          </div>
        )}
      </div>
      <div className="mt-3 flex items-end gap-2">
        {!live ? (
          <>
            <label className="text-xs">
              <span className="mb-1 block text-[10px] uppercase tracking-wide text-slate-500">Bet</span>
              <input value={stake} onChange={(e) => setStake(e.target.value)} disabled={busy}
                className="w-20 rounded-lg bg-base-700 px-3 py-2 font-mono text-sm text-slate-100 outline-none disabled:opacity-50" />
            </label>
            <button onClick={start} disabled={busy}
              className="ml-auto rounded-lg btn-gold px-8 py-2.5 text-sm font-black uppercase tracking-wider text-base-900 disabled:opacity-50">
              Deal
            </button>
          </>
        ) : (
          <button onClick={cashout} disabled={busy || st!.multiplier === "1"}
            className="ml-auto rounded-lg btn-gold px-8 py-2.5 text-sm font-black uppercase tracking-wider text-base-900 disabled:opacity-50">
            Cash out {st!.multiplier}x
          </button>
        )}
      </div>
      {err && <p className="mt-2 text-xs text-red-300">{err}</p>}
      <p className="mt-3 text-[10px] leading-relaxed text-slate-500">
        Call the next card higher or lower — ace low, king high, a tie loses.
        Every right call multiplies at true odds; cash out whenever you like.
      </p>
    </div>
  );
}

// ------------------------------------------------------------ sugar blast ----
const TB_FRUIT: Record<string, string> = {
  banana: "🍌", grape: "🍇", melon: "🍉", plum: "🍑", apple: "🍎", heart: "❤️",
};
const TB_GEM: Record<string, string> = {
  blue: "from-sky-300 to-blue-600",
  green: "from-emerald-300 to-emerald-600",
  purple: "from-fuchsia-300 to-violet-600",
};

function TumbleCell({ sym, hot, popping }: { sym: string; hot: boolean; popping: boolean }) {
  const base = `grid aspect-square place-items-center rounded-lg border transition ${
    popping ? "scale-0 opacity-0 duration-300"
    : hot ? "border-gold bg-gold/20 shadow-gold duration-150"
    : "border-white/10 bg-white/5 duration-150"}`;
  if (sym === "scatter") {
    return <div className={base}><span className="text-xl sm:text-2xl drop-shadow-[0_0_8px_rgba(240,180,41,0.9)]">🍭</span></div>;
  }
  if (sym.startsWith("bomb:")) {
    return (
      <div className={base}>
        <span className="grid h-8 w-8 place-items-center rounded-full bg-gradient-to-b from-rose-400 to-red-700 border border-white/40 font-mono text-[10px] font-black text-white drop-shadow sm:h-9 sm:w-9">
          {sym.split(":")[1]}x
        </span>
      </div>
    );
  }
  const gem = TB_GEM[sym];
  return (
    <div className={base}>
      {gem ? (
        <span className={`h-7 w-7 rounded-xl bg-gradient-to-br ${gem} shadow-inner border border-white/30 sm:h-8 sm:w-8`}>
          <span className="ml-1 mt-1 block h-2 w-2 rounded-full bg-white/50" />
        </span>
      ) : (
        <span className="text-xl sm:text-2xl">{TB_FRUIT[sym] ?? sym}</span>
      )}
    </div>
  );
}

function SugarBlast({ def, onBalance, onPlayed }: {
  def: import("../api").TumbleDef;
  onBalance: (b: string) => void; onPlayed: () => void;
}) {
  const [stake, setStake] = useState("10");
  const [grid, setGrid] = useState<string[]>(Array.from({ length: 30 }, (_, i) =>
    def.symbols[i % def.symbols.length]));
  const [hotSyms, setHotSyms] = useState<Set<string>>(new Set());
  const [popSyms, setPopSyms] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [spinBlur, setSpinBlur] = useState(false);
  const [runWin, setRunWin] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const [fsLeft, setFsLeft] = useState(0);
  const [bonusTotal, setBonusTotal] = useState("0");
  const inBonus = fsLeft > 0;

  useEffect(() => {
    api.tumbleActive().then((r) => {
      if (r.active) {
        setFsLeft(r.active.free_spins_left);
        setBonusTotal(r.active.bonus_total);
        setStake(String(Number(r.active.stake)));
        setMsg(`🍭 FREE SPINS — ${r.active.free_spins_left} left`);
      }
    }).catch(() => {});
  }, []);

  const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

  async function play(kind: "spin" | "buy") {
    setErr(""); setBusy(true); setMsg(null); setRunWin(null);
    setHotSyms(new Set()); setPopSyms(new Set()); setSpinBlur(true);
    try {
      const r = kind === "buy" ? await api.tumbleBuy(stake) : await api.tumbleSpin(stake);
      await sleep(450);
      setSpinBlur(false);
      // play the cascade: grids[i] -> highlight steps[i] -> pop -> grids[i+1]
      setGrid(r.grids[0]);
      let acc = 0;
      for (let i = 0; i < r.steps.length; i++) {
        await sleep(420);
        const syms = new Set(r.steps[i].map((w) => w.sym));
        acc += r.steps[i].reduce((s, w) => s + Number(w.pay), 0);
        setHotSyms(syms);
        setRunWin((acc * Number(stake)).toFixed(2));
        await sleep(520);
        setPopSyms(syms);
        await sleep(330);
        setHotSyms(new Set()); setPopSyms(new Set());
        setGrid(r.grids[i + 1]);
      }
      await sleep(250);
      onBalance(r.balance);
      onPlayed();
      setFsLeft(r.free_spins_left);
      setBonusTotal(r.bonus_total);
      const bombs = Number(r.bomb_sum);
      if (r.free_spin) {
        if (Number(r.win) > 0 && bombs > 0)
          setMsg(`💣 BOMBS x${bombs} — win ${money(r.win)}! ${r.free_spins_left} spins left`);
        else if (Number(r.win) > 0)
          setMsg(`+${money(r.win)} · ${r.free_spins_left} spins left`);
        else setMsg(r.free_spins_left > 0
          ? `${r.free_spins_left} free spins left` : null);
        if (r.free_spins_left <= 0)
          setMsg(`🍬 BONUS OVER — total ${money(r.bonus_total)}`);
      } else if (r.triggered) {
        setMsg(`🍭 ${r.scatters} LOLLIPOPS — ${def.free_spins} FREE SPINS!${
          Number(r.win) > 0 ? ` Plus ${money(r.win)} now` : ""}`);
      } else if (Number(r.win) > 0) {
        setMsg(`WIN ${money(r.win)}`);
      }
    } catch (e: any) {
      setSpinBlur(false); setErr(e.message);
    } finally { setBusy(false); }
  }

  const cellHot = (s: string) => hotSyms.has(s);
  const cellPop = (s: string) => popSyms.has(s);
  const bet = Number(stake) || 0;

  return (
    <div className="rounded-xl border border-white/5 bg-base-800 shadow-card p-4">
      <div className="mb-2 flex items-baseline justify-between">
        <h3 className="text-sm font-bold text-slate-100">🍭 Sugar Blast</h3>
        <span className="font-mono text-[10px] text-slate-500">Max win {Number(def.max_win).toLocaleString()}×</span>
      </div>

      {inBonus && (
        <div className="mb-2 flex items-center justify-between rounded-lg border border-fuchsia-400/50 bg-fuchsia-500/10 px-3 py-1.5 text-xs font-bold text-fuchsia-300">
          <span>FREE SPINS · {fsLeft} left · bombs multiply wins</span>
          <span className="font-mono">{money(bonusTotal)}</span>
        </div>
      )}
      {msg && (
        <div className="mb-2 rounded-lg border border-gold/50 bg-gold/15 px-3 py-2 text-center text-sm font-black text-gold">
          {msg}
        </div>
      )}

      {/* the candy grid: 6 columns of 5 */}
      <div className="relative rounded-xl border border-pink-500/30 bg-gradient-to-b from-[#2e0a33] via-[#180419] to-black p-2.5">
        {runWin && (
          <div className="pointer-events-none absolute inset-x-0 top-1 z-10 text-center">
            <span className="rounded-full bg-black/70 px-3 py-1 font-mono text-sm font-black text-gold">
              +{runWin}
            </span>
          </div>
        )}
        <div className={`grid grid-cols-6 gap-1 sm:gap-1.5 ${spinBlur ? "animate-pulse opacity-40" : ""}`}>
          {Array.from({ length: 30 }, (_, i) => {
            // backend grid is column-major (col*5+row); render row-major
            const col = i % 6, row = Math.floor(i / 6);
            const s = grid[col * 5 + row];
            return <TumbleCell key={`${col}-${row}-${s}`} sym={s}
              hot={cellHot(s)} popping={cellPop(s)} />;
          })}
        </div>
      </div>

      <div className="mt-3 flex items-end gap-2">
        <label className="text-xs">
          <span className="mb-1 block text-[10px] uppercase tracking-wide text-slate-500">Bet</span>
          <input value={stake} onChange={(e) => setStake(e.target.value)}
            disabled={busy || inBonus}
            className="w-20 rounded-lg bg-base-700 px-3 py-2 font-mono text-sm text-slate-100 outline-none disabled:opacity-50" />
        </label>
        {!inBonus && (
          <button onClick={() => play("buy")} disabled={busy}
            className="ml-auto rounded-lg border border-gold/50 bg-base-900 px-4 py-2.5 text-xs font-black uppercase tracking-wider text-gold hover:bg-base-700 disabled:opacity-50">
            Buy Bonus · {money(String(Number(def.buy_cost) * bet))}
          </button>
        )}
        <button onClick={() => play("spin")} disabled={busy}
          className={`${inBonus ? "ml-auto animate-pulse" : ""} rounded-lg btn-gold px-8 py-2.5 text-sm font-black uppercase tracking-wider text-base-900 disabled:opacity-50`}>
          {inBonus ? `Free Spin (${fsLeft})` : "Spin"}
        </button>
      </div>
      {err && <p className="mt-2 text-xs text-red-300">{err}</p>}
      <p className="mt-3 text-[10px] leading-relaxed text-slate-500">
        No paylines — {def.min_match}+ of a symbol anywhere on the {def.cols}×{def.rows} grid
        pays. Wins explode and fresh symbols tumble in while the chain lasts.
        4+ lollipops award {def.free_spins} free spins where bomb multipliers
        stick and sum. Buy Bonus goes straight to the free spins.
      </p>
    </div>
  );
}

// --------------------------------------------------------- golden dragon ----
const DR_TIERS: [string, string, string][] = [
  // key, label, chip color classes
  ["mini", "MINI", "from-emerald-400 to-emerald-600"],
  ["minor", "MINOR", "from-sky-400 to-sky-600"],
  ["major", "MAJOR", "from-violet-400 to-violet-600"],
  ["maxi", "MAXI", "from-rose-400 to-rose-600"],
  ["super", "SUPER", "from-orange-400 to-red-600"],
];

function GoldenDragon({ def, onBalance, onPlayed }: {
  def: import("../api").DragonDef;
  onBalance: (b: string) => void; onPlayed: () => void;
}) {
  const [stake, setStake] = useState("10");
  const [locked, setLocked] = useState<Record<string, string>>({});
  const [fresh, setFresh] = useState<Set<number>>(new Set());
  const [respins, setRespins] = useState(0);
  const [inFeature, setInFeature] = useState(false);
  const [collected, setCollected] = useState("0");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [spinCells, setSpinCells] = useState(false);
  const [hitTier, setHitTier] = useState<string | null>(null);

  useEffect(() => {
    api.dragonActive().then((r) => {
      if (r.active) {
        setLocked(r.active.locked); setRespins(r.active.respins);
        setCollected(r.active.collected); setInFeature(true);
        setStake(String(Number(r.active.stake)));
      }
    }).catch(() => {});
  }, []);

  const bet = Number(stake) || 0;
  const isTier = (v: string) => (def.jackpots as Record<string, string>)[v] !== undefined;
  const coinPay = (v: string) => (isTier(v) ? Number(def.jackpots[v]) : Number(v)) * bet;

  async function run(kind: "spin" | "respin" | "buy") {
    setErr(""); setBusy(true); setMsg(null); setSpinCells(true);
    setFresh(new Set()); setHitTier(null);
    try {
      const r = kind === "spin" ? await api.dragonSpin(stake)
        : kind === "buy" ? await api.dragonBuy(stake)
        : await api.dragonRespin();
      await new Promise((res) => setTimeout(res, 700));
      setSpinCells(false);
      setLocked(r.locked);
      setFresh(new Set(Object.keys(r.coins).map(Number)));
      setRespins(r.respins);
      setCollected(r.collected);
      onBalance(r.balance);
      onPlayed();
      const tiers = Object.values(r.coins).filter(isTier);
      if (tiers.length) setHitTier(tiers[tiers.length - 1]);
      const grand = (r as any).grand && Number((r as any).grand) > 0;
      if (kind !== "respin" && (r as any).triggered) {
        setInFeature(true);
        setMsg(tiers.length
          ? `🐉 ${tiers.map((t) => t.toUpperCase()).join(" + ")} JACKPOT! Coins locked`
          : `🐉 HOLD & WIN! ${Object.keys(r.locked).length} coins locked`);
      } else if (r.status === "settled") {
        setInFeature(false);
        if (grand) setMsg(`🔥 FULL GRID — GRAND ${def.grand}× +${money((r as any).grand)}! Total ${money(r.collected)}`);
        else if (kind === "respin") setMsg(`Feature over — collected ${money(r.collected)}`);
        else if (tiers.length) setMsg(`💥 ${tiers.map((t) => t.toUpperCase()).join(" + ")} JACKPOT — paid ${money(r.win)}`);
        else if (Number(r.win) > 0) setMsg(`Coins paid ${money(r.win)}`);
      } else if (kind === "respin" && Number(r.win) > 0) {
        setMsg(tiers.length
          ? `💥 ${tiers.map((t) => t.toUpperCase()).join(" + ")} JACKPOT +${money(r.win)} — respins reset`
          : `+${money(r.win)} — respins reset`);
      }
    } catch (e: any) {
      setSpinCells(false); setErr(e.message);
    } finally { setBusy(false); }
  }

  const filled = Object.keys(locked).length;
  const fmt = (n: number) =>
    n >= 1000 ? n.toLocaleString(undefined, { maximumFractionDigits: 0 })
      : n >= 10 ? n.toFixed(0) : n.toFixed(2);

  return (
    <div className="rounded-xl border border-white/5 bg-base-800 shadow-card p-4">
      <div className="mb-2 flex items-baseline justify-between">
        <h3 className="text-sm font-bold text-slate-100">🐉 Golden Dragon Inferno</h3>
        <span className="font-mono text-[10px] text-slate-500">Hold & Win</span>
      </div>

      {/* the jackpot ladder */}
      <div className="mb-2 grid grid-cols-6 gap-1">
        {DR_TIERS.map(([key, label, grad]) => (
          <div key={key}
            className={`rounded-md border px-1 py-1 text-center transition ${
              hitTier === key
                ? "reel-pop border-gold bg-gold/20 shadow-gold"
                : "border-white/10 bg-base-900/70"}`}>
            <div className={`bg-gradient-to-b ${grad} bg-clip-text text-[8px] font-black tracking-widest text-transparent`}>
              {label}
            </div>
            <div className="font-mono text-[10px] font-bold text-slate-100">
              {fmt(Number(def.jackpots[key]) * bet)}
            </div>
          </div>
        ))}
        <div className="rounded-md border border-gold/60 bg-gradient-to-b from-gold/25 to-amber-950/60 px-1 py-1 text-center shadow-gold">
          <div className="bg-gradient-to-b from-yellow-200 to-amber-500 bg-clip-text text-[8px] font-black tracking-widest text-transparent">
            GRAND
          </div>
          <div className="font-mono text-[10px] font-black text-gold">
            {fmt(Number(def.grand) * bet)}
          </div>
        </div>
      </div>

      {inFeature && (
        <div className="mb-2 flex items-center justify-between rounded-lg border border-gold/40 bg-gold/10 px-3 py-1.5 text-xs font-bold text-gold">
          <span>HOLD & WIN · {filled}/15 · {respins} respin{respins !== 1 ? "s" : ""} left</span>
          <span className="font-mono">{money(collected)}</span>
        </div>
      )}
      {msg && (
        <div className="mb-2 rounded-lg border border-gold/50 bg-gold/15 px-3 py-2 text-center text-sm font-black text-gold">
          {msg}
        </div>
      )}

      {/* the inferno grid */}
      <div className="rounded-xl border border-red-600/40 bg-gradient-to-b from-[#3d0a04] via-[#1c0402] to-black p-3">
        <div className="grid grid-cols-5 gap-1.5">
          {Array.from({ length: 15 }, (_, i) => {
            const v = locked[String(i)];
            const tier = v && isTier(v) ? DR_TIERS.find(([k]) => k === v) : null;
            return (
              <div key={i}
                className={`grid aspect-square place-items-center rounded-md border transition ${
                  v ? (fresh.has(i)
                        ? "reel-pop border-gold bg-gradient-to-b from-gold/30 to-red-950/60 shadow-gold"
                        : "border-gold/50 bg-gradient-to-b from-gold/15 to-base-900")
                    : spinCells ? "animate-pulse border-white/10 bg-base-900"
                    : "border-white/10 bg-base-900/80"}`}>
                {v ? (
                  tier ? (
                    <span className={`grid h-10 w-10 place-items-center rounded-full bg-gradient-to-b ${tier[2]} border border-white/40 font-sans text-[8px] font-black tracking-wide text-white drop-shadow`}>
                      {tier[1]}
                    </span>
                  ) : (
                    <span className="grid h-9 w-9 place-items-center rounded-full btn-gold font-mono text-[10px] font-black text-base-900">
                      {fmt(coinPay(v))}
                    </span>
                  )
                ) : (
                  <span className="text-lg opacity-20">🐉</span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-3 flex items-end gap-2">
        <label className="text-xs">
          <span className="mb-1 block text-[10px] uppercase tracking-wide text-slate-500">Bet</span>
          <input value={stake} onChange={(e) => setStake(e.target.value)}
            disabled={busy || inFeature}
            className="w-20 rounded-lg bg-base-700 px-3 py-2 font-mono text-sm text-slate-100 outline-none disabled:opacity-50" />
        </label>
        {inFeature ? (
          <button onClick={() => run("respin")} disabled={busy}
            className="ml-auto animate-pulse rounded-lg btn-gold px-8 py-2.5 text-sm font-black uppercase tracking-wider text-base-900 disabled:opacity-50">
            Respin ({respins})
          </button>
        ) : (
          <>
            <button onClick={() => run("buy")} disabled={busy}
              className="ml-auto rounded-lg border border-gold/50 bg-base-900 px-4 py-2.5 text-xs font-black uppercase tracking-wider text-gold hover:bg-base-700 disabled:opacity-50">
              Buy Bonus · {money(String(Number(def.buy_cost) * bet))}
            </button>
            <button onClick={() => run("spin")} disabled={busy}
              className="rounded-lg btn-gold px-8 py-2.5 text-sm font-black uppercase tracking-wider text-base-900 disabled:opacity-50">
              Spin
            </button>
          </>
        )}
      </div>
      {err && <p className="mt-2 text-xs text-red-300">{err}</p>}
      <p className="mt-3 text-[10px] leading-relaxed text-slate-500">
        Fortune coins pay the moment they land — cash coins pay their printed
        value, jackpot coins pay the ladder. Land {def.trigger}+ coins to lock
        them and start {def.respins} respins; any new coin resets the counter.
        Fill all 15 for the {def.grand}× GRAND on top. Buy Bonus guarantees the
        trigger.
      </p>
    </div>
  );
}

// ------------------------------------------------------------ video slots ----
const VS_LINES: number[][] = [
  [1,1,1,1,1],[0,0,0,0,0],[2,2,2,2,2],[0,1,2,1,0],[2,1,0,1,2],
  [0,0,1,2,2],[2,2,1,0,0],[1,0,1,2,1],[1,2,1,0,1],[0,1,1,1,0],
  [2,1,1,1,2],[1,0,0,0,1],[1,2,2,2,1],[0,1,0,1,0],[2,1,2,1,2],
  [1,1,0,1,1],[1,1,2,1,1],[0,2,0,2,0],[2,0,2,0,2],[0,2,2,2,0],
];

const VS_THEMES: Record<string, { bg: string; frame: string }> = {
  golden7s: { bg: "from-[#241703] via-[#120b02] to-black", frame: "border-gold/40" },
  aztec: { bg: "from-[#12300f] via-[#0a1a08] to-black", frame: "border-emerald-500/40" },
  fruitblitz: { bg: "from-[#33063a] via-[#170318] to-black", frame: "border-fuchsia-500/40" },
  reaper: { bg: "from-[#1c1030] via-[#0d0718] to-black", frame: "border-violet-500/40" },
  neonnights: { bg: "from-[#04293a] via-[#02141d] to-black", frame: "border-cyan-400/40" },
  buffalo: { bg: "from-[#33200a] via-[#170e04] to-black", frame: "border-orange-500/40" },
};

function VSCell({ sym, hot, dim, tier }: {
  sym: string; hot: boolean; dim: boolean; tier: number;
}) {
  const spec = SYMBOL_GLYPH[sym] ?? { g: sym };
  const inner = spec.cls === "slot-bar" ? (
    <span className="rounded btn-gold px-1.5 py-0.5 font-sans text-[10px] font-black text-base-900">BAR</span>
  ) : sym === "wild" ? (
    <span className="rounded-md btn-gold px-1 py-0.5 font-sans text-[10px] font-black tracking-tight text-base-900">WILD</span>
  ) : spec.cls === "slot-gold" ? (
    <span className="bg-gradient-to-b from-slate-200 to-slate-500 bg-clip-text text-xl font-black text-transparent">{spec.g}</span>
  ) : (
    <span className={sym === "scatter"
      ? "text-2xl drop-shadow-[0_0_8px_rgba(240,180,41,0.9)]"
      : tier <= 2 ? "text-2xl drop-shadow-[0_0_6px_rgba(255,255,255,0.25)]" : "text-2xl"}>{spec.g}</span>
  );
  // rarity frames: wild/scatter glow gold, the theme highs get a rich ring,
  // mids a cool one, card royals stay quiet
  const frame = sym === "wild" || sym === "scatter"
    ? "border-gold/60 bg-gradient-to-b from-gold/15 to-base-900"
    : tier <= 2 ? "border-amber-400/40 bg-gradient-to-b from-amber-500/10 to-base-900"
    : tier <= 4 ? "border-sky-400/30 bg-gradient-to-b from-sky-500/10 to-base-900"
    : "border-white/10 bg-base-900/90";
  return (
    <div className={`grid aspect-square place-items-center rounded-md border transition ${
      hot ? "border-gold bg-gold/25 shadow-gold"
        : dim ? `${frame} opacity-35`
        : frame}`}>
      {inner}
    </div>
  );
}

function VideoSlot({ def, onBalance, onPlayed }: {
  def: { key: string; name: string; rules: string; vslot?: import("../api").VSlotDef };
  onBalance: (b: string) => void; onPlayed: () => void;
}) {
  const vs = def.vslot!;
  const [stake, setStake] = useState("10");
  const [grid, setGrid] = useState<string[][]>(
    Array.from({ length: 5 }, (_, i) => [0, 1, 2].map((r) => vs.symbols[(i + r + 2) % vs.symbols.length])));
  const [live, setLive] = useState<boolean[]>([false, false, false, false, false]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [wins, setWins] = useState<{ line: number; symbol: string; count: number; pay: string }[]>([]);
  const [hotLine, setHotLine] = useState<number | null>(null);
  const [lastWin, setLastWin] = useState<string | null>(null);
  const [freeLeft, setFreeLeft] = useState(0);
  const [bonusTotal, setBonusTotal] = useState("0");
  const [banner, setBanner] = useState<string | null>(null);
  const [showPays, setShowPays] = useState(false);

  useEffect(() => {
    api.vslotActive().then((r) => {
      if (r.active && `vslot:${r.active.machine}` === def.key) {
        setFreeLeft(r.active.free_spins_left);
        setBonusTotal(r.active.bonus_total);
        setStake(String(Number(r.active.stake)));
      }
    }).catch(() => {});
  }, [def.key]);

  // cycle the highlight through winning lines
  useEffect(() => {
    if (wins.length === 0) { setHotLine(null); return; }
    let i = 0;
    setHotLine(wins[0].line);
    const iv = window.setInterval(() => {
      i = (i + 1) % wins.length;
      setHotLine(wins[i].line);
    }, 900);
    return () => window.clearInterval(iv);
  }, [wins]);

  async function buyBonus() {
    setErr(""); setBusy(true); setBanner(null);
    try {
      const r = await api.vslotBuy(vs.machine, stake);
      onBalance(r.balance);
      setFreeLeft(r.free_spins_left);
      setBonusTotal("0");
      setBanner(`⭐ BONUS BOUGHT — ${r.free_spins_left} FREE SPINS at ${r.mult}× ⭐`);
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }

  async function doSpin() {
    setErr(""); setBusy(true); setWins([]); setLastWin(null); setBanner(null);
    setLive([true, true, true, true, true]);
    const ticks = [0, 1, 2, 3, 4].map((i) => window.setInterval(() => {
      setGrid((g) => {
        const n = g.map((col) => [...col]);
        n[i] = [0, 1, 2].map(() => vs.symbols[Math.floor(Math.random() * vs.symbols.length)]);
        return n;
      });
    }, 60 + i * 8));
    try {
      const wasFree = freeLeft > 0;
      const r = await api.vslotSpin(vs.machine, stake);
      [0, 1, 2, 3, 4].forEach((i) => window.setTimeout(() => {
        window.clearInterval(ticks[i]);
        setGrid((g) => {
          const n = g.map((col) => [...col]);
          n[i] = r.grid[i];
          return n;
        });
        setLive((l) => { const n = [...l]; n[i] = false; return n; });
        if (i === 4) {
          setWins(r.line_wins);
          if (Number(r.win) > 0) setLastWin(r.win);
          setFreeLeft(r.free_spins_left);
          setBonusTotal(r.bonus_total);
          if (!wasFree && r.free_spins_left > 0) {
            setBanner(`⭐ ${r.free_spins_left} FREE SPINS at ${vs.free_spins.mult}× ⭐`);
          } else if (wasFree && r.free_spins_left === 0) {
            setBanner(`Bonus over — total ${money(r.bonus_total)}`);
          }
          onBalance(r.balance);
          onPlayed();
          setBusy(false);
        }
      }, 420 + i * 260));
    } catch (e: any) {
      ticks.forEach((t) => window.clearInterval(t));
      setLive([false, false, false, false, false]);
      setErr(e.message); setBusy(false);
    }
  }

  const hotCells = new Set<string>();
  if (hotLine !== null) {
    const w = wins.find((x) => x.line === hotLine);
    const shape = VS_LINES[hotLine];
    if (w && shape) for (let reel = 0; reel < w.count; reel++) hotCells.add(`${reel}-${shape[reel]}`);
  }

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-white/5 bg-base-800 shadow-card p-4">
        <div className="mb-2 flex items-baseline justify-between">
          <h3 className="text-sm font-bold text-slate-100">🎰 {def.name}</h3>
          <button onClick={() => setShowPays(!showPays)}
            className="text-[10px] font-bold text-sky-400 hover:text-sky-300">
            {showPays ? "Hide pays" : "Paytable"}
          </button>
        </div>

        {freeLeft > 0 && (
          <div className="mb-2 flex items-center justify-between rounded-lg border border-gold/40 bg-gold/10 px-3 py-1.5 text-xs font-bold text-gold">
            <span>FREE SPINS · {freeLeft} left · all wins {vs.free_spins.mult}×</span>
            <span className="font-mono">{money(bonusTotal)}</span>
          </div>
        )}
        {banner && (
          <div className="mb-2 animate-pulse rounded-lg border border-gold/50 bg-gold/15 px-3 py-2 text-center text-sm font-black text-gold">
            {banner}
          </div>
        )}

        <div className={`rounded-xl border bg-gradient-to-b p-3 ${
          (VS_THEMES[vs.machine] ?? VS_THEMES.golden7s).frame} ${
          (VS_THEMES[vs.machine] ?? VS_THEMES.golden7s).bg}`}>
          <div className="grid grid-cols-5 gap-1.5">
            {grid.map((col, reel) => (
              <div key={reel} className={`grid gap-1.5 ${live[reel] ? "blur-[1.5px]" : ""}`}>
                {col.map((sym, row) => (
                  <VSCell key={row} sym={sym} tier={vs.symbols.indexOf(sym)}
                    hot={hotCells.has(`${reel}-${row}`)}
                    dim={hotLine !== null && !hotCells.has(`${reel}-${row}`)} />
                ))}
              </div>
            ))}
          </div>
          <div className="mt-2 flex h-6 items-center justify-center text-sm font-bold">
            {busy ? <span className="text-slate-500">…</span>
              : lastWin ? <span className="text-accent">WIN {money(lastWin)}{freeLeft > 0 ? ` · ${vs.free_spins.mult}× bonus` : ""}</span>
              : wins.length === 0 && <span className="text-[11px] font-medium text-slate-600">20 lines · {vs.free_spins.trigger}+ ⭐ = {vs.free_spins.count} free spins</span>}
          </div>
        </div>

        <div className="mt-3 flex items-end gap-2">
          <label className="text-xs">
            <span className="mb-1 block text-[10px] uppercase tracking-wide text-slate-500">Bet</span>
            <input value={stake} onChange={(e) => setStake(e.target.value)}
              disabled={busy || freeLeft > 0}
              className="w-20 rounded-lg bg-base-700 px-3 py-2 font-mono text-sm text-slate-100 outline-none disabled:opacity-50" />
          </label>
          {freeLeft === 0 && (vs as any).buy_cost && (
            <button onClick={buyBonus} disabled={busy}
              className="rounded-lg border border-fuchsia-400/50 bg-fuchsia-500/15 px-3 py-2.5 text-[11px] font-black uppercase leading-tight tracking-wide text-fuchsia-300 hover:bg-fuchsia-500/25 disabled:opacity-50">
              Buy Bonus<br /><span className="font-mono">{(vs as any).buy_cost}× bet</span>
            </button>
          )}
          <button onClick={doSpin} disabled={busy}
            className="ml-auto rounded-lg btn-gold px-8 py-2.5 text-sm font-black uppercase tracking-wider text-base-900 disabled:opacity-50">
            {freeLeft > 0 ? `Free Spin (${freeLeft})` : "Spin"}
          </button>
        </div>
        {err && <p className="mt-2 text-xs text-red-300">{err}</p>}
      </div>

      {showPays && (
        <div className="rounded-xl border border-white/5 bg-base-800 shadow-card p-4">
          <h4 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-400">
            Pays per line bet (bet ÷ 20)
          </h4>
          <div className="space-y-1">
            {Object.entries(vs.pays).map(([sym, table]) => (
              <div key={sym} className="flex items-center justify-between rounded-lg bg-base-900/50 px-3 py-1.5 text-xs">
                <span className="flex items-center gap-2">
                  <VSCellMini sym={sym} />
                </span>
                <span className="font-mono text-slate-300">
                  {["3", "4", "5"].map((n) => table[n] ? `${n}× = ${table[n]}` : "").filter(Boolean).join(" · ")}
                </span>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[10px] text-slate-500">
            Wilds substitute for everything except scatters. Wins pay left to right
            on the 20 fixed lines. {vs.free_spins.trigger}+ scatters anywhere start{" "}
            {vs.free_spins.count} free spins with all wins at {vs.free_spins.mult}×.
          </p>
        </div>
      )}
    </div>
  );
}

function VSCellMini({ sym }: { sym: string }) {
  const spec = SYMBOL_GLYPH[sym] ?? { g: sym };
  if (sym === "wild") return <span className="rounded btn-gold px-1.5 text-[10px] font-black text-base-900">WILD</span>;
  if (spec.cls === "slot-bar") return <span className="rounded btn-gold px-1.5 text-[10px] font-black text-base-900">BAR</span>;
  if (spec.cls === "slot-gold") return <span className="text-base font-black text-gold">{spec.g}</span>;
  return <span className="text-base">{spec.g}</span>;
}

// -------------------------------------------------------------- roulette ----
const RL_RED = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);
type RlBet = { kind: string; pick?: number | null; stake: string; label: string };

function Roulette({ onBalance, onPlayed }: {
  onBalance: (b: string) => void; onPlayed: () => void;
}) {
  const [stake, setStake] = useState("5");
  const [bets, setBets] = useState<RlBet[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [last, setLast] = useState<{ pocket: number; color: string; payout: string } | null>(null);

  const add = (kind: string, pick: number | null, label: string) => {
    setErr("");
    if (bets.length >= 15) { setErr("15 bets max per spin"); return; }
    setBets([...bets, { kind, pick, stake, label }]);
  };
  const total = bets.reduce((a, b) => a + Number(b.stake), 0);

  async function spin() {
    setErr(""); setBusy(true); setLast(null);
    try {
      const r = await api.rouletteSpin(bets.map(({ kind, pick, stake }) => ({ kind, pick, stake })));
      setLast(r); onBalance(r.balance); onPlayed(); setBets([]);
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }

  const numBtn = (n: number) => (
    <button key={n} onClick={() => add("straight", n, `#${n}`)}
      className={`h-9 rounded-md text-xs font-bold text-white transition hover:brightness-125 ${
        n === 0 ? "col-span-2 bg-green-700" : RL_RED.has(n) ? "bg-red-800" : "bg-base-900 border border-white/10"}`}>
      {n}
    </button>
  );

  const OUTSIDE: [string, number | null, string][] = [
    ["red", null, "Red"], ["black", null, "Black"], ["even", null, "Even"],
    ["odd", null, "Odd"], ["low", null, "1–18"], ["high", null, "19–36"],
    ["dozen", 0, "1st 12"], ["dozen", 1, "2nd 12"], ["dozen", 2, "3rd 12"],
    ["column", 0, "Col 1"], ["column", 1, "Col 2"], ["column", 2, "Col 3"],
  ];

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-white/5 bg-base-800 shadow-card p-4">
        <div className="mb-3 flex items-baseline justify-between">
          <h3 className="text-sm font-bold text-slate-100">🎯 Roulette</h3>
          <span className="font-mono text-[10px] text-slate-500">European</span>
        </div>

        {last && (
          <div className={`mb-3 rounded-lg border px-3 py-2 text-center text-sm font-bold ${
            Number(last.payout) > 0
              ? "border-accent/40 bg-accent/10 text-accent"
              : "border-white/10 bg-base-900/60 text-slate-400"}`}>
            <span className={`mr-2 inline-grid h-7 w-7 place-items-center rounded-full align-middle text-white ${
              last.color === "green" ? "bg-green-700" : last.color === "red" ? "bg-red-700" : "bg-base-900 border border-white/20"}`}>
              {last.pocket}
            </span>
            {Number(last.payout) > 0 ? `Paid ${money(last.payout)}` : "House takes it"}
          </div>
        )}

        <div className="grid grid-cols-6 gap-1">{Array.from({ length: 37 }, (_, n) => numBtn(n))}</div>
        <div className="mt-2 grid grid-cols-3 gap-1">
          {OUTSIDE.map(([k, pick, label]) => (
            <button key={label} onClick={() => add(k, pick, label)}
              className="h-8 rounded-md border border-white/10 bg-base-700/70 text-[11px] font-semibold text-slate-200 hover:border-gold/40 hover:bg-base-600">
              {label}
            </button>
          ))}
        </div>

        <div className="mt-3 flex items-end gap-2">
          <label className="text-xs">
            <span className="mb-1 block text-[10px] uppercase tracking-wide text-slate-500">Chip</span>
            <input value={stake} onChange={(e) => setStake(e.target.value)}
              className="w-20 rounded-lg bg-base-700 px-3 py-2 font-mono text-sm text-slate-100 outline-none" />
          </label>
          <button onClick={spin} disabled={busy || bets.length === 0}
            className="ml-auto rounded-lg btn-gold px-8 py-2 text-sm font-black uppercase tracking-wider text-base-900 disabled:opacity-50">
            {busy ? "…" : `Spin${total ? ` (${money(total)})` : ""}`}
          </button>
        </div>

        {bets.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {bets.map((b, i) => (
              <button key={i} onClick={() => setBets(bets.filter((_, j) => j !== i))}
                className="rounded-full border border-gold/30 bg-gold/10 px-2.5 py-1 font-mono text-[10px] text-gold hover:bg-red-500/20 hover:text-red-300">
                {b.label} · {money(b.stake)} ✕
              </button>
            ))}
          </div>
        )}
        {err && <p className="mt-2 text-xs text-red-300">{err}</p>}
        <p className="mt-3 text-[10px] leading-relaxed text-slate-500">
          Tap the layout to place chips, tap a chip to take it back. Straight up pays 35:1,
          dozens/columns 2:1, even-money bets 1:1.
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------- video poker ----
function VideoPoker({ onBalance, onPlayed }: {
  onBalance: (b: string) => void; onPlayed: () => void;
}) {
  const [stake, setStake] = useState("10");
  const [round, setRound] = useState<number | null>(null);
  const [hand, setHand] = useState<string[]>([]);
  const [holds, setHolds] = useState<boolean[]>([false, false, false, false, false]);
  const [paytable, setPaytable] = useState<[string, string][]>([]);
  const [result, setResult] = useState<{ result: string; payout: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    api.vpActive().then((r) => {
      if (r.active) {
        setRound(r.active.round_id); setHand(r.active.hand);
        setPaytable(r.active.paytable);
      }
    }).catch(() => {});
  }, []);

  async function deal() {
    setErr(""); setBusy(true); setResult(null);
    try {
      const r = await api.vpDeal(stake);
      setRound(r.round_id); setHand(r.hand); setPaytable(r.paytable);
      setHolds([false, false, false, false, false]);
      onBalance(r.balance); onPlayed();
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }

  async function draw() {
    if (round === null) return;
    setErr(""); setBusy(true);
    try {
      const r = await api.vpDraw(round, holds);
      setHand(r.hand); setResult({ result: r.result, payout: r.payout });
      setRound(null); onBalance(r.balance); onPlayed();
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }

  const open = round !== null;
  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-white/5 bg-base-800 shadow-card p-4">
        <div className="mb-1 flex items-baseline justify-between">
          <h3 className="text-sm font-bold text-slate-100">🂡 Video Poker</h3>
          <span className="font-mono text-[10px] text-slate-500">Jacks or Better · 9/6</span>
        </div>
        <p className="mb-3 text-[10px] text-slate-500">
          Five cards. Tap the ones to HOLD, draw once, get paid on the table below.
        </p>

        {hand.length > 0 && (
          <div className="mb-3 flex justify-center gap-2">
            {hand.map((c, i) => (
              <button key={i} disabled={!open}
                onClick={() => setHolds(holds.map((h, j) => (j === i ? !h : h)))}
                className="flex flex-col items-center gap-1">
                <span className={holds[i] && open ? "rounded-lg ring-2 ring-gold" : ""}>
                  <PlayingCard c={c} />
                </span>
                <span className={`text-[9px] font-bold uppercase tracking-wide ${
                  holds[i] && open ? "text-gold" : "text-slate-600"}`}>
                  {open ? (holds[i] ? "Held" : "Hold") : ""}
                </span>
              </button>
            ))}
          </div>
        )}

        {result && (
          <div className={`mb-3 rounded-lg border px-3 py-2 text-center text-sm font-bold ${
            Number(result.payout) > 0
              ? "border-accent/40 bg-accent/10 text-accent"
              : "border-white/10 bg-base-900/60 text-slate-400"}`}>
            {result.result}{Number(result.payout) > 0 ? ` — paid ${money(result.payout)}` : ""}
          </div>
        )}

        <div className="flex items-end gap-2">
          <label className="text-xs">
            <span className="mb-1 block text-[10px] uppercase tracking-wide text-slate-500">Stake</span>
            <input value={stake} onChange={(e) => setStake(e.target.value)} disabled={open}
              className="w-24 rounded-lg bg-base-700 px-3 py-2 font-mono text-sm text-slate-100 outline-none disabled:opacity-50" />
          </label>
          {open ? (
            <button onClick={draw} disabled={busy}
              className="ml-auto rounded-lg btn-gold px-8 py-2 text-sm font-black uppercase tracking-wider text-base-900 disabled:opacity-50">
              Draw
            </button>
          ) : (
            <button onClick={deal} disabled={busy}
              className="ml-auto rounded-lg btn-gold px-8 py-2 text-sm font-black uppercase tracking-wider text-base-900 disabled:opacity-50">
              Deal
            </button>
          )}
        </div>
        {err && <p className="mt-2 text-xs text-red-300">{err}</p>}
      </div>

      {paytable.length > 0 && (
        <div className="rounded-xl border border-white/5 bg-base-800 shadow-card p-4">
          <h4 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-400">Paytable</h4>
          <div className="space-y-1">
            {paytable.map(([name, mult]) => (
              <div key={name} className="flex justify-between rounded-lg bg-base-900/50 px-3 py-1.5 text-xs">
                <span className="text-slate-300">{name}</span>
                <span className="font-mono font-bold text-gold">{mult}×</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// -------------------------------------------------------------- baccarat ----
function Baccarat({ onBalance, onPlayed }: {
  onBalance: (b: string) => void; onPlayed: () => void;
}) {
  const [bet, setBet] = useState<"player" | "banker" | "tie">("banker");
  const [stake, setStake] = useState("10");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [d, setD] = useState<Awaited<ReturnType<typeof api.baccaratDeal>> | null>(null);

  async function deal() {
    setErr(""); setBusy(true);
    try {
      const r = await api.baccaratDeal(bet, stake);
      setD(r); onBalance(r.balance); onPlayed();
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }

  const side = (label: string, cards: string[], total: number, winner: boolean, tone: string) => (
    <div className={`flex-1 rounded-lg border p-3 text-center ${
      winner ? "border-accent/50 bg-accent/5" : "border-white/10 bg-base-900/50"}`}>
      <div className={`mb-2 text-[10px] font-bold uppercase tracking-widest ${tone}`}>{label}</div>
      <div className="flex justify-center gap-1.5">{cards.map((c, i) => <PlayingCard key={i} c={c} />)}</div>
      <div className="mt-2 font-mono text-lg font-black text-slate-100">{total}</div>
    </div>
  );

  return (
    <div className="rounded-xl border border-white/5 bg-base-800 shadow-card p-4">
      <div className="mb-1 flex items-baseline justify-between">
        <h3 className="text-sm font-bold text-slate-100">🀄 Baccarat</h3>
        <span className="font-mono text-[10px] text-slate-500">8-deck shoe · punto banco</span>
      </div>
      <p className="mb-3 text-[10px] text-slate-500">
        Standard third-card rules. Banker win pays 0.95:1 · player 1:1 · tie 8:1.
        Player/banker bets push on a tie.
      </p>

      {d && (
        <>
          <div className="mb-2 flex gap-2">
            {side("Player", d.player, d.player_total, d.outcome === "player", "text-sky-300")}
            {side("Banker", d.banker, d.banker_total, d.outcome === "banker", "text-red-300")}
          </div>
          <div className={`mb-3 rounded-lg border px-3 py-2 text-center text-sm font-bold ${
            Number(d.payout) > Number(d.multiplier === "1" ? "0" : "0") && Number(d.payout) > 0
              ? Number(d.multiplier) > 1
                ? "border-accent/40 bg-accent/10 text-accent"
                : "border-white/10 bg-base-900/60 text-slate-300"
              : "border-white/10 bg-base-900/60 text-slate-400"}`}>
            {d.outcome === "tie" ? "TIE" : `${d.outcome.toUpperCase()} wins`}
            {Number(d.payout) > 0
              ? Number(d.multiplier) === 1 ? " — push, stake back" : ` — paid ${money(d.payout)}`
              : " — house takes it"}
          </div>
        </>
      )}

      <div className="mb-3 grid grid-cols-3 gap-1.5 text-center text-xs font-bold">
        {([["player", "Player 1:1", "text-sky-300"], ["banker", "Banker 0.95:1", "text-red-300"],
           ["tie", "Tie 8:1", "text-gold"]] as const).map(([id, label, tone]) => (
          <button key={id} onClick={() => setBet(id)}
            className={`rounded-lg border py-2.5 transition ${
              bet === id ? "border-gold/60 bg-gold/10 " + tone
                : "border-white/10 bg-base-900/50 text-slate-400 hover:border-white/25"}`}>
            {label}
          </button>
        ))}
      </div>

      <div className="flex items-end gap-2">
        <label className="text-xs">
          <span className="mb-1 block text-[10px] uppercase tracking-wide text-slate-500">Stake</span>
          <input value={stake} onChange={(e) => setStake(e.target.value)}
            className="w-24 rounded-lg bg-base-700 px-3 py-2 font-mono text-sm text-slate-100 outline-none" />
        </label>
        <button onClick={deal} disabled={busy}
          className="ml-auto rounded-lg btn-gold px-8 py-2 text-sm font-black uppercase tracking-wider text-base-900 disabled:opacity-50">
          {busy ? "…" : "Deal"}
        </button>
      </div>
      {err && <p className="mt-2 text-xs text-red-300">{err}</p>}
    </div>
  );
}

// ----------------------------------------------------------------- mines ----
function Mines({ onBalance, onPlayed }: {
  onBalance: (b: string) => void; onPlayed: () => void;
}) {
  const [stake, setStake] = useState("10");
  const [mines, setMines] = useState(5);
  const [st, setSt] = useState<import("../api").MinesState | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    api.minesActive().then((r) => { if (r.active) setSt(r.active); }).catch(() => {});
  }, []);

  const open = st?.status === "open";
  const done = st?.status === "settled";

  async function run(fn: () => Promise<import("../api").MinesState>) {
    setErr(""); setBusy(true);
    try {
      const r = await fn();
      setSt(r);
      if (r.balance) onBalance(r.balance);
      onPlayed();
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }

  const cellState = (i: number): "hidden" | "safe" | "mine" | "boom" => {
    if (!st) return "hidden";
    if (st.revealed.includes(i)) return "safe";
    if (done && st.layout?.includes(i)) return st.outcome === "bust" ? "boom" : "mine";
    return "hidden";
  };

  return (
    <div className="rounded-xl border border-white/5 bg-base-800 shadow-card p-4">
      <div className="mb-1 flex items-baseline justify-between">
        <h3 className="text-sm font-bold text-slate-100">💣 Mines</h3>
      </div>
      <p className="mb-3 text-[10px] text-slate-500">
        Pick tiles, dodge the mines, cash out whenever. More mines, bigger multipliers.
      </p>

      <div className="mx-auto grid max-w-[300px] grid-cols-5 gap-1.5">
        {Array.from({ length: 25 }, (_, i) => {
          const cs = cellState(i);
          return (
            <button key={i} disabled={!open || busy || cs !== "hidden"}
              onClick={() => st && run(() => api.minesReveal(st.round_id, i))}
              className={`grid aspect-square place-items-center rounded-lg border text-xl transition ${
                cs === "safe" ? "border-accent/50 bg-accent/10"
                : cs === "boom" ? "border-red-500/70 bg-red-500/20"
                : cs === "mine" ? "border-red-500/30 bg-base-900/60 opacity-70"
                : open ? "border-white/10 bg-base-700/70 hover:border-gold/40 hover:bg-base-600"
                : "border-white/5 bg-base-900/50"}`}>
              {cs === "safe" ? "💎" : cs === "boom" ? "💥" : cs === "mine" ? "💣" : ""}
            </button>
          );
        })}
      </div>

      <div className="mt-3 text-center text-sm font-bold">
        {open && st && (
          <span className="text-slate-300">
            {st.revealed.length === 0 ? `First pick pays ${st.next_multiplier}×`
              : `Sitting on ${st.multiplier}× — next ${st.next_multiplier ?? "—"}×`}
          </span>
        )}
        {done && st && (
          st.outcome === "bust"
            ? <span className="text-red-400">BOOM — stake gone</span>
            : <span className="text-accent">Cashed {st.multiplier}× — paid {money(st.payout ?? "0")}</span>
        )}
      </div>

      <div className="mt-3 flex items-end gap-2">
        <label className="text-xs">
          <span className="mb-1 block text-[10px] uppercase tracking-wide text-slate-500">Stake</span>
          <input value={stake} onChange={(e) => setStake(e.target.value)} disabled={open}
            className="w-20 rounded-lg bg-base-700 px-3 py-2 font-mono text-sm text-slate-100 outline-none disabled:opacity-50" />
        </label>
        <label className="text-xs">
          <span className="mb-1 block text-[10px] uppercase tracking-wide text-slate-500">Mines</span>
          <select value={mines} onChange={(e) => setMines(Number(e.target.value))} disabled={open}
            className="rounded-lg bg-base-700 px-2 py-2 font-mono text-sm text-slate-100 outline-none disabled:opacity-50">
            {[1, 3, 5, 10, 15, 20, 24].map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </label>
        {open && st ? (
          <button onClick={() => run(() => api.minesCashout(st.round_id))}
            disabled={busy || st.revealed.length === 0}
            className="ml-auto rounded-lg bg-accent px-6 py-2 text-sm font-black uppercase tracking-wider text-base-900 hover:brightness-110 disabled:opacity-50">
            Cash out {st.revealed.length > 0 ? `${st.multiplier}×` : ""}
          </button>
        ) : (
          <button onClick={() => run(() => api.minesStart(stake, mines))} disabled={busy}
            className="ml-auto rounded-lg btn-gold px-8 py-2 text-sm font-black uppercase tracking-wider text-base-900 disabled:opacity-50">
            Start
          </button>
        )}
      </div>
      {err && <p className="mt-2 text-xs text-red-300">{err}</p>}
    </div>
  );
}


// ---------------------------------------------------------------- plinko ----
function Plinko({ def, onBalance, onPlayed }: {
  def: import("../api").PlinkoDef;
  onBalance: (b: string) => void; onPlayed: () => void;
}) {
  const [rows, setRows] = useState(12);
  const [risk, setRisk] = useState<"low" | "medium" | "high">("medium");
  const [stake, setStake] = useState("10");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [ball, setBall] = useState<{ row: number; x: number } | null>(null);
  const [landed, setLanded] = useState<number | null>(null);
  const [last, setLast] = useState<{ multiplier: string; payout: string } | null>(null);

  const table = def.tables[String(rows)]?.[risk] ?? [];

  async function drop() {
    setErr(""); setBusy(true); setLast(null); setLanded(null);
    try {
      const r = await api.plinkoDrop(stake, rows, risk);
      onBalance(r.balance);
      // walk the real path down the board, one row at a time
      let x = 0;
      for (let i = 0; i < r.path.length; i++) {
        x += r.path[i];
        const fx = x;
        window.setTimeout(() => setBall({ row: i + 1, x: fx }), 90 * (i + 1));
      }
      window.setTimeout(() => {
        setBall(null);
        setLanded(r.bucket);
        setLast({ multiplier: r.multiplier, payout: r.payout });
        onPlayed();
        setBusy(false);
      }, 90 * (r.path.length + 2));
    } catch (e: any) {
      setErr(e.message); setBusy(false);
    }
  }

  // board geometry: viewBox units
  const W = 340, PAD = 22;
  const stepY = (200 - 20) / rows;
  const stepX = (W - PAD * 2) / rows;
  const px = (row: number, i: number) => W / 2 + (i - row / 2) * stepX;

  const pegs: React.ReactNode[] = [];
  for (let r = 1; r <= rows; r++) {
    for (let i = 0; i <= r; i++) {
      pegs.push(<circle key={`${r}-${i}`} cx={px(r, i)} cy={14 + r * stepY}
        r={rows === 16 ? 2.2 : 3} fill="#3b4a63" />);
    }
  }

  const bWidth = (W - PAD * 2) / (rows + 1);
  const hot = (m: string) => Number(m) >= 10 ? "#f0b429"
    : Number(m) >= 2 ? "#f59e0b" : Number(m) >= 1 ? "#4ade80" : "#334155";

  return (
    <div className="rounded-xl border border-white/5 bg-base-800 shadow-card p-4">
      <div className="mb-1 flex items-baseline justify-between">
        <h3 className="text-sm font-bold text-slate-100">🔻 Plinko</h3>
      </div>
      <p className="mb-3 text-[10px] text-slate-500">
        Drop the ball through the pegs — rim buckets pay big, the middle eats the stake.
      </p>

      <div className="rounded-xl border border-white/10 bg-gradient-to-b from-base-900 to-base-950 p-2">
        <svg viewBox={`0 0 ${W} 232`} className="w-full">
          {pegs}
          {ball && (
            <circle cx={px(ball.row, ball.x)} cy={14 + ball.row * stepY - stepY / 2}
              r="5" fill="#f0b429" />
          )}
          {table.map((m, i) => (
            <g key={i}>
              <rect x={PAD + i * bWidth + 0.5} y={210}
                width={bWidth - 1} height={18} rx="3"
                fill={landed === i ? "#f0b429" : "rgba(255,255,255,0.06)"}
                stroke={landed === i ? "#f7ca5e" : hot(m)} strokeWidth="1" />
              <text x={PAD + i * bWidth + bWidth / 2} y={222}
                textAnchor="middle"
                fontSize={rows === 16 ? 5.4 : rows === 12 ? 6.5 : 8}
                fontWeight="700"
                fill={landed === i ? "#0b0e14" : "#cbd5e1"}>
                {Number(m) >= 100 ? Number(m).toFixed(0) : m}x
              </text>
            </g>
          ))}
        </svg>
        <div className="pb-1 text-center text-sm font-bold">
          {busy && !last ? <span className="text-slate-400">…</span>
            : last ? (Number(last.payout) > Number(stake)
              ? <span className="text-accent">{last.multiplier}× — paid {money(last.payout)}</span>
              : Number(last.payout) > 0
                ? <span className="text-slate-300">{last.multiplier}× — back {money(last.payout)}</span>
                : <span className="text-slate-500">{last.multiplier}× — swallowed</span>)
            : <span className="text-slate-500">Pick your board and drop.</span>}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-end gap-2">
        <label className="text-xs">
          <span className="mb-1 block text-[10px] uppercase tracking-wide text-slate-500">Stake</span>
          <input value={stake} onChange={(e) => setStake(e.target.value)} disabled={busy}
            className="w-20 rounded-lg bg-base-700 px-3 py-2 font-mono text-sm text-slate-100 outline-none disabled:opacity-50" />
        </label>
        <label className="text-xs">
          <span className="mb-1 block text-[10px] uppercase tracking-wide text-slate-500">Rows</span>
          <select value={rows} onChange={(e) => setRows(Number(e.target.value))} disabled={busy}
            className="rounded-lg bg-base-700 px-2 py-2 font-mono text-sm text-slate-100 outline-none disabled:opacity-50">
            {def.rows.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </label>
        <div className="flex gap-1">
          {(["low", "medium", "high"] as const).map((r) => (
            <button key={r} onClick={() => setRisk(r)} disabled={busy}
              className={`rounded-lg px-3 py-2 text-xs font-bold capitalize ${
                risk === r ? "btn-gold text-base-900"
                  : "bg-base-700 text-slate-300 hover:bg-base-600"}`}>
              {r}
            </button>
          ))}
        </div>
        <button onClick={drop} disabled={busy}
          className="ml-auto rounded-lg btn-gold px-8 py-2 text-sm font-black uppercase tracking-wider text-base-900 disabled:opacity-50">
          Drop
        </button>
      </div>
      {err && <p className="mt-2 text-xs text-red-300">{err}</p>}
    </div>
  );
}

// ----------------------------------------------------------------- crash ----
function crashColor(pt: number): string {
  if (pt >= 10) return "text-gold";
  if (pt >= 2) return "text-accent";
  return "text-red-400";
}

function Crash({ onBalance, onPlayed }: {
  onBalance: (b: string) => void; onPlayed: () => void;
}) {
  const [stake, setStake] = useState("10");
  const [auto, setAuto] = useState("");
  const [flying, setFlying] = useState<{ id: number; rate: number; t0: number } | null>(null);
  const [mult, setMult] = useState(1);
  const [res, setRes] = useState<{ won: boolean; point: string; multiplier: string | null; payout: string } | null>(null);
  const [hist, setHist] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const loadHist = () => api.crashHistory().then((r) => setHist(r.points)).catch(() => {});
  useEffect(() => {
    loadHist();
    api.crashActive().then((r) => {
      if (r.active) setFlying({ id: r.active.round_id, rate: r.active.rate,
                                t0: new Date(r.active.started_at).getTime() });
    }).catch(() => {});
  }, []);

  // the animation clock
  useEffect(() => {
    if (!flying) return;
    const iv = window.setInterval(() => {
      const secs = (Date.now() - flying.t0) / 1000;
      setMult(Math.min(1000, Math.exp(flying.rate * Math.max(0, secs))));
    }, 50);
    return () => window.clearInterval(iv);
  }, [flying]);

  // the flight check: the server decides when the rocket dies
  useEffect(() => {
    if (!flying) return;
    const iv = window.setInterval(async () => {
      try {
        const st = await api.crashState(flying.id);
        if (st.status === "bust") {
          setRes({ won: false, point: st.point!, multiplier: null, payout: "0" });
          setFlying(null); onPlayed(); loadHist();
        } else if (st.status !== "flying") {
          setFlying(null);
        }
      } catch { /* transient */ }
    }, 1000);
    return () => window.clearInterval(iv);
  }, [flying, onPlayed]);

  async function start() {
    setErr(""); setBusy(true); setRes(null);
    try {
      const r = await api.crashStart(stake, auto.trim() || undefined);
      onBalance(r.balance);
      if (r.status === "open" && r.rate && r.started_at) {
        setFlying({ id: r.round_id, rate: r.rate, t0: new Date(r.started_at).getTime() });
        setMult(1);
      } else {
        setRes({ won: !!r.won, point: r.point!, multiplier: r.multiplier ?? null, payout: r.payout! });
        onPlayed(); loadHist();
      }
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }

  async function cashout() {
    if (!flying) return;
    setBusy(true);
    try {
      const r = await api.crashCashout(flying.id);
      setRes({ won: r.won, point: r.point, multiplier: r.multiplier, payout: r.payout });
      setFlying(null); onBalance(r.balance); onPlayed(); loadHist();
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }

  // ---- the curve
  const W = 320, H = 170;
  const elapsed = flying ? Math.max(0.05, (Date.now() - flying.t0) / 1000) : 0;
  const tView = Math.max(6, elapsed * 1.15);
  const mMax = Math.max(2, mult * 1.2);
  const pts: string[] = [];
  if (flying) {
    for (let i = 0; i <= 48; i++) {
      const t = (i / 48) * elapsed;
      const m = Math.exp(flying.rate * t);
      const x = 12 + (t / tView) * (W - 24);
      const y = H - 14 - ((m - 1) / (mMax - 1)) * (H - 34);
      pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
    }
  }

  const state = flying ? "flying" : res ? (res.won ? "cashed" : "busted") : "idle";

  return (
    <div className="rounded-xl border border-white/5 bg-base-800 shadow-card p-4">
      <div className="mb-2 flex items-baseline justify-between">
        <h3 className="text-sm font-bold text-slate-100">🚀 Crash</h3>
        <div className="-my-1 flex gap-1 overflow-x-auto">
          {hist.slice(0, 10).map((h, i) => (
            <span key={i} className={`rounded-full bg-base-900 px-2 py-0.5 font-mono text-[10px] font-bold ${crashColor(Number(h))}`}>
              {Number(h).toFixed(2)}x
            </span>
          ))}
        </div>
      </div>

      <div className={`relative overflow-hidden rounded-xl border bg-gradient-to-b from-base-900 to-base-950 ${
        state === "flying" ? "border-accent/40" : state === "cashed" ? "border-accent/50"
        : state === "busted" ? "border-red-500/50" : "border-white/10"}`}>
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
          {[0.25, 0.5, 0.75].map((f) => (
            <line key={f} x1="12" x2={W - 12} y1={H - 14 - f * (H - 34)} y2={H - 14 - f * (H - 34)}
              stroke="rgba(255,255,255,0.05)" />
          ))}
          {flying && pts.length > 1 && (
            <>
              <polyline points={`12,${H - 14} ${pts.join(" ")}`} fill="none"
                stroke="#4ade80" strokeWidth="3" strokeLinecap="round" />
              <polygon points={`12,${H - 14} ${pts.join(" ")} ${pts[pts.length - 1].split(",")[0]},${H - 14}`}
                fill="rgba(74,222,128,0.10)" />
              <circle cx={pts[pts.length - 1].split(",")[0]} cy={pts[pts.length - 1].split(",")[1]}
                r="5" fill="#4ade80" />
            </>
          )}
        </svg>
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          {state === "flying" && (
            <div className="text-center">
              <div className="font-mono text-5xl font-black text-accent drop-shadow">{mult.toFixed(2)}×</div>
            </div>
          )}
          {state === "cashed" && res && (
            <div className="text-center">
              <div className="font-mono text-4xl font-black text-accent">{res.multiplier}×</div>
              <div className="mt-1 text-sm font-bold text-accent">Cashed — paid {money(res.payout)}</div>
              <div className="text-[10px] text-slate-500">busted later at {res.point}×</div>
            </div>
          )}
          {state === "busted" && res && (
            <div className="text-center">
              <div className="font-mono text-4xl font-black text-red-400">💥 {Number(res.point).toFixed(2)}×</div>
              <div className="mt-1 text-sm font-bold text-red-400">Busted</div>
            </div>
          )}
          {state === "idle" && (
            <div className="font-mono text-4xl font-black text-slate-600">1.00×</div>
          )}
        </div>
      </div>

      <div className="mt-3 flex items-end gap-2">
        <label className="text-xs">
          <span className="mb-1 block text-[10px] uppercase tracking-wide text-slate-500">Stake</span>
          <input value={stake} onChange={(e) => setStake(e.target.value)} disabled={!!flying}
            className="w-20 rounded-lg bg-base-700 px-3 py-2 font-mono text-sm text-slate-100 outline-none disabled:opacity-50" />
        </label>
        <label className="text-xs">
          <span className="mb-1 block text-[10px] uppercase tracking-wide text-slate-500">Auto @</span>
          <input value={auto} onChange={(e) => setAuto(e.target.value)} disabled={!!flying}
            placeholder="off"
            className="w-16 rounded-lg bg-base-700 px-2 py-2 font-mono text-sm text-slate-100 outline-none disabled:opacity-50" />
        </label>
        {flying ? (
          <button onClick={cashout} disabled={busy}
            className="ml-auto animate-pulse rounded-lg bg-accent px-6 py-2 text-sm font-black uppercase tracking-wider text-base-900 hover:brightness-110 disabled:opacity-50">
            Cash out {mult.toFixed(2)}×
          </button>
        ) : (
          <button onClick={start} disabled={busy}
            className="ml-auto rounded-lg btn-gold px-8 py-2 text-sm font-black uppercase tracking-wider text-base-900 disabled:opacity-50">
            Launch
          </button>
        )}
      </div>
      {err && <p className="mt-2 text-xs text-red-300">{err}</p>}
    </div>
  );
}

// -------------------------------------------------------------- blackjack --
function PlayingCard({ c }: { c: string }) {
  if (c === "??") {
    return (
      <span className="grid h-16 w-11 place-items-center rounded-lg bg-gradient-to-br from-base-600 to-base-700 text-lg text-gold/60 shadow-card ring-1 ring-white/10"
        style={{ backgroundImage: "repeating-linear-gradient(45deg, rgba(240,180,41,.07) 0 4px, transparent 4px 8px)" }}>
        🂠
      </span>
    );
  }
  const suit = c[1];
  const red = suit === "h" || suit === "d";
  const SUIT: Record<string, string> = { s: "♠", h: "♥", d: "♦", c: "♣" };
  return (
    <span className={`grid h-16 w-11 place-items-center rounded-lg bg-gradient-to-b from-white to-slate-200 text-base font-bold shadow-card ring-1 ring-slate-300 ${
      red ? "text-red-600" : "text-slate-900"}`}>
      {c[0] === "T" ? "10" : c[0]}{SUIT[suit]}
    </span>
  );
}

function Blackjack({ onBalance, onPlayed }: {
  onBalance: (b: string) => void; onPlayed: () => void;
}) {
  const [hand, setHand] = useState<import("../api").BjHand | null>(null);
  const [stake, setStake] = useState("10");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.bjActive().then((r) => { if (r.active) setHand(r.active); }).catch(() => {});
  }, []);

  const done = hand?.status === "settled";
  async function run(fn: () => Promise<import("../api").BjHand>) {
    setErr(""); setBusy(true);
    try {
      const h = await fn();
      setHand(h);
      if (h.balance) onBalance(h.balance);
      onPlayed();
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }

  const OUTCOME: Record<string, [string, string]> = {
    blackjack: ["BLACKJACK — pays 3:2", "text-gold"],
    win: ["You win", "text-accent"],
    push: ["Push — stake back", "text-slate-300"],
    lose: ["House takes it", "text-red-400"],
  };

  return (
    <div className="rounded-xl border border-white/5 bg-base-800 shadow-card p-4">
      <h3 className="mb-1 text-sm font-bold text-slate-100">🃏 Blackjack</h3>
      <p className="mb-3 text-[10px] text-slate-500">
        Single deck each hand · dealer stands all 17s · blackjack pays 3:2 ·
        double any first two cards · no splits.
      </p>

      {hand && (
        <div className="mb-3 space-y-3 rounded-lg bg-base-900/70 p-4">
          <div>
            <div className="mb-1 text-[10px] uppercase tracking-wide text-slate-500">
              Dealer {hand.dealer_total !== null && `— ${hand.dealer_total}`}
            </div>
            <div className="flex gap-1.5">{hand.dealer.map((c, i) => <PlayingCard key={i} c={c} />)}</div>
          </div>
          <div>
            <div className="mb-1 text-[10px] uppercase tracking-wide text-slate-500">
              You — {hand.player_total}{hand.doubled ? " · doubled" : ""}
            </div>
            <div className="flex gap-1.5">{hand.player.map((c, i) => <PlayingCard key={i} c={c} />)}</div>
          </div>
          {done && hand.outcome && (
            <div className={`text-sm font-bold ${OUTCOME[hand.outcome]?.[1] ?? ""}`}>
              {OUTCOME[hand.outcome]?.[0]}
              {hand.payout && Number(hand.payout) > 0 && (
                <span className="ml-2 font-mono">+{money(hand.payout)}</span>
              )}
            </div>
          )}
        </div>
      )}

      {(!hand || done) ? (
        <div className="flex flex-wrap items-center gap-2">
          <input value={stake} inputMode="decimal"
            onChange={(e) => setStake(e.target.value.replace(/[^0-9.]/g, ""))}
            className="w-24 rounded-lg bg-base-700 px-3 py-2 font-mono text-sm text-slate-100 outline-none" />
          {["5", "10", "25", "100"].map((v) => (
            <button key={v} onClick={() => setStake(v)}
              className="rounded-lg bg-base-700 px-2.5 py-2 text-xs text-slate-300 hover:bg-base-600">{v}</button>
          ))}
          <button onClick={() => run(() => api.bjDeal(stake))} disabled={busy}
            className="ml-auto rounded-lg btn-gold px-5 py-2 text-sm font-bold text-base-900 hover:brightness-110 disabled:opacity-50">
            {busy ? "…" : "Deal"}
          </button>
        </div>
      ) : (
        <div className="flex gap-2">
          <button onClick={() => run(() => api.bjAction(hand.round_id, "hit"))} disabled={busy}
            className="flex-1 rounded-lg bg-base-700 py-2.5 text-sm font-bold text-slate-100 hover:bg-base-600 disabled:opacity-50">
            Hit
          </button>
          <button onClick={() => run(() => api.bjAction(hand.round_id, "stand"))} disabled={busy}
            className="flex-1 rounded-lg btn-gold py-2.5 text-sm font-bold text-base-900 hover:brightness-110 disabled:opacity-50">
            Stand
          </button>
          {hand.can_double && (
            <button onClick={() => run(() => api.bjAction(hand.round_id, "double"))} disabled={busy}
              className="flex-1 rounded-lg bg-sky-600 py-2.5 text-sm font-bold text-white hover:bg-sky-500 disabled:opacity-50">
              Double
            </button>
          )}
        </div>
      )}
      {err && <div className="mt-2 rounded bg-red-950 px-3 py-2 text-xs text-red-300">{err}</div>}
    </div>
  );
}

// ------------------------------------------------------------------- dice --
function DiceGame({ onBalance, onPlayed }: {
  onBalance: (b: string) => void; onPlayed: () => void;
}) {
  const [chance, setChance] = useState(50);
  const [stake, setStake] = useState("10");
  const [last, setLast] = useState<Awaited<ReturnType<typeof api.diceBet>> | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const mult = (96 / chance).toFixed(4);

  async function roll() {
    setErr(""); setBusy(true);
    try {
      const r = await api.diceBet(stake, String(chance));
      setLast(r); onBalance(r.balance); onPlayed();
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }

  return (
    <div className="rounded-xl border border-white/5 bg-base-800 shadow-card p-4">
      <h3 className="mb-1 text-sm font-bold text-slate-100">🎲 Dice</h3>
      <p className="mb-3 text-[10px] text-slate-500">
        Roll under your number and win — the longer the shot, the bigger the payout.
      </p>

      <div className="mb-1 flex justify-between text-[11px] text-slate-400">
        <span>Win chance: <span className="font-mono font-bold text-slate-100">{chance}%</span></span>
        <span>Pays <span className="font-mono font-bold text-gold">{mult}x</span></span>
      </div>
      <input type="range" min={2} max={95} value={chance}
        onChange={(e) => setChance(Number(e.target.value))}
        className="w-full accent-gold" />
      <div className="relative mt-2 h-3 overflow-hidden rounded-full bg-red-900/60">
        <div className="h-full bg-accent/70" style={{ width: `${chance}%` }} />
        {last && (
          <div className="absolute top-0 h-full w-0.5 bg-white"
            style={{ left: `${Math.min(99.5, Number(last.roll))}%` }} />
        )}
      </div>

      {last && (
        <div className={`mt-3 rounded-lg px-3 py-2 font-mono text-sm font-bold ${
          last.win ? "bg-accent/10 text-accent" : "bg-red-950 text-red-300"}`}>
          rolled {last.roll} — {last.win ? `WIN +${money(last.payout)}` : "lose"}
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input value={stake} inputMode="decimal"
          onChange={(e) => setStake(e.target.value.replace(/[^0-9.]/g, ""))}
          className="w-24 rounded-lg bg-base-700 px-3 py-2 font-mono text-sm text-slate-100 outline-none" />
        {["5", "10", "25", "100"].map((v) => (
          <button key={v} onClick={() => setStake(v)}
            className="rounded-lg bg-base-700 px-2.5 py-2 text-xs text-slate-300 hover:bg-base-600">{v}</button>
        ))}
        <button onClick={roll} disabled={busy}
          className="ml-auto rounded-lg btn-gold px-5 py-2 text-sm font-bold text-base-900 hover:brightness-110 disabled:opacity-50">
          {busy ? "…" : "Roll"}
        </button>
      </div>
      {err && <div className="mt-2 rounded bg-red-950 px-3 py-2 text-xs text-red-300">{err}</div>}
    </div>
  );
}

// ------------------------------------------------------------------ wheel --
function WheelGame({ onBalance, onPlayed }: {
  onBalance: (b: string) => void; onPlayed: () => void;
}) {
  const [risk, setRisk] = useState<"low" | "medium" | "high">("low");
  const [stake, setStake] = useState("10");
  const [last, setLast] = useState<Awaited<ReturnType<typeof api.wheelBet>> | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const SEGMENTS: Record<string, [string, string][]> = {
    low: [["", "0x"], ["", "1.2x"], ["", "1.5x"], ["", "3x"]],
    medium: [["", "0x"], ["", "2x"], ["", "3x"]],
    high: [["", "0x"], ["", "4x"], ["", "5x"], ["", "6x"]],
  };

  async function spin() {
    setErr(""); setBusy(true);
    try {
      const r = await api.wheelBet(stake, risk);
      setLast(r); onBalance(r.balance); onPlayed();
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }

  return (
    <div className="rounded-xl border border-white/5 bg-base-800 shadow-card p-4">
      <h3 className="mb-1 text-sm font-bold text-slate-100">🎡 Wheel</h3>
      <p className="mb-3 text-[10px] text-slate-500">
        Pick a risk level and spin — land a multiplier segment and get paid.
      </p>

      <div className="mb-3 flex gap-1.5">
        {(["low", "medium", "high"] as const).map((r) => (
          <button key={r} onClick={() => setRisk(r)}
            className={`flex-1 rounded-lg py-2 text-xs font-bold capitalize ${
              risk === r ? "btn-gold text-base-900" : "bg-base-700 text-slate-300 hover:bg-base-600"}`}>
            {r}
          </button>
        ))}
      </div>
      <div className="mb-3 flex gap-1">
        {SEGMENTS[risk].map(([, m], i) => (
          <div key={i} className={`flex-1 rounded-lg px-1 py-2 text-center ${
            last && last.risk === risk && last.segment === i
              ? "bg-gold/20 ring-1 ring-gold" : "bg-base-900"}`}>
            <div className="font-mono text-sm font-bold text-slate-100">{m}</div>
          </div>
        ))}
      </div>

      {last && (
        <div className={`rounded-lg px-3 py-2 font-mono text-sm font-bold ${
          Number(last.payout) > 0 ? "bg-accent/10 text-accent" : "bg-red-950 text-red-300"}`}>
          {Number(last.payout) > 0
            ? `${last.multiplier}x — WIN +${money(last.payout)}`
            : "0x — house takes it"}
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input value={stake} inputMode="decimal"
          onChange={(e) => setStake(e.target.value.replace(/[^0-9.]/g, ""))}
          className="w-24 rounded-lg bg-base-700 px-3 py-2 font-mono text-sm text-slate-100 outline-none" />
        {["5", "10", "25", "100"].map((v) => (
          <button key={v} onClick={() => setStake(v)}
            className="rounded-lg bg-base-700 px-2.5 py-2 text-xs text-slate-300 hover:bg-base-600">{v}</button>
        ))}
        <button onClick={spin} disabled={busy}
          className="ml-auto rounded-lg btn-gold px-5 py-2 text-sm font-bold text-base-900 hover:brightness-110 disabled:opacity-50">
          {busy ? "…" : "Spin"}
        </button>
      </div>
      {err && <div className="mt-2 rounded bg-red-950 px-3 py-2 text-xs text-red-300">{err}</div>}
    </div>
  );
}

// --------------------------------------------------------------- my wagers --
function MyWagers({ initial = "open" }: { initial?: "open" | "graded" | "all" }) {
  const [bets, setBets] = useState<SbBet[] | null>(null);
  const [filter, setFilter] = useState<"open" | "graded" | "all">(initial);

  useEffect(() => { api.sbMyBets().then(setBets).catch(() => setBets([])); }, []);

  if (!bets) return <Card><p className="py-8 text-center text-sm text-slate-500">loading…</p></Card>;

  const shown = bets.filter((b) =>
    filter === "all" ? true : filter === "open" ? b.status === "open" : b.status !== "open");
  const tone: Record<string, string> = {
    won: "text-accent", lost: "text-red-400", void: "text-slate-400",
    open: "text-amber-300", partial: "text-accent", buyout: "text-slate-400",
  };
  const TYPE: Record<string, string> = {
    single: "Straight", parlay: "Parlay", teaser: "Teaser",
    if_win: "If-Win", if_action: "If-Action", reverse: "Reverse",
  };

  const openRisk = bets.filter((b) => b.status === "open" && !b.free_play)
    .reduce((a, b) => a + Number(b.stake), 0);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1.5">
        {(["open", "graded", "all"] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)}
            className={`rounded-full px-3 py-1.5 text-xs capitalize ${
              filter === f ? "btn-gold font-semibold text-base-900"
                : "bg-base-800 text-slate-300 hover:bg-base-700"}`}>
            {f}
          </button>
        ))}
        {openRisk > 0 && (
          <span className="ml-auto font-mono text-xs text-slate-400">
            Riding: <span className="font-bold text-red-300">{money(openRisk)}</span>
          </span>
        )}
      </div>

      {shown.length === 0 ? (
        <Card><p className="py-8 text-center text-sm text-slate-500">
          {filter === "open" ? "Nothing riding right now." : "No wagers here yet."}
        </p></Card>
      ) : shown.map((b) => (
        <Card key={b.bet_id}>
          <div className="mb-2 flex items-center justify-between text-xs">
            <span className="text-slate-400">
              #{b.bet_id} · {TYPE[b.type] ?? b.type}
              {b.free_play && (
                <span className="ml-1.5 rounded bg-sky-500/20 px-1 text-[9px] font-bold text-sky-300">FP</span>
              )}
              {" · "}{money(b.stake)}
              {isFinite(Number(b.total_odds)) ? ` @ ${Number(b.total_odds).toFixed(2)}` : ""}
              <span className="ml-2 text-slate-600">
                {new Date(b.placed_at).toLocaleString(undefined,
                  { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
              </span>
            </span>
            <span className={`font-semibold uppercase ${tone[b.status] ?? "text-slate-400"}`}>
              {b.status}
              {b.payout !== null && Number(b.payout) > 0 && (
                <span className="ml-2 font-mono">+{money(b.payout)}</span>
              )}
            </span>
          </div>
          <div className="space-y-1">
            {b.legs.map((l, i) => (
              <div key={i}
                className="flex items-center justify-between gap-2 border-t border-base-700 pt-1 text-[11px] first:border-0 first:pt-0">
                <div className="min-w-0">
                  <div className="truncate text-slate-200">{l.selection}</div>
                  <div className="truncate text-slate-500">{l.event} · {l.market}</div>
                </div>
                <div className="flex shrink-0 items-center gap-3 font-mono">
                  {l.score && <span className="text-slate-400">{l.score}</span>}
                  <span className="text-slate-300">{Number(l.odds).toFixed(2)}</span>
                  <span className={`w-14 text-right font-medium ${tone[l.result ?? "open"] ?? "text-slate-500"}`}>
                    {l.result ?? "open"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}

// -------------------------------------------------------------- my figures --
function MyFigures() {
  const [sub, setSub] = useState<"figures" | "pending" | "transactions">("figures");
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 overflow-hidden rounded-xl border border-white/5 bg-base-800 shadow-card text-center text-xs font-semibold">
        {(["figures", "pending", "transactions"] as const).map((t) => (
          <button key={t} onClick={() => setSub(t)}
            className={`py-2.5 capitalize transition ${
              sub === t ? "btn-gold text-base-900" : "text-slate-300 hover:bg-base-700"}`}>
            {t}
          </button>
        ))}
      </div>
      {sub === "figures" && <FiguresSheet />}
      {sub === "pending" && <PendingTable />}
      {sub === "transactions" && <MyTransactions />}
    </div>
  );
}

function PendingTable() {
  const [bets, setBets] = useState<SbBet[] | null>(null);
  useEffect(() => { api.sbMyBets().then(setBets).catch(() => setBets([])); }, []);

  if (!bets) return <Card><p className="py-8 text-center text-sm text-slate-500">loading…</p></Card>;
  const open = bets.filter((b) => b.status === "open");
  const TYPE: Record<string, string> = {
    single: "Straight", parlay: "Parlay", teaser: "Teaser",
    if_win: "If-Win", if_action: "If-Action", reverse: "Reverse",
  };
  const toWin = (b: SbBet) =>
    b.free_play ? Number(b.potential) : Number(b.potential) - Number(b.stake);
  const totalRisk = open.reduce((a, b) => a + (b.free_play ? 0 : Number(b.stake)), 0);
  const totalWin = open.reduce((a, b) => a + toWin(b), 0);

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-xl border border-white/5 bg-base-800 shadow-card">
        <div className="grid grid-cols-[1fr_80px_80px] gap-2 border-b border-base-600 px-4 py-2 text-[10px] font-bold uppercase tracking-wide text-slate-500">
          <span>Description</span>
          <span className="text-right">Risk</span>
          <span className="text-right">To Win</span>
        </div>
        {open.length === 0 && (
          <p className="px-4 py-6 text-center text-sm text-slate-500">
            No data available in table
          </p>
        )}
        {open.map((b) => (
          <div key={b.bet_id}
            className="grid grid-cols-[1fr_80px_80px] gap-2 border-b border-base-700/60 px-4 py-2.5 last:border-0">
            <span className="min-w-0">
              <span className="block truncate text-xs text-slate-200">
                {b.legs.length === 1
                  ? `${b.legs[0].selection} · ${b.legs[0].market}`
                  : `${TYPE[b.type] ?? b.type} — ${b.legs.length} teams`}
                {b.free_play && (
                  <span className="ml-1.5 rounded bg-sky-500/20 px-1 text-[9px] font-bold text-sky-300">FP</span>
                )}
              </span>
              <span className="block truncate text-[10px] text-slate-500">
                {b.legs.length === 1 ? b.legs[0].event
                  : b.legs.map((l) => l.selection).join(" / ")}
              </span>
            </span>
            <span className="text-right font-mono text-sm font-semibold text-red-300">
              {money(b.stake)}
            </span>
            <span className="text-right font-mono text-sm font-semibold text-accent">
              {money(toWin(b))}
            </span>
          </div>
        ))}
      </div>
      <div className="flex items-baseline justify-end gap-5 rounded-xl border border-white/5 bg-base-800 shadow-card px-4 py-2.5 text-sm">
        <span className="text-slate-400">Total Risk:{" "}
          <span className="font-mono font-bold text-red-400">{money(totalRisk)}</span>
        </span>
        <span className="text-slate-400">Total Win:{" "}
          <span className="font-mono font-bold text-accent">{money(totalWin)}</span>
        </span>
      </div>
    </div>
  );
}

function FiguresSheet() {
  const [wb, setWb] = useState(0);
  const [d, setD] = useState<Awaited<ReturnType<typeof api.myFigures>> | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    setD(null);
    api.myFigures(wb).then(setD).catch((e) => setErr(e.message));
  }, [wb]);

  if (err) return <Card><p className="py-8 text-center text-sm text-red-300">{err}</p></Card>;
  if (!d) return <Card><p className="py-8 text-center text-sm text-slate-500">loading…</p></Card>;

  const cls = (v: string) => {
    const n = Number(v);
    return n > 0 ? "text-accent" : n < 0 ? "text-red-400" : "text-slate-400";
  };
  const Row = ({ k, v, strong = false, tone = "" }: {
    k: string; v: string; strong?: boolean; tone?: string;
  }) => (
    <div className={`flex items-baseline justify-between border-b border-base-700/60 px-4 py-2.5 last:border-0 ${
      strong ? "bg-base-900/50" : ""}`}>
      <span className={`text-xs ${strong ? "font-bold text-slate-100" : "text-slate-300"}`}>{k}</span>
      <span className={`font-mono text-sm ${strong ? "font-bold" : "font-semibold"} ${tone || cls(v)}`}>
        {money(v)}
      </span>
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <select value={wb} onChange={(e) => setWb(Number(e.target.value))}
          className="flex-1 rounded-xl border border-white/5 bg-base-800 shadow-card px-4 py-2.5 text-sm font-semibold text-slate-100 outline-none">
          <option value={0}>This Week</option>
          <option value={1}>Last Week</option>
          <option value={2}>2 Weeks Ago</option>
          <option value={3}>3 Weeks Ago</option>
          <option value={4}>4 Weeks Ago</option>
        </select>
        {d.settled_this_week && (
          <span className="rounded-xl bg-accent/15 px-3 py-2.5 text-[10px] font-bold uppercase text-accent">
            settled
          </span>
        )}
      </div>

      <div className="overflow-hidden rounded-xl border border-white/5 bg-base-800 shadow-card">
        <Row k="Carry" v={d.carry} />
        {d.day_labels.map((l, i) => {
          const [dow, date] = l.split(" ");
          return <Row key={l} k={`${dow} (${date})`} v={d.days[i]} />;
        })}
        <Row k="Week" v={d.week} strong />
        <Row k="Transactions" v={d.adjustments} />
        <Row k="End Balance" v={d.end_balance} strong />
      </div>

      {Number(d.pending) > 0 && (
        <div className="rounded-xl bg-amber-500/10 px-4 py-2.5 text-xs text-amber-300">
          {money(d.pending)} riding on {d.wagers === 0 ? "open" : ""} pending wagers —
          not counted in the figure until graded.
        </div>
      )}

      <div className="grid grid-cols-3 gap-2 text-center">
        {([["Credit limit", d.credit_limit, "text-slate-200"],
           ["Available", d.available, "text-accent"],
           ["Free play", d.free_play, "text-sky-300"]] as const).map(([k, v, tone]) => (
          <div key={k} className="rounded-xl border border-white/5 bg-base-800 shadow-card p-3">
            <div className="text-[9px] uppercase tracking-wide text-slate-500">{k}</div>
            <div className={`font-mono text-sm font-bold ${tone}`}>{money(v)}</div>
          </div>
        ))}
      </div>
      <p className="px-1 text-[11px] leading-relaxed text-slate-500">{d.note}</p>
    </div>
  );
}

// ------------------------------------------------------------------- rules --
function Rules() {
  const S = ({ t, children }: { t: string; children: React.ReactNode }) => (
    <section className="space-y-1.5">
      <h4 className="text-xs font-bold uppercase tracking-wide text-gold">{t}</h4>
      <div className="space-y-1.5 text-[13px] leading-relaxed text-slate-300">{children}</div>
    </section>
  );
  return (
    <Card>
      <h3 className="mb-4 text-sm font-bold text-slate-100">House Rules</h3>
      <div className="max-w-3xl space-y-5">
        <S t="The week">
          <p>The betting week runs Tuesday through Monday night. Figures close at the end
          of Monday and you square up with your agent on Tuesday. A positive figure means
          you're up; a negative one means you owe. Your balance and figures update in real
          time on the My Figures page — the number you see is the same number your agent sees.</p>
        </S>
        <S t="Wagers">
          <p>All wagers are action once accepted. A pushed line refunds the stake on that
          leg. In a parlay, a push drops the leg and the ticket pays on the rest. A game
          that is postponed or abandoned voids its wagers and refunds stakes. Your agent
          can void a pending ticket (full refund) or buy it out at an agreed price.</p>
          <p>Prices move. The price printed on your ticket at acceptance is the price you
          are paid at, regardless of where the market closes.</p>
        </S>
        <S t="Teasers, if-bets, reverses">
          <p>Teasers cover football and basketball spreads and totals, 2 to 6 teams. Every
          leg must cover its moved number; a push drops the ticket to the next size down,
          and a two-teamer with a push is no action. If-bets fire in the order placed —
          the stake only advances on a win (If-Win) or on anything but a loss (If-Action).
          A reverse is every ordered pair of your picks as two-team if-action chains.</p>
        </S>
        <S t="Live betting">
          <p>Once a game kicks off, the moneyline stays open and reprices with the game;
          spreads and totals come off the board. Pregame tickets always stand and grade on
          the final score.</p>
        </S>
        <S t="Free play">
          <p>Free play rides straights and parlays only. The free play itself is used up
          win or lose; only the winnings pay, in real credits. A push returns the free play.</p>
        </S>
        <S t="Horses">
          <p>The racebook pays off the morning line, by published fractions: Win pays
          the line, Place a quarter of it, Show an eighth. Exactas pay A×B÷2 and
          trifectas A×B×C÷4, exact order required. Every ticket is capped by the max
          payout per race shown on the card. Wagering closes at post time — once the
          race is off, it's off.</p>
        </S>
        <S t="Casino">
          <p>Table games play by the book: single-deck blackjack with dealer standing on
          all 17s, European roulette, punto banco baccarat, full-pay Jacks or Better.
          Slot paytables are printed on every machine. All results are final when the
          round settles.</p>
        </S>
        <S t="The fine print">
          <p>Credits are virtual with no cash value; they cannot be purchased, transferred,
          or redeemed. Limits, credit, and account standing are set by your agent — talk to
          them, not the house. Obvious errors (bad lines, wrong prices) may be voided even
          after acceptance. Management's grading decisions are final.</p>
        </S>
      </div>
    </Card>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl border border-white/5 bg-base-800 shadow-card p-4">{children}</div>;
}

// ------------------------------------------------------------------- horses --
function Horses({ onBalance }: { onBalance: (b: string) => void }) {
  const [card, setCard] = useState<Awaited<ReturnType<typeof api.rbCard>> | null>(null);
  const [trackKey, setTrackKey] = useState("");
  const [raceId, setRaceId] = useState(0);
  const [kind, setKind] = useState<"straight" | "exacta" | "trifecta">("straight");
  const [pool, setPool] = useState<"win" | "place" | "show">("win");
  const [picks, setPicks] = useState<number[]>([]);
  const [stake, setStake] = useState("10");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [mine, setMine] = useState<Awaited<ReturnType<typeof api.rbMyBets>> | null>(null);
  const [now, setNow] = useState(Date.now());

  const load = () => {
    api.rbCard().then((c) => {
      setCard(c);
      setTrackKey((cur) => cur || c.tracks[0]?.key || "");
    }).catch((e) => setErr(e.message));
    api.rbMyBets().then(setMine).catch(() => {});
  };
  useEffect(load, []);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);

  const track = card?.tracks.find((t) => t.key === trackKey);
  const openRaces = track?.races.filter((r) => r.status === "scheduled") ?? [];
  const race = track?.races.find((r) => r.id === raceId) ?? openRaces[0];
  useEffect(() => {
    if (race && raceId !== race.id) setRaceId(race.id);
    setPicks([]);
  }, [trackKey, race?.id]);

  const needed = kind === "straight" ? 1 : kind === "exacta" ? 2 : 3;
  const tap = (pn: number) => {
    setPicks((p) => p.includes(pn) ? p.filter((x) => x !== pn)
      : p.length >= needed ? [...p.slice(0, needed - 1), pn] : [...p, pn]);
  };

  async function place() {
    if (!race || picks.length !== needed) return;
    setBusy(true); setErr(""); setMsg("");
    try {
      const k = kind === "straight" ? pool : kind;
      const r = await api.rbPlace(race.id, k, picks, stake);
      setMsg(`Ticket #${r.bet_id} in — ${k} on #${r.picks} · to return ${money(r.potential)}`);
      onBalance(r.balance);
      setPicks([]);
      api.rbMyBets().then(setMine).catch(() => {});
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }

  if (!card) return <Card><p className="py-8 text-center text-sm text-slate-500">
    {err || "loading…"}</p></Card>;

  const postIn = race ? new Date(race.post_time).getTime() - now : 0;
  const mins = Math.max(0, Math.floor(postIn / 60000));
  const secs = Math.max(0, Math.floor((postIn % 60000) / 1000));
  const SADDLE = ["bg-red-600 text-white", "bg-slate-100 text-black", "bg-blue-600 text-white",
    "bg-yellow-400 text-black", "bg-green-700 text-white", "bg-black text-yellow-300",
    "bg-orange-500 text-black", "bg-pink-400 text-black", "bg-teal-500 text-black"];

  return (
    <div className="mx-auto max-w-2xl space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {card.tracks.map((t) => (
          <button key={t.key} onClick={() => { setTrackKey(t.key); setRaceId(0); }}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
              t.key === trackKey ? "btn-gold text-base-900"
                : "bg-base-800 text-slate-300 hover:bg-base-700"}`}>
            🐎 {t.name}
          </button>
        ))}
      </div>

      {race ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <select value={race.id} onChange={(e) => { setRaceId(Number(e.target.value)); setPicks([]); }}
              className="rounded-xl border border-white/5 bg-base-800 shadow-card px-4 py-2.5 text-sm font-bold text-slate-100 outline-none">
              {openRaces.map((r) => (
                <option key={r.id} value={r.id}>Race {r.number}</option>
              ))}
            </select>
            <span className="text-xs text-slate-400">
              Post: {new Date(race.post_time).toLocaleTimeString(undefined,
                { hour: "numeric", minute: "2-digit" })}
            </span>
            {postIn > 0 && postIn < 15 * 60000 && (
              <span className="rounded-lg bg-red-500/20 px-2.5 py-1 font-mono text-xs font-bold text-red-300">
                {mins}m {String(secs).padStart(2, "0")}s
              </span>
            )}
          </div>

          <div className="flex flex-wrap gap-1.5">
            {(["straight", "exacta", "trifecta"] as const).map((k) => (
              <button key={k} onClick={() => { setKind(k); setPicks([]); }}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold capitalize ${
                  kind === k ? "bg-sky-600 text-white" : "bg-base-800 text-slate-300 hover:bg-base-700"}`}>
                {k}
              </button>
            ))}
            {kind === "straight" && (["win", "place", "show"] as const).map((pl) => (
              <button key={pl} onClick={() => setPool(pl)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold capitalize ${
                  pool === pl ? "btn-gold text-base-900" : "bg-base-800 text-slate-400 hover:bg-base-700"}`}>
                {pl}
              </button>
            ))}
          </div>

          <p className="px-1 text-[10px] leading-relaxed text-slate-500">
            {kind === "straight"
              ? "Win: first. Place: first or second. Show: in the top three. Tap a runner to pick."
              : kind === "exacta"
                ? "Pick the first two finishers IN ORDER — tap them in finishing order."
                : "Pick the first three finishers IN ORDER."}
          </p>

          <div className="overflow-hidden rounded-xl border border-white/5 bg-base-800 shadow-card">
            <div className="grid grid-cols-[44px_1fr_70px_50px] items-center gap-2 border-b border-base-600 px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-slate-500">
              <span>PN</span><span>Runner / Jockey</span>
              <span className="text-right">ML</span><span className="text-right">WT</span>
            </div>
            {race.runners.map((r) => {
              const idx = picks.indexOf(r.pn);
              return (
                <button key={r.pn} onClick={() => tap(r.pn)}
                  className={`grid w-full grid-cols-[44px_1fr_70px_50px] items-center gap-2 border-b border-base-700/60 px-3 py-2 text-left last:border-0 ${
                    idx >= 0 ? "bg-gold/15" : "hover:bg-base-700/40"}`}>
                  <span className="flex items-center gap-1">
                    <span className={`grid h-6 w-6 place-items-center rounded font-mono text-xs font-bold ${
                      SADDLE[(r.pn - 1) % SADDLE.length]}`}>{r.pn}</span>
                    {idx >= 0 && kind !== "straight" && (
                      <span className="font-mono text-[10px] font-bold text-gold">{idx + 1}º</span>
                    )}
                    {idx >= 0 && kind === "straight" && (
                      <span className="text-gold">✓</span>
                    )}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-slate-100">{r.name}</span>
                    <span className="block truncate text-[10px] text-slate-500">{r.jockey}</span>
                  </span>
                  <span className="text-right font-mono text-sm font-bold text-slate-200">{r.ml}</span>
                  <span className="text-right font-mono text-[10px] text-slate-500">{r.weight}</span>
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <input value={stake} inputMode="decimal"
              onChange={(e) => setStake(e.target.value.replace(/[^0-9.]/g, ""))}
              className="w-24 rounded-xl border border-white/5 bg-base-800 shadow-card px-3 py-2.5 font-mono text-sm text-slate-100 outline-none" />
            {["5", "10", "25", "50"].map((v) => (
              <button key={v} onClick={() => setStake(v)}
                className="rounded-lg border border-white/5 bg-base-800 shadow-card px-2.5 py-2 text-xs text-slate-300 hover:bg-base-700">{v}</button>
            ))}
            <button onClick={place} disabled={busy || picks.length !== needed}
              className="ml-auto rounded-xl bg-accent px-5 py-2.5 text-sm font-bold text-base-900 hover:brightness-110 disabled:opacity-40">
              {busy ? "…" : `Add to bet slip (${picks.length}/${needed})`}
            </button>
          </div>
          {msg && <div className="rounded-xl bg-accent/10 px-4 py-2.5 text-xs text-accent">{msg}</div>}
          {err && <div className="rounded-xl bg-red-950 px-4 py-2.5 text-xs text-red-300">{err}</div>}
        </>
      ) : (
        <Card><p className="py-8 text-center text-sm text-slate-500">
          No more races today at this track — check another track or come back tomorrow.
        </p></Card>
      )}

      {/* -------- limits card, like the bottom of the reference page -------- */}
      <div className="rounded-xl border border-white/5 bg-base-800 shadow-card p-4 text-xs">
        <h4 className="mb-2 font-bold text-slate-200">Straight Limits</h4>
        <div className="grid max-w-xs grid-cols-3 gap-1 text-slate-400">
          <span /><span className="font-semibold text-slate-300">Min</span>
          <span className="font-semibold text-slate-300">Max</span>
          {(["Win", "Place", "Show"] as const).map((k) => (
            <FragmentRow key={k} k={k} min={card.limits.min} max={card.limits.max} />
          ))}
        </div>
        <p className="mt-2 text-slate-400">
          Max limit payout by race:{" "}
          <span className="font-mono font-bold text-slate-200">
            {money(card.limits.max_payout_per_race)}
          </span>
        </p>
        <p className="mt-2 text-[10px] leading-relaxed text-slate-500">{card.note}</p>
      </div>

      {mine && mine.length > 0 && (
        <div className="space-y-1.5">
          <h4 className="px-1 text-xs font-bold text-slate-200">My race tickets</h4>
          {mine.slice(0, 12).map((b) => (
            <div key={b.bet_id} className="flex items-baseline justify-between gap-2 rounded-xl border border-white/5 bg-base-800 shadow-card px-4 py-2.5 text-xs">
              <span className="min-w-0">
                <span className="block truncate text-slate-200">
                  {b.track} R{b.race} · {b.kind} · {b.picks.map((x) => `#${x.pn} ${x.name}`).join(", ")}
                </span>
                <span className="block text-[10px] text-slate-500">
                  {money(b.stake)} to return {money(b.potential)}
                  {b.result && ` · finish ${b.result.split("-").slice(0, 3).join("-")}`}
                </span>
              </span>
              <span className={`font-bold uppercase ${
                b.status === "won" ? "text-accent" : b.status === "lost" ? "text-red-400" : "text-amber-300"}`}>
                {b.status}
                {b.payout && Number(b.payout) > 0 && <span className="ml-1 font-mono">+{money(b.payout)}</span>}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function FragmentRow({ k, min, max }: { k: string; min: string; max: string }) {
  return (
    <>
      <span className="font-semibold text-slate-300">{k}</span>
      <span className="font-mono">{Number(min).toFixed(2)}</span>
      <span className="font-mono">{Number(max).toFixed(2)}</span>
    </>
  );
}

