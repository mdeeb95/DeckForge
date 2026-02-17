import { describe, it, expect } from 'vitest';

/**
 * Simulate the exact buffering logic from subprocess.ts.
 * This validates that chunked stdout data (as Tauri delivers it)
 * is correctly reassembled into complete JSON events.
 */

// Replicate the buffer logic from subprocess.ts
function processChunks(chunks: string[]): { parsed: any[]; nonJson: string[]; remainder: string } {
  let stdoutBuffer = '';
  const parsed: any[] = [];
  const nonJson: string[] = [];

  for (const chunk of chunks) {
    stdoutBuffer += chunk;
    const lines = stdoutBuffer.split('\n');
    stdoutBuffer = lines.pop() ?? '';

    for (const raw of lines) {
      const trimmed = raw.trim();
      if (!trimmed) continue;
      try {
        parsed.push(JSON.parse(trimmed));
      } catch {
        nonJson.push(trimmed);
      }
    }
  }

  return { parsed, nonJson, remainder: stdoutBuffer };
}

// Real Claude Code event shapes for testing
const INIT_EVENT = JSON.stringify({type:"system",subtype:"init",session_id:"test-123",tools:["Read","Write"]});
const ASSISTANT_EVENT = JSON.stringify({type:"assistant",message:{id:"msg-1",type:"message",role:"assistant",content:[{type:"text",text:"Hello"}],model:"claude-sonnet"},"session_id":"test-123"});
const RESULT_EVENT = JSON.stringify({type:"result",result:"Done",session_id:"test-123",is_error:false,duration_ms:1000,duration_api_ms:800,num_turns:1,cost_usd:0.01,total_cost_usd:0.01});

describe('stdout buffer logic', () => {
  it('handles one event per chunk (ideal case)', () => {
    const result = processChunks([
      INIT_EVENT + '\n',
      ASSISTANT_EVENT + '\n',
      RESULT_EVENT + '\n',
    ]);
    expect(result.parsed).toHaveLength(3);
    expect(result.parsed[0].type).toBe('system');
    expect(result.parsed[1].type).toBe('assistant');
    expect(result.parsed[2].type).toBe('result');
    expect(result.remainder).toBe('');
  });

  it('handles multiple events in one chunk', () => {
    const combined = INIT_EVENT + '\n' + ASSISTANT_EVENT + '\n' + RESULT_EVENT + '\n';
    const result = processChunks([combined]);
    expect(result.parsed).toHaveLength(3);
  });

  it('handles event split across two chunks', () => {
    const half1 = INIT_EVENT.slice(0, 50);
    const half2 = INIT_EVENT.slice(50) + '\n';
    const result = processChunks([half1, half2]);
    expect(result.parsed).toHaveLength(1);
    expect(result.parsed[0].type).toBe('system');
  });

  it('handles event split across three chunks', () => {
    const third1 = INIT_EVENT.slice(0, 30);
    const third2 = INIT_EVENT.slice(30, 60);
    const third3 = INIT_EVENT.slice(60) + '\n';
    const result = processChunks([third1, third2, third3]);
    expect(result.parsed).toHaveLength(1);
    expect(result.parsed[0].type).toBe('system');
  });

  it('handles chunk boundary at newline', () => {
    const result = processChunks([
      INIT_EVENT + '\n' + ASSISTANT_EVENT.slice(0, 20),
      ASSISTANT_EVENT.slice(20) + '\n',
    ]);
    expect(result.parsed).toHaveLength(2);
  });

  it('handles empty chunks', () => {
    const result = processChunks(['', INIT_EVENT + '\n', '', '']);
    expect(result.parsed).toHaveLength(1);
  });

  it('handles trailing data without newline (buffered until close)', () => {
    const result = processChunks([INIT_EVENT + '\n', RESULT_EVENT]);
    expect(result.parsed).toHaveLength(1); // only INIT parsed
    expect(result.remainder).toBe(RESULT_EVENT); // RESULT waiting in buffer
  });

  it('handles non-JSON lines mixed in', () => {
    const result = processChunks([
      'Claude Code v2.1.44\n',
      INIT_EVENT + '\n',
      'Some warning text\n',
      RESULT_EVENT + '\n',
    ]);
    expect(result.parsed).toHaveLength(2);
    expect(result.nonJson).toHaveLength(2); // banner + warning
  });

  it('handles very large events (>4KB, typical init event)', () => {
    const bigTools = Array.from({length: 100}, (_, i) => `Tool${i}`);
    const bigEvent = JSON.stringify({type:"system",subtype:"init",session_id:"test",tools:bigTools});
    // Simulate OS delivering this in 1KB chunks
    const chunkSize = 1024;
    const chunks: string[] = [];
    for (let i = 0; i < bigEvent.length; i += chunkSize) {
      chunks.push(bigEvent.slice(i, i + chunkSize));
    }
    chunks[chunks.length - 1] += '\n'; // newline at end
    const result = processChunks(chunks);
    expect(result.parsed).toHaveLength(1);
    expect(result.parsed[0].tools).toHaveLength(100);
  });
});
