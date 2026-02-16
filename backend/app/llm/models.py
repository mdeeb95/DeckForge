"""Model tier mapping per docs/deckforge-prediction-engine.md section 6.5."""
from __future__ import annotations

from dataclasses import dataclass


@dataclass
class ModelConfig:
    provider: str
    model_id: str
    max_tokens: int
    temperature: float


# ─── Model Tiers ──────────────────────────────────────────────────────────────

FAST_MODELS: dict[str, ModelConfig] = {
    "anthropic": ModelConfig("anthropic", "claude-haiku-4-5-20251001", 1500, 0.8),
    "openai": ModelConfig("openai", "gpt-4o-mini", 1500, 0.8),
    "google": ModelConfig("google", "gemini-2.0-flash", 1500, 0.8),
}

MID_MODELS: dict[str, ModelConfig] = {
    "anthropic": ModelConfig("anthropic", "claude-sonnet-4-5-20250929", 2000, 0.7),
    "openai": ModelConfig("openai", "gpt-4o", 2000, 0.7),
    "google": ModelConfig("google", "gemini-2.0-pro", 2000, 0.7),
}

# ─── Call Type → Tier Mapping ─────────────────────────────────────────────────

CALL_TYPE_TIER: dict[str, str] = {
    "level_2_feature": "fast",
    "level_2_bug": "mid",
    "level_2_tech_debt": "fast",
    "level_3_plan": "mid",
    "level_3_expand": "mid",
    "exploration": "fast",
    "qa_analysis": "mid",
    "deploy_preflight": "mid",
    "empty_state": "fast",
}


def get_model_for_call(
    call_type: str,
    provider: str,
    model_override: str | None = None,
) -> ModelConfig:
    """Get the appropriate model config for a call type and provider."""
    if provider == "mock":
        return ModelConfig("mock", "mock", 1500, 0.8)

    if model_override:
        # User overrides the model entirely
        tier = CALL_TYPE_TIER.get(call_type, "fast")
        base = FAST_MODELS.get(provider, FAST_MODELS["anthropic"])
        return ModelConfig(provider, model_override, base.max_tokens, base.temperature)

    tier = CALL_TYPE_TIER.get(call_type, "fast")
    tier_models = FAST_MODELS if tier == "fast" else MID_MODELS
    return tier_models.get(provider, FAST_MODELS["anthropic"])


# ─── Cost Estimation ──────────────────────────────────────────────────────────

# Approximate cost per 1K tokens (input, output)
COST_PER_1K_TOKENS: dict[str, tuple[float, float]] = {
    # Anthropic
    "claude-haiku-4-5-20251001": (0.0008, 0.004),
    "claude-sonnet-4-5-20250929": (0.003, 0.015),
    # OpenAI
    "gpt-4o-mini": (0.00015, 0.0006),
    "gpt-4o": (0.0025, 0.01),
    # Google
    "gemini-2.0-flash": (0.0001, 0.0004),
    "gemini-2.0-pro": (0.00125, 0.005),
}


def estimate_cost(model_id: str, input_tokens: int, output_tokens: int) -> float:
    """Estimate the cost of an LLM call in USD."""
    rates = COST_PER_1K_TOKENS.get(model_id, (0.001, 0.005))
    return (input_tokens / 1000 * rates[0]) + (output_tokens / 1000 * rates[1])
