import type { Request } from 'express';
import type { PublicUser } from './auth.service.js';

export type AuthenticatedRequest = Request & {
  authenticatedUser?: PublicUser;
};
