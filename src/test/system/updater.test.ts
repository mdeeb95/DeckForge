import { describe, it, expect } from 'vitest';

// Mirror the Rust is_newer logic for frontend testing
function isNewer(remote: string, current: string): boolean {
  const parse = (v: string) => v.split('.').map(Number);
  const r = parse(remote);
  const c = parse(current);
  for (let i = 0; i < 3; i++) {
    if ((r[i] ?? 0) > (c[i] ?? 0)) return true;
    if ((r[i] ?? 0) < (c[i] ?? 0)) return false;
  }
  return false;
}

describe('Version comparison', () => {
  it('detects newer major version', () => {
    expect(isNewer('1.0.0', '0.1.0')).toBe(true);
  });

  it('detects newer minor version', () => {
    expect(isNewer('0.2.0', '0.1.0')).toBe(true);
  });

  it('detects newer patch version', () => {
    expect(isNewer('0.1.1', '0.1.0')).toBe(true);
  });

  it('returns false for same version', () => {
    expect(isNewer('0.1.0', '0.1.0')).toBe(false);
  });

  it('returns false for older version', () => {
    expect(isNewer('0.0.9', '0.1.0')).toBe(false);
  });

  it('handles missing patch number', () => {
    expect(isNewer('0.2', '0.1.0')).toBe(true);
  });
});
