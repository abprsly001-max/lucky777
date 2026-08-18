"""Offline calibration for Sugar Blast (app/casino/games/tumble.py).

Simulates the exact tumble process (counts representation -- pays depend only
on symbol counts, never position) with vectorized numpy, then solves the pay
scale so the machine returns TARGET_RTP. Pays are linear in the scale, so one
measured RTP-at-scale-1 is all that's needed.

Run:  python scripts/calibrate_tumble.py
Paste the printed _SCALE and BUY_COST_MULT into tumble.py.
"""
import sys
from math import comb
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from app.casino.games import tumble as T  # noqa: E402

RNG = np.random.default_rng(20260818)

N_PAY = len(T.SYMBOLS)                 # paying categories
SCAT, BOMB = N_PAY, N_PAY + 1          # category indices
P_SCAT = float(T.P_SCAT)
P_BOMB = float(T.P_BOMB)
W = np.array([w for _, w, _ in T.SYMBOLS], dtype=float)
PAY_W = W / W.sum()

# tier pays at scale = 1
T8 = np.array([float(t[0]) for _, _, t in T.SYMBOLS])
T10 = np.array([float(t[1]) for _, _, t in T.SYMBOLS])
T12 = np.array([float(t[2]) for _, _, t in T.SYMBOLS])

MU_BOMB = (sum(float(v) * float(w) for v, w in T.BOMB_VALUES)
           / float(sum(w for _, w in T.BOMB_VALUES)))

BASE_P = np.append(PAY_W * (1 - P_SCAT), [P_SCAT])                 # 10 cats
FS_P = np.append(PAY_W * (1 - P_SCAT) * (1 - P_BOMB),
                 [P_SCAT * (1 - P_BOMB), P_BOMB])                  # 11 cats


def multinomial_rows(n_vec: np.ndarray, probs: np.ndarray) -> np.ndarray:
    """Per-row multinomial with varying n, by sequential conditional binomial."""
    n_rows = n_vec.shape[0]
    out = np.zeros((n_rows, probs.shape[0]), dtype=np.int64)
    rem_n = n_vec.astype(np.int64).copy()
    rem_p = 1.0
    for j in range(probs.shape[0] - 1):
        pj = min(probs[j] / rem_p, 1.0)
        c = RNG.binomial(rem_n, pj)
        out[:, j] = c
        rem_n -= c
        rem_p -= probs[j]
    out[:, -1] = rem_n
    return out


def run_chain(counts: np.ndarray, probs: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Play chains to completion. Returns (total pay at scale 1, bomb count)."""
    n_rows = counts.shape[0]
    pay = np.zeros(n_rows)
    has_bomb_cat = probs.shape[0] == N_PAY + 2
    for _ in range(T.MAX_STEPS):
        c = counts[:, :N_PAY]
        winmask = c >= T.MIN_MATCH
        if not winmask.any():
            break
        tier = np.where(c >= 12, T12, np.where(c >= 10, T10, T8))
        pay += (tier * winmask).sum(axis=1)
        removed = (c * winmask).sum(axis=1)
        counts[:, :N_PAY] = np.where(winmask, 0, c)
        refill = multinomial_rows(removed, probs)
        counts += refill
    bombs = counts[:, BOMB] if has_bomb_cat else np.zeros(n_rows, dtype=np.int64)
    return pay, bombs


def sim_base(n: int, batch: int = 1_000_000) -> float:
    tot, done = 0.0, 0
    while done < n:
        b = min(batch, n - done)
        counts = RNG.multinomial(T.CELLS, BASE_P, size=b).astype(np.int64)
        pay, _ = run_chain(counts, BASE_P)
        tot += pay.sum()
        done += b
    return tot / n


def sim_fs(n: int, batch: int = 1_000_000) -> float:
    """E[free-spin pay]: chain total x summed bomb values (E over values)."""
    tot, done = 0.0, 0
    while done < n:
        b = min(batch, n - done)
        counts = RNG.multinomial(T.CELLS, FS_P, size=b).astype(np.int64)
        pay, bombs = run_chain(counts, FS_P)
        ev = np.where(bombs > 0, pay * bombs * MU_BOMB, pay)
        tot += ev.sum()
        done += b
    return tot / n


def sim_cond_trigger(n: int, batch: int = 500_000) -> float:
    """E[chain pay | 4+ scatters on the first grid] (scatter pay excluded)."""
    pk = np.array([comb(T.CELLS, k) * P_SCAT**k * (1 - P_SCAT)**(T.CELLS - k)
                   for k in range(T.CELLS + 1)])
    cond = pk[4:] / pk[4:].sum()
    tot, done = 0.0, 0
    while done < n:
        b = min(batch, n - done)
        ks = RNG.choice(np.arange(4, T.CELLS + 1), size=b, p=cond)
        pay_cells = T.CELLS - ks
        counts = multinomial_rows(pay_cells, np.append(PAY_W, [0.0]))
        counts[:, SCAT] = ks
        pay, _ = run_chain(counts, BASE_P)
        tot += pay.sum()
        done += b
    return tot / n


def main() -> None:
    pk = [comb(T.CELLS, k) * P_SCAT**k * (1 - P_SCAT)**(T.CELLS - k)
          for k in range(T.CELLS + 1)]
    p4 = sum(pk[4:])
    scat_ev = sum(pk[k] * float(T.SCATTER_PAYS[min(k, 6)])
                  for k in range(4, T.CELLS + 1))
    scat_ev_cond = scat_ev / p4

    print(f"P(trigger) exact          {p4:.8f}  (1 in {1/p4:,.0f})")
    B = sim_base(20_000_000)
    print(f"E[base chain] @scale1     {B:.6f}")
    F = sim_fs(10_000_000)
    print(f"E[free spin]  @scale1     {F:.6f}")
    C = sim_cond_trigger(2_000_000)
    print(f"E[chain|trig] @scale1     {C:.6f}")

    rtp1 = B + scat_ev + p4 * T.FREE_SPINS * F
    scale = float(T.TARGET_RTP) / rtp1
    print(f"RTP @scale1               {rtp1:.6f}")
    print(f"\n_SCALE = Decimal(\"{scale:.4f}\")")

    ev_buy1 = C + scat_ev_cond + T.FREE_SPINS * F      # at scale 1
    ev_buy = ev_buy1 * scale
    buy = np.ceil(ev_buy / float(T.TARGET_RTP))
    print(f"EV[buy] scaled            {ev_buy:.4f}x")
    print(f"BUY_COST_MULT = Decimal(\"{buy:.0f}\")")


if __name__ == "__main__":
    main()
