import { Module } from '@nestjs/common';
import { PasswordHasher } from '../hash/password-hasher.js';
import { UsersController } from './users.controller.js';
import { UsersService } from './users.service.js';

@Module({
  controllers: [UsersController],
  providers: [UsersService, PasswordHasher],
})
export class UsersModule {}
