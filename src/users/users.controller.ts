import { Body, Controller, Post, UseFilters } from '@nestjs/common';
import { registerUser } from './register-user.js';
import { UsersService } from './users.service.js';
import { ValidationExceptionFilter } from './validation-exception.filter.js';

@Controller('users')
@UseFilters(ValidationExceptionFilter)
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Post()
  async create(@Body() body: unknown) {
    const input = await registerUser.validate(body);
    return this.users.register(input);
  }
}
