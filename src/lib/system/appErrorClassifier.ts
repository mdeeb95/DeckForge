// ─── App Error Classifier — analyze app crashes and categorize them ──────────

export type AppErrorType = 'port_in_use' | 'generic_crash';

export interface AppError {
  type: AppErrorType;
  exitCode: number | null;
  port: number | null;
  summary: string;
  lastStderrLines: string[];
  rawOutput: string[];
  timestamp: string;
}

// Patterns that indicate a port conflict
const PORT_PATTERNS = [
  /EADDRINUSE/i,
  /address already in use/i,
  /port (\d+) is already in use/i,
  /listen EADDRINUSE[:\s]*(?:::)?(\d+)/i,
  /bind\(\) failed.*address already in use/i,
];

// Port extraction patterns — ordered most-specific to least-specific
const PORT_EXTRACT = [
  /:::(\d{1,5})\b/,                          // :::3000 (Node.js IPv6 style)
  /(?:0\.0\.0\.0|127\.0\.0\.1):(\d{1,5})\b/, // 0.0.0.0:3000 or 127.0.0.1:3000
  /port\s+(\d{1,5})\b/i,                     // port 3000
  /:(\d{1,5})\s*$/,                           // :3000 at end of line
];

// Extract port number from output lines
function extractPort(lines: string[]): number | null {
  for (const pattern of PORT_EXTRACT) {
    for (const line of lines) {
      const match = line.match(pattern);
      if (match) {
        const port = parseInt(match[1], 10);
        if (port >= 1 && port <= 65535) return port;
      }
    }
  }
  return null;
}

/**
 * Classify an app exit into a typed error, or null if it exited cleanly.
 */
export function classifyAppError(
  exitCode: number | null,
  output: string[],
  configPort?: number | null,
): AppError | null {
  // Clean exit — no error
  if (exitCode === 0 || exitCode === null) return null;

  const stderrLines = output.filter(l => l.startsWith('[stderr]'));
  const lastStderrLines = stderrLines.slice(-10);
  const fullText = output.join('\n');

  // Check for port-in-use
  const isPortConflict = PORT_PATTERNS.some(p => p.test(fullText));

  if (isPortConflict) {
    const port = extractPort(output) ?? (configPort && configPort >= 1 && configPort <= 65535 ? configPort : null);
    return {
      type: 'port_in_use',
      exitCode,
      port,
      summary: port ? `Port ${port} is already in use` : 'Address already in use',
      lastStderrLines: lastStderrLines.map(l => l.replace(/^\[stderr\]\s*/, '')),
      rawOutput: output,
      timestamp: new Date().toISOString(),
    };
  }

  // Generic crash — grab last stderr line as summary
  const lastStderr = lastStderrLines.at(-1)?.replace(/^\[stderr\]\s*/, '') || 'Process exited unexpectedly';
  return {
    type: 'generic_crash',
    exitCode,
    port: null,
    summary: lastStderr.length > 120 ? lastStderr.slice(0, 117) + '...' : lastStderr,
    lastStderrLines: lastStderrLines.map(l => l.replace(/^\[stderr\]\s*/, '')),
    rawOutput: output,
    timestamp: new Date().toISOString(),
  };
}
