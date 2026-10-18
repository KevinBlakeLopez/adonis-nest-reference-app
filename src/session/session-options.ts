export const sessionCookieName = 'sid';

/** Absolute session lifetime. The Postgres store records this as `expire`. */
export const sessionMaxAgeMs = 2 * 60 * 60 * 1000;

export function sessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('SESSION_SECRET must be at least 32 characters');
  }
  return secret;
}

/**
 * Production trusts one reverse-proxy hop, not every forwarded address.
 * The Node port must be reachable only through that proxy: a direct client
 * can still set X-Forwarded-Proto. Boolean `true` is unrestricted and is not used.
 */
export function trustProxySetting(nodeEnv = process.env.NODE_ENV): false | 1 {
  return nodeEnv === 'production' ? 1 : false;
}

export function sessionCookieSettings(nodeEnv = process.env.NODE_ENV) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: nodeEnv === 'production',
    maxAge: sessionMaxAgeMs,
    path: '/',
  };
}
