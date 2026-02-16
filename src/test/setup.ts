import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

// Mock @tauri-apps/plugin-fs
vi.mock('@tauri-apps/plugin-fs', () => ({
  readTextFile: vi.fn().mockResolvedValue('{}'),
  writeTextFile: vi.fn().mockResolvedValue(undefined),
  mkdir: vi.fn().mockResolvedValue(undefined),
  exists: vi.fn().mockResolvedValue(false),
}));

// Mock @tauri-apps/plugin-shell
vi.mock('@tauri-apps/plugin-shell', () => ({
  Command: {
    create: vi.fn().mockReturnValue({
      execute: vi.fn().mockResolvedValue({ stdout: '', stderr: '', code: 0 }),
    }),
  },
}));

// Mock @tauri-apps/api/path
vi.mock('@tauri-apps/api/path', () => ({
  homeDir: vi.fn().mockResolvedValue('/tmp/test-home'),
}));

// Set __TAURI_INTERNALS__ so isTauri() returns true in tests
(window as any).__TAURI_INTERNALS__ = {};
