// The token lives in memory ONLY -- a refresh, a closed tab, or a crash all
// end the session and demand the password again. Book rules.
let _token: string | null = null;

export const getToken = () => _token;
export const setToken = (t: string) => { _token = t; };
export const clearToken = () => { _token = null; };

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  const res = await fetch(path, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      detail = (await res.json()).detail ?? detail;
    } catch { /* non-JSON error body */ }
    throw new Error(typeof detail === "string" ? detail : JSON.stringify(detail));
  }
  return res.json() as Promise<T>;
}

export interface Session {
  access_token: string; username: string; balance: string;
  is_admin: boolean; is_master: boolean; is_active: boolean;
}
export interface Fairness { server_seed_hash: string; client_seed: string; nonce: number }

export interface DuelRules {
  house_win_probability: string; player_win_probability: string;
  payout_multiplier: string; rtp: string; house_edge_pct: string;
  rule: string; summary: string;
}
export interface DuelResult {
  round_id: number; nonce: number; roll: string; threshold: string;
  house_wins: boolean; stake: string; payout: string; profit: string;
  balance: string; server_seed_hash: string; client_seed: string;
}
export interface HouseStats {
  house_balance: string; players: number; note: string;
  duel: Record<string, string | number>;
  sportsbook: Record<string, string | number>;
}

export interface Customer {
  id: number; account: string; username: string; active: boolean; balance: string;
  free_play: string; display_name: string | null; allow_live: boolean;
  credit_limit: string; wager_limit: string | null; available: string;
  allow_sportsbook: boolean; allow_casino: boolean;
  week_figure: string; week_volume: string;
  week_wagers: number; pending_wagers: number; pending_risk: string; created_at: string;
}
export interface WeeklyRow {
  id: number; account: string; username: string; active: boolean; settled: boolean;
  carry: string; days: string[]; week: string; adjustments: string;
  balance: string; pending: string; wagers: number;
}
export interface WeeklyFigures {
  week_start: string; week_end: string; weeks_back: number;
  day_labels: string[];
  customers: WeeklyRow[];
  totals: {
    players: number; carry: string; days: string[]; week: string;
    adjustments: string; balance: string; pending: string;
    wagers: number; book_week: string;
  };
}
export interface AgentWager {
  bet_id: number; customer: string; account: string; agent: string;
  type: string; status: string;
  stake: string; odds: string; to_win: string; risk: string;
  payout: string | null; placed_at: string;
  legs: { selection: string; market: string; event: string; odds: string;
          result: string | null; score: string | null }[];
}
export interface SubAgent {
  id: number; username: string; active: boolean; customers: number;
  week_wagers: number; week_volume: string; week_figure: string; created_at: string;
}
export interface Performance {
  scope: "master" | "agent";
  house_balance: string; customers: number; active_customers: number;
  open_wagers_risk: string; open_wagers_liability: string; duel_rounds: number;
  weeks: { week_start: string; wagers: number; volume: string;
           book_figure: string; pending: string; hold_pct: string }[];
  note: string;
}

export interface SbSelection {
  id: number; key: string; name: string; odds: string; american: string; implied_pct: string;
}
export interface SbMarket {
  id: number; type: string; name: string; line: string | null;
  overround: string | null; hold_pct: string | null; selections: SbSelection[];
}
export interface SbEvent {
  id: number; sport: string; sport_name: string; icon: string;
  competition: string; competition_key: string;
  home: string; away: string; starts_at: string; markets: SbMarket[];
  status: string; period: string | null;
  home_score: number | null; away_score: number | null;
  period_scores?: { p: string; h: number; a: number }[];
}
export interface SbSport { key: string; name: string; icon: string; events: number }
export interface SbQuote {
  legs: number; total_odds: string; american: string;
  potential: string; profit: string; margin_pct: string;
  label?: string; max_risk?: string; cost?: string; chains?: number;
  teased?: { selection_id: number; from_line: string; teased_line: string }[];
}
export interface SbBet {
  bet_id: number; type: string; status: string; free_play: boolean;
  stake: string; total_odds: string;
  potential: string; payout: string | null; placed_at: string;
  legs: { selection: string; market: string; event: string; odds: string;
          current_odds: string; result: string | null; score: string | null }[];
}

