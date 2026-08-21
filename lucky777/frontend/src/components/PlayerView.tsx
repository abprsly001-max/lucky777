import React, { useEffect, useMemo, useRef, useState } from "react";
import { api, clearToken, type SbBet } from "../api";
import { APP_VERSION, setOddsFmt, useOddsFmt, type OddsFmt } from "../prefs";
import { sfx } from "../sfx";
import Duel from "./Duel";
import GameArt, { BonusCharacter, GameLogo, SlotScene, SYMBOL_GLYPH, SymbolFace } from "./GameArt";
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

  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: "board", label: "Sportsbook", icon: "🏈" },
    { id: "casino", label: "Casino", icon: "🎰" },
    { id: "wagers", label: "My Wagers", icon: "🧾" },
    { id: "figures", label: "My Figures", icon: "📊" },
    { id: "rules", label: "Rules", icon: "ℹ️" },
  ];

  const MENU: { id: Tab; icon: string; label: string }[] = [
    { id: "figures", icon: "📈", label: "Weekly Figures" },
    { id: "wagers", icon: "📝", label: "Pending Wagers" },
    { id: "transactions", icon: "🔁", label: "Transactions" },
    { id: "rules", icon: "ℹ️", label: "Rules" },
    { id: "scores", icon: "🗓️", label: "Scores" },
    { id: "horses", icon: "🐎", label: "Racing" },
    { id: "casino", icon: "🎲", label: "Casino" },
    { id: "settings", icon: "⚙️", label: "Settings" },
  ];

  return (
    <div className="space-y-4 pb-16 sm:pb-0">
      <nav className="glass-bar hidden items-center gap-1 rounded-2xl p-1.5 sm:flex">
        <button onClick={() => setMenu(true)}
          className="grid h-9 w-10 place-items-center rounded-xl text-base leading-none text-gold transition hover:bg-white/5"
          aria-label="menu">
          ☰
        </button>
        <span className="mx-0.5 h-6 w-px bg-white/10" />
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold transition ${
              tab === t.id
                ? "btn-gold text-base-900 shadow-gold"
                : "text-slate-300 hover:bg-white/5 hover:text-slate-100"}`}>
            <span className="text-sm leading-none">{t.icon}</span>{t.label}
          </button>
        ))}
        {Number(fp) > 0 && (
          <span className="ml-auto rounded-xl border border-sky-400/25 bg-sky-500/15 px-3 py-1.5 font-mono text-xs font-semibold text-sky-300">
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
      <div className="fixed inset-x-0 bottom-0 z-50 grid h-[3.75rem] grid-cols-5 border-t border-white/10 bg-base-900/95 backdrop-blur
        before:absolute before:inset-x-0 before:top-[-1px] before:h-px
        before:bg-gradient-to-r before:from-transparent before:via-gold/40 before:to-transparent sm:hidden">
        {([["board", "🏈", "Sports"], ["casino", "🎰", "Casino"],
           ["wagers", "🧾", "My Bets"], ["figures", "📊", "Figures"]] as const)
          .map(([id, icon, label]) => (
          <button key={id} onClick={() => setTab(id)}
            className={`relative flex flex-col items-center justify-center gap-0.5 text-[9px] font-bold transition ${
              tab === id ? "text-gold" : "text-slate-400"}`}>
            {tab === id && (
              <span className="absolute top-0 h-0.5 w-8 rounded-full bg-gold shadow-gold" />
            )}
            <span className={`text-lg leading-none ${tab === id ? "drop-shadow-[0_0_6px_rgba(240,180,41,0.7)]" : ""}`}>{icon}</span>{label}
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
      {tab === "wagers" && <MyWagers onBalance={balanced} />}
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
  const [mutedFlag, setMutedFlag] = useState(sfx.isMuted());
  const [game, setGame] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<{ game: string; who: string;
    mult: string; won: string }[]>([]);
  const [tops, setTops] = useState<Record<string, string>>({});
  useEffect(() => {
    const pull = () => api.casinoHits().then((r) => {
      setHits(r.hits);
      setTops(r.tops ?? {});
    }).catch(() => {});
    pull();
    const t = window.setInterval(pull, 30000);
    return () => window.clearInterval(t);
  }, []);

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
            {game === "lucky7" && <Lucky7 onBalance={onBalance} onPlayed={load} />}
            {game === "rps" && <RPS onBalance={onBalance} onPlayed={load} />}
            {game === "darts" && (() => {
              const def = lobby?.games.find((g) => g.key === "darts");
              return def?.darts ? <Darts def={def.darts} onBalance={onBalance} onPlayed={load} /> : null;
            })()}
            {game === "prism" && (() => {
              const def = lobby?.games.find((g) => g.key === "prism");
              return def?.prism ? <Prism def={def.prism} onBalance={onBalance} onPlayed={load} /> : null;
            })()}
            {game === "penalty" && (() => {
              const def = lobby?.games.find((g) => g.key === "penalty");
              return def?.ladder ? <LadderGame def={def.ladder} onBalance={onBalance} onPlayed={load}
                skin={{ title: "⚽ Penalty Shootout", step: "Shoot", icon: "⚽",
                        bust: "🧤 SAVED — the run is over",
                        frame: "border-green-500/25",
                        bg: "from-[#0a2e10] via-[#051708] to-black" }} /> : null;
            })()}
            {game === "penguin" && (() => {
              const def = lobby?.games.find((g) => g.key === "penguin");
              return def?.ladder ? <LadderGame def={def.ladder} onBalance={onBalance} onPlayed={load}
                skin={{ title: "🐧 Penguin Dash", step: "Hop", icon: "🐧",
                        bust: "🐻‍❄️ SPLASH — the bear got you",
                        frame: "border-cyan-400/25",
                        bg: "from-[#042837] via-[#02141d] to-black" }} /> : null;
            })()}
            {game === "acey" && <AceyDucey onBalance={onBalance} onPlayed={load} />}
            {game === "war" && <WarGame onBalance={onBalance} onPlayed={load} />}
            {game === "flip" && <CardFlip onBalance={onBalance} onPlayed={load} />}
            {game === "bus" && <RideTheBus onBalance={onBalance} onPlayed={load} />}
            {game === "suitlink" && <SuitLink onBalance={onBalance} onPlayed={load} />}
            {game === "hcf" && <HighCardFlush onBalance={onBalance} onPlayed={load} />}
            {game === "heist" && (() => {
              const def = lobby?.games.find((g) => g.key === "heist");
              return (def as any)?.heist
                ? <GrandHeist def={(def as any).heist} onBalance={onBalance} onPlayed={load} />
                : null;
            })()}
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

  const games = (lobby?.games ?? [])
    .filter((g) => cat === "all" || g.category === cat)
    .filter((g) => !query
      || g.name.toLowerCase().includes(query.toLowerCase()));
  // rounds store the engine id, not the lobby key — map the family names
  const HIT_NAMES: Record<string, string> = {
    vslot: "Video Slots", slot: "Slots", dragon: "Golden Dragon",
    holdspin: "Piggy Blast", tumble: "Sugar Blast", heist: "Grand Heist",
    blackjack: "Blackjack", dice: "Dice", wheel: "Wheel", mines: "Mines",
    crash: "Crash", roulette: "Roulette", videopoker: "Video Poker",
    baccarat: "Baccarat", plinko: "Plinko", keno: "Keno", limbo: "Limbo",
    towers: "Towers", dt: "Dragon Tiger", hilo: "Hi-Lo",
  };
  const nameOf = (key: string) =>
    lobby?.games.find((g) => g.key === key)?.name ?? HIT_NAMES[key]
    ?? key.charAt(0).toUpperCase() + key.slice(1);
  return (
    <div className="mx-auto max-w-3xl space-y-3">
      {/* the marquee */}
      <div className="relative overflow-hidden rounded-xl border border-gold/25 bg-gradient-to-b from-[#1a1204] via-base-900 to-base-950 px-4 py-3 shadow-card">
        <div className="pointer-events-none absolute inset-0 opacity-40"
          style={{ background: "radial-gradient(420px 90px at 50% -20px, rgba(240,180,41,0.25), transparent 70%)" }} />
        <div className="relative flex items-center justify-between">
          <div>
            <div className="font-black uppercase tracking-[0.28em] text-[10px] text-gold/70">Welcome to the</div>
            <div className="bg-gradient-to-b from-[#fff3c4] via-gold to-[#c98a10] bg-clip-text text-2xl font-black uppercase tracking-tight text-transparent drop-shadow-[0_2px_6px_rgba(240,180,41,0.35)]">
              Lucky777 Casino
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <div className="font-mono text-[10px] text-slate-500">{(lobby?.games ?? []).length} games on the floor</div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-gold/80">Instant settle · House book</div>
            </div>
            <button onClick={() => setMutedFlag(sfx.toggle())}
              className="grid h-9 w-9 place-items-center rounded-xl border border-white/10 bg-base-900/60 text-base hover:border-gold/40"
              title={mutedFlag ? "Sound off" : "Sound on"}>
              {mutedFlag ? "\u{1F507}" : "\u{1F50A}"}
            </button>
          </div>
        </div>
      </div>
      <div className="glass-bar grid grid-cols-4 overflow-hidden rounded-2xl p-1 text-center text-xs font-bold">
        {([["all", "🏛️", "Lobby"], ["slots", "🎰", "Slots"],
           ["table", "🃏", "Tables"], ["quick", "⚡", "Quick"]] as const)
          .map(([id, icon, label]) => (
          <button key={id} onClick={() => setCat(id)}
            className={`flex min-w-0 items-center justify-center gap-1 rounded-xl px-1 py-2.5 transition sm:gap-1.5 ${
              cat === id ? "btn-gold text-base-900 shadow-gold" : "text-slate-300 hover:bg-white/5"}`}>
            <span className="hidden sm:inline">{icon}</span>
            <span className="truncate text-[11px] sm:text-xs">{label}</span>
            <span className={`hidden shrink-0 rounded-full px-1.5 text-[9px] font-black sm:inline ${
              cat === id ? "bg-black/20" : "bg-white/10 text-slate-400"}`}>
              {(lobby?.games ?? []).filter((g) => id === "all" || g.category === id).length}
            </span>
          </button>
        ))}
      </div>

      {/* the floor's big-win ticker: real rounds, real payouts */}
      {hits.length > 0 && (
        <div className="relative overflow-hidden rounded-xl border border-white/5 bg-base-900/70 py-1.5">
          <div className="hits-scroll flex w-max items-center gap-6 px-3">
            {[...hits, ...hits].map((h, i) => (
              <span key={i} className="flex shrink-0 items-center gap-1.5 text-[11px]">
                <span className="text-gold">◆</span>
                <span className="font-bold text-slate-300">{h.who}</span>
                <span className="text-slate-500">hit</span>
                <span className="font-mono font-black text-accent">{h.mult}×</span>
                <span className="text-slate-500">on {nameOf(h.game)}</span>
                <span className="font-mono font-bold text-slate-200">+{money(h.won)}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* find a machine fast */}
      <input value={query} onChange={(e) => setQuery(e.target.value)}
        placeholder="Search the floor — Mines, Golden Dragon, Blackjack…"
        className="w-full rounded-xl border border-white/5 bg-base-800 px-4 py-2.5 text-sm text-slate-100 shadow-card outline-none placeholder:text-slate-600" />
      {(cat === "all"
        ? [["🔥 Featured", games.filter((g) => LOBBY_HOT.has(g.key))],
           ["🎰 Slots", games.filter((g) => g.category === "slots" && !LOBBY_HOT.has(g.key))],
           ["🃏 Table Games", games.filter((g) => g.category === "table" && !LOBBY_HOT.has(g.key))],
           ["⚡ Quick Games", games.filter((g) => g.category === "quick" && !LOBBY_HOT.has(g.key))]] as const
        : [["", games]] as const
      ).map(([title, list]) => list.length === 0 ? null : (
        <div key={title || "flat"}>
          {title && (
            <div className="mb-2 mt-1 flex items-center gap-2 px-0.5">
              <span className="text-[11px] font-black uppercase tracking-[0.18em] text-gold/90">{title}</span>
              <span className="h-px flex-1 bg-gradient-to-r from-gold/30 to-transparent" />
            </div>
          )}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {list.map((g) => (
              <button key={g.key} onClick={() => setGame(g.key)}
                className="tile-shine group overflow-hidden rounded-xl border border-white/5 bg-base-800 shadow-card text-left transition hover:-translate-y-1 hover:border-gold/50 hover:shadow-[0_10px_30px_-8px_rgba(240,180,41,0.35)]">
                <div className="relative h-24 overflow-hidden sm:h-28">
                  <div className="h-full w-full transition duration-300 group-hover:scale-[1.06]">
                    <GameArt k={g.key} />
                  </div>
                  {LOBBY_HOT.has(g.key) && (
                    <span className="absolute right-1.5 top-1.5 rounded-md bg-gradient-to-b from-red-500 to-red-700 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-widest text-white shadow-pop">
                      🔥 Hot
                    </span>
                  )}
                  {LOBBY_NEW.has(g.key) && !LOBBY_HOT.has(g.key) && (
                    <span className="absolute right-1.5 top-1.5 rounded-md bg-gradient-to-b from-emerald-400 to-emerald-600 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-widest text-base-900 shadow-pop">
                      New
                    </span>
                  )}
                  {tops[g.key.split(":")[0]] && (
                    <span className="absolute bottom-1.5 left-1.5 rounded-md bg-black/60 px-1.5 py-0.5 font-mono text-[8px] font-black text-accent ring-1 ring-accent/40 backdrop-blur-sm">
                      ▲ {Number(tops[g.key.split(":")[0]]).toFixed(0)}× today
                    </span>
                  )}
                </div>
                <div className="flex min-h-[38px] items-center justify-between gap-1 px-2 py-1.5 sm:px-2.5">
                  <span className="line-clamp-2 min-w-0 text-[11px] font-bold leading-tight text-slate-100 sm:text-[13px]">
                    {g.name}
                  </span>
                  <span className="shrink-0 text-slate-600 transition group-hover:translate-x-0.5 group-hover:text-gold">›</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      ))}
      <p className="px-1 text-[10px] leading-relaxed text-slate-500">
        Table games, slots and quick games, all against the house book. Every game
        settles instantly to your balance and shows in your weekly figures.
      </p>
    </div>
  );
}

// the lobby's shelf talkers
const LOBBY_HOT = new Set(["tumble", "dragon", "holdspin", "crash", "mines"]);
const LOBBY_NEW = new Set(["keno", "limbo", "towers", "dragontiger", "hilo",
  "lucky7", "rps", "darts", "prism", "penalty", "penguin", "acey", "war",
  "flip", "bus", "suitlink", "hcf"]);


// ----------------------------------------------------------------- slots ----
function SlotSymbol({ sym, size = "text-4xl" }: { sym: string; size?: string }) {
  const spec = SYMBOL_GLYPH[sym] ?? { g: sym };
  // drawn vector faces first: royals, sevens, bells, fruit like a real machine
  const face = SymbolFace({ sym });
  if (face) return <span className="grid h-12 w-12 place-items-center sm:h-14 sm:w-14">{face}</span>;
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
    sfx.spin();
    const stopReel = (i: number, sym: string) => {
      sfx.land();
      setReels((r) => { const n = [...r]; n[i] = sym; return n; });
      setLive((l) => { const n = [...l] as typeof live; n[i] = false; return n; });
      setPopped((pp) => { const n = [...pp] as typeof popped; n[i] = true; return n; });
    };
    try {
      const r = await api.slotSpin(slot.machine, stake);
      [0, 1, 2].forEach((i) => window.setTimeout(() => {
        stopReel(i, r.reels[i]);
        if (i === 2) {
          sfx.reelsStop();
          setLast({ multiplier: r.multiplier, payout: r.payout, win: r.win });
          if (r.win) sfx.win(); else sfx.lose();
          onBalance(r.balance);
          onPlayed();
          setSpinning(false);
        }
      }, 600 + i * 420));
    } catch (e: any) {
      setLive([false, false, false]);
      setErr(e.message);
      setSpinning(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-white/5 bg-base-800 shadow-card p-4">
        <div className="mb-3 flex items-baseline justify-between">
          <GameLogo k={def.key} />

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
          <div className="mx-auto grid max-w-xs grid-cols-3 gap-2 rounded-lg bg-black/30 p-1.5 shadow-[inset_0_2px_12px_rgba(0,0,0,0.7)]">
            {reels.map((sym, i) => (
              <div key={i}
                className={`relative grid h-24 place-items-center overflow-hidden rounded-lg border bg-base-900 ${
                  last && last.win && !spinning
                    ? "border-accent/60 shadow-[0_0_18px_-4px_rgba(74,222,128,0.5)]"
                    : live[i] ? "border-gold/40" : "border-white/10"}`}>
                {live[i] ? (
                  <div className="vs-strip absolute inset-x-0 blur-[2px]">
                    {Array.from({ length: 8 }, (_, j) =>
                      slot.symbols[(i * 3 + j * 2 + 1) % slot.symbols.length])
                      .concat(Array.from({ length: 8 }, (_, j) =>
                        slot.symbols[(i * 3 + j * 2 + 1) % slot.symbols.length]))
                      .map((s, j) => (
                        <div key={j} className="grid h-24 place-items-center">
                          <SlotSymbol sym={s} />
                        </div>
                      ))}
                  </div>
                ) : popped[i] ? (
                  <div className="vs-land1 absolute inset-x-0"
                    onAnimationEnd={() => setPopped((pp) => {
                      const n = [...pp] as typeof popped; n[i] = false; return n;
                    })}>
                    {[sym, ...Array.from({ length: 7 }, (_, j) =>
                      slot.symbols[(i * 3 + j * 2 + 1) % slot.symbols.length])]
                      .map((s, j) => (
                        <div key={j} className="grid h-24 place-items-center">
                          <SlotSymbol sym={s} />
                        </div>
                      ))}
                  </div>
                ) : (
                  <span><SlotSymbol sym={sym} /></span>
                )}
                <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-6 bg-gradient-to-b from-black/60 to-transparent" />
                <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-6 bg-gradient-to-t from-black/60 to-transparent" />
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
  const [revealCol, setRevealCol] = useState(5);
  const [spinSeq, setSpinSeq] = useState(0);
  const prevLockedRef = useRef<Record<string, string>>({});
  const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

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
    setErr(""); setBusy(true); setMsg(null);
    prevLockedRef.current = kind === "respin" ? { ...locked } : {};
    if (kind !== "respin") setLocked({});
    setFresh(new Set());
    setRevealCol(-1); setSpinCells(true); setSpinSeq((s) => s + 1);
    try {
      const r = kind === "spin"
        ? await api.holdspinSpin(stake)
        : await api.holdspinRespin();
      setLocked(r.locked);
      setFresh(new Set(Object.keys(r.coins).map(Number)));
      setRespins(r.respins);
      setCollected(r.collected);
      sfx.spin();
      await sleep(400);
      for (let c = 0; c < 5; c++) { await sleep(150); setRevealCol(c); sfx.land(); }
      sfx.reelsStop();
      await sleep(150);
      setSpinCells(false);
      if (Object.keys(r.coins).length) sfx.chip();
      onBalance(r.balance);
      onPlayed();
      const grand = (r as any).grand && Number((r as any).grand) > 0;
      if (grand) sfx.bigwin();
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
      setSpinCells(false); setRevealCol(5); setErr(e.message);
    } finally { setBusy(false); }
  }

  function setLockedSoon(_r: unknown) { /* base coins stay shown until next spin */ }

  const filled = Object.keys(locked).length;

  return (
    <div className="rounded-xl border border-white/5 bg-base-800 shadow-card p-4">
      <div className="mb-2 flex items-baseline justify-between">
        <GameLogo k="holdspin" />
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

      <div className="relative overflow-hidden rounded-xl border border-fuchsia-500/30 bg-gradient-to-b from-[#2b0a24] via-[#160512] to-black p-3">
        <span className="pointer-events-none absolute -left-7 top-1/2 -translate-y-1/2 rotate-12 text-[120px] leading-none opacity-[0.08]">🐷</span>
        <span className="pointer-events-none absolute -right-7 top-1/2 -translate-y-1/2 -rotate-12 scale-x-[-1] text-[120px] leading-none opacity-[0.08]">🐷</span>
        <div className="relative z-10 grid grid-cols-5 gap-1.5">
          {Array.from({ length: 15 }, (_, i) => {
            const col = i % 5;
            const held = String(i) in prevLockedRef.current;
            if (spinCells && !held && col > revealCol) {
              return <SpinCellStrip key={`s-${i}-${spinSeq}`} syms={PB_SYMS} seed={i} />;
            }
            const justIn = spinCells && !held && col === revealCol;
            const v = locked[String(i)];
            return (
              <div key={i}
                className={`grid aspect-square place-items-center rounded-md border transition ${
                  justIn ? "vs-stop" : ""} ${
                  v ? (fresh.has(i)
                        ? "reel-pop border-gold bg-gradient-to-b from-gold/30 to-amber-900/40 shadow-gold"
                        : "border-gold/50 bg-gradient-to-b from-gold/15 to-base-900")
                    : "border-white/10 bg-base-900/80"}`}>
                {v ? (
                  <span className="grid h-9 w-9 place-items-center rounded-full btn-gold font-mono text-[10px] font-black text-base-900">
                    {Number(v) >= 1 ? `${Number(v).toFixed(Number(v) % 1 ? 1 : 0)}x` : `${Number(v).toFixed(2)}x`}
                  </span>
                ) : (
                  <span className="grid h-9 w-9 place-items-center opacity-75 [filter:drop-shadow(0_2px_3px_rgba(0,0,0,0.7))]">
                    {SymbolFace({ sym: PB_SYMS[(i * 7 + spinSeq * 5) % PB_SYMS.length] })}
                  </span>
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

// --------------------------------------------------------- quick-game kit ----
function QuickShell({ title, right, msg, err, children, controls, note }: {
  title: string; right?: string; msg: string | null; err: string;
  children: React.ReactNode; controls: React.ReactNode; note?: string;
}) {
  return (
    <div className="rounded-xl border border-white/5 bg-base-800 shadow-card p-4">
      <div className="mb-2 flex items-baseline justify-between">
        <h3 className="text-sm font-bold text-slate-100">{title}</h3>
        {right && <span className="font-mono text-[10px] text-slate-500">{right}</span>}
      </div>
      {msg && (
        <div className="mb-2 rounded-lg border border-gold/50 bg-gold/15 px-3 py-2 text-center text-sm font-black text-gold">{msg}</div>
      )}
      {children}
      <div className="mt-3 flex items-end gap-2">{controls}</div>
      {err && <p className="mt-2 text-xs text-red-300">{err}</p>}
      {note && <p className="mt-3 text-[10px] leading-relaxed text-slate-500">{note}</p>}
    </div>
  );
}

function BetInput({ stake, setStake, busy }: {
  stake: string; setStake: (v: string) => void; busy: boolean;
}) {
  return (
    <label className="text-xs">
      <span className="mb-1 block text-[10px] uppercase tracking-wide text-slate-500">Bet</span>
      <input value={stake} onChange={(e) => setStake(e.target.value)} disabled={busy}
        className="w-20 rounded-lg bg-base-700 px-3 py-2 font-mono text-sm text-slate-100 outline-none disabled:opacity-50" />
    </label>
  );
}

const GOLD_BTN = "ml-auto rounded-lg btn-gold px-8 py-2.5 text-sm font-black uppercase tracking-wider text-base-900 disabled:opacity-50";
const PICK_BTN = (on: boolean) =>
  `rounded-lg border py-2 text-xs font-bold transition ${
    on ? "border-gold bg-gold/15 text-gold" : "border-white/10 bg-base-900 text-slate-400 hover:border-gold/40"}`;

// ---------------------------------------------------------------- lucky 7 ----
function Lucky7({ onBalance, onPlayed }: { onBalance: (b: string) => void; onPlayed: () => void }) {
  const [stake, setStake] = useState("10");
  const [bet, setBet] = useState("under");
  const [dice, setDice] = useState<number[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const PIPS = ["", "⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];

  async function roll() {
    setErr(""); setBusy(true); setMsg(null);
    try {
      for (let i = 0; i < 6; i++) {
        sfx.tick();
        setDice([1 + Math.floor(Math.random() * 6), 1 + Math.floor(Math.random() * 6)]);
        await new Promise((r) => setTimeout(r, 90));
      }
      const r = await api.lucky7Roll(stake, bet);
      setDice(r.dice); onBalance(r.balance); onPlayed();
      if (Number(r.payout) > 0) sfx.win(); else sfx.lose();
      setMsg(Number(r.payout) > 0
        ? `${r.total} — ${bet.toUpperCase()} hits, paid ${money(r.payout)}`
        : `${r.total} — no good`);
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  }
  return (
    <QuickShell title="🎲 Lucky 7" msg={msg} err={err}
      note="Two dice. Under or over 7 pays 1.3:1, exactly 7 pays 4.75:1."
      controls={<>
        <BetInput stake={stake} setStake={setStake} busy={busy} />
        <button onClick={roll} disabled={busy} className={GOLD_BTN}>Roll</button>
      </>}>
      <div className="grid h-32 place-items-center rounded-xl border border-amber-500/25 bg-gradient-to-b from-[#2e1a04] via-[#170d02] to-black">
        <div className="flex items-center gap-3 text-6xl text-slate-100">
          <span>{dice ? PIPS[dice[0]] : "⚀"}</span>
          <span>{dice ? PIPS[dice[1]] : "⚅"}</span>
        </div>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-1.5">
        {[["under", "Under 7 · 1.3:1"], ["seven", "Lucky 7 · 4.75:1"], ["over", "Over 7 · 1.3:1"]].map(([k, l]) => (
          <button key={k} onClick={() => setBet(k)} disabled={busy} className={PICK_BTN(bet === k)}>{l}</button>
        ))}
      </div>
    </QuickShell>
  );
}

// -------------------------------------------------------------------- rps ----
function RPS({ onBalance, onPlayed }: { onBalance: (b: string) => void; onPlayed: () => void }) {
  const [stake, setStake] = useState("10");
  const [last, setLast] = useState<{ p: string; h: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const G: Record<string, string> = { rock: "✊", paper: "✋", scissors: "✌️" };

  async function throwMove(m: string) {
    setErr(""); setBusy(true); setMsg(null); setLast(null);
    try {
      const r = await api.rpsThrow(stake, m);
      setLast({ p: r.player, h: r.house });
      onBalance(r.balance); onPlayed();
      if (r.result === "win") sfx.win(); else if (r.result === "push") sfx.chip(); else sfx.lose();
      setMsg(r.result === "win" ? `House threw ${r.house} — you win ${money(r.payout)}`
        : r.result === "push" ? "Tie — stake back" : `House threw ${r.house} — house wins`);
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  }
  return (
    <QuickShell title="✊ Rock Paper Scissors" msg={msg} err={err}
      note="Beat the house hand for 0.92:1; a tie pushes your stake back."
      controls={<>
        <BetInput stake={stake} setStake={setStake} busy={busy} />
        <span className="ml-auto flex gap-1.5">
          {Object.entries(G).map(([k, g]) => (
            <button key={k} onClick={() => throwMove(k)} disabled={busy}
              className="rounded-lg btn-gold px-4 py-2 text-2xl disabled:opacity-50">{g}</button>
          ))}
        </span>
      </>}>
      <div className="grid h-28 grid-cols-2 place-items-center rounded-xl border border-violet-500/25 bg-gradient-to-b from-[#1d1040] via-[#0d071d] to-black">
        <div className="text-center">
          <div className="text-4xl">{last ? G[last.p] : "❔"}</div>
          <div className="mt-1 text-[10px] font-bold uppercase text-slate-500">You</div>
        </div>
        <div className="text-center">
          <div className="text-4xl">{last ? G[last.h] : "❔"}</div>
          <div className="mt-1 text-[10px] font-bold uppercase text-slate-500">House</div>
        </div>
      </div>
    </QuickShell>
  );
}

// ------------------------------------------------------------------ darts ----
function Darts({ def, onBalance, onPlayed }: {
  def: import("../api").DartsDef; onBalance: (b: string) => void; onPlayed: () => void;
}) {
  const [stake, setStake] = useState("10");
  const [bet, setBet] = useState("middle");
  const [dart, setDart] = useState<{ x: number; y: number } | null>(null);
  const [flying, setFlying] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState("");
  // each ring: outer radius, band colour, and a bright rim — a real target
  const RINGS = [
    { r: "outer", ro: 58, fill: "#1f6feb", rim: "#7cb8ff" },
    { r: "middle", ro: 43, fill: "#10b981", rim: "#8ff0cf" },
    { r: "inner", ro: 28, fill: "#f59e0b", rim: "#ffdf8a" },
    { r: "bullseye", ro: 13, fill: "#ef4444", rim: "#ffd0d0" },
  ] as const;
  const RING_MID: Record<string, number> = { outer: 50, middle: 35, inner: 20, bullseye: 6 };

  async function throwDart() {
    setErr(""); setBusy(true); setMsg(null); setDart(null);
    setFlying(true);
    try {
      sfx.spin();
      const r = await api.dartsThrow(stake, bet);
      await new Promise((res) => setTimeout(res, 550));
      // land the dart at a random angle inside whatever ring it hit
      const ang = Math.random() * Math.PI * 2;
      const rad = RING_MID[r.landed] ?? 30;
      setDart({ x: 60 + rad * Math.cos(ang), y: 60 + rad * Math.sin(ang) });
      setFlying(false);
      sfx.land();
      onBalance(r.balance); onPlayed();
      if (Number(r.payout) > 0) sfx.win(); else sfx.lose();
      setMsg(Number(r.payout) > 0
        ? `🎯 ${r.landed.toUpperCase()} — paid ${money(r.payout)}`
        : `Landed on ${r.landed} — you called ${bet}`);
    } catch (e: any) { setErr(e.message); setFlying(false); }
    finally { setBusy(false); }
  }
  return (
    <QuickShell title="🎯 Darts" msg={msg} err={err}
      note="Call your ring before the throw — tighter rings pay true odds."
      controls={<>
        <BetInput stake={stake} setStake={setStake} busy={busy} />
        <button onClick={throwDart} disabled={busy} className={GOLD_BTN}>Throw</button>
      </>}>
      <div className="grid place-items-center rounded-xl border border-red-500/25 bg-gradient-to-b from-[#2e0808] via-[#170404] to-black py-3">
        <svg viewBox="0 0 120 120" className="h-40 w-40">
          <circle cx="60" cy="60" r="59" fill="#0b0e14" stroke="#3a3f4b" strokeWidth="1.5" />
          {RINGS.map(({ r, ro, fill, rim }) => (
            <circle key={r} cx="60" cy="60" r={ro} fill={fill}
              stroke={bet === r ? "#ffffff" : rim}
              strokeWidth={bet === r ? 2.4 : 1}
              className={bet === r ? "[filter:drop-shadow(0_0_3px_rgba(255,255,255,0.9))]" : ""} />
          ))}
          {/* crosshair lines, faint */}
          <g stroke="#0b0e14" strokeWidth="1" opacity="0.35">
            <line x1="60" y1="4" x2="60" y2="116" /><line x1="4" y1="60" x2="116" y2="60" />
          </g>
          {/* the dart, stuck where it landed */}
          {dart && (
            <g className="vs-seat">
              <circle cx={dart.x} cy={dart.y} r="3.4" fill="#0b0e14" stroke="#fff" strokeWidth="1" />
              <circle cx={dart.x} cy={dart.y} r="1.4" fill="#fde047" />
            </g>
          )}
        </svg>
      </div>
      {flying && <p className="mt-1 text-center text-[11px] text-slate-400">…dart in the air…</p>}
      <div className="mt-2 grid grid-cols-4 gap-1.5">
        {def.rings.map(({ ring, mult }) => (
          <button key={ring} onClick={() => setBet(ring)} disabled={busy} className={PICK_BTN(bet === ring)}>
            {ring}<br /><span className="font-mono text-gold">{mult}x</span>
          </button>
        ))}
      </div>
    </QuickShell>
  );
}

// ------------------------------------------------------------------ prism ----
function Prism({ def, onBalance, onPlayed }: {
  def: import("../api").PrismDef; onBalance: (b: string) => void; onPlayed: () => void;
}) {
  const [stake, setStake] = useState("10");
  const [gem, setGem] = useState<{ g: string; m: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const GEM: Record<string, string> = {
    shard: "🔹", topaz: "🔶", emerald: "🟢", sapphire: "🔷", diamond: "💎", dust: "✨",
  };

  async function spin() {
    setErr(""); setBusy(true); setMsg(null);
    try {
      const all = [...def.segments.map((s) => s.gem), "dust"];
      for (let i = 0; i < 8; i++) {
        sfx.tick();
        setGem({ g: all[Math.floor(Math.random() * all.length)], m: "" });
        await new Promise((r) => setTimeout(r, 80));
      }
      const r = await api.prismSpin(stake);
      setGem({ g: r.gem, m: r.multiplier });
      onBalance(r.balance); onPlayed();
      if (Number(r.payout) > 0) sfx.win(); else sfx.lose();
      setMsg(Number(r.payout) > 0
        ? `${r.gem.toUpperCase()} ${r.multiplier}x — paid ${money(r.payout)}`
        : "Dust — nothing this time");
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  }
  return (
    <QuickShell title="💎 Prism" msg={msg} err={err}
      note={"Land a gem and it pays its printed multiple: " +
        def.segments.map((s) => `${s.gem} ${s.mult}x`).join(" · ")}
      controls={<>
        <BetInput stake={stake} setStake={setStake} busy={busy} />
        <button onClick={spin} disabled={busy} className={GOLD_BTN}>Spin</button>
      </>}>
      <div className="grid h-32 place-items-center rounded-xl border border-fuchsia-500/25 bg-gradient-to-b from-[#2c0a3a] via-[#150419] to-black">
        <span className="text-6xl">{gem ? GEM[gem.g] ?? "✨" : "🔮"}</span>
      </div>
      <div className="mt-2 flex flex-wrap justify-center gap-1.5">
        {def.segments.map((s) => (
          <span key={s.gem} className="rounded bg-base-900/70 px-2 py-1 font-mono text-[10px] text-slate-300">
            {GEM[s.gem]} {s.mult}x
          </span>
        ))}
      </div>
    </QuickShell>
  );
}

// ---------------------------------------------------------- streak ladders ----
function LadderGame({ def, skin, onBalance, onPlayed }: {
  def: import("../api").LadderDef;
  skin: { title: string; step: string; bust: string; icon: string; frame: string; bg: string };
  onBalance: (b: string) => void; onPlayed: () => void;
}) {
  const levels = Object.keys(def.levels);
  const [stake, setStake] = useState("10");
  const [level, setLevel] = useState(levels[0]);
  const [st, setSt] = useState<import("../api").LadderState | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    api.ladderActive(def.game).then((r) => {
      if (r.active) { setSt(r.active); setLevel(r.active.level); }
    }).catch(() => {});
  }, [def.game]);

  const live = st && st.status === "open";
  const conf = def.levels[live ? st!.level : level];

  async function start() {
    setErr(""); setBusy(true); setMsg(null);
    try {
      const r = await api.ladderStart(def.game, stake, level);
      setSt(r); if (r.balance) onBalance(r.balance); onPlayed();
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  }
  async function step() {
    if (!st) return;
    setErr(""); setBusy(true);
    try {
      const r = await api.ladderStep(def.game, st.round_id);
      setSt(r); if (r.balance) onBalance(r.balance); onPlayed();
      if (!r.survived) { sfx.boom(); setMsg(skin.bust); }
      else if (r.outcome !== "topped") sfx.chip();
      if (r.survived && r.outcome === "topped") sfx.bigwin();
      if (!r.survived) { /* handled */ }
      else if (r.outcome === "topped") setMsg(`🏆 ALL THE WAY — paid ${money(r.payout!)}`);
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  }
  async function cashout() {
    if (!st) return;
    setErr(""); setBusy(true);
    try {
      const r = await api.ladderCashout(def.game, st.round_id);
      setSt(r); if (r.balance) onBalance(r.balance); onPlayed();
      sfx.cashout();
      setMsg(`Cashed out ${r.multiplier}x — ${money(r.payout!)}`);
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  }
  return (
    <QuickShell title={skin.title} msg={msg} err={err}
      right={live ? `${st!.multiplier}x locked` : undefined}
      controls={!live ? <>
        <BetInput stake={stake} setStake={setStake} busy={busy} />
        {levels.length > 1 && (
          <label className="text-xs">
            <span className="mb-1 block text-[10px] uppercase tracking-wide text-slate-500">Difficulty</span>
            <select value={level} onChange={(e) => setLevel(e.target.value)} disabled={busy}
              className="rounded-lg bg-base-700 px-2 py-2 text-sm text-slate-100 outline-none">
              {levels.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          </label>
        )}
        <button onClick={start} disabled={busy} className={GOLD_BTN}>Start</button>
      </> : <>
        <button onClick={cashout} disabled={busy || st!.step === 0}
          className="rounded-lg border border-gold/50 bg-base-900 px-4 py-2.5 text-xs font-black uppercase tracking-wider text-gold hover:bg-base-700 disabled:opacity-50">
          Cash out {st!.multiplier}x
        </button>
        <button onClick={step} disabled={busy} className={GOLD_BTN}>
          {skin.step}{st!.next_multiplier ? ` → ${st!.next_multiplier}x` : ""}
        </button>
      </>}>
      <div className={`rounded-xl border ${skin.frame} bg-gradient-to-b ${skin.bg} p-3`}>
        <div className="flex flex-wrap items-center gap-1.5">
          {conf.mults.map((m, i) => {
            const stepN = i + 1;
            const cleared = live ? stepN <= st!.step : false;
            const next = live && stepN === st!.step + 1;
            const dead = st?.outcome === "bust" && stepN === st!.step + 1;
            return (
              <div key={i} className={`grid min-w-[52px] flex-1 place-items-center rounded-md border px-1 py-1.5 transition ${
                dead ? "border-red-500/60 bg-red-500/15"
                : cleared ? "border-accent/50 bg-accent/10"
                : next ? "border-gold/60 bg-gold/10 animate-pulse"
                : "border-white/10 bg-base-900/70"}`}>
                <span className="text-sm">{dead ? "💀" : cleared ? skin.icon : ""}</span>
                <span className={`font-mono text-[10px] font-bold ${
                  cleared ? "text-accent" : next ? "text-gold" : "text-slate-500"}`}>{m}x</span>
              </div>
            );
          })}
        </div>
      </div>
    </QuickShell>
  );
}

// ------------------------------------------------------------- acey ducey ----
function AceyDucey({ onBalance, onPlayed }: { onBalance: (b: string) => void; onPlayed: () => void }) {
  const [stake, setStake] = useState("10");
  const [hand, setHand] = useState<{ cards: string[]; rid: number;
    between: string; outside: string } | null>(null);
  const [third, setThird] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    api.aceyActive().then((r) => {
      if (r.active) setHand({ cards: r.active.cards, rid: r.active.round_id,
        between: r.active.between_mult, outside: r.active.outside_mult });
    }).catch(() => {});
  }, []);

  async function deal() {
    setErr(""); setBusy(true); setMsg(null); setThird(null);
    try {
      const r = await api.aceyStart(stake);
      setHand({ cards: r.cards, rid: r.round_id,
        between: r.between_mult, outside: r.outside_mult });
      onBalance(r.balance); onPlayed();
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  }
  async function choose(side: string) {
    if (!hand) return;
    setErr(""); setBusy(true);
    try {
      const r = await api.aceyChoose(hand.rid, side);
      setThird(r.third); setHand(null);
      onBalance(r.balance); onPlayed();
      setMsg(r.hit ? `${r.third} — ${side.toUpperCase()} hits ${r.multiplier}x, paid ${money(r.payout)}`
        : `${r.third} — no good`);
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  }
  return (
    <QuickShell title="🎴 Acey Ducey" msg={msg} err={err}
      note="Two cards up — call the third strictly between or strictly outside at true odds. A boundary card loses either way."
      controls={!hand ? <>
        <BetInput stake={stake} setStake={setStake} busy={busy} />
        <button onClick={deal} disabled={busy} className={GOLD_BTN}>Deal</button>
      </> : <>
        {Number(hand.between) > 0 && (
          <button onClick={() => choose("between")} disabled={busy}
            className="flex-1 rounded-lg border border-accent/50 bg-accent/10 py-2.5 text-sm font-black text-accent hover:bg-accent/20 disabled:opacity-50">
            Between · {hand.between}x
          </button>
        )}
        {Number(hand.outside) > 0 && (
          <button onClick={() => choose("outside")} disabled={busy}
            className="flex-1 rounded-lg border border-sky-400/50 bg-sky-500/10 py-2.5 text-sm font-black text-sky-300 hover:bg-sky-500/20 disabled:opacity-50">
            Outside · {hand.outside}x
          </button>
        )}
      </>}>
      <div className="flex items-center justify-center gap-3 rounded-xl border border-indigo-500/25 bg-gradient-to-b from-[#141040] via-[#0a071d] to-black py-4">
        {hand ? <DealtCard key={hand.cards[0]} c={hand.cards[0]} i={0} /> : <PlayingCard c="??" />}
        <span className="grid h-16 w-11 place-items-center rounded-lg border border-dashed border-gold/40 text-xl text-gold/70">
          {third ? <DealtCard key={third} c={third} i={0} /> : "?"}
        </span>
        {hand ? <DealtCard key={hand.cards[1]} c={hand.cards[1]} i={1} /> : <PlayingCard c="??" />}
      </div>
    </QuickShell>
  );
}

// ------------------------------------------------------------- casino war ----
function WarGame({ onBalance, onPlayed }: { onBalance: (b: string) => void; onPlayed: () => void }) {
  const [stake, setStake] = useState("10");
  const [cards, setCards] = useState<{ p: string; d: string } | null>(null);
  const [warCards, setWarCards] = useState<{ p: string; d: string } | null>(null);
  const [tieRid, setTieRid] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    api.warActive().then((r) => {
      if (r.active) {
        setCards({ p: r.active.player, d: r.active.dealer });
        setTieRid(r.active.round_id);
        setStake(String(Number(r.active.stake)));
      }
    }).catch(() => {});
  }, []);

  async function deal() {
    setErr(""); setBusy(true); setMsg(null); setWarCards(null);
    try {
      const r = await api.warDeal(stake);
      setCards({ p: r.player, d: r.dealer });
      onBalance(r.balance); onPlayed();
      if (r.tie) { setTieRid(r.round_id); setMsg("⚔ TIE — go to war or surrender"); }
      else setMsg(Number(r.payout) > 0 ? `You win — paid ${money(r.payout)}` : "House takes it");
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  }
  async function goWar() {
    if (tieRid == null) return;
    setErr(""); setBusy(true);
    try {
      const r = await api.warGo(tieRid);
      setWarCards({ p: r.war_player, d: r.war_dealer });
      setTieRid(null); onBalance(r.balance); onPlayed();
      setMsg(r.outcome === "war_win" ? `⚔ WAR WON — paid ${money(r.payout)}` : "⚔ War lost — both stakes gone");
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  }
  async function surrender() {
    if (tieRid == null) return;
    setErr(""); setBusy(true);
    try {
      const r = await api.warSurrender(tieRid);
      setTieRid(null); onBalance(r.balance); onPlayed();
      setMsg(`Surrendered — half back, ${money(r.payout)}`);
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  }
  return (
    <QuickShell title="⚔ War" msg={msg} err={err}
      note="High card wins even money, ace low. On a tie: surrender for half back, or double your stake and go to war — win it and collect on both."
      controls={tieRid == null ? <>
        <BetInput stake={stake} setStake={setStake} busy={busy} />
        <button onClick={deal} disabled={busy} className={GOLD_BTN}>Deal</button>
      </> : <>
        <button onClick={surrender} disabled={busy}
          className="flex-1 rounded-lg border border-white/10 bg-base-900 py-2.5 text-xs font-bold text-slate-300 hover:bg-base-700 disabled:opacity-50">
          Surrender · ½ back
        </button>
        <button onClick={goWar} disabled={busy}
          className="flex-1 rounded-lg btn-gold py-2.5 text-sm font-black uppercase text-base-900 disabled:opacity-50">
          WAR · +{money(stake)}
        </button>
      </>}>
      <div className="grid grid-cols-2 place-items-center gap-2 rounded-xl border border-red-500/25 bg-gradient-to-b from-[#2e0a12] via-[#170408] to-black py-4">
        <div className="text-center">
          <div className="flex gap-1">{cards && <DealtCard key={cards.p} c={cards.p} i={0} />}{warCards && <DealtCard key={warCards.p} c={warCards.p} i={2} />}{!cards && <PlayingCard c="??" />}</div>
          <div className="mt-1 text-[10px] font-bold uppercase text-slate-500">You</div>
        </div>
        <div className="text-center">
          <div className="flex gap-1">{cards && <DealtCard key={cards.d} c={cards.d} i={1} />}{warCards && <DealtCard key={warCards.d} c={warCards.d} i={3} />}{!cards && <PlayingCard c="??" />}</div>
          <div className="mt-1 text-[10px] font-bold uppercase text-slate-500">House</div>
        </div>
      </div>
    </QuickShell>
  );
}

// ------------------------------------------------------------ 10 card flip ----
function CardFlip({ onBalance, onPlayed }: { onBalance: (b: string) => void; onPlayed: () => void }) {
  const [stake, setStake] = useState("10");
  const [st, setSt] = useState<import("../api").FlipState | null>(null);
  const [done, setDone] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    api.flipActive().then((r) => { if (r.active) { setSt(r.active); setDone(false); } }).catch(() => {});
  }, []);

  async function start() {
    setErr(""); setBusy(true); setMsg(null);
    try {
      const r = await api.flipStart(stake);
      setSt(r); setDone(false);
      if (r.balance) onBalance(r.balance); onPlayed();
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  }
  async function flip() {
    if (!st) return;
    setErr(""); setBusy(true);
    try {
      const r = await api.flipFlip(st.round_id);
      setSt(r); if (r.balance) onBalance(r.balance); onPlayed();
      if (r.outcome === "bust") { setDone(true); setMsg("🖤 Black — the run is over"); }
      else if (r.outcome === "cleared") { setDone(true); setMsg(`❤️ ALL FIVE REDS — paid ${money(r.payout!)}`); }
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  }
  async function cashout() {
    if (!st) return;
    setErr(""); setBusy(true);
    try {
      const r = await api.flipCashout(st.round_id);
      setDone(true); onBalance(r.balance); onPlayed();
      setMsg(`Cashed out ${r.multiplier}x — ${money(r.payout)}`);
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  }
  const flipped = st?.flipped ?? [];
  return (
    <QuickShell title="🃏 10 Card Flip" msg={msg} err={err}
      right={!done && st ? `${st.multiplier}x locked` : undefined}
      note="Ten cards, five red, five black. Every red flipped multiplies at the true odds of the cards left; one black ends the run."
      controls={done ? <>
        <BetInput stake={stake} setStake={setStake} busy={busy} />
        <button onClick={start} disabled={busy} className={GOLD_BTN}>Start</button>
      </> : <>
        <button onClick={cashout} disabled={busy || flipped.length === 0}
          className="rounded-lg border border-gold/50 bg-base-900 px-4 py-2.5 text-xs font-black uppercase tracking-wider text-gold hover:bg-base-700 disabled:opacity-50">
          Cash out {st!.multiplier}x
        </button>
        <button onClick={flip} disabled={busy || (st?.reds_left ?? 0) === 0} className={GOLD_BTN}>
          Flip{st?.next_multiplier ? ` → ${st.next_multiplier}x` : ""}
        </button>
      </>}>
      <div className="rounded-xl border border-slate-500/25 bg-gradient-to-b from-[#1c2030] via-[#0d0f18] to-black p-3">
        <div className="grid grid-cols-5 gap-1.5">
          {Array.from({ length: 10 }, (_, i) => {
            const c = flipped[i];
            return (
              <div key={i} className={`grid h-14 place-items-center rounded-lg border text-2xl transition ${
                c === "r" ? "border-red-400/60 bg-red-500/15"
                : c === "b" ? "border-slate-400/40 bg-slate-500/15"
                : "border-white/10 bg-base-900/80"}`}>
                {c ? <span key={`${i}-${c}`} className="deal-flip inline-block">
                       <span className="deal-front">{c === "r" ? "❤️" : "🖤"}</span>
                       <span className="deal-back">🂠</span>
                     </span>
                   : "🂠"}
              </div>
            );
          })}
        </div>
        {!done && st && (
          <p className="mt-2 text-center font-mono text-[10px] text-slate-400">
            {st.reds_left} red · {st.blacks_left} black remaining
          </p>
        )}
      </div>
    </QuickShell>
  );
}

// ------------------------------------------------------------ ride the bus ----
function RideTheBus({ onBalance, onPlayed }: { onBalance: (b: string) => void; onPlayed: () => void }) {
  const [stake, setStake] = useState("10");
  const [st, setSt] = useState<import("../api").BusState | null>(null);
  const [done, setDone] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const STAGE_LABEL: Record<string, string> = {
    color: "Red or Black?", hilo: "Higher or Lower?", inout: "Inside or Outside?", suit: "Pick the Suit",
  };
  const OPT_LABEL: Record<string, string> = {
    red: "🔴 Red", black: "⚫ Black", higher: "▲ Higher", lower: "▼ Lower",
    inside: "◇ Inside", outside: "◈ Outside", s: "♠", h: "♥", d: "♦", c: "♣",
  };

  useEffect(() => {
    api.busActive().then((r) => { if (r.active) { setSt(r.active); setDone(false); } }).catch(() => {});
  }, []);

  async function start() {
    setErr(""); setBusy(true); setMsg(null);
    try {
      const r = await api.busStart(stake);
      setSt(r); setDone(false);
      if (r.balance) onBalance(r.balance); onPlayed();
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  }
  async function guess(choice: string) {
    if (!st) return;
    setErr(""); setBusy(true);
    try {
      const r = await api.busGuess(st.round_id, choice);
      setSt(r); if (r.balance) onBalance(r.balance); onPlayed();
      if (r.outcome === "bust") { setDone(true); setMsg(`${r.card} — off the bus`); }
      else if (r.outcome === "rode_the_bus") { setDone(true); setMsg(`🚌 RODE THE BUS — paid ${money(r.payout!)}`); }
      else setMsg(`${r.card} ✓ — riding ${r.multiplier}x`);
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  }
  async function cashout() {
    if (!st) return;
    setErr(""); setBusy(true);
    try {
      const r = await api.busCashout(st.round_id);
      setDone(true); onBalance(r.balance); onPlayed();
      setMsg(`Hopped off at ${r.multiplier}x — ${money(r.payout)}`);
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  }
  return (
    <QuickShell title="🚌 Ride the Bus" msg={msg} err={err}
      right={!done && st ? `${st.multiplier}x riding` : undefined}
      note="Four calls in a row: color, higher/lower, inside/outside, then the suit. Each right call multiplies — hop off between stops or ride it all the way."
      controls={done ? <>
        <BetInput stake={stake} setStake={setStake} busy={busy} />
        <button onClick={start} disabled={busy} className={GOLD_BTN}>Board</button>
      </> : <>
        <button onClick={cashout} disabled={busy || st!.stage_num === 0}
          className="ml-auto rounded-lg border border-gold/50 bg-base-900 px-4 py-2.5 text-xs font-black uppercase tracking-wider text-gold hover:bg-base-700 disabled:opacity-50">
          Hop off {st!.multiplier}x
        </button>
      </>}>
      <div className="rounded-xl border border-yellow-500/25 bg-gradient-to-b from-[#2e2404] via-[#171202] to-black p-3">
        <div className="flex items-center justify-center gap-2">
          <DealtHand cards={st?.cards ?? []} />
          {!done && st && st.cards.length < 4 && <PlayingCard c="??" />}
          {(!st || (done && !st.cards.length)) && <PlayingCard c="??" />}
        </div>
        {!done && st && st.stage && st.options && (
          <>
            <p className="mt-3 text-center text-xs font-bold text-slate-300">{STAGE_LABEL[st.stage]}</p>
            <div className={`mt-2 grid gap-1.5 ${Object.keys(st.options).length > 2 ? "grid-cols-4" : "grid-cols-2"}`}>
              {Object.entries(st.options).map(([k, m]) => (
                <button key={k} onClick={() => guess(k)} disabled={busy}
                  className="rounded-lg border border-gold/40 bg-gold/10 py-2 text-sm font-bold text-gold hover:bg-gold/20 disabled:opacity-50">
                  {OPT_LABEL[k] ?? k} <span className="font-mono text-[10px]">{Number(m).toFixed(2)}x</span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </QuickShell>
  );
}

// -------------------------------------------------------------- suit link ----
function SuitLink({ onBalance, onPlayed }: { onBalance: (b: string) => void; onPlayed: () => void }) {
  const [stake, setStake] = useState("10");
  const [suit, setSuit] = useState("h");
  const [cards, setCards] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const S: Record<string, string> = { s: "♠", h: "♥", d: "♦", c: "♣" };

  async function play() {
    setErr(""); setBusy(true); setMsg(null); setCards(null);
    try {
      const r = await api.suitlinkPlay(stake, suit);
      setCards(r.cards); onBalance(r.balance); onPlayed();
      setMsg(r.hits === 2 ? `🔗 BOTH ${S[suit]} — paid ${money(r.payout)}`
        : r.hits === 1 ? `One ${S[suit]} — paid ${money(r.payout)}`
        : "No match");
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  }
  return (
    <QuickShell title="🔗 Suit Link" msg={msg} err={err}
      note="Pick your suit, two cards fall. Both match pays 7.68x, one match pays 1.28x."
      controls={<>
        <BetInput stake={stake} setStake={setStake} busy={busy} />
        <span className="flex gap-1">
          {Object.entries(S).map(([k, g]) => (
            <button key={k} onClick={() => setSuit(k)} disabled={busy}
              className={`${PICK_BTN(suit === k)} px-3 text-lg ${k === "h" || k === "d" ? "text-red-400" : ""}`}>
              {g}
            </button>
          ))}
        </span>
        <button onClick={play} disabled={busy} className={GOLD_BTN}>Drop</button>
      </>}>
      <div className="flex items-center justify-center gap-3 rounded-xl border border-pink-500/25 bg-gradient-to-b from-[#2e0a1e] via-[#17040e] to-black py-4">
        {cards ? <DealtHand cards={cards} />
          : <><PlayingCard c="??" /><PlayingCard c="??" /></>}
        <span className="text-3xl text-gold">{S[suit]}</span>
      </div>
    </QuickShell>
  );
}

// --------------------------------------------------------- high card flush ----
function HighCardFlush({ onBalance, onPlayed }: { onBalance: (b: string) => void; onPlayed: () => void }) {
  const [stake, setStake] = useState("10");
  const [hand, setHand] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState("");

  async function deal() {
    setErr(""); setBusy(true); setMsg(null); setHand(null);
    try {
      const r = await api.hcfDeal(stake);
      setHand(r.hand);
      await new Promise((res) => setTimeout(res, 950));
      onBalance(r.balance); onPlayed();
      setMsg(Number(r.payout) > 0
        ? `${r.flush_len}-card flush — ${r.multiplier}x paid ${money(r.payout)}`
        : `${r.flush_len}-card flush — no pay`);
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  }
  return (
    <QuickShell title="🂡 High Card Flush" msg={msg} err={err}
      note="Five cards off a fresh deck — your longest suit is the hand. 3-flush pays 1.32x, 4-flush 6.71x, 5-flush 121.16x."
      controls={<>
        <BetInput stake={stake} setStake={setStake} busy={busy} />
        <button onClick={deal} disabled={busy} className={GOLD_BTN}>Deal</button>
      </>}>
      <div className="flex items-center justify-center gap-1.5 rounded-xl border border-emerald-500/25 bg-gradient-to-b from-[#04291c] via-[#02150e] to-black py-4">
        {hand ? <DealtHand cards={hand} />
          : Array.from({ length: 5 }, (_, i) => <PlayingCard key={i} c="??" />)}
      </div>
    </QuickShell>
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
        sfx.tick();
        setDrawn((d) => new Set([...d, b]));
      }
      if (Number(r.win) > 0) sfx.win(); else sfx.lose();
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
      if (r.outcome === "bust") { sfx.boom(); setMsg("💥 Trap — the stake is gone"); }
      else if (r.outcome === "topped") { sfx.bigwin(); setMsg(`🏆 TOP FLOOR — paid ${money(r.payout!)}`); }
      else sfx.chip();
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  }
  async function cashout() {
    if (!st) return;
    setErr(""); setBusy(true);
    try {
      const r = await api.towersCashout(st.round_id);
      setSt(r); if (r.balance) onBalance(r.balance); onPlayed();
      sfx.cashout();
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
    setCards(null);
    try {
      const r = await api.dtDeal(stake, bet);
      setCards({ d: r.dragon, t: r.tiger });
      await new Promise((res) => setTimeout(res, 750));
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
            {cards ? <DealtCard key={side === "d" ? cards.d : cards.t} c={side === "d" ? cards.d : cards.t} i={side === "d" ? 0 : 1} />
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
          {st ? <DealtCard key={st.card + st.history.length} c={st.card} i={0} />
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

function TumbleCell({ sym, hot, popping }: { sym: string; hot: boolean; popping: boolean }) {
  // real machine cell: inset dark glass, rim, top gloss — same premium look
  // as the video slots, so the drawn candies read like a Hacksaw grid
  const base = `relative grid aspect-square place-items-center overflow-hidden rounded-lg transition ${
    popping ? "scale-0 opacity-0 duration-300"
    : hot ? "win-cell duration-150" : "duration-150"}`;
  const plate = hot ? undefined : {
    background: "linear-gradient(160deg, #241a33 0%, #140d20 55%, #0a0614 100%)",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.10), inset 0 0 0 1px rgba(196,165,255,0.14), inset 0 -7px 12px -7px rgba(0,0,0,0.9)",
  };
  const gloss = (
    <div className="pointer-events-none absolute inset-x-1 top-0.5 h-[38%] rounded-[40%] bg-[linear-gradient(180deg,rgba(255,255,255,0.14),transparent)] blur-[1px]" />
  );
  // scatter is the lollipop; bombs carry their stamp; everything else is a
  // drawn candy/gem face
  const sk = sym === "scatter" ? "lollipop" : sym;
  const face = sym.startsWith("bomb:") ? null : SymbolFace({ sym: sk });
  return (
    <div className={base} style={plate}>
      {gloss}
      {sym.startsWith("bomb:") ? (
        <span className="relative z-10 grid h-8 w-8 place-items-center rounded-full bg-gradient-to-b from-rose-400 to-red-700 border border-white/40 font-mono text-[10px] font-black text-white shadow-[0_2px_4px_rgba(0,0,0,0.6)] sm:h-9 sm:w-9">
          {sym.split(":")[1]}x
        </span>
      ) : (
        <div className="relative z-10 grid h-full w-full place-items-center [filter:drop-shadow(0_3px_4px_rgba(0,0,0,0.7))]">
          {face ?? <span className="text-xl sm:text-2xl">{TB_FRUIT[sym] ?? sym}</span>}
        </div>
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
  const [dropSeq, setDropSeq] = useState(0);
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
      sfx.spin();
      await sleep(340);
      setSpinBlur(false);
      // the fresh board rains in column by column, then the cascade plays
      setDropSeq((s) => s + 1);
      setGrid(r.grids[0]);
      await sleep(480);
      let acc = 0;
      for (let i = 0; i < r.steps.length; i++) {
        await sleep(420);
        const syms = new Set(r.steps[i].map((w) => w.sym));
        acc += r.steps[i].reduce((s, w) => s + Number(w.pay), 0);
        setHotSyms(syms);
        sfx.chip();
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
      if (Number(r.win) > 0) sfx.win();
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
        <GameLogo k="tumble" />
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
        <div className={`grid grid-cols-6 gap-1 sm:gap-1.5 ${spinBlur ? "opacity-40 blur-[1px] transition-all" : ""}`}>
          {Array.from({ length: 30 }, (_, i) => {
            // backend grid is column-major (col*5+row); render row-major
            const col = i % 6, row = Math.floor(i / 6);
            const s = grid[col * 5 + row];
            return (
              <div key={`${dropSeq}-${col}-${row}-${s}`} className="tb-in"
                style={{ animationDelay: `${col * 45 + row * 35}ms` }}>
                <TumbleCell sym={s} hot={cellHot(s)} popping={cellPop(s)} />
              </div>
            );
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

// the fortune board's resting symbols — what the reels show between coins
// hold&win resting reels use DRAWN symbols (not emoji) so the board reads
// like a real machine between coin drops — the coins remain the stars
const DR_SYMS = ["coin", "crown", "seven", "diamond", "ring", "bell", "star", "cherry"];
const PB_SYMS = ["coin", "star", "diamond", "ring", "bell", "crown", "seven", "cherry"];

/* one hold&win cell mid-spin: a fast blurred mini-reel of theme symbols */
function SpinCellStrip({ syms, seed }: { syms: string[]; seed: number }) {
  const items = Array.from({ length: 4 }, (_, j) => syms[(seed + j * 3) % syms.length]);
  return (
    <div className="relative aspect-square overflow-hidden rounded-md border border-white/10 bg-base-900/80">
      <div className="vs-strip absolute inset-x-0 blur-[1px]">
        {[...items, ...items].map((s, j) => (
          <div key={j} className="grid aspect-square w-full place-items-center">
            {SymbolFace({ sym: s }) ?? <span className="text-xl">{s}</span>}
          </div>
        ))}
      </div>
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-1/3 bg-gradient-to-b from-black/50 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-1/3 bg-gradient-to-t from-black/50 to-transparent" />
    </div>
  );
}

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
  const [revealCol, setRevealCol] = useState(5);
  const [spinSeq, setSpinSeq] = useState(0);
  const prevLockedRef = useRef<Record<string, string>>({});
  const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

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
  const [intro, setIntro] = useState(false);
  const [tally, setTally] = useState<{ total: string; coins: number;
    grand: boolean } | null>(null);
  const isTier = (v: string) => (def.jackpots as Record<string, string>)[v] !== undefined;
  const stampOf = (v: string): number | null => {
    if (isTier(v) || !v.includes("x")) return null;
    return Number(v.split("x")[1]) || null;
  };
  const coinPay = (v: string) => {
    if (isTier(v)) return Number(def.jackpots[v]) * bet;
    if (v.includes("x")) {
      const [face, m] = v.split("x");
      return Number(face) * Number(m) * bet;
    }
    return Number(v) * bet;
  };

  async function run(kind: "spin" | "respin" | "buy") {
    setErr(""); setBusy(true); setMsg(null); setHitTier(null);
    // held coins stay put; everything else becomes a spinning mini-reel
    prevLockedRef.current = kind === "respin" ? { ...locked } : {};
    if (kind !== "respin") setLocked({});
    setFresh(new Set());
    setRevealCol(-1); setSpinCells(true); setSpinSeq((s) => s + 1);
    try {
      const r = kind === "spin" ? await api.dragonSpin(stake)
        : kind === "buy" ? await api.dragonBuy(stake)
        : await api.dragonRespin();
      setLocked(r.locked);
      setFresh(new Set(Object.keys(r.coins).map(Number)));
      setRespins(r.respins);
      setCollected(r.collected);
      // the columns stop left to right, like the real cabinets
      sfx.spin();
      await sleep(400);
      for (let c = 0; c < 5; c++) { await sleep(150); setRevealCol(c); sfx.land(); }
      sfx.reelsStop();
      await sleep(150);
      setSpinCells(false);
      if (Object.keys(r.coins).length) sfx.chip();
      onBalance(r.balance);
      onPlayed();
      const tiers = Object.values(r.coins).filter(isTier);
      if (tiers.length) { setHitTier(tiers[tiers.length - 1]); sfx.bigwin(); }
      const grand = (r as any).grand && Number((r as any).grand) > 0;
      if (kind !== "respin" && (r as any).triggered) {
        setInFeature(true);
        setIntro(true);
        window.setTimeout(() => setIntro(false), 1600);
        setMsg(tiers.length
          ? `🐉 ${tiers.map((t) => t.toUpperCase()).join(" + ")} JACKPOT! Coins locked`
          : `🐉 HOLD & WIN! ${Object.keys(r.locked).length} coins locked`);
      } else if (r.status === "settled") {
        setInFeature(false);
        if (kind === "respin") {
          setTally({ total: r.collected, coins: Object.keys(r.locked).length,
                     grand: !!grand });
        }
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
      setSpinCells(false); setRevealCol(5); setErr(e.message);
    } finally { setBusy(false); }
  }

  const filled = Object.keys(locked).length;
  const fmt = (n: number) =>
    n >= 1000 ? n.toLocaleString(undefined, { maximumFractionDigits: 0 })
      : n >= 10 ? n.toFixed(0) : n.toFixed(2);

  return (
    <div className="rounded-xl border border-white/5 bg-base-800 shadow-card p-4">
      <div className="mb-2 flex items-baseline justify-between">
        <GameLogo k="dragon" />
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
        <div className="tile-shine vs-hot rounded-md border border-gold/60 bg-gradient-to-b from-gold/25 to-amber-950/60 px-1 py-1 text-center shadow-gold">
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

      {/* the fortune board: dragons coiled behind the reels */}
      <div className="relative overflow-hidden rounded-xl border border-red-600/40 bg-gradient-to-b from-[#3d0a04] via-[#1c0402] to-black p-3">
        <span className="pointer-events-none absolute -left-7 top-1/2 -translate-y-1/2 rotate-12 text-[120px] leading-none opacity-[0.09]">🐉</span>
        <span className="pointer-events-none absolute -right-7 top-1/2 -translate-y-1/2 -rotate-12 scale-x-[-1] text-[120px] leading-none opacity-[0.09]">🐉</span>
        <div className="pointer-events-none absolute inset-x-0 top-0 h-10 bg-[radial-gradient(240px_36px_at_50%_0,rgba(240,180,41,0.18),transparent)]" />
        <div className="relative z-10 grid grid-cols-5 gap-1.5">
          {Array.from({ length: 15 }, (_, i) => {
            const col = i % 5;
            const held = String(i) in prevLockedRef.current;
            if (spinCells && !held && col > revealCol) {
              return <SpinCellStrip key={`s-${i}-${spinSeq}`} syms={DR_SYMS} seed={i} />;
            }
            const justIn = spinCells && !held && col === revealCol;
            const v = locked[String(i)];
            const tier = v && isTier(v) ? DR_TIERS.find(([k]) => k === v) : null;
            return (
              <div key={i}
                className={`grid aspect-square place-items-center rounded-md border transition ${
                  justIn ? "vs-stop" : ""} ${
                  v ? (fresh.has(i)
                        ? "reel-pop border-gold bg-gradient-to-b from-gold/30 to-red-950/60 shadow-gold"
                        : "border-gold/50 bg-gradient-to-b from-gold/15 to-base-900")
                    : "border-white/10 bg-base-900/80"}`}>
                {v ? (
                  tier ? (
                    <span className={`grid h-10 w-10 place-items-center rounded-full bg-gradient-to-b ${tier[2]} border border-white/40 font-sans text-[8px] font-black tracking-wide text-white drop-shadow`}>
                      {tier[1]}
                    </span>
                  ) : (
                    <span className="relative grid h-9 w-9 place-items-center rounded-full btn-gold font-mono text-[10px] font-black text-base-900 ring-2 ring-amber-900/60">
                      {fmt(coinPay(v))}
                      {stampOf(v) && (
                        <span className="reel-pop absolute -right-1.5 -top-1.5 rounded-md bg-gradient-to-b from-red-500 to-red-800 px-1 text-[9px] font-black text-white ring-1 ring-red-300/70">
                          ×{stampOf(v)}
                        </span>
                      )}
                    </span>
                  )
                ) : (
                  <span className="grid h-9 w-9 place-items-center opacity-75 [filter:drop-shadow(0_2px_3px_rgba(0,0,0,0.7))]">
                    {SymbolFace({ sym: DR_SYMS[(i * 7 + spinSeq * 5) % DR_SYMS.length] })}
                  </span>
                )}
              </div>
            );
          })}
        </div>
        {intro && (
          <div className="pointer-events-none absolute inset-0 z-30 grid place-items-center rounded-xl bg-black/70 backdrop-blur-[2px]">
            <div className="bigwin-pop text-center">
              <div className="bg-gradient-to-b from-yellow-100 via-gold to-amber-600 bg-clip-text text-3xl font-black tracking-tight text-transparent drop-shadow-[0_4px_10px_rgba(0,0,0,0.8)] sm:text-4xl">
                HOLD &amp; WIN
              </div>
              <div className="mt-1 text-sm font-bold text-slate-200">
                Coins lock · {def.respins} respins · every new coin resets them
              </div>
            </div>
          </div>
        )}
        {tally && (
          <button onClick={() => setTally(null)}
            className="absolute inset-0 z-30 grid cursor-pointer place-items-center rounded-xl bg-black/75 backdrop-blur-[2px]">
            <span className="bigwin-pop text-center">
              <span className="block text-[11px] font-black uppercase tracking-[0.25em] text-slate-300">
                {tally.grand ? "FULL GRID — GRAND!" : "Feature complete"}
              </span>
              <span className="mt-1 block drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)]">
                <CashMeter label="" value={tally.total} big />
              </span>
              <span className="mt-1 block text-xs font-bold text-slate-400">
                {tally.coins} coins collected · tap to continue
              </span>
            </span>
          </button>
        )}
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

const VS_THEMES: Record<string, { bg: string; frame: string;
  scene: import("./GameArt").SceneKind; stone?: boolean;
  char: import("./GameArt").CharKind }> = {
  golden7s: { bg: "from-[#241703] via-[#120b02] to-black", frame: "border-gold/40", scene: "vault", char: "cat" },
  aztec: { bg: "from-[#12300f] via-[#0a1a08] to-black", frame: "border-emerald-500/40", scene: "jungle", stone: true, char: "idol" },
  fruitblitz: { bg: "from-[#33063a] via-[#170318] to-black", frame: "border-fuchsia-500/40", scene: "candy", char: "cat" },
  reaper: { bg: "from-[#1c1030] via-[#0d0718] to-black", frame: "border-violet-500/40", scene: "graveyard", stone: true, char: "reaper" },
  neonnights: { bg: "from-[#04293a] via-[#02141d] to-black", frame: "border-cyan-400/40", scene: "city", char: "cat" },
  buffalo: { bg: "from-[#33200a] via-[#170e04] to-black", frame: "border-orange-500/40", scene: "prairie", stone: true, char: "buffalo" },
};

function VSCell({ sym, hot, dim, tier, stone }: {
  sym: string; hot: boolean; dim: boolean; tier: number; stone?: boolean;
}) {
  const spec = SYMBOL_GLYPH[sym] ?? { g: sym };
  const face = SymbolFace({ sym, stone });
  const premium = sym === "wild" || sym === "scatter";
  const inner = face ?? (
    <span className={`${premium ? "text-2xl sm:text-3xl [filter:drop-shadow(0_0_10px_rgba(196,165,255,0.95))]"
      : "text-2xl sm:text-3xl drop-shadow-[0_3px_3px_rgba(0,0,0,0.6)]"}`}>{spec.g}</span>
  );
  // the cell: a real inset machine window, not a flat icon plate. A dark
  // glass base, a rim-lit metal edge, top gloss, a floor shadow, and a
  // tier-tinted glow behind the symbol so premiums read hot.
  const glow = premium ? "rgba(240,180,41,0.28)"
    : tier <= 2 ? "rgba(245,158,11,0.20)"
    : tier <= 4 ? "rgba(56,189,248,0.15)"
    : "rgba(148,163,184,0.10)";
  const rim = premium ? "rgba(240,180,41,0.55)"
    : tier <= 2 ? "rgba(251,191,36,0.35)"
    : tier <= 4 ? "rgba(56,189,248,0.30)" : "rgba(255,255,255,0.12)";
  return (
    <div className={`relative grid aspect-square place-items-center overflow-hidden rounded-lg transition ${
      hot ? "win-cell" : dim ? "opacity-30" : ""}`}
      style={hot ? undefined : {
        background:
          `radial-gradient(circle at 50% 32%, ${glow}, transparent 70%),` +
          "linear-gradient(160deg, #1b2230 0%, #0c111b 55%, #05080e 100%)",
        boxShadow:
          `inset 0 1px 0 rgba(255,255,255,0.10), inset 0 0 0 1px ${rim},` +
          "inset 0 -8px 14px -8px rgba(0,0,0,0.9), 0 1px 2px rgba(0,0,0,0.5)",
      }}>
      {/* curved glass gloss on the top third */}
      <div className="pointer-events-none absolute inset-x-1 top-0.5 h-[40%] rounded-[40%] bg-[linear-gradient(180deg,rgba(255,255,255,0.16),transparent)] blur-[1px]" />
      {/* the flare that rings a winning symbol */}
      {hot && <div className="win-flare pointer-events-none absolute inset-0 rounded-lg" />}
      {/* symbol floats above the glass with a real drop shadow + soft light */}
      <div className={`${hot ? "win-pop " : ""}relative z-10 grid h-full w-full place-items-center ${
        premium ? "[filter:drop-shadow(0_2px_3px_rgba(0,0,0,0.7))_drop-shadow(0_0_8px_rgba(240,180,41,0.5))]"
          : "[filter:drop-shadow(0_3px_4px_rgba(0,0,0,0.75))]"}`}>
        {inner}
      </div>
    </div>
  );
}

/* the cabinet marquee: a ring of bulbs chasing around the reel frame, the
   way a real machine is lit. Bulbs sit in the frame gutter, never over the
   symbols, and pulse on a stagger so the light travels clockwise. */
function CabinetLights({ h = 9, v = 5 }: { h?: number; v?: number }) {
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i < h; i++) pts.push({ x: (i / (h - 1)) * 100, y: 0 });
  for (let i = 1; i < v - 1; i++) pts.push({ x: 100, y: (i / (v - 1)) * 100 });
  for (let i = h - 1; i >= 0; i--) pts.push({ x: (i / (h - 1)) * 100, y: 100 });
  for (let i = v - 2; i >= 1; i--) pts.push({ x: 0, y: (i / (v - 1)) * 100 });
  const total = pts.length;
  return (
    <div className="pointer-events-none absolute inset-[4px] z-20">
      {pts.map((p, i) => (
        <span key={i} className="cab-bulb"
          style={{ left: `${p.x}%`, top: `${p.y}%`,
                   animationDelay: `${((i / total) * 1.5).toFixed(2)}s` }} />
      ))}
    </div>
  );
}

/* one physical reel: a spinning strip behind a 3-row window, then the
   staggered slam-stop with overshoot — the Hacksaw feel */
function VSReel({ reel, col, spinning, justStopped, symbols, hotCells, hotLine,
                  stone }: {
  reel: number; col: string[]; spinning: boolean; justStopped: boolean;
  symbols: string[]; hotCells: Set<string>; hotLine: number | null;
  stone?: boolean;
}) {
  // spin -> land (the finals roll down into the window and settle) -> idle
  const [phase, setPhase] = useState<"idle" | "spin" | "land">("idle");
  useEffect(() => {
    if (spinning) setPhase("spin");
    else setPhase((p) => (p === "spin" ? "land" : p));
  }, [spinning]);

  // a fixed pseudo-random strip per reel so the blur reads as real symbols
  const strip = Array.from({ length: 9 }, (_, j) =>
    symbols[(reel * 5 + j * 3 + 1) % symbols.length]);
  const shade = (
    <>
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-1/4 bg-gradient-to-b from-black/60 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-1/4 bg-gradient-to-t from-black/60 to-transparent" />
    </>
  );
  if (phase === "spin") {
    return (
      <div className="relative overflow-hidden rounded-lg">
        <div className="relative" style={{ aspectRatio: "1 / 3.18" }}>
          <div className="vs-strip absolute inset-x-0 blur-[2px]">
            {[...strip, ...strip].map((s, j) => (
              <div key={j} className="mb-1.5 w-full">
                <VSCell sym={s} tier={symbols.indexOf(s)} hot={false} dim={false}
                  stone={stone} />
              </div>
            ))}
          </div>
          {shade}
        </div>
      </div>
    );
  }
  if (phase === "land") {
    // 8-item strip, finals on top: rolls from the fillers down onto the finals
    return (
      <div className="relative overflow-hidden rounded-lg">
        <div className="relative" style={{ aspectRatio: "1 / 3.18" }}>
          <div className="vs-land absolute inset-x-0"
            onAnimationEnd={() => setPhase("idle")}>
            {[...col, ...strip.slice(0, 5)].map((s, j) => (
              <div key={j} className="mb-1.5 w-full">
                <VSCell sym={s} tier={symbols.indexOf(s)} hot={false} dim={false}
                  stone={stone} />
              </div>
            ))}
          </div>
          {shade}
        </div>
      </div>
    );
  }
  return (
    <div className="relative overflow-hidden rounded-lg">
      <div className={`grid gap-1.5${justStopped ? " vs-seat" : ""}`}>
        {col.map((sym, row) => (
          <VSCell key={row} sym={sym} tier={symbols.indexOf(sym)}
            hot={hotCells.has(`${reel}-${row}`)}
            dim={hotLine !== null && !hotCells.has(`${reel}-${row}`)}
            stone={stone} />
        ))}
      </div>
    </div>
  );
}

// per-line denominations, the way the floor prices a spin: 5c a line and up
const DENOMS = [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 25, 50];

function VideoSlot({ def, onBalance, onPlayed }: {
  def: { key: string; name: string; rules: string; vslot?: import("../api").VSlotDef };
  onBalance: (b: string) => void; onPlayed: () => void;
}) {
  const vs = def.vslot!;
  const [denom, setDenom] = useState(0.5);      // per line
  const [lines, setLines] = useState(20);
  const stake = String(Math.round(denom * lines * 100) / 100);
  const [grid, setGrid] = useState<string[][]>(
    Array.from({ length: 5 }, (_, i) => [0, 1, 2].map((r) => vs.symbols[(i + r + 2) % vs.symbols.length])));
  const [live, setLive] = useState<boolean[]>([false, false, false, false, false]);
  const [stopped, setStopped] = useState<boolean[]>([false, false, false, false, false]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [wins, setWins] = useState<{ line: number; symbol: string; count: number; pay: string }[]>([]);
  const [hotLine, setHotLine] = useState<number | null>(null);
  const [lastWin, setLastWin] = useState<string | null>(null);
  const [freeLeft, setFreeLeft] = useState(0);
  const [bonusTotal, setBonusTotal] = useState("0");
  const [banner, setBanner] = useState<string | null>(null);
  const [showPays, setShowPays] = useState(false);
  // the machine deck: turbo, autoplay, scatter anticipation, win presentation
  const [turbo, setTurbo] = useState(false);
  const [auto, setAuto] = useState(0);
  const [autoMenu, setAutoMenu] = useState(false);
  const [anticipate, setAnticipate] = useState(false);
  const [bigWin, setBigWin] = useState<{ amount: string; tier: string } | null>(null);
  const autoRef = useRef(0);
  useEffect(() => { autoRef.current = auto; }, [auto]);
  const turboRef = useRef(false);
  useEffect(() => { turboRef.current = turbo; }, [turbo]);
  const spinRef = useRef<() => void>(() => {});
  const aliveRef = useRef(true);
  useEffect(() => { aliveRef.current = true; return () => { aliveRef.current = false; }; }, []);

  useEffect(() => {
    api.vslotActive().then((r) => {
      if (r.active && `vslot:${r.active.machine}` === def.key) {
        setFreeLeft(r.active.free_spins_left);
        setBonusTotal(r.active.bonus_total);
        setDenom(Number(r.active.stake) / 20);
        setLines(20);
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
    if (!aliveRef.current) return;
    setErr(""); setBusy(true); setWins([]); setLastWin(null); setBanner(null);
    setBigWin(null); setAnticipate(false);
    setStopped([false, false, false, false, false]);
    setLive([true, true, true, true, true]);
    sfx.spin();
    try {
      const wasFree = freeLeft > 0;
      const r = await api.vslotSpin(vs.machine, stake, lines);
      const fast = turboRef.current;
      const base = fast ? 160 : 550;
      const step = fast ? 90 : 300;
      // two scatters in the first four reels: the last reel sweats
      const early = r.grid.slice(0, 4).flat()
        .filter((s: string) => s === "scatter").length;
      const sweat = !fast && early >= vs.free_spins.trigger - 1;
      const extra = sweat ? 1200 : 0;
      [0, 1, 2, 3, 4].forEach((i) => window.setTimeout(() => {
        if (!aliveRef.current) return;
        setGrid((g) => {
          const n = g.map((col) => [...col]);
          n[i] = r.grid[i];
          return n;
        });
        setLive((l) => { const n = [...l]; n[i] = false; return n; });
        setStopped((s) => { const n = [...s]; n[i] = true; return n; });
        sfx.land();
        if (i === 3 && sweat) { setAnticipate(true); sfx.riser(); }
        if (i === 4) {
          sfx.reelsStop();
          setAnticipate(false);
          setWins(r.line_wins);
          setFreeLeft(r.free_spins_left);
          setBonusTotal(r.bonus_total);
          const gotBonus = !wasFree && r.free_spins_left > 0;
          const winMult = Number(r.win) / Math.max(0.01, Number(stake));
          if (Number(r.win) > 0) {
            setLastWin(r.win);
            if (winMult >= 15) {
              setBigWin({ amount: r.win,
                tier: winMult >= 100 ? "EPIC WIN" : winMult >= 40 ? "MEGA WIN" : "BIG WIN" });
              sfx.bigwin();
            } else { sfx.win(); }
          }
          if (gotBonus) {
            setBanner(`${r.free_spins_left} FREE SPINS — all wins ${vs.free_spins.mult}×`);
            setAuto(0);                       // bonus pauses autoplay
          } else if (wasFree && r.free_spins_left === 0) {
            setBanner(`Bonus complete — ${money(r.bonus_total)}`);
          }
          onBalance(r.balance);
          onPlayed();
          setBusy(false);
          // the machine keeps itself running, exactly like the floor:
          // free spins chain on their own, autoplay burns its count down
          const bigPause = winMult >= 15 ? 2400 : 0;
          if (r.free_spins_left > 0) {
            window.setTimeout(() => {
              if (aliveRef.current) spinRef.current();
            }, (fast ? 550 : 1000) + bigPause);
          } else if (autoRef.current > 0 && !gotBonus) {
            setAuto((a) => Math.max(0, a - 1));
            window.setTimeout(() => {
              if (aliveRef.current && autoRef.current > 0) spinRef.current();
            }, (fast ? 350 : 800) + bigPause);
          }
        }
      }, base + i * step + (i === 4 ? extra : 0)));
    } catch (e: any) {
      setLive([false, false, false, false, false]);
      setAuto(0);
      setErr(e.message); setBusy(false);
    }
  }
  spinRef.current = doSpin;

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
          <GameLogo k={def.key} />
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

        <div className={`relative overflow-hidden rounded-xl border bg-gradient-to-b p-3 pt-8 ${
          (VS_THEMES[vs.machine] ?? VS_THEMES.golden7s).frame} ${
          (VS_THEMES[vs.machine] ?? VS_THEMES.golden7s).bg}`}>
          {/* the world behind the reels, dimmed so it reads as a backdrop and
              never as a glare over the symbols */}
          <SlotScene kind={(VS_THEMES[vs.machine] ?? VS_THEMES.golden7s).scene} />
          <div className="pointer-events-none absolute inset-0 bg-black/45" />
          <CabinetLights />
          {/* the house mascot comes out for the whole bonus */}
          {freeLeft > 0 && (
            <BonusCharacter kind={(VS_THEMES[vs.machine] ?? VS_THEMES.golden7s).char}
              casting={busy} />
          )}
          {/* the reel bank, behind glass — gold-lit while the bonus runs */}
          <div className={`relative z-10 rounded-lg bg-black/30 p-1.5 shadow-[inset_0_2px_12px_rgba(0,0,0,0.7)] ${
            freeLeft > 0 ? "ring-2 ring-gold/50 shadow-gold" : ""}`}>
            <div className="grid grid-cols-5 gap-1.5">
              {grid.map((col, reel) => (
                <div key={reel}
                  className={reel === 4 && anticipate ? "vs-hot rounded-lg" : undefined}>
                  <VSReel reel={reel} col={col} spinning={live[reel]}
                    justStopped={stopped[reel]} symbols={vs.symbols}
                    hotCells={hotCells} hotLine={hotLine}
                    stone={(VS_THEMES[vs.machine] ?? VS_THEMES.golden7s).stone} />
                </div>
              ))}
            </div>
            {/* the winning line traced bright across the cells */}
            {hotLine !== null && (() => {
              const w = wins.find((x) => x.line === hotLine);
              const shape = VS_LINES[hotLine];
              if (!w || !shape) return null;
              const pts = Array.from({ length: w.count }, (_, reel) => {
                const x = (reel + 0.5) / 5 * 100;
                const y = (shape[reel] + 0.5) / 3 * 100;
                return `${x},${y}`;
              }).join(" ");
              return (
                <svg viewBox="0 0 100 100" preserveAspectRatio="none"
                  className="pointer-events-none absolute inset-1.5 z-20 h-[calc(100%-12px)] w-[calc(100%-12px)]">
                  <polyline points={pts} fill="none" stroke="rgba(0,0,0,0.5)"
                    strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                  <polyline points={pts} fill="none" stroke="#ffe8a3"
                    strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"
                    className="win-line-trace" />
                </svg>
              );
            })()}
          </div>
          <div className="relative z-10 mt-2 flex h-6 items-center justify-center text-sm font-bold">
            {busy ? <span className="text-slate-500">…</span>
              : lastWin ? <CashMeter label="WIN" value={lastWin} big />
              : wins.length === 0 && <span className="text-[11px] font-medium text-slate-400 drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">{lines} line{lines > 1 ? "s" : ""} · {vs.free_spins.trigger}+ scatters = {vs.free_spins.count} free spins</span>}
          </div>
          {bigWin && (
            <BigWinOverlay amount={bigWin.amount} tier={bigWin.tier}
              onDone={() => setBigWin(null)} />
          )}
        </div>

        {/* the machine deck: bet stepper · win meter · turbo · auto · spin */}
        <div className="mt-3 flex items-stretch gap-2">
          <div className="flex items-center gap-1 rounded-xl border border-white/10 bg-base-900/70 px-1.5 py-1.5">
            <button onClick={() => setDenom((d) => DENOMS[Math.max(0, DENOMS.indexOf(d) - 1)])}
              disabled={busy || freeLeft > 0}
              className="grid h-8 w-7 place-items-center rounded-lg bg-base-700 text-base font-black text-slate-200 hover:bg-base-600 disabled:opacity-40">−</button>
            <div className="w-14 text-center">
              <div className="text-[9px] font-bold uppercase tracking-wider text-slate-500">Per line</div>
              <div className="font-mono text-sm font-bold text-accent">
                {denom < 1 ? `${Math.round(denom * 100)}¢` : money(denom)}
              </div>
            </div>
            <button onClick={() => setDenom((d) => DENOMS[Math.min(DENOMS.length - 1, DENOMS.indexOf(d) + 1)])}
              disabled={busy || freeLeft > 0}
              className="grid h-8 w-7 place-items-center rounded-lg bg-base-700 text-base font-black text-slate-200 hover:bg-base-600 disabled:opacity-40">+</button>
          </div>
          <div className="flex items-center gap-1 rounded-xl border border-white/10 bg-base-900/70 px-1.5 py-1.5">
            <button onClick={() => setLines((l) => Math.max(1, l - 1))}
              disabled={busy || freeLeft > 0}
              className="grid h-8 w-7 place-items-center rounded-lg bg-base-700 text-base font-black text-slate-200 hover:bg-base-600 disabled:opacity-40">−</button>
            <div className="w-11 text-center">
              <div className="text-[9px] font-bold uppercase tracking-wider text-slate-500">Lines</div>
              <div className="font-mono text-sm font-bold text-slate-100">{lines}</div>
            </div>
            <button onClick={() => setLines((l) => Math.min(20, l + 1))}
              disabled={busy || freeLeft > 0}
              className="grid h-8 w-7 place-items-center rounded-lg bg-base-700 text-base font-black text-slate-200 hover:bg-base-600 disabled:opacity-40">+</button>
          </div>
          <div className="grid place-items-center rounded-xl border border-white/10 bg-base-900/70 px-2.5">
            <div className="text-[9px] font-bold uppercase tracking-wider text-slate-500">Total</div>
            <div className="font-mono text-sm font-bold text-slate-100">{money(Number(stake))}</div>
          </div>

          {freeLeft === 0 && (vs as any).buy_cost && (
            <button onClick={buyBonus} disabled={busy}
              className="rounded-xl border border-fuchsia-400/50 bg-fuchsia-500/15 px-2.5 text-[10px] font-black uppercase leading-tight tracking-wide text-fuchsia-300 hover:bg-fuchsia-500/25 disabled:opacity-50">
              Buy<br />Bonus<br />
              <span className="font-mono">{money((Number(stake) || 0) * Number((vs as any).buy_cost))}</span>
            </button>
          )}

          <button onClick={() => setTurbo(!turbo)}
            className={`rounded-xl border px-3 text-lg transition ${
              turbo ? "border-gold bg-gold/20 text-gold shadow-gold"
                : "border-white/10 bg-base-900/70 text-slate-500 hover:text-slate-300"}`}
            title="Turbo — instant reel stops">⚡</button>

          <div className="relative">
            {auto > 0 ? (
              <button onClick={() => setAuto(0)}
                className="h-full rounded-xl border border-red-400/50 bg-red-500/15 px-3 text-[10px] font-black uppercase leading-tight text-red-300 hover:bg-red-500/25">
                Stop<br /><span className="font-mono text-xs">{auto}</span>
              </button>
            ) : (
              <button onClick={() => setAutoMenu(!autoMenu)} disabled={busy || freeLeft > 0}
                className="h-full rounded-xl border border-white/10 bg-base-900/70 px-3 text-[10px] font-black uppercase text-slate-400 hover:text-slate-200 disabled:opacity-40">
                Auto
              </button>
            )}
            {autoMenu && auto === 0 && (
              <div className="absolute bottom-full left-0 z-20 mb-1 flex gap-1 rounded-xl border border-white/10 bg-base-800 p-1 shadow-pop">
                {[10, 25, 50, 100].map((n) => (
                  <button key={n}
                    onClick={() => { setAutoMenu(false); setAuto(n - 1); doSpin(); }}
                    className="rounded-lg bg-base-700 px-2.5 py-1.5 font-mono text-xs font-bold text-slate-200 hover:btn-gold hover:text-base-900">
                    {n}
                  </button>
                ))}
              </div>
            )}
          </div>

          <button onClick={doSpin} disabled={busy}
            className="btn-gold ml-auto grid h-16 w-16 shrink-0 place-items-center self-center rounded-full text-base-900 disabled:opacity-50"
            title={freeLeft > 0 ? `Free spins: ${freeLeft} left` : "Spin"}>
            {freeLeft > 0 ? (
              <span className="text-sm font-black">{freeLeft}</span>
            ) : (
              <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none"
                stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
                <path d="M20 12a8 8 0 1 1-2.34-5.66" />
                <path d="M20 3v4h-4" />
              </svg>
            )}
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

/* ------------------------------------------------------------ Grand Heist --
   The flagship: base-game multiplier wilds, and a vault bonus where wilds
   LOCK with printed multipliers and line wins multiply by the sum of the
   stickies they cross. */
function GrandHeist({ def, onBalance, onPlayed }: {
  def: import("../api").HeistDef; onBalance: (b: string) => void;
  onPlayed: () => void;
}) {
  const [stake, setStake] = useState("10");
  const [grid, setGrid] = useState<string[][]>(
    Array.from({ length: 5 }, (_, i) => [0, 1, 2].map((r) => def.symbols[(i + r + 2) % def.symbols.length])));
  const [live, setLive] = useState<boolean[]>([false, false, false, false, false]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [wins, setWins] = useState<import("../api").HeistSpinRes["line_wins"]>([]);
  const [hotLine, setHotLine] = useState<number | null>(null);
  const [lastWin, setLastWin] = useState<string | null>(null);
  const [stickies, setStickies] = useState<Record<string, number>>({});
  const [spinsLeft, setSpinsLeft] = useState(0);
  const [inBonus, setInBonus] = useState(false);
  const [total, setTotal] = useState("0");
  const [banner, setBanner] = useState<string | null>(null);
  const [bigWin, setBigWin] = useState<{ amount: string; tier: string } | null>(null);
  const [turbo, setTurbo] = useState(false);
  const [showPays, setShowPays] = useState(false);
  const turboRef = useRef(false);
  useEffect(() => { turboRef.current = turbo; }, [turbo]);
  const spinRef = useRef<() => void>(() => {});
  const aliveRef = useRef(true);
  useEffect(() => { aliveRef.current = true; return () => { aliveRef.current = false; }; }, []);

  useEffect(() => {
    api.heistActive().then((r) => {
      if (r.active) {
        setInBonus(true);
        setSpinsLeft(r.active.spins_left);
        setStickies(r.active.stickies);
        setTotal(r.active.total);
        setStake(String(Number(r.active.stake)));
      }
    }).catch(() => {});
  }, []);

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

  async function doSpin() {
    if (!aliveRef.current || busy) return;
    setErr(""); setBusy(true); setWins([]); setLastWin(null);
    setBanner(null); setBigWin(null);
    setLive([true, true, true, true, true]);
    sfx.spin();
    try {
      const r = await api.heistSpin(stake);
      const fast = turboRef.current;
      const base = fast ? 160 : 500;
      const step = fast ? 80 : 260;
      [0, 1, 2, 3, 4].forEach((i) => window.setTimeout(() => {
        if (!aliveRef.current) return;
        setGrid((g) => { const n = g.map((c) => [...c]); n[i] = r.grid[i]; return n; });
        setLive((l) => { const n = [...l]; n[i] = false; return n; });
        sfx.land();
        if (i === 4) {
          sfx.reelsStop();
          setWins(r.line_wins);
          setStickies(r.stickies);
          setSpinsLeft(r.spins_left);
          setTotal(r.total);
          const winMult = Number(r.win) / Math.max(0.01, Number(stake));
          if (Number(r.win) > 0) {
            setLastWin(r.win);
            if (winMult >= 15) {
              setBigWin({ amount: r.win,
                tier: winMult >= 100 ? "EPIC WIN" : winMult >= 40 ? "MEGA WIN" : "BIG WIN" });
              sfx.bigwin();
            } else { sfx.win(); }
          }
          if (r.triggered) {
            setInBonus(true);
            setBanner(`VAULT OPEN — ${def.spins} FREE SPINS, WILDS LOCK`);
            sfx.bigwin();
          }
          if (r.bonus && r.done) {
            setInBonus(false);
            setStickies({});
            setBanner(r.capped
              ? `MAX WIN — ${money(r.total)} (${def.max_win}× cap)`
              : `Vault cleared — ${money(r.total)}`);
          }
          onBalance(r.balance);
          onPlayed();
          setBusy(false);
          const pause = winMult >= 15 ? 2600 : 0;
          if ((r.bonus && !r.done) || r.triggered) {
            window.setTimeout(() => {
              if (aliveRef.current) spinRef.current();
            }, (fast ? 550 : r.triggered ? 1500 : 950) + pause);
          }
        }
      }, base + i * step));
    } catch (e: any) {
      setLive([false, false, false, false, false]);
      setErr(e.message); setBusy(false);
    }
  }
  spinRef.current = doSpin;

  async function buy(tier: "bonus" | "super") {
    if (busy) return;
    setErr(""); setBusy(true); setBanner(null);
    try {
      const r = await api.heistBuy(stake, tier);
      onBalance(r.balance);
      setInBonus(true);
      setSpinsLeft(r.spins_left);
      setStickies(r.stickies);
      setTotal("0");
      setBanner(tier === "super"
        ? "SUPER VAULT — a hot wild is already locked"
        : `VAULT OPEN — ${def.spins} FREE SPINS`);
      setBusy(false);
      window.setTimeout(() => { if (aliveRef.current) spinRef.current(); }, 1200);
    } catch (e: any) { setErr(e.message); setBusy(false); }
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
          <GameLogo k="heist" />
          <button onClick={() => setShowPays(!showPays)}
            className="text-[10px] font-bold text-sky-400 hover:text-sky-300">
            {showPays ? "Hide pays" : "Paytable"}
          </button>
        </div>

        {inBonus && (
          <div className="mb-2 flex items-center justify-between rounded-lg border border-gold/40 bg-gold/10 px-3 py-1.5 text-xs font-bold text-gold">
            <span>VAULT BONUS · {spinsLeft} spins left · wilds lock</span>
            <CashMeter label="" value={total} />
          </div>
        )}
        {banner && (
          <div className="mb-2 animate-pulse rounded-lg border border-gold/50 bg-gold/15 px-3 py-2 text-center text-sm font-black text-gold">
            {banner}
          </div>
        )}

        <div className="relative overflow-hidden rounded-xl border border-gold/40 bg-gradient-to-b from-[#1c1406] via-[#0d0902] to-black p-3 pt-14">
          <SlotScene kind="vault" />
          <CabinetLights />
          <div className="relative z-10 rounded-lg bg-black/30 p-1.5 shadow-[inset_0_2px_12px_rgba(0,0,0,0.7)]">
            <div className="grid grid-cols-5 gap-1.5">
              {grid.map((col, reel) => (
                <VSReel key={reel} reel={reel} col={col} spinning={live[reel]}
                  justStopped={false} symbols={def.symbols}
                  hotCells={hotCells} hotLine={hotLine} />
              ))}
            </div>
            {/* sticky multiplier chips pinned over the glass */}
            <div className="pointer-events-none absolute inset-1.5 z-20 grid grid-cols-5 gap-1.5">
              {[0, 1, 2, 3, 4].map((reel) => (
                <div key={reel} className="grid gap-1.5">
                  {[0, 1, 2].map((row) => {
                    const m = stickies[String(reel * 3 + row)];
                    return (
                      <div key={row} className="relative aspect-square">
                        {m !== undefined && (
                          <span className="absolute bottom-0.5 right-0.5 rounded-md bg-gradient-to-b from-yellow-200 via-gold to-amber-700 px-1 py-0.5 font-mono text-[10px] font-black text-base-900 shadow-[0_1px_4px_rgba(0,0,0,0.7)] ring-1 ring-yellow-100/70">
                            ×{m}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
          <div className="relative z-10 mt-2 flex h-6 items-center justify-center text-sm font-bold">
            {busy ? <span className="text-slate-500">…</span>
              : lastWin ? <CashMeter label="WIN" value={lastWin} big />
              : wins.length === 0 && (
                <span className="text-[11px] font-medium text-slate-400 drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
                  wild multipliers every spin · {def.trigger} scatters open the vault · win up to {money(def.max_win)}×
                </span>
              )}
          </div>
          {bigWin && (
            <BigWinOverlay amount={bigWin.amount} tier={bigWin.tier}
              onDone={() => setBigWin(null)} />
          )}
        </div>

        <div className="mt-3 flex items-stretch gap-2">
          <div className="flex items-center gap-1 rounded-xl border border-white/10 bg-base-900/70 px-2 py-1.5">
            <button onClick={() => setStake(String(stepBet(Number(stake) || 1, -1)))}
              disabled={busy || inBonus}
              className="grid h-8 w-8 place-items-center rounded-lg bg-base-700 text-base font-black text-slate-200 hover:bg-base-600 disabled:opacity-40">−</button>
            <div className="w-16 text-center">
              <div className="text-[9px] font-bold uppercase tracking-wider text-slate-500">Bet</div>
              <div className="font-mono text-sm font-bold text-slate-100">{money(Number(stake) || 0)}</div>
            </div>
            <button onClick={() => setStake(String(stepBet(Number(stake) || 1, 1)))}
              disabled={busy || inBonus}
              className="grid h-8 w-8 place-items-center rounded-lg bg-base-700 text-base font-black text-slate-200 hover:bg-base-600 disabled:opacity-40">+</button>
          </div>

          {!inBonus && (
            <>
              <button onClick={() => buy("bonus")} disabled={busy}
                className="rounded-xl border border-fuchsia-400/50 bg-fuchsia-500/15 px-2.5 text-[10px] font-black uppercase leading-tight tracking-wide text-fuchsia-300 hover:bg-fuchsia-500/25 disabled:opacity-50">
                Buy<br />Bonus<br />
                <span className="font-mono">{money((Number(stake) || 0) * def.buy_cost)}</span>
              </button>
              <button onClick={() => buy("super")} disabled={busy}
                className="rounded-xl border border-gold/60 bg-gold/15 px-2.5 text-[10px] font-black uppercase leading-tight tracking-wide text-gold hover:bg-gold/25 disabled:opacity-50">
                Super<br />Vault<br />
                <span className="font-mono">{money((Number(stake) || 0) * def.super_cost)}</span>
              </button>
            </>
          )}

          <button onClick={() => setTurbo(!turbo)}
            className={`rounded-xl border px-3 text-lg transition ${
              turbo ? "border-gold bg-gold/20 text-gold shadow-gold"
                : "border-white/10 bg-base-900/70 text-slate-500 hover:text-slate-300"}`}
            title="Turbo — instant reel stops">⚡</button>

          <button onClick={doSpin} disabled={busy || (inBonus && busy)}
            className="btn-gold ml-auto grid h-16 w-16 shrink-0 place-items-center self-center rounded-full text-base-900 disabled:opacity-50"
            title={inBonus ? `Bonus: ${spinsLeft} spins left` : "Spin"}>
            {inBonus ? (
              <span className="text-sm font-black">{spinsLeft}</span>
            ) : (
              <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none"
                stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
                <path d="M20 12a8 8 0 1 1-2.34-5.66" />
                <path d="M20 3v4h-4" />
              </svg>
            )}
          </button>
        </div>
        {err && <p className="mt-2 text-xs text-red-300">{err}</p>}
      </div>

      {showPays && (
        <div className="rounded-xl border border-white/5 bg-base-800 shadow-card p-4">
          <h4 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-400">
            Pays per line bet (bet ÷ {def.lines})
          </h4>
          <div className="space-y-1">
            {Object.entries(def.pays).map(([sym, table]) => (
              <div key={sym} className="flex items-center justify-between rounded-lg bg-base-900/50 px-3 py-1.5 text-xs">
                <span className="flex items-center gap-2"><VSCellMini sym={sym} /></span>
                <span className="font-mono text-slate-300">
                  {["3", "4", "5"].map((n) => table[n] ? `${n}× = ${table[n]}` : "").filter(Boolean).join(" · ")}
                </span>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[10px] text-slate-500">
            Every wild carries a multiplier ({def.base_mults.join("/")}× in the base
            game). {def.trigger} scatters open the vault: {def.spins} free spins where
            wilds LOCK with a multiplier up to {Math.max(...def.mults)}× and a line win
            is multiplied by the SUM of the locked wilds it crosses. Bonus wins cap
            at {money(def.max_win)}× the bet.
          </p>
        </div>
      )}
    </div>
  );
}

// the classic denomination ladder every floor machine steps through
const BET_LADDER = [0.25, 0.5, 1, 2, 5, 10, 25, 50, 100, 250, 500, 1000];

function stepBet(cur: number, dir: 1 | -1): number {
  if (dir === 1) return BET_LADDER.find((v) => v > cur) ?? BET_LADDER[BET_LADDER.length - 1];
  return [...BET_LADDER].reverse().find((v) => v < cur) ?? BET_LADDER[0];
}

/** number that rolls up to its target like a win meter */
function useCountUp(value: number, ms = 900): number {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (value <= 0) { setV(0); return; }
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const f = Math.min(1, (t - t0) / ms);
      setV(value * (1 - Math.pow(1 - f, 3)));
      if (f < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, ms]);
  return v;
}

function CashMeter({ label, value, big = false }: {
  label: string; value: string; big?: boolean;
}) {
  const v = useCountUp(Number(value), big ? 900 : 500);
  return (
    <span className={`font-mono font-black tracking-tight text-accent ${
      big ? "text-base" : "text-xs"}`}>
      {label} {money(v)}
    </span>
  );
}

/** the floor moment: BIG/MEGA/EPIC WIN over the reels, cash rolling up,
    gold raining — click anywhere to skip */
function BigWinOverlay({ amount, tier, onDone }: {
  amount: string; tier: string; onDone: () => void;
}) {
  const v = useCountUp(Number(amount), 1600);
  useEffect(() => {
    const t = window.setTimeout(onDone, 3200);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const coins = useMemo(() =>
    Array.from({ length: 22 }, (_, i) => ({
      left: (i * 37 + 11) % 100,
      delay: ((i * 53) % 140) / 100,
      dur: 1.5 + ((i * 29) % 90) / 100,
      size: 10 + ((i * 17) % 12),
    })), []);
  return (
    <button onClick={onDone}
      className="absolute inset-0 z-30 grid cursor-pointer place-items-center overflow-hidden rounded-xl bg-black/70 backdrop-blur-[2px]">
      {coins.map((c, i) => (
        <span key={i} className="coin-rain absolute top-[-24px] rounded-full bg-gradient-to-b from-yellow-200 via-gold to-amber-700 ring-1 ring-yellow-100/70"
          style={{ left: `${c.left}%`, width: c.size, height: c.size,
                   animationDelay: `${c.delay}s`, animationDuration: `${c.dur}s` }} />
      ))}
      <span className="bigwin-pop text-center">
        <span className={`block bg-gradient-to-b from-yellow-100 via-gold to-amber-600 bg-clip-text text-4xl font-black tracking-tight text-transparent drop-shadow-[0_4px_10px_rgba(0,0,0,0.8)] ${
          tier === "EPIC WIN" ? "sm:text-6xl" : "sm:text-5xl"}`}>
          {tier}
        </span>
        <span className="mt-1 block font-mono text-2xl font-black text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)] sm:text-3xl">
          {money(v)}
        </span>
      </span>
    </button>
  );
}

function VSCellMini({ sym }: { sym: string }) {
  const spec = SYMBOL_GLYPH[sym] ?? { g: sym };
  const face = SymbolFace({ sym });
  if (face) return <span className="grid h-7 w-7 place-items-center">{face}</span>;
  if (sym === "wild") return <span className="rounded btn-gold px-1.5 text-[10px] font-black text-base-900">WILD</span>;
  if (spec.cls === "slot-bar") return <span className="rounded btn-gold px-1.5 text-[10px] font-black text-base-900">BAR</span>;
  if (spec.cls === "slot-gold") return <span className="text-base font-black text-gold">{spec.g}</span>;
  return <span className="text-base">{spec.g}</span>;
}

// -------------------------------------------------------------- roulette ----
const RL_RED = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);

// pocket order around a real European wheel, clockwise from the zero
const RL_ORDER = [0,32,15,19,4,21,2,25,17,34,6,27,13,36,11,30,8,23,10,5,24,
                  16,33,1,20,14,31,9,22,18,29,7,28,12,35,3,26];
const RL_SEG = 360 / 37;

function RouletteWheelSVG() {
  const wedges = RL_ORDER.map((n, i) => {
    const a0 = -RL_SEG / 2, a1 = RL_SEG / 2;
    const rad = (d: number) => (d - 90) * (Math.PI / 180);
    const x0 = 100 + 92 * Math.cos(rad(a0)), y0 = 100 + 92 * Math.sin(rad(a0));
    const x1 = 100 + 92 * Math.cos(rad(a1)), y1 = 100 + 92 * Math.sin(rad(a1));
    const fill = n === 0 ? "#15803d" : RL_RED.has(n) ? "#b91c1c" : "#111827";
    return (
      <g key={n} transform={`rotate(${i * RL_SEG} 100 100)`}>
        <path d={`M100 100 L${x0} ${y0} A92 92 0 0 1 ${x1} ${y1} Z`}
          fill={fill} stroke="#0b0e14" strokeWidth="0.6" />
        <text x="100" y="17" fontSize="7.5" fontWeight="700" textAnchor="middle"
          fill="#f8fafc" fontFamily="Arial, sans-serif">{n}</text>
      </g>
    );
  });
  return (
    <svg viewBox="0 0 200 200" className="h-full w-full">
      <circle cx="100" cy="100" r="99" fill="#3f2c10" />
      <circle cx="100" cy="100" r="96" fill="none" stroke="#f0b429" strokeWidth="2.5" />
      {wedges}
      <circle cx="100" cy="100" r="58" fill="#1c1917" stroke="#f0b429" strokeWidth="1.5" />
      <circle cx="100" cy="100" r="50" fill="#292524" />
      {/* turret */}
      <circle cx="100" cy="100" r="9" fill="#f0b429" />
      <circle cx="100" cy="100" r="4" fill="#7c5806" />
      {[0, 90, 180, 270].map((a) => (
        <rect key={a} x="97.5" y="58" width="5" height="20" rx="2.5" fill="#f0b429"
          transform={`rotate(${a} 100 100)`} />
      ))}
    </svg>
  );
}

function Roulette({ onBalance, onPlayed }: {
  onBalance: (b: string) => void; onPlayed: () => void;
}) {
  const [chip, setChip] = useState(5);
  const [placed, setPlaced] = useState<Map<string, number>>(new Map());
  const [history, setHistory] = useState<[string, number][]>([]);
  const [lastBets, setLastBets] = useState<Map<string, number> | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [last, setLast] = useState<{ pocket: number; color: string; payout: string } | null>(null);
  const [wheelRot, setWheelRot] = useState(0);
  const [ballRot, setBallRot] = useState(0);
  const [ballDropped, setBallDropped] = useState(false);
  const [rolling, setRolling] = useState(false);
  // racetrack mode: tapping a number bets it AND its two wheel neighbors
  // on each side — five straight-up chips in one tap
  const [neighbors, setNeighbors] = useState(false);
  const [spins, setSpins] = useState<{ n: number; color: string }[]>([]);

  // spot keys: "s:17" straight, "red"/"black"/"even"/"odd"/"low"/"high",
  // "d:0..2" dozens, "c:0..2" columns — chips stack on the felt
  const place = (key: string) => {
    if (busy) return;
    setErr("");
    const keys = (neighbors && key.startsWith("s:"))
      ? (() => {
          const i = RL_ORDER.indexOf(Number(key.slice(2)));
          return [-2, -1, 0, 1, 2].map((off) =>
            `s:${RL_ORDER[(i + off + RL_ORDER.length) % RL_ORDER.length]}`);
        })()
      : [key];
    const fresh = keys.filter((k) => !placed.has(k)).length;
    if (placed.size + fresh > 15) { setErr("15 spots max per spin"); return; }
    sfx.chip();
    const n = new Map(placed);
    const h = [...history];
    for (const k of keys) {
      n.set(k, (n.get(k) ?? 0) + chip);
      h.push([k, chip]);
    }
    setPlaced(n);
    setHistory(h);
  };
  const undo = () => {
    const h = [...history];
    const lastMove = h.pop();
    if (!lastMove) return;
    const [key, amt] = lastMove;
    const n = new Map(placed);
    const v = (n.get(key) ?? 0) - amt;
    if (v <= 0) n.delete(key); else n.set(key, v);
    setPlaced(n); setHistory(h);
  };
  const clearAll = () => { setPlaced(new Map()); setHistory([]); };
  const total = [...placed.values()].reduce((a, v) => a + v, 0);

  const toBets = (m: Map<string, number>) =>
    [...m.entries()].map(([key, amt]) => {
      const [k, p] = key.split(":");
      // inside "line" bets carry their numbers: sp=split, co=corner, st=street, ln=six-line
      if (k === "sp" || k === "co" || k === "st" || k === "ln") {
        const kind = k === "sp" ? "split" : k === "co" ? "corner"
          : k === "st" ? "street" : "line";
        return { kind, pick: null, picks: p.split("-").map(Number), stake: String(amt) };
      }
      const kind = k === "s" ? "straight" : k === "d" ? "dozen" : k === "c" ? "column" : k;
      return { kind, pick: p !== undefined ? Number(p) : null, stake: String(amt) };
    });

  async function spin() {
    setErr(""); setBusy(true); setLast(null); setBallDropped(false);
    try {
      const r = await api.rouletteSpin(toBets(placed));
      setLastBets(new Map(placed));
      // the wheel turns clockwise, the ball whips the other way; both
      // decelerate so the winning pocket meets the ball at 12 o'clock
      const idx = RL_ORDER.indexOf(r.pocket);
      const pocketAngle = idx * RL_SEG;
      setRolling(true);
      setWheelRot((w) => {
        const settle = (360 - pocketAngle - ((w % 360) + 360) % 360 + 720) % 360;
        return w + 4 * 360 + settle;
      });
      setBallRot((b) => b - (5 * 360 + ((b % 360) + 360) % 360));
      sfx.spin();
      const tickIv = window.setInterval(() => sfx.tick(), 260);
      window.setTimeout(() => {
        window.clearInterval(tickIv);
        setBallDropped(true);
        setRolling(false);
        if (Number(r.payout) > 0) sfx.win(); else sfx.lose();
        setSpins((s) => [{ n: r.pocket, color: r.color }, ...s].slice(0, 12));
        setLast(r); onBalance(r.balance); onPlayed();
        setPlaced(new Map()); setHistory([]);
        setBusy(false);
      }, 4100);
    } catch (e: any) { setErr(e.message); setBusy(false); }
  }

  // a chip's face colors by its total, the way racks are stacked
  const chipFace = (amt: number) =>
    amt >= 100 ? "bg-neutral-900 text-gold ring-gold/80"
    : amt >= 25 ? "bg-emerald-600 text-white ring-emerald-200/80"
    : amt >= 10 ? "bg-sky-600 text-white ring-sky-200/80"
    : amt >= 5 ? "bg-red-600 text-white ring-red-200/80"
    : "bg-slate-200 text-slate-900 ring-white/90";

  const Chip = ({ amt, small = false }: { amt: number; small?: boolean }) => (
    <span className={`pointer-events-none absolute left-1/2 top-1/2 z-10 grid -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full font-mono font-black shadow-[0_2px_5px_rgba(0,0,0,0.7)] ring-2 ring-inset ${
      chipFace(amt)} ${small ? "h-5 w-5 text-[8px]" : "h-6 w-6 text-[9px]"}`}
      style={{ backgroundImage: "repeating-conic-gradient(rgba(255,255,255,0.25) 0deg 12deg, transparent 12deg 48deg)" }}>
      <span className={`grid place-items-center rounded-full ${chipFace(amt).split(" ")[0]} ${small ? "h-3.5 w-3.5" : "h-4 w-4"}`}>
        {amt >= 1000 ? `${Math.round(amt / 1000)}k` : amt}
      </span>
    </span>
  );

  const Spot = ({ k, className, style, children }: {
    k: string; className: string; style?: React.CSSProperties;
    children?: React.ReactNode;
  }) => {
    const amt = placed.get(k);
    // a spot wins if it's the straight number, or a line bet whose set holds it
    const isWin = last && !rolling && (() => {
      if (k === `s:${last.pocket}`) return true;
      const [kind, nums] = k.split(":");
      return ["sp", "co", "st", "ln"].includes(kind)
        && nums.split("-").map(Number).includes(last.pocket);
    })();
    return (
      <button onClick={() => place(k)} style={style}
        className={`relative transition hover:brightness-125 ${className} ${
          isWin ? "z-20 ring-2 ring-gold shadow-gold" : ""}`}>
        {children}
        {amt ? <Chip amt={amt} /> : null}
        {isWin && (
          <span className="pointer-events-none absolute -top-2 left-1/2 z-30 -translate-x-1/2 text-[13px] drop-shadow">🏆</span>
        )}
      </button>
    );
  };

  // the felt: 0 rail, 12x3 numbers, 2:1 rail, dozens, outside line
  const cell = "h-9 border border-emerald-100/40 text-[11px] font-bold text-white";
  const numCls = (n: number) => `${cell} ${RL_RED.has(n) ? "bg-red-700/90" : "bg-neutral-900/90"}`;

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-white/5 bg-base-800 shadow-card p-4">
        <div className="mb-3 flex items-baseline justify-between">
          <GameLogo k="roulette" />
          <span className="font-mono text-[10px] text-slate-500">European</span>
        </div>

        {/* the board: the last dozen pockets, hottest ink on the rail */}
        {spins.length > 0 && (
          <div className="mb-2 flex items-center gap-1.5 overflow-x-auto pb-0.5">
            <span className="shrink-0 text-[9px] font-black uppercase tracking-widest text-slate-500">Last</span>
            {spins.map((s, i) => (
              <span key={i}
                className={`grid h-6 w-6 shrink-0 place-items-center rounded-full font-mono text-[10px] font-black text-white ring-1 ring-white/25 ${
                  i === 0 ? "reel-pop " : ""}${
                  s.color === "red" ? "bg-red-700" : s.color === "black"
                    ? "bg-neutral-900" : "bg-emerald-600"}`}>
                {s.n}
              </span>
            ))}
          </div>
        )}

        {/* the wheel */}
        <div className="mb-3 grid place-items-center rounded-xl border border-gold/20 bg-[radial-gradient(circle_at_50%_35%,#1d3527,#07130b_75%)] py-4">
          <div className="relative h-52 w-52 sm:h-60 sm:w-60">
            <div className="h-full w-full drop-shadow-[0_8px_24px_rgba(0,0,0,0.7)]"
              style={{ transform: `rotate(${wheelRot}deg)`,
                       transition: rolling ? "transform 4s cubic-bezier(0.12, 0.68, 0.16, 1)" : "none" }}>
              <RouletteWheelSVG />
            </div>
            {/* the ball rides its own track, opposite direction */}
            <div className="pointer-events-none absolute inset-0"
              style={{ transform: `rotate(${ballRot}deg)`,
                       transition: rolling ? "transform 3.6s cubic-bezier(0.14, 0.72, 0.18, 1)" : "none" }}>
              <div className="absolute left-1/2 h-3 w-3 -translate-x-1/2 rounded-full bg-gradient-to-b from-white to-slate-300 shadow-[0_1px_4px_rgba(0,0,0,0.8)]"
                style={{ top: ballDropped ? "13%" : "5%",
                         transition: "top 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)" }} />
            </div>
            {/* result flag in the hub */}
            {last && !rolling && (
              <div className="absolute inset-0 grid place-items-center">
                <span className={`grid h-12 w-12 place-items-center rounded-full border-2 border-gold text-lg font-black text-white shadow-pop ${
                  last.color === "green" ? "bg-green-700" : last.color === "red" ? "bg-red-700" : "bg-neutral-900"}`}>
                  {last.pocket}
                </span>
              </div>
            )}
          </div>
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

        {/* the felt */}
        <div className="overflow-x-auto rounded-xl border border-emerald-700/60 bg-[radial-gradient(circle_at_50%_20%,#14532d,#0b3320_60%,#072415_100%)] p-3 shadow-[inset_0_2px_16px_rgba(0,0,0,0.5)]">
          <div className="min-w-[700px]">
            {/* the numbers plus the thin betting lines between them: a chip in
                a gap is a split, on a cross is a corner, along the bottom rail
                a street/six-line — every inside bet, right on the felt */}
            <div className="grid" style={{
              gridTemplateColumns: `34px 1fr ${"14px 1fr ".repeat(11)}42px`,
              gridTemplateRows: "36px 14px 36px 14px 36px 16px",
            }}>
              {(() => {
                const val = (r: number, c: number) => (3 - r) + 3 * c;
                const LINE = "min-h-0 min-w-0 rounded-[3px] bg-emerald-200/[0.04] hover:bg-gold/40 hover:ring-1 hover:ring-gold/60";
                const els: React.ReactNode[] = [];
                // zero, tall against every row
                els.push(<Spot key="z" k="s:0"
                  className={`${cell} h-auto rounded-l-lg bg-green-700/90`}
                  style={{ gridRow: "1 / span 6", gridColumn: 1 }}>0</Spot>);
                // the 36 numbers
                for (let r = 0; r < 3; r++) for (let c = 0; c < 12; c++) {
                  const n = val(r, c);
                  els.push(<Spot key={`n${n}`} k={`s:${n}`} className={numCls(n)}
                    style={{ gridRow: 1 + 2 * r, gridColumn: 2 + 2 * c }}>{n}</Spot>);
                }
                // the three 2:1 column boxes on the right rail
                for (let r = 0; r < 3; r++) {
                  els.push(<Spot key={`col${2 - r}`} k={`c:${2 - r}`}
                    className={`${cell} h-auto bg-emerald-800/70 text-[10px] ${r === 0 ? "rounded-tr-lg" : ""} ${r === 2 ? "rounded-br-lg" : ""}`}
                    style={{ gridColumn: 25, gridRow: `${1 + 2 * r} / span 2` }}>2:1</Spot>);
                }
                // splits on vertical lines (side-by-side numbers, 17:1)
                for (let r = 0; r < 3; r++) for (let c = 0; c < 11; c++) {
                  const s = [val(r, c), val(r, c + 1)].sort((a, b) => a - b);
                  els.push(<Spot key={`spv${s[0]}_${s[1]}`} k={`sp:${s[0]}-${s[1]}`}
                    className={LINE} style={{ gridColumn: 3 + 2 * c, gridRow: 1 + 2 * r }} />);
                }
                // splits on horizontal lines (stacked numbers, 17:1)
                for (let r = 0; r < 2; r++) for (let c = 0; c < 12; c++) {
                  const s = [val(r, c), val(r + 1, c)].sort((a, b) => a - b);
                  els.push(<Spot key={`sph${s[0]}_${s[1]}`} k={`sp:${s[0]}-${s[1]}`}
                    className={LINE} style={{ gridColumn: 2 + 2 * c, gridRow: 2 + 2 * r }} />);
                }
                // corners where four numbers meet (8:1)
                for (let r = 0; r < 2; r++) for (let c = 0; c < 11; c++) {
                  const s = [val(r, c), val(r, c + 1), val(r + 1, c), val(r + 1, c + 1)].sort((a, b) => a - b);
                  els.push(<Spot key={`co${s.join("_")}`} k={`co:${s.join("-")}`}
                    className={LINE} style={{ gridColumn: 3 + 2 * c, gridRow: 2 + 2 * r }} />);
                }
                // streets along the bottom rail (a column of three, 11:1)
                for (let c = 0; c < 12; c++) {
                  const s = [1 + 3 * c, 2 + 3 * c, 3 + 3 * c];
                  els.push(<Spot key={`st${c}`} k={`st:${s.join("-")}`}
                    className={`${LINE} bg-emerald-200/[0.07]`} style={{ gridColumn: 2 + 2 * c, gridRow: 6 }} />);
                }
                // six-lines on the bottom crosses (two streets, 5:1)
                for (let c = 0; c < 11; c++) {
                  const s = [1, 2, 3, 4, 5, 6].map((k) => k + 3 * c);
                  els.push(<Spot key={`ln${c}`} k={`ln:${s.join("-")}`}
                    className={`${LINE} bg-emerald-200/[0.07]`} style={{ gridColumn: 3 + 2 * c, gridRow: 6 }} />);
                }
                return els;
              })()}
            </div>
            {/* dozens */}
            <div className="mt-1 grid gap-0" style={{ gridTemplateColumns: "34px repeat(3, 1fr) 42px" }}>
              <span />
              {[0, 1, 2].map((d) => (
                <Spot key={d} k={`d:${d}`} className={`${cell} bg-emerald-800/70`}>
                  {["1st 12", "2nd 12", "3rd 12"][d]}
                </Spot>
              ))}
              <span />
            </div>
            {/* the outside line */}
            <div className="mt-1 grid gap-0" style={{ gridTemplateColumns: "34px repeat(6, 1fr) 42px" }}>
              <span />
              <Spot k="low" className={`${cell} rounded-bl-lg bg-emerald-800/70`}>1–18</Spot>
              <Spot k="even" className={`${cell} bg-emerald-800/70`}>EVEN</Spot>
              <Spot k="red" className={`${cell} bg-red-700/90`}>◆</Spot>
              <Spot k="black" className={`${cell} bg-neutral-900/90`}>◆</Spot>
              <Spot k="odd" className={`${cell} bg-emerald-800/70`}>ODD</Spot>
              <Spot k="high" className={`${cell} rounded-br-lg bg-emerald-800/70`}>19–36</Spot>
              <span />
            </div>
          </div>
        </div>

        <p className="mt-2 text-center text-[10px] text-slate-500">
          Tap a number for a straight-up · tap the lines between numbers for splits &amp; corners ·
          the bottom rail for streets &amp; six-lines
        </p>

        {/* the rack: pick a chip, work the table */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5">
            {[1, 5, 10, 25, 100].map((v) => (
              <button key={v} onClick={() => setChip(v)}
                className={`relative grid h-9 w-9 place-items-center rounded-full font-mono text-[10px] font-black shadow-[0_2px_6px_rgba(0,0,0,0.6)] ring-2 ring-inset transition ${chipFace(v)} ${
                  chip === v ? "scale-110 outline outline-2 outline-offset-2 outline-gold" : "opacity-80 hover:opacity-100"}`}
                style={{ backgroundImage: "repeating-conic-gradient(rgba(255,255,255,0.25) 0deg 12deg, transparent 12deg 48deg)" }}>
                <span className={`grid h-6 w-6 place-items-center rounded-full ${chipFace(v).split(" ")[0]}`}>{v}</span>
              </button>
            ))}
          </div>
          <button onClick={() => setNeighbors(!neighbors)} disabled={busy}
            title="Racetrack bet: a number plus its two wheel neighbors each side — five straight-up chips in one tap"
            className={`rounded-lg border px-3 py-2 text-xs font-bold transition ${
              neighbors ? "border-gold bg-gold/20 text-gold shadow-gold"
                : "border-white/10 bg-base-900 text-slate-300 hover:bg-base-700"}`}>
            Neighbors
          </button>
          <button onClick={undo} disabled={busy || history.length === 0}
            className="rounded-lg border border-white/10 bg-base-900 px-3 py-2 text-xs font-bold text-slate-300 hover:bg-base-700 disabled:opacity-40">
            Undo
          </button>
          <button onClick={clearAll} disabled={busy || placed.size === 0}
            className="rounded-lg border border-white/10 bg-base-900 px-3 py-2 text-xs font-bold text-slate-300 hover:bg-base-700 disabled:opacity-40">
            Clear
          </button>
          {lastBets && placed.size === 0 && (
            <button onClick={() => { setPlaced(new Map(lastBets)); setHistory([...lastBets.entries()]); sfx.chip(); }}
              disabled={busy}
              className="rounded-lg border border-gold/40 bg-gold/10 px-3 py-2 text-xs font-bold text-gold hover:bg-gold/20 disabled:opacity-40">
              Rebet
            </button>
          )}
          <button onClick={spin} disabled={busy || placed.size === 0}
            className="ml-auto rounded-lg btn-gold px-8 py-2 text-sm font-black uppercase tracking-wider text-base-900 disabled:opacity-50">
            {busy ? "…" : `Spin${total ? ` (${money(total)})` : ""}`}
          </button>
        </div>

        {err && <p className="mt-2 text-xs text-red-300">{err}</p>}
        <p className="mt-3 text-[10px] leading-relaxed text-slate-500">
          Pick a chip and tap the felt — chips stack where you drop them. Undo takes
          the last chip back; Rebet reloads your last board. Straight up pays 35:1,
          dozens and columns 2:1, the even-money spots 1:1.
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
                  <DealtCard key={`${i}-${c}`} c={c} i={i} />
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
  const [pPair, setPPair] = useState("0");
  const [bPair, setBPair] = useState("0");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [d, setD] = useState<Awaited<ReturnType<typeof api.baccaratDeal>> | null>(null);

  async function deal() {
    setErr(""); setBusy(true);
    try {
      const r = await api.baccaratDeal(bet, stake,
        pPair !== "0" ? pPair : undefined, bPair !== "0" ? bPair : undefined);
      setD(r); onBalance(r.balance); onPlayed();
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }

  type PairRow = [string, string, (v: string) => void, string];
  const pairRows: PairRow[] = [
    ["Player Pair 12:1", pPair, setPPair, "text-sky-300"],
    ["Banker Pair 12:1", bPair, setBPair, "text-red-300"],
  ];

  const side = (label: string, cards: string[], total: number, winner: boolean, tone: string, off = 0) => (
    <div className={`flex-1 rounded-lg border p-3 text-center ${
      winner ? "border-accent/50 bg-accent/5" : "border-white/10 bg-base-900/50"}`}>
      <div className={`mb-2 text-[10px] font-bold uppercase tracking-widest ${tone}`}>{label}</div>
      <div className="flex justify-center gap-1.5"><DealtHand cards={cards} offset={off} /></div>
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
            {side("Banker", d.banker, d.banker_total, d.outcome === "banker", "text-red-300", 3)}
          </div>
          <div className={`mb-2 rounded-lg border px-3 py-2 text-center text-sm font-bold ${
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
          {d.sides && Object.keys(d.sides).length > 0 && (
            <div className="mb-3 flex flex-wrap justify-center gap-1.5">
              {Object.entries(d.sides).map(([k, s]) => (
                <span key={k}
                  className={`rounded-md px-2 py-1 text-[10px] font-black uppercase tracking-wide ${
                    s.hit ? "reel-pop bg-gold/20 text-gold ring-1 ring-gold/50"
                      : "bg-black/30 text-slate-500"}`}>
                  {k === "player_pair" ? "Player Pair" : "Banker Pair"}:{" "}
                  {s.hit ? `${s.pay}:1 +${money(s.won)}` : "no pair"}
                </span>
              ))}
            </div>
          )}
        </>
      )}

      <div className="mb-2 grid grid-cols-3 gap-1.5 text-center text-xs font-bold">
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

      {/* pair side bets: the side's first two cards match ranks, 12:1 */}
      <div className="mb-3 grid grid-cols-2 gap-1.5">
        {pairRows.map(([label, val, set, tone]) => (
          <div key={label} className="flex items-center justify-between rounded-lg border border-white/10 bg-base-900/50 px-2 py-1.5">
            <span className={`text-[10px] font-black uppercase tracking-wide ${tone}`}>{label}</span>
            <div className="flex gap-1">
              {["0", "1", "5", "10"].map((v) => (
                <button key={v} onClick={() => set(v)}
                  className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-bold ${
                    val === v ? "btn-gold text-base-900"
                      : "bg-base-700 text-slate-300 hover:bg-base-600"}`}>
                  {v === "0" ? "—" : v}
                </button>
              ))}
            </div>
          </div>
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

  const [shake, setShake] = useState(false);
  async function run(fn: () => Promise<import("../api").MinesState>,
                     kind: "start" | "pick" | "cash" = "pick") {
    setErr(""); setBusy(true);
    try {
      const prev = st?.revealed.length ?? 0;
      const r = await fn();
      setSt(r);
      if (kind === "pick") {
        if (r.outcome === "bust") { sfx.boom(); setShake(true); window.setTimeout(() => setShake(false), 500); }
        else if (r.revealed.length > prev) sfx.chip();
        if (r.outcome === "cleared") sfx.bigwin();
      } else if (kind === "cash") sfx.cashout();
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

      <div className={`mx-auto grid max-w-[300px] grid-cols-5 gap-1.5 ${shake ? "board-shake" : ""}`}>
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
              {cs === "safe" ? <span className="reel-pop inline-block">💎</span>
                : cs === "boom" ? <span className="reel-pop inline-block text-2xl">💥</span>
                : cs === "mine" ? <span className="deal-flip inline-block">💣</span> : ""}
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
          <button onClick={() => run(() => api.minesCashout(st.round_id), "cash")}
            disabled={busy || st.revealed.length === 0}
            className="ml-auto rounded-lg bg-accent px-6 py-2 text-sm font-black uppercase tracking-wider text-base-900 hover:brightness-110 disabled:opacity-50">
            Cash out {st.revealed.length > 0 ? `${st.multiplier}×` : ""}
          </button>
        ) : (
          <button onClick={() => run(() => api.minesStart(stake, mines), "start")} disabled={busy}
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
  const [ball, setBall] = useState<{ x: number; y: number } | null>(null);
  const [trail, setTrail] = useState<{ x: number; y: number }[]>([]);
  const [landed, setLanded] = useState<number | null>(null);
  const [last, setLast] = useState<{ multiplier: string; payout: string } | null>(null);

  const table = def.tables[String(rows)]?.[risk] ?? [];

  // board geometry: viewBox units
  const W = 340, PAD = 22;
  const stepY = (200 - 20) / rows;
  const stepX = (W - PAD * 2) / rows;
  const px = (row: number, i: number) => W / 2 + (i - row / 2) * stepX;

  async function drop() {
    setErr(""); setBusy(true); setLast(null); setLanded(null);
    try {
      const r = await api.plinkoDrop(stake, rows, risk);
      onBalance(r.balance);
      // one continuous fall: gravity within each hop, the sideways kick
      // arriving late — the moment the ball clips the peg
      const bWidthL = (W - PAD * 2) / (rows + 1);
      const pts: { x: number; y: number }[] = [{ x: W / 2, y: 4 }];
      let acc = 0;
      for (let i = 0; i < r.path.length; i++) {
        acc += r.path[i];
        pts.push({ x: px(i + 1, acc), y: 14 + (i + 1) * stepY - 4.5 });
      }
      pts.push({ x: PAD + r.bucket * bWidthL + bWidthL / 2, y: 214 });
      const segDur = Math.max(70, 1500 / rows);
      const total = segDur * (pts.length - 1);
      const t0 = performance.now();
      const frame = (t: number) => {
        const el = Math.min(t - t0, total);
        const idx = Math.min(Math.floor(el / segDur), pts.length - 2);
        if (idx !== (frame as any)._lastIdx) { (frame as any)._lastIdx = idx; if (idx > 0) sfx.peg(); }
        const u = Math.min((el - idx * segDur) / segDur, 1);
        const a = pts[idx], b = pts[idx + 1];
        const uy = u * u;                               // gravity
        const ux0 = u < 0.5 ? 0 : (u - 0.5) / 0.5;      // deflect off the peg
        const ux = ux0 * ux0 * (3 - 2 * ux0);           // smoothstep
        const pos = { x: a.x + (b.x - a.x) * ux, y: a.y + (b.y - a.y) * uy };
        setBall(pos);
        setTrail((tr) => [pos, ...tr].slice(0, 5));
        if (el < total) {
          requestAnimationFrame(frame);
        } else {
          window.setTimeout(() => {
            setBall(null); setTrail([]);
            setLanded(r.bucket);
            if (Number(r.payout) > Number(stake)) sfx.win();
            else if (Number(r.payout) > 0) sfx.chip(); else sfx.lose();
            setLast({ multiplier: r.multiplier, payout: r.payout });
            onPlayed();
            setBusy(false);
          }, 60);
        }
      };
      requestAnimationFrame(frame);
    } catch (e: any) {
      setErr(e.message); setBusy(false);
    }
  }

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
          {trail.map((p, i) => (
            <circle key={i} cx={p.x} cy={p.y} r={4.2 - i * 0.7}
              fill="#f0b429" opacity={0.16 - i * 0.03} />
          ))}
          {ball && (
            <>
              <circle cx={ball.x} cy={ball.y} r="7" fill="rgba(240,180,41,0.25)" />
              <circle cx={ball.x} cy={ball.y} r="4.6" fill="#f7ca5e" />
              <circle cx={ball.x - 1.3} cy={ball.y - 1.5} r="1.4" fill="#fff7e0" opacity="0.9" />
            </>
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

/* a card dealt off the shoe: it flies in, then flips face-up. Keyed by
   position+face, so a new card animates and the table doesn't re-deal. */
function DealtCard({ c, i }: { c: string; i: number }) {
  useEffect(() => {
    const t = window.setTimeout(() => sfx.deal(), i * 150);
    return () => window.clearTimeout(t);
  }, []);
  return (
    <span key={`${i}-${c}`} className="deal-fly" style={{ animationDelay: `${i * 150}ms` }}>
      <span className="deal-flip" style={{ animationDelay: `${i * 150 + 170}ms` }}>
        <span className="deal-front"><PlayingCard c={c} /></span>
        <span className="deal-back"><PlayingCard c="??" /></span>
      </span>
    </span>
  );
}

function DealtHand({ cards, offset = 0 }: { cards: string[]; offset?: number }) {
  return (
    <>
      {cards.map((c, i) => <DealtCard key={`${i}-${c}`} c={c} i={i + offset} />)}
    </>
  );
}

/* the dealing shoe sitting on the felt */
function Shoe({ busy }: { busy: boolean }) {
  return (
    <div className={`pointer-events-none absolute right-2 top-2 ${busy ? "shoe-shuffle" : ""}`}>
      <div className="relative h-12 w-9">
        <span className="absolute left-1 top-1 h-11 w-8 rounded-md bg-gradient-to-br from-base-600 to-base-700 ring-1 ring-white/10" />
        <span className="absolute left-0.5 top-0.5 h-11 w-8 rounded-md bg-gradient-to-br from-base-600 to-base-700 ring-1 ring-white/10" />
        <span className="absolute left-0 top-0 grid h-11 w-8 place-items-center rounded-md bg-gradient-to-br from-[#7c2d12] to-[#431407] text-[10px] text-gold/70 ring-1 ring-gold/30"
          style={{ backgroundImage: "repeating-linear-gradient(45deg, rgba(240,180,41,.08) 0 3px, transparent 3px 6px)" }}>
          🂠
        </span>
      </div>
    </div>
  );
}

function Blackjack({ onBalance, onPlayed }: {
  onBalance: (b: string) => void; onPlayed: () => void;
}) {
  const [hand, setHand] = useState<import("../api").BjHand | null>(null);
  const [stake, setStake] = useState("10");
  const [side21, setSide21] = useState("0");
  const [sideLk, setSideLk] = useState("0");
  const [sides, setSides] = useState<Record<string, { hand: string | null;
    pay: number; won: string }> | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  // hold the hand totals back until the cards have finished landing, so the
  // number never shows before the card is actually on the felt
  const [reveal, setReveal] = useState(false);

  const SIDE_LABEL: Record<string, string> = {
    straight_flush: "Straight Flush", trips: "Three of a Kind",
    straight: "Straight", flush: "Flush", "678_suited": "6-7-8 Suited",
    "777": "Triple Sevens", "678": "6-7-8", "21_suited": "Suited 21",
    "21": "Total 21", "20": "Total 20", "19": "Total 19",
  };

  useEffect(() => {
    api.bjActive().then((r) => { if (r.active) setHand(r.active); }).catch(() => {});
  }, []);

  // whenever cards change, hide the totals and bring them back only once the
  // last card has flown in and flipped (deal-fly + deal-flip finish ~i*150+450)
  const pc = hand?.player.length ?? 0;
  const dc = hand?.dealer.length ?? 0;
  const rid = hand?.round_id ?? 0;
  useEffect(() => {
    if (!hand) { setReveal(false); return; }
    setReveal(false);
    const lastIdx = Math.max(pc > 0 ? pc - 1 + 2 : 0, dc > 0 ? dc - 1 : 0);
    const t = window.setTimeout(() => setReveal(true), lastIdx * 150 + 570);
    return () => window.clearTimeout(t);
  }, [pc, dc, rid, hand]);

  const done = hand?.status === "settled";
  async function run(fn: () => Promise<import("../api").BjHand>) {
    setErr(""); setBusy(true);
    try {
      const h = await fn();
      if ((h as any).sides !== undefined) setSides((h as any).sides);
      if (h.status === "settled") {
        // table manners: your card hits the felt first, the dealer pauses,
        // then turns the hole card (and draws out, one card at a time)
        const fresh = !hand || hand.status === "settled";
        setHand({ ...h, dealer: [h.dealer[0], "??"], dealer_total: null,
                  outcome: null } as any);
        await new Promise((res) => setTimeout(res, fresh ? 1300 : 800));
      }
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

  type SideRow = [string, string, string, (v: string) => void];
  const sideRows: SideRow[] = [
    ["21+3", "Your 2 + dealer's up card make a poker hand", side21, setSide21],
    ["Lucky Lucky", "The 3-card total: 19, 20, 21, 6-7-8, 777", sideLk, setSideLk],
  ];

  return (
    <div className="rounded-xl border border-white/5 bg-base-800 shadow-card p-4">
      <h3 className="mb-1 text-sm font-bold text-slate-100">🃏 Blackjack</h3>
      <p className="mb-3 text-[10px] text-slate-500">
        Single deck each hand · dealer stands all 17s · blackjack pays 3:2 ·
        double any first two cards · no splits.
      </p>

      {hand && (
        <div className="relative mb-3 space-y-3 overflow-hidden rounded-xl border border-emerald-800/50 bg-[radial-gradient(circle_at_50%_0,#14532d_0%,#0c3320_45%,#07210f_100%)] p-4 shadow-[inset_0_2px_20px_rgba(0,0,0,0.5)]">
          <Shoe busy={busy} />
          <div className="pointer-events-none absolute inset-x-8 top-16 h-24 rounded-[50%] border border-gold/15" />
          <div className="relative">
            <div className="mb-1 text-[10px] uppercase tracking-wide text-emerald-200/60">
              Dealer{reveal && hand.dealer_total !== null ? ` — ${hand.dealer_total}` : ""}
            </div>
            <div className="flex gap-1.5"><DealtHand cards={hand.dealer} /></div>
          </div>
          <div className="relative">
            <div className="mb-1 text-[10px] uppercase tracking-wide text-emerald-200/60">
              You{reveal ? ` — ${hand.player_total}${hand.doubled ? " · doubled" : ""}` : ""}
            </div>
            <div className="flex gap-1.5"><DealtHand cards={hand.player} offset={2} /></div>
          </div>
          {sides && Object.keys(sides).length > 0 && (
            <div className="relative flex flex-wrap gap-1.5">
              {Object.entries(sides).map(([k, s]) => (
                <span key={k}
                  className={`rounded-md px-2 py-1 text-[10px] font-black uppercase tracking-wide ${
                    s.hand ? "reel-pop bg-gold/20 text-gold ring-1 ring-gold/50"
                      : "bg-black/30 text-slate-500"}`}>
                  {k === "21p3" ? "21+3" : "Lucky Lucky"}:{" "}
                  {s.hand ? `${SIDE_LABEL[s.hand] ?? s.hand} ${s.pay}:1 +${money(s.won)}`
                    : "no hit"}
                </span>
              ))}
            </div>
          )}
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
        <>
          <div className="flex flex-wrap items-center gap-2">
            <input value={stake} inputMode="decimal"
              onChange={(e) => setStake(e.target.value.replace(/[^0-9.]/g, ""))}
              className="w-24 rounded-lg bg-base-700 px-3 py-2 font-mono text-sm text-slate-100 outline-none" />
            {["5", "10", "25", "100"].map((v) => (
              <button key={v} onClick={() => setStake(v)}
                className="rounded-lg bg-base-700 px-2.5 py-2 text-xs text-slate-300 hover:bg-base-600">{v}</button>
            ))}
            <button onClick={() => run(() => api.bjDeal(stake,
                side21 !== "0" ? side21 : undefined,
                sideLk !== "0" ? sideLk : undefined))} disabled={busy}
              className="ml-auto rounded-lg btn-gold px-5 py-2 text-sm font-bold text-base-900 hover:brightness-110 disabled:opacity-50">
              {busy ? "…" : "Deal"}
            </button>
          </div>
          {/* side bets: settled the moment the cards land */}
          <div className="mt-2 grid grid-cols-2 gap-2">
            {sideRows.map(([label, hint, val, set]) => (
              <div key={label} className="rounded-lg border border-white/10 bg-base-900/60 p-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-black uppercase tracking-wide text-gold/90">{label}</span>
                  <div className="flex gap-1">
                    {["0", "1", "5", "10"].map((v) => (
                      <button key={v} onClick={() => set(v)}
                        className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-bold ${
                          val === v ? "btn-gold text-base-900"
                            : "bg-base-700 text-slate-300 hover:bg-base-600"}`}>
                        {v === "0" ? "—" : v}
                      </button>
                    ))}
                  </div>
                </div>
                <p className="mt-1 text-[9px] leading-tight text-slate-500">{hint}</p>
              </div>
            ))}
          </div>
        </>
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
  const [sweep, setSweep] = useState<number | null>(null);
  const mult = (96 / chance).toFixed(4);

  async function roll() {
    setErr(""); setBusy(true); setLast(null);
    try {
      const r = await api.diceBet(stake, String(chance));
      // the number hunts across the bar, slows, and locks on the roll
      const final = Number(r.roll);
      const t0 = performance.now();
      const DUR = 1100;
      sfx.spin();
      let lastTick = 0;
      const frame = (t: number) => {
        const u = Math.min((t - t0) / DUR, 1);
        const ease = 1 - Math.pow(1 - u, 3);
        // early on it wanders; late it converges on the real number
        const wander = Math.sin(u * 31) * 50 * (1 - ease);
        const v = Math.max(0, Math.min(99.99, final * ease + (1 - ease) * 50 + wander));
        setSweep(v);
        if (t - lastTick > 90) { sfx.tick(); lastTick = t; }
        if (u < 1) requestAnimationFrame(frame);
        else {
          setSweep(null);
          if (r.win) sfx.win(); else sfx.lose();
          setLast(r); onBalance(r.balance); onPlayed();
          setBusy(false);
        }
      };
      requestAnimationFrame(frame);
    } catch (e: any) { setErr(e.message); setBusy(false); }
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
      <div className="relative mt-2 h-4 overflow-visible rounded-full bg-red-900/60">
        <div className="h-full rounded-l-full bg-accent/70" style={{ width: `${chance}%` }} />
        {(sweep !== null || last) && (
          <div className="absolute -top-1 h-6 w-1 rounded-full bg-white shadow-[0_0_8px_rgba(255,255,255,0.8)]"
            style={{ left: `${Math.min(99.5, sweep !== null ? sweep : Number(last!.roll))}%` }} />
        )}
      </div>
      <div className="mt-2 grid h-12 place-items-center">
        {sweep !== null ? (
          <span className="font-mono text-3xl font-black tabular-nums text-slate-200">{sweep.toFixed(2)}</span>
        ) : last ? (
          <span className={`font-mono text-3xl font-black tabular-nums ${
            last.win ? "text-accent drop-shadow-[0_0_14px_rgba(74,222,128,0.5)]" : "text-red-400"}`}>
            {last.roll}
          </span>
        ) : (
          <span className="font-mono text-3xl font-black text-slate-600">—</span>
        )}
      </div>

      {last && (
        <div className={`rounded-lg px-3 py-2 font-mono text-sm font-bold ${
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
// the wheel face: 20 slices per risk, laid out so no two rich slices touch
const WHEEL_SLICES: Record<string, { seg: number; label: string; color: string }[]> = (() => {
  const build = (dist: [number, string, string][]) => {
    // interleave: big buckets fan out round-robin so the wheel looks mixed
    const pools = dist.map(([n, label, color], seg) =>
      Array.from({ length: n }, () => ({ seg, label, color })));
    const out: { seg: number; label: string; color: string }[] = [];
    while (out.length < 20) {
      for (const p of pools) if (p.length && out.length < 20) out.push(p.pop()!);
    }
    return out;
  };
  return {
    low: build([[7, "0x", "#1e293b"], [7, "1.2x", "#16a34a"], [5, "1.5x", "#0284c7"], [1, "3x", "#f0b429"]]),
    medium: build([[12, "0x", "#1e293b"], [5, "2x", "#0284c7"], [3, "3x", "#f0b429"]]),
    high: build([[16, "0x", "#1e293b"], [2, "4x", "#0284c7"], [1, "5x", "#7c3aed"], [1, "6x", "#f0b429"]]),
  };
})();

function WheelGame({ onBalance, onPlayed }: {
  onBalance: (b: string) => void; onPlayed: () => void;
}) {
  const [risk, setRisk] = useState<"low" | "medium" | "high">("low");
  const [stake, setStake] = useState("10");
  const [last, setLast] = useState<Awaited<ReturnType<typeof api.wheelBet>> | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [rot, setRot] = useState(0);
  const [rolling, setRolling] = useState(false);

  const slices = WHEEL_SLICES[risk];
  const SLICE = 360 / slices.length;
  // distinct payout tiers for the legend, in the order they appear
  const tiers = (() => {
    const seen = new Map<string, string>();
    for (const s of slices) if (!seen.has(s.label)) seen.set(s.label, s.color);
    return [...seen.entries()].map(([label, color]) => ({ label, color }));
  })();

  async function spin() {
    setErr(""); setBusy(true); setLast(null);
    try {
      const r = await api.wheelBet(stake, risk);
      // pick one of the winning segment's slices and coast onto it
      const idxs = slices.map((s, i) => (s.seg === r.segment ? i : -1)).filter((i) => i >= 0);
      const target = idxs[Math.floor(Math.random() * idxs.length)];
      const targetAngle = target * SLICE + SLICE / 2;
      setRolling(true);
      sfx.spin();
      const tickIv = window.setInterval(() => sfx.tick(), 200);
      setRot((w) => {
        const settle = (360 - targetAngle - ((w % 360) + 360) % 360 + 720) % 360;
        return w + 4 * 360 + settle;
      });
      window.setTimeout(() => {
        window.clearInterval(tickIv);
        setRolling(false);
        if (Number(r.payout) > 0) sfx.win(); else sfx.lose();
        setLast(r); onBalance(r.balance); onPlayed();
        setBusy(false);
      }, 3600);
    } catch (e: any) { setErr(e.message); setBusy(false); }
  }

  const rad = (d: number) => ((d - 90) * Math.PI) / 180;
  return (
    <div className="rounded-xl border border-white/5 bg-base-800 shadow-card p-4">
      <h3 className="mb-1 text-sm font-bold text-slate-100">🎡 Wheel</h3>
      <p className="mb-3 text-[10px] text-slate-500">
        Pick a risk level and spin — land a multiplier slice and get paid.
      </p>

      <div className="mb-3 flex gap-1.5">
        {(["low", "medium", "high"] as const).map((r) => (
          <button key={r} onClick={() => { if (!busy) { setRisk(r); setLast(null); } }}
            className={`flex-1 rounded-lg py-2 text-xs font-bold capitalize ${
              risk === r ? "btn-gold text-base-900" : "bg-base-700 text-slate-300 hover:bg-base-600"}`}>
            {r}
          </button>
        ))}
      </div>

      {/* the wheel itself */}
      <div className="mb-3 grid place-items-center rounded-xl border border-gold/20 bg-[radial-gradient(circle_at_50%_35%,#132030,#070d16_75%)] py-4">
        <div className="relative h-52 w-52 sm:h-56 sm:w-56">
          <div className="h-full w-full drop-shadow-[0_8px_24px_rgba(0,0,0,0.7)]"
            style={{ transform: `rotate(${rot}deg)`,
                     transition: rolling ? "transform 3.5s cubic-bezier(0.12, 0.68, 0.16, 1)" : "none" }}>
            <svg viewBox="0 0 200 200" className="h-full w-full">
              {/* outer rim: dark ring with a bright gold bezel */}
              <circle cx="100" cy="100" r="99" fill="#0b0e14" />
              <circle cx="100" cy="100" r="97" fill="none" stroke="#3f2c10" strokeWidth="6" />
              <circle cx="100" cy="100" r="93.5" fill="none"
                stroke="url(#wheelrim)" strokeWidth="2.5" />
              <defs>
                <linearGradient id="wheelrim" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="#ffe08a" /><stop offset="1" stopColor="#b97b09" />
                </linearGradient>
              </defs>
              {slices.map((s, i) => {
                const a0 = -SLICE / 2, a1 = SLICE / 2;
                const x0 = 100 + 90 * Math.cos(rad(a0)), y0 = 100 + 90 * Math.sin(rad(a0));
                const x1 = 100 + 90 * Math.cos(rad(a1)), y1 = 100 + 90 * Math.sin(rad(a1));
                // alternate a faint sheen so neighbouring same-color slices read
                const sheen = i % 2 === 0 ? 1 : 0.86;
                return (
                  <g key={i} transform={`rotate(${i * SLICE} 100 100)`}>
                    <path d={`M100 100 L${x0} ${y0} A90 90 0 0 1 ${x1} ${y1} Z`}
                      fill={s.color} fillOpacity={sheen} stroke="#0b0e14" strokeWidth="0.7" />
                    <text x="100" y="24" fontSize="8.5" fontWeight="900" textAnchor="middle"
                      fill={s.label === "0x" ? "#7c8a9c" : "#ffffff"}
                      fontFamily="Arial Black, Arial, sans-serif"
                      style={{ paintOrder: "stroke", stroke: "rgba(0,0,0,0.45)", strokeWidth: 0.6 }}>
                      {s.label}
                    </text>
                  </g>
                );
              })}
              {/* rim pegs, the way a real prize wheel is studded */}
              {slices.map((_, i) => {
                const a = rad(i * SLICE + SLICE / 2);
                return <circle key={`p${i}`} cx={100 + 90 * Math.cos(a)}
                  cy={100 + 90 * Math.sin(a)} r="1.4" fill="#ffe9a3" />;
              })}
              {/* hub */}
              <circle cx="100" cy="100" r="31" fill="#0b0e14" stroke="url(#wheelrim)" strokeWidth="2.5" />
              <circle cx="100" cy="100" r="27" fill="none" stroke="#3f2c10" strokeWidth="1" />
              {last && !rolling ? (
                <text x="100" y="106" fontSize="17" fontWeight="900" textAnchor="middle"
                  fill={Number(last.payout) > 0 ? "#4ade80" : "#f87171"}
                  fontFamily="Arial Black, sans-serif">{last.multiplier}x</text>
              ) : (
                <text x="100" y="107" fontSize="15" fontWeight="900" textAnchor="middle"
                  fill="#f0b429" fontFamily="Arial Black, sans-serif">777</text>
              )}
            </svg>
          </div>
          <svg className="pointer-events-none absolute -top-1 left-1/2 h-5 w-5 -translate-x-1/2 drop-shadow-[0_2px_3px_rgba(0,0,0,0.6)]">
            <polygon points="0,0 20,0 10,16" fill="#f0b429" stroke="#0b0e14" strokeWidth="1" />
          </svg>
        </div>
      </div>

      {/* the payout legend — every tier and its colour, like a real wheel */}
      <div className="mb-3 flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
        {tiers.map((t) => (
          <span key={t.label} className="flex items-center gap-1.5 text-[11px] font-bold">
            <span className="h-2.5 w-2.5 rounded-sm ring-1 ring-white/20"
              style={{ background: t.color }} />
            <span className={t.label === "0x" ? "text-slate-500" : "text-slate-200"}>
              {t.label === "0x" ? "Lose" : t.label}
            </span>
          </span>
        ))}
      </div>

      {last && !rolling && (
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
function MyWagers({ initial = "open", onBalance }: {
  initial?: "open" | "graded" | "all"; onBalance?: (b: string) => void;
}) {
  const [bets, setBets] = useState<SbBet[] | null>(null);
  const [filter, setFilter] = useState<"open" | "graded" | "all">(initial);
  const [offers, setOffers] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<number | null>(null);
  const [note, setNote] = useState("");

  const reload = () => {
    api.sbMyBets().then(setBets).catch(() => setBets([]));
    api.sbCashouts().then(setOffers).catch(() => {});
  };
  useEffect(() => {
    reload();
    // the buy-back price rides the live market: keep it fresh
    const t = setInterval(() => { api.sbCashouts().then(setOffers).catch(() => {}); }, 10000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function cashOut(b: SbBet) {
    if (busy) return;
    setBusy(b.bet_id); setNote("");
    try {
      const r = await api.sbCashout(b.bet_id, offers[String(b.bet_id)]);
      sfx.cashout();
      setNote(`Ticket #${b.bet_id} cashed out for ${money(r.paid)}`);
      onBalance?.(r.balance);
      reload();
    } catch (e: any) {
      let handled = false;
      try {
        const d = JSON.parse(e.message);
        if (d?.reason === "offer_changed") {
          setNote(`Offer moved — now ${money(d.offer)}. Tap again to take it.`);
          setOffers((p) => ({ ...p, [String(b.bet_id)]: d.offer }));
          handled = true;
        }
      } catch { /* plain-text error */ }
      if (!handled) { setNote(e.message || "cash out failed"); reload(); }
    } finally { setBusy(null); }
  }

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

      {note && (
        <div className="rounded-lg border border-gold/30 bg-gold/10 px-3 py-2 text-xs text-gold">
          {note}
        </div>
      )}

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
          {b.status === "open" && offers[String(b.bet_id)] && (
            <button onClick={() => cashOut(b)} disabled={busy === b.bet_id}
              className="btn-gold mt-2.5 w-full rounded-lg py-2 text-xs font-bold text-base-900 disabled:opacity-50">
              {busy === b.bet_id ? "Cashing out…"
                : <>Cash Out <span className="font-mono">{money(offers[String(b.bet_id)])}</span></>}
            </button>
          )}
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
            {t.key.startsWith("motor_") ? "🏎" : "🐎"} {t.name}
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

