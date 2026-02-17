import type { ClaudeEvent } from './types';
import type { TerminalEntry } from '../stores/terminal';

/**
 * Convert a Claude Code streaming event into one or more TerminalEntry objects
 * for display in the terminal panel.
 */
export function parseClaudeEvent(event: ClaudeEvent): TerminalEntry[] {
  switch (event.type) {
    case 'system':
      return parseSystemEvent(event);
    case 'assistant':
      return parseAssistantEvent(event);
    case 'tool_use':
      return parseToolUseEvent(event);
    case 'tool_result':
      return parseToolResultEvent(event);
    case 'result':
      return parseResultEvent(event);
    default:
      return [];
  }
}

function now(): string {
  const d = new Date();
  return d.toTimeString().slice(0, 8);
}

// ── Tool color scheme ──────────────────────────────────────────────────────

const toolColorMap: Record<string, string> = {
  Read: 'text-cyan-400',
  Write: 'text-emerald-400',
  Edit: 'text-amber-400',
  Bash: 'text-blue-400',
  Glob: 'text-slate-400',
  Grep: 'text-slate-400',
  TodoWrite: 'text-purple-400',
};

// ── System event ───────────────────────────────────────────────────────────

function parseSystemEvent(event: ClaudeEvent & { type: 'system' }): TerminalEntry[] {
  const model = event.model ?? 'unknown';
  return [{
    type: 'timestamp',
    time: now(),
    message: `<span class="text-emerald-400">●</span> Session started <span class="text-slate-500">(${event.session_id.slice(0, 8)}...)</span> <span class="text-slate-600">— ${model}</span>`,
  }];
}

// ── Assistant event — no "CLAUDE" label, text flows naturally ──────────────

function parseAssistantEvent(event: ClaudeEvent & { type: 'assistant' }): TerminalEntry[] {
  const entries: TerminalEntry[] = [];

  for (const block of event.message.content) {
    if (block.type === 'text' && block.text) {
      entries.push({
        type: 'thought',
        label: '',
        body: block.text,
      });
    }
  }

  return entries;
}

// ── Tool use event — prominent colored headers ─────────────────────────────

function parseToolUseEvent(event: ClaudeEvent & { type: 'tool_use' }): TerminalEntry[] {
  const toolName = event.tool_name;
  const input = event.tool_input;
  const headerClass = toolColorMap[toolName] ?? 'text-purple-400';

  let summary = '';
  let content: string | undefined;
  let isDiff = false;

  switch (toolName) {
    case 'Read': {
      summary = (input.file_path as string) ?? '';
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
      summary = (input.pattern as string) ?? '';
      break;
    }
    case 'Grep': {
      const pattern = (input.pattern as string) ?? '';
      const path = (input.path as string) ?? '';
      summary = `"${pattern}"${path ? ` in ${path}` : ''}`;
      break;
    }
    default: {
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

// ── Tool result event — show actual output ─────────────────────────────────

function parseToolResultEvent(event: ClaudeEvent & { type: 'tool_result' }): TerminalEntry[] {
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

  switch (event.tool_name) {
    case 'Read': {
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
      entries.push({
        type: 'tool_call',
        toolName: '',
        headerClass: 'text-slate-600',
        summary: '',
        meta: '  \u2713 File written',
      });
      break;
    }
    case 'Edit': {
      entries.push({
        type: 'tool_call',
        toolName: '',
        headerClass: 'text-slate-600',
        summary: '',
        meta: '  \u2713 Changes applied',
      });
      break;
    }
    default: {
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

// ── Result event — enhanced cost + token summary ───────────────────────────

function parseResultEvent(event: ClaudeEvent & { type: 'result' }): TerminalEntry[] {
  const entries: TerminalEntry[] = [];

  if (event.is_error) {
    entries.push({
      type: 'timestamp',
      time: now(),
      message: `<span class="text-red-400">\u2717</span> Task failed: ${escapeHtml(event.result)}`,
    });
  } else {
    entries.push({
      type: 'thought',
      label: 'RESULT',
      body: event.result,
    });
  }

  // Cost summary with token counts
  if (event.cost_usd != null || event.total_cost_usd != null) {
    const cost = event.total_cost_usd ?? event.cost_usd ?? 0;
    const tokens = event.usage
      ? ` (${event.usage.input_tokens.toLocaleString()}\u2192${event.usage.output_tokens.toLocaleString()} tokens)`
      : '';
    entries.push({
      type: 'timestamp',
      time: now(),
      message: `<span class="text-emerald-400">\u25CF</span> Complete \u2014 ${event.num_turns} turns, $${cost.toFixed(3)}${tokens}`,
    });
  }

  entries.push({
    type: 'cursor',
    message: event.is_error ? 'Task failed. Press B to go back.' : 'Task complete. Press A to continue.',
  });

  return entries;
}

// ── Cost extraction ────────────────────────────────────────────────────────

/**
 * Extract cost string from a result event for the terminal header.
 */
export function extractCost(event: ClaudeEvent & { type: 'result' }): string {
  const cost = event.total_cost_usd ?? event.cost_usd ?? 0;
  return `$${cost.toFixed(2)}`;
}

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

/**
 * Extract scope info from tool events for the terminal header.
 */
export function extractScope(events: ClaudeEvent[]): string {
  const files = new Set<string>();

  for (const event of events) {
    if (event.type === 'tool_use') {
      const filePath = (event.tool_input.file_path as string) ??
                       (event.tool_input.path as string);
      if (filePath) files.add(filePath);
    }
  }

  const count = files.size;
  return count > 0 ? `${count} File${count !== 1 ? 's' : ''}` : '';
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
