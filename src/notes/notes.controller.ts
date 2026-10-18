import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from '../auth/auth.service.js';
import {
  VineValidationPipe,
  type VineOutput,
} from '../vine/vine-validation.pipe.js';
import { createNote, updateNote } from './note-input.js';
import { NotesService } from './notes.service.js';

@Controller('notes')
export class NotesController {
  constructor(
    private readonly notes: NotesService,
    private readonly auth: AuthService,
  ) {}

  @Post()
  create(
    @Req() request: Request,
    @Body(new VineValidationPipe(createNote))
    input: VineOutput<typeof createNote>,
  ) {
    return this.withUser(request, (userId) => this.notes.create(userId, input));
  }

  @Get()
  list(@Req() request: Request) {
    return this.withUser(request, (userId) => this.notes.list(userId));
  }

  @Get(':id')
  get(@Req() request: Request, @Param('id', ParseIntPipe) id: number) {
    return this.withUser(request, (userId) => this.notes.get(userId, id));
  }

  @Patch(':id')
  update(
    @Req() request: Request,
    @Param('id', ParseIntPipe) id: number,
    @Body(new VineValidationPipe(updateNote))
    input: VineOutput<typeof updateNote>,
  ) {
    return this.withUser(request, (userId) =>
      this.notes.update(userId, id, input),
    );
  }

  @Delete(':id')
  @HttpCode(204)
  delete(@Req() request: Request, @Param('id', ParseIntPipe) id: number) {
    return this.withUser(request, (userId) => this.notes.delete(userId, id));
  }

  private async withUser<T>(
    request: Request,
    action: (userId: number) => Promise<T>,
  ): Promise<T> {
    const user = await this.auth.currentUser(request);
    return action(user.id);
  }
}
