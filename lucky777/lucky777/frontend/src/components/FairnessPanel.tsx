import { useState } from "react";
import { api, type Fairness } from "../api";

interface Props {
  fairness: Fairness | null;
  onRotated: (f: Fairness) => void;
}

export default function FairnessPanel({ fairness, onRotated }: Props) {
  const [newSeed, setNewSeed] = useState("");
  const [revealed, setRevealed] = useState<any | null>(null);
  const [check, setCheck] = useState({ server_seed: "", client_seed: "", nonce: "1" });
  const [result, setResult] = useState<any | null>(null);
  const [err, setErr] = useState("");

  async function rotate() {
    setErr("");
    try {
      const r = await api.rotate(newSeed || undefined);
      setRevealed(r.revealed);
      setCheck({
        server_seed: String(r.revealed.server_seed),
        client_seed: String(r.revealed.client_seed),
        nonce: "1",
      });
      onRotated(r.new);
      setNewSeed("");
    } catch (e: any) { setErr(e.message); }
  }

  async function runVerify() {
    setErr("");
    try {
      setResult(await api.verify(check.server_seed, check.client_seed, Number(check.nonce)));
    } catch (e: any) { setErr(e.message); }
  }

  return (
    <div className="h-fit rounded-xl border border-white/5 bg-base-800 shadow-card p-4 text-sm lg:sticky lg:top-4">
      <h3 className="mb-3 font-semibold text-slate-200">Provably fair</h3>

      <div className="space-y-2 font-code text-xs">
        <Field label="Server seed hash (commitment)" value={fairness?.server_seed_hash ?? "—"} />
        <Field label="Client seed" value={fairness?.client_seed ?? "—"} />
        <Field label="Nonce" value={String(fairness?.nonce ?? 0)} />
      </div>

      <p className="mt-3 text-xs leading-relaxed text-slate-400">
        That hash was published before you placed a single bet. Rotate the seed to reveal the
        server seed behind it — then hash it yourself and recompute every round you played.
        This is also how you confirm the house really was on 63% and not something else.
      </p>

      <div className="mt-3 flex gap-2">
        <input
          className="min-w-0 flex-1 rounded bg-base-700 px-2 py-1.5 text-xs outline-none placeholder:text-slate-500"
          placeholder="new client seed (optional)"
          value={newSeed} onChange={(e) => setNewSeed(e.target.value)} />
        <button onClick={rotate}
          className="shrink-0 rounded bg-base-600 px-3 py-1.5 text-xs font-medium hover:bg-slate-600">
          Rotate &amp; reveal
        </button>
      </div>

      {revealed && (
        <div className="mt-3 rounded bg-base-900 p-2 font-code text-[11px]">
          <div className="break-all text-slate-300">
            revealed: <span className="text-accent">{revealed.server_seed}</span>
          </div>
          <div className="mt-1 text-slate-400">
            rounds covered: {revealed.rounds_played} · hash matches:{" "}
            <span className={revealed.hash_matches ? "text-accent" : "text-red-400"}>
              {String(revealed.hash_matches)}
            </span>
          </div>
        </div>
      )}

      <h4 className="mb-2 mt-4 font-semibold text-slate-300">Verify a round</h4>
      <div className="space-y-2">
        {(["server_seed", "client_seed", "nonce"] as const).map((k) => (
          <input key={k}
            className="w-full rounded bg-base-700 px-2 py-1.5 font-code text-xs outline-none placeholder:text-slate-500"
            placeholder={k} value={(check as any)[k]}
            onChange={(e) => setCheck({ ...check, [k]: e.target.value })} />
        ))}
        <button onClick={runVerify}
          className="w-full rounded bg-base-600 py-1.5 text-xs font-medium hover:bg-slate-600">
          Recompute
        </button>
      </div>

      {result && (
        <div className="mt-2 space-y-1 rounded bg-base-900 p-2 font-code text-[11px] text-slate-300">
          <div>roll <span className="text-gold">{result.roll}</span></div>
          <div className={result.house_wins ? "text-red-300" : "text-accent"}>
            {result.house_wins ? "house took it" : "player won"} · pays {result.multiplier}x
          </div>
          <div className="text-slate-500">{result.rule}</div>
          <div className="break-all text-slate-500">
            sha256(server_seed) = {result.server_seed_hash}
          </div>
        </div>
      )}

      {err && <div className="mt-2 text-xs text-red-400">{err}</div>}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className="break-all text-slate-300">{value}</div>
    </div>
  );
}
