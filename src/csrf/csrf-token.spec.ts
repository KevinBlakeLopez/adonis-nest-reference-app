import { createCsrfToken, csrfTokensMatch } from './csrf-token.js';

describe('CSRF tokens', () => {
  it('creates a token and matches it with a timing-safe compare', () => {
    const token = createCsrfToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(csrfTokensMatch(token, token)).toBe(true);
    expect(csrfTokensMatch(token, createCsrfToken())).toBe(false);
    expect(csrfTokensMatch(token, token.slice(0, -1))).toBe(false);
  });
});
