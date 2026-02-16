"""Multi-provider LLM client. Supports Anthropic, OpenAI, and Google Gemini."""

import json
import time
import logging
from dataclasses import dataclass

import httpx

from app.config import get_settings
from .models import ModelConfig

logger = logging.getLogger(__name__)


@dataclass
class LLMResponse:
    content: str
    model: str
    input_tokens: int
    output_tokens: int
    latency_ms: int


class LLMClient:
    def __init__(self):
        self.settings = get_settings()
        self._http = httpx.AsyncClient(timeout=30.0)

    async def call(self, prompt: str, model_config: ModelConfig) -> LLMResponse:
        """Route to the correct provider."""
        provider = model_config.provider

        if provider == "anthropic":
            return await self._call_anthropic(prompt, model_config)
        elif provider == "openai":
            return await self._call_openai(prompt, model_config)
        elif provider == "google":
            return await self._call_google(prompt, model_config)
        elif provider == "mock":
            return await self._call_mock(prompt, model_config)
        else:
            raise ValueError(f"Unknown provider: {provider}")

    async def call_with_retry(
        self,
        prompt: str,
        model_config: ModelConfig,
        max_retries: int = 1,
    ) -> LLMResponse:
        """Call with retry on failure."""
        last_error = None
        for attempt in range(max_retries + 1):
            try:
                return await self.call(prompt, model_config)
            except Exception as e:
                last_error = e
                logger.warning(f"LLM call attempt {attempt + 1} failed: {e}")
                if attempt < max_retries:
                    continue
        raise last_error  # type: ignore[misc]

    # ─── Anthropic ────────────────────────────────────────────────────────────

    async def _call_anthropic(self, prompt: str, config: ModelConfig) -> LLMResponse:
        api_key = self.settings.anthropic_api_key
        if not api_key:
            raise ValueError("ANTHROPIC_API_KEY not set")

        start = time.monotonic()
        response = await self._http.post(
            "https://api.anthropic.com/v1/messages",
            headers={
                "x-api-key": api_key,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            },
            json={
                "model": config.model_id,
                "max_tokens": config.max_tokens,
                "temperature": config.temperature,
                "messages": [{"role": "user", "content": prompt}],
            },
        )
        latency = int((time.monotonic() - start) * 1000)
        response.raise_for_status()

        data = response.json()
        content = data["content"][0]["text"]
        usage = data.get("usage", {})

        return LLMResponse(
            content=content,
            model=config.model_id,
            input_tokens=usage.get("input_tokens", 0),
            output_tokens=usage.get("output_tokens", 0),
            latency_ms=latency,
        )

    # ─── OpenAI ───────────────────────────────────────────────────────────────

    async def _call_openai(self, prompt: str, config: ModelConfig) -> LLMResponse:
        api_key = self.settings.openai_api_key
        if not api_key:
            raise ValueError("OPENAI_API_KEY not set")

        start = time.monotonic()
        response = await self._http.post(
            "https://api.openai.com/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": config.model_id,
                "max_tokens": config.max_tokens,
                "temperature": config.temperature,
                "messages": [{"role": "user", "content": prompt}],
                "response_format": {"type": "json_object"},
            },
        )
        latency = int((time.monotonic() - start) * 1000)
        response.raise_for_status()

        data = response.json()
        content = data["choices"][0]["message"]["content"]
        usage = data.get("usage", {})

        return LLMResponse(
            content=content,
            model=config.model_id,
            input_tokens=usage.get("prompt_tokens", 0),
            output_tokens=usage.get("completion_tokens", 0),
            latency_ms=latency,
        )

    # ─── Google Gemini ────────────────────────────────────────────────────────

    async def _call_google(self, prompt: str, config: ModelConfig) -> LLMResponse:
        api_key = self.settings.google_api_key
        if not api_key:
            raise ValueError("GOOGLE_API_KEY not set")

        start = time.monotonic()
        response = await self._http.post(
            f"https://generativelanguage.googleapis.com/v1beta/models/{config.model_id}:generateContent",
            params={"key": api_key},
            headers={"Content-Type": "application/json"},
            json={
                "contents": [{"parts": [{"text": prompt}]}],
                "generationConfig": {
                    "temperature": config.temperature,
                    "maxOutputTokens": config.max_tokens,
                    "responseMimeType": "application/json",
                },
            },
        )
        latency = int((time.monotonic() - start) * 1000)
        response.raise_for_status()

        data = response.json()
        content = data["candidates"][0]["content"]["parts"][0]["text"]
        usage_meta = data.get("usageMetadata", {})

        return LLMResponse(
            content=content,
            model=config.model_id,
            input_tokens=usage_meta.get("promptTokenCount", 0),
            output_tokens=usage_meta.get("candidatesTokenCount", 0),
            latency_ms=latency,
        )

    # ─── Mock (no API key) ────────────────────────────────────────────────────

    async def _call_mock(self, prompt: str, config: ModelConfig) -> LLMResponse:
        """Return mock responses when no API key is configured."""
        import asyncio
        await asyncio.sleep(0.1)

        # Detect call type from prompt content and return appropriate mock
        prompt_lower = prompt.lower()
        if "bug" in prompt_lower and ("8 potential bugs" in prompt_lower or "bug detection" in prompt_lower):
            content = MOCK_BUG_RESPONSE
        elif "tech debt" in prompt_lower and ("8 cleanup" in prompt_lower or "code quality" in prompt_lower):
            content = MOCK_TECH_DEBT_RESPONSE
        elif "plan generator" in prompt_lower or "implementation plan" in prompt_lower:
            content = MOCK_PLAN_RESPONSE
        else:
            content = MOCK_FEATURE_RESPONSE

        return LLMResponse(
            content=content,
            model="mock",
            input_tokens=500,
            output_tokens=400,
            latency_ms=100,
        )

    async def close(self):
        await self._http.aclose()


