import { useCallback, useEffect, useMemo, useState } from "react";
import { api, type SbBet, type SbEvent, type SbMarket, type SbQuote, type SbSelection } from "../api";
import { useOddsFmt } from "../prefs";

export interface SlipLeg {
  selectionId: number;
  odds: string;
  label: string;
  market: string;
  event: string;
  eventId: number;
}

export default function Sportsbook({ onBalance, isAdmin, onCasino, onHorses }: {
  onBalance: (b: string) => void; isAdmin: boolean;
  onCasino?: () => void; onHorses?: () => void;
}) {
  const [events, setEvents] = useState<SbEvent[]>([]);
  const [slip, setSlip] = useState<SlipLeg[]>([]);
  const [bets, setBets] = useState<SbBet[]>([]);
  const [view, setView] = useState<"board" | "bets">("board");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  // the classic player flow: pick your sports first, then Continue to the lines
  const [phase, setPhase] = useState<"pick" | "board">("pick");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [preset, setPreset] = useState<TicketType>("auto");
  const [presetTier, setPresetTier] = useState(0);
  const [liveOnly, setLiveOnly] = useState(false);
  const [propsOnly, setPropsOnly] = useState(false);
  const [classicPicks, setClassicPicks] = useState<Map<number, ClassicPick>>(new Map());
  const [confirming, setConfirming] = useState(false);
  const [liveDetail, setLiveDetail] = useState<number | null>(null);
  const [fig, setFig] = useState<{ balance: string; available: string } | null>(null);

  const loadEvents = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try { setEvents(await api.sbEvents(undefined)); } finally { if (!quiet) setLoading(false); }
  }, []);

  useEffect(() => {
    // the server seeds the book on boot, so a player never needs to sync
    loadEvents().catch((e) => setNotice(e.message));
    api.myFigures().then((f) => setFig({ balance: f.balance, available: f.available }))
      .catch(() => {});
  }, [loadEvents]);

  const anyLive = events.some((e) => e.status === "live");
  useEffect(() => {
    // while games are in play, keep the scores and live prices fresh
    if (!anyLive) return;
    const t = setInterval(() => { loadEvents(true); }, 8000);
    return () => clearInterval(t);
  }, [anyLive, loadEvents]);

  // sport -> leagues, straight off the board data
  const catalog = useMemo(() => {
    const out = new Map<string, { name: string; icon: string; live: boolean;
      leagues: Map<string, { name: string; count: number; live: boolean }> }>();
    for (const ev of events) {
      const s = out.get(ev.sport) ?? { name: ev.sport_name, icon: ev.icon,
        live: false, leagues: new Map() };
      const l = s.leagues.get(ev.competition_key) ?? { name: ev.competition, count: 0, live: false };
      l.count += 1;
      if (ev.status === "live") { l.live = true; s.live = true; }
      s.leagues.set(ev.competition_key, l);
      out.set(ev.sport, s);
    }
    return out;
  }, [events]);

  const shownEvents = useMemo(() => {
    const base = liveOnly ? events.filter((e) => e.status === "live")
      : checked.size === 0 ? events : events.filter((e) => checked.has(e.competition_key));
    return base;
  }, [events, checked, liveOnly]);

  const refreshBets = useCallback(() => { api.sbMyBets().then(setBets).catch(() => {}); }, []);
  useEffect(() => { refreshBets(); }, [refreshBets]);

  function toggle(ev: SbEvent, market: { name: string }, sel: SbSelection) {
    setSlip((prev) => {
      if (prev.some((l) => l.selectionId === sel.id)) {
        return prev.filter((l) => l.selectionId !== sel.id);
      }
      return [...prev, {
        selectionId: sel.id, odds: sel.odds, label: sel.name,
        market: market.name, event: `${ev.home} v ${ev.away}`, eventId: ev.id,
      }];
    });
  }

  async function simulate() {
    setNotice("");
    try {
      const r = await api.sbSimulate(8);
      setNotice(`Graded ${r.graded} event(s) · settled ${r.settlement.settled} bet(s), ` +
                `${r.settlement.won} won / ${r.settlement.lost} lost`);
      refreshBets();
      await loadEvents();
      const b = await api.balance();
      onBalance(b.balance);
    } catch (e: any) { setNotice(e.message); }
  }

  const selected = useMemo(() => new Set(slip.map((l) => l.selectionId)), [slip]);

  // -------------------------------------------------- phase 1: pick sports --
  if (phase === "pick" && view === "board") {
    const toggleSport = (key: string) => {
      const s = catalog.get(key);
      if (!s) return;
      setChecked((prev) => {
        const next = new Set(prev);
        const all = [...s.leagues.keys()];
        const allOn = all.every((k) => next.has(k));
        all.forEach((k) => (allOn ? next.delete(k) : next.add(k)));
        return next;
      });
    };
    return (
      <div className="mx-auto max-w-2xl space-y-3">
        {/* balance strip + ticket type, the way a player expects to land */}
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/5 bg-base-800 shadow-card px-4 py-3">
          <div className="text-xs">
            <div>
              <span className="text-slate-500">Balance </span>
              <span className={`font-mono font-bold ${
                fig && Number(fig.balance) < 0 ? "text-red-400" : "text-accent"}`}>
                {fig ? Number(fig.balance).toFixed(2) : "…"}
              </span>
            </div>
            <div>
              <span className="text-slate-500">Available </span>
              <span className="font-mono font-bold text-accent">
                {fig ? Number(fig.available).toFixed(2) : "…"}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <select value={preset}
              onChange={(e) => {
                const v = e.target.value;
                if (v === "goto_live") { setLiveOnly(true); setPropsOnly(false); setPhase("board"); return; }
                if (v === "goto_props") { setPropsOnly(true); setLiveOnly(false); setPhase("board"); return; }
                if (v === "goto_casino") { onCasino?.(); return; }
                if (v === "goto_horses") { onHorses?.(); return; }
                setPreset(v as TicketType);
              }}
              className="rounded-lg btn-gold px-3 py-2 text-xs font-bold text-base-900 outline-none">
              <optgroup label="Ticket type">
                <option value="auto">Straight / Parlay</option>
                <option value="teaser">Teaser</option>
                <option value="if_win">If-Win</option>
                <option value="if_action">If-Action</option>
                <option value="reverse">Reverse</option>
              </optgroup>
              <optgroup label="Go to">
                <option value="goto_live">Live Betting{anyLive ? " ●" : ""}</option>
                <option value="goto_props">Props +</option>
                {onHorses && <option value="goto_horses">Horses</option>}
                {onCasino && <option value="goto_casino">Casino</option>}
              </optgroup>
            </select>
            <button onClick={() => setView("bets")}
              className="rounded-lg bg-base-700 px-3 py-2 text-xs hover:bg-base-600">
              My bets ({bets.length})
            </button>
          </div>
        </div>

        {notice && (
          <div className="rounded bg-base-700 px-3 py-2 text-xs text-slate-300">{notice}</div>
        )}

        {preset === "teaser" && (
          <select value={presetTier} onChange={(e) => setPresetTier(Number(e.target.value))}
            className="w-full rounded-xl border border-white/5 bg-base-800 shadow-card px-4 py-2.5 text-sm font-semibold text-slate-100 outline-none">
            <option value={0}>2 – 6 Team Standard (6 pts FB, 4 pts BK) · 2tm −110</option>
            <option value={1}>2 – 6 Team Standard +½ (6.5 pts FB, 4.5 pts BK) · 2tm −120</option>
            <option value={2}>2 – 6 Team Standard +1 (7 pts FB, 5 pts BK) · 2tm −130</option>
            <option value={3}>3 Team Super Teaser −140 (10 pts FB, 8 pts BK) — Ties Lose</option>
          </select>
        )}

        {loading ? (
          <div className="rounded-xl border border-white/5 bg-base-800 shadow-card p-8 text-center text-sm text-slate-500">loading…</div>
        ) : (
          <div className="space-y-2">
            {[...catalog.entries()]
              .filter(([key]) => preset !== "teaser"
                || key === "americanfootball" || key === "basketball")
              .map(([key, s]) => {
              const open = expanded.has(key);
              const leagueKeys = [...s.leagues.keys()];
              const onCount = leagueKeys.filter((k) => checked.has(k)).length;
              return (
                <div key={key} className="overflow-hidden rounded-xl border border-white/5 bg-base-800 shadow-card">
                  <div className="flex w-full items-center gap-3 px-4 py-3">
                    <button onClick={() => toggleSport(key)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                      <span className="text-lg">{s.icon}</span>
                      <span className="text-sm font-bold uppercase tracking-wide text-slate-100">
                        {s.name}
                      </span>
                      {s.live && (
                        <span className="rounded bg-red-500/20 px-1.5 py-0.5 text-[9px] font-bold uppercase text-red-300">
                          live
                        </span>
                      )}
                      {onCount > 0 && (
                        <span className="rounded bg-gold/20 px-1.5 py-0.5 font-mono text-[10px] font-bold text-gold">
                          {onCount}
                        </span>
                      )}
                    </button>
                    <button onClick={() => setExpanded((p) => {
                        const n = new Set(p); n.has(key) ? n.delete(key) : n.add(key); return n;
                      })}
                      className="grid h-7 w-7 place-items-center rounded-lg bg-base-700 text-base font-bold text-gold hover:bg-base-600">
                      {open ? "−" : "+"}
                    </button>
                  </div>
                  {open && (
                    <div className="border-t border-base-700/60">
                      {leagueKeys.map((lk) => {
                        const l = s.leagues.get(lk)!;
                        const on = checked.has(lk);
                        return (
                          <button key={lk}
                            onClick={() => setChecked((p) => {
                              const n = new Set(p); on ? n.delete(lk) : n.add(lk); return n;
                            })}
                            className="flex w-full items-center justify-between px-4 py-2.5 text-left hover:bg-base-700/40">
                            <span className="flex items-center gap-2.5 text-xs text-slate-200">
                              <span className={`grid h-4 w-4 place-items-center rounded-sm text-[10px] font-bold ${
                                on ? "btn-gold text-base-900" : "bg-base-700 text-transparent"}`}>✓</span>
                              {l.name}
                              {l.live && <span className="text-[9px] font-bold uppercase text-red-400">● live</span>}
                            </span>
                            <span className="font-mono text-[10px] text-slate-500">{l.count}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => { setChecked(new Set()); loadEvents(); }}
            className="rounded-lg bg-red-700/80 py-2.5 text-sm font-bold text-white hover:bg-red-600">
            Refresh
          </button>
          <button onClick={() => setPhase("board")}
            className="rounded-lg bg-accent py-2.5 text-sm font-bold text-base-900 hover:brightness-110">
            Continue{checked.size > 0 ? ` (${checked.size})` : " — all sports"}
          </button>
        </div>
        {isAdmin && (
          <button onClick={simulate}
            className="w-full rounded bg-gold/20 px-3 py-1.5 text-xs text-gold hover:bg-gold/30">
            Simulate results (operator)
          </button>
        )}
      </div>
    );
  }

  // ------------------------------------------------------ phase 2: the board --
  return (
    <div className={(!liveOnly && !propsOnly && preset === "auto")
      ? "grid gap-5" : "grid gap-5 lg:grid-cols-[1fr_320px]"}>
      <div className="min-w-0">
        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          <button onClick={() => { setPhase("pick"); setView("board"); setLiveOnly(false); setPropsOnly(false); }}
            className="rounded bg-base-700 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-base-600">
            ← Sports
          </button>
          <span className="text-[11px] text-slate-500">
            {liveOnly ? <span className="font-bold text-red-400">Live betting</span>
              : propsOnly ? <span className="font-bold text-gold">Props +</span>
              : checked.size === 0 ? "All sports" : `${checked.size} league(s)`}
            {" · "}{shownEvents.length} game(s)
          </span>
          <div className="ml-auto flex gap-1.5">
            <button onClick={() => setView(view === "board" ? "bets" : "board")}
              className="rounded bg-base-700 px-3 py-1.5 text-xs hover:bg-base-600">
              {view === "board" ? `My bets (${bets.length})` : "Back to board"}
            </button>
            {isAdmin && (
              <button onClick={simulate}
                className="rounded bg-gold/20 px-3 py-1.5 text-xs text-gold hover:bg-gold/30"
                title="Operator: ends events, grades every selection, settles bets">
                Simulate results
              </button>
            )}
          </div>
        </div>

        {notice && (
          <div className="mb-3 rounded bg-base-700 px-3 py-2 text-xs text-slate-300">{notice}</div>
        )}

        {view === "bets" ? (
          <MyBets bets={bets} />
        ) : loading ? (
          <div className="rounded-xl border border-white/5 bg-base-800 shadow-card p-8 text-center text-sm text-slate-500">loading…</div>
        ) : (
          propsOnly ? (
          <PropsBoard events={shownEvents} selected={selected} onPick={toggle} />
        ) : (!liveOnly && preset === "auto") ? (
          confirming ? (
            <ConfirmWagers picks={classicPicks} setPicks={setClassicPicks}
              onBack={() => setConfirming(false)}
              onPlaced={(b) => { onBalance(b); refreshBets();
                api.myFigures().then((f) => setFig({ balance: f.balance, available: f.available }))
                  .catch(() => {}); }} />
          ) : (
            <ClassicBoard events={shownEvents} picks={classicPicks}
              onToggle={(pk) => setClassicPicks((old) => {
                const n = new Map(old);
                n.has(pk.sel.id) ? n.delete(pk.sel.id) : n.set(pk.sel.id, pk);
                return n;
              })}
              onRefresh={() => loadEvents()}
              onContinue={() => setConfirming(true)}
              onProps={() => setPropsOnly(true)} />
          )
        ) : liveOnly ? (
          (() => {
            const liveEvs = shownEvents.filter((e) => e.status === "live");
            const det = liveDetail != null ? liveEvs.find((e) => e.id === liveDetail) : undefined;
            if (det) {
              return <LiveDetail ev={det} selected={selected} onPick={toggle}
                onBack={() => setLiveDetail(null)} />;
            }
            return <LiveBoard events={liveEvs} selected={selected} onPick={toggle}
              onOpen={(id) => setLiveDetail(id)} />;
          })()
        ) : (
          <div className="space-y-3">
            {shownEvents.some((e) => e.status === "live") && (
              <div className="flex items-center gap-2 pt-1 text-[11px] font-bold uppercase tracking-wider text-red-400">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-60" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
                </span>
                Live now
              </div>
            )}
            <Board events={shownEvents.filter((e) => e.status === "live")}
              selected={selected} onPick={toggle} />
            {shownEvents.some((e) => e.status === "live") && shownEvents.some((e) => e.status !== "live") && (
              <div className="pt-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Upcoming
              </div>
            )}
            <Board events={shownEvents.filter((e) => e.status !== "live")}
              selected={selected} onPick={toggle} />
            {shownEvents.length === 0 && (
              <div className="rounded-xl border border-white/5 bg-base-800 shadow-card p-8 text-center text-sm text-slate-500">
                No open events left in this sport — an operator needs to refresh the feed.
              </div>
            )}
          </div>
        ))}
      </div>

      {!(!liveOnly && !propsOnly && preset === "auto") && (
      <div id="bet-slip-anchor">
        <BetSlip slip={slip} setSlip={setSlip} preset={preset} presetTier={presetTier}
          onPlaced={(b) => { onBalance(b); refreshBets();
            api.myFigures().then((f) => setFig({ balance: f.balance, available: f.available }))
              .catch(() => {}); }} />
      </div>
      )}

      {/* phones: the slip lives below the fold — give every pick a visible
          landing and a one-tap way down to it */}
      {slip.length > 0 && view === "board" && !(!liveOnly && !propsOnly && preset === "auto") && (
        <button
          onClick={() => document.getElementById("bet-slip-anchor")
            ?.scrollIntoView({ behavior: "smooth", block: "start" })}
          className="fixed inset-x-3 bottom-3 z-40 flex items-center justify-between rounded-xl btn-gold px-4 py-3 text-sm font-black text-base-900 shadow-pop lg:hidden">
          <span>Bet Slip · {slip.length} pick{slip.length > 1 ? "s" : ""}</span>
          <span>Tap to place ↓</span>
        </button>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ pieces --
function OddsButton({ sel, active, onClick }: {
  sel: SbSelection; active: boolean; onClick: () => void;
}) {
  return (
    <button onClick={onClick}
      className={`flex-1 rounded-lg px-2 py-2 text-left transition ${
        active ? "btn-gold text-base-900" : "border border-white/5 bg-base-700/80 hover:border-gold/30 hover:bg-base-600"}`}>
      <div className={`truncate text-[11px] ${active ? "text-base-900/70" : "text-slate-400"}`}>
        {sel.name}
      </div>
      <div className="font-mono text-sm font-semibold">{Number(sel.odds).toFixed(2)}</div>
      <div className={`font-mono text-[10px] ${active ? "text-base-900/60" : "text-slate-500"}`}>
        {sel.american} · {sel.implied_pct}%
      </div>
    </button>
  );
}

// ------------------------------------------------------- the classic board --
type PickFn = (ev: SbEvent, m: { name: string }, s: SbSelection) => void;

const fmtLine = (v: number) => `${v > 0 ? "+" : ""}${v}`;

function LineCell({ sel, label, active, onClick }: {
  sel: SbSelection | undefined; label?: string;
  active: boolean; onClick: () => void;
}) {
  const fmt = useOddsFmt();
  if (!sel) {
    return <div className="flex h-11 items-center justify-center rounded bg-base-900/60
      text-[10px] text-slate-600">—</div>;
  }
  const price = fmt === "american" ? sel.american
    : fmt === "decimal" ? Number(sel.odds).toFixed(2)
    : `${sel.american} · ${Number(sel.odds).toFixed(2)}`;
  return (
    <button onClick={onClick}
      className={`flex h-11 w-full flex-col items-center justify-center rounded transition ${
        active ? "btn-gold text-base-900" : "border border-white/5 bg-base-700/80 hover:border-gold/30 hover:bg-base-600"}`}>
      {label && (
        <span className={`font-mono text-[10px] leading-tight ${
          active ? "text-base-900/70" : "text-slate-400"}`}>{label}</span>
      )}
      <span className={`font-mono font-bold leading-tight ${
        fmt === "both" ? "text-[10px]" : "text-xs"}`}>{price}</span>
    </button>
  );
}

function BoardRow({ ev, selected, onPick }: {
  ev: SbEvent; selected: Set<number>; onPick: PickFn;
}) {
  const [open, setOpen] = useState(false);
  const live = ev.status === "live";
  const kickoff = new Date(ev.starts_at);

  const spread = ev.markets.find((m) => m.type === "spreads");
  const total = ev.markets.find((m) => m.type === "totals");
  const ml = ev.markets.find((m) => m.type === "h2h");
  const mains = new Set([spread?.id, total?.id, ml?.id]);
  const rest = ev.markets.filter((m) => !mains.has(m.id)
    && !m.type.startsWith("prop:") && !m.type.startsWith("alt_"));

  const bySel = (m: typeof spread, key: string) =>
    m?.selections.find((s) => s.key === key);
  const line = spread?.line ? Number(spread.line) : null;
  const homeRot = 899 + 2 * ev.id;
  const awayRot = 900 + 2 * ev.id;
  const draw = bySel(ml, "draw");

  const team = (name: string, rot: number, score: number | null) => (
    <div className="flex min-w-0 items-center gap-2">
      <span className="w-9 shrink-0 font-mono text-[11px] text-gold">{rot}</span>
      <span className="truncate font-sans text-xs text-slate-200">{name}</span>
      {live && score !== null && (
        <span className="ml-auto pr-2 font-mono text-xs font-bold text-gold">{score}</span>
      )}
    </div>
  );

  return (
    <div className={`border-t border-base-700/60 ${live ? "bg-red-500/5" : ""}`}>
      <div className="grid grid-cols-[110px_minmax(140px,1fr)_88px_88px_88px] items-center
        gap-1.5 px-3 py-1.5">
        {/* when */}
        <div className="text-[10px] leading-tight text-slate-500">
          {live ? (
            <span className="font-bold text-red-400">● LIVE {ev.period ?? ""}</span>
          ) : (
            <>
              {kickoff.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
              <br />
              {kickoff.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
            </>
          )}
        </div>
        {/* teams */}
        <div className="min-w-0 space-y-1.5">
          {team(ev.home, homeRot, ev.home_score)}
          {team(ev.away, awayRot, ev.away_score)}
        </div>
        {/* spread */}
        <div className="space-y-1.5">
          <LineCell sel={bySel(spread, "home")}
            label={line !== null ? fmtLine(line) : undefined}
            active={!!bySel(spread, "home") && selected.has(bySel(spread, "home")!.id)}
            onClick={() => spread && onPick(ev, spread, bySel(spread, "home")!)} />
          <LineCell sel={bySel(spread, "away")}
            label={line !== null ? fmtLine(-line) : undefined}
            active={!!bySel(spread, "away") && selected.has(bySel(spread, "away")!.id)}
            onClick={() => spread && onPick(ev, spread, bySel(spread, "away")!)} />
        </div>
        {/* total */}
        <div className="space-y-1.5">
          <LineCell sel={bySel(total, "over")}
            label={total?.line ? `O ${total.line}` : undefined}
            active={!!bySel(total, "over") && selected.has(bySel(total, "over")!.id)}
            onClick={() => total && onPick(ev, total, bySel(total, "over")!)} />
          <LineCell sel={bySel(total, "under")}
            label={total?.line ? `U ${total.line}` : undefined}
            active={!!bySel(total, "under") && selected.has(bySel(total, "under")!.id)}
            onClick={() => total && onPick(ev, total, bySel(total, "under")!)} />
        </div>
        {/* moneyline */}
        <div className="space-y-1.5">
          <LineCell sel={bySel(ml, "home")}
            active={!!bySel(ml, "home") && selected.has(bySel(ml, "home")!.id)}
            onClick={() => ml && onPick(ev, ml, bySel(ml, "home")!)} />
          <LineCell sel={bySel(ml, "away")}
            active={!!bySel(ml, "away") && selected.has(bySel(ml, "away")!.id)}
            onClick={() => ml && onPick(ev, ml, bySel(ml, "away")!)} />
        </div>
      </div>

      {(draw || rest.length > 0) && (
        <div className="px-3 pb-1.5 pl-[122px]">
          <div className="flex items-center gap-2">
            {draw && ml && (
              <button onClick={() => onPick(ev, ml, draw)}
                className={`rounded px-2 py-1 font-mono text-[10px] ${
                  selected.has(draw.id) ? "btn-gold font-bold text-base-900"
                    : "bg-base-700 text-slate-300 hover:bg-base-600"}`}>
                Draw {draw.american}
              </button>
            )}
            {rest.length > 0 && (
              <button onClick={() => setOpen(!open)}
                className="text-[10px] text-slate-500 hover:text-slate-300">
                {open ? "− hide" : `+ ${rest.length} more`}
              </button>
            )}
          </div>
          {open && (
            <div className="mt-1.5 space-y-2 border-t border-base-700/60 pt-2">
              {rest.map((m) => (
                <div key={m.id}>
                  <div className="mb-1 flex justify-between text-[10px] uppercase tracking-wide text-slate-500">
                    <span>{m.name}</span>
                    {m.hold_pct && <span>hold {m.hold_pct}%</span>}
                  </div>
                  <div className="flex gap-1.5">
                    {m.selections.map((s) => (
                      <OddsButton key={s.id} sel={s} active={selected.has(s.id)}
                        onClick={() => onPick(ev, m, s)} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Board({ events, selected, onPick }: {
  events: SbEvent[]; selected: Set<number>; onPick: PickFn;
}) {
  if (events.length === 0) return null;
  // group consecutive events by competition, the way a printed board reads
  const groups: { key: string; icon: string; name: string; events: SbEvent[] }[] = [];
  for (const ev of events) {
    const last = groups[groups.length - 1];
    if (last && last.key === ev.competition_key) last.events.push(ev);
    else groups.push({ key: ev.competition_key, icon: ev.icon,
                       name: ev.competition, events: [ev] });
  }
  return (
    <div className="space-y-3">
      {groups.map((g, gi) => (
        <div key={`${g.key}-${gi}`} className="overflow-x-auto rounded-xl border border-white/5 bg-base-800 shadow-card">
          <div className="min-w-[560px]">
            <div className="grid grid-cols-[110px_minmax(140px,1fr)_88px_88px_88px] items-center
              gap-1.5 bg-base-900/60 px-3 py-2">
              <div className="text-xs font-bold text-slate-200">{g.icon} {g.name}</div>
              <div />
              <div className="text-center text-[9px] font-semibold uppercase tracking-wider text-slate-500">Spread</div>
              <div className="text-center text-[9px] font-semibold uppercase tracking-wider text-slate-500">Total</div>
              <div className="text-center text-[9px] font-semibold uppercase tracking-wider text-slate-500">Money Line</div>
            </div>
            {g.events.map((ev) => (
              <BoardRow key={ev.id} ev={ev} selected={selected} onPick={onPick} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

const TICKET_TYPES = [
  { id: "auto", label: "Parlay" },
  { id: "teaser", label: "Teaser" },
  { id: "if_win", label: "If-Win" },
  { id: "if_action", label: "If-Action" },
  { id: "reverse", label: "Reverse" },
] as const;
type TicketType = typeof TICKET_TYPES[number]["id"];

function BetSlip({ slip, setSlip, onPlaced, preset = "auto", presetTier = 0 }: {
  slip: SlipLeg[]; setSlip: (f: (p: SlipLeg[]) => SlipLeg[]) => void;
  onPlaced: (balance: string) => void; preset?: TicketType; presetTier?: number;
}) {
  const [stake, setStake] = useState("10");
  const [ticket, setTicket] = useState<TicketType>("auto");
  const [tier, setTier] = useState(0);
  const [quote, setQuote] = useState<SbQuote | null>(null);
  const [quoteErr, setQuoteErr] = useState("");
  const [accept, setAccept] = useState(true);
  const [useFp, setUseFp] = useState(false);
  const [fpBalance, setFpBalance] = useState("0");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.balance().then((b) => setFpBalance(b.free_play)).catch(() => {});
  }, []);
  // free play covers straights and parlays only
  useEffect(() => { if (useFp && ticket !== "auto") setUseFp(false); }, [ticket, useFp]);

  const dupEvent = useMemo(() => {
    const ids = slip.map((l) => l.eventId);
    return slip.length > 1 && new Set(ids).size !== ids.length;
  }, [slip]);

  // one leg is always a straight; the exotic modes need two
  useEffect(() => { if (slip.length < 2 && ticket !== "auto") setTicket("auto"); },
    [slip.length, ticket]);
  // the type chosen on the landing screen carries onto the slip
  useEffect(() => {
    if (slip.length === 2 && preset !== "auto") { setTicket(preset); setTier(presetTier); }
  }, [slip.length, preset, presetTier]);

  useEffect(() => {
    if (slip.length === 0) { setQuote(null); setQuoteErr(""); return; }
    setQuoteErr("");
    api.sbQuote(slip.map((l) => l.selectionId), stake || "0", ticket,
                ticket === "teaser" ? tier : undefined)
      .then(setQuote)
      .catch((e) => { setQuote(null); setQuoteErr(e.message); });
  }, [slip, stake, ticket, tier]);

  async function place() {
    setErr(""); setBusy(true);
    try {
      const r = await api.sbPlace(
        slip.map((l) => ({ selection_id: l.selectionId, odds: l.odds })), stake, accept,
        ticket, ticket === "teaser" ? tier : undefined, useFp);
      onPlaced(r.balance);
      api.balance().then((b) => setFpBalance(b.free_play)).catch(() => {});
      setSlip(() => []);
      setTicket("auto");
      setUseFp(false);
    } catch (e: any) {
      let m = e.message;
      try {
        const d = JSON.parse(m.replace(/'/g, '"'));
        if (d.reason === "correlated_legs") m = "Two legs from the same event — correlated parlays aren't priced here.";
        else if (d.reason === "odds_changed") m = `Price moved: ${d.was} → ${d.now}. Enable “accept changes”.`;
        else if (d.reason === "insufficient_balance") m = "Not enough credits.";
        else if (d.reason === "event_started") m = "That event has already kicked off.";
        else if (d.reason === "circled_limit") m = `That game is circled — max ${d.max} on it.`;
        else if (d.reason === "market_suspended") m = "That market is suspended — in-play, only the moneyline stays open.";
        else if (d.reason === "halftime_blocked") m = "Wagering is blocked at halftime on this book.";
        else if (d.reason === "pregame_blocked") m = "This book is live-only right now — wait for kickoff.";
        else if (d.reason === "live_parlays_off") m = "Live parlays are switched off on this book.";
        else if (d.reason === "stake_over_max") m = `Max stake on that ticket type is ${d.max}.`;
        else if (d.reason === "stake_below_min") m = `Minimum stake is ${d.min}.`;
        else if (d.reason === "line_too_steep") m = `That favorite is past the book's line cap (${d.max_favorite}).`;
        else if (d.reason === "line_too_long") m = `That dog is past the book's line cap (+${d.max_dog}).`;
        else if (d.reason === "over_offering_limit") m = `You're at the per-offering cap (${d.max}) on that line.`;
        else if (d.reason === "over_event_limit") m = `You're at the per-game cap (${d.max}) on that event.`;
        else if (d.reason === "over_max_win") m = `That ticket would exceed the max win of ${d.max_win}.`;
        else if (d.reason === "cooloff") m = `Wager cool-off: try again in ${d.wait_sec}s.`;
        else if (d.reason === "not_teaseable") m = d.note ?? "That leg can't go in a teaser.";
        else if (d.reason === "needs_two_legs") m = "That ticket type needs at least two legs.";
        else if (d.reason === "bad_teaser_size") m = "Teasers take 2 to 6 legs.";
        else m = d.reason ?? m;
      } catch { /* leave as-is */ }
      setErr(m);
    } finally { setBusy(false); }
  }

  return (
    <aside className="h-fit rounded-xl border border-white/5 bg-base-800 shadow-card p-4 lg:sticky lg:top-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-200">
          Bet slip {slip.length > 1 && (
            <span className="text-slate-500">· {slip.length} legs</span>
          )}
        </h3>
        {slip.length > 0 && (
          <button onClick={() => setSlip(() => [])} className="text-[11px] text-slate-500 hover:text-slate-300">
            clear
          </button>
        )}
      </div>

      {slip.length > 1 && (
        <div className="mb-3">
          <div className="flex flex-wrap gap-1">
            {TICKET_TYPES.map((t) => (
              <button key={t.id} onClick={() => setTicket(t.id)}
                className={`rounded px-2 py-1 text-[10px] font-semibold ${
                  ticket === t.id ? "btn-gold text-base-900"
                    : "bg-base-700 text-slate-400 hover:bg-base-600"}`}>
                {t.label}
              </button>
            ))}
          </div>
          {ticket === "teaser" && (
            <select value={tier} onChange={(e) => setTier(Number(e.target.value))}
              className="mt-2 w-full rounded bg-base-700 px-2 py-1.5 text-[11px] text-slate-200 outline-none">
              <option value={0}>6 pts football / 4 pts basketball (2tm −110)</option>
              <option value={1}>6½ pts / 4½ pts (2tm −120)</option>
              <option value={2}>7 pts / 5 pts (2tm −130)</option>
              <option value={3}>Super Teaser — 3 teams, 10/8 pts, −140, ties LOSE</option>
            </select>
          )}
          {(ticket === "if_win" || ticket === "if_action") && (
            <p className="mt-2 text-[10px] leading-snug text-slate-500">
              Legs fire in the order you added them. The stake rides leg 1
              {ticket === "if_win" ? "; only a WIN sends it to the next leg."
                : "; a win or a push sends it on — only a loss stops the chain."}
              {" "}Most you can lose on the whole chain: one stake.
            </p>
          )}
          {ticket === "reverse" && (
            <p className="mt-2 text-[10px] leading-snug text-slate-500">
              Every ordered pair as two-leg if-action chains — cost is the stake
              × {slip.length * (slip.length - 1)} chains.
            </p>
          )}
        </div>
      )}

      {slip.length === 0 && (
        <p className="py-6 text-center text-xs text-slate-500">
          Tap any price to add it. Add legs from different events to build a parlay.
        </p>
      )}

      <div className="space-y-2">
        {slip.map((l, i) => {
          const teasedLeg = quote?.teased?.find((t) => t.selection_id === l.selectionId);
          return (
          <div key={l.selectionId} className="rounded bg-base-700 p-2">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate text-xs font-medium text-slate-100">
                  {(ticket === "if_win" || ticket === "if_action") && (
                    <span className="mr-1 rounded bg-base-800 px-1 font-mono text-[10px] text-gold">
                      {i + 1}
                    </span>
                  )}
                  {l.label}
                </div>
                <div className="truncate text-[10px] text-slate-400">{l.market}</div>
                {teasedLeg && (
                  <div className="truncate text-[10px] font-semibold text-accent">
                    teased {teasedLeg.from_line} → {teasedLeg.teased_line}
                  </div>
                )}
                <div className="truncate text-[10px] text-slate-500">{l.event}</div>
              </div>
              <div className="flex shrink-0 flex-col items-end">
                <span className="font-mono text-xs text-gold">{Number(l.odds).toFixed(2)}</span>
                <button onClick={() => setSlip((p) => p.filter((x) => x.selectionId !== l.selectionId))}
                  className="text-[10px] text-slate-500 hover:text-red-400">remove</button>
              </div>
            </div>
          </div>
          );
        })}
      </div>

      {dupEvent && (
        <div className="mt-2 rounded bg-amber-500/10 px-2 py-1.5 text-[11px] text-amber-300">
          Two legs from the same event. Those outcomes are correlated, so multiplying their
          odds would misprice the bet — this book blocks it.
        </div>
      )}

      {slip.length > 0 && (
        <>
          <label className="mb-1 mt-3 block text-[10px] uppercase tracking-wide text-slate-500">Stake</label>
          <input className="w-full rounded bg-base-700 px-3 py-2 font-mono text-sm outline-none"
            value={stake} onChange={(e) => setStake(e.target.value)} inputMode="decimal" />
          <div className="mt-1 flex gap-1">
            {["5", "10", "25", "100"].map((v) => (
              <button key={v} onClick={() => setStake(v)}
                className="flex-1 rounded bg-base-700 py-1 text-[11px] hover:bg-base-600">{v}</button>
            ))}
          </div>

          <label className="mt-3 flex items-center gap-2 text-[11px] text-slate-400">
            <input type="checkbox" checked={accept} onChange={(e) => setAccept(e.target.checked)} />
            accept odds changes
          </label>
          {Number(fpBalance) > 0 && ticket === "auto" && (
            <label className="mt-1.5 flex items-center gap-2 text-[11px] text-sky-300">
              <input type="checkbox" checked={useFp} onChange={(e) => setUseFp(e.target.checked)} />
              use free play ({Number(fpBalance).toFixed(2)} available)
            </label>
          )}
          {useFp && (
            <p className="mt-1 text-[10px] leading-snug text-slate-500">
              Free play rides the ticket but only the winnings pay out. Win or lose,
              the free play itself is used up; a push hands it back.
            </p>
          )}

          {quoteErr && (
            <div className="mt-2 rounded bg-amber-500/10 px-2 py-1.5 text-[11px] text-amber-300">
              {quoteErr}
            </div>
          )}
          {quote && (
            <div className="mt-3 space-y-1 border-t border-base-700 pt-3 text-xs">
              {quote.label && <Line k="Ticket" v={quote.label} />}
              {isFinite(Number(quote.total_odds)) ? (
                <Line k="Total odds" v={`${Number(quote.total_odds).toFixed(2)} (${quote.american})`} />
              ) : null}
              {quote.cost && <Line k="Total cost" v={quote.cost} />}
              {quote.max_risk && <Line k="Max risk" v={quote.max_risk} />}
              <Line k="To return (best case)" v={quote.potential} accent />
              <Line k="Profit (best case)" v={quote.profit} />
              {slip.length > 1 && ticket === "auto" && (
                <p className="pt-1 text-[10px] leading-snug text-slate-500">
                  Margin compounds with each leg — that’s why parlays are pushed so hard.
                </p>
              )}
              {ticket === "teaser" && (
                <p className="pt-1 text-[10px] leading-snug text-slate-500">
                  Every leg must cover its moved number. A push drops the ticket to the
                  next size down; a two-teamer with a push refunds.
                </p>
              )}
            </div>
          )}

          <button onClick={place} disabled={busy || dupEvent}
            className="mt-3 w-full rounded-lg btn-gold py-2.5 text-sm font-bold text-base-900 disabled:opacity-40">
            {busy ? "placing…" : "Place bet"}
          </button>
          {err && <div className="mt-2 rounded bg-red-950 px-2 py-1.5 text-[11px] text-red-300">{err}</div>}
        </>
      )}
    </aside>
  );
}

const TYPE_LABEL: Record<string, string> = {
  single: "straight", parlay: "parlay", teaser: "teaser",
  if_win: "if-win", if_action: "if-action", reverse: "reverse",
};

function MyBets({ bets }: { bets: SbBet[] }) {
  if (bets.length === 0) {
    return <div className="rounded-xl border border-white/5 bg-base-800 shadow-card p-8 text-center text-sm text-slate-500">No bets yet.</div>;
  }
  const tone: Record<string, string> = {
    won: "text-accent", lost: "text-red-400", void: "text-slate-400",
    open: "text-amber-300", partial: "text-accent",
  };
  return (
    <div className="space-y-2">
      {bets.map((b) => (
        <div key={b.bet_id} className="rounded-xl border border-white/5 bg-base-800 shadow-card p-4">
          <div className="mb-2 flex items-center justify-between text-xs">
            <span className="text-slate-400">
              #{b.bet_id} · {TYPE_LABEL[b.type] ?? b.type}
              {b.free_play && <span className="ml-1 rounded bg-sky-500/20 px-1 text-[9px] font-bold text-sky-300">FP</span>}
              {" · "}{Number(b.stake).toFixed(2)}
              {isFinite(Number(b.total_odds)) ? ` @ ${Number(b.total_odds).toFixed(2)}` : ""}
            </span>
            <span className={`font-semibold uppercase ${tone[b.status] ?? "text-slate-400"}`}>
              {b.status}
              {b.payout !== null && Number(b.payout) > 0 && (
                <span className="ml-2 font-mono">+{Number(b.payout).toFixed(2)}</span>
              )}
            </span>
          </div>
          <div className="space-y-1">
            {b.legs.map((l, i) => (
              <div key={i} className="flex items-center justify-between gap-2 border-t border-base-700 pt-1 text-[11px] first:border-0 first:pt-0">
                <div className="min-w-0">
                  <div className="truncate text-slate-200">{l.selection}</div>
                  <div className="truncate text-slate-500">{l.event} · {l.market}</div>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  {l.score && <span className="font-mono text-slate-400">{l.score}</span>}
                  <span className="font-mono text-slate-300">{Number(l.odds).toFixed(2)}</span>
                  <span className={`w-16 text-right font-medium ${tone[l.result ?? "open"] ?? "text-slate-500"}`}>
                    {l.result ?? "open"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function Line({ k, v, accent = false }: { k: string; v: string; accent?: boolean }) {
  return (
    <div className="flex justify-between">
      <span className="text-slate-400">{k}</span>
      <span className={`font-mono ${accent ? "font-semibold text-accent" : "text-slate-200"}`}>{v}</span>
    </div>
  );
}

// ------------------------------------------------------- live betting board --
// Matches the classic in-play layout: sport strip, league cards, score rows,
// two switchable market columns, and a count chevron into the full game view.

function bestOfType(ev: SbEvent, type: string): SbMarket | undefined {
  const of = ev.markets.filter((m) => m.type === type && m.selections.length === 2);
  if (of.length === 0) return undefined;
  // the most balanced rung reads as "the" line
  return of.reduce((a, b) => {
    const bal = (m: SbMarket) =>
      Math.abs(Number(m.selections[0].odds) - Number(m.selections[1].odds));
    return bal(b) < bal(a) ? b : a;
  });
}

const LIVE_COLUMNS: [string, string][] = [
  ["winner", "Game Winner"], ["spread", "Game Spread"], ["total", "Game Total"],
];

function colMarket(ev: SbEvent, col: string): SbMarket | undefined {
  if (col === "winner") return ev.markets.find((m) => m.type === "h2h");
  if (col === "spread") return bestOfType(ev, "alt_spreads");
  return bestOfType(ev, "alt_totals");
}

function LiveCell({ ev, m, side, onPick, active }: {
  ev: SbEvent; m: SbMarket | undefined; side: 0 | 1;
  onPick: PickFn; active: Set<number>;
}) {
  const sel = m?.selections[side];
  if (!m || !sel) {
    return <div className="grid h-10 place-items-center rounded bg-base-900/50 text-[10px] text-slate-600">—</div>;
  }
  const tag = m.type === "alt_totals"
    ? `${side === 0 ? "o" : "u"}${m.line}`
    : m.type === "alt_spreads"
      ? `${side === 0 ? fmtLine(Number(m.line)) : fmtLine(-Number(m.line))}`
      : null;
  return (
    <button onClick={() => onPick(ev, { name: m.name }, sel)}
      className={`flex h-10 w-full items-center justify-center gap-1.5 rounded border text-xs font-semibold transition ${
        active.has(sel.id) ? "btn-gold border-transparent text-base-900"
          : "border-white/5 bg-base-700/70 text-gold hover:border-gold/40 hover:bg-base-600"}`}>
      {tag && <span className={active.has(sel.id) ? "text-base-900/70" : "text-slate-400"}>{tag}</span>}
      <span className="font-mono">{sel.american}</span>
    </button>
  );
}

function LiveBoard({ events, selected, onPick, onOpen }: {
  events: SbEvent[]; selected: Set<number>; onPick: PickFn;
  onOpen: (id: number) => void;
}) {
  const [sport, setSport] = useState<string>("all");
  const [q, setQ] = useState("");
  const [col1, setCol1] = useState("winner");
  const [col2, setCol2] = useState("total");

  const sports = useMemo(() => {
    const seen = new Map<string, { name: string; icon: string; n: number }>();
    for (const e of events) {
      const s = seen.get(e.sport) ?? { name: e.sport_name, icon: e.icon, n: 0 };
      s.n += 1;
      seen.set(e.sport, s);
    }
    return [...seen.entries()];
  }, [events]);

  const shown = events.filter((e) =>
    (sport === "all" || e.sport === sport) &&
    (q.trim() === "" || `${e.home} ${e.away} ${e.competition}`
      .toLowerCase().includes(q.trim().toLowerCase())));

  const leagues = new Map<string, { name: string; icon: string; evs: SbEvent[] }>();
  for (const e of shown) {
    const l = leagues.get(e.competition_key) ?? { name: e.competition, icon: e.icon, evs: [] };
    l.evs.push(e);
    leagues.set(e.competition_key, l);
  }

  if (events.length === 0) {
    return (
      <div className="rounded-xl border border-white/5 bg-base-800 shadow-card p-8 text-center text-sm text-slate-500">
        Nothing is in play right now — check back at game time.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* sport strip */}
      <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
        <button onClick={() => setSport("all")}
          className={`flex shrink-0 flex-col items-center gap-1 rounded-lg px-4 py-2 text-[11px] font-semibold ${
            sport === "all" ? "bg-base-700 text-gold" : "bg-base-800 text-slate-300 hover:bg-base-700"}`}>
          <span className="text-xl">⚡</span>All Live
        </button>
        {sports.map(([key, sp]) => (
          <button key={key} onClick={() => setSport(key)}
            className={`flex shrink-0 flex-col items-center gap-1 rounded-lg px-4 py-2 text-[11px] font-semibold ${
              sport === key ? "bg-base-700 text-gold" : "bg-base-800 text-slate-300 hover:bg-base-700"}`}>
            <span className="text-xl">{sp.icon}</span>{sp.name}
          </button>
        ))}
      </div>

      {/* search */}
      <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-base-800 px-3 py-2">
        <span className="text-slate-500">⌕</span>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find in current list"
          className="w-full border-0 bg-transparent text-sm text-slate-200 outline-none"
          style={{ boxShadow: "none" }} />
      </div>

      {[...leagues.entries()].map(([key, lg]) => (
        <div key={key} className="overflow-hidden rounded-xl border border-white/5 bg-base-800 shadow-card">
          <div className="flex items-center gap-2 bg-base-700/60 px-3 py-2">
            <span>{lg.icon}</span>
            <span className="text-sm font-bold text-slate-100">{lg.name}</span>
          </div>
          <div className="grid grid-cols-[minmax(0,1fr)_92px_92px_30px] items-center gap-1.5 px-3 py-1.5 text-[10px] text-slate-500">
            <span />
            <select value={col1} onChange={(e) => setCol1(e.target.value)}
              className="rounded border-0 bg-base-900/60 px-1 py-1 text-center text-[10px] text-slate-400 outline-none">
              {LIVE_COLUMNS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <select value={col2} onChange={(e) => setCol2(e.target.value)}
              className="rounded border-0 bg-base-900/60 px-1 py-1 text-center text-[10px] text-slate-400 outline-none">
              {LIVE_COLUMNS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <span />
          </div>
          {lg.evs.map((ev) => {
            const m1 = colMarket(ev, col1), m2 = colMarket(ev, col2);
            const open = ev.markets.filter((m) => m.selections.length > 0).length;
            return (
              <div key={ev.id} className="border-t border-white/5 px-3 py-2">
                <div className="grid grid-cols-[minmax(0,1fr)_92px_92px_30px] items-center gap-1.5">
                  <div className="min-w-0 space-y-1.5">
                    {[0, 1].map((i) => (
                      <div key={i} className="flex items-center gap-2">
                        <span className="truncate text-xs font-semibold text-slate-200">
                          {i === 0 ? ev.home : ev.away}
                        </span>
                        <span className="ml-auto grid h-5 w-6 shrink-0 place-items-center rounded bg-base-900 font-mono text-[11px] font-bold text-sky-300">
                          {i === 0 ? ev.home_score ?? 0 : ev.away_score ?? 0}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="space-y-1.5">
                    <LiveCell ev={ev} m={m1} side={0} onPick={onPick} active={selected} />
                    <LiveCell ev={ev} m={m1} side={1} onPick={onPick} active={selected} />
                  </div>
                  <div className="space-y-1.5">
                    <LiveCell ev={ev} m={m2} side={0} onPick={onPick} active={selected} />
                    <LiveCell ev={ev} m={m2} side={1} onPick={onPick} active={selected} />
                  </div>
                  <button onClick={() => onOpen(ev.id)}
                    className="grid h-full min-h-[52px] place-items-center rounded text-xs text-slate-400 hover:bg-base-700 hover:text-gold">
                    <span className="flex flex-col items-center leading-tight">
                      <span className="font-mono text-[10px]">{open}</span>
                      <span>›</span>
                    </span>
                  </button>
                </div>
                <div className="mt-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-red-400">
                  <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" />
                  Live · {ev.period ?? ""}
                </div>
              </div>
            );
          })}
        </div>
      ))}
      <p className="px-1 text-[10px] leading-relaxed text-slate-500">
        Scores shown are for reference only. Lines move with the game — the price at
        the moment you place is the price you get.
      </p>
    </div>
  );
}

// -------------------------------------------------------- live game detail --
function LiveDetail({ ev, selected, onPick, onBack }: {
  ev: SbEvent; selected: Set<number>; onPick: PickFn; onBack: () => void;
}) {
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(
    { winner: true, spread: true, total: true });
  const [moreSpread, setMoreSpread] = useState(false);
  const [moreTotal, setMoreTotal] = useState(false);

  const h2h = ev.markets.find((m) => m.type === "h2h");
  const spreads = ev.markets.filter((m) => m.type === "alt_spreads")
    .sort((a, b) => Number(a.line) - Number(b.line));
  const totals = ev.markets.filter((m) => m.type === "alt_totals")
    .sort((a, b) => Number(a.line) - Number(b.line));
  const periods = ev.period_scores ?? [];

  const groupHead = (id: string, label: string) => (
    <button onClick={() => setOpenGroups({ ...openGroups, [id]: !openGroups[id] })}
      className="flex w-full items-center gap-2 bg-base-700/50 px-3 py-2.5 text-left text-xs font-bold text-slate-100 hover:bg-base-700">
      <span className={`text-slate-400 transition-transform ${openGroups[id] ? "" : "-rotate-90"}`}>⌄</span>
      {label}
    </button>
  );

  const pairBtn = (m: SbMarket, sel: SbSelection | undefined, label: string, bold = false) => {
    if (!sel) return <div className="h-10 rounded bg-base-900/40" />;
    const on = selected.has(sel.id);
    return (
      <button onClick={() => onPick(ev, { name: m.name }, sel)}
        className={`flex h-10 w-full items-center justify-between rounded border px-3 text-xs transition ${
          on ? "btn-gold border-transparent text-base-900"
            : "border-white/5 bg-base-700/60 hover:border-gold/40 hover:bg-base-600"}`}>
        <span className={`truncate ${bold ? "font-bold" : ""} ${on ? "text-base-900" : "text-slate-200"}`}>
          {label}
        </span>
        <span className={`font-mono font-semibold ${on ? "text-base-900" : "text-gold"}`}>{sel.american}</span>
      </button>
    );
  };

  const ladder = (ms: SbMarket[], expanded: boolean, setMore: (b: boolean) => void,
                  labelFor: (m: SbMarket, side: 0 | 1) => string) => {
    const mid = Math.floor(ms.length / 2);
    const shown = expanded ? ms : ms.slice(Math.max(0, mid - 2), mid + 3);
    const hidden = ms.length - shown.length;
    return (
      <div className="space-y-1 p-2">
        {shown.map((m) => (
          <div key={m.id} className="grid grid-cols-2 gap-1">
            {pairBtn(m, m.selections[0], labelFor(m, 0), Number(m.line) % 1 !== 0)}
            {pairBtn(m, m.selections[1], labelFor(m, 1), Number(m.line) % 1 !== 0)}
          </div>
        ))}
        {hidden > 0 && (
          <button onClick={() => setMore(true)}
            className="w-full py-1.5 text-left text-[11px] font-semibold text-sky-300 hover:text-sky-200">
            Show {hidden} More ›
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-3">
      <button onClick={onBack}
        className="rounded bg-base-700 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-base-600">
        ← All live games
      </button>

      {/* score header with the line score */}
      <div className="overflow-hidden rounded-xl border border-white/5 bg-base-800 shadow-card">
        <div className="flex items-start justify-between gap-2 px-4 py-3">
          <div className="min-w-0 space-y-1.5">
            <div className="truncate text-sm font-bold text-slate-100">{ev.home}</div>
            <div className="truncate text-sm font-bold text-slate-100">{ev.away}</div>
            <div className="flex items-center gap-1.5 pt-0.5 text-[10px] font-bold uppercase tracking-wide text-red-400">
              <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" />
              Live · {ev.period ?? ""}
            </div>
          </div>
          <div className="flex shrink-0 gap-1 overflow-x-auto">
            <div className="flex flex-col gap-1">
              <span className="grid h-7 w-8 place-items-center rounded bg-base-900 font-mono text-sm font-black text-sky-300">
                {ev.home_score ?? 0}
              </span>
              <span className="grid h-7 w-8 place-items-center rounded bg-base-900 font-mono text-sm font-black text-sky-300">
                {ev.away_score ?? 0}
              </span>
            </div>
            {periods.map((pd, i) => (
              <div key={i} className={`flex flex-col gap-1 ${
                i === periods.length - 1 ? "rounded ring-1 ring-sky-400/50" : ""}`}>
                <span className="grid h-7 w-7 place-items-center rounded bg-base-900/60 font-mono text-xs text-slate-300">
                  {pd.h}
                </span>
                <span className="grid h-7 w-7 place-items-center rounded bg-base-900/60 font-mono text-xs text-slate-300">
                  {pd.a}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* market groups */}
      <div className="overflow-hidden rounded-xl border border-white/5 bg-base-800 shadow-card">
        {groupHead("winner", "Game Winner")}
        {openGroups.winner && h2h && (
          <div className="grid grid-cols-2 gap-1 p-2">
            {pairBtn(h2h, h2h.selections.find((x) => x.key === "home"), ev.home)}
            {pairBtn(h2h, h2h.selections.find((x) => x.key === "away"), ev.away)}
          </div>
        )}
      </div>

      {spreads.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-white/5 bg-base-800 shadow-card">
          {groupHead("spread", spreads[0].name === "Run Line" ? "Run Line" : "Spread")}
          {openGroups.spread && ladder(spreads, moreSpread, setMoreSpread, (m, side) =>
            side === 0 ? `${ev.home} ${fmtLine(Number(m.line))}`
                       : `${ev.away} ${fmtLine(-Number(m.line))}`)}
        </div>
      )}

      {totals.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-white/5 bg-base-800 shadow-card">
          {groupHead("total", "Total")}
          {openGroups.total && ladder(totals, moreTotal, setMoreTotal, (m, side) =>
            side === 0 ? `Over ${m.line}` : `Under ${m.line}`)}
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------ player props --
// The Props+ screen: league picker, stat category tabs, O/U rows per player,
// and the Pops target ladders. Grading is automatic off the stats feed.

const PROP_LABELS: Record<string, string> = {
  "prop:ks": "Strikeouts", "prop:hits": "Hits", "prop:tb": "Total Bases",
  "prop:hrr": "Hits+Runs+RBIs", "prop:pts": "Points", "prop:reb": "Rebounds",
  "prop:ast": "Assists", "prop:passyds": "Passing Yards",
  "prop:rushyds": "Rushing Yards", "prop:recyds": "Receiving Yards",
  "prop:sog": "Shots on Goal",
};

function propPlayer(name: string): string {
  return name.split("—")[0]?.trim() ?? name;
}

function PropsBoard({ events, selected, onPick }: {
  events: SbEvent[]; selected: Set<number>; onPick: PickFn;
}) {
  const [league, setLeague] = useState<string>("all");
  const [cat, setCat] = useState<string>("all");

  const withProps = events.filter((e) =>
    e.status === "scheduled" && e.markets.some((m) => m.type.startsWith("prop:")));

  const leagues = useMemo(() => {
    const seen = new Map<string, { name: string; icon: string; n: number }>();
    for (const e of withProps) {
      const l = seen.get(e.competition_key) ?? { name: e.competition, icon: e.icon, n: 0 };
      l.n += 1;
      seen.set(e.competition_key, l);
    }
    return [...seen.entries()];
  }, [events]);

  const shown = withProps.filter((e) => league === "all" || e.competition_key === league);

  const cats = useMemo(() => {
    const present = new Set<string>();
    for (const e of shown)
      for (const m of e.markets)
        if (m.type.startsWith("prop:") && m.type !== "prop:pop") present.add(m.type);
    return [...present];
  }, [shown]);

  if (withProps.length === 0) {
    return (
      <div className="rounded-xl border border-white/5 bg-base-800 shadow-card p-8 text-center text-sm text-slate-500">
        No player props on the board right now.
      </div>
    );
  }

  const ouBtn = (ev: SbEvent, m: SbMarket, sel: SbSelection | undefined, label: string) => {
    if (!sel) return null;
    const on = selected.has(sel.id);
    return (
      <button onClick={() => onPick(ev, { name: m.name }, sel)}
        className={`flex h-9 w-[74px] flex-col items-center justify-center rounded border text-[10px] leading-tight transition ${
          on ? "btn-gold border-transparent text-base-900"
            : "border-white/5 bg-base-700/70 hover:border-gold/40 hover:bg-base-600"}`}>
        <span className={on ? "text-base-900/70" : "text-slate-400"}>{label}</span>
        <span className={`font-mono font-bold ${on ? "" : "text-gold"}`}>{sel.american}</span>
      </button>
    );
  };

  return (
    <div className="space-y-3">
      {/* league chips */}
      <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
        <button onClick={() => setLeague("all")}
          className={`shrink-0 rounded-lg px-3.5 py-2 text-xs font-semibold ${
            league === "all" ? "btn-gold text-base-900" : "bg-base-800 text-slate-300 hover:bg-base-700"}`}>
          All Leagues
        </button>
        {leagues.map(([key, l]) => (
          <button key={key} onClick={() => setLeague(key)}
            className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-semibold ${
              league === key ? "btn-gold text-base-900" : "bg-base-800 text-slate-300 hover:bg-base-700"}`}>
            <span>{l.icon}</span>{l.name}
            <span className={`rounded-full px-1.5 text-[9px] ${
              league === key ? "bg-base-900/20" : "bg-base-700"}`}>{l.n}</span>
          </button>
        ))}
      </div>

      {/* category tabs */}
      <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 text-xs font-semibold">
        {[["all", "All Props"], ["prop:pop", "Player Pops"] as [string, string],
          ...cats.map((c) => [c, PROP_LABELS[c] ?? c] as [string, string])].map(([id, label]) => (
          <button key={id} onClick={() => setCat(id)}
            className={`shrink-0 rounded-full px-3.5 py-1.5 transition ${
              cat === id ? "bg-sky-500/90 text-white"
                : "bg-base-800 text-slate-400 hover:bg-base-700 hover:text-slate-200"}`}>
            {label}
          </button>
        ))}
      </div>

      {shown.map((ev) => {
        const props = ev.markets.filter((m) => m.type.startsWith("prop:")
          && (cat === "all" ? m.type !== "prop:pop" : m.type === cat));
        if (props.length === 0) return null;
        const kickoff = new Date(ev.starts_at);
        return (
          <div key={ev.id} className="overflow-hidden rounded-xl border border-white/5 bg-base-800 shadow-card">
            <div className="flex items-baseline justify-between bg-base-700/60 px-3 py-2">
              <span className="text-sm font-bold text-slate-100">
                {ev.icon} {ev.home} v {ev.away}
              </span>
              <span className="text-[10px] text-slate-400">
                {kickoff.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}{" "}
                {kickoff.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
              </span>
            </div>
            {props.map((m) => m.type === "prop:pop" ? (
              <div key={m.id} className="border-t border-white/5 px-3 py-2">
                <div className="mb-1.5 flex items-baseline justify-between">
                  <span className="text-xs font-bold text-slate-100">{propPlayer(m.name)}</span>
                  <span className="rounded bg-fuchsia-500/15 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-fuchsia-300">
                    {m.name.includes("Pops") ? m.name.split("—")[1]?.trim() : "Pops"}
                  </span>
                </div>
                <div className="flex gap-1.5">
                  {m.selections.map((sel) => {
                    const on = selected.has(sel.id);
                    return (
                      <button key={sel.id} onClick={() => onPick(ev, { name: m.name }, sel)}
                        className={`flex flex-1 flex-col items-center rounded-lg border py-1.5 text-xs transition ${
                          on ? "btn-gold border-transparent text-base-900"
                            : "border-white/5 bg-base-700/70 hover:border-gold/40 hover:bg-base-600"}`}>
                        <span className="font-black">{sel.name}</span>
                        <span className={`font-mono text-[11px] font-bold ${on ? "" : "text-gold"}`}>
                          {sel.american}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div key={m.id} className="flex items-center justify-between gap-2 border-t border-white/5 px-3 py-1.5">
                <div className="min-w-0">
                  <div className="truncate text-xs font-semibold text-slate-200">{propPlayer(m.name)}</div>
                  <div className="text-[10px] text-slate-500">
                    {PROP_LABELS[m.type] ?? m.type} · {m.line}
                  </div>
                </div>
                <div className="flex shrink-0 gap-1.5">
                  {ouBtn(ev, m, m.selections.find((x) => x.key === "over"), `O ${m.line}`)}
                  {ouBtn(ev, m, m.selections.find((x) => x.key === "under"), `U ${m.line}`)}
                </div>
              </div>
            ))}
          </div>
        );
      })}
      <p className="px-1 text-[10px] leading-relaxed text-slate-500">
        Props settle automatically from the official box score after the game. If a
        player's stat can't be confirmed within 24 hours, the wager is refunded.
      </p>
    </div>
  );
}

// ---------------------------------------------------- the classic board ----
// The old-school PPH look: white paper board, red row labels, checkboxes,
// a green Continue, and a confirm page with Risk/Win amounts and a password
// gate. Straight wagers only -- every checked box is its own ticket.

const half = (v: string | number) => String(v).replace(".5", "½");

function teamAbbr(name: string): string {
  const words = name.split(/\s+/).filter(Boolean);
  if (words.length === 1) return words[0].slice(0, 3).toUpperCase();
  return words.map((w) => w[0]).join("").slice(0, 3).toUpperCase();
}

function teamHue(name: string): number {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}

function TeamMark({ name }: { name: string }) {
  return (
    <span className="inline-grid h-6 w-6 shrink-0 place-items-center rounded-full text-[9px] font-black text-white"
      style={{ backgroundColor: `hsl(${teamHue(name)} 55% 38%)` }}>
      {teamAbbr(name)}
    </span>
  );
}

export interface ClassicPick {
  ev: SbEvent; m: SbMarket; sel: SbSelection;
  label: string; sub: string;
  mode: "risk" | "win"; amount: string;
}

function pickLabel(ev: SbEvent, m: SbMarket, sel: SbSelection): [string, string] {
  const team = sel.key === "home" ? ev.home : sel.key === "away" ? ev.away : null;
  if (m.type === "h2h") return [`${team ?? "Draw"} ${sel.american}`, "Moneyline"];
  if (m.type === "spreads") {
    const ln = sel.key === "home" ? Number(m.line) : -Number(m.line);
    return [`${team} ${half(fmtLine(ln))} ${sel.american}`, "Spread"];
  }
  if (m.type === "totals")
    return [`${sel.key === "over" ? "Over" : "Under"} ${half(m.line ?? "")} ${sel.american}`,
            `Total · ${ev.home} v ${ev.away}`];
  return [`${sel.name} ${sel.american}`, m.name];
}

function PriceChip({ top, bottom, on, onClick }: {
  top: string | null; bottom: string; on: boolean; onClick: () => void;
}) {
  return (
    <button onClick={onClick}
      className={`flex h-12 w-full flex-col items-center justify-center rounded-lg border text-[13px] leading-tight transition ${
        on ? "border-gold bg-gold text-base-900 shadow-gold"
          : "border-slate-300 bg-white text-slate-900 hover:border-gold/70 hover:bg-amber-50"}`}>
      {top && <span className={`font-semibold ${on ? "text-base-900/80" : "text-slate-700"}`}>{top}</span>}
      <span className={`font-mono font-bold ${on ? "" : "text-emerald-700"}`}>{bottom}</span>
    </button>
  );
}

function ClassicBoard({ events, picks, onToggle, onRefresh, onContinue, onProps }: {
  events: SbEvent[]; picks: Map<number, ClassicPick>;
  onToggle: (p: ClassicPick) => void;
  onRefresh: () => void; onContinue: () => void; onProps?: () => void;
}) {
  const [open, setOpen] = useState<Set<number>>(new Set());
  const [sport, setSport] = useState("all");

  const upcoming = events.filter((e) => e.status === "scheduled")
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at));

  const sports = useMemo(() => {
    const seen = new Map<string, { name: string; icon: string; n: number }>();
    for (const e of upcoming) {
      const x = seen.get(e.sport) ?? { name: e.sport_name, icon: e.icon, n: 0 };
      x.n += 1;
      seen.set(e.sport, x);
    }
    return [...seen.entries()];
  }, [events]);

  const shown = upcoming.filter((e) => sport === "all" || e.sport === sport);

  const mk = (ev: SbEvent, m: SbMarket, key: string): ClassicPick | null => {
    const sel = m.selections.find((x) => x.key === key);
    if (!sel) return null;
    const [label, sub] = pickLabel(ev, m, sel);
    return { ev, m, sel, label, sub, mode: "risk", amount: "100" };
  };
  const chip = (pk: ClassicPick | null, top: string | null, bottom?: string) =>
    pk ? (
      <PriceChip top={top} bottom={bottom ?? pk.sel.american}
        on={picks.has(pk.sel.id)} onClick={() => onToggle(pk)} />
    ) : <div className="h-12 rounded-lg border border-dashed border-slate-200" />;

  if (upcoming.length === 0) {
    return (
      <div className="rounded-xl border border-white/5 bg-base-800 shadow-card p-8 text-center text-sm text-slate-500">
        Nothing on the board for these leagues right now.
      </div>
    );
  }

  return (
    <div className="pb-16">
      {/* sport strip */}
      <div className="-mx-1 mb-3 flex gap-1 overflow-x-auto px-1 pb-1">
        <button onClick={() => setSport("all")}
          className={`flex shrink-0 flex-col items-center gap-0.5 rounded-xl px-4 py-2 text-[11px] font-semibold ${
            sport === "all" ? "btn-gold text-base-900" : "bg-base-800 text-slate-300 hover:bg-base-700"}`}>
          <span className="text-lg">🏆</span>All
        </button>
        {sports.map(([key, sp]) => (
          <button key={key} onClick={() => setSport(key)}
            className={`flex shrink-0 flex-col items-center gap-0.5 rounded-xl px-4 py-2 text-[11px] font-semibold ${
              sport === key ? "btn-gold text-base-900" : "bg-base-800 text-slate-300 hover:bg-base-700"}`}>
            <span className="text-lg">{sp.icon}</span>{sp.name}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {shown.slice(0, 60).map((ev) => {
          const kick = new Date(ev.starts_at + (ev.starts_at.endsWith("Z") ? "" : "Z"));
          const spread = ev.markets.find((m) => m.type === "spreads");
          const total = ev.markets.find((m) => m.type === "totals");
          const ml = ev.markets.find((m) => m.type === "h2h");
          const mains = new Set([spread?.id, total?.id, ml?.id]);
          const rest = ev.markets.filter((m) => !mains.has(m.id)
            && !m.type.startsWith("prop:") && !m.type.startsWith("alt_"));
          const draw = ml?.selections.find((x) => x.key === "draw");
          const teamRow = (side: "home" | "away") => {
            const name = side === "home" ? ev.home : ev.away;
            const spk = spread ? mk(ev, spread, side) : null;
            const tkey = side === "home" ? "over" : "under";
            const tpk = total ? mk(ev, total, tkey) : null;
            const mpk = ml ? mk(ev, ml, side) : null;
            const line = spread ? (side === "home" ? Number(spread.line) : -Number(spread.line)) : 0;
            return (
              <div className="grid grid-cols-[minmax(0,1.3fr)_1fr_1fr_1fr] items-center gap-1.5 px-3 py-1.5">
                <div className="flex min-w-0 items-center gap-2">
                  <TeamMark name={name} />
                  <span className="truncate text-[13px] font-semibold text-slate-900">{name}</span>
                </div>
                {chip(spk, spread ? half(fmtLine(line)) : null)}
                {chip(tpk, total ? `${tkey === "over" ? "O" : "U"} ${half(total.line ?? "")}` : null)}
                {chip(mpk, null)}
              </div>
            );
          };
          return (
            <div key={ev.id} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-card">
              <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-3 py-2">
                <span className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
                  {ev.icon} {ev.competition}
                </span>
                <span className="text-[11px] font-medium text-slate-500">
                  {kick.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
                  {" · "}
                  {kick.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
                </span>
              </div>
              <div className="grid grid-cols-[minmax(0,1.3fr)_1fr_1fr_1fr] gap-1.5 px-3 pt-2 text-center text-[10px] font-bold uppercase tracking-wider text-slate-400">
                <span />
                <span>Spread</span><span>Total</span><span>Money</span>
              </div>
              {teamRow("home")}
              {teamRow("away")}
              {draw && ml && (
                <div className="grid grid-cols-[minmax(0,1.3fr)_1fr_1fr_1fr] items-center gap-1.5 px-3 pb-1.5">
                  <span className="text-[13px] font-semibold text-slate-500">Draw</span>
                  <div /><div />
                  {chip(mk(ev, ml, "draw"), null)}
                </div>
              )}
              {open.has(ev.id) && rest.map((m) => (
                <div key={m.id} className="border-t border-slate-100 px-3 py-2">
                  <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">{m.name}</div>
                  <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                    {m.selections.map((x) => {
                      const pk = mk(ev, m, x.key);
                      return pk ? (
                        <PriceChip key={x.id} top={x.name} bottom={x.american}
                          on={picks.has(x.id)} onClick={() => onToggle(pk)} />
                      ) : null;
                    })}
                  </div>
                </div>
              ))}
              <div className="flex items-center justify-between border-t border-slate-100 px-3 py-1.5">
                {rest.length > 0 ? (
                  <button onClick={() => setOpen((o) => {
                    const n = new Set(o); n.has(ev.id) ? n.delete(ev.id) : n.add(ev.id); return n;
                  })}
                    className="text-xs font-bold text-sky-600 hover:text-sky-500">
                    {open.has(ev.id) ? "Fewer bets ⌃" : `More bets (${rest.length}) ›`}
                  </button>
                ) : <span />}
                {onProps && (
                  <button onClick={onProps} className="text-xs font-bold text-fuchsia-600 hover:text-fuchsia-500">
                    Player props ›
                  </button>
                )}
              </div>
            </div>
          );
        })}
        {shown.length > 60 && (
          <p className="text-center text-xs text-slate-500">Showing the next 60 games — pick a sport above to narrow.</p>
        )}
      </div>

      {/* sticky action bar */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-base-900/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl gap-2 p-2">
          <button onClick={onRefresh}
            className="rounded-lg border border-white/15 px-4 py-2.5 text-sm font-bold text-slate-300 hover:border-white/30">
            Refresh
          </button>
          <button onClick={onContinue} disabled={picks.size === 0}
            className="flex-1 rounded-lg bg-green-600 py-2.5 text-sm font-black text-white shadow-pop hover:bg-green-500 disabled:opacity-50">
            {picks.size === 0 ? "Select your plays"
              : `Continue · ${picks.size} pick${picks.size > 1 ? "s" : ""}`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------ confirm your plays --
function ConfirmWagers({ picks, setPicks, onBack, onPlaced }: {
  picks: Map<number, ClassicPick>;
  setPicks: (p: Map<number, ClassicPick>) => void;
  onBack: () => void;
  onPlaced: (balance: string) => void;
}) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [placed, setPlaced] = useState<string[]>([]);

  const list = [...picks.values()];
  const upd = (id: number, patch: Partial<ClassicPick>) => {
    const n = new Map(picks);
    n.set(id, { ...n.get(id)!, ...patch });
    setPicks(n);
  };
  const remove = (id: number) => {
    const n = new Map(picks); n.delete(id); setPicks(n);
  };

  const nums = (p: ClassicPick): { risk: number; win: number } => {
    const dec = Number(p.sel.odds);
    const amt = Number(p.amount) || 0;
    if (p.mode === "risk") return { risk: amt, win: amt * (dec - 1) };
    return { risk: dec > 1 ? amt / (dec - 1) : 0, win: amt };
  };
  const totals = list.reduce((a, p) => {
    const n = nums(p); return { risk: a.risk + n.risk, win: a.win + n.win };
  }, { risk: 0, win: 0 });

  async function confirm() {
    setErr(""); setBusy(true);
    try {
      await api.authVerify(password);
    } catch {
      setErr("Wrong password — check it and try again.");
      setBusy(false);
      return;
    }
    const done: string[] = [];
    let lastBalance = "";
    for (const p of list) {
      const { risk } = nums(p);
      if (risk <= 0) { setErr(`${p.label}: enter an amount.`); setBusy(false); return; }
      try {
        const r = await api.sbPlace([{ selection_id: p.sel.id, odds: p.sel.odds }],
          risk.toFixed(2), true, "auto");
        lastBalance = r.balance;
        done.push(`✓ ${p.label} — risking ${risk.toFixed(2)}`);
        remove(p.sel.id);
      } catch (e: any) {
        setErr(`${p.label}: ${e.message}`);
        break;
      }
    }
    setPlaced(done);
    if (lastBalance) onPlaced(lastBalance);
    setBusy(false);
  }

  if (list.length === 0 && placed.length > 0) {
    return (
      <div className="overflow-hidden rounded-xl border border-white/10 bg-slate-100 shadow-card">
        <div className="bg-green-600 px-4 py-3 text-center text-lg font-bold text-white">
          Wagers accepted
        </div>
        <div className="space-y-1 p-4 text-sm text-slate-800">
          {placed.map((s, i) => <div key={i}>{s}</div>)}
        </div>
        <div className="p-3">
          <button onClick={onBack}
            className="w-full rounded-md bg-slate-800 py-3 text-sm font-bold text-white hover:bg-slate-700">
            Back to the board
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-white/10 bg-slate-100 shadow-card">
      <div className="flex items-baseline justify-between px-4 pt-3 text-slate-900">
        <span className="text-[15px] font-bold">Please confirm your wagers</span>
        <span className="flex gap-8 text-sm font-semibold"><span>Risk</span><span>Win</span></span>
      </div>

      {list.map((p) => {
        const n = nums(p);
        return (
          <div key={p.sel.id} className="mx-2 mt-2 rounded border border-slate-300 bg-white">
            <div className="flex items-start justify-between px-2 pt-1.5">
              <button onClick={() => remove(p.sel.id)}
                className="rounded bg-slate-600 px-2 py-0.5 text-[11px] font-semibold text-white hover:bg-red-700">
                Delete
              </button>
              <span className="flex gap-6 font-mono text-sm font-bold text-slate-900">
                <span>${n.risk.toFixed(2)}</span><span>${n.win.toFixed(2)}</span>
              </span>
            </div>
            <div className="flex items-center gap-2 px-2 pt-1">
              <TeamMark name={p.sel.key === "away" ? p.ev.away : p.ev.home} />
              <span className="text-[15px] font-bold text-green-700">{p.label}</span>
            </div>
            <div className="px-2 pb-1 text-[13px] font-semibold text-slate-700">
              {p.ev.competition} — {new Date(p.ev.starts_at + (p.ev.starts_at.endsWith("Z") ? "" : "Z"))
                .toLocaleString(undefined, { month: "long", day: "numeric", year: "numeric",
                                             hour: "numeric", minute: "2-digit" })}
            </div>
            <div className="flex items-center gap-3 border-t border-slate-200 px-2 py-2">
              {(["risk", "win"] as const).map((mode) => (
                <label key={mode} className="flex cursor-pointer items-center gap-1.5">
                  <input type="radio" checked={p.mode === mode}
                    onChange={() => upd(p.sel.id, { mode })}
                    className="h-4 w-4 accent-slate-700" />
                  <span className="text-sm font-bold capitalize text-slate-800">{mode}</span>
                  <input value={p.mode === mode ? p.amount : (mode === "risk" ? n.risk.toFixed(0) : n.win.toFixed(0))}
                    onChange={(e) => upd(p.sel.id, { mode, amount: e.target.value })}
                    inputMode="decimal"
                    className="w-20 rounded border border-slate-400 bg-white px-2 py-1 text-center font-mono text-sm text-slate-900" />
                </label>
              ))}
            </div>
          </div>
        );
      })}

      <div className="flex items-baseline justify-between px-4 pt-3 text-sm font-bold text-slate-900">
        <span>{list.length} Total Wagers</span>
        <span className="flex gap-6 font-mono">
          <span>${totals.risk.toFixed(2)}</span><span>${totals.win.toFixed(2)}</span>
        </span>
      </div>

      <div className="px-4 pb-4 pt-3">
        <div className="pb-2 text-center">
          <div className="text-lg font-bold text-slate-900">Please review your wagers carefully!!!</div>
          <div className="text-sm text-slate-600">Enter your password to confirm your plays</div>
        </div>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
          placeholder="Password is required" autoComplete="current-password"
          className="mb-3 w-full rounded-full border border-slate-400 bg-white px-4 py-2.5 text-center text-sm text-slate-900" />
        {err && (
          <div className="mb-3 rounded border border-red-400 bg-red-50 px-3 py-2 text-sm text-red-700">{err}</div>
        )}
        {placed.length > 0 && (
          <div className="mb-3 rounded border border-green-400 bg-green-50 px-3 py-2 text-sm text-green-800">
            {placed.map((s, i) => <div key={i}>{s}</div>)}
          </div>
        )}
        <button onClick={confirm} disabled={busy || list.length === 0 || !password}
          className="mb-2 w-full rounded-md bg-green-600 py-3 text-base font-bold text-white hover:bg-green-500 disabled:opacity-60">
          {busy ? "Placing…" : "Confirm"}
        </button>
        <button onClick={() => { setPicks(new Map()); onBack(); }}
          className="w-full rounded-md bg-red-700 py-3 text-base font-bold text-white hover:bg-red-600">
          Clear All
        </button>
      </div>
    </div>
  );
}
