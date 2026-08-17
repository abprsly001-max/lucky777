# Lucky777

Play money only — credits can't be bought, transferred, or cashed out.

FastAPI + React. Two products over one ledger:

| | |
|---|---|
| **Sportsbook** | 10 sports, 17 competitions, singles + parlays, full settlement engine |
| **Duel** | head-to-head vs the house at a stated 63/37, 26% edge, provably fair |
| **Agent console** | weekly figures, customer admin, credit/debit, pending & graded wagers, settle |
| **House** | the book's own position, realised vs advertised edge |

It runs on the private-bookie model: **no public signup**. The agent books each
customer, issues their login, sets their per-wager limit, and squares up the
weekly figure. Customers can't top themselves up — money only moves when the
agent moves it, and every adjustment lands in the ledger with the agent's id.

## Running it

```bash
./run.sh                                       # → http://localhost:8000
```

Nothing is created for you. A fresh database is genuinely empty — no default
account, no fake data. Bootstrap it yourself:

```bash
cd backend
python -m app.cli create-admin brock           # prompts for a password
python -m app.cli load-feed                    # pull the sportsbook feed
```

Then log in as that operator, open the **Agent** tab, and book your customers from
**Add Customer** — that's the only way player accounts come into existence.

Other commands:

```bash
python -m app.cli list-users                   # who exists, role, balance
python -m app.cli integrity                    # audit the ledger, exit 1 if broken
```

Dev mode with hot reload:

```bash
cd backend  && uvicorn app.main:app --reload   # :8000
cd frontend && npm run dev                     # :5173, proxies /api
```

---

## Agents and customers

Two roles, one login screen, no public signup.

- **Customers** are booked by an agent, who issues their username and password, sets
  their starting credit and their max stake per wager. A suspended customer can still
  log in and read their history — they just can't get more money into action.
- **Agents (operators)** get the Agent and House tabs: weekly figures, customer
  admin, credit/debit adjustments, pending and graded wagers, settle, performance.
  They get **no edge inside any game** — an agent's bet runs through the same engine,
  ledger and seed pair as anyone else's, and their wallet can't go negative either.

Agent accounts only come from the CLI (`python -m app.cli create-admin`). Customer
accounts only come from an agent's **Add Customer**. There is no third path.

**The agent console** follows the classic pay-per-head layout — a tile row over dense
reports:

- **Weekly Figures** — win/loss per customer on the Monday–Sunday cycle. Pending
  wagers are excluded until they grade; a running ticket is not a loss.
