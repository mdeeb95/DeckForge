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

function parseSystemEvent(event: ClaudeEvent & { type: 'system' }): TerminalEntry[] {
  return [
    {
      type: 'timestamp',
      time: now(),
      message: `<span class="text-emerald-400">●</span> Session started <span class="text-slate-500">(${event.session_id.slice(0, 8)}...)</span>`,
    },
  ];
}

function parseAssistantEvent(event: ClaudeEvent & { type: 'assistant' }): TerminalEntry[] {
  const entries: TerminalEntry[] = [];

  for (const block of event.message.content) {
    if (block.type === 'text' && block.text) {
      entries.push({
        type: 'thought',
        label: 'CLAUDE',
        body: block.text,
      });
    }
  }

  return entries;
}

function parseToolUseEvent(event: ClaudeEvent & { type: 'tool_use' }): TerminalEntry[] {
  const toolName = event.tool_name;
  const input = event.tool_input;

  // File operations → code entry
  if (toolName === 'Write' || toolName === 'Edit') {
    const filePath = (input.file_path as string) ?? (input.path as string) ?? '';
    const content = (input.content as string) ?? (input.new_string as string) ?? '';

    return [
      {
        type: 'timestamp',
        time: now(),
        message: `${toolName === 'Write' ? 'Creating' : 'Editing'} <span class="text-slate-300">${filePath}</span>...`,
      },
      {
        type: 'code',
        filePath,
        content: content.length > 500 ? content.slice(0, 500) + '\n// ... truncated' : content,
        diff: toolName === 'Edit',
      },
    ];
  }

  // Read → timestamp
  if (toolName === 'Read') {
    const filePath = (input.file_path as string) ?? '';
    return [{
      type: 'timestamp',
      time: now(),
      message: `Reading <span class="text-slate-300">${filePath}</span>...`,
    }];
  }

  // Bash → code block
  if (toolName === 'Bash') {
    const command = (input.command as string) ?? '';
    return [
      {
        type: 'timestamp',
        time: now(),
        message: `Running command...`,
      },
      {
        type: 'code',
        content: `$ ${command}`,
      },
    ];
  }

  // Glob / Grep → timestamp
  if (toolName === 'Glob' || toolName === 'Grep') {
    const pattern = (input.pattern as string) ?? '';
    return [{
      type: 'timestamp',
      time: now(),
      message: `${toolName}: <span class="text-slate-300">${pattern}</span>`,
    }];
  }

  // Generic tool use
  return [{
    type: 'timestamp',
    time: now(),
    message: `Using tool: <span class="text-slate-300">${toolName}</span>`,
  }];
}

function parseToolResultEvent(event: ClaudeEvent & { type: 'tool_result' }): TerminalEntry[] {
  const icon = event.is_error
    ? '<span class="text-red-400">✗</span>'
    : '<span class="text-emerald-400">✓</span>';

  const label = event.is_error ? 'Error' : 'Done';

  // Truncate long output for display
  const output = event.output.length > 200
    ? event.output.slice(0, 200) + '...'
    : event.output;

  return [{
    type: 'timestamp',
    time: now(),
    message: `${icon} ${event.tool_name}: ${label}${output ? ` — <span class="text-slate-500">${escapeHtml(output)}</span>` : ''}`,
  }];
}

function parseResultEvent(event: ClaudeEvent & { type: 'result' }): TerminalEntry[] {
  const entries: TerminalEntry[] = [];

  if (event.is_error) {
    entries.push({
      type: 'timestamp',
      time: now(),
      message: `<span class="text-red-400">✗</span> Task failed: ${escapeHtml(event.result)}`,
    });
  } else {
    entries.push({
      type: 'thought',
      label: 'RESULT',
      body: event.result,
    });
  }

  // Cost summary
  if (event.cost_usd != null || event.total_cost_usd != null) {
    const cost = event.total_cost_usd ?? event.cost_usd ?? 0;
    entries.push({
      type: 'timestamp',
      time: now(),
      message: `<span class="text-emerald-400">●</span> Complete — ${event.num_turns} turns, $${cost.toFixed(3)}`,
    });
  }

  entries.push({
    type: 'cursor',
    message: event.is_error ? 'Task failed. Press B to go back.' : 'Task complete. Press A to continue.',
  });

  return entries;
}

/**
 * Extract cost string from a result event for the terminal header.
 */
export function extractCost(event: ClaudeEvent & { type: 'result' }): string {
  const cost = event.total_cost_usd ?? event.cost_usd ?? 0;
  return `$${cost.toFixed(2)}`;
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
