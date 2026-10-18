import { randomBytes, timingSafeEqual } from 'node:crypto';

export function createCsrfToken(): string {
  return randomBytes(32).toString('base64url');
}

export function csrfTokensMatch(expected: string, supplied: string): boolean {
  const expectedBytes = Buffer.from(expected);
  const suppliedBytes = Buffer.from(supplied);
  if (expectedBytes.length !== suppliedBytes.length) {
    return false;
  }
  return timingSafeEqual(expectedBytes, suppliedBytes);
}
