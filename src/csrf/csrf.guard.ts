import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';
import { csrfTokensMatch } from './csrf-token.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

@Injectable()
export class CsrfGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    if (context.getType() !== 'http') {
      return true;
    }
    const request = context.switchToHttp().getRequest<Request>();
    if (SAFE_METHODS.has(request.method)) {
      return true;
    }

    const expected = request.session?.csrfToken;
    const supplied = request.get('x-csrf-token');
    if (!expected || !supplied || !csrfTokensMatch(expected, supplied)) {
      throw new ForbiddenException('Invalid CSRF token');
    }
    return true;
  }
}
