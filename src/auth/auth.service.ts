import { randomBytes } from 'node:crypto';
import { EntityManager } from '@mikro-orm/core';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { createCsrfToken } from '../csrf/csrf-token.js';
import { PasswordHasher } from '../hash/password-hasher.js';
import {
  destroySession,
  regenerateSession,
  saveSession,
} from '../session/session-lifecycle.js';
import { User } from '../users/user.entity.js';

export type PublicUser = {
  id: number;
  email: string;
};

@Injectable()
export class AuthService {
  private placeholderHash: Promise<string> | undefined;

  constructor(
    private readonly em: EntityManager,
    private readonly passwords: PasswordHasher,
  ) {}

  async login(
    request: Request,
    input: { email: string; password: string },
  ): Promise<PublicUser & { csrfToken: string }> {
    const user = await this.authenticate(input);
    const anonymous = request.session;
    await regenerateSession(request);
    if (!request.session || request.session === anonymous) {
      throw new Error('Login aborted because the session was not regenerated');
    }

    request.session.userId = user.id;
    request.session.csrfToken = createCsrfToken();
    try {
      await saveSession(request);
    } catch (error) {
      await destroySession(request).catch(() => undefined);
      throw error;
    }

    const csrfToken = request.session.csrfToken;
    if (!csrfToken) {
      throw new Error('Login aborted because the CSRF token was not stored');
    }
    return { id: user.id, email: user.email, csrfToken };
  }

  async currentUser(request: Request): Promise<PublicUser> {
    const userId = request.session?.userId;
    if (userId === undefined) {
      throw new UnauthorizedException('Authentication required');
    }
    const user = await this.em.findOne(User, { id: userId });
    if (!user) {
      throw new UnauthorizedException('Authentication required');
    }
    return { id: user.id, email: user.email };
  }

  async logout(request: Request): Promise<void> {
    await destroySession(request);
  }

  private async authenticate(input: {
    email: string;
    password: string;
  }): Promise<PublicUser> {
    const user = await this.em.findOne(User, { email: input.email });
    const hash = user?.passwordHash ?? (await this.unknownUserHash());
    const matches = await this.passwords.verify(hash, input.password);
    if (!user || !matches) {
      throw new UnauthorizedException('Authentication failed');
    }
    return { id: user.id, email: user.email };
  }

  private unknownUserHash(): Promise<string> {
    this.placeholderHash ??= this.passwords.make(
      randomBytes(32).toString('hex'),
    );
    return this.placeholderHash;
  }
}
