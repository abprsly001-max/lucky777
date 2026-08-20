import { Fragment, useCallback, useEffect, useState } from "react";
import {
  api, type AgentWager, type BookLimitsShape, type Customer, type Performance,
  type WeeklyFigures,
} from "../api";

type View =
  | "home" | "figures" | "customers" | "add" | "pending" | "graded"
  | "settle" | "performance" | "transaction" | "position" | "scores"
  | "history" | "gameadmin" | "billing" | "ticker"
  | "limits" | "deleted" | "analysis" | "agents" | "addagent";

const TILES: { id: Exclude<View, "home">; label: string; icon: string }[] = [
  { id: "figures", label: "Weekly Figures", icon: "📅" },
  { id: "customers", label: "Customer Admin", icon: "👤" },
  { id: "pending", label: "Pending Reports", icon: "⏳" },
  { id: "graded", label: "Graded Reports", icon: "🧾" },
  { id: "gameadmin", label: "Game Admin", icon: "🎛️" },
  { id: "position", label: "Agent Position", icon: "🏈" },
  { id: "performance", label: "Agent Performance", icon: "📈" },
  { id: "transaction", label: "Enter Transaction", icon: "🧮" },
  { id: "add", label: "Add Customer", icon: "➕" },
  { id: "scores", label: "Scores", icon: "🔢" },
  { id: "billing", label: "Billing", icon: "🧾" },
  { id: "history", label: "Transactions History", icon: "🕘" },
  { id: "ticker", label: "Bet Ticker", icon: "📟" },
  { id: "settle", label: "Settle Figures", icon: "⚖️" },
  { id: "limits", label: "Betting Limits", icon: "🚦" },
  { id: "deleted", label: "Deleted Wagers", icon: "🗑️" },
  { id: "analysis", label: "Analysis", icon: "📊" },
  { id: "agents", label: "Agent Admin", icon: "🎖️" },
  { id: "addagent", label: "Add Agent", icon: "🤝" },
];

// only the master runs the feed, sees house-wide risk, and manages agents
const MASTER_ONLY: View[] = ["gameadmin", "position", "agents", "addagent"];

const money = (v: string | number | null | undefined) =>
  v === null || v === undefined ? "—"
    : Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const signed = (v: string) => {
  const n = Number(v);
  return {
    text: `${n > 0 ? "+" : ""}${money(v)}`,
    cls: n > 0 ? "text-accent" : n < 0 ? "text-red-400" : "text-slate-400",
  };
};

