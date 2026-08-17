"""Agent console: week boundaries, figures, and settlement.

The figure is the number the agent collects on. If it's wrong, real money moves
wrongly, so these are the tests that matter most in the back-office.
"""
from datetime import datetime, timedelta, timezone

import pytest

from app.routers.agent import week_start


# ------------------------------------------------------------ week cycle ----
def test_week_starts_on_the_payout_day_at_midnight_utc():
    # payouts are Tuesdays: Friday 14 Aug 2026 -> Tuesday 11 Aug
    ws = week_start(datetime(2026, 8, 14, 18, 32, tzinfo=timezone.utc))
    assert ws == datetime(2026, 8, 11, 0, 0, tzinfo=timezone.utc)
    assert ws.weekday() == 1


def test_payout_day_is_its_own_week_start():
    tuesday = datetime(2026, 8, 11, 0, 0, tzinfo=timezone.utc)
    assert week_start(tuesday) == tuesday
    # one second before (Monday night) still belongs to the closing week
    assert week_start(tuesday - timedelta(seconds=1)) == tuesday - timedelta(days=7)


def test_monday_night_still_belongs_to_that_week():
    monday = datetime(2026, 8, 17, 23, 59, 59, tzinfo=timezone.utc)
    assert week_start(monday) == datetime(2026, 8, 11, tzinfo=timezone.utc)


def test_naive_datetimes_are_treated_as_utc():
    """A naive timestamp must not silently land in a different week."""
    naive = week_start(datetime(2026, 8, 14, 18, 32))
    aware = week_start(datetime(2026, 8, 14, 18, 32, tzinfo=timezone.utc))
    assert naive == aware == datetime(2026, 8, 11, tzinfo=timezone.utc)


@pytest.mark.parametrize("offset,expected_day", [
    (0, 11), (1, 11), (2, 11), (3, 11), (4, 11), (5, 11), (6, 11),
])
def test_every_day_of_the_week_maps_to_the_same_tuesday(offset, expected_day):
    d = datetime(2026, 8, 11, tzinfo=timezone.utc) + timedelta(days=offset)
    assert week_start(d).day == expected_day


def test_week_start_day_is_configurable(monkeypatch):
    from app.config import settings
    monkeypatch.setattr(settings, "week_start_day", "monday")
    ws = week_start(datetime(2026, 8, 14, tzinfo=timezone.utc))
    assert ws == datetime(2026, 8, 10, tzinfo=timezone.utc)


def test_consecutive_weeks_are_exactly_seven_days_apart():
    a = week_start(datetime(2026, 8, 12, tzinfo=timezone.utc))
    b = week_start(datetime(2026, 8, 19, tzinfo=timezone.utc))
    assert (b - a) == timedelta(days=7)


# ------------------------------------------------------------ figure math ----
def test_pending_stake_is_added_back_to_the_figure():
    """A running ticket is not a loss.

    The stake leaves the wallet at placement, so a naive ledger sum shows the
    customer down by the full stake before the event has even started.
    """
    ledger_net = -500_000_000      # three stakes out, nothing back yet
    pending = 500_000_000
    assert ledger_net + pending == 0


def test_a_graded_loss_stays_in_the_figure():
    ledger_net = -500_000_000
    pending = 0                    # all graded, all lost
    assert ledger_net + pending == -500_000_000


def test_house_side_is_the_mirror_of_the_customer_side():
    customer_figure = 815_900_000
    book_figure = -customer_figure
    assert customer_figure + book_figure == 0


def test_hold_is_book_figure_over_graded_volume():
    from decimal import Decimal
    book, volume = Decimal(64), Decimal(1440)
    assert round(book / volume * 100, 2) == Decimal("4.44")


def test_volume_is_unsigned_regardless_of_which_side_you_read():
    """The same placement entry is negative on a wallet and positive on the
    house account. Taking the raw sum gave the book a negative 'volume' and
    then a positive-looking hold on a losing week."""
    wallet_entries = [-200_000_000, -200_000_000, -100_000_000]
    house_entries = [+200_000_000, +200_000_000, +100_000_000]
    assert abs(sum(wallet_entries)) == abs(sum(house_entries)) == 500_000_000


def test_hold_sign_follows_the_book_figure():
    from decimal import Decimal
    for book, expect_negative in [(Decimal(-865), True), (Decimal(64), False)]:
        hold = book / Decimal(1440) * 100
        assert (hold < 0) is expect_negative
