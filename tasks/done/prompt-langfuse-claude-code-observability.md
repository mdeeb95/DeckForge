# Task: Langfuse Observability for Claude Code Sessions

## Context
The prediction engine (FastAPI backend) already logs to Langfuse: every `prediction_call` trace and `user_feedback` score flows through `backend/app/llm/langfuse_logger.py`. But the Claude Code subprocess — the actual coding agent — has **zero observability**. We can't answer:

- How long did each Claude Code session take?
- How much did it cost?
- How many turns / tool calls did it use?
- What was the prompt vs the result?
- Did the user interrupt or let it complete?
- Was it a normal Ship It or Unhinged?

This task adds a lightweight reporting step: when a Claude Code session **completes** (success, failure, or interrupt), the frontend sends a summary event to the backend, which logs it to Langfuse as a new trace type.

This is NOT real-time streaming to Langfuse — it's a single POST after the session ends.

## Architecture

```
AIWorkingScreen.svelte
  └─ on result event or interrupt
       └─ POST /api/v1/claude-session  (new endpoint)
            └─ langfuse_logger.log_claude_session_trace()  (new function)
```

## Files to Modify

### 1. `src/lib/claude/types.ts`

Add a new interface for the session report:

```typescript
export interface ClaudeSessionReport {
  session_id: string;
  prompt: string;
  result: string;
  is_error: boolean;
  was_interrupted: boolean;
  was_unhinged: boolean;
  duration_ms: number;
  duration_api_ms: number;
  num_turns: number;
  cost_usd: number;
  total_cost_usd: number;
  input_tokens: number;
  output_tokens: number;
  tools_used: string[];       // unique tool names from tool_use events
  files_affected: string[];   // unique file paths from tool_use Read/Write/Edit inputs
  project_path: string;
  prediction_trace_id?: string; // links back to the prediction that generated this plan
}
```

### 2. `src/lib/screens/AIWorkingScreen.svelte`

**Collect data during streaming.** Already tracks `toolEvents` — extend to also track:

```typescript
let toolNames = $state<Set<string>>(new Set());
let filesAffected = $state<Set<string>>(new Set());
let sessionPrompt = $state('');
let wasUnhinged = $state(false);
let startTime = $state(0);
```

**On mount**, after consuming the pending prompt:
```typescript
sessionPrompt = prompt;
wasUnhinged = prompt.includes('\n\nALSO:'); // unhinged modifier signature
startTime = Date.now();
```

**In the onOutput handler**, for tool_use events:
```typescript
if (event.type === 'tool_use') {
  toolNames.add(event.tool_name);
  // Extract file paths from tool inputs
  const input = event.tool_input;
  if (input.file_path) filesAffected.add(input.file_path as string);
  if (input.path) filesAffected.add(input.path as string);
}
```

**On result event (line 79)**, after updating status, send the report:
```typescript
if (event.type === 'result') {
  // ... existing status updates ...

  // Send session report to backend
  reportClaudeSession({
    session_id: event.session_id,
    prompt: sessionPrompt,
    result: event.result,
    is_error: event.is_error,
    was_interrupted: false,
    was_unhinged: wasUnhinged,
    duration_ms: event.duration_ms,
    duration_api_ms: event.duration_api_ms,
    num_turns: event.num_turns,
    cost_usd: event.cost_usd ?? 0,
    total_cost_usd: event.total_cost_usd ?? 0,
    input_tokens: event.usage?.input_tokens ?? 0,
    output_tokens: event.usage?.output_tokens ?? 0,
    tools_used: [...toolNames],
    files_affected: [...filesAffected],
    project_path: get(projectConfig)?.project.path ?? '.',
    prediction_trace_id: get(currentPlan)?.trace_id ?? undefined,
  });
}
```

**On interrupt**, send a partial report:
```typescript
function handleInterrupt() {
  const elapsed = Date.now() - startTime;
  reportClaudeSession({
    session_id: getSessionState().sessionId ?? '',
    prompt: sessionPrompt,
    result: 'User interrupted',
    is_error: false,
    was_interrupted: true,
    was_unhinged: wasUnhinged,
    duration_ms: elapsed,
    duration_api_ms: 0,
    num_turns: toolEvents.length,
    cost_usd: 0,
    total_cost_usd: 0,
    input_tokens: 0,
    output_tokens: 0,
    tools_used: [...toolNames],
    files_affected: [...filesAffected],
    project_path: get(projectConfig)?.project.path ?? '.',
    prediction_trace_id: get(currentPlan)?.trace_id ?? undefined,
  });

  interrupt();
  navigate('level1');
}
```

### 3. New file: `src/lib/prediction/sessionReporter.ts`

Fire-and-forget POST to the backend:

