import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

/**
 * Reads the raw `Idempotency-Key` header. Nest's `@Headers()` does not run
 * pipes, so validate this with a pipe argument:
 * `@IdempotencyKey(new VineValidationPipe(idempotencyKey))`.
 */
export const IdempotencyKey = createParamDecorator(
  (_data: unknown, context: ExecutionContext): unknown => {
    return context.switchToHttp().getRequest<Request>().headers[
      'idempotency-key'
    ];
  },
);
