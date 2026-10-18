import './session-data.js';
import type { Request } from 'express';

/**
 * `regenerate` destroys the current store row and assigns a new session
 * object to the request. Callers must read `request.session` again afterward.
 * A store failure restores the previous session and identifier.
 */
export function regenerateSession(request: Request): Promise<void> {
  const previousSession = request.session;
  const previousId = request.sessionID;
  return new Promise((resolve, reject) => {
    previousSession.regenerate((error) => {
      if (error) {
        // express-session replaces the in-memory session before it reports
        // a failed store destroy. Put the previous session back so the
        // response does not persist or cookie that replacement.
        request.session = previousSession;
        request.sessionID = previousId;
        reject(error);
        return;
      }
      resolve();
    });
  });
}

export function saveSession(request: Request): Promise<void> {
  return new Promise((resolve, reject) => {
    request.session.save((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

export function destroySession(request: Request): Promise<void> {
  const session = request.session;
  return new Promise((resolve, reject) => {
    session.destroy((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}
