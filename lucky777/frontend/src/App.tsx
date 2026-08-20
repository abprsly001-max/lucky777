import { useEffect, useState } from "react";
import { api, clearToken, getToken, setToken } from "./api";
import AgentConsole from "./components/AgentConsole";
import PlayerView from "./components/PlayerView";

export interface Me {
  username: string; balance: string;
  isAdmin: boolean; isMaster: boolean; isActive: boolean;
}

export default function App() {
  const [session, setSession] = useState<Me | null>(null);
  const [booting, setBooting] = useState(true);

  useEffect(() => {
    if (!getToken()) { setBooting(false); return; }
    api.me()
      .then((s) => setSession({ username: s.username, balance: s.balance, isAdmin: s.is_admin, isMaster: s.is_master, isActive: s.is_active }))
      .catch(() => clearToken())
      .finally(() => setBooting(false));
  }, []);

  if (booting) return <Centered>loading…</Centered>;
  if (!session) return <AuthScreen onAuthed={setSession} />;
  return <Shell session={session} setSession={setSession} />;
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="grid min-h-screen place-items-center text-slate-400">{children}</div>;
}

export function LogoMark({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden
      className="shrink-0 drop-shadow-[0_2px_6px_rgba(240,180,41,0.35)]">
      <defs>
        <linearGradient id="lg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f7ca5e" />
          <stop offset="1" stopColor="#d99e12" />
        </linearGradient>
      </defs>
      <rect x="4" y="4" width="56" height="56" rx="14" fill="url(#lg)" />
      <rect x="4" y="4" width="56" height="28" rx="14" fill="#ffffff" opacity="0.12" />
      <text x="32" y="43" fontFamily="Arial Black, Arial, sans-serif" fontSize="28"
        fontWeight="900" textAnchor="middle" fill="#0b0e14">777</text>
    </svg>
  );
}

function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`font-extrabold tracking-tight ${className}`}>
      Lucky<span className="bg-gradient-to-b from-gold-400 to-gold-600 bg-clip-text text-transparent">777</span>
    </span>
  );
}

// ------------------------------------------------------------------ auth ----
function AuthScreen({ onAuthed }: { onAuthed: (s: Me) => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(""); setBusy(true);
    try {
      const s = await api.login(username, password);
      setToken(s.access_token);
      onAuthed({ username: s.username, balance: s.balance, isAdmin: s.is_admin,
                 isMaster: s.is_master, isActive: s.is_active });
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  }

  return (
    <div className="grid min-h-screen place-items-center p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-3">
          <LogoMark size={52} />
          <div className="text-center">
            <Wordmark className="block text-3xl text-slate-100" />
            <p className="mt-1 text-[11px] uppercase tracking-[0.2em] text-slate-500">
              private book · play money
            </p>
          </div>
        </div>

        <form onSubmit={submit}
          className="rounded-2xl border border-white/5 bg-base-800/90 p-6 shadow-pop backdrop-blur">
          <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-400">
            Username
          </label>
          <input className="mb-4 w-full rounded-lg bg-base-900/70 px-3.5 py-2.5 text-sm text-slate-100"
            placeholder="your account id" value={username} autoComplete="username"
            onChange={(e) => setUsername(e.target.value)} autoFocus />

          <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-400">
            Password
          </label>
          <input className="mb-5 w-full rounded-lg bg-base-900/70 px-3.5 py-2.5 text-sm text-slate-100"
            placeholder="••••••••" type="password" value={password}
            autoComplete="current-password"
            onChange={(e) => setPassword(e.target.value)} />

          <button disabled={busy}
            className="w-full rounded-lg btn-gold py-2.5 text-sm font-bold disabled:opacity-50">
            {busy ? "Signing in…" : "Sign in"}
          </button>

          {err && (
            <div className="mt-3 rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-xs text-red-300">
              {err}
            </div>
          )}
        </form>

        <p className="mt-5 text-center text-[11px] leading-relaxed text-slate-500">
          Accounts are issued by your agent — there is no public signup.
          <br />Credits are play money with no cash value.
        </p>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------- shell ----
function Shell({ session, setSession }: { session: Me; setSession: (s: Me) => void }) {
  const setBalance = (balance: string) => setSession({ ...session, balance });
  // tapping the 777 logo goes HOME: bump the key so the active console
  // remounts to its default screen (works for player + admin, any size)
  const [home, setHome] = useState(0);
  const goHome = () => { setHome((h) => h + 1); window.scrollTo({ top: 0 }); };

  return (
    <div className="min-h-screen text-slate-200">
      <header className="sticky top-0 z-40 border-b border-white/5 bg-base-900/85 backdrop-blur
        after:absolute after:inset-x-0 after:bottom-[-1px] after:h-px
        after:bg-gradient-to-r after:from-transparent after:via-gold/50 after:to-transparent
        relative">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-2.5 sm:px-5">
          <button onClick={goHome} title="Home"
            className="flex items-center gap-2.5 rounded-lg transition hover:opacity-80 active:scale-95">
            <LogoMark size={28} />
            <Wordmark className="text-lg leading-none" />
            <span className="mt-0.5 hidden rounded-full border border-white/10 px-2 py-0.5 text-[9px] font-medium uppercase tracking-widest text-slate-400 sm:inline-block">
              play money
            </span>
          </button>
          <div className="flex items-center gap-3 text-sm">
            <span className="hidden text-xs font-medium text-slate-400 sm:inline">{session.username}</span>
            {session.isAdmin ? (
              <span className="rounded-full border border-gold/30 bg-gold/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-gold">
                {session.isMaster ? "master agent" : "agent"}
              </span>
            ) : (
              <span className="flex items-baseline gap-1.5 rounded-full border border-gold/25 bg-base-800 px-3 py-1 shadow-[0_0_12px_-4px_rgba(240,180,41,0.45)]">
                <span className="text-[9px] font-medium uppercase tracking-wider text-slate-500">bal</span>
                <span className={`font-mono text-sm font-bold ${
                  Number(session.balance) < 0 ? "text-red-400" : "text-accent"}`}>
                  {Number(session.balance).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </span>
            )}
            <button onClick={() => { clearToken(); location.reload(); }}
              className="rounded-lg border border-white/10 px-2.5 py-1 text-xs text-slate-400 hover:border-white/20 hover:text-slate-200">
              Log out
            </button>
          </div>
        </div>
      </header>

      {!session.isAdmin && !session.isActive && (
        <div className="mx-auto max-w-7xl px-5 pt-3">
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
            Your account is suspended — you can view the board and your history, but not
            place a wager. Contact your agent.
          </div>
        </div>
      )}

      <main className="mx-auto max-w-7xl p-4 sm:p-5">
        {session.isAdmin
          ? <AgentConsole key={home} username={session.username} isMaster={session.isMaster} />
          : <PlayerView key={home} onBalance={setBalance} username={session.username} />}
      </main>

      <footer className="border-t border-white/5 px-5 py-5 text-center text-[11px] leading-relaxed text-slate-500">
        <span className="font-semibold text-slate-400">Lucky777</span> · Virtual credits with
        no cash value — they cannot be purchased, transferred, or redeemed.
      </footer>
    </div>
  );
}
