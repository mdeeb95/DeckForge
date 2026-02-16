import { describe, it, expect } from 'vitest';
import { buildClaudeArgs } from '../../lib/claude/subprocess';
import type { SessionOptions } from '../../lib/claude/types';

// ─── buildClaudeArgs — pure function tests (no Tauri needed) ─────────────────

function makeOptions(overrides: Partial<SessionOptions> = {}): SessionOptions {
  return {
    projectPath: '/tmp/test-project',
    systemPromptAppend: '',
    permissionMode: '',
    allowedTools: [],
    ...overrides,
  };
}

describe('buildClaudeArgs', () => {
  it('produces correct args for a basic prompt', () => {
    const args = buildClaudeArgs('Fix the bug', makeOptions());

    expect(args).toContain('-p');
    expect(args).toContain('Fix the bug');
    expect(args).toContain('--output-format');
    expect(args).toContain('stream-json');
    expect(args).toContain('--verbose');
  });

  it('does not include --resume when no session ID exists', () => {
    const args = buildClaudeArgs('Hello', makeOptions());

    expect(args).not.toContain('--resume');
    expect(args).not.toContain('--session-id');
  });

  it('includes --resume and --session-id when session exists', () => {
    const args = buildClaudeArgs('Continue', makeOptions({
      sessionId: 'sess-abc-123',
    }));

    expect(args).toContain('--resume');
    expect(args).toContain('--session-id');
    expect(args).toContain('sess-abc-123');

    // --resume should come before or paired with --session-id
    const resumeIdx = args.indexOf('--resume');
    const sessionIdx = args.indexOf('--session-id');
    expect(resumeIdx).toBeLessThan(sessionIdx);
  });

  it('includes --permission-mode when set', () => {
    const args = buildClaudeArgs('Deploy', makeOptions({
      permissionMode: 'acceptEdits',
    }));

    expect(args).toContain('--permission-mode');
    expect(args).toContain('acceptEdits');
  });

  it('does not include --permission-mode when empty', () => {
    const args = buildClaudeArgs('Hello', makeOptions({
      permissionMode: '',
    }));

    expect(args).not.toContain('--permission-mode');
  });

  it('includes --allowedTools for each tool', () => {
    const args = buildClaudeArgs('Fix it', makeOptions({
      allowedTools: ['Read', 'Write', 'Bash(git *)'],
    }));

    const toolFlags = args.filter(a => a === '--allowedTools');
    expect(toolFlags).toHaveLength(3);

    expect(args).toContain('Read');
    expect(args).toContain('Write');
    expect(args).toContain('Bash(git *)');
  });

  it('does not include --allowedTools when list is empty', () => {
    const args = buildClaudeArgs('Hello', makeOptions({
      allowedTools: [],
    }));

    expect(args).not.toContain('--allowedTools');
  });

  it('includes --append-system-prompt when set', () => {
    const args = buildClaudeArgs('Code it', makeOptions({
      systemPromptAppend: 'Be extra creative and add flair.',
    }));

    expect(args).toContain('--append-system-prompt');
    expect(args).toContain('Be extra creative and add flair.');
  });

  it('does not include --append-system-prompt when empty', () => {
    const args = buildClaudeArgs('Hello', makeOptions());

    expect(args).not.toContain('--append-system-prompt');
  });

  it('handles unhinged mode (system prompt + all options)', () => {
    const args = buildClaudeArgs('Make it wild', makeOptions({
      sessionId: 'sess-wild',
      permissionMode: 'full',
      allowedTools: ['Read', 'Write', 'Edit', 'Bash'],
      systemPromptAppend: 'Go beyond the plan and add some flair.',
    }));

    // Verify all flags present
    expect(args).toContain('-p');
    expect(args).toContain('Make it wild');
    expect(args).toContain('--resume');
    expect(args).toContain('--session-id');
    expect(args).toContain('sess-wild');
    expect(args).toContain('--permission-mode');
    expect(args).toContain('full');
    expect(args).toContain('--append-system-prompt');
    expect(args).toContain('Go beyond the plan and add some flair.');

    // 4 tool flags
    const toolFlags = args.filter(a => a === '--allowedTools');
    expect(toolFlags).toHaveLength(4);
  });

  it('preserves prompt with special characters', () => {
    const prompt = 'Fix the "login" bug & add \'auth\' tests; rm -rf /';
    const args = buildClaudeArgs(prompt, makeOptions());

    // Prompt should be passed verbatim (shell escaping is the spawn layer's job)
    const promptIdx = args.indexOf('-p');
    expect(args[promptIdx + 1]).toBe(prompt);
  });
});
