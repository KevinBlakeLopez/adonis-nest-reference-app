import { EntityManager } from '@mikro-orm/core';
import type { Request, Response } from 'express';
import { PasswordHasher } from '../hash/password-hasher.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';

function serviceWith(
  em: Partial<EntityManager>,
  passwords: Partial<PasswordHasher>,
) {
  return new AuthService(em as EntityManager, passwords as PasswordHasher);
}

describe('AuthService session lifecycle', () => {
  const user = { id: 7, email: 'ada@example.com', passwordHash: 'stored-hash' };

  function authenticatedDependencies() {
    return serviceWith(
      { findOne: vi.fn().mockResolvedValue(user) },
      { verify: vi.fn().mockResolvedValue(true), make: vi.fn() },
    );
  }

  it('stores the user id only on the regenerated session', async () => {
    const original = {
      csrfToken: 'anonymous-token',
      userId: undefined as number | undefined,
      save: vi.fn(),
      destroy: vi.fn(),
      regenerate(callback: (error?: Error) => void) {
        request.session = {
          csrfToken: undefined,
          userId: undefined,
          save(saveCallback: (error?: Error) => void) {
            saveCallback();
          },
          destroy: vi.fn(),
          regenerate: vi.fn(),
        } as unknown as Request['session'];
        callback();
      },
    };
    const request = { session: original } as unknown as Request;
    const result = await authenticatedDependencies().login(request, {
      email: user.email,
      password: 'correct-horse',
    });

    expect(original.userId).toBeUndefined();
    expect(original.save).not.toHaveBeenCalled();
    expect(request.session).not.toBe(original);
    expect(request.session.userId).toBe(7);
    expect(result.csrfToken).not.toBe('anonymous-token');
    expect(request.session.csrfToken).toBe(result.csrfToken);
  });

  it('does not authenticate when regeneration fails', async () => {
    const original = {
      csrfToken: 'anonymous-token',
      userId: undefined as number | undefined,
      save: vi.fn(),
      destroy: vi.fn(),
      regenerate(callback: (error?: Error) => void) {
        callback(new Error('regenerate failed'));
      },
    };
    const request = { session: original } as unknown as Request;

    await expect(
      authenticatedDependencies().login(request, {
        email: user.email,
        password: 'correct-horse',
      }),
    ).rejects.toThrow('regenerate failed');
    expect(original.userId).toBeUndefined();
    expect(original.save).not.toHaveBeenCalled();
  });

  it('restores the previous session when regeneration fails after replacing it', async () => {
    const replacement = {
      csrfToken: undefined as string | undefined,
      userId: undefined as number | undefined,
      save: vi.fn(),
      destroy: vi.fn(),
      regenerate: vi.fn(),
    };
    const original = {
      csrfToken: 'anonymous-token',
      userId: undefined as number | undefined,
      save: vi.fn(),
      destroy: vi.fn(),
      regenerate(callback: (error?: Error) => void) {
        request.session = replacement as unknown as Request['session'];
        request.sessionID = 'new-sid';
        callback(new Error('regenerate failed'));
      },
    };
    const request = {
      session: original,
      sessionID: 'old-sid',
    } as unknown as Request;

    await expect(
      authenticatedDependencies().login(request, {
        email: user.email,
        password: 'correct-horse',
      }),
    ).rejects.toThrow('regenerate failed');
    expect(request.session).toBe(original);
    expect(request.sessionID).toBe('old-sid');
    expect(original.userId).toBeUndefined();
    expect(replacement.save).not.toHaveBeenCalled();
  });

  it('does not authenticate when the new session cannot be saved', async () => {
    const fresh = {
      userId: undefined as number | undefined,
      csrfToken: undefined as string | undefined,
      save(callback: (error?: Error) => void) {
        callback(new Error('save failed'));
      },
      destroy: vi.fn((callback: (error?: Error) => void) => callback()),
      regenerate: vi.fn(),
    };
    const original = {
      csrfToken: 'anonymous-token',
      userId: undefined as number | undefined,
      save: vi.fn(),
      destroy: vi.fn(),
      regenerate(callback: (error?: Error) => void) {
        request.session = fresh as unknown as Request['session'];
        callback();
      },
    };
    const request = { session: original } as unknown as Request;

    await expect(
      authenticatedDependencies().login(request, {
        email: user.email,
        password: 'correct-horse',
      }),
    ).rejects.toThrow('save failed');
    expect(original.userId).toBeUndefined();
    expect(fresh.destroy).toHaveBeenCalled();
  });

  it('fails logout when session destruction fails', async () => {
    const request = {
      session: {
        destroy(callback: (error?: Error) => void) {
          callback(new Error('destroy failed'));
        },
      },
    } as unknown as Request;

    await expect(authenticatedDependencies().logout(request)).rejects.toThrow(
      'destroy failed',
    );
  });

  it('uses the same failure for an unknown email and a wrong password', async () => {
    const verify = vi.fn().mockResolvedValue(false);
    const make = vi.fn().mockResolvedValue('placeholder-hash');
    const findOne = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(user);
    const service = serviceWith({ findOne }, { verify, make });
    const input = { email: 'ada@example.com', password: 'wrong-password' };

    await expect(service.login(idleRequest(), input)).rejects.toMatchObject({
      message: 'Authentication failed',
    });
    await expect(service.login(idleRequest(), input)).rejects.toMatchObject({
      message: 'Authentication failed',
    });
    expect(verify).toHaveBeenCalledWith('placeholder-hash', input.password);
    expect(verify).toHaveBeenCalledWith('stored-hash', input.password);
  });
});

describe('AuthController logout', () => {
  it('does not clear the cookie when destruction fails', async () => {
    const auth = {
      logout: vi.fn().mockRejectedValue(new Error('destroy failed')),
    } as unknown as AuthService;
    const response = { clearCookie: vi.fn() };
    const controller = new AuthController(auth);

    await expect(
      controller.logout({} as Request, response as unknown as Response),
    ).rejects.toThrow('destroy failed');
    expect(response.clearCookie).not.toHaveBeenCalled();
  });
});

function idleRequest(): Request {
  return {
    session: {
      regenerate: vi.fn(),
      save: vi.fn(),
      destroy: vi.fn(),
    },
  } as unknown as Request;
}