- **Customer Admin** — balances, limits, suspend/activate, credit/debit with a note
  (each adjustment is a ledger entry carrying the agent's id), password reset.
- **Add Customer** — issue a login; the generated password is shown exactly once.
- **Pending / Graded Wagers** — every ticket with its legs, struck prices and results.
- **Settle Figures** — square up a week and return the customer to baseline. One
  settlement per customer per week, enforced.
- **Agent Performance** — four weeks of volume, book figure and hold.

Figures are computed from ledger entries at read time, never stored separately, so a
report cannot drift from what actually happened.

Operator-only routes return **403**, not 404. Hiding a route doesn't actually hide
anything and honest errors are easier to debug.

`GET /api/wallet/integrity` stays public on purpose — customers shouldn't have to take
the book's word for it that the ledger balances.

---

## The money layer

**The ledger is append-only and double-entry.** There's no mutable `balance` column
holding the truth. Every bet writes entries that sum to exactly zero, and the
integrity endpoint re-derives everything from the entry log:

```json
{"global_sum_micros": 0, "unbalanced_transactions": 0,
 "cache_drift_accounts": 0, "illegally_negative_accounts": 0, "ok": true}
```

**Money is integers.** All amounts are `BIGINT` micro-credits (1 credit = 1,000,000).
No float touches a balance anywhere. Payouts round down, always, everywhere.

**Balance checks are atomic.** `UPDATE ... WHERE balance + delta >= 0` with a rowcount
check, never `if balance >= stake:` followed by a write — two concurrent bets would
both pass a stale read and overdraw the wallet.

**Every settlement is idempotent.** Replaying a key is a no-op, because the settlement
worker will eventually run twice and you don't want to find that out in production.

`core/ledger.py` is the only module allowed to write ledger entries. That single rule
is what keeps this auditable as more games get added.

---

## The sportsbook

**Domain model.** `Sport → Competition → Event → Market → Selection`. Markets cover
moneyline / 1X2, totals, spreads, both-teams-to-score and double chance depending on
the sport.

**The one rule that matters:** `selections.odds_decimal` is the *current* price and
moves constantly. `bet_selections.odds_at_placement` is the price the bet was actually
struck at. Settlement reads the snapshot, never the live price — otherwise a line move
after kickoff silently repays every open bet at the wrong number.

**Odds are real.** Prices come from choosing true probabilities and applying an
overround, so the vig is measurable rather than decorative. Every market shows its
hold. Overround and hold are different numbers and constantly conflated: two sides at
1.91 is a 4.71% overround but a 4.50% hold.

**Margin compounds**, and the bet slip shows it as you add legs:

| legs | odds | book margin |
|---|---|---|
| 1 | 2.23 | 5.66% |
| 2 | 6.32 | 11.00% |
| 3 | 12.73 | 16.04% |
| 5 | 61.42 | 25.27% |

That's why parlays get pushed so hard, and the UI says so out loud.

**Correlated legs are blocked.** Two selections from the same event can't share a
parlay. "Team wins" and "over 2.5 goals" are correlated; multiplying their odds
underprices the combination, and that's how books get arbitraged.

**Settlement is two passes.** `grade_event()` writes a result onto every selection,
then `settle_bets()` pays out bets whose legs are all graded. The split matters because
scores get corrected — a re-grade only re-runs pass two, and pass two is idempotent.
Full result vocabulary: `won`, `lost`, `void`, `push`, `half_won`, `half_lost`. A void
leg becomes 1.00 and drops out of the parlay product, which is neither a loss nor a
full refund.

**Data.** Ships with an offline fixture feed, so `load-feed` fills the book with no
signup. For live prices:

```bash
export LUCKY777_ODDS_PROVIDER=the_odds_api
export LUCKY777_ODDS_API_KEY=...      # the-odds-api.com, ~500 req/mo free
```

No domain code changes — everything crosses the boundary as a `ProviderEvent`. Don't
scrape a sportsbook instead; it breaks their terms and their anti-bot will win.

**Simulate results** (operator) ends events, grades them and settles bets. It stands in
for a scores feed; the grading and settlement code underneath is what would run in
production.

---

## Duel, and a note on the odds

The house wins **63%** of rounds, you win 37% and are paid 2x — a **26% house edge**.
Both numbers are configurable (`LUCKY777_DUEL_HOUSE_WIN_PROB`,
`LUCKY777_DUEL_PAYOUT_MULTIPLIER`) and both are printed on the bet button, in
`/api/casino/duel/rules`, and on the House dashboard next to what the account actually
realised.

A game can be as house-favoured as you like as long as the player is told. What it
can't be is house-favoured while claiming otherwise — and in a provably-fair system
that isn't even achievable: the verifier recomputes outcomes from the revealed seed, so
a hidden bias ships its own evidence. The odds in force are stored on each round row,
so changing the config later can't retroactively alter what a player was offered.

---

## Provably fair

Commit-reveal. Note this is unrelated to database seeding — different meaning of the
word entirely.

1. On signup the server generates a 32-byte `server_seed` and shows you `SHA256(server_seed)`.
2. You get a `client_seed` you can change whenever you like.
3. Each bet consumes an incrementing `nonce`.
4. `outcome = HMAC_SHA256(server_seed, "client_seed:nonce")`, consumed 4 bytes at a
   time into uniform floats. The house takes the round when `roll < 0.63`.
5. Hit **Rotate & reveal**. The old `server_seed` is published — hash it yourself,
   check it against the commitment you were shown *before* you ever bet, and recompute
   every round.

`POST /api/fairness/verify` is stateless and needs no auth, so anyone can check the
arithmetic from anywhere.

Seeds come from `secrets`, never `random` — Python's Mersenne Twister is fully
predictable from 624 consecutive outputs, which is how real casinos have been drained.
The fixture generator does use `random`, deliberately: it produces demo events and
prices, never a game outcome. Keeping those in separate modules keeps the line bright.

---

## Tests

```bash
cd backend && pytest -q
```

Money and ledger: exact decimal arithmetic, round-down payouts, unbalanced-transaction
rejection, overdraft prevention, idempotent replay, global books-balance invariant.

Fairness: HMAC determinism and nonce sensitivity, commitment binding, reproducibility
of a round from its seeds.

Roles: players refused operator access, blank signup code unmatched, fresh salt per
password hash, operator wallets held to the same non-negative rule as players'.

Sportsbook: decimal↔American round-trips, overround vs hold, margin compounding across
parlay legs, the full grading matrix for every market type including pushes on exact
lines, void legs collapsing out of parlays, feed pricing staying inside its target
overround.

---

## Layout

```
backend/app/
  cli.py              create-admin · load-feed · integrity · list-users
  core/money.py       integer micro-credits, round-down payouts
  core/ledger.py      the ONLY module that writes ledger entries
  core/fairness.py    commit-reveal, HMAC → uniform floats
  core/seeds.py       seed-pair lifecycle, atomic nonce claim
  core/security.py    JWT, password hashing, current_user / current_admin
  casino/duel/        engine.py (stated 63/37) · router.py
  sportsbook/
    models.py         Sport/Competition/Event/Market/Selection/Bet
    odds.py           conversions, overround vs hold, margin, result factors
    placement.py      odds re-validation, correlation blocking, struck-price snapshot
    settlement.py     grade selections, then settle bets
    providers/        base.py · fixture.py (offline) · the_odds_api.py
  routers/            auth · wallet · fairness · house
frontend/src/
  components/Sportsbook.tsx     event board, bet slip, my bets
  components/Duel.tsx           the number line and the stated odds
  components/HousePanel.tsx     operator view
  components/FairnessPanel.tsx  rotate, reveal, recompute
```

## Postgres

```bash
export LUCKY777_DATABASE_URL="postgresql+asyncpg://user:pass@localhost/lucky777"
pip install asyncpg
```

No other code changes — `BigInt` is already a `BIGINT`/`INTEGER` variant and every
money column is an integer.

## Config

`LUCKY777_`-prefixed env vars: `DATABASE_URL`, `JWT_SECRET` (change it),
`ADMIN_SIGNUP_CODE`, `SIGNUP_BONUS_CREDITS`, `FAUCET_CREDITS`, `MAX_BET_CREDITS`,
`MIN_BET_CREDITS`, `DUEL_HOUSE_WIN_PROB`, `DUEL_PAYOUT_MULTIPLIER`, `ODDS_PROVIDER`,
`ODDS_API_KEY`.
