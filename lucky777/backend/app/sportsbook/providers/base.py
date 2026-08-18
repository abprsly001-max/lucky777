"""Provider interface.

Wrap the feed from day one. You will change odds providers -- when you do, that
change must not reach the domain model. Provider IDs go in `events.provider_id`
as a mapping column; they never become your primary keys.
"""
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime
from decimal import Decimal


@dataclass
class ProviderSelection:
    key: str            # home | draw | away | over | under | yes | no
    name: str
    odds: Decimal


@dataclass
class ProviderMarket:
    type: str           # h2h | totals | spreads | btts | double_chance
    name: str
    selections: list[ProviderSelection]
    line: str | None = None


@dataclass
class ProviderCompetition:
    key: str
    name: str
    sport_key: str
    sport_name: str
    country: str = ""
    icon: str = ""


@dataclass
class ProviderEvent:
    provider_id: str
    competition: ProviderCompetition
    home: str
    away: str
    starts_at: datetime
    markets: list[ProviderMarket] = field(default_factory=list)
    status: str = "scheduled"
    home_score: int | None = None
    away_score: int | None = None


class OddsProvider(ABC):
    name: str = "abstract"

    @abstractmethod
    async def fetch_events(self) -> list[ProviderEvent]:
        """Upcoming events with their current prices."""

    async def fetch_results(self, provider_ids: list[str]) -> dict[str, tuple[int, int]]:
        """Final scores keyed by provider_id. Default: nothing settled yet."""
        return {}