# ─── Mock Responses ───────────────────────────────────────────────────────────

MOCK_FEATURE_RESPONSE = json.dumps({
    "header_quip": "your app has potential — let's unlock it",
    "suggestions": [
        {"label": "Add Search and Filter", "quip": "your users are ctrl+F-ing in their heads", "scope": "decent chunk", "rationale": "No search functionality detected."},
        {"label": "Add Dark Mode", "quip": "save the retinas, save the world", "scope": "decent chunk", "rationale": "No theme system detected."},
        {"label": "Keyboard Shortcuts", "quip": "power users will love you", "scope": "quick tweak", "rationale": "No keyboard handlers detected."},
        {"label": "Export to Markdown", "quip": "because copy-paste is so 2008", "scope": "quick tweak", "rationale": "Markdown exists but no export."},
        {"label": "Drag and Drop Sorting", "quip": "let them rearrange the furniture", "scope": "decent chunk", "rationale": "No ordering mechanism."},
        {"label": "Real-Time Collaboration", "quip": "google docs energy", "scope": "strap in", "rationale": "No sync mechanism."},
        {"label": "Undo/Redo System", "quip": "everyone deserves a second chance", "scope": "decent chunk", "rationale": "No undo stack detected."},
        {"label": "Auto-Save Indicators", "quip": "trust issues? fixed.", "scope": "quick tweak", "rationale": "No save indicator."},
    ],
    "modifier": {"lens": "more ambitious", "quip": "go big or go home"},
    "wild_card": {"label": "AI Note Summaries", "quip": "your notes but smarter than you", "scope": "strap in", "rationale": "LLM-powered summarization."},
})

