"""ELO rating system for complementing the matching algorithm.

Design notes
------------
- Purely additive: ELO contributes a small ±adjustment on top of the base
  score produced by MatchingEngine.  It does NOT change MatchWeights.
- Stateless API: the /elo/update endpoint returns a new rating given
  (old_rating, reaction).  The caller (client / Supabase) is responsible
  for persisting ratings.
- Easy to remove: delete this file and remove the optional elo_* parameters
  from matching.py / api/main.py.  Base scoring is completely unaffected.

Terminology
-----------
  rating      : int — current ELO score for a project/profile (default 1000)
  reaction    : "like" | "pass" | "super_like"
  adjustment  : how much to nudge the final match score, clipped to
                ±EloConfig.max_boost
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

Reaction = Literal["like", "pass", "super_like"]

DEFAULT_RATING: int = 1000
_K_FACTOR: float = 32.0          # standard ELO K-factor


@dataclass
class EloConfig:
    """Knobs for the ELO subsystem.

    Set ``enabled = False`` to make every adjustment return 0.0 without
    touching any other logic.
    """
    enabled: bool = True
    default_rating: int = DEFAULT_RATING
    k_factor: float = _K_FACTOR
    max_boost: float = 0.05       # maximum ±adjustment applied to total_score


# ---------------------------------------------------------------------------
# Result type
# ---------------------------------------------------------------------------

@dataclass
class EloResult:
    """Outcome of a single ELO update cycle."""
    old_rating: int
    new_rating: int
    score_adjustment: float       # value already clamped to ±max_boost


# ---------------------------------------------------------------------------
# Calculator
# ---------------------------------------------------------------------------

class EloCalculator:
    """Stateless ELO calculator.

    All methods are pure functions of their arguments — no side effects,
    no stored state beyond configuration.
    """

    def __init__(self, config: EloConfig | None = None) -> None:
        self.config = config or EloConfig()

    # ------------------------------------------------------------------
    # Core ELO maths
    # ------------------------------------------------------------------

    def expected_score(self, rating_a: float, rating_b: float) -> float:
        """Standard ELO expected score for player A vs player B."""
        return 1.0 / (1.0 + 10 ** ((rating_b - rating_a) / 400.0))

    def _reaction_outcome(self, reaction: Reaction) -> float:
        """Map a user reaction to a numeric ELO outcome in [0, 1]."""
        return {"like": 0.75, "super_like": 1.0, "pass": 0.0}.get(reaction, 0.5)

    def update_rating(
        self,
        current_rating: int,
        reaction: Reaction,
        opponent_rating: int = DEFAULT_RATING,
    ) -> EloResult:
        """Compute a new ELO rating for a project/profile after a user interaction.

        Parameters
        ----------
        current_rating:
            The project's/profile's current ELO rating (integer).
        reaction:
            The user's reaction ("like", "pass", "super_like").
        opponent_rating:
            Treat the user as an "opponent" with this rating.  Defaults to
            the population mean so a single like/pass has a sensible effect.

        Returns
        -------
        EloResult with old_rating, new_rating (both int), and score_adjustment.
        """
        if not self.config.enabled:
            return EloResult(
                old_rating=current_rating,
                new_rating=current_rating,
                score_adjustment=0.0,
            )

        outcome = self._reaction_outcome(reaction)
        expected = self.expected_score(current_rating, opponent_rating)
        delta = self.config.k_factor * (outcome - expected)
        new_rating = round(current_rating + delta)

        adjustment = self.score_adjustment(new_rating)
        return EloResult(
            old_rating=current_rating,
            new_rating=new_rating,
            score_adjustment=adjustment,
        )

    # ------------------------------------------------------------------
    # Score adjustment (used by MatchingEngine)
    # ------------------------------------------------------------------

    def score_adjustment(
        self,
        rating: int | float,
        population_mean: float | None = None,
    ) -> float:
        """Convert an ELO rating into a small additive score adjustment.

        The reference point is ``population_mean`` when provided, otherwise
        ``config.default_rating`` (1000).  Using the live population mean
        ensures the adjustment is always relative to peers — so projects all
        drifting below 1200 (common with low swipe-positive rates) still
        produce a useful spread of +/- adjustments rather than all being
        negative.

        Maps symmetrically around the reference:
          • rating == reference  →  0.0
          • rating >> reference  →  +max_boost
          • rating << reference  →  −max_boost

        Uses a sigmoid so extreme ratings don't produce wild adjustments.
        """
        if not self.config.enabled:
            return 0.0

        reference = population_mean if population_mean is not None else self.config.default_rating
        spread = 400.0          # ±400 ELO above/below reference ≈ ±max_boost
        x = (rating - reference) / spread
        x = max(-50.0, min(50.0, x))   # clamp before exponentiation to avoid overflow
        # sigmoid centred at 0: result in (0, 1)
        sigmoid = 1.0 / (1.0 + 10 ** (-x))
        # map (0, 1) → (−max_boost, +max_boost)
        adjustment = self.config.max_boost * (2.0 * sigmoid - 1.0)
        return float(max(-self.config.max_boost, min(self.config.max_boost, adjustment)))


# ---------------------------------------------------------------------------
# Module-level singleton
# ---------------------------------------------------------------------------

_calculator_instance: EloCalculator | None = None


def get_elo_calculator(config: EloConfig | None = None) -> EloCalculator:
    """Return (or lazily create) the module-level EloCalculator singleton."""
    global _calculator_instance
    if _calculator_instance is None:
        _calculator_instance = EloCalculator(config)
    elif config is not None:
        _calculator_instance.config = config
    return _calculator_instance
