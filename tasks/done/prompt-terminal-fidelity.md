# Task: Full Claude Code Terminal Fidelity

## Goal

Make DeckForge's terminal panel look and behave like a real Claude Code terminal. Right now it's a wall of "CLAUDE" labels with raw text. Tool calls are invisible or show as tiny gray timestamps. We need to see everything Claude Code does: tool headers, file contents, bash output, diffs, costs updating in real-time.

## Current State

The terminal panel renders 5 event types from `--output-format stream-json`:
- `system` → "● Session started" (fine)
- `assistant` → `CLAUDE` label + raw text (too generic, no turn grouping)
- `tool_use` → tiny gray timestamp like "Reading src/App.tsx..." (invisible in scroll)
- `tool_result` → "✓ Read: Done" with 200-char truncated output (useless)
- `result` → final summary (fine)

## What It Should Look Like

A real Claude Code terminal shows:

```
● Session started (abc12345...)

I'll start by reading the project structure to understand what we're working with.

⏺ Read src/server.js
  (247 lines)

⏺ Read src/index.html
  (189 lines)

Now I have a thorough understanding. Let me implement the AI opponent...

⏺ Edit src/server.js
  + const AI_DIFFICULTIES = { easy: 0.3, medium: 0.7, hard: 0.95 };
  + function updateAIPaddle(ball, paddle, difficulty) {
  +   const accuracy = AI_DIFFICULTIES[difficulty];
  ... (+42 lines)

⏺ Edit src/index.html
  + <div id="mode-select">
  +   <h2>Game Mode</h2>
  ... (+28 lines)

⏺ Bash npm test
  $ npm test
  > pong@1.0.0 test
  > node test.js
  ✓ All 12 tests passed

● Complete — 4 turns, $0.142
```

Key differences from current:
1. Tool calls have **prominent colored headers** with `⏺` indicator
2. Tool **parameters are shown** (file path, command text, search pattern)
3. Tool **results show content** (file excerpts, bash output, diff hunks)
4. **No "CLAUDE" label spam** — assistant text flows naturally without labels
5. **Cost updates in real-time** from `usage` fields in assistant events
6. **Turn separators** between rounds of thinking + tool calls

## Files to Modify

### 1. `src/lib/stores/terminal.ts` — Add ToolCallEntry type

Add a new entry type for tool calls:

```typescript
export interface ToolCallEntry {
  type: 'tool_call';
  toolName: string;
  /** Colored CSS class for the tool header */
  headerClass: string;
  /** Primary parameter (file path, command, pattern) */
  summary: string;
  /** Optional code/content block below the header */
  content?: string;
  /** Whether content is a diff (show +/- coloring) */
  isDiff?: boolean;
  /** Optional line count or result summary */
  meta?: string;
}
```

Add to the union type:
```typescript
export type TerminalEntry = TimestampEntry | PromptEntry | ThoughtEntry | CodeEntry | CursorEntry | ThinkingEntry | ToolCallEntry;
```

Also add a `turns` store for counting turns:
```typescript
export const turns = writable(0);
```

### 2. `src/lib/claude/streamParser.ts` — Complete rewrite of event parsing

#### System event (keep as-is but add model name):
```typescript
function parseSystemEvent(event): TerminalEntry[] {
  const model = event.model ?? 'unknown';
  return [{
    type: 'timestamp',
    time: now(),
    message: `<span class="text-emerald-400">●</span> Session started <span class="text-slate-500">(${event.session_id.slice(0, 8)}...)</span> <span class="text-slate-600">— ${model}</span>`,
  }];
}
```

#### Assistant event — Remove "CLAUDE" label, just show text naturally:
```typescript
function parseAssistantEvent(event): TerminalEntry[] {
  const entries: TerminalEntry[] = [];

  for (const block of event.message.content) {
    if (block.type === 'text' && block.text) {
      entries.push({
        type: 'thought',
        label: '',  // No label — text flows naturally
        body: block.text,
      });
    }
  }

  return entries;
}
```

#### Tool use event — Prominent colored headers:

**Color scheme for tools:**
- Read → `text-cyan-400` (exploring)
- Write → `text-emerald-400` (creating)
- Edit → `text-amber-400` (modifying)
- Bash → `text-blue-400` (executing)
- Glob/Grep → `text-slate-400` (searching)
- Other → `text-purple-400`