export interface SlotDef {
  machine: string;
  symbols: string[];
  weights: number[];
  triples: Record<string, string>;
  partial: { symbol: string; two: string; one: string } | null;
}

export interface VSlotDef {
  machine: string;
  symbols: string[];
  pays: Record<string, Record<string, string>>;
  free_spins: { trigger: number; count: number; mult: number };
  lines: number;
  buy_cost?: number;
}

export interface HoldSpinState {
  round_id: number; status: string;
  locked: Record<string, string>; respins: number;
  stake: string; collected: string;
}

export interface HoldSpinDef {
  trigger: number; respins: number; grand: string; faces: string[];
}

export interface DragonDef {
  trigger: number; respins: number; grand: string; faces: string[];
  jackpots: Record<string, string>; buy_cost: string;
}

export interface TumbleDef {
  cols: number; rows: number; min_match: number; free_spins: number;
  symbols: string[]; pays: Record<string, string[]>;
  scatter_pays: Record<string, string>; bombs: string[];
  buy_cost: string; max_win: string;
}

export interface TumbleSpin {
  round_id: number; free_spin: boolean;
  grids: string[][]; steps: { sym: string; count: number; pay: string }[][];
  scatters: number; bomb_sum: string; total_mult: string; triggered: boolean;
  win: string; free_spins_left: number; bonus_total: string; balance: string;
  cost?: string;
}

export interface KenoDef {
  pool: number; drawn: number; max_picks: number;
  tables: Record<string, Record<string, string>>;
}

export interface LimboDef { min: string; max: string }

export interface TowersDef {
  rows: number;
  levels: Record<string, { tiles: number; mults: string[] }>;
}

export interface TowersState {
  round_id: number; status: string; outcome: string | null;
  level: string; row: number; rows: number; tiles: number; picked: number[];
  stake: string; multiplier: string; next_multiplier: string | null;
  payout: string | null; traps?: number[]; balance?: string;
}

export interface HiLoState {
  round_id: number; status: string; outcome: string | null;
  card: string; history: string[]; stake: string; multiplier: string;
  higher_mult: string; lower_mult: string; payout: string | null;
  correct?: boolean; balance?: string;
}

export interface PlinkoDef {
  rows: number[];
  tables: Record<string, Record<string, string[]>>;
}

export interface MinesState {
  round_id: number; status: string; outcome: string | null;
  mines: number; revealed: number[]; stake: string;
  multiplier: string; next_multiplier: string | null;
  payout: string | null; layout?: number[]; balance?: string;
}

export interface BjHand {
  round_id: number; status: string; outcome: string | null;
  player: string[]; player_total: number;
  dealer: string[]; dealer_total: number | null;
  stake: string; doubled: boolean; can_double: boolean;
  payout: string | null; balance?: string;
}

export interface BookLimitsShape {
  min_straight: string; max_straight: string; max_per_offering: string;
  max_per_event: string; max_win_single: string; max_win_event: string;
  min_parlay: string; max_parlay: string; max_win_parlay: string;
  max_fav_line: number; max_dog_line: number; max_dog_line_parlay: number;
  delay_sec: number; cooloff_sec: number;
  live_parlays: boolean; block_prior_start: boolean; block_halftime: boolean;
  include_graded: boolean; use_risk: boolean;
}