export default function AgentConsole({ username, isMaster }: {
  username: string; isMaster: boolean;
}) {
  const [view, setView] = useState<View>("home");
  const [err, setErr] = useState("");
  const [bookBalance, setBookBalance] = useState<string | null>(null);
  const [quick, setQuick] = useState(false);
  const [compact, setCompact] = useState(true);

  const refreshBalance = useCallback(() => {
    api.agentPerformance().then((p) => setBookBalance(p.house_balance)).catch(() => {});
  }, []);
  useEffect(refreshBalance, [refreshBalance]);

  const tiles = TILES.filter((t) => isMaster || !MASTER_ONLY.includes(t.id));
  const open = (v: View) => { setView(v); setErr(""); setQuick(false); refreshBalance(); };
  const title = TILES.find((t) => t.id === view)?.label;

  return (
    <div className="space-y-3">
      {/* -------- header strip: user · quick access · balance -------- */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/5 bg-base-800 shadow-card px-4 py-2.5">
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-b from-gold-400/25 to-gold-600/10 text-sm font-black uppercase text-gold ring-1 ring-gold/30">
            {username.slice(0, 2)}
          </span>
          <span className="text-sm font-bold uppercase tracking-wide text-slate-100">{username}</span>
          <span className="rounded-full border border-gold/30 bg-gold/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-gold">
            {isMaster ? "master" : "agent"}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="text-right">
            <span className="mr-2 text-[10px] uppercase tracking-wide text-slate-500">
              {isMaster ? "Book balance:" : "Your sheet (unsettled):"}
            </span>
            <span className={`font-mono text-base font-bold ${
              bookBalance !== null && Number(bookBalance) < 0 ? "text-red-400" : "text-accent"}`}>
              {bookBalance !== null ? money(bookBalance) : "…"}
            </span>
          </div>

          <div className="relative">
            <button onClick={() => setQuick(!quick)}
              className="rounded btn-gold px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-base-900">
              Quick Access ▾
            </button>
            {quick && (
              <div className="absolute right-0 z-20 mt-1.5 w-52 overflow-hidden rounded-xl border border-white/10 bg-base-800/95 py-1 shadow-pop backdrop-blur">
                <button onClick={() => open("home")}
                  className="block w-full px-3 py-2 text-left text-xs text-slate-300 hover:bg-base-700">
                  ⌂ Home
                </button>
                {tiles.map((t) => (
                  <button key={t.id} onClick={() => open(t.id)}
                    className="block w-full px-3 py-2 text-left text-xs text-slate-300 hover:bg-base-700">
                    {t.icon} {t.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {err && (
        <div className="rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-xs text-red-300">
          {err}
        </div>
      )}

      {/* -------- home: the tile grid (desktop = compact, 8 across) -------- */}
      {(view === "home" || view === "scores") && (
        <div className={compact
          ? "grid grid-cols-4 gap-2 sm:grid-cols-6 xl:grid-cols-8"
          : "grid grid-cols-2 gap-3 sm:grid-cols-3"}>
          {tiles.map((t) => (
            <button key={t.id} onClick={() => open(t.id)}
              className={`group flex flex-col items-center rounded-xl border border-white/5 bg-gradient-to-b from-base-800 to-base-800/70 shadow-card transition hover:-translate-y-0.5 hover:border-gold/30 hover:from-base-700 hover:to-base-800 hover:shadow-pop ${
                compact ? "gap-1 px-2 py-3" : "gap-2 px-4 py-6"}`}>
              <span className={`transition group-hover:scale-110 ${compact ? "text-2xl" : "text-4xl"}`}>
                {t.icon}
              </span>
              <span className={`text-center font-semibold text-slate-200 ${
                compact ? "text-[10px] leading-tight" : "text-xs"}`}>{t.label}</span>
            </button>
          ))}
          <button onClick={() => setCompact(!compact)}
            className={`group flex flex-col items-center rounded-xl border border-dashed border-white/10 bg-base-800/40 transition hover:bg-base-700 ${
              compact ? "gap-1 px-2 py-3" : "gap-2 px-4 py-6"}`}>
            <span className={compact ? "text-2xl" : "text-4xl"}>{compact ? "🗔" : "🖥️"}</span>
            <span className={`text-center font-semibold text-slate-400 ${
              compact ? "text-[10px] leading-tight" : "text-xs"}`}>
              {compact ? "Comfy View" : "Desktop View"}
            </span>
          </button>
        </div>
      )}

      {view === "scores" && (
        <ScoreboardDrawer onErr={setErr} onClose={() => open("home")} />
      )}

      {/* -------- screens -------- */}
      {view !== "home" && view !== "scores" && (
        <>
          <button onClick={() => open("home")}
            className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200">
            ← Back to console
            {title && <span className="ml-2 font-semibold text-slate-200">/ {title}</span>}
          </button>

          {view === "figures" && <Figures onErr={setErr} />}
          {view === "customers" && <Customers onErr={setErr} isMaster={isMaster} />}
          {view === "add" && <AddCustomer onErr={setErr} />}
          {view === "pending" && <Wagers status="pending" onErr={setErr} />}
          {view === "graded" && <Wagers status="graded" onErr={setErr} />}
          {view === "settle" && <Settle onErr={setErr} />}
          {view === "performance" && <PerformanceView onErr={setErr} />}
          {view === "transaction" && <EnterTransaction onErr={setErr} onDone={refreshBalance} />}
          {view === "position" && <Position onErr={setErr} />}
          {view === "history" && <TransactionsHistory onErr={setErr} />}
          {view === "gameadmin" && <GameAdmin onErr={setErr} onDone={refreshBalance} />}
          {view === "billing" && <Billing onErr={setErr} />}
          {view === "ticker" && <BetTicker onErr={setErr} />}
          {view === "limits" && <Limits onErr={setErr} isMaster={isMaster} />}
          {view === "deleted" && <Wagers status="deleted" onErr={setErr} />}
          {view === "analysis" && <Analysis onErr={setErr} />}
          {view === "agents" && <AgentAdmin onErr={setErr} />}
          {view === "addagent" && <AddAgent onErr={setErr} />}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- shared ----
function Panel({ title, right, children }: {
  title: string; right?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-white/5 bg-base-800 shadow-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-100">
          <span className="h-3.5 w-1 rounded-full bg-gradient-to-b from-gold-400 to-gold-600" />
          {title}
        </h3>
        {right}
      </div>
      {children}
    </section>
  );
}

function Table({ head, children }: { head: string[]; children: React.ReactNode }) {
  // -mx-4 px-4: the scroll area bleeds to the panel edge so a phone swipes the
  // whole strip; min-w keeps wide reports readable instead of crushing columns
  return (
    <div className="-mx-4 overflow-x-auto px-4">
      <table className={`w-full text-xs ${head.length >= 6 ? "min-w-[640px]" : ""}`}>
        <thead>
          <tr className="border-b border-white/10 text-[10px] uppercase tracking-wider text-slate-500">
            {head.map((h, i) => (
              <th key={`${h}-${i}`}
                className={`whitespace-nowrap pb-2 font-medium ${
                  i === 0 ? "text-left" : "pl-3 text-right"}`}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="font-mono">{children}</tbody>
      </table>
    </div>
  );
}

const Empty = ({ msg }: { msg: string }) =>
  <div className="py-8 text-center text-xs text-slate-500">{msg}</div>;

function Stat({ k, v, cls = "text-slate-100" }: { k: string; v: string; cls?: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-slate-500">{k}</div>
      <div className={`font-mono text-sm font-semibold ${cls}`}>{v}</div>
    </div>
  );
}

function Mini({ children, onClick, disabled }: {
  children: React.ReactNode; onClick: () => void; disabled?: boolean;
}) {
  return (
    <button onClick={onClick} disabled={disabled}
      className="rounded-md border border-white/10 bg-base-700/60 px-2 py-1 text-[10px] text-slate-300 hover:border-white/20 hover:bg-base-600 hover:text-slate-100 disabled:opacity-40">
      {children}
    </button>
  );
}

// -------------------------------------------------------------- figures ----
function Figures({ onErr }: { onErr: (m: string) => void }) {
  const [wb, setWb] = useState(0);
  const [d, setD] = useState<WeeklyFigures | null>(null);
  const [filter, setFilter] = useState<"balance" | "action" | "all">("balance");
  const [openCustomer, setOpenCustomer] = useState<string | null>(null);
  const [wagers, setWagers] = useState<AgentWager[] | null>(null);

  useEffect(() => { api.agentWeekly(wb).then(setD).catch((e) => onErr(e.message)); }, [wb, onErr]);
  useEffect(() => {
    if (!openCustomer) { setWagers(null); return; }
    api.agentWagers("all").then((all) =>
      setWagers(all.filter((w) => w.customer === openCustomer))).catch(() => {});
  }, [openCustomer]);

  if (!d) return <Panel title="Weekly Figures"><Empty msg="loading…" /></Panel>;

  const nz = (v: string) => Number(v) !== 0;
  const rows = d.customers.filter((c) =>
    filter === "all" ? true
    : filter === "action" ? c.wagers > 0 || nz(c.week)
    : nz(c.balance) || nz(c.carry) || nz(c.week) || nz(c.pending) || c.wagers > 0);

  const cell = (v: string, bold = false) => {
    const n = Number(v);
    const cls = n > 0 ? "text-accent" : n < 0 ? "text-red-400" : "text-slate-600";
    return <span className={`${cls} ${bold ? "font-semibold" : ""}`}>{n === 0 ? "0" : money(v)}</span>;
  };

  function exportCsv() {
    const head = ["Account", "Name", "Settle", "Carry", ...d!.day_labels, "Week", "+Dep/-Wd", "Balance", "Pending"];
    const lines = [head.join(",")];
    for (const c of rows) {
      lines.push([c.account, c.username, c.settled ? "yes" : "", c.carry,
                  ...c.days, c.week, c.adjustments, c.balance, c.pending].join(","));
    }
    const t = d!.totals;
    lines.push(["TOTAL", `${t.players} players`, "", t.carry, ...t.days, t.week,
                t.adjustments, t.balance, t.pending].join(","));
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `weekly-figures-${d!.week_start.slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <Panel title="Weekly Figures" right={
      <div className="flex items-center gap-2 text-xs">
        <select value={wb} onChange={(e) => setWb(Number(e.target.value))}
          className="rounded bg-base-700 px-2 py-1 outline-none">
          <option value={0}>This Week</option>
          <option value={1}>Last Week</option>
          <option value={2}>2 Weeks Ago</option>
          <option value={3}>3 Weeks Ago</option>
        </select>
        <select value={filter} onChange={(e) => setFilter(e.target.value as any)}
          className="rounded bg-base-700 px-2 py-1 outline-none">
          <option value="balance">With A Balance</option>
          <option value="action">With Action</option>
          <option value="all">Everyone</option>
        </select>
        <button onClick={() => window.print()} title="Print"
          className="rounded bg-base-700 px-2 py-1 hover:bg-base-600">🖨</button>
        <button onClick={exportCsv} title="Export CSV"
          className="rounded bg-base-700 px-2 py-1 hover:bg-base-600">⬇ CSV</button>
      </div>
    }>
      {rows.length === 0 ? <Empty msg="Nothing matches this filter." /> : (
        <div className="overflow-x-auto">
          <table className="w-full whitespace-nowrap text-[11px]">
            <thead>
              <tr className="border-b border-base-600 bg-base-900/60 text-[9px] uppercase tracking-wide text-slate-500">
                <th className="px-2 py-1.5 text-left">Customer</th>
                <th className="px-2 text-left">Name</th>
                <th className="px-2 text-center">Settle</th>
                <th className="px-2 text-right">Carry</th>
                {d.day_labels.map((l) => (
                  <th key={l} className="px-2 text-right">{l}</th>
                ))}
                <th className="px-2 text-right font-bold text-slate-400">Week</th>
                <th className="px-2 text-right">+Dep/-Wd</th>
                <th className="px-2 text-right">Balance</th>
                <th className="px-2 text-right">Pending</th>
              </tr>
            </thead>
            <tbody className="font-mono">
              {rows.map((c) => (
                <tr key={c.id}
                  className={`border-b border-base-700/40 last:border-0 hover:bg-base-700/30 ${
                    !c.active ? "opacity-50" : ""}`}>
                  <td className="px-2 py-1">
                    <button onClick={() => setOpenCustomer(
                      openCustomer === c.username ? null : c.username)}
                      className="font-semibold text-gold underline-offset-2 hover:underline">
                      {c.account}
                    </button>
                  </td>
                  <td className="px-2 font-sans text-slate-200">
                    {c.username}
                    {!c.active && <span className="ml-1 text-[9px] text-red-400">SUSP</span>}
                  </td>
                  <td className="px-2 text-center text-slate-500">{c.settled ? "✓" : "0"}</td>
                  <td className="px-2 text-right">{cell(c.carry)}</td>
                  {c.days.map((v, i) => (
                    <td key={i} className="px-2 text-right">{cell(v)}</td>
                  ))}
                  <td className="px-2 text-right">{cell(c.week, true)}</td>
                  <td className="px-2 text-right">{cell(c.adjustments)}</td>
                  <td className="px-2 text-right">{cell(c.balance, true)}</td>
                  <td className="px-2 text-right text-slate-400">
                    {Number(c.pending) !== 0 ? money(c.pending) : "0"}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-base-600 bg-base-900/60 font-mono font-semibold">
                <td className="px-2 py-1.5 font-sans text-slate-300" colSpan={3}>
                  {d.totals.players} Players
                </td>
                <td className="px-2 text-right">{cell(d.totals.carry, true)}</td>
                {d.totals.days.map((v, i) => (
                  <td key={i} className="px-2 text-right">{cell(v)}</td>
                ))}
                <td className="px-2 text-right">{cell(d.totals.week, true)}</td>
                <td className="px-2 text-right">{cell(d.totals.adjustments)}</td>
                <td className="px-2 text-right">{cell(d.totals.balance, true)}</td>
                <td className="px-2 text-right text-slate-400">{money(d.totals.pending)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {openCustomer && (
        <div className="mt-3 rounded-lg border border-base-600 bg-base-900 p-3">
          <div className="mb-2 flex items-center justify-between text-xs">
            <span className="font-semibold text-slate-200">{openCustomer} — wagers</span>
            <button onClick={() => setOpenCustomer(null)}
              className="text-slate-500 hover:text-slate-300">close ×</button>
          </div>
          {!wagers ? <Empty msg="loading…" /> : wagers.length === 0
            ? <Empty msg="No wagers on record." />
            : (
              <div className="max-h-64 space-y-1 overflow-y-auto font-mono text-[11px]">
                {wagers.map((w) => (
                  <div key={w.bet_id} className="flex flex-wrap justify-between gap-2">
                    <span className="text-slate-400">
                      #{w.bet_id} {w.legs[0]?.selection}
                      {w.legs.length > 1 ? ` +${w.legs.length - 1}` : ""}
                    </span>
                    <span>
                      {money(w.risk)} @ {Number(w.odds).toFixed(2)}
                      <span className={`ml-2 font-semibold uppercase ${
                        w.status === "won" ? "text-accent"
                          : w.status === "lost" ? "text-red-400"
                          : w.status === "open" ? "text-gold" : "text-slate-500"}`}>
                        {w.status}
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            )}
        </div>
      )}

      <p className="mt-2 text-[10px] leading-relaxed text-slate-500">
        Positive = the customer is up; negative = the customer owes. Carry is the unsettled
        net from previous weeks. Pending stakes are excluded from every day's figure until
        the wager grades. Passwords are stored as salted hashes and can only be reset,
        never read back — so unlike some sheets, they are not printed here.
      </p>
    </Panel>
  );
}


// ------------------------------------------------------------ customers ----
function PlayerProfile({ id, isMaster, onErr, onBack }: {
  id: number; isMaster: boolean; onErr: (m: string) => void; onBack: () => void;
}) {
  const [p, setP] = useState<Awaited<ReturnType<typeof api.agentProfile>> | null>(null);
  const [agents, setAgents] = useState<Awaited<ReturnType<typeof api.agentListAgents>> | null>(null);
  const [form, setForm] = useState({
    display_name: "", notes: "", active: true, credit_limit: "", wager_limit: "",
    allow_sportsbook: true, allow_casino: true, allow_live: true,
    agent_id: 0, new_password: "",
  });
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  const load = useCallback(() => {
    api.agentProfile(id).then((r) => {
      setP(r);
      setForm({
        display_name: r.display_name ?? "", notes: r.notes, active: r.active,
        credit_limit: String(Number(r.credit_limit)),
        wager_limit: r.wager_limit ? String(Number(r.wager_limit)) : "",
        allow_sportsbook: r.allow_sportsbook, allow_casino: r.allow_casino,
        allow_live: r.allow_live, agent_id: r.agent_id ?? 0, new_password: "",
      });
    }).catch((e) => onErr(e.message));
  }, [id, onErr]);
  useEffect(load, [load]);
  useEffect(() => {
    if (isMaster) api.agentListAgents().then(setAgents).catch(() => {});
  }, [isMaster]);

  async function save() {
    if (!p) return;
    setBusy(true); onErr(""); setSaved(false);
    try {
      await api.agentUpdateCustomer(p.id, {
        display_name: form.display_name, notes: form.notes, active: form.active,
        credit_limit: form.credit_limit, wager_limit: form.wager_limit,
        allow_sportsbook: form.allow_sportsbook, allow_casino: form.allow_casino,
        allow_live: form.allow_live,
        ...(isMaster && form.agent_id ? { agent_id: form.agent_id } : {}),
        ...(form.new_password ? { new_password: form.new_password } : {}),
      });
      setSaved(true); load();
      setTimeout(() => setSaved(false), 2500);
    } catch (e: any) { onErr(e.message); } finally { setBusy(false); }
  }

  if (!p) return <Panel title="Player"><Empty msg="loading…" /></Panel>;

  const inputCls = "w-full rounded border border-base-600 bg-base-700 px-2 py-1.5 " +
    "font-mono text-xs text-slate-200 outline-none focus:border-gold";
  const lbl = "mb-1 block text-[10px] uppercase tracking-wide text-slate-500";
  const flag = (k: "allow_sportsbook" | "allow_casino" | "allow_live", label: string) => (
    <div className="flex items-center justify-between gap-3">
      <span className="font-sans text-xs text-slate-300">{label}</span>
      <Toggle on={form[k]} onChange={(v) => setForm((f) => ({ ...f, [k]: v }))} />
    </div>
  );
  const stat = (k: string, v: string, cls = "text-slate-200") => (
    <div className="text-right">
      <div className="text-[9px] uppercase tracking-wide text-slate-500">{k}</div>
      <div className={`font-mono text-sm font-bold ${cls}`}>{v}</div>
    </div>
  );
  const bal = Number(p.balance);

  return (
    <div className="space-y-3">
      {/* -------- header strip: who + the money at a glance -------- */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/5 bg-base-800 shadow-card p-4">
        <div>
          <button onClick={onBack}
            className="mb-1 rounded bg-sky-700/70 px-2 py-1 font-sans text-[10px] font-bold text-white hover:bg-sky-600">
            ← Customer Admin
          </button>
          <div className="font-mono text-sm font-bold text-gold">
            {p.account} <span className="font-sans text-slate-400">({p.username})</span>
          </div>
          <div className="text-[10px] text-slate-500">Agent {p.agent}</div>
        </div>
        <div className="flex gap-5">
          {stat("Balance", money(p.balance), bal < 0 ? "text-red-400" : "text-accent")}
          {stat("Pending", money(p.pending_risk))}
          {stat("Available", money(p.available), "text-accent")}
          {Number(p.free_play) > 0 && stat("Free Play", money(p.free_play), "text-sky-300")}
        </div>
      </div>

      <Panel title="The Basics" right={
        <button onClick={save} disabled={busy}
          className="rounded bg-accent px-3 py-1.5 text-[11px] font-bold text-base-900 hover:brightness-110 disabled:opacity-50">
          {busy ? "…" : saved ? "✓ Saved" : "Save"}
        </button>
      }>
        <div className="grid gap-x-6 gap-y-3 md:grid-cols-3">
          <div className="space-y-3">
            <label className="block">
              <span className={lbl}>New Password</span>
              <input value={form.new_password} placeholder="leave blank to keep current"
                onChange={(e) => setForm((f) => ({ ...f, new_password: e.target.value }))}
                className={inputCls} />
              <span className="mt-0.5 block text-[9px] text-slate-600">
                stored as a salted hash — it can be reset here, never read back
              </span>
            </label>
            <label className="block">
              <span className={lbl}>Name</span>
              <input value={form.display_name} placeholder="what you call this player"
                onChange={(e) => setForm((f) => ({ ...f, display_name: e.target.value }))}
                className={inputCls + " font-sans"} />
            </label>
            <label className="block">
              <span className={lbl}>Agent</span>
              {isMaster && agents ? (
                <select value={form.agent_id}
                  onChange={(e) => setForm((f) => ({ ...f, agent_id: Number(e.target.value) }))}
                  className={inputCls + " font-sans"}>
                  {[...(form.agent_id && !agents.some((a) => a.id === form.agent_id)
                      ? [{ id: form.agent_id, username: p.agent }] : []),
                    ...agents].map((a) => (
                    <option key={a.id} value={a.id}>{a.username}</option>
                  ))}
                </select>
              ) : (
                <input value={p.agent} disabled className={inputCls + " font-sans opacity-60"} />
              )}
            </label>
            <label className="block">
              <span className={lbl}>Account Status</span>
              <select value={form.active ? "active" : "suspended"}
                onChange={(e) => setForm((f) => ({ ...f, active: e.target.value === "active" }))}
                className={inputCls + " font-sans"}>
                <option value="active">Active</option>
                <option value="suspended">Suspended</option>
              </select>
            </label>
            <div className="space-y-2 rounded-md bg-base-700/40 p-3">
              {flag("allow_sportsbook", "Sportsbook")}
              {flag("allow_casino", "Casino")}
              {flag("allow_live", "Live Betting")}
            </div>
          </div>

          <div className="space-y-3">
            <label className="block">
              <span className={lbl}>Account Type</span>
              <input value="Credit" disabled className={inputCls + " font-sans opacity-60"} />
            </label>
            <label className="block">
              <span className={lbl}>Credit Limit</span>
              <input value={form.credit_limit} inputMode="decimal"
                onChange={(e) => setForm((f) => ({ ...f, credit_limit: e.target.value.replace(/[^0-9.]/g, "") }))}
                className={inputCls} />
            </label>
            <label className="block">
              <span className={lbl}>Wager Limit</span>
              <input value={form.wager_limit} placeholder="house default"
                inputMode="decimal"
                onChange={(e) => setForm((f) => ({ ...f, wager_limit: e.target.value.replace(/[^0-9.]/g, "") }))}
                className={inputCls} />
            </label>
            <div className="rounded-md bg-base-700/40 p-3 text-[11px]">
              <div className="mb-1 text-[9px] uppercase tracking-wide text-slate-500">This week</div>
              <span className={`font-mono font-bold ${
                Number(p.week_figure) > 0 ? "text-accent"
                  : Number(p.week_figure) < 0 ? "text-red-400" : "text-slate-400"}`}>
                {money(p.week_figure)}
              </span>
              <span className="ml-2 font-sans text-slate-500">
                · {p.pending_wagers} pending wager(s)
              </span>
            </div>
          </div>

          <div className="space-y-3">
            <label className="block">
              <span className={lbl}>Player Notes <span className="normal-case">(for agent's reference only)</span></span>
              <textarea value={form.notes} rows={7}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value.slice(0, 500) }))}
                className={inputCls + " resize-none font-sans leading-relaxed"} />
              <span className="mt-0.5 block text-right text-[9px] text-slate-600">
                {form.notes.length}/500 — the player never sees these
              </span>
            </label>
          </div>
        </div>
      </Panel>
    </div>
  );
}

function Customers({ onErr, isMaster }: { onErr: (m: string) => void; isMaster: boolean }) {
  const [profileFor, setProfileFor] = useState<number | null>(null);

  if (profileFor !== null) {
    return <PlayerProfile id={profileFor} isMaster={isMaster} onErr={onErr}
      onBack={() => setProfileFor(null)} />;
  }
  return <CustomersTable onErr={onErr} openProfile={setProfileFor} />;
}

function CustomersTable({ onErr, openProfile }: {
  onErr: (m: string) => void; openProfile: (id: number) => void;
}) {
  const [rows, setRows] = useState<Customer[] | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [editing, setEditing] = useState<number | null>(null);

  const load = useCallback(() => {
    api.agentCustomers().then(setRows).catch((e) => onErr(e.message));
  }, [onErr]);
  useEffect(load, [load]);

  async function patch(c: Customer, b: Parameters<typeof api.agentUpdateCustomer>[1]) {
    setBusy(c.id);
    try { await api.agentUpdateCustomer(c.id, b); onErr(""); load(); }
    catch (e: any) { onErr(e.message); } finally { setBusy(null); }
  }
  async function adjust(c: Customer) {
    const v = prompt(`Adjust ${c.username}'s balance (positive credits, negative debits)`, "");
    if (!v || !Number(v)) return;
    const note = prompt("Note (optional)", "") ?? "";
    setBusy(c.id);
    try { await api.agentAdjust(c.id, v, note); onErr(""); load(); }
    catch (e: any) { onErr(e.message); } finally { setBusy(null); }
  }
  async function resetPw(c: Customer) {
    const v = prompt(`New password for ${c.username} (min 6 chars)`);
    if (!v) return;
    await patch(c, { new_password: v });
  }
  async function clearBal(c: Customer) {
    if (!confirm(`Clear ${c.username}'s balance (${money(c.balance)}) to $0.00?`)) return;
    setBusy(c.id);
    try {
      const r = await api.agentClearBalance(c.id);
      onErr(""); load();
      alert(`${r.username} squared to $0.00 (cleared ${money(r.cleared)}).`);
    } catch (e: any) { onErr(e.message); } finally { setBusy(null); }
  }
  async function removeCustomer(c: Customer) {
    if (!confirm(`DELETE ${c.account} (${c.username})?\n\n` +
      `Balance is squared to zero and the account is archived — it can never ` +
      `log in or wager again, and drops off your sheet. The ledger history is ` +
      `kept. This cannot be undone.`)) return;
    if (prompt(`Type the account number to confirm: ${c.account}`) !== c.account) {
      onErr("Delete cancelled — account number didn't match."); return;
    }
    setBusy(c.id);
    try {
      const r = await api.agentDeleteCustomer(c.id);
      onErr(""); load();
      alert(`${r.deleted} (${r.was}) deleted.`);
    } catch (e: any) { onErr(e.message); } finally { setBusy(null); }
  }
  async function freePlay(c: Customer) {
    const v = prompt(
      `Free play for ${c.username} (current FP: ${money(c.free_play)}).\n` +
      `Positive issues, negative claws back unused FP.`, "50");
    if (!v || !Number(v)) return;
    setBusy(c.id);
    try {
      const r = await api.agentFreePlay(c.id, v);
      onErr(""); load();
      alert(`${r.username} free play is now ${money(r.free_play)}`);
    } catch (e: any) { onErr(e.message); } finally { setBusy(null); }
  }

  if (!rows) return <Panel title="Customer Admin"><Empty msg="loading…" /></Panel>;
  if (rows.length === 0) {
    return <Panel title="Customer Admin"><Empty msg="No customers yet — use Add Customer." /></Panel>;
  }

  const Toggle = ({ on, onClick, disabled }: {
    on: boolean; onClick: () => void; disabled: boolean;
  }) => (
    <button onClick={onClick} disabled={disabled}
      title={on ? "on — click to switch off" : "off — click to switch on"}
      className={`h-4 w-6 rounded-sm transition ${
        on ? "bg-accent/80 hover:bg-accent" : "bg-red-500/80 hover:bg-red-500"} disabled:opacity-40`} />
  );

  return (
    <Panel title="Customer Admin" right={
      <span className="text-[10px] text-slate-500">{rows.length} customer(s)</span>
    }>
      <div className="overflow-x-auto">
        <table className="w-full whitespace-nowrap text-[11px]">
          <thead>
            <tr className="border-b border-base-600 bg-base-900/60 text-[9px] uppercase tracking-wide text-slate-500">
              <th className="px-2 py-1.5 text-left">Customer</th>
              <th className="px-2 text-left">Name</th>
              <th className="px-2 text-right">Credit Limit</th>
              <th className="px-2 text-right">Wager Limit</th>
              <th className="px-2 text-right">Balance</th>
              <th className="px-2 text-right">Pending</th>
              <th className="px-2 text-right">Available</th>
              <th className="px-2 text-center">Status</th>
              <th className="px-2 text-center">Sportsbook</th>
              <th className="px-2 text-center">Casino</th>
              <th className="px-2 text-right">Edit</th>
            </tr>
          </thead>
          <tbody className="font-mono">
            {rows.map((c) => {
              const bal = Number(c.balance);
              return (
                <>
                  <tr key={c.id} className="border-b border-base-700/40 hover:bg-base-700/30">
                    <td className="px-2 py-1">
                      <button onClick={() => openProfile(c.id)}
                        className="font-semibold text-gold underline-offset-2 hover:underline">
                        {c.account}
                      </button>
                    </td>
                    <td className="px-2 font-sans text-slate-200">
                      {c.username}
                      {c.display_name && (
                        <span className="ml-1.5 text-[10px] text-slate-500">{c.display_name}</span>
                      )}
                    </td>
                    <td className="px-2 text-right text-slate-300">{money(c.credit_limit)}</td>
                    <td className="px-2 text-right text-slate-300">
                      {c.wager_limit ? money(c.wager_limit) : "house"}
                    </td>
                    <td className={`px-2 text-right font-semibold ${
                      bal > 0 ? "text-accent" : bal < 0 ? "text-red-400" : "text-slate-500"}`}>
                      {money(c.balance)}
                      {Number(c.free_play) > 0 && (
                        <div className="text-[9px] font-normal text-sky-300">
                          FP {money(c.free_play)}
                        </div>
                      )}
                    </td>
                    <td className="px-2 text-right text-slate-400">
                      {Number(c.pending_risk) !== 0 ? money(c.pending_risk) : "0"}
                    </td>
                    <td className="px-2 text-right text-accent">{money(c.available)}</td>
                    <td className={`px-2 text-center font-sans text-[9px] font-bold ${
                      c.active ? "text-accent" : "text-red-400"}`}>
                      {c.active ? "ACTIVE" : "SUSP"}
                    </td>
                    <td className="px-2 text-center">
                      <Toggle on={c.allow_sportsbook} disabled={busy === c.id}
                        onClick={() => patch(c, { allow_sportsbook: !c.allow_sportsbook })} />
                    </td>
                    <td className="px-2 text-center">
                      <Toggle on={c.allow_casino} disabled={busy === c.id}
                        onClick={() => patch(c, { allow_casino: !c.allow_casino })} />
                    </td>
                    <td className="px-2 py-1 text-right">
                      <button onClick={() => setEditing(editing === c.id ? null : c.id)}
                        className="rounded btn-gold px-2.5 py-1 font-sans text-[10px] font-bold text-base-900">
                        Edit
                      </button>
                    </td>
                  </tr>
                  {editing === c.id && (
                    <tr key={`${c.id}-edit`} className="border-b border-base-700/40 bg-base-900/60">
                      <td colSpan={11} className="px-3 py-2">
                        <div className="flex flex-wrap items-center gap-2 font-sans">
                          <Mini disabled={busy === c.id}
                            onClick={() => patch(c, { active: !c.active })}>
                            {c.active ? "suspend" : "activate"}
                          </Mini>
                          <Mini disabled={busy === c.id} onClick={() => adjust(c)}>credit/debit</Mini>
                          <Mini disabled={busy === c.id} onClick={() => freePlay(c)}>free play</Mini>
                          <Mini disabled={busy === c.id} onClick={() => {
                            const v = prompt(`Credit limit for ${c.username} (how deep on credit)`, c.credit_limit);
                            if (v !== null && v !== "") patch(c, { credit_limit: v });
                          }}>credit limit</Mini>
                          <Mini disabled={busy === c.id} onClick={() => {
                            const v = prompt(`Max single wager for ${c.username} (blank = house default)`,
                                             c.wager_limit ?? "");
                            if (v !== null) patch(c, { wager_limit: v });
                          }}>wager limit</Mini>
                          <Mini disabled={busy === c.id} onClick={() => resetPw(c)}>password</Mini>
                          <Mini disabled={busy === c.id} onClick={() => clearBal(c)}>clear to $0</Mini>
                          <button disabled={busy === c.id} onClick={() => removeCustomer(c)}
                            className="rounded-md border border-red-500/40 bg-red-500/10 px-2 py-1 text-[11px] font-bold text-red-300 hover:bg-red-500/20 disabled:opacity-40">
                            delete
                          </button>
                          <span className="ml-auto text-[10px] text-slate-500">
                            week {money(c.week_figure)} · {c.week_wagers} wager(s) ·
                            pending {c.pending_wagers}
                          </span>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[10px] leading-relaxed text-slate-500">
        Credit limit is how deep the account may run on credit — Available is what's left
        before it stops the next wager. Wager limit caps any single bet. The green/red
        blocks switch a product on or off for that customer instantly.
      </p>
    </Panel>
  );
}

// ---------------------------------------------------------- add customer ----
function AddCustomer({ onErr }: { onErr: (m: string) => void }) {
  const [isMasterView, setIsMasterView] = useState(false);
  const [agents, setAgents] = useState<{ id: number; username: string }[]>([]);

  // bulk
  const [bulk, setBulk] = useState({ count: "5", agent_id: "", prefix: "L77",
                                     start: "", credit_limit: "500", wager_limit: "500" });
  const [issued, setIssued] = useState<{ account: string; username: string; password: string }[]>([]);
  const [issuedUnder, setIssuedUnder] = useState("");
  const [busy, setBusy] = useState(false);

  // single
  const [f, setF] = useState({ username: "", password: "", starting_credit: "0",
                               credit_limit: "500", wager_limit: "500" });
  const [made, setMade] = useState<{ username: string; password: string | null } | null>(null);

  useEffect(() => {
    api.agentListAgents()
      .then((a) => { setIsMasterView(true); setAgents(a); })
      .catch(() => setIsMasterView(false));   // sub-agents can't list agents
  }, []);

  async function submitBulk(e: React.FormEvent) {
    e.preventDefault(); onErr(""); setBusy(true);
    try {
      const r = await api.agentBulkCreate({
        count: Number(bulk.count) || 1,
        prefix: bulk.prefix,
        start: bulk.start ? Number(bulk.start) : undefined,
        agent_id: bulk.agent_id ? Number(bulk.agent_id) : undefined,
        credit_limit: bulk.credit_limit || "0",
        wager_limit: bulk.wager_limit || undefined,
      });
      setIssued(r.accounts);
      setIssuedUnder(r.under_agent);
    } catch (e: any) { onErr(e.message); } finally { setBusy(false); }
  }

  async function submitSingle(e: React.FormEvent) {
    e.preventDefault(); onErr(""); setBusy(true);
    try {
      const r = await api.agentCreateCustomer({
        username: f.username,
        password: f.password || undefined,
        starting_credit: f.starting_credit || "0",
        credit_limit: f.credit_limit || "0",
        wager_limit: f.wager_limit || undefined,
      });
      setMade({ username: r.username, password: r.password });
      setF({ username: "", password: "", starting_credit: "0",
             credit_limit: "500", wager_limit: "500" });
    } catch (e: any) { onErr(e.message); } finally { setBusy(false); }
  }

  function downloadCsv() {
    const lines = [["Account", "Login", "Password"].join(",")];
    for (const a of issued) lines.push([a.account, a.username, a.password].join(","));
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `new-players-${issuedUnder}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <div className="space-y-4">
      {/* ---- bulk: the Add Player strip ---- */}
      <Panel title="Add Player" right={
        <button form="bulkform" type="submit" disabled={busy}
          className="rounded bg-accent px-4 py-1.5 text-xs font-bold text-base-900 hover:brightness-110 disabled:opacity-40">
          {busy ? "…" : "Continue"}
        </button>
      }>
        <form id="bulkform" onSubmit={submitBulk}
          className="flex flex-wrap items-end gap-3 text-xs">
          <Field label="How many accounts?">
            <input value={bulk.count} inputMode="numeric" required
              onChange={(e) => setBulk({ ...bulk, count: e.target.value })}
              className="w-24 rounded bg-base-700 px-2 py-1.5 font-mono outline-none" />
          </Field>
          <Field label="Under which agent?">
            {isMasterView ? (
              <select value={bulk.agent_id}
                onChange={(e) => setBulk({ ...bulk, agent_id: e.target.value })}
                className="rounded bg-base-700 px-2 py-1.5 outline-none">
                <option value="">me (master)</option>
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>{a.username}</option>
                ))}
              </select>
            ) : (
              <span className="inline-block rounded bg-base-700 px-2 py-1.5 text-slate-400">
                your sheet
              </span>
            )}
          </Field>
          <Field label="Prefix">
            <input value={bulk.prefix} required pattern="[A-Za-z0-9]{2,8}"
              onChange={(e) => setBulk({ ...bulk, prefix: e.target.value.toUpperCase() })}
              className="w-20 rounded bg-base-700 px-2 py-1.5 font-mono outline-none" />
          </Field>
          <Field label="Starting Account #" hint="blank = next free">
            <input value={bulk.start} inputMode="numeric"
              onChange={(e) => setBulk({ ...bulk, start: e.target.value })}
              className="w-24 rounded bg-base-700 px-2 py-1.5 font-mono outline-none" />
          </Field>
          <Field label="Credit limit">
            <input value={bulk.credit_limit} inputMode="decimal"
              onChange={(e) => setBulk({ ...bulk, credit_limit: e.target.value })}
              className="w-20 rounded bg-base-700 px-2 py-1.5 font-mono outline-none" />
          </Field>
          <Field label="Wager limit">
            <input value={bulk.wager_limit} inputMode="decimal"
              onChange={(e) => setBulk({ ...bulk, wager_limit: e.target.value })}
              className="w-20 rounded bg-base-700 px-2 py-1.5 font-mono outline-none" />
          </Field>
          <div className="pb-1 text-[10px] text-slate-500">
            Passwords are always random — shown once below, stored only as hashes.
          </div>
        </form>
      </Panel>

      {issued.length > 0 && (
        <Panel title={`Issued — ${issued.length} account(s) under ${issuedUnder}`} right={
          <button onClick={downloadCsv}
            className="rounded bg-accent/80 px-3 py-1 text-xs font-bold text-base-900 hover:bg-accent">
            ⬇ Download list
          </button>
        }>
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="border-b border-base-600 text-[9px] uppercase tracking-wide text-slate-500">
                  <th className="px-2 py-1 text-left">Account</th>
                  <th className="px-2 text-left">Login</th>
                  <th className="px-2 text-left">Password</th>
                </tr>
              </thead>
              <tbody className="font-mono">
                {issued.map((a) => (
                  <tr key={a.username} className="border-b border-base-700/40 last:border-0">
                    <td className="px-2 py-1 text-slate-400">{a.account}</td>
                    <td className="px-2 font-semibold text-gold">{a.username}</td>
                    <td className="px-2 text-accent">{a.password}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[10px] leading-relaxed text-slate-500">
            Save this list now — passwords can't be read back afterwards, only reset from
            Customer Admin.
          </p>
        </Panel>
      )}

      {/* ---- single add ---- */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Add one customer">
          <form onSubmit={submitSingle} className="space-y-3">
            <Field label="Username" hint="letters, numbers, underscore">
              <input required minLength={3} pattern="[A-Za-z0-9_]+" value={f.username}
                onChange={(e) => setF({ ...f, username: e.target.value })}
                className="w-full rounded bg-base-700 px-3 py-2 text-sm outline-none" />
            </Field>
            <Field label="Password" hint="leave blank to generate one">
              <input value={f.password} minLength={6}
                onChange={(e) => setF({ ...f, password: e.target.value })}
                className="w-full rounded bg-base-700 px-3 py-2 font-mono text-sm outline-none" />
            </Field>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Deposit" hint="usually 0">
                <input value={f.starting_credit} inputMode="decimal"
                  onChange={(e) => setF({ ...f, starting_credit: e.target.value })}
                  className="w-full rounded bg-base-700 px-3 py-2 font-mono text-sm outline-none" />
              </Field>
              <Field label="Credit limit">
                <input value={f.credit_limit} inputMode="decimal"
                  onChange={(e) => setF({ ...f, credit_limit: e.target.value })}
                  className="w-full rounded bg-base-700 px-3 py-2 font-mono text-sm outline-none" />
              </Field>
              <Field label="Wager limit">
                <input value={f.wager_limit} inputMode="decimal"
                  onChange={(e) => setF({ ...f, wager_limit: e.target.value })}
                  className="w-full rounded bg-base-700 px-3 py-2 font-mono text-sm outline-none" />
              </Field>
            </div>
            <button disabled={busy}
              className="w-full rounded-lg btn-gold py-2.5 text-sm font-bold text-base-900 disabled:opacity-50">
              {busy ? "…" : "Create login"}
            </button>
          </form>
        </Panel>

        <Panel title="Issued">
          {made ? (
            <div className="rounded bg-base-900 p-3">
              <div className="text-xs text-slate-400">Give these to the customer:</div>
              <div className="mt-2 font-mono text-sm">
                <div>user: <span className="text-gold">{made.username}</span></div>
                <div>pass: <span className="text-gold">{made.password ?? "(the one you set)"}</span></div>
              </div>
            </div>
          ) : (
            <Empty msg="Single-add logins appear here." />
          )}
        </Panel>
      </div>
    </div>
  );
}

function Field({ label, hint, children }: {
  label: string; hint?: string; children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1 block text-[10px] uppercase tracking-wide text-slate-500">
        {label}{hint && <span className="ml-2 normal-case text-slate-600">{hint}</span>}
      </label>
      {children}
    </div>
  );
}

// --------------------------------------------------------------- wagers ----
function amer(d: string): string {
  const n = Number(d);
  if (!isFinite(n) || n <= 1) return "—";
  return n >= 2 ? `+${Math.round((n - 1) * 100)}` : String(Math.round(-100 / (n - 1)));
}

const MARKET_ABBR: Record<string, string> = {
  "Moneyline": "ML", "Match Result": "ML", "Both Teams To Score": "BTTS",
  "Double Chance": "DC",
};

function legLabel(l: { selection: string; market: string }): string {
  const abbr = MARKET_ABBR[l.market]
    ?? (l.market.startsWith("Total") ? "" : l.market.startsWith("Spread") ? "" : l.market);
  return abbr ? `${l.selection} ${abbr}` : l.selection;
}

function ResultMark({ r }: { r: string | null }) {
  if (!r) return null;
  const map: Record<string, [string, string]> = {
    won: ["W", "text-accent"], lost: ["L", "text-red-400"],
    push: ["P", "text-slate-400"], void: ["V", "text-slate-500"],
    half_won: ["½W", "text-accent"], half_lost: ["½L", "text-red-400"],
  };
  const [mark, cls] = map[r] ?? [r, "text-slate-500"];
  return <span className={`ml-1.5 font-bold ${cls}`}>{mark}</span>;
}

function Wagers({ status, onErr }: {
  status: "pending" | "graded" | "deleted"; onErr: (m: string) => void;
}) {
  const [rows, setRows] = useState<AgentWager[] | null>(null);
  const [search, setSearch] = useState("");
  const [agentQ, setAgentQ] = useState("");
  const [showBuyouts, setShowBuyouts] = useState(false);
  const [type, setType] = useState<"all" | "single" | "parlay">("all");
  const [time, setTime] = useState<"all" | "today" | "3d" | "week">("all");
  const [minAmt, setMinAmt] = useState(0);
  const today = new Date().toISOString().slice(0, 10);
  const weekAgo = new Date(Date.now() - 6 * 864e5).toISOString().slice(0, 10);
  const [start, setStart] = useState(weekAgo);
  const [end, setEnd] = useState(today);

  const load = useCallback(() => {
    api.agentWagers(status).then(setRows).catch((e) => onErr(e.message));
  }, [status, onErr]);
  useEffect(load, [load]);

  async function voidWager(id: number) {
    if (!confirm(`Void wager #${id} and refund the stake?`)) return;
    try { await api.agentVoidWager(id); onErr(""); load(); }
    catch (e: any) { onErr(e.message); }
  }
  async function buyoutWager(w: AgentWager) {
    const v = prompt(
      `Buy out wager #${w.bet_id} — amount to refund ${w.customer} ` +
      `(stake ${money(w.risk)}, full payout ${money(Number(w.risk) + Number(w.to_win))})`,
      w.risk);
    if (v === null || v.trim() === "") return;
    try { await api.agentVoidWager(w.bet_id, v.trim()); onErr(""); load(); }
    catch (e: any) { onErr(e.message); }
  }

  const title = status === "pending" ? "Pending Reports"
    : status === "deleted" ? "Deleted Wagers" : "Graded Reports";
  if (!rows) return <Panel title={title}><Empty msg="loading…" /></Panel>;

  const cutoff = (() => {
    const now = Date.now();
    if (time === "today") { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); }
    if (time === "3d") return now - 3 * 864e5;
    if (time === "week") return now - 7 * 864e5;
    return 0;
  })();

  const inRange = (w: AgentWager) => {
    if (status !== "graded") return new Date(w.placed_at).getTime() >= cutoff;
    const t0 = new Date(`${start}T00:00:00`).getTime();
    const t1 = new Date(`${end}T23:59:59.999`).getTime();
    const t = new Date(w.placed_at).getTime();
    return t >= t0 && t <= t1;
  };
  const filtered = rows.filter((w) =>
    (search === "" ||
      w.customer.toLowerCase().includes(search.toLowerCase()) ||
      w.account.toLowerCase().includes(search.toLowerCase())) &&
    (agentQ === "" || w.agent.toLowerCase().includes(agentQ.toLowerCase())) &&
    (status !== "deleted" || showBuyouts || w.status !== "buyout") &&
    (type === "all" || w.type === type) &&
    Number(w.risk) >= minAmt &&
    inRange(w));

  const risking = filtered.reduce((a, w) => a + Number(w.risk), 0);
  const toWin = filtered.reduce((a, w) => a + Number(w.to_win), 0);
  const paid = filtered.reduce((a, w) => a + Number(w.payout ?? 0), 0);

  return (
    <div className="space-y-2">
      {/* filter row */}
      <div className="flex flex-wrap items-end gap-2 rounded-lg border border-white/5 bg-base-800 shadow-card p-3 text-xs">
        <div>
          <div className="mb-1 text-[9px] uppercase tracking-wide text-slate-500">Agent Filter</div>
          <input value={agentQ} onChange={(e) => setAgentQ(e.target.value)}
            placeholder="search agents…"
            className="w-32 rounded bg-base-700 px-2 py-1.5 outline-none" />
        </div>
        <div>
          <div className="mb-1 text-[9px] uppercase tracking-wide text-slate-500">Player Filter</div>
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="name or account…"
            className="w-36 rounded bg-base-700 px-2 py-1.5 outline-none" />
        </div>
        {status === "graded" ? (
          <>
            <div>
              <div className="mb-1 text-[9px] uppercase tracking-wide text-slate-500">Start</div>
              <input type="date" value={start} max={end}
                onChange={(e) => setStart(e.target.value)}
                className="rounded bg-base-700 px-2 py-1 outline-none" />
            </div>
            <div>
              <div className="mb-1 text-[9px] uppercase tracking-wide text-slate-500">End</div>
              <input type="date" value={end} min={start}
                onChange={(e) => setEnd(e.target.value)}
                className="rounded bg-base-700 px-2 py-1 outline-none" />
            </div>
          </>
        ) : (
          <div>
            <div className="mb-1 text-[9px] uppercase tracking-wide text-slate-500">Time</div>
            <select value={time} onChange={(e) => setTime(e.target.value as any)}
              className="rounded bg-base-700 px-2 py-1.5 outline-none">
              <option value="all">All</option>
              <option value="today">Today</option>
              <option value="3d">Last 3 Days</option>
              <option value="week">This Week</option>
            </select>
          </div>
        )}
        <div>
          <div className="mb-1 text-[9px] uppercase tracking-wide text-slate-500">Type</div>
          <select value={type} onChange={(e) => setType(e.target.value as any)}
            className="rounded bg-base-700 px-2 py-1.5 outline-none">
            <option value="all">All Types</option>
            <option value="single">Straights</option>
            <option value="parlay">Parlays</option>
          </select>
        </div>
        <div>
          <div className="mb-1 text-[9px] uppercase tracking-wide text-slate-500">Amount</div>
          <select value={minAmt} onChange={(e) => setMinAmt(Number(e.target.value))}
            className="rounded bg-base-700 px-2 py-1.5 outline-none">
            <option value={0}>Any Amount</option>
            <option value={50}>50+</option>
            <option value={100}>100+</option>
            <option value={250}>250+</option>
          </select>
        </div>
        {status === "deleted" && (
          <label className="flex cursor-pointer items-center gap-2 pb-1">
            <span className="text-[9px] uppercase tracking-wide text-slate-500">Show Buyouts</span>
            <button type="button" onClick={() => setShowBuyouts(!showBuyouts)}
              className={`relative h-5 w-9 rounded-full transition-colors ${
                showBuyouts ? "bg-accent/80" : "bg-base-600"}`}>
              <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${
                showBuyouts ? "left-[18px]" : "left-0.5"}`} />
            </button>
          </label>
        )}
        <div className="ml-auto font-mono text-[11px]">
          {status === "pending" && (
            <>Risking: <span className="font-bold text-red-300">{money(risking)}</span>
              <span className="ml-3">To Win: <span className="font-bold text-accent">{money(toWin)}</span></span></>
          )}
          {status === "graded" && (() => {
            const net = filtered.reduce((a, w) => a + Number(w.payout ?? 0) - Number(w.risk), 0);
            return (
              <>Wagers: <span className="font-bold text-slate-200">{filtered.length}</span>
                <span className="ml-3">Result:{" "}
                  <span className={`font-bold ${net > 0 ? "text-accent" : net < 0 ? "text-red-400" : "text-slate-400"}`}>
                    {net > 0 ? "+" : ""}{money(net)}
                  </span>
                </span></>
            );
          })()}
          {status === "deleted" && (
            <>Refunded: <span className="font-bold text-slate-200">{money(paid)}</span></>
          )}
        </div>
      </div>

      <Panel title={title} right={
        <span className="text-[10px] text-slate-500">{filtered.length} wager(s)</span>
      }>
        {filtered.length === 0 ? <Empty msg={
          status === "deleted"
            ? "No voided wagers. Tickets cancelled from Pending Reports land here."
            : "Nothing matches the filters."} /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="border-b border-base-600 bg-base-900/60 text-[9px] uppercase tracking-wide text-slate-500">
                  <th className="px-2 py-1.5 text-left">Agent</th>
                  <th className="px-2 text-left">Customer</th>
                  <th className="px-2 text-left">Accepted</th>
                  <th className="px-2 text-left">Description</th>
                  {status === "graded" ? (
                    <th className="px-2 text-right">Amount</th>
                  ) : (
                    <>
                      <th className="px-2 text-right">Risk</th>
                      <th className="px-2 text-right">To Win</th>
                    </>
                  )}
                  {status === "pending" && <th className="px-2 text-right"></th>}
                </tr>
              </thead>
              <tbody className="align-top font-mono">
                {filtered.map((w) => (
                  <tr key={w.bet_id} className="border-b border-base-700/40 last:border-0 hover:bg-base-700/20">
                    <td className="px-2 py-1.5 font-sans text-slate-400">{w.agent}</td>
                    <td className="px-2 py-1.5">
                      <span className="font-semibold text-gold">{w.account}</span>
                      <div className="font-sans text-[10px] text-slate-500">{w.customer}</div>
                    </td>
                    <td className="whitespace-nowrap px-2 py-1.5 text-slate-500">
                      {new Date(w.placed_at).toLocaleString(undefined,
                        { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                    </td>
                    <td className="px-2 py-1.5">
                      {w.legs.length > 1 ? (
                        <>
                          <div className="font-sans font-semibold text-slate-200">
                            {({ parlay: "Parlay", teaser: "Teaser", if_win: "If-Win",
                               if_action: "If-Action", reverse: "Reverse",
                             } as Record<string, string>)[w.type] ?? w.type}
                            {" — "}{w.legs.length} Teams
                          </div>
                          <div className="mt-0.5 space-y-0.5 pl-3">
                            {w.legs.map((l, i) => (
                              <div key={i} className="text-slate-300">
                                <span className="font-sans">{legLabel(l)}</span>
                                <span className="ml-1.5 text-slate-400">{amer(l.odds)}</span>
                                <ResultMark r={l.result} />
                                {l.score && <span className="ml-1.5 text-[10px] text-slate-500">{l.score}</span>}
                              </div>
                            ))}
                          </div>
                        </>
                      ) : (
                        <div>
                          <span className="font-sans text-slate-200">{legLabel(w.legs[0] ?? { selection: "?", market: "" })}</span>
                          <span className="ml-1.5 text-slate-400">{amer(w.legs[0]?.odds ?? "0")}</span>
                          <ResultMark r={w.legs[0]?.result ?? null} />
                          <div className="font-sans text-[10px] text-slate-500">
                            {w.legs[0]?.event}
                            {w.legs[0]?.score && <span className="ml-1.5">{w.legs[0]?.score}</span>}
                          </div>
                        </div>
                      )}
                    </td>
                    {status === "graded" ? (() => {
                      const net = Number(w.payout ?? 0) - Number(w.risk);
                      return (
                        <td className={`px-2 py-1.5 text-right font-semibold ${
                          net > 0 ? "text-accent" : net < 0 ? "text-red-400" : "text-slate-400"}`}>
                          {net > 0 ? "+" : ""}{money(net)}
                          <div className="text-[9px] font-normal uppercase text-slate-500">{w.status}</div>
                        </td>
                      );
                    })() : (
                      <>
                        <td className="px-2 py-1.5 text-right text-red-300">
                          {money(w.risk)}
                          {status === "deleted" && (
                            <div className="text-[9px] font-normal uppercase text-slate-500">
                              {w.status === "buyout" ? `bought out · ${money(w.payout ?? 0)}` : "void"}
                            </div>
                          )}
                        </td>
                        <td className="px-2 py-1.5 text-right text-accent">{money(w.to_win)}</td>
                      </>
                    )}
                    {status === "pending" && (
                      <td className="px-2 py-1.5 text-right">
                        <div className="flex justify-end gap-1">
                          <button onClick={() => buyoutWager(w)}
                            className="rounded bg-base-700 px-2 py-0.5 font-sans text-[10px] text-gold hover:bg-base-600">
                            buy out
                          </button>
                          <button onClick={() => voidWager(w.bet_id)}
                            className="rounded bg-red-950 px-2 py-0.5 font-sans text-[10px] text-red-300 hover:bg-red-900">
                            void
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}

// --------------------------------------------------------------- settle ----
function Settle({ onErr }: { onErr: (m: string) => void }) {
  const [d, setD] = useState<Awaited<ReturnType<typeof api.agentCollections>> | null>(null);
  const [agentQ, setAgentQ] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<number | null>(null);
  const [done, setDone] = useState<string[]>([]);

  const load = useCallback(() => {
    api.agentCollections(agentQ).then(setD).catch((e) => onErr(e.message));
  }, [agentQ, onErr]);
  useEffect(load, [load]);

  async function settle(c: { id: number; username: string }) {
    onErr(""); setBusy(c.id);
    try {
      const r = await api.agentSettle(c.id, 0, note);
      setDone((p) => [`${r.username}: figure ${money(r.figure)}, balance reset to ${money(r.balance_reset_to)}`, ...p]);
      load();
    } catch (e: any) { onErr(`${c.username}: ${e.message}`); }
    finally { setBusy(null); }
  }

  if (!d) return <Panel title="Settle Figures"><Empty msg="loading…" /></Panel>;
  const t = d.totals;
  const cell = (v: string, strong = false) => {
    const n = Number(v);
    return (
      <td className={`text-right ${strong ? "font-bold" : "font-semibold"} ${
        n < 0 ? "text-red-400" : n > 0 ? "text-accent" : "text-slate-500"}`}>
        {money(v)}
      </td>
    );
  };

  return (
    <Panel title="Settle Figures" right={
      <span className="font-mono text-[10px] text-slate-500">
        week of {d.week_start.slice(0, 10)}
      </span>
    }>
      <div className="mb-3 flex flex-wrap items-end gap-3 rounded-md bg-base-700/40 p-3">
        <label className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wide text-slate-500">Agent Filter</span>
          <input value={agentQ} onChange={(e) => setAgentQ(e.target.value)}
            placeholder="Search agents…"
            className="rounded border border-base-600 bg-base-700 px-2 py-1 text-[11px] text-slate-200 placeholder:text-slate-500" />
        </label>
        <label className="flex min-w-[220px] flex-1 flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wide text-slate-500">Settle note</span>
          <input value={note} onChange={(e) => setNote(e.target.value)}
            placeholder="optional — e.g. paid cash 08/14"
            className="rounded border border-base-600 bg-base-700 px-2 py-1 text-[11px] text-slate-200 placeholder:text-slate-500" />
        </label>
      </div>

      {d.customers.length === 0 ? <Empty msg="No customers on this sheet." /> : (
        <div className="overflow-x-auto">
          <Table head={["Customer", "Name", "Agent", "Carry", "Settle", "This Week",
                        "Payments", "Balance", ""]}>
            {d.customers.map((c) => (
              <tr key={c.id} className={`border-b border-base-700/50 last:border-0 ${
                !c.active ? "opacity-50" : ""}`}>
                <td className="py-1.5 text-left font-mono text-slate-300">{c.account}</td>
                <td className="pl-3 text-left font-sans text-slate-200">{c.username}</td>
                <td className="pl-3 text-left font-sans text-slate-500">{c.agent}</td>
                {cell(c.carry)}
                {cell(c.settle)}
                {cell(c.this_week)}
                {cell(c.payments)}
                {cell(c.balance, true)}
                <td className="pl-3 text-right font-sans">
                  {c.settled_this_week ? (
                    <span className="text-[10px] uppercase text-slate-500">settled</span>
                  ) : Number(c.balance) === 0 ? (
                    <span className="text-[10px] text-slate-600">—</span>
                  ) : (
                    <Mini onClick={() => settle(c)} disabled={busy === c.id}>
                      {busy === c.id ? "…" : Number(c.balance) > 0 ? "pay out" : "collect"}
                    </Mini>
                  )}
                </td>
              </tr>
            ))}
            <tr className="bg-base-700/60">
              <td className="py-1.5 pl-1 text-left font-bold text-slate-200">Total</td>
              <td /><td />
              {cell(t.carry, true)}
              {cell(t.settle, true)}
              {cell(t.week, true)}
              {cell(t.payments, true)}
              {cell(t.balance, true)}
              <td />
            </tr>
          </Table>
        </div>
      )}

      <p className="mt-3 text-[10px] leading-relaxed text-slate-500">
        Balance = Carry + This Week + Payments. Settling squares up the whole balance —
        cash changes hands outside the system; the balancing entry is posted here so the
        books still sum to zero, and next week starts from a clean sheet.
      </p>

      {done.length > 0 && (
        <div className="mt-3 space-y-1 border-t border-base-600 pt-3 font-mono text-[11px] text-slate-400">
          {done.map((l, i) => <div key={i}>{l}</div>)}
        </div>
      )}
    </Panel>
  );
}

// ---------------------------------------------------------- performance ----
function PerformanceView({ onErr }: { onErr: (m: string) => void }) {
  const [stats, setStats] = useState<Performance | null>(null);
  const [report, setReport] = useState<Awaited<ReturnType<typeof api.agentPerfReport>> | null>(null);
  const [win, setWin] = useState("today");
  const [action, setAction] = useState("all");
  const [q, setQ] = useState("");
  const [grouped, setGrouped] = useState(true);

  useEffect(() => { api.agentPerformance().then(setStats).catch((e) => onErr(e.message)); }, [onErr]);
  useEffect(() => {
    setReport(null);
    api.agentPerfReport(win, action).then(setReport).catch((e) => onErr(e.message));
  }, [win, action, onErr]);

  const rows = (report?.customers ?? []).filter((c) =>
    q === "" || c.username.toLowerCase().includes(q.toLowerCase()) ||
    c.account.toLowerCase().includes(q.toLowerCase()));

  function exportCsv() {
    if (!report) return;
    const lines = [["Account", "Name", "Agent", "Wagers", "Volume", "Figure", "Pending"].join(",")];
    for (const c of rows) {
      lines.push([c.account, c.username, c.agent, c.wagers, c.volume, c.figure, c.pending].join(","));
    }
    const t = report.totals;
    lines.push(["TOTAL", "", "", t.wagers, t.volume, t.figure, t.pending].join(","));
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `performance-${win}-${action}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const groups = new Map<string, typeof rows>();
  if (grouped) {
    for (const c of rows) {
      if (!groups.has(c.agent)) groups.set(c.agent, []);
      groups.get(c.agent)!.push(c);
    }
  } else {
    groups.set("", [...rows].sort((a, b) => Number(b.volume) - Number(a.volume)));
  }

  const sum = (list: typeof rows, k: "volume" | "figure" | "pending") =>
    list.reduce((a, c) => a + Number(c[k]), 0);

  const bal = stats ? signed(stats.house_balance) : null;

  return (
    <div className="space-y-2">
      {stats && (
        <div className="flex flex-wrap gap-8 rounded-lg border border-white/5 bg-base-800 shadow-card p-3">
          <Stat k={stats.scope === "master" ? "Book balance" : "Your sheet"} v={bal!.text} cls={bal!.cls} />
          <Stat k="Customers" v={`${stats.active_customers} / ${stats.customers}`} />
          <Stat k="Open risk" v={money(stats.open_wagers_risk)} />
          <Stat k="Open liability" v={money(stats.open_wagers_liability)} />
        </div>
      )}

      <div className="flex flex-wrap items-end gap-2 rounded-lg border border-white/5 bg-base-800 shadow-card p-3 text-xs">
        <div>
          <div className="mb-1 text-[9px] uppercase tracking-wide text-slate-500">Type</div>
          <span className="inline-block rounded btn-gold px-3 py-1.5 font-bold text-base-900">
            Customer Performance
          </span>
        </div>
        <div>
          <div className="mb-1 text-[9px] uppercase tracking-wide text-slate-500">Filter</div>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="search accounts…"
            className="w-36 rounded bg-base-700 px-2 py-1.5 outline-none" />
        </div>
        <div>
          <div className="mb-1 text-[9px] uppercase tracking-wide text-slate-500">Actions</div>
          <select value={action} onChange={(e) => setAction(e.target.value)}
            className="rounded bg-base-700 px-2 py-1.5 outline-none">
            <option value="all">All Action</option>
            <option value="sportsbook">Sportsbook</option>
            <option value="casino">Casino</option>
          </select>
        </div>
        <div>
          <div className="mb-1 text-[9px] uppercase tracking-wide text-slate-500">Sort</div>
          <select value={grouped ? "agent" : "volume"}
            onChange={(e) => setGrouped(e.target.value === "agent")}
            className="rounded bg-base-700 px-2 py-1.5 outline-none">
            <option value="agent">Group Agent</option>
            <option value="volume">By Volume</option>
          </select>
        </div>
        <div>
          <div className="mb-1 text-[9px] uppercase tracking-wide text-slate-500">Schedule</div>
          <select value={win} onChange={(e) => setWin(e.target.value)}
            className="rounded bg-base-700 px-2 py-1.5 outline-none">
            <option value="today">Today</option>
            <option value="week">This Week</option>
            <option value="lastweek">Last Week</option>
            <option value="month">This Month</option>
            <option value="all">All Time</option>
          </select>
        </div>
        <button onClick={exportCsv}
          className="ml-auto rounded bg-accent/80 px-3 py-1.5 font-bold text-base-900 hover:bg-accent">
          ⬇ Export
        </button>
      </div>

      <Panel title="Customer Performance" right={
        report && (() => {
          const f = signed(report.totals.book_figure);
          return (
            <span className="font-mono text-[11px]">
              <span className="text-slate-400">{rows.length} customer(s) · book: </span>
              <span className={`font-bold ${f.cls}`}>{f.text}</span>
            </span>
          );
        })()
      }>
        {!report ? <Empty msg="loading…" /> : rows.length === 0 ? (
          <Empty msg="No action in this window." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full whitespace-nowrap text-[11px]">
              <thead>
                <tr className="border-b border-base-600 bg-base-900/60 text-[9px] uppercase tracking-wide text-slate-500">
                  <th className="px-2 py-1.5 text-left">Customer</th>
                  <th className="px-2 text-left">Name</th>
                  <th className="px-2 text-right">Wagers</th>
                  <th className="px-2 text-right">Volume</th>
                  <th className="px-2 text-right">Pending</th>
                  <th className="px-2 text-right">Figure</th>
                </tr>
              </thead>
              <tbody className="font-mono">
                {[...groups.entries()].map(([agentName, list]) => (
                  <Fragment key={agentName || "flat"}>
                    {agentName && (
                      <tr className="bg-base-900/70">
                        <td colSpan={6} className="px-2 py-1 font-sans text-[10px] font-bold uppercase tracking-wide text-gold">
                          🎩 {agentName}
                        </td>
                      </tr>
                    )}
                    {list.map((c) => {
                      const f = signed(c.figure);
                      return (
                        <tr key={c.id} className="border-b border-base-700/40 hover:bg-base-700/20">
                          <td className="px-2 py-1 font-semibold text-gold">{c.account}</td>
                          <td className="px-2 font-sans text-slate-200">
                            {c.username}
                            {!c.active && <span className="ml-1 text-[9px] text-red-400">SUSP</span>}
                          </td>
                          <td className="px-2 text-right text-slate-400">{c.wagers}</td>
                          <td className="px-2 text-right text-slate-300">{money(c.volume)}</td>
                          <td className="px-2 text-right text-slate-500">
                            {Number(c.pending) !== 0 ? money(c.pending) : "0"}
                          </td>
                          <td className={`px-2 text-right font-semibold ${f.cls}`}>{f.text}</td>
                        </tr>
                      );
                    })}
                    {agentName && list.length > 1 && (
                      <tr className="border-b border-base-600 bg-base-900/40 text-[10px]">
                        <td colSpan={2} className="px-2 py-0.5 font-sans text-slate-500">subtotal</td>
                        <td className="px-2 text-right text-slate-500">
                          {list.reduce((a, c) => a + c.wagers, 0)}
                        </td>
                        <td className="px-2 text-right text-slate-400">{money(sum(list, "volume"))}</td>
                        <td className="px-2 text-right text-slate-500">{money(sum(list, "pending"))}</td>
                        <td className={`px-2 text-right font-semibold ${
                          sum(list, "figure") > 0 ? "text-accent"
                            : sum(list, "figure") < 0 ? "text-red-400" : "text-slate-400"}`}>
                          {money(sum(list, "figure"))}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-base-600 bg-base-900/80 font-mono font-semibold">
                  <td colSpan={2} className="px-2 py-1.5 font-sans text-slate-300">Grand Totals</td>
                  <td className="px-2 text-right">{report.totals.wagers}</td>
                  <td className="px-2 text-right">{money(report.totals.volume)}</td>
                  <td className="px-2 text-right text-slate-400">{money(report.totals.pending)}</td>
                  <td className={`px-2 text-right ${
                    Number(report.totals.figure) > 0 ? "text-accent"
                      : Number(report.totals.figure) < 0 ? "text-red-400" : "text-slate-400"}`}>
                    {money(report.totals.figure)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
        <p className="mt-2 text-[10px] leading-relaxed text-slate-500">
          Figure is from the customer's side — positive means they're up. Pending stakes
          count as still-running, not as losses. The Actions filter splits by product
          using the ledger's own record of where each entry came from.
        </p>
      </Panel>
    </div>
  );
}

// ---------------------------------------------------- enter transaction ----
type TxnRow = { kind: "deposit" | "withdrawal"; amount: string; note: string };

function EnterTransaction({ onErr, onDone }: {
  onErr: (m: string) => void; onDone: () => void;
}) {
  const [customers, setCustomers] = useState<Customer[] | null>(null);
  const [rows, setRows] = useState<Record<number, TxnRow>>({});
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [posted, setPosted] = useState<string[]>([]);
  const [historyFor, setHistoryFor] = useState<Customer | null>(null);
  const [history, setHistory] = useState<Awaited<ReturnType<typeof api.agentTransactions>> | null>(null);

  const load = useCallback(() => {
    api.agentCustomers().then(setCustomers).catch((e) => onErr(e.message));
  }, [onErr]);
  useEffect(load, [load]);

  useEffect(() => {
    if (!historyFor) { setHistory(null); return; }
    api.agentTransactions({ kind: "all", user_id: historyFor.id })
      .then(setHistory).catch((e) => onErr(e.message));
  }, [historyFor, onErr]);

  const row = (id: number): TxnRow => rows[id] ?? { kind: "deposit", amount: "", note: "" };
  const setRow = (id: number, patch: Partial<TxnRow>) =>
    setRows((p) => ({ ...p, [id]: { ...row(id), ...patch } }));

  function zero(c: Customer) {
    const bal = Number(c.balance);
    if (bal === 0) { setRow(c.id, { amount: "" }); return; }
    // a deposit clears what they owe; a withdrawal clears what they're owed
    setRow(c.id, {
      kind: bal < 0 ? "deposit" : "withdrawal",
      amount: Math.abs(bal).toFixed(2),
    });
  }

  const staged = customers?.filter((c) => Number(row(c.id).amount) > 0) ?? [];

  async function submit() {
    if (staged.length === 0) return;
    setBusy(true); onErr("");
    const results: string[] = [];
    for (const c of staged) {
      const r = row(c.id);
      const amt = r.kind === "deposit" ? r.amount : `-${r.amount}`;
      const note = r.note || (r.kind === "deposit" ? "Customer Deposit" : "Customer Withdrawal");
      try {
        const res = await api.agentAdjust(c.id, amt, note);
        results.push(`${c.username}: ${r.kind} ${money(r.amount)} → balance ${money(res.balance)}`);
      } catch (e: any) {
        results.push(`${c.username}: FAILED — ${e.message}`);
      }
    }
    setPosted((p) => [...results, ...p].slice(0, 20));
    setRows({});
    setBusy(false);
    load(); onDone();
  }

  if (!customers) return <Panel title="Enter Transaction"><Empty msg="loading…" /></Panel>;
  if (customers.length === 0) {
    return <Panel title="Enter Transaction"><Empty msg="No customers yet — use Add Customer." /></Panel>;
  }

  const shown = customers.filter((c) =>
    q === "" || c.username.toLowerCase().includes(q.toLowerCase()) ||
    c.account.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-white/5 bg-base-800 shadow-card p-3 text-xs">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="search…"
          className="w-40 rounded bg-base-700 px-2 py-1.5 outline-none" />
        <span className="text-[10px] text-slate-500">
          Zero fills the exact amount that squares a balance to even.
        </span>
        <button onClick={submit} disabled={busy || staged.length === 0}
          className="ml-auto rounded bg-accent px-4 py-1.5 font-bold text-base-900 hover:brightness-110 disabled:opacity-40">
          {busy ? "posting…" : `Continue${staged.length ? ` (${staged.length})` : ""}`}
        </button>
      </div>

      <Panel title="Enter Transaction" right={
        <span className="text-[10px] text-slate-500">{shown.length} customer(s)</span>
      }>
        <div className="overflow-x-auto">
          <table className="w-full whitespace-nowrap text-[11px]">
            <thead>
              <tr className="border-b border-base-600 bg-base-900/60 text-[9px] uppercase tracking-wide text-slate-500">
                <th className="px-2 py-1.5 text-left">Customer</th>
                <th className="px-2 text-right">Balance</th>
                <th className="px-2 text-left">Transaction</th>
                <th className="px-2 text-left">Amount</th>
                <th className="px-2"></th>
                <th className="px-2 text-left">Description</th>
                <th className="px-2 text-right"></th>
              </tr>
            </thead>
            <tbody className="font-mono">
              {shown.map((c) => {
                const r = row(c.id);
                const bal = Number(c.balance);
                const active = Number(r.amount) > 0;
                return (
                  <Fragment key={c.id}>
                    <tr className={`border-b border-base-700/40 ${active ? "bg-gold/5" : "hover:bg-base-700/20"}`}>
                      <td className="px-2 py-1">
                        <span className="font-semibold text-gold">{c.account}</span>
                        <span className="ml-2 font-sans text-slate-300">{c.username}</span>
                        {!c.active && <span className="ml-1 font-sans text-[9px] text-red-400">SUSP</span>}
                      </td>
                      <td className={`px-2 text-right font-semibold ${
                        bal > 0 ? "text-accent" : bal < 0 ? "text-red-400" : "text-slate-500"}`}>
                        {money(c.balance)}
                      </td>
                      <td className="px-2 py-1">
                        <select value={r.kind}
                          onChange={(e) => setRow(c.id, { kind: e.target.value as TxnRow["kind"] })}
                          className="rounded bg-base-700 px-1.5 py-1 font-sans outline-none">
                          <option value="deposit">Deposit</option>
                          <option value="withdrawal">Withdrawal</option>
                        </select>
                      </td>
                      <td className="px-2 py-1">
                        <input value={r.amount} inputMode="decimal" placeholder="Amount"
                          onChange={(e) => setRow(c.id, { amount: e.target.value.replace(/^-/, "") })}
                          className="w-24 rounded bg-base-700 px-2 py-1 outline-none placeholder:text-slate-600" />
                      </td>
                      <td className="px-1 py-1">
                        <button onClick={() => zero(c)}
                          className="rounded bg-sky-600/80 px-2 py-1 font-sans text-[10px] font-bold text-white hover:bg-sky-500">
                          Zero
                        </button>
                      </td>
                      <td className="px-2 py-1">
                        <input value={r.note}
                          placeholder={r.kind === "deposit" ? "Customer Deposit" : "Customer Withdrawal"}
                          onChange={(e) => setRow(c.id, { note: e.target.value })}
                          className="w-40 rounded bg-base-700 px-2 py-1 font-sans outline-none placeholder:text-slate-600" />
                      </td>
                      <td className="px-2 py-1 text-right">
                        <button onClick={() => setHistoryFor(historyFor?.id === c.id ? null : c)}
                          className="rounded bg-sky-700/70 px-2.5 py-1 font-sans text-[10px] font-bold text-white hover:bg-sky-600">
                          History
                        </button>
                      </td>
                    </tr>
                    {historyFor?.id === c.id && (
                      <tr className="border-b border-base-700/40 bg-base-900/70">
                        <td colSpan={7} className="px-3 py-2">
                          {!history ? <span className="text-slate-500">loading…</span> : (
                            <div className="max-h-48 space-y-0.5 overflow-y-auto">
                              {history.rows.length === 0 && <span className="text-slate-500">No transactions.</span>}
                              {history.rows.map((h) => {
                                const a = signed(h.amount);
                                return (
                                  <div key={h.id} className="flex justify-between gap-3 text-[10px]">
                                    <span className="text-slate-500">
                                      {new Date(h.at).toLocaleString(undefined,
                                        { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                                    </span>
                                    <span className="font-sans text-slate-400">{h.kind}</span>
                                    <span className={a.cls}>{a.text}</span>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>

      {posted.length > 0 && (
        <Panel title="Posted">
          <div className="space-y-1 font-mono text-[11px] text-slate-300">
            {posted.map((l, i) => <div key={i} className={l.includes("FAILED") ? "text-red-300" : ""}>{l}</div>)}
          </div>
          <p className="mt-2 text-[10px] leading-relaxed text-slate-500">
            Every transaction lands in the ledger with your agent id and note. Adjustments
            never count toward win/loss figures.
          </p>
        </Panel>
      )}
    </div>
  );
}

// -------------------------------------------------------------- position ----
type PosData = Awaited<ReturnType<typeof api.agentPosition>>;
type PosCell = { w: string; r: string; c: number };

const POS_BUCKETS = ["spread", "total", "ml", "other"] as const;

function Position({ onErr }: { onErr: (m: string) => void }) {
  const [d, setD] = useState<PosData | null>(null);
  const [view, setView] = useState<"w" | "r" | "c">("r");
  const [sport, setSport] = useState("all");

  useEffect(() => { api.agentPosition().then(setD).catch((e) => onErr(e.message)); }, [onErr]);
  if (!d) return <Panel title="Agent Position"><Empty msg="loading…" /></Panel>;

  const cellVal = (c: PosCell) =>
    view === "c" ? (c.c || "") : Number(c[view]) !== 0 ? money(c[view]) : "";

  const Cell = ({ c }: { c: PosCell }) => (
    <td className={`border-l border-base-700/40 px-1.5 py-0.5 text-right ${
      c.c > 0 ? "text-slate-200" : "text-slate-700"}`}>
      {cellVal(c)}
    </td>
  );

  const sports = d.sports.filter((s) => sport === "all" || s.sport === sport);
  const hasAction = (g: PosData["sports"][0]["games"][0]) =>
    g.rows.some((r) => Object.values(r.cells).some((k) =>
      Object.values(k).some((c) => c.c > 0)));

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-white/5 bg-base-800 shadow-card p-3 text-xs">
        <div className="flex flex-wrap gap-1">
          <button onClick={() => setSport("all")}
            className={`rounded-full px-3 py-1 ${sport === "all"
              ? "btn-gold font-semibold text-base-900" : "bg-base-700 hover:bg-base-600"}`}>
            All
          </button>
          {d.sports.map((s) => (
            <button key={s.sport} onClick={() => setSport(s.sport)}
              className={`rounded-full px-3 py-1 ${sport === s.sport
                ? "btn-gold font-semibold text-base-900" : "bg-base-700 hover:bg-base-600"}`}>
              {s.icon} {s.sport}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-1">
          <span className="mr-1 text-[10px] uppercase tracking-wide text-slate-500">Show:</span>
          {([["w", "$", "to win"], ["r", "R", "risk"], ["c", "#", "tickets"]] as const).map(([k, label, hint]) => (
            <button key={k} onClick={() => setView(k)} title={hint}
              className={`h-7 w-8 rounded font-bold ${view === k
                ? k === "w" ? "bg-accent text-base-900"
                  : k === "r" ? "btn-gold text-base-900" : "bg-slate-400 text-base-900"
                : "bg-base-700 text-slate-300 hover:bg-base-600"}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <Panel title="Agent Position" right={
        <span className="text-[10px] text-slate-500">
          {view === "w" ? "showing what the book pays if that side wins"
            : view === "r" ? "showing stake riding on each side" : "showing ticket counts"}
        </span>
      }>
        <div className="overflow-x-auto">
          <table className="w-full whitespace-nowrap font-mono text-[11px]">
            <thead>
              <tr className="border-b border-base-600 text-[9px] uppercase tracking-wide text-slate-500">
                <th className="px-2 py-1 text-left font-sans" rowSpan={2}>Game</th>
                <th className="px-2 text-center" rowSpan={2}>Score</th>
                <th className="border-l border-base-600 px-2 pb-0.5 text-center" colSpan={4}>Straight</th>
                <th className="border-l border-base-600 px-2 pb-0.5 text-center" colSpan={4}>Parlay</th>
              </tr>
              <tr className="border-b border-base-600 text-[9px] uppercase tracking-wide text-slate-500">
                {[0, 1].map((i) => POS_BUCKETS.map((b) => (
                  <th key={`${i}-${b}`} className="border-l border-base-700/40 px-1.5 pb-1 text-right">
                    {b === "ml" ? "ML" : b === "spread" ? "Spread" : b === "total" ? "Total" : "Other"}
                  </th>
                )))}
              </tr>
            </thead>
            {sports.map((s) => {
              const shown = s.games.filter((g) => sport !== "all" || hasAction(g));
              if (shown.length === 0) return null;
              return (
                <tbody key={s.sport}>
                  <tr className="bg-base-900/80">
                    <td colSpan={10} className="px-2 py-1 font-sans text-[10px] font-bold uppercase tracking-wide text-slate-400">
                      {s.icon} {s.sport}
                    </td>
                  </tr>
                  {shown.map((g) => (
                    g.rows.map((r, i) => (
                      <tr key={`${g.id}-${i}`}
                        className={`border-b border-base-700/30 ${i === 1 ? "border-b-base-700/60" : "border-b-transparent"} hover:bg-base-700/20`}>
                        <td className="px-2 py-0.5">
                          <span className="text-gold">{r.rot}</span>
                          <span className="ml-2 font-sans text-slate-200">{r.team}</span>
                          {i === 0 && g.circled && (
                            <span className="ml-2 font-sans text-[9px] font-bold uppercase text-gold">◯</span>
                          )}
                          {i === 1 && (
                            <span className="ml-2 font-sans text-[9px] text-slate-600">
                              {g.league} · {new Date(g.starts_at).toLocaleString(undefined,
                                { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                            </span>
                          )}
                        </td>
                        <td className="px-2 py-0.5 text-center">
                          {i === 0 && (
                            <span className={`inline-block min-w-[2.5rem] rounded px-1.5 ${
                              g.score ? "bg-accent/15 font-bold text-accent" : "bg-base-700/60 text-slate-500"}`}>
                              {g.score ?? "—"}
                            </span>
                          )}
                        </td>
                        {(["straight", "parlay"] as const).map((k) =>
                          POS_BUCKETS.map((b) => <Cell key={`${k}-${b}`} c={r.cells[k][b]} />))}
                      </tr>
                    ))
                  ))}
                </tbody>
              );
            })}
            <tfoot>
              <tr className="border-t-2 border-base-600 bg-base-900/80 font-semibold">
                <td className="px-2 py-1.5 font-sans text-slate-300" colSpan={2}>Grand Totals</td>
                {(["straight", "parlay"] as const).map((k) =>
                  POS_BUCKETS.map((b) => <Cell key={`t-${k}-${b}`} c={d.totals[k][b]} />))}
              </tr>
            </tfoot>
          </table>
        </div>
        <p className="mt-2 text-[10px] leading-relaxed text-slate-500">
          Home side on the top row (Over/Yes/Draw included), away side below (Under/No).
          A parlay's stake and payout land on every leg it touches — any one leg can be
          the one that decides it. "All" shows only games with action; pick a sport to
          see its full board. No teaser or reverse columns because those bet types
          don't exist here.
        </p>
      </Panel>
    </div>
  );
}

// ---------------------------------------------------------------- scores ----
function ScoreboardDrawer({ onErr, onClose }: {
  onErr: (m: string) => void; onClose: () => void;
}) {
  const [rows, setRows] = useState<Awaited<ReturnType<typeof api.agentScores>> | null>(null);
  const [sport, setSport] = useState<string>("");

  useEffect(() => {
    let alive = true;
    const load = (first = false) => api.agentScores().then((r) => {
      if (!alive) return;
      setRows(r);
      if (first && r.length) {
        const lv = r.find((g) => g.status === "live");
        setSport((lv ?? r[0]).sport);
      }
    }).catch((e) => onErr(e.message));
    load(true);
    const t = setInterval(load, 8000);   // live scores tick on their own
    return () => { alive = false; clearInterval(t); };
  }, [onErr]);

  const sports = rows ? [...new Set(rows.map((g) => g.sport))] : [];
  const shown = (rows ?? []).filter((g) => g.sport === sport);

  return (
    <>
      <div className="fixed inset-0 z-30 bg-black/40" onClick={onClose} />
      <aside className="fixed inset-y-0 right-0 z-40 w-full max-w-sm overflow-y-auto border-l border-base-600 bg-base-800 shadow-2xl">
        <div className="sticky top-0 flex items-center justify-between border-b border-base-600 bg-base-800 px-4 py-3">
          <h3 className="text-sm font-bold text-slate-100">Scoreboard</h3>
          <button onClick={onClose} className="text-xs text-red-400 hover:text-red-300">
            Close ✕
          </button>
        </div>

        <div className="border-b border-base-600 bg-base-900/60 px-3 py-2">
          <select value={sport} onChange={(e) => setSport(e.target.value)}
            className="w-full rounded bg-base-700 px-2 py-1.5 text-xs outline-none">
            {sports.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        {!rows ? (
          <div className="p-6 text-center text-xs text-slate-500">loading…</div>
        ) : shown.length === 0 ? (
          <div className="p-6 text-center text-xs text-slate-500">No games.</div>
        ) : (
          <div className="grid grid-cols-2 gap-px bg-base-700/50">
            {shown.map((g, i) => {
              const live = g.status === "live";
              const final = !live && g.status !== "scheduled" && g.home_score !== null;
              const homeWon = final && (g.home_score ?? 0) > (g.away_score ?? 0);
              const awayWon = final && (g.away_score ?? 0) > (g.home_score ?? 0);
              return (
                <div key={i} className="bg-base-800 px-2.5 py-2">
                  <div className={`mb-1 text-[9px] font-semibold uppercase tracking-wide ${
                    live ? "text-red-400" : final ? "text-accent" : "text-slate-500"}`}>
                    {live ? `● Live ${g.period ?? ""}`
                      : final ? "Final"
                      : new Date(g.starts_at).toLocaleString(undefined,
                          { weekday: "short", hour: "numeric", minute: "2-digit" })}
                  </div>
                  <div className="flex items-baseline justify-between gap-2 text-[11px]">
                    <span className={`truncate font-sans ${
                      awayWon ? "font-bold text-slate-100" : "text-slate-300"}`}>
                      {g.away}
                    </span>
                    <span className={`font-mono font-bold ${
                      awayWon ? "text-accent" : "text-slate-400"}`}>
                      {live || final ? g.away_score : ""}
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between gap-2 text-[11px]">
                    <span className={`truncate font-sans ${
                      homeWon ? "font-bold text-slate-100" : "text-slate-300"}`}>
                      {g.home}
                    </span>
                    <span className={`font-mono font-bold ${
                      homeWon ? "text-accent" : "text-slate-400"}`}>
                      {live || final ? g.home_score : ""}
                    </span>
                  </div>
                  <div className="mt-0.5 truncate text-[8px] text-slate-600">{g.league}</div>
                </div>
              );
            })}
          </div>
        )}
      </aside>
    </>
  );
}

// --------------------------------------------------- transactions history ----
function TransactionsHistory({ onErr }: { onErr: (m: string) => void }) {
  const [data, setData] = useState<Awaited<ReturnType<typeof api.agentTransactions>> | null>(null);
  const [kind, setKind] = useState("player");
  const [agentQ, setAgentQ] = useState("");
  const [playerQ, setPlayerQ] = useState("");
  const monthAgo = () => {
    const d = new Date(); d.setDate(1);
    return d.toISOString().slice(0, 10);
  };
  const [from, setFrom] = useState(monthAgo());
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);

  const search = useCallback(() => {
    setBusy(true); onErr("");
    api.agentTransactions({ kind, agent_q: agentQ, player_q: playerQ,
                            date_from: from, date_to: to })
      .then(setData).catch((e) => onErr(e.message)).finally(() => setBusy(false));
  }, [kind, agentQ, playerQ, from, to, onErr]);
  useEffect(() => { search(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const inputCls = "rounded border border-base-600 bg-base-700 px-2 py-1 text-[11px] " +
    "text-slate-200 placeholder:text-slate-500";
  const lbl = "text-[10px] uppercase tracking-wide text-slate-500";

  return (
    <Panel title="Transactions History">
      <div className="mb-3 flex flex-wrap items-end gap-3 rounded-md bg-base-700/40 p-3">
        <label className="flex flex-col gap-1">
          <span className={lbl}>Agent Filter</span>
          <input value={agentQ} onChange={(e) => setAgentQ(e.target.value)}
            placeholder="Search agents…" className={inputCls} />
        </label>
        <label className="flex flex-col gap-1">
          <span className={lbl}>Player Filter</span>
          <input value={playerQ} onChange={(e) => setPlayerQ(e.target.value)}
            placeholder="Search accounts…" className={inputCls} />
        </label>
        <label className="flex flex-col gap-1">
          <span className={lbl}>Transactions Type</span>
          <select value={kind} onChange={(e) => setKind(e.target.value)} className={inputCls}>
            <option value="player">Player Transactions</option>
            <option value="wagers">Wagers &amp; Payouts</option>
            <option value="settlements">Settlements</option>
            <option value="all">All Movements</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className={lbl}>From</span>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={inputCls} />
        </label>
        <label className="flex flex-col gap-1">
          <span className={lbl}>To</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={inputCls} />
        </label>
        <button onClick={search} disabled={busy}
          className="rounded btn-gold px-3 py-1.5 text-[11px] font-bold text-base-900 hover:brightness-110 disabled:opacity-50">
          {busy ? "…" : "🔍 Search"}
        </button>
      </div>

      {!data ? <Empty msg="loading…" /> : data.rows.length === 0 ? (
        <Empty msg="No transactions match those filters." />
      ) : (
        <>
          <Table head={["Date", "Agent", "Customer", "Transaction", "Description", "Amount", "Entered By"]}>
            {data.rows.map((r) => {
              const a = signed(r.amount);
              return (
                <tr key={r.id} className="border-b border-base-700/50 last:border-0">
                  <td className="whitespace-nowrap py-1.5 text-left text-slate-400">
                    {new Date(r.at).toLocaleString(undefined,
                      { month: "long", day: "numeric", year: "numeric",
                        hour: "numeric", minute: "2-digit" })}
                  </td>
                  <td className="pl-3 text-left font-sans text-slate-300">{r.agent}</td>
                  <td className="pl-3 text-left font-sans text-slate-200">{r.account}</td>
                  <td className="pl-3 text-left font-sans text-slate-300">{r.kind}</td>
                  <td className="pl-3 text-left font-sans text-slate-400">{r.description}</td>
                  <td className={`text-right font-semibold ${a.cls}`}>{a.text}</td>
                  <td className="pl-3 text-right font-sans text-slate-500">{r.entered_by}</td>
                </tr>
              );
            })}
            <tr className="bg-base-700/60">
              <td className="py-1.5" />
              <td /><td />
              <td className="pl-3 text-left font-bold text-slate-200">Total</td>
              <td />
              <td className={`text-right font-bold ${signed(data.total).cls}`}>
                {signed(data.total).text}
              </td>
              <td />
            </tr>
          </Table>
          <p className="mt-3 text-[10px] leading-relaxed text-slate-500">
            Player Transactions are the deposits and withdrawals keyed in against customer
            accounts. Switch the type to see wager money movement, weekly settlements, or
            the whole raw ledger feed.
          </p>
        </>
      )}
    </Panel>
  );
}

// -------------------------------------------------------------- game admin ----
type BoardGame = Awaited<ReturnType<typeof api.agentGames>>["games"][number];

function GameAdmin({ onErr, onDone }: { onErr: (m: string) => void; onDone: () => void }) {
  const [games, setGames] = useState<BoardGame[] | null>(null);
  const [circledMax, setCircledMax] = useState("50");
  const [sched, setSched] = useState<"upcoming" | "today" | "final" | "all">("upcoming");
  const [sport, setSport] = useState("all");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<number | null>(null);
  const [msg, setMsg] = useState("");

  const load = useCallback(() => {
    api.agentGames().then((r) => { setGames(r.games); setCircledMax(r.circled_max); })
      .catch((e) => onErr(e.message));
  }, [onErr]);
  useEffect(load, [load]);
  const anyLive = (games ?? []).some((g) => g.status === "live");
  useEffect(() => {
    if (!anyLive) return;
    const t = setInterval(load, 8000);   // live scores tick on the board
    return () => clearInterval(t);
  }, [anyLive, load]);

  async function act(id: number, fn: () => Promise<unknown>, done?: string) {
    setBusy(id); onErr("");
    try { await fn(); if (done) setMsg(done); load(); onDone(); }
    catch (e: any) { onErr(e.message); } finally { setBusy(null); }
  }
  async function refreshFeed() {
    setBusy(-1); onErr("");
    try {
      const r = await api.sbSync();
      setMsg(`Feed refreshed — ${r.events} events.`); load();
    } catch (e: any) { onErr(e.message); } finally { setBusy(null); }
  }
  async function gradeAll() {
    setBusy(-2); onErr("");
    try {
      const r = await api.sbSimulate(10);
      setMsg(`Graded ${r.graded} game(s) · settled ${r.settlement.settled} wager(s).`);
      load(); onDone();
    } catch (e: any) { onErr(e.message); } finally { setBusy(null); }
  }
  async function moveLines() {
    setBusy(-3); onErr("");
    try {
      const r = await api.sbDrift();
      setMsg(`Market moved — ${r.prices_moved} price(s), ${r.lines_moved} line(s).`);
      load();
    } catch (e: any) { onErr(e.message); } finally { setBusy(null); }
  }

  if (!games) return <Panel title="Game Admin"><Empty msg="loading…" /></Panel>;

  const sports = [...new Set(games.map((g) => g.sport))];
  const today = new Date().toDateString();
  const shown = games.filter((g) =>
    (sport === "all" || g.sport === sport) &&
    (q === "" || `${g.home} ${g.away}`.toLowerCase().includes(q.toLowerCase())) &&
    (sched === "all" ? true
      : sched === "today" ? new Date(g.starts_at).toDateString() === today
      : sched === "final" ? (g.status !== "scheduled" && g.status !== "live")
      : g.status === "scheduled" || g.status === "live"));

  // group by sport, then by start time
  const bySport = new Map<string, BoardGame[]>();
  for (const g of shown) {
    if (!bySport.has(g.sport)) bySport.set(g.sport, []);
    bySport.get(g.sport)!.push(g);
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-end gap-2 rounded-lg border border-white/5 bg-base-800 shadow-card p-3 text-xs">
        <div>
          <div className="mb-1 text-[9px] uppercase tracking-wide text-slate-500">Schedule</div>
          <select value={sched} onChange={(e) => setSched(e.target.value as any)}
            className="rounded bg-base-700 px-2 py-1.5 outline-none">
            <option value="upcoming">On The Board</option>
            <option value="today">Today</option>
            <option value="final">Finals</option>
            <option value="all">All</option>
          </select>
        </div>
        <div>
          <div className="mb-1 text-[9px] uppercase tracking-wide text-slate-500">Sport</div>
          <select value={sport} onChange={(e) => setSport(e.target.value)}
            className="rounded bg-base-700 px-2 py-1.5 outline-none">
            <option value="all">All Sports</option>
            {sports.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <div className="mb-1 text-[9px] uppercase tracking-wide text-slate-500">Teams</div>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="search…"
            className="w-36 rounded bg-base-700 px-2 py-1.5 outline-none" />
        </div>
        <div className="ml-auto flex gap-2">
          <button onClick={refreshFeed} disabled={busy !== null}
            className="rounded btn-gold px-3 py-1.5 font-bold text-base-900 disabled:opacity-40">
            Refresh feed
          </button>
          <button onClick={moveLines} disabled={busy !== null}
            className="rounded bg-base-700 px-3 py-1.5 font-semibold hover:bg-base-600 disabled:opacity-40">
            Move lines
          </button>
          <button onClick={gradeAll} disabled={busy !== null}
            className="rounded bg-base-700 px-3 py-1.5 font-semibold hover:bg-base-600 disabled:opacity-40">
            Grade &amp; settle all
          </button>
        </div>
      </div>

      {msg && <div className="rounded bg-base-900 px-3 py-2 text-xs text-slate-300">{msg}</div>}

      {shown.length === 0 ? (
        <Panel title="Game Admin"><Empty msg="No games match — try Refresh feed." /></Panel>
      ) : (
        [...bySport.entries()].map(([sp, list]) => (
          <Panel key={sp} title={`${list[0].icon} ${sp}`} right={
            <span className="text-[10px] text-slate-500">{list.length} game(s)</span>
          }>
            <div className="space-y-1.5">
              {list.map((g) => {
                const kick = new Date(g.starts_at);
                const isLive = g.status === "live";
                const rowTone = isLive ? "bg-red-500/5 ring-1 ring-red-500/40"
                  : g.off_board ? "bg-red-500/10 ring-1 ring-red-500/20"
                  : g.circled ? "bg-gold/5 ring-1 ring-gold/20" : "bg-base-900";
                return (
                  <div key={g.id} className={`rounded-lg p-2.5 ${rowTone}`}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0 font-mono text-xs">
                        <div>
                          <span className="text-gold">{g.home_rot}</span>
                          <span className="ml-2 font-sans text-slate-200">{g.home}</span>
                        </div>
                        <div>
                          <span className="text-gold">{g.away_rot}</span>
                          <span className="ml-2 font-sans text-slate-200">{g.away}</span>
                        </div>
                        <div className="mt-0.5 font-sans text-[10px] text-slate-500">
                          {g.competition} · {kick.toLocaleString(undefined,
                            { weekday: "short", month: "short", day: "numeric",
                              hour: "numeric", minute: "2-digit" })}
                          {g.pending_wagers > 0 &&
                            <span className="ml-2 text-gold">{g.pending_wagers} open wager(s)</span>}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {isLive && (
                          <span className="rounded bg-red-500/20 px-2 py-1 font-sans text-[10px] font-bold uppercase text-red-300">
                            ● Live {g.period ?? ""}
                          </span>
                        )}
                        {g.score ? (
                          <span className={`rounded px-2.5 py-1 font-mono text-sm font-bold ${
                            isLive ? "bg-red-500/15 text-red-200" : "bg-accent/15 text-accent"}`}>
                            {g.score}
                          </span>
                        ) : (
                          <span className={`rounded px-2 py-1 font-sans text-[10px] font-bold uppercase ${
                            g.off_board ? "bg-red-500/20 text-red-300"
                              : g.circled ? "bg-gold/20 text-gold" : "bg-base-700 text-slate-400"}`}>
                            {g.off_board ? "Off Board" : g.circled ? `Circled ≤${circledMax}` : "Open"}
                          </span>
                        )}

                        {g.status === "scheduled" && (
                          <div className="flex gap-1 font-sans">
                            <button disabled={busy === g.id}
                              onClick={() => act(g.id, () => api.agentSetCircle(g.id, !g.circled))}
                              className={`rounded border px-2 py-1 text-[10px] disabled:opacity-40 ${
                                g.circled
                                  ? "border-gold/60 bg-gold/15 text-gold hover:bg-gold/25"
                                  : "border-base-600 text-slate-300 hover:bg-base-700"}`}>
                              {g.circled ? "Uncircle" : "Circle"}
                            </button>
                            <button disabled={busy === g.id}
                              onClick={() => act(g.id, () => api.agentSetBoard(g.id, g.off_board))}
                              className={`rounded border px-2 py-1 text-[10px] disabled:opacity-40 ${
                                g.off_board
                                  ? "border-accent/60 text-accent hover:bg-accent/10"
                                  : "border-red-500/60 text-red-300 hover:bg-red-500/10"}`}>
                              {g.off_board ? "On Board" : "Off Board"}
                            </button>
                            <button disabled={busy === g.id}
                              onClick={() => act(g.id, () => api.agentGradeGame(g.id))}
                              className="rounded border border-base-600 px-2 py-1 text-[10px] text-slate-300 hover:bg-base-700 disabled:opacity-40">
                              Grade
                            </button>
                            <button disabled={busy === g.id}
                              onClick={() => act(g.id, () => api.sbLiveStart(1, [g.id]),
                                `${g.home} v ${g.away} is live.`)}
                              className="rounded border border-red-500/60 px-2 py-1 text-[10px] font-bold text-red-300 hover:bg-red-500/10 disabled:opacity-40">
                              Go Live
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </Panel>
        ))
      )}

      <p className="px-1 text-[10px] leading-relaxed text-slate-500">
        Circle caps every wager on that game at {circledMax}. Off Board suspends all its
        markets — new wagers are refused instantly; tickets already written stand and
        grade normally. Grade ends the game with its result and settles finished wagers.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------- billing ----
function Billing({ onErr }: { onErr: (m: string) => void }) {
  const [data, setData] = useState<Awaited<ReturnType<typeof api.agentBilling>> | null>(null);
  const [days, setDays] = useState(30);
  useEffect(() => {
    setData(null);
    api.agentBilling(days).then(setData).catch((e) => onErr(e.message));
  }, [onErr, days]);
  if (!data) return <Panel title="Billing"><Empty msg="loading…" /></Panel>;

  const cur = Number(data.current_balance);
  const fmtTime = (iso: string) => {
    if (!iso) return "—";
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: "2-digit", day: "2-digit", year: "2-digit" }) +
      " " + d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  };

  return (
    <Panel title="Billing" right={
      <select value={days} onChange={(e) => setDays(Number(e.target.value))}
        className="rounded border border-base-600 bg-base-700 px-2 py-1 text-[11px] text-slate-200">
        <option value={7}>7 Days</option>
        <option value={30}>30 Days</option>
        <option value={90}>90 Days</option>
        <option value={0}>All</option>
      </select>
    }>
      <div className="mb-3 flex items-baseline gap-2 rounded-md bg-base-700/60 px-3 py-2">
        <span className="text-[11px] uppercase tracking-wide text-slate-400">Current Balance:</span>
        <span className={`font-mono text-lg font-bold ${cur < 0 ? "text-red-400" : "text-accent"}`}>
          {money(data.current_balance)}
        </span>
      </div>

      {data.rows.length === 0 ? (
        <Empty msg="No activity in this window." />
      ) : (
        <Table head={["Time", "Description", "Transaction", "Balance"]}>
          {data.rows.map((r, i) => {
            const amt = Number(r.amount);
            const bal = Number(r.balance);
            const isFwd = r.description === "Balance forward";
            return (
              <tr key={i} className="border-b border-base-700/50 last:border-0">
                <td className="whitespace-nowrap py-1.5 text-left text-slate-400">{fmtTime(r.at)}</td>
                <td className={`pl-3 text-left font-sans ${isFwd ? "italic text-slate-500" : "text-slate-200"}`}>
                  {r.description}
                </td>
                <td className={`text-right font-semibold ${
                  isFwd ? "text-slate-600" : amt < 0 ? "text-red-400" : amt > 0 ? "text-accent" : "text-slate-500"}`}>
                  {isFwd ? "—" : (amt > 0 ? "+" : "") + money(r.amount)}
                </td>
                <td className={`text-right font-semibold ${bal < 0 ? "text-red-400" : "text-slate-200"}`}>
                  {money(r.balance)}
                </td>
              </tr>
            );
          })}
        </Table>
      )}
      <p className="mt-3 text-[10px] leading-relaxed text-slate-500">{data.note}</p>
    </Panel>
  );
}

// -------------------------------------------------------------- bet ticker ----
function BetTicker({ onErr }: { onErr: (m: string) => void }) {
  const [rows, setRows] = useState<AgentWager[] | null>(null);
  const [paused, setPaused] = useState(false);
  const [minRisk, setMinRisk] = useState("");
  const [vipOnly, setVipOnly] = useState(false);
  const [showVipList, setShowVipList] = useState(false);
  const [customers, setCustomers] = useState<Customer[] | null>(null);
  const [vip, setVip] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem("lucky777_vip") ?? "[]")); }
    catch { return new Set(); }
  });
  const [seenNewest, setSeenNewest] = useState(0);

  useEffect(() => {
    let alive = true;
    const load = () => api.agentWagers("all")
      .then((r) => { if (alive) setRows(r); })
      .catch((e) => onErr(e.message));
    load();
    const t = setInterval(() => { if (!paused) load(); }, 4000);
    return () => { alive = false; clearInterval(t); };
  }, [onErr, paused]);

  useEffect(() => {
    if (showVipList && !customers)
      api.agentCustomers().then(setCustomers).catch((e) => onErr(e.message));
  }, [showVipList, customers, onErr]);

  const toggleVip = (account: string) => {
    setVip((prev) => {
      const next = new Set(prev);
      if (next.has(account)) next.delete(account); else next.add(account);
      localStorage.setItem("lucky777_vip", JSON.stringify([...next]));
      return next;
    });
  };

  if (!rows) return <Panel title="Bet Ticker"><Empty msg="loading…" /></Panel>;

  const sorted = [...rows].sort((a, b) => b.bet_id - a.bet_id);
  const newest = sorted[0]?.bet_id ?? 0;
  const shown = sorted.filter((w) => {
    if (minRisk && Number(w.risk) < Number(minRisk)) return false;
    if (vipOnly && !vip.has(w.account)) return false;
    return true;
  });

  const describe = (w: AgentWager) => {
    if (w.legs.length === 1) {
      const l = w.legs[0];
      return `${l.event} — ${l.selection} · ${l.market} ${amer(l.odds)} — For Game`;
    }
    return `${w.type} (${w.legs.length} legs): ` +
      w.legs.map((l) => `${l.selection} ${amer(l.odds)}`).join(" / ");
  };

  return (
    <Panel title="Bet Ticker" right={
      <button onClick={() => setPaused(!paused)}
        className="rounded bg-base-700 px-2 py-1 text-[10px] hover:bg-base-600">
        {paused ? "▶ resume" : "⏸ pause"} · refreshes every 4s
      </button>
    }>
      <div className="mb-3 flex flex-wrap items-end gap-3 rounded-md bg-base-700/40 p-3">
        <label className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wide text-slate-500">Show Bets Over</span>
          <input value={minRisk} onChange={(e) => setMinRisk(e.target.value.replace(/[^0-9.]/g, ""))}
            placeholder="any amount" inputMode="decimal"
            className="w-28 rounded border border-base-600 bg-base-700 px-2 py-1 text-[11px] text-slate-200 placeholder:text-slate-500" />
        </label>
        <label className="flex flex-col items-start gap-1">
          <span className="text-[10px] uppercase tracking-wide text-slate-500">Vip Only</span>
          <input type="checkbox" checked={vipOnly} onChange={(e) => setVipOnly(e.target.checked)}
            className="h-4 w-4 accent-gold" />
        </label>
        <div className="ml-auto flex gap-2">
          <button onClick={() => { setMinRisk(""); setVipOnly(false); }}
            className="rounded bg-red-700/80 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-red-600">
            Clear
          </button>
          <button onClick={() => setShowVipList(!showVipList)}
            className="rounded bg-base-900 px-3 py-1.5 text-[11px] font-bold text-slate-200 ring-1 ring-base-600 hover:bg-base-700">
            Vip List {vip.size > 0 ? `(${vip.size})` : ""}
          </button>
        </div>
      </div>

      {showVipList && (
        <div className="mb-3 rounded-md border border-base-600 bg-base-900 p-3">
          <p className="mb-2 text-[10px] uppercase tracking-wide text-slate-500">
            Vip watch list — tick the customers whose action you want to isolate
          </p>
          {!customers ? <span className="text-xs text-slate-500">loading…</span> : (
            <div className="grid grid-cols-2 gap-1 sm:grid-cols-3 md:grid-cols-4">
              {customers.map((c) => (
                <label key={c.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-xs hover:bg-base-800">
                  <input type="checkbox" checked={vip.has(c.account)}
                    onChange={() => toggleVip(c.account)} className="h-3.5 w-3.5 accent-gold" />
                  <span className="font-mono text-slate-300">{c.account}</span>
                  <span className="truncate font-sans text-slate-500">{c.username}</span>
                </label>
              ))}
            </div>
          )}
        </div>
      )}

      {shown.length === 0 ? (
        <Empty msg={rows.length === 0 ? "No action yet." : "Nothing matches the filters."} />
      ) : (
        <div className="max-h-[520px] overflow-y-auto">
          <Table head={["Customer", "Type", "Agent", "Description", "Risk", "Win", "Source", "Time"]}>
            {shown.map((w) => (
              <tr key={w.bet_id}
                className={`border-b border-base-700/50 last:border-0 ${
                  w.bet_id === newest && newest > seenNewest ? "bg-gold/10" : ""}`}
                onMouseEnter={() => { if (w.bet_id === newest) setSeenNewest(newest); }}>
                <td className="py-1.5 text-left font-mono text-slate-200">
                  {w.account}
                  {vip.has(w.account) && <span className="ml-1 text-gold">★</span>}
                </td>
                <td className="pl-3 text-left font-sans capitalize text-slate-300">{w.type}</td>
                <td className="pl-3 text-left font-sans text-slate-400">{w.agent}</td>
                <td className="max-w-[340px] truncate pl-3 text-left font-sans text-slate-300"
                  title={describe(w)}>
                  {describe(w)}
                </td>
                <td className="text-right font-semibold text-slate-200">{money(w.risk)}</td>
                <td className="text-right font-semibold text-accent">{money(w.to_win)}</td>
                <td className="pl-3 text-right font-sans text-slate-500">Internet</td>
                <td className="whitespace-nowrap pl-3 text-right text-slate-500">
                  {new Date(w.placed_at).toLocaleString(undefined,
                    { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                </td>
              </tr>
            ))}
          </Table>
        </div>
      )}
      <p className="mt-3 text-[10px] leading-relaxed text-slate-500">
        Live feed of every ticket as it is written, newest first. Show Bets Over hides the
        small stuff; the Vip list isolates the customers you watch closely. The list
        refreshes itself every few seconds.
      </p>
    </Panel>
  );
}

// ------------------------------------------------------------------ limits ----
function Toggle({ on, onChange, disabled }: {
  on: boolean; onChange: (v: boolean) => void; disabled?: boolean;
}) {
  return (
    <button type="button" disabled={disabled} onClick={() => onChange(!on)}
      className={`relative h-5 w-9 rounded-full transition-colors disabled:opacity-40 ${
        on ? "bg-accent/80" : "bg-base-600"}`}>
      <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${
        on ? "left-[18px]" : "left-0.5"}`} />
    </button>
  );
}

function WageringLimits({ onErr, isMaster }: {
  onErr: (m: string) => void; isMaster: boolean;
}) {
  const [lim, setLim] = useState<BookLimitsShape | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  const trim = (l: BookLimitsShape): BookLimitsShape => {
    const out = { ...l };
    (["min_straight", "max_straight", "max_per_offering", "max_per_event",
      "max_win_single", "max_win_event", "min_parlay", "max_parlay",
      "max_win_parlay"] as const).forEach((k) => { out[k] = String(Number(l[k])); });
    return out;
  };

  useEffect(() => {
    api.agentBookLimits().then((l) => setLim(trim(l))).catch((e) => onErr(e.message));
  }, [onErr]);

  if (!lim) return <Panel title="Wagering Limits"><Empty msg="loading…" /></Panel>;

  const set = (k: keyof BookLimitsShape, v: string | number | boolean) =>
    setLim((p) => (p ? { ...p, [k]: v } : p));

  async function save() {
    if (!lim) return;
    setBusy(true); onErr(""); setSaved(false);
    try {
      setLim(trim(await api.agentUpdateBookLimits(lim)));
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e: any) { onErr(e.message); } finally { setBusy(false); }
  }

  const num = (k: keyof BookLimitsShape, label: string, intField = false) => (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-wide text-slate-500">{label}</span>
      <input value={String(lim[k])} disabled={!isMaster}
        onChange={(e) => {
          const raw = e.target.value.replace(intField ? /[^0-9-]/g : /[^0-9.]/g, "");
          set(k, intField ? (Number(raw) || 0) : raw);
        }}
        className="rounded border border-base-600 bg-base-700 px-2 py-1.5 font-mono text-xs text-slate-200 outline-none focus:border-gold disabled:opacity-60" />
    </label>
  );
  const flag = (k: keyof BookLimitsShape, label: string) => (
    <div className="flex items-center justify-between gap-3">
      <span className="font-sans text-xs text-slate-300">{label}</span>
      <Toggle on={Boolean(lim[k])} disabled={!isMaster} onChange={(v) => set(k, v)} />
    </div>
  );

  return (
    <Panel title="Wagering Limits" right={isMaster ? (
      <button onClick={save} disabled={busy}
        className="rounded bg-accent px-3 py-1.5 text-[11px] font-bold text-base-900 hover:brightness-110 disabled:opacity-50">
        {busy ? "…" : saved ? "✓ Saved" : "Save"}
      </button>
    ) : <span className="text-[10px] text-slate-500">read-only — master sets these</span>}>
      <div className="mb-3 rounded-md border border-red-800/60 bg-red-950/40 px-3 py-2 text-[11px] leading-relaxed text-red-300">
        These settings apply to everyone on the book unless a player has been assigned
        limits of their own. A player's wager limit applies when it is LESS THAN the Max
        Straight Bet set below — set Max Straight Bet to 500 and a player with a 100
        limit still maxes out at 100.
      </div>
      <div className="grid gap-x-6 gap-y-3 md:grid-cols-3">
        <div className="space-y-3">
          {num("min_straight", "Min Straight Bet")}
          {num("max_straight", "Max Straight Bet")}
          {num("max_per_offering", "Max Per Offering")}
          {num("max_per_event", "Max Bet Per Event")}
          {num("max_win_single", "Max Win for Single Bet")}
          {num("max_win_event", "Max Win for Event")}
          {num("delay_sec", "Delay (sec)", true)}
        </div>
        <div className="space-y-3">
          {num("max_fav_line", "Max Favorite Line", true)}
          {num("max_dog_line", "Max Dog Line", true)}
          {num("min_parlay", "Min Parlay Bet")}
          {num("max_parlay", "Max Parlay Bet")}
          {num("max_win_parlay", "Max Win for Event (parlay only)")}
          {num("max_dog_line_parlay", "Max Dog Line (Parlays)", true)}
          {num("cooloff_sec", "Wager Cool-Off (sec)", true)}
        </div>
        <div className="space-y-3 rounded-md bg-base-700/40 p-3">
          {flag("live_parlays", "Live Parlays")}
          {flag("block_prior_start", "Block Wagering Prior To Start")}
          {flag("block_halftime", "Block Wagering at Halftime")}
          {flag("include_graded", "Include Graded Wagers in Limits")}
          {flag("use_risk", "Use Risk (not Volume) for Limits")}
          <p className="pt-1 text-[10px] leading-relaxed text-slate-500">
            Stake bounds, line caps, win caps, per-offering and per-event position
            caps, the cool-off, Block Prior To Start (makes the book live-only),
            Block at Halftime, and Live Parlays are all enforced on every ticket.
            Delay applies when a real live feed with an accept-delay is wired in.
          </p>
        </div>
      </div>
    </Panel>
  );
}

function Limits({ onErr, isMaster }: { onErr: (m: string) => void; isMaster: boolean }) {
  const [rows, setRows] = useState<Customer[] | null>(null);
  const [busy, setBusy] = useState<number | null>(null);

  const load = useCallback(() => {
    api.agentCustomers().then(setRows).catch((e) => onErr(e.message));
  }, [onErr]);
  useEffect(load, [load]);

  async function editWager(c: Customer) {
    const v = prompt(`Max stake per wager for ${c.username} (blank = house default)`,
                     c.wager_limit ?? "");
    if (v === null) return;
    setBusy(c.id);
    try { await api.agentUpdateCustomer(c.id, { wager_limit: v }); onErr(""); load(); }
    catch (e: any) { onErr(e.message); } finally { setBusy(null); }
  }
  async function editCredit(c: Customer) {
    const v = prompt(`Credit limit for ${c.username} (how deep on credit)`, c.credit_limit);
    if (v === null || v === "") return;
    setBusy(c.id);
    try { await api.agentUpdateCustomer(c.id, { credit_limit: v }); onErr(""); load(); }
    catch (e: any) { onErr(e.message); } finally { setBusy(null); }
  }

  const book = <WageringLimits onErr={onErr} isMaster={isMaster} />;
  if (!rows) return <div className="space-y-4">{book}
    <Panel title="Player Limits"><Empty msg="loading…" /></Panel></div>;
  if (rows.length === 0) return <div className="space-y-4">{book}
    <Panel title="Player Limits"><Empty msg="No customers yet." /></Panel></div>;

  return (
    <div className="space-y-4">
    {book}
    <Panel title="Player Limits" right={
      <span className="text-[10px] text-slate-500">applies per single wager</span>
    }>
      <Table head={["Customer", "Status", "Balance", "Credit limit", "Wager limit", ""]}>
        {rows.map((c) => (
          <tr key={c.id} className="border-b border-base-700/50 last:border-0">
            <td className="py-2 text-left font-sans text-slate-200">{c.username}</td>
            <td className={`text-right text-[10px] font-semibold ${
              c.active ? "text-accent" : "text-red-400"}`}>
              {c.active ? "ACTIVE" : "SUSPENDED"}
            </td>
            <td className="text-right text-slate-300">{money(c.balance)}</td>
            <td className="text-right font-semibold text-gold">{money(c.credit_limit)}</td>
            <td className="text-right font-semibold text-gold">
              {c.wager_limit ? money(c.wager_limit) : "house default"}
            </td>
            <td className="pl-3 text-right font-sans">
              <div className="flex justify-end gap-1">
                <Mini disabled={busy === c.id} onClick={() => editCredit(c)}>credit</Mini>
                <Mini disabled={busy === c.id} onClick={() => editWager(c)}>wager</Mini>
              </div>
            </td>
          </tr>
        ))}
      </Table>
      <p className="mt-3 text-[10px] leading-relaxed text-slate-500">
        A customer's limit caps every single wager they place, in the sportsbook and in
        Duel. Blank falls back to the house default. Tighter of the two always wins.
      </p>
    </Panel>
    </div>
  );
}

// ---------------------------------------------------------------- analysis ----
function ClosingLine({ onErr }: { onErr: (m: string) => void }) {
  const [d, setD] = useState<Awaited<ReturnType<typeof api.agentClosingLine>> | null>(null);
  const [detail, setDetail] = useState<Awaited<ReturnType<typeof api.agentClosingDetail>> | null>(null);
  const [detailFor, setDetailFor] = useState<number | null>(null);

  useEffect(() => {
    api.agentClosingLine().then(setD).catch((e) => onErr(e.message));
  }, [onErr]);

  useEffect(() => {
    if (detailFor === null) { setDetail(null); return; }
    setDetail(null);
    api.agentClosingDetail(detailFor).then(setDetail).catch((e) => onErr(e.message));
  }, [detailFor, onErr]);

  if (!d) return <Panel title="Closing Line Analysis"><Empty msg="loading…" /></Panel>;

  function exportCsv() {
    if (!d) return;
    const lines = [["Customer", "Name", "Points", "Price", "Beat Line", "Total Bets",
                    "Percentage", "Win/Loss"].join(",")];
    for (const c of d.customers) {
      lines.push([c.account, c.username, c.points ?? "", c.price, c.beat_line,
                  c.total_bets, `${c.percentage}%`, c.win_loss].join(","));
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "closing-line-analysis.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const num = (v: number, digits = 2) => {
    const cls = v > 0 ? "text-accent" : v < 0 ? "text-red-400" : "text-slate-500";
    return <span className={cls}>{v.toFixed(digits)}</span>;
  };

  return (
    <Panel title="Closing Line Analysis" right={
      <button onClick={exportCsv}
        className="rounded bg-base-700 px-2 py-1 text-[10px] text-accent hover:bg-base-600">
        📊 CSV
      </button>
    }>
      <p className="mb-3 text-[10px] text-slate-500">
        Based on last {d.days} days activity. Customers who consistently get a better
        number than the closing line are reading the market faster than the book —
        that pattern, not win/loss, is what marks sharp action. Flagged rows have 5+
        legs beating the close 60% of the time.
      </p>
      {d.customers.length === 0 ? <Empty msg="No action in the window yet." /> : (
        <Table head={["Customer", "Points", "Price", "Beat Line", "Total Bets",
                      "Percentage", "Win/Loss", "Full Analysis"]}>
          {d.customers.map((c) => {
            const wl = signed(c.win_loss);
            return (
              <Fragment key={c.id}>
                <tr className="border-b border-base-700/50 last:border-0">
                  <td className="py-1.5 text-left">
                    <span className={`rounded px-1.5 py-0.5 font-mono ${
                      c.flagged ? "bg-red-700 font-bold text-white" : "text-slate-300"}`}>
                      {c.account}
                    </span>
                    <span className="ml-1.5 font-sans text-[10px] text-slate-500">{c.username}</span>
                  </td>
                  <td className="text-right">
                    {c.points === null ? <span className="text-slate-600">—</span>
                      : num(Number(c.points))}
                  </td>
                  <td className="text-right">{num(c.price)}</td>
                  <td className="text-right text-slate-300">{c.beat_line}</td>
                  <td className="text-right text-slate-300">{c.total_bets}</td>
                  <td className={`text-right font-semibold ${
                    c.percentage >= 60 ? "text-red-400" : "text-slate-300"}`}>
                    {c.percentage.toFixed(2)}%
                  </td>
                  <td className={`text-right font-semibold ${wl.cls}`}>{wl.text}</td>
                  <td className="pl-3 text-right">
                    <button onClick={() => setDetailFor(detailFor === c.id ? null : c.id)}
                      className="font-sans text-[10px] font-semibold text-gold underline-offset-2 hover:underline">
                      {detailFor === c.id ? "Hide" : "View"}
                    </button>
                  </td>
                </tr>
                {detailFor === c.id && (
                  <tr className="border-b border-base-700/40 bg-base-900/70">
                    <td colSpan={8} className="px-3 py-2">
                      {!detail ? <span className="text-xs text-slate-500">loading…</span> : (
                        <div className="max-h-56 overflow-y-auto">
                          <table className="w-full text-[10px]">
                            <thead>
                              <tr className="text-left text-[9px] uppercase tracking-wide text-slate-500">
                                <th className="py-1">Placed</th><th>Event</th><th>Selection</th>
                                <th className="text-right">Struck</th>
                                <th className="text-right">Close</th>
                                <th className="text-right">Points</th>
                                <th className="text-right">Cents</th>
                                <th className="text-right">Beat?</th>
                              </tr>
                            </thead>
                            <tbody className="font-mono">
                              {detail.legs.map((l, i) => (
                                <tr key={i} className="border-t border-base-700/40">
                                  <td className="py-1 text-slate-500">
                                    {new Date(l.placed_at).toLocaleDateString(undefined,
                                      { month: "short", day: "numeric" })}
                                  </td>
                                  <td className="font-sans text-slate-300">{l.event}</td>
                                  <td className="font-sans text-slate-400">
                                    {l.selection} · {l.market}
                                    {l.placed_line ? ` (${l.placed_line})` : ""}
                                  </td>
                                  <td className="text-right text-slate-200">{amer(l.placed_odds)}</td>
                                  <td className="text-right text-slate-400">
                                    {amer(l.closing_odds)}
                                    {l.closing_line && l.closing_line !== l.placed_line
                                      ? ` (${l.closing_line})` : ""}
                                  </td>
                                  <td className="text-right">
                                    {l.points === null ? "—" : num(Number(l.points))}
                                  </td>
                                  <td className="text-right">{num(l.cents, 0)}</td>
                                  <td className={`text-right font-bold ${
                                    l.beat ? "text-accent" : "text-slate-600"}`}>
                                    {l.beat ? "✓" : "·"}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </Table>
      )}
    </Panel>
  );
}

function Analysis({ onErr }: { onErr: (m: string) => void }) {
  const [d, setD] = useState<Awaited<ReturnType<typeof api.agentAnalysis>> | null>(null);
  useEffect(() => { api.agentAnalysis().then(setD).catch((e) => onErr(e.message)); }, [onErr]);
  if (!d) return <div className="space-y-4"><ClosingLine onErr={onErr} />
    <Panel title="Handle by Sport"><Empty msg="loading…" /></Panel></div>;
  if (d.sports.length === 0) return <div className="space-y-4"><ClosingLine onErr={onErr} />
    <Panel title="Handle by Sport"><Empty msg="No action to analyse yet." /></Panel></div>;

  const maxStake = Math.max(...d.sports.map((s) => Number(s.staked)), 1);
  return (
    <div className="space-y-4">
    <ClosingLine onErr={onErr} />
    <Panel title="Handle by Sport">
      <div className="space-y-2">
        {d.sports.map((s) => {
          const r = signed(s.book_result);
          return (
            <div key={s.sport}>
              <div className="mb-0.5 flex items-baseline justify-between text-xs">
                <span className="font-sans text-slate-200">{s.icon} {s.sport}
                  <span className="ml-2 text-slate-500">
                    {s.wagers} wager(s){s.open > 0 ? ` · ${s.open} open` : ""}
                  </span>
                </span>
                <span className="font-mono">
                  <span className="text-slate-400">staked </span>
                  <span className="text-slate-200">{money(s.staked)}</span>
                  <span className={`ml-3 font-semibold ${r.cls}`}>{r.text}</span>
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded bg-base-900">
                <div className="h-full rounded bg-gold/70"
                  style={{ width: `${(Number(s.staked) / maxStake) * 100}%` }} />
              </div>
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-[10px] leading-relaxed text-slate-500">
        Book result is stake kept minus payouts, per sport, open wagers excluded from the
        result until they grade. {d.note}
      </p>
    </Panel>
    </div>
  );
}


// ------------------------------------------------------------ agent admin ----
function AgentAdmin({ onErr }: { onErr: (m: string) => void }) {
  const [rows, setRows] = useState<Awaited<ReturnType<typeof api.agentListAgents>> | null>(null);
  const [busy, setBusy] = useState<number | null>(null);

  const load = useCallback(() => {
    api.agentListAgents().then(setRows).catch((e) => onErr(e.message));
  }, [onErr]);
  useEffect(load, [load]);

  async function toggle(a: { id: number; active: boolean }) {
    setBusy(a.id);
    try { await api.agentUpdateAgent(a.id, { active: !a.active }); load(); }
    catch (e: any) { onErr(e.message); } finally { setBusy(null); }
  }
  async function resetPw(a: { id: number; username: string }) {
    const v = prompt(`New password for agent ${a.username} (min 6 chars)`);
    if (!v) return;
    setBusy(a.id);
    try { await api.agentUpdateAgent(a.id, { new_password: v }); onErr(""); load(); }
    catch (e: any) { onErr(e.message); } finally { setBusy(null); }
  }

  if (!rows) return <Panel title="Agent Admin"><Empty msg="loading…" /></Panel>;
  if (rows.length === 0) {
    return <Panel title="Agent Admin">
      <Empty msg="No sub-agents yet — use Add Agent to book one." />
    </Panel>;
  }
  return (
    <Panel title="Agent Admin" right={
      <span className="text-[10px] text-slate-500">{rows.length} sub-agent(s)</span>
    }>
      <Table head={["Agent", "Customers", "Week wagers", "Week volume", "Week figure", "Status", "Actions"]}>
        {rows.map((a) => {
          const f = signed(a.week_figure);
          return (
            <tr key={a.id} className="border-b border-base-700/50 last:border-0">
              <td className="py-2 text-left font-sans text-slate-200">{a.username}</td>
              <td className="text-right text-slate-300">{a.customers}</td>
              <td className="text-right text-slate-400">{a.week_wagers}</td>
              <td className="text-right text-slate-300">{money(a.week_volume)}</td>
              <td className={`text-right font-semibold ${f.cls}`}>{f.text}</td>
              <td className={`text-right text-[10px] font-semibold ${
                a.active ? "text-accent" : "text-red-400"}`}>
                {a.active ? "ACTIVE" : "SUSPENDED"}
              </td>
              <td className="pl-3 text-right">
                <div className="flex justify-end gap-1 font-sans">
                  <Mini disabled={busy === a.id} onClick={() => toggle(a)}>
                    {a.active ? "suspend" : "activate"}
                  </Mini>
                  <Mini disabled={busy === a.id} onClick={() => resetPw(a)}>password</Mini>
                </div>
              </td>
            </tr>
          );
        })}
      </Table>
      <p className="mt-3 text-[10px] leading-relaxed text-slate-500">
        Week figure is the agent's side of their sheet — positive means their customers are
        down and the sheet owes the book. Suspending an agent takes their pen away without
        touching their customers; you can still settle their sheet.
      </p>
    </Panel>
  );
}

// -------------------------------------------------------------- add agent ----
function AddAgent({ onErr }: { onErr: (m: string) => void }) {
  const [f, setF] = useState({ username: "", password: "" });
  const [made, setMade] = useState<{ username: string; password: string | null } | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault(); onErr(""); setBusy(true);
    try {
      const r = await api.agentCreateAgent(f.username, f.password || undefined);
      setMade({ username: r.username, password: r.password });
      setF({ username: "", password: "" });
    } catch (e: any) { onErr(e.message); } finally { setBusy(false); }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel title="Add Agent">
        <form onSubmit={submit} className="space-y-3">
          <Field label="Username" hint="letters, numbers, underscore">
            <input required minLength={3} pattern="[A-Za-z0-9_]+" value={f.username}
              onChange={(e) => setF({ ...f, username: e.target.value })}
              className="w-full rounded bg-base-700 px-3 py-2 text-sm outline-none" />
          </Field>
          <Field label="Password" hint="leave blank to generate one">
            <input value={f.password} minLength={6}
              onChange={(e) => setF({ ...f, password: e.target.value })}
              className="w-full rounded bg-base-700 px-3 py-2 font-mono text-sm outline-none" />
          </Field>
          <button disabled={busy}
            className="w-full rounded-lg btn-gold py-2.5 text-sm font-bold text-base-900 disabled:opacity-50">
            {busy ? "…" : "Create sub-agent"}
          </button>
          <p className="text-[10px] leading-relaxed text-slate-500">
            A sub-agent gets the same console scoped to their own sheet: they book their own
            customers, run their own figures, and settle their own weeks. They can't create
            other agents, refresh the feed, or see anyone else's customers.
          </p>
        </form>
      </Panel>

      <Panel title="Issued">
        {made ? (
          <div className="rounded bg-base-900 p-3">
            <div className="text-xs text-slate-400">Give these to your agent:</div>
            <div className="mt-2 font-mono text-sm">
              <div>user: <span className="text-gold">{made.username}</span></div>
              <div>pass: <span className="text-gold">{made.password ?? "(the one you set)"}</span></div>
            </div>
          </div>
        ) : (
          <Empty msg="New agent logins appear here." />
        )}
      </Panel>
    </div>
  );
}
