import type { Request } from 'express';
import { saveSession } from '../session/session-lifecycle.js';
import { createCsrfToken } from './csrf-token.js';

export async function issueCsrfToken(request: Request): Promise<string> {
  if (!request.session.csrfToken) {
    request.session.csrfToken = createCsrfToken();
  }
  await saveSession(request);
  return request.session.csrfToken;
}
