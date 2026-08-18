from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # swap for postgresql+asyncpg://user:pass@host/db with no other code changes
    database_url: str = "sqlite+aiosqlite:///./lucky777.db"
    jwt_secret: str = "dev-secret-change-me"
    jwt_algorithm: str = "HS256"
    access_token_minutes: int = 60 * 24 * 7

    signup_bonus_credits: str = "1000"

    # ---- First-boot bootstrap for hosts without a shell (Render, Railway...).
    # Set both and the master agent is created on startup if it doesn't exist;
    # leave them empty and nothing is created (use `python -m app.cli`).
    admin_username: str = ""
    admin_password: str = ""
    # load the sportsbook feed automatically when the events table is empty --
    # this is the game board itself, not demo customers or fake action
    autoload_feed: int = 1

    # what a customer's balance returns to when their week is settled.
    # 0 = the classic credit book: squaring up brings everyone back to even.
    customer_baseline_credits: str = "0"

    # the day the betting week STARTS (payout day). Payouts on Tuesday means
    # the week runs Tuesday through Monday and figures close Monday night.
    # monday | tuesday | wednesday | thursday | friday | saturday | sunday
    week_start_day: str = "tuesday"

    max_bet_credits: str = "1000"
    # max stake on any wager touching a circled game
    circled_max_credits: str = "50"
    min_bet_credits: str = "0.01"

    # ---- Duel: head-to-head against the house account.
    # Both numbers are surfaced in the UI and in /api/casino/duel/rules.
    # RTP = (1 - house_win_prob) * payout_multiplier -> 0.37 * 2.0 = 74%.
    duel_house_win_prob: str = "0.63"
    duel_payout_multiplier: str = "2.0"

    # ---- Sportsbook. Defaults to the offline fixture feed so the book is full
    # with no signup. Set odds_provider=the_odds_api + odds_api_key for live prices.

    odds_provider: str = "fixture"
    odds_api_key: str = ""
    fixture_events_per_competition: int = 3
    sportsbook_max_legs: int = 8

    # ---- Racebook: play-money card, morning-line derived payouts.
    racebook_min_credits: str = "1"
    racebook_max_credits: str = "200"
    racebook_max_payout_credits: str = "3000"

    # ---- Live engine. Simulated in-play games until a real live feed is wired
    # in: scores advance every tick, moneyline reprices, derivatives suspend at
    # kickoff, and the game grades itself at full time.
    live_autotick: int = 1          # 0 = only ticks when the master hits the button
    live_tick_seconds: int = 20
    # real-feed cadence, sized for the 100k-credit plan: live scores every 60s
    # but only for sports that actually have a game in play (1 credit each),
    # finals swept every 5 minutes (2 credits each), and the pregame board
    # re-synced every 30 minutes. A busy evening runs ~2-3k credits/day.
    live_scores_poll_seconds: int = 60
    finals_sweep_seconds: int = 300
    board_sync_minutes: int = 30      # 0 = only re-sync from Game Admin
    odds_regions: str = "us"          # each extra region multiplies odds-call cost
    odds_max_sports: int = 50         # effectively every active sport
    featured_sync_minutes: int = 10   # majors refresh cadence (NFL/MLB/NBA/NHL...)
    live_total_steps: int = 18      # ~6 minutes of real time per game at 20s ticks

    class Config:
        env_prefix = "LUCKY777_"


settings = Settings()
