import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AppConfigModule } from '../config/app-config.module.js';
import { CsrfGuard } from '../csrf/csrf.guard.js';
import { PasswordHasher } from '../hash/password-hasher.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';

@Module({
  imports: [AppConfigModule],
  controllers: [AuthController],
  exports: [AuthService],
  providers: [
    AuthService,
    PasswordHasher,
    {
      provide: APP_GUARD,
      useClass: CsrfGuard,
    },
  ],
})
export class AuthModule {}
