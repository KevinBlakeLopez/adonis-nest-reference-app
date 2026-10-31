import {
  EntityManager,
  UniqueConstraintViolationException,
} from '@mikro-orm/core';
import { ConflictException, Injectable } from '@nestjs/common';
import { PasswordHasher } from '../hash/password-hasher.js';
import { User } from './user.entity.js';

export type RegisteredUser = {
  id: number;
  email: string;
};

@Injectable()
export class UsersService {
  constructor(
    private readonly em: EntityManager,
    private readonly passwords: PasswordHasher,
  ) {}

  /**
   * Persists one user. A duplicate email is a constraint failure and is not
   * caught and then committed.
   *
   * Not needed: a `commitGuard` subscriber covered a caught statement error
   * followed by COMMIT, which this method does not do, and MikroORM 7.2.6
   * rejects that COMMIT itself (see `test/commit-rollback.e2e-spec.ts`).
   */
  async register(input: {
    email: string;
    password: string;
  }): Promise<RegisteredUser> {
    const passwordHash = await this.passwords.make(input.password);
    const user = this.em.create(User, { email: input.email, passwordHash });
    try {
      await this.em.flush();
    } catch (error) {
      if (error instanceof UniqueConstraintViolationException) {
        throw new ConflictException('Email is already registered');
      }
      throw error;
    }
    return { id: user.id, email: user.email };
  }
}