```typescript
import type { ClaudeSessionReport } from '../claude/types';
import { getBackendUrl } from './client'; // or wherever the base URL helper lives

export async function reportClaudeSession(report: ClaudeSessionReport): Promise<void> {
  try {
    const url = `${getBackendUrl()}/api/v1/claude-session`;
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(report),
    });
  } catch (error) {
    // Fire and forget — don't block the UI for observability
    console.warn('[sessionReporter] Failed to report session:', error);
  }
}
```

### 4. `backend/app/routes/predict.py` (or new file `backend/app/routes/claude_session.py`)

New endpoint:

```python
from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional

router = APIRouter()

class ClaudeSessionReport(BaseModel):
    session_id: str
    prompt: str
    result: str
    is_error: bool
    was_interrupted: bool
    was_unhinged: bool
    duration_ms: int
    duration_api_ms: int
    num_turns: int
    cost_usd: float
    total_cost_usd: float
    input_tokens: int
    output_tokens: int
    tools_used: list[str]
    files_affected: list[str]
    project_path: str
    prediction_trace_id: Optional[str] = None

@router.post("/api/v1/claude-session")
async def log_claude_session(report: ClaudeSessionReport):
    from app.llm.langfuse_logger import log_claude_session_trace
    log_claude_session_trace(report)
    return {"status": "ok"}
```

Register this router in `backend/app/main.py`.

### 5. `backend/app/llm/langfuse_logger.py`

Add a new function following the existing pattern:

```python
def log_claude_session_trace(report) -> None:
    """Log a Claude Code session as a Langfuse trace.

    Creates:
      - A trace named 'claude_code_session' with full session metadata
      - A span for the execution duration
      - Scores for cost, turns, and duration
    """
    langfuse = _get_langfuse()
    if langfuse is None:
        return

    try:
        trace_id = f"cc-{report.session_id}" if report.session_id else f"cc-{_context_hash(report.prompt)}"

        trace = langfuse.trace(
            id=trace_id,
            name="claude_code_session",
            input={"prompt": report.prompt[:500]},  # truncate for storage
            output={
                "result": report.result[:500],
                "is_error": report.is_error,
                "was_interrupted": report.was_interrupted,
            },
            metadata={
                "was_unhinged": report.was_unhinged,
                "num_turns": report.num_turns,
                "tools_used": report.tools_used,
                "files_affected": report.files_affected[:20],  # cap at 20
                "project_path": report.project_path,
                "prediction_trace_id": report.prediction_trace_id,
            },
        )

        # Score: cost
        if report.cost_usd > 0:
            langfuse.score(
                trace_id=trace_id,
                name="session_cost_usd",
                value=report.cost_usd,
                data_type="NUMERIC",
            )

        # Score: duration
        langfuse.score(
            trace_id=trace_id,
            name="session_duration_ms",
            value=float(report.duration_ms),
            data_type="NUMERIC",
        )

        # Score: outcome (1.0 = success, 0.5 = interrupted, 0.0 = error)
        outcome = 0.0 if report.is_error else (0.5 if report.was_interrupted else 1.0)
        langfuse.score(
            trace_id=trace_id,
            name="session_outcome",
            value=outcome,
            data_type="NUMERIC",
        )

        # Score: token usage
        total_tokens = report.input_tokens + report.output_tokens
        if total_tokens > 0:
            langfuse.score(
                trace_id=trace_id,
                name="total_tokens",
                value=float(total_tokens),
                data_type="NUMERIC",
            )

        langfuse.flush()
        logger.info(f"Langfuse claude_code_session trace logged (trace_id={trace_id})")
    except Exception as e:
        logger.warning(f"Langfuse claude session logging failed: {e}", exc_info=True)
```

## What This Unlocks in Langfuse Dashboard

Once implemented, you can build these views in Langfuse:
- **Session cost histogram** — see how expensive each Claude Code run is
- **Duration vs turns scatter** — identify long-running sessions
- **Outcome rate** — % success vs error vs interrupted
- **Unhinged vs normal** — compare cost/duration between Ship It and Ship It Unhinged
- **Tools used frequency** — which tools does Claude Code reach for most
- **Files affected heatmap** — which parts of the codebase get touched most
- **Prediction → Execution link** — trace a suggestion from L2 all the way through to the Claude Code session via `prediction_trace_id`

## Acceptance Criteria

- [ ] When Claude Code completes (success or failure), a session report is POSTed to the backend
- [ ] When the user interrupts, a partial report is sent before killing the process
- [ ] The backend writes a `claude_code_session` trace to Langfuse with prompt, result, cost, tokens, tools, and files
- [ ] Langfuse scores include: session_cost_usd, session_duration_ms, session_outcome, total_tokens
- [ ] The report includes `prediction_trace_id` when available (linking prediction to execution)
- [ ] The report is fire-and-forget — failures don't block the UI or show errors to the user
- [ ] Mock/demo mode sessions are NOT reported (check for mock session IDs)
- [ ] The new endpoint is registered in FastAPI and responds to POST
