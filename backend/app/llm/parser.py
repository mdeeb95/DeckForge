"""Response parsing and validation per docs/deckforge-prediction-engine.md section 4."""
from __future__ import annotations

import json
import re
import logging

logger = logging.getLogger(__name__)

VALID_SCOPES = {"quick tweak", "decent chunk", "strap in"}
STOP_WORDS = {"a", "an", "the", "and", "or", "but", "in", "on", "at", "to", "for", "of", "with", "is", "it"}


def parse_json_response(raw: str) -> dict | None:
    """Extract and parse JSON from LLM response. Handles markdown code fences."""
    text = raw.strip()

    # Strip markdown code fences if present
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*\n?", "", text)
        text = re.sub(r"\n?```\s*$", "", text)

    try:
        return json.loads(text)
    except json.JSONDecodeError as e:
        logger.warning(f"JSON parse error: {e}")

        # Try to find JSON object in the text
        match = re.search(r"\{.*\}", text, re.DOTALL)
        if match:
            try:
                return json.loads(match.group())
            except json.JSONDecodeError:
                pass

    return None


def validate_level2_response(data: dict, call_type: str) -> list[str]:
    """Validate a Level 2 prediction response. Returns list of errors (empty = valid)."""
    errors = []

    if "header_quip" not in data:
        errors.append("missing header_quip")

    suggestions = data.get("suggestions", [])
    if not isinstance(suggestions, list):
        errors.append("suggestions is not a list")
        return errors

    if len(suggestions) != 8:
        errors.append(f"suggestions has {len(suggestions)} items, expected 8")

    for i, s in enumerate(suggestions):
        if not isinstance(s, dict):
            errors.append(f"suggestion[{i}] is not a dict")
            continue

        if "label" not in s:
            errors.append(f"suggestion[{i}] missing label")
        elif len(s["label"].split()) > 6:
            errors.append(f"suggestion[{i}] label exceeds 6 words")

        if "quip" not in s:
            errors.append(f"suggestion[{i}] missing quip")
        elif len(s.get("quip", "")) > 60:
            errors.append(f"suggestion[{i}] quip exceeds 60 chars")

        if "scope" in s and s["scope"] not in VALID_SCOPES:
            errors.append(f"suggestion[{i}] invalid scope: {s['scope']}")

    # Check wild_card
    if "wild_card" not in data:
        errors.append("missing wild_card")
    elif isinstance(data["wild_card"], dict):
        wc = data["wild_card"]
        if "label" not in wc:
            errors.append("wild_card missing label")

    # Check modifier
    if "modifier" not in data:
        errors.append("missing modifier")

    # Diversity check: no two labels share >50% words
    if len(suggestions) >= 2:
        labels = [s.get("label", "") for s in suggestions if isinstance(s, dict)]
        for i in range(len(labels)):
            for j in range(i + 1, len(labels)):
                if _jaccard_similarity(labels[i], labels[j]) > 0.5:
                    errors.append(f"suggestions [{i}] and [{j}] too similar: '{labels[i]}' vs '{labels[j]}'")

    # Y-is-different check
    if "wild_card" in data and isinstance(data["wild_card"], dict):
        wc_label = data["wild_card"].get("label", "")
        labels = [s.get("label", "") for s in suggestions if isinstance(s, dict)]
        for i, label in enumerate(labels):
            if _jaccard_similarity(wc_label, label) > 0.3:
                errors.append(f"wild_card too similar to suggestion[{i}]")

    return errors


def validate_plan_response(data: dict) -> list[str]:
    """Validate a Level 3 plan response. Returns list of errors."""
    errors = []

    if "summary" not in data:
        errors.append("missing summary")

    steps = data.get("steps", [])
    if not isinstance(steps, list):
        errors.append("steps is not a list")
    elif not (3 <= len(steps) <= 8):
        errors.append(f"steps has {len(steps)} items, expected 3-8")

    if "scope" not in data:
        errors.append("missing scope")
    elif data["scope"] not in VALID_SCOPES:
        errors.append(f"invalid scope: {data['scope']}")

    if "claude_code_intent" not in data or not data.get("claude_code_intent"):
        errors.append("missing or empty claude_code_intent")

    # claude_code_intent should not contain file paths
    intent = data.get("claude_code_intent", "")
    if re.search(r"(?:src/|\.tsx?|\.jsx?|\.py|\.rs)\b", intent):
        errors.append("claude_code_intent contains file paths (should be intent-level only)")

    if "unhinged_modifier" not in data or not data.get("unhinged_modifier"):
        errors.append("missing or empty unhinged_modifier")

    return errors


def _jaccard_similarity(a: str, b: str) -> float:
    """Word-level Jaccard similarity, ignoring stop words."""
    words_a = {w.lower() for w in a.split() if w.lower() not in STOP_WORDS}
    words_b = {w.lower() for w in b.split() if w.lower() not in STOP_WORDS}

    if not words_a or not words_b:
        return 0.0

    intersection = words_a & words_b
    union = words_a | words_b
    return len(intersection) / len(union)
