import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AuthenticatedGuard } from './authenticated.guard.js';
import type { AuthenticatedRequest } from './authenticated-request.js';
import { AuthService, type PublicUser } from './auth.service.js';

describe('AuthenticatedGuard', () => {
  const user: PublicUser = { id: 4, email: 'ada@example.com' };

  it('attaches the user resolved by the authentication service', async () => {
    const currentUser = vi.fn().mockResolvedValue(user);
    const auth = { currentUser } as unknown as AuthService;
    const request = { session: { userId: user.id } } as AuthenticatedRequest;
    const guard = new AuthenticatedGuard(auth);

    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
    expect(currentUser).toHaveBeenCalledWith(request);
    expect(request.authenticatedUser).toEqual(user);
  });

  it('rejects an anonymous request without attaching an identity', async () => {
    const auth = {
      currentUser: vi
        .fn()
        .mockRejectedValue(
          new UnauthorizedException('Authentication required'),
        ),
    } as unknown as AuthService;
    const request = {} as AuthenticatedRequest;
    const guard = new AuthenticatedGuard(auth);

    await expect(guard.canActivate(contextFor(request))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(request.authenticatedUser).toBeUndefined();
  });
});

function contextFor(request: AuthenticatedRequest): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as ExecutionContext;
}