export const api = {
  login: (username: string, password: string) =>
    request<Session>("/api/auth/login", { method: "POST", body: JSON.stringify({ username, password }) }),
  me: () => request<Session>("/api/auth/me"),
  authVerify: (password: string) =>
    request<{ ok: boolean }>("/api/auth/verify", {
      method: "POST", body: JSON.stringify({ password }) }),

  balance: () => request<{ balance: string; free_play: string }>("/api/wallet/balance"),
  myFigures: (weeks_back = 0) =>
    request<{ week_start: string; week_end: string; weeks_back: number;
              day_labels: string[]; days: string[];
              week: string; pending: string; wagers: number; carry: string;
              adjustments: string; end_balance: string;
              balance: string; free_play: string; credit_limit: string;
              available: string; settled_this_week: boolean; note: string }>(
      `/api/me/figures?weeks_back=${weeks_back}`),
  integrity: () => request<Record<string, number | boolean>>("/api/wallet/integrity"),
  myTransactions: (weeks_back = 0) =>
    request<{ week_start: string; weeks_back: number; balance_forward: string;
              rows: { id: number; at: string; description: string; amount: string;
                      balance: string }[] }>(`/api/me/transactions?weeks_back=${weeks_back}`),
  myScores: () =>
    request<{ sport: string; icon: string; league: string; home: string; away: string;
              home_score: number | null; away_score: number | null;
              status: string; period: string | null; starts_at: string }[]>("/api/me/scores"),
  myChangePassword: (current_password: string, new_password: string) =>
    request<{ ok: boolean }>("/api/me/password", {
      method: "POST", body: JSON.stringify({ current_password, new_password }) }),

  casinoLobby: () =>
    request<{ games: { key: string; name: string; icon: string; category: string;
                       min: string; max: string; edge: string; rules: string;
                       slot?: SlotDef; plinko?: PlinkoDef; vslot?: VSlotDef;
                       holdspin?: HoldSpinDef; dragon?: DragonDef;
                       tumble?: TumbleDef; keno?: KenoDef; limbo?: LimboDef;
                       towers?: TowersDef }[] }>(
      "/api/casino/lobby"),
  plinkoDrop: (stake: string, rows: number, risk: string) =>
    request<{ round_id: number; rows: number; risk: string; path: number[];
              bucket: number; multiplier: string; payout: string; balance: string }>(
      "/api/casino/plinko/drop", { method: "POST", body: JSON.stringify({ stake, rows, risk }) }),
  rouletteSpin: (bets: { kind: string; pick?: number | null; stake: string }[]) =>
    request<{ round_id: number; nonce: number; pocket: number; color: string;
              payout: string; balance: string }>(
      "/api/casino/roulette/spin", { method: "POST", body: JSON.stringify({ bets }) }),
  vpDeal: (stake: string) =>
    request<{ round_id: number; hand: string[]; stake: string;
              paytable: [string, string][]; balance: string }>(
      "/api/casino/vp/deal", { method: "POST", body: JSON.stringify({ stake }) }),
  vpDraw: (roundId: number, holds: boolean[]) =>
    request<{ round_id: number; hand: string[]; result: string; multiplier: string;
              payout: string; balance: string }>(
      `/api/casino/vp/${roundId}/draw`, { method: "POST", body: JSON.stringify({ holds }) }),
  vpActive: () =>
    request<{ active: { round_id: number; hand: string[]; stake: string;
                        paytable: [string, string][] } | null }>("/api/casino/vp/active"),
  baccaratDeal: (bet: string, stake: string) =>
    request<{ round_id: number; bet: string; player: string[]; banker: string[];
              player_total: number; banker_total: number; outcome: string;
              multiplier: string; payout: string; balance: string }>(
      "/api/casino/baccarat/deal", { method: "POST", body: JSON.stringify({ bet, stake }) }),
  minesStart: (stake: string, mines: number) =>
    request<MinesState>("/api/casino/mines/start", {
      method: "POST", body: JSON.stringify({ stake, mines }) }),
  minesReveal: (roundId: number, cell: number) =>
    request<MinesState>(`/api/casino/mines/${roundId}/reveal`, {
      method: "POST", body: JSON.stringify({ cell }) }),
  minesCashout: (roundId: number) =>
    request<MinesState>(`/api/casino/mines/${roundId}/cashout`, { method: "POST" }),
  minesActive: () => request<{ active: MinesState | null }>("/api/casino/mines/active"),
  crashStart: (stake: string, auto?: string) =>
    request<{ round_id: number; status: string; rate?: number; started_at?: string;
              point?: string; won?: boolean; multiplier?: string | null;
              payout?: string; balance: string }>(
      "/api/casino/crash/start", { method: "POST", body: JSON.stringify({ stake, auto: auto || null }) }),
  crashCashout: (roundId: number) =>
    request<{ round_id: number; status: string; point: string; won: boolean;
              multiplier: string | null; payout: string; balance: string }>(
      `/api/casino/crash/${roundId}/cashout`, { method: "POST" }),
  crashState: (roundId: number) =>
    request<{ status: string; point?: string; payout?: string; elapsed?: number }>(
      `/api/casino/crash/${roundId}/state`, { method: "POST" }),
  crashHistory: () =>
    request<{ points: string[] }>("/api/casino/crash/history"),
  crashActive: () =>
    request<{ active: { round_id: number; rate: number; started_at: string;
                        stake: string } | null }>("/api/casino/crash/active"),
  vslotSpin: (machine: string, stake: string) =>
    request<{ round_id: number; free_spin: boolean; grid: string[][];
              line_wins: { line: number; symbol: string; count: number; pay: string }[];
              scatters: number; mult: number; win: string;
              free_spins_left: number; bonus_total: string; balance: string }>(
      "/api/casino/vslots/spin", { method: "POST", body: JSON.stringify({ machine, stake }) }),
  holdspinSpin: (stake: string) =>
    request<HoldSpinState & { coins: Record<string, string>; win: string;
              triggered: boolean; balance: string }>(
      "/api/casino/holdspin/spin", { method: "POST", body: JSON.stringify({ stake }) }),
  holdspinRespin: () =>
    request<HoldSpinState & { coins: Record<string, string>; win: string;
              grand: string; balance: string }>(
      "/api/casino/holdspin/respin", { method: "POST" }),
  holdspinActive: () =>
    request<{ active: HoldSpinState | null }>("/api/casino/holdspin/active"),
  kenoPlay: (stake: string, picks: number[]) =>
    request<{ round_id: number; drawn: number[]; picks: number[]; hits: number;
              multiplier: string; win: string; balance: string }>(
      "/api/casino/keno/play", { method: "POST", body: JSON.stringify({ stake, picks }) }),
  limboPlay: (stake: string, target: string) =>
    request<{ round_id: number; target: string; result: string; win: boolean;
              payout: string; balance: string }>(
      "/api/casino/limbo/play", { method: "POST", body: JSON.stringify({ stake, target }) }),
  towersStart: (stake: string, level: string) =>
    request<TowersState>("/api/casino/towers/start",
      { method: "POST", body: JSON.stringify({ stake, level }) }),
  towersPick: (roundId: number, tile: number) =>
    request<TowersState>(`/api/casino/towers/${roundId}/pick`,
      { method: "POST", body: JSON.stringify({ tile }) }),
  towersCashout: (roundId: number) =>
    request<TowersState>(`/api/casino/towers/${roundId}/cashout`, { method: "POST" }),
  towersActive: () =>
    request<{ active: TowersState | null }>("/api/casino/towers/active"),
  dtDeal: (stake: string, bet: string) =>
    request<{ round_id: number; dragon: string; tiger: string; result: string;
              bet: string; payout: string; balance: string }>(
      "/api/casino/dt/deal", { method: "POST", body: JSON.stringify({ stake, bet }) }),
  hiloStart: (stake: string) =>
    request<HiLoState>("/api/casino/hilo/start",
      { method: "POST", body: JSON.stringify({ stake }) }),
  hiloGuess: (roundId: number, guess: string) =>
    request<HiLoState>(`/api/casino/hilo/${roundId}/guess`,
      { method: "POST", body: JSON.stringify({ guess }) }),
  hiloCashout: (roundId: number) =>
    request<HiLoState>(`/api/casino/hilo/${roundId}/cashout`, { method: "POST" }),
  hiloActive: () =>
    request<{ active: HiLoState | null }>("/api/casino/hilo/active"),
  tumbleSpin: (stake: string) =>
    request<TumbleSpin>("/api/casino/tumble/spin",
      { method: "POST", body: JSON.stringify({ stake }) }),
  tumbleBuy: (stake: string) =>
    request<TumbleSpin>("/api/casino/tumble/buy",
      { method: "POST", body: JSON.stringify({ stake }) }),
  tumbleActive: () =>
    request<{ active: { round_id: number; stake: string; free_spins_left: number;
                        bonus_total: string } | null }>("/api/casino/tumble/active"),
  dragonSpin: (stake: string) =>
    request<HoldSpinState & { coins: Record<string, string>; win: string;
              triggered: boolean; balance: string }>(
      "/api/casino/dragon/spin", { method: "POST", body: JSON.stringify({ stake }) }),
  dragonBuy: (stake: string) =>
    request<HoldSpinState & { coins: Record<string, string>; win: string;
              triggered: boolean; cost: string; balance: string }>(
      "/api/casino/dragon/buy", { method: "POST", body: JSON.stringify({ stake }) }),
  dragonRespin: () =>
    request<HoldSpinState & { coins: Record<string, string>; win: string;
              grand: string; balance: string }>(
      "/api/casino/dragon/respin", { method: "POST" }),
  dragonActive: () =>
    request<{ active: HoldSpinState | null }>("/api/casino/dragon/active"),
  vslotBuy: (machine: string, stake: string) =>
    request<{ round_id: number; machine: string; cost: string;
              free_spins_left: number; mult: number; balance: string }>(
      "/api/casino/vslots/buy", { method: "POST", body: JSON.stringify({ machine, stake }) }),
  vslotActive: () =>
    request<{ active: { round_id: number; machine: string; free_spins_left: number;
                        bonus_total: string; stake: string } | null }>(
      "/api/casino/vslots/active"),
  slotSpin: (machine: string, stake: string) =>
    request<{ round_id: number; nonce: number; machine: string; reels: string[];
              multiplier: string; win: boolean; payout: string; balance: string }>(
      "/api/casino/slots/spin", { method: "POST", body: JSON.stringify({ machine, stake }) }),
  diceBet: (stake: string, chance: string) =>
    request<{ round_id: number; nonce: number; roll: string; chance: string;
              win: boolean; multiplier: string; payout: string; balance: string }>(
      "/api/casino/dice/bet", { method: "POST", body: JSON.stringify({ stake, chance }) }),
  wheelBet: (stake: string, risk: string) =>
    request<{ round_id: number; nonce: number; roll: string; risk: string;
              segment: number; multiplier: string; payout: string; balance: string }>(
      "/api/casino/wheel/bet", { method: "POST", body: JSON.stringify({ stake, risk }) }),
  bjDeal: (stake: string) =>
    request<BjHand>("/api/casino/blackjack/deal", {
      method: "POST", body: JSON.stringify({ stake }) }),
  bjAction: (roundId: number, action: "hit" | "stand" | "double") =>
    request<BjHand>(`/api/casino/blackjack/${roundId}/action`, {
      method: "POST", body: JSON.stringify({ action }) }),
  bjActive: () => request<{ active: BjHand | null }>("/api/casino/blackjack/active"),

  duelRules: () => request<DuelRules>("/api/casino/duel/rules"),
  duelBet: (stake: string) =>
    request<DuelResult>("/api/casino/duel/bet", { method: "POST", body: JSON.stringify({ stake }) }),
  houseStats: () => request<HouseStats>("/api/house/stats"),

  agentCustomers: () => request<Customer[]>("/api/agent/customers"),
  agentCreateCustomer: (b: { username: string; password?: string; starting_credit: string;
                             credit_limit: string; wager_limit?: string }) =>
    request<{ id: number; username: string; password: string | null;
              balance: string; credit_limit: string }>("/api/agent/customers", {
      method: "POST", body: JSON.stringify(b) }),
  agentFreePlay: (id: number, amount: string, note = "") =>
    request<{ username: string; adjusted: string; free_play: string }>(
      `/api/agent/customers/${id}/freeplay`, {
        method: "POST", body: JSON.stringify({ amount, note }) }),
  agentAdjust: (id: number, amount: string, note: string) =>
    request<{ username: string; adjusted: string; balance: string }>(
      `/api/agent/customers/${id}/adjust`, {
        method: "POST", body: JSON.stringify({ amount, note }) }),
  agentProfile: (id: number) =>
    request<{ id: number; account: string; username: string;
              display_name: string | null; notes: string; active: boolean;
              agent_id: number | null; agent: string;
              balance: string; free_play: string; pending_risk: string;
              pending_wagers: number; available: string; credit_limit: string;
              wager_limit: string; allow_sportsbook: boolean; allow_casino: boolean;
              allow_live: boolean; week_figure: string; created_at: string }>(
      `/api/agent/customers/${id}`),
  agentUpdateCustomer: (id: number, b: { active?: boolean; credit_limit?: string;
                                         wager_limit?: string; allow_sportsbook?: boolean;
                                         allow_casino?: boolean; allow_live?: boolean;
                                         display_name?: string; notes?: string;
                                         agent_id?: number; new_password?: string }) =>
    request<Customer>(`/api/agent/customers/${id}`, {
      method: "PATCH", body: JSON.stringify(b) }),
  agentWeekly: (weeks_back = 0) =>
    request<WeeklyFigures>(`/api/agent/figures/weekly?weeks_back=${weeks_back}`),
  agentBookLimits: () => request<BookLimitsShape>("/api/agent/limits/book"),
  agentUpdateBookLimits: (b: Partial<BookLimitsShape>) =>
    request<BookLimitsShape>("/api/agent/limits/book", {
      method: "PUT", body: JSON.stringify(b) }),
  agentCollections: (agent_q = "") =>
    request<{ week_start: string;
              customers: { id: number; account: string; username: string; agent: string;
                           active: boolean; settled_this_week: boolean;
                           carry: string; settle: string; this_week: string;
                           payments: string; balance: string }[];
              totals: { carry: string; settle: string; week: string;
                        payments: string; balance: string } }>(
      `/api/agent/figures/collections${agent_q ? `?agent_q=${encodeURIComponent(agent_q)}` : ""}`),
  agentSettle: (user_id: number, weeks_back: number, note: string) =>
    request<{ username: string; week_start: string; figure: string;
              balance_reset_to: string }>("/api/agent/figures/settle", {
      method: "POST", body: JSON.stringify({ user_id, weeks_back, note }) }),
  agentWagers: (status: "pending" | "graded" | "deleted" | "all") =>
    request<AgentWager[]>(`/api/agent/wagers?status=${status}`),
  agentVoidWager: (betId: number, buyout?: string) =>
    request<{ bet_id: number; status: string; refunded: string }>(
      `/api/agent/wagers/${betId}/void`, {
        method: "POST",
        ...(buyout !== undefined ? { body: JSON.stringify({ buyout }) } : {}),
      }),
  agentBilling: (days = 30) =>
    request<{ current_balance: string; days: number;
              rows: { at: string; description: string; amount: string; balance: string }[];
              note: string }>(`/api/agent/billing?days=${days}`),
  agentClosingLine: (days = 14) =>
    request<{ days: number;
              customers: { id: number; account: string; username: string;
                           points: string | null; price: number; beat_line: number;
                           total_bets: number; percentage: number; win_loss: string;
                           flagged: boolean }[];
              note: string }>(`/api/agent/analysis/closing?days=${days}`),
  agentClosingDetail: (userId: number, days = 14) =>
    request<{ username: string; account: string; days: number;
              legs: { bet_id: number; placed_at: string; event: string; market: string;
                      selection: string; placed_odds: string; closing_odds: string;
                      placed_line: string | null; closing_line: string | null;
                      cents: number; points: string | null; beat: boolean;
                      status: string }[] }>(
      `/api/agent/analysis/closing/${userId}?days=${days}`),
  agentAnalysis: () =>
    request<{ sports: { sport: string; icon: string; wagers: number; open: number;
                        staked: string; paid_out: string; book_result: string }[];
              note: string }>("/api/agent/analysis"),
  agentPerformance: () => request<Performance>("/api/agent/performance"),
  agentPerfReport: (window: string, action: string) =>
    request<{ window: string; action: string; since: string;
              customers: { id: number; account: string; username: string; agent: string;
                           active: boolean; wagers: number; volume: string;
                           figure: string; pending: string }[];
              totals: { wagers: number; volume: string; figure: string;
                        pending: string; book_figure: string } }>(
      `/api/agent/performance-report?window=${window}&action=${action}`),
  agentBulkCreate: (b: { count: number; prefix: string; start?: number;
                         agent_id?: number; credit_limit: string; wager_limit?: string }) =>
    request<{ created: number; under_agent: string; credit_limit: string;
              wager_limit: string | null;
              accounts: { account: string; username: string; password: string }[] }>(
      "/api/agent/customers/bulk", { method: "POST", body: JSON.stringify(b) }),
  agentCreateAgent: (username: string, password?: string) =>
    request<{ id: number; username: string; password: string | null }>("/api/agent/agents", {
      method: "POST", body: JSON.stringify({ username, password: password || null }) }),
  agentListAgents: () => request<SubAgent[]>("/api/agent/agents"),
  agentUpdateAgent: (id: number, b: { active?: boolean; new_password?: string }) =>
    request<{ id: number; username: string; active: boolean }>(`/api/agent/agents/${id}`, {
      method: "PATCH", body: JSON.stringify(b) }),
  agentTransactions: (p: { kind?: string; agent_q?: string; player_q?: string;
                           date_from?: string; date_to?: string; user_id?: number } = {}) =>
    request<{ rows: { id: number; at: string; agent: string; customer: string;
                      account: string; kind: string; description: string;
                      amount: string; entered_by: string }[];
              total: string }>(
      "/api/agent/transactions?" + new URLSearchParams(
        Object.fromEntries(Object.entries(p).filter(([, v]) => v)) as Record<string, string>
      ).toString()),
  agentScores: () =>
    request<{ sport: string; icon: string; league: string; home: string; away: string;
              home_score: number | null; away_score: number | null;
              status: string; period: string | null;
              starts_at: string }[]>("/api/agent/scores"),
  agentPosition: () =>
    request<{ sports: { sport: string; icon: string;
                        games: { id: number; league: string; starts_at: string;
                                 score: string | null; circled: boolean;
                                 rows: { rot: number; team: string;
                                         cells: Record<string, Record<string,
                                           { w: string; r: string; c: number }>> }[] }[] }[];
              totals: Record<string, Record<string, { w: string; r: string; c: number }>> }>(
      "/api/agent/position"),
  agentGames: () =>
    request<{ games: { id: number; sport: string; icon: string; competition: string;
                       home: string; away: string; home_rot: number; away_rot: number;
                       starts_at: string; status: string; period: string | null;
                       score: string | null;
                       circled: boolean; off_board: boolean; open_markets: number;
                       suspended_markets: number; pending_wagers: number }[];
              circled_max: string }>("/api/agent/games"),
  agentSetBoard: (id: number, open: boolean) =>
    request<{ id: number; off_board: boolean }>(`/api/agent/games/${id}/board`, {
      method: "POST", body: JSON.stringify({ open }) }),
  agentSetCircle: (id: number, circled: boolean) =>
    request<{ id: number; circled: boolean }>(`/api/agent/games/${id}/circle`, {
      method: "POST", body: JSON.stringify({ circled }) }),
  agentGradeGame: (id: number) =>
    request<{ id: number; score: string; settlement: Record<string, number> }>(
      `/api/agent/games/${id}/grade`, { method: "POST" }),
  agentGameAdmin: () =>
    request<{ scheduled_events: number; ended_events: number; open_wagers: number }>(
      "/api/agent/game-admin"),

  sbSports: () => request<SbSport[]>("/api/sportsbook/sports"),
  sbEvents: (sport?: string) =>
    request<SbEvent[]>(`/api/sportsbook/events?limit=60${sport ? `&sport=${sport}` : ""}`),
  sbQuote: (selection_ids: number[], stake: string, type = "auto", teaser_tier?: number) =>
    request<SbQuote>("/api/sportsbook/quote", {
      method: "POST", body: JSON.stringify({ selection_ids, stake, type,
        teaser_tier: teaser_tier ?? null }) }),
  sbPlace: (legs: { selection_id: number; odds: string }[], stake: string,
            accept_changes: boolean, type = "auto", teaser_tier?: number,
            free_play = false) =>
    request<{ bet_id: number; total_odds: string; potential: string; balance: string }>(
      "/api/sportsbook/bets", { method: "POST",
        body: JSON.stringify({ legs, stake, accept_changes, type,
          teaser_tier: teaser_tier ?? null, free_play }) }),
  sbMyBets: () => request<SbBet[]>("/api/sportsbook/bets"),
  sbSync: () => request<{ provider: string; events: number }>("/api/sportsbook/sync", { method: "POST" }),
  sbDrift: () =>
    request<{ prices_moved: number; lines_moved: number }>("/api/sportsbook/drift", { method: "POST" }),
  sbLiveStart: (count = 3, event_ids?: number[]) =>
    request<{ live: { id: number; home: string; away: string; period: string | null }[] }>(
      "/api/sportsbook/live/start", { method: "POST",
        body: JSON.stringify({ count, event_ids: event_ids ?? null }) }),
  sbLiveTick: () =>
    request<{ live: number; ended: number; repriced: number;
              settlement?: Record<string, number> }>(
      "/api/sportsbook/live/tick", { method: "POST" }),
  sbSimulate: (count = 6) =>
    request<{ graded: number; events: { event: string; score: string }[];
              settlement: Record<string, number> }>("/api/sportsbook/simulate", {
      method: "POST", body: JSON.stringify({ count }) }),
  sbExposure: () => request<{ positions: any[]; total_liability: string }>("/api/sportsbook/exposure"),

  rbCard: () =>
    request<{ tracks: { key: string; name: string;
                        races: { id: number; number: number; post_time: string;
                                 status: string; result: string | null;
                                 runners: { pn: number; name: string; jockey: string;
                                            ml: string; weight: string }[] }[] }[];
              limits: { min: string; max: string; max_payout_per_race: string };
              note: string }>("/api/racebook/card"),
  rbPlace: (race_id: number, kind: string, picks: number[], stake: string) =>
    request<{ bet_id: number; kind: string; picks: string; stake: string;
              potential: string; balance: string }>("/api/racebook/bets", {
      method: "POST", body: JSON.stringify({ race_id, kind, picks, stake }) }),
  rbMyBets: () =>
    request<{ bet_id: number; kind: string; status: string; track: string; race: number;
              picks: { pn: number; name: string }[]; stake: string; potential: string;
              payout: string | null; result: string | null; placed_at: string }[]>(
      "/api/racebook/bets"),

  fairness: () => request<Fairness>("/api/fairness/current"),
  rotate: (client_seed?: string) =>
    request<{ revealed: Record<string, unknown>; new: Fairness }>("/api/fairness/rotate", {
      method: "POST", body: JSON.stringify({ client_seed: client_seed || null }),
    }),
  verify: (server_seed: string, client_seed: string, nonce: number) =>
    request<{ roll: string; threshold: string; house_wins: boolean; multiplier: string;
              rule: string; server_seed_hash: string }>("/api/fairness/verify", {
      method: "POST", body: JSON.stringify({ server_seed, client_seed, nonce }),
    }),
};
