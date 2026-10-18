import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { APP_CONFIG, type AppConfig } from '../config/app-config.js';
import { issueCsrfToken } from '../csrf/issue-csrf-token.js';
import {
  VineValidationPipe,
  type VineOutput,
} from '../vine/vine-validation.pipe.js';
import { AuthService } from './auth.service.js';
import { loginUser } from './login-user.js';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Get('csrf')
  csrf(@Req() request: Request) {
    return issueCsrfToken(request).then((csrfToken) => ({ csrfToken }));
  }

  @Post('login')
  @HttpCode(200)
  login(
    @Req() request: Request,
    @Body(new VineValidationPipe(loginUser))
    input: VineOutput<typeof loginUser>,
  ) {
    return this.auth.login(request, input);
  }

  @Get('me')
  me(@Req() request: Request) {
    return this.auth.currentUser(request);
  }

  @Post('logout')
  @HttpCode(204)
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.auth.logout(request);
    response.clearCookie(
      this.config.session.cookieName,
      this.config.session.cookie,
    );
  }
}
