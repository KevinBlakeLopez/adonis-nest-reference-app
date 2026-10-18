import { Body, Controller, Post } from '@nestjs/common';
import {
  VineValidationPipe,
  type VineOutput,
} from '../vine/vine-validation.pipe.js';
import { registerUser } from './register-user.js';
import { UsersService } from './users.service.js';

@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Post()
  create(
    @Body(new VineValidationPipe(registerUser))
    input: VineOutput<typeof registerUser>,
  ) {
    return this.users.register(input);
  }
}
