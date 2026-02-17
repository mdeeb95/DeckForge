// ─── Claude Code Streaming Event Types ───────────────────────────────────────
// Matches the `--output-format stream-json` output from the Claude CLI.

export interface ClaudeSystemEvent {
  type: 'system';
  subtype: 'init';
  session_id: string;
  tools: string[];
  model?: string;
}

export interface ClaudeAssistantEvent {
  type: 'assistant';
  message: {
    id: string;
    type: 'message';
    role: 'assistant';
    content: ClaudeContentBlock[];
    model: string;
    usage?: {
      input_tokens: number;
      output_tokens: number;
    };
  };
  session_id: string;
}

export interface ClaudeContentBlock {
  type: 'text' | 'tool_use';
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
}

export interface ClaudeToolUseEvent {
  type: 'tool_use';
  tool_name: string;
  tool_input: Record<string, unknown>;
  session_id: string;
}

export interface ClaudeToolResultEvent {
  type: 'tool_result';
  tool_name: string;
  output: string;
  is_error: boolean;
  session_id: string;
}

export interface ClaudeResultEvent {
  type: 'result';
  result: string;
  session_id: string;
  is_error: boolean;
  duration_ms: number;
  duration_api_ms: number;
  num_turns: number;
  cost_usd?: number;
  total_cost_usd?: number;
  usage?: {
    input_tokens: number;
    output_tokens: number;
  };
}

export type ClaudeEvent =
  | ClaudeSystemEvent
  | ClaudeAssistantEvent
  | ClaudeToolUseEvent
  | ClaudeToolResultEvent
  | ClaudeResultEvent;

// ─── Session Options ─────────────────────────────────────────────────────────

export interface SessionOptions {
  projectPath: string;
  systemPromptAppend: string;
  permissionMode: string;
  allowedTools: string[];
  sessionId?: string;  // for resume
}

export interface SessionState {
  sessionId: string | null;
  active: boolean;
  projectPath: string;
}

// ─── Session Reporting ──────────────────────────────────────────────────────

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
  tools_used: string[];
  files_affected: string[];
  project_path: string;
  prediction_trace_id?: string;
}
