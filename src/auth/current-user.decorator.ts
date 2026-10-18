import {
  createParamDecorator,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import type { PublicUser } from './auth.service.js';
import type { AuthenticatedRequest } from './authenticated-request.js';

export function authenticatedUser(request: AuthenticatedRequest): PublicUser {
  const user = request.authenticatedUser;
  if (!user) {
    throw new UnauthorizedException('Authentication required');
  }
  return user;
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): PublicUser => {
    return authenticatedUser(
      context.switchToHttp().getRequest<AuthenticatedRequest>(),
    );
  },
);