MOCK_BUG_RESPONSE = json.dumps({
    "header_quip": "let's hunt some bugs",
    "suggestions": [
        {"label": "Empty State Crash", "quip": "nothing breaks like nothing", "scope": "quick tweak", "symptom": "App crashes when list is empty.", "rationale": "No empty state handling."},
        {"label": "Long Text Overflow", "quip": "words go brrr off screen", "scope": "quick tweak", "symptom": "Long titles push buttons off screen.", "rationale": "No text truncation."},
        {"label": "Double Submit", "quip": "speed demons create duplicates", "scope": "quick tweak", "symptom": "Fast clicks create duplicate entries.", "rationale": "No debounce."},
        {"label": "Stale Data on Tab Switch", "quip": "short-term memory loss", "scope": "decent chunk", "symptom": "Old data shown after tab switch.", "rationale": "No visibility listener."},
        {"label": "Broken Back Button", "quip": "no going back literally", "scope": "decent chunk", "symptom": "Browser back doesn't work.", "rationale": "No history API."},
        {"label": "Memory Leak", "quip": "RAM filing for divorce", "scope": "decent chunk", "symptom": "App gets slower over time.", "rationale": "Event listener cleanup missing."},
        {"label": "XSS in Input", "quip": "script tags lurking", "scope": "quick tweak", "symptom": "HTML input could execute scripts.", "rationale": "No input sanitization."},
        {"label": "Race Condition", "quip": "fastest save wins", "scope": "decent chunk", "symptom": "Quick edits sometimes lost.", "rationale": "Concurrent saves."},
    ],
    "modifier": {"lens": "security focused", "quip": "what would a hacker do?"},
    "wild_card": {"label": "Timezone Apocalypse", "quip": "dates are wrong somewhere", "scope": "decent chunk", "symptom": "Wrong dates in other timezones.", "rationale": "No UTC handling."},
})

MOCK_TECH_DEBT_RESPONSE = json.dumps({
    "header_quip": "time to pay down the technical credit card",
    "suggestions": [
        {"label": "Add Unit Tests", "quip": "future-you sends thanks", "scope": "decent chunk", "rationale": "0 test files.", "evidence": "No test directory."},
        {"label": "Extract Components", "quip": "DRY your code DRY your tears", "scope": "decent chunk", "rationale": "Duplicated UI patterns.", "evidence": "4 files with similar buttons."},
        {"label": "Error Boundaries", "quip": "catch before users catch on", "scope": "quick tweak", "rationale": "No error boundaries.", "evidence": "Missing React error boundaries."},
        {"label": "Type Safety", "quip": "any is a cry for help", "scope": "decent chunk", "rationale": "Untyped API calls.", "evidence": "Raw fetch without types."},
        {"label": "Split Large Files", "quip": "App.tsx is not a novel", "scope": "decent chunk", "rationale": "Files over 300 lines.", "evidence": "App.tsx has 387 lines."},
        {"label": "Loading States", "quip": "spinners beat staring", "scope": "quick tweak", "rationale": "No loading indicators.", "evidence": "No spinner component."},
        {"label": "CI Pipeline", "quip": "automate the boring stuff", "scope": "quick tweak", "rationale": "No CI config.", "evidence": "No .github/workflows."},
        {"label": "Accessibility Audit", "quip": "works for everyone", "scope": "decent chunk", "rationale": "No ARIA labels.", "evidence": "Missing aria attributes."},
    ],
    "modifier": {"lens": "make it testable", "quip": "tests are love letters to future you"},
    "wild_card": {"label": "Rewrite in Rust", "quip": "blazingly fast memory safety", "scope": "strap in", "rationale": "Hot path as WASM module."},
})

MOCK_PLAN_RESPONSE = json.dumps({
    "summary": "Add search and filtering to the notes list",
    "quip": "making needle-in-haystack a solved problem",
    "steps": [
        {"n": 1, "text": "Create a SearchInput component with debounced onChange"},
        {"n": 2, "text": "Add a filtering hook for fuzzy text matching"},
        {"n": 3, "text": "Wire up an active-only toggle with state management"},
        {"n": 4, "text": "Update the list view to use filtered results"},
        {"n": 5, "text": "Add tests for search and filter logic"},
    ],
    "scope": "decent chunk",
    "confidence": "high",
    "unhinged_modifier": "Also add confetti when search finds a match, and a dramatic 'no results' animation.",
    "claude_code_intent": "Add search and filtering to the notes list. Users should be able to fuzzy-search by title and content, and toggle a filter for active items. Use debounced input for performance.",
})
