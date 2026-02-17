# Task: Fix Backend — Expanded Plan Steps Losing Rich Fields

## Problem

When the `level_3_expand` call returns from the LLM, the response JSON contains rich step data:

```json
{
  "steps": [
    {
      "title": "Create power-up spawning system",
      "description": "Randomly drops items onto the playing field at intervals",
      "substeps": ["Set up spawn timer", "Randomize item type", "Place on field"],
      "files_affected": ["server.js", "index.html"],
      "risks": ["May affect game performance with too many items"]
    }
  ]
}
```

But the `_build_response()` function in `backend/app/routes/predict.py` converts each step dict into a `PlanStep` Pydantic model that only has `n` and `text` fields. The `substeps`, `files_affected`, `risks`, `title`, and `description` fields are **silently discarded** during serialization.

The frontend mapper and rendering already support these fields (fixed in the previous prompt). The frontend receives empty `steps: []` because the backend strips everything.

## Root Cause

In `backend/app/schemas/predict.py`:

```python
class PlanStep(BaseModel):
    n: int
    text: str
```

And in `backend/app/routes/predict.py`, the `_build_response()` function builds `PlanStep` objects from the raw dict, keeping only `n` and `text`.

## Fix

### 1. `backend/app/schemas/predict.py` — Extend PlanStep with optional rich fields

```python
class PlanStep(BaseModel):
    n: int
    text: str
    title: str | None = None
    description: str | None = None
    substeps: list[str] | None = None
    files_affected: list[str] | None = None
    risks: list[str] | None = None
    alternatives: list[str] | None = None
    what_could_go_wrong: str | None = None
    estimated_lines: int | None = None
    confidence_if_skipped: str | None = None
```

This is backward-compatible — existing `level_3_plan` responses only set `n` and `text`, and the new fields default to `None`.

### 2. `backend/app/routes/predict.py` — Preserve rich fields in _build_response

In the section that builds steps from the parsed LLM response, update the PlanStep construction to include the optional fields:

```python
if "steps" in parsed:
    steps = []
    for i, step_dict in enumerate(parsed["steps"]):
        steps.append(PlanStep(
            n=step_dict.get("n", i + 1),
            text=step_dict.get("text", step_dict.get("title", step_dict.get("description", f"Step {i + 1}"))),
            title=step_dict.get("title"),
            description=step_dict.get("description"),
            substeps=step_dict.get("substeps"),
            files_affected=step_dict.get("files_affected"),
            risks=step_dict.get("risks"),
            alternatives=step_dict.get("alternatives"),
            what_could_go_wrong=step_dict.get("what_could_go_wrong"),
            estimated_lines=step_dict.get("estimated_lines"),
            confidence_if_skipped=step_dict.get("confidence_if_skipped"),
        ))
    response_kwargs["steps"] = steps
```

### 3. `PredictResponse` — Add optional commentary field

The LLM may return a `commentary` field at the top level for expand responses. Add it to PredictResponse:

```python
class PredictResponse(BaseModel):
    # ...existing fields...
    commentary: str | None = None
```

And in `_build_response`:

```python
if "commentary" in parsed:
    response_kwargs["commentary"] = parsed["commentary"]
```

## Verification

1. Start the backend locally: `cd backend && uvicorn app.main:app --reload`
2. Send a `level_3_expand` request via curl or the frontend
3. Verify the response JSON contains `substeps`, `files_affected`, `risks` inside each step
4. In DeckForge, press X on L3 — the terminal should show expanded step details (substeps, files, risks) between the "EXPANDING" header and the commentary
5. Verify `level_3_plan` still works (only `n` and `text` should be set, others null)