```typescript
function parseToolUseEvent(event): TerminalEntry[] {
  const toolName = event.tool_name;
  const input = event.tool_input;

  const colorMap: Record<string, string> = {
    Read: 'text-cyan-400',
    Write: 'text-emerald-400',
    Edit: 'text-amber-400',
    Bash: 'text-blue-400',
    Glob: 'text-slate-400',
    Grep: 'text-slate-400',
    TodoWrite: 'text-purple-400',
  };
  const headerClass = colorMap[toolName] ?? 'text-purple-400';

  // Extract primary parameter
  let summary = '';
  let content: string | undefined;
  let isDiff = false;

  switch (toolName) {
    case 'Read': {
      const filePath = (input.file_path as string) ?? '';
      summary = filePath;
      break;
    }
    case 'Write': {
      const filePath = (input.file_path as string) ?? '';
      const code = (input.content as string) ?? '';
      summary = filePath;
      const lines = code.split('\n');
      content = lines.length > 30
        ? lines.slice(0, 30).join('\n') + `\n// ... (+${lines.length - 30} more lines)`
        : code;
      break;
    }
    case 'Edit': {
      const filePath = (input.file_path as string) ?? '';
      const oldStr = (input.old_string as string) ?? '';
      const newStr = (input.new_string as string) ?? '';
      summary = filePath;
      // Build simple diff
      const diffLines: string[] = [];
      for (const line of oldStr.split('\n')) {
        diffLines.push(`- ${line}`);
      }
      for (const line of newStr.split('\n')) {
        diffLines.push(`+ ${line}`);
      }
      content = diffLines.length > 40
        ? diffLines.slice(0, 40).join('\n') + `\n// ... (+${diffLines.length - 40} more lines)`
        : diffLines.join('\n');
      isDiff = true;
      break;
    }
    case 'Bash': {
      const command = (input.command as string) ?? '';
      summary = '';
      content = `$ ${command}`;
      break;
    }
    case 'Glob': {
      const pattern = (input.pattern as string) ?? '';
      summary = pattern;
      break;
    }
    case 'Grep': {
      const pattern = (input.pattern as string) ?? '';
      const path = (input.path as string) ?? '';
      summary = `"${pattern}"${path ? ` in ${path}` : ''}`;
      break;
    }
    default: {
      // Show tool_input keys as summary
      const keys = Object.keys(input);
      summary = keys.length > 0 ? keys.join(', ') : '';
    }
  }

  return [{
    type: 'tool_call',
    toolName,
    headerClass,
    summary,
    content,
    isDiff,
  }];
}
```

#### Tool result event — Show actual output:

```typescript
function parseToolResultEvent(event): TerminalEntry[] {
  const entries: TerminalEntry[] = [];

  if (event.is_error) {
    entries.push({
      type: 'tool_call',
      toolName: event.tool_name,
      headerClass: 'text-red-400',
      summary: 'Error',
      content: event.output.length > 500
        ? event.output.slice(0, 500) + '\n... (truncated)'
        : event.output,
    });
    return entries;
  }

  // For successful results, show content based on tool type
  switch (event.tool_name) {
    case 'Read': {
      // Show line count
      const lineCount = event.output.split('\n').length;
      entries.push({
        type: 'tool_call',
        toolName: '',
        headerClass: 'text-slate-600',
        summary: '',
        meta: `  (${lineCount} lines)`,
      });
      break;
    }
    case 'Bash': {
      // Show command output (truncated)
      if (event.output.trim()) {
        const lines = event.output.trim().split('\n');
        const display = lines.length > 25
          ? lines.slice(0, 25).join('\n') + `\n... (+${lines.length - 25} more lines)`
          : lines.join('\n');
        entries.push({
          type: 'code',
          content: display,
        });
      }
      break;
    }
    case 'Glob':
    case 'Grep': {
      // Show matched files/lines (truncated)
      if (event.output.trim()) {
        const lines = event.output.trim().split('\n');
        const display = lines.length > 15
          ? lines.slice(0, 15).join('\n') + `\n... (+${lines.length - 15} more)`
          : lines.join('\n');
        entries.push({
          type: 'code',
          content: display,
        });
      }
      break;
    }
    case 'Write': {
      // Just confirm
      entries.push({
        type: 'tool_call',
        toolName: '',
        headerClass: 'text-slate-600',
        summary: '',
        meta: `  ✓ File written`,
      });
      break;
    }
    case 'Edit': {
      entries.push({
        type: 'tool_call',
        toolName: '',
        headerClass: 'text-slate-600',
        summary: '',
        meta: `  ✓ Changes applied`,
      });
      break;
    }
    default: {
      // Show truncated output for other tools
      if (event.output.trim()) {
        const display = event.output.length > 300
          ? event.output.slice(0, 300) + '...'
          : event.output;
        entries.push({
          type: 'code',
          content: display,
        });
      }
      break;
    }
  }

  return entries;
}
```

#### Result event — Update cost format:

Keep mostly the same but show token counts:
```typescript
function parseResultEvent(event): TerminalEntry[] {
  // ... (keep existing logic for error/success)

  // Enhanced cost summary with tokens
  if (event.cost_usd != null || event.total_cost_usd != null) {
    const cost = event.total_cost_usd ?? event.cost_usd ?? 0;
    const tokens = event.usage
      ? ` (${event.usage.input_tokens.toLocaleString()}→${event.usage.output_tokens.toLocaleString()} tokens)`
      : '';
    entries.push({
      type: 'timestamp',
      time: now(),
      message: `<span class="text-emerald-400">●</span> Complete — ${event.num_turns} turns, $${cost.toFixed(3)}${tokens}`,
    });
  }

  // ... (keep cursor entry)
}
```

### 3. `src/lib/components/TerminalPanel.svelte` — Add tool_call rendering

Add a new `{:else if}` block for `tool_call` entries between the existing `code` and `thinking` blocks:

```svelte
{:else if entry.type === 'tool_call'}
  {#if entry.toolName}
    <!-- Tool header with colored indicator -->
    <div class="flex items-center gap-2 mt-3 mb-1">
      <span class="{entry.headerClass} text-sm">⏺</span>
      <span class="{entry.headerClass} font-bold text-xs">{entry.toolName}</span>
      {#if entry.summary}
        <span class="text-slate-300 text-xs truncate">{entry.summary}</span>
      {/if}
    </div>
  {/if}
  {#if entry.meta}
    <div class="text-slate-600 text-xs ml-5">{entry.meta}</div>
  {/if}
  {#if entry.content}
    <div class="bg-[#0b0e11] border border-surface-border rounded p-2 ml-5 mb-2 text-xs">
      <pre class="whitespace-pre-wrap break-all text-slate-400"><code>{#if entry.isDiff}{#each entry.content.split('\n') as line}{#if line.startsWith('+')}<span class="text-green-500">{line}</span>
{:else if line.startsWith('-')}<span class="text-red-400">{line}</span>
{:else}{line}
{/if}{/each}{:else}{entry.content}{/if}</code></pre>
    </div>
  {/if}
```

### 4. `src/lib/claude/streamParser.ts` — Add real-time cost extraction

Add a new export function that extracts cost from assistant events:

```typescript
/**
 * Extract running cost from any event that includes usage data.
 * Call this for every event and update the cost store if non-null.
 */
export function extractRunningCost(event: ClaudeEvent): string | null {
  if (event.type === 'assistant' && event.message.usage) {
    const u = event.message.usage;
    // Rough cost estimate: $3/M input, $15/M output for Opus
    const inputCost = (u.input_tokens / 1_000_000) * 3;
    const outputCost = (u.output_tokens / 1_000_000) * 15;
    const total = inputCost + outputCost;
    if (total > 0) return `$${total.toFixed(2)}`;
  }
  if (event.type === 'result') {
    return extractCost(event);
  }
  return null;
}
```

### 5. `src/lib/screens/AIWorkingScreen.svelte` — Wire up real-time cost

In the `onOutput` callback, after calling `parseClaudeEvent`, also update cost:

```typescript
// After: for (const entry of terminalEntries) { entries.addEntry(entry); }

// Update running cost estimate
const runningCost = extractRunningCost(event);
if (runningCost) cost.set(runningCost);
```

Add `extractRunningCost` to the import from `streamParser`.

### 6. `src/lib/claude/types.ts` — Expand usage fields

Update the usage type in `ClaudeAssistantEvent` to include cache fields that Claude Code actually sends:

```typescript
usage?: {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
};
```

### 7. `src/lib/stores/terminal.ts` — Remove "CLAUDE" label from ThoughtEntry rendering

The `ThoughtEntry` type stays the same, but the `streamParser` will now pass `label: ''` for assistant text. Update `TerminalPanel.svelte` to handle empty labels:

In the `thought` rendering block:
```svelte
{:else if entry.type === 'thought'}
  <div class="mb-2">
    {#if entry.label}
      <span class="text-secondary font-bold">{entry.label}</span>
    {/if}
    <p class="text-slate-400 mt-1 mb-3 max-w-3xl">{@html entry.body}</p>
  </div>
```

## Summary

| Change | File | What |
|--------|------|------|
| New ToolCallEntry type | terminal.ts | Colored header + content entries for tools |
| Rewrite tool_use parsing | streamParser.ts | Show tool name, file path, command, code diffs |
| Rewrite tool_result parsing | streamParser.ts | Show actual output (bash, read line count, search results) |
| Remove "CLAUDE" label | streamParser.ts | Assistant text flows naturally without repeated label |
| Add tool_call rendering | TerminalPanel.svelte | ⏺ headers, colored tool names, indented content |
| Real-time cost tracking | streamParser.ts + AIWorkingScreen.svelte | Update $cost from usage fields as events stream |
| Expand usage types | types.ts | cache_read/creation tokens |
| Handle empty labels | TerminalPanel.svelte | Don't render label span when empty |

## Verification

After changes, run DeckForge and trigger a Claude Code task. The terminal should:
1. Show `⏺ Read` with cyan file path for every file read
2. Show `⏺ Edit` with amber file path and red/green diff lines
3. Show `⏺ Bash` with blue header and command + output
4. Show assistant text without "CLAUDE" label spam
5. Show running cost updating as events stream
6. Show final "● Complete — N turns, $X.XXX (tokens)" summary
