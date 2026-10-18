import {
  sessionCookieSettings,
  sessionSecret,
  trustProxySetting,
} from './session-options.js';

describe('session cookies', () => {
  it('sets HttpOnly and SameSite=Lax, and Secure only in production', () => {
    expect(sessionCookieSettings('test')).toMatchObject({
      httpOnly: true,
      sameSite: 'lax',
      secure: false,
      path: '/',
      maxAge: 2 * 60 * 60 * 1000,
    });
    expect(sessionCookieSettings('production').secure).toBe(true);
  });

  it('trusts one proxy hop in production and does not trust forwarded headers otherwise', () => {
    expect(trustProxySetting('production')).toBe(1);
    expect(trustProxySetting('test')).toBe(false);
    expect(trustProxySetting('development')).toBe(false);
  });

  it('refuses a missing or short session secret', () => {
    const previous = process.env.SESSION_SECRET;
    delete process.env.SESSION_SECRET;
    expect(() => sessionSecret()).toThrow(/SESSION_SECRET/);
    process.env.SESSION_SECRET = 'too-short';
    expect(() => sessionSecret()).toThrow(/SESSION_SECRET/);
    if (previous === undefined) {
      delete process.env.SESSION_SECRET;
    } else {
      process.env.SESSION_SECRET = previous;
    }
  });
});
