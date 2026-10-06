import { describe, expect, it } from 'vitest';
import { isValidRedirect } from './security';

describe('account return paths', () => {
  it('allows a local guided-link destination', () => {
    expect(isValidRedirect('/profile?connect=apple')).toBe(true);
  });
  it.each(['//attacker.test', '/\\attacker.test', '/\n/attacker.test', 'https://attacker.test', 'javascript:alert(1)'])('rejects %s', path => {
    expect(isValidRedirect(path)).toBe(false);
  });
});
