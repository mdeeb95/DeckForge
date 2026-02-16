// Dev-mode structured logger with color-coded categories.
// All output goes to browser console (visible in Tauri devtools via Ctrl+Shift+I).
// In production builds, logging is suppressed.

const isDev = import.meta.env.DEV;

type Category = 'input' | 'nav' | 'store' | 'claude' | 'fs' | 'error' | 'lifecycle';

const COLORS: Record<Category, string> = {
  input: '#0df2f2',     // cyan — matches primary
  nav: '#a78bfa',       // purple
  store: '#fbbf24',     // amber
  claude: '#34d399',    // green
  fs: '#60a5fa',        // blue
  error: '#f87171',     // red
  lifecycle: '#94a3b8', // slate
};

export function devLog(category: Category, message: string, data?: unknown): void {
  if (!isDev) return;
  const color = COLORS[category];
  const prefix = `%c[${category.toUpperCase()}]`;
  if (data !== undefined) {
    console.log(prefix, `color: ${color}; font-weight: bold`, message, data);
  } else {
    console.log(prefix, `color: ${color}; font-weight: bold`, message);
  }
}

export function devError(category: Category, message: string, error: unknown): void {
  if (!isDev) return;
  const color = COLORS[category];
  console.error(`%c[${category.toUpperCase()}]`, `color: ${color}; font-weight: bold`, message, error);
}
