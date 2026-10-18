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
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { PublicUser } from '../auth/auth.service.js';
import { AuthenticatedGuard } from '../auth/authenticated.guard.js';
import {
  VineValidationPipe,
  type VineOutput,
} from '../vine/vine-validation.pipe.js';
import { createNote, updateNote } from './note-input.js';
import { NotesService } from './notes.service.js';

@Controller('notes')
@UseGuards(AuthenticatedGuard)
export class NotesController {
  constructor(private readonly notes: NotesService) {}

  @Post()
  create(
    @CurrentUser() user: PublicUser,
    @Body(new VineValidationPipe(createNote))
    input: VineOutput<typeof createNote>,
  ) {
    return this.notes.create(user.id, input);
  }

  @Get()
  list(@CurrentUser() user: PublicUser) {
    return this.notes.list(user.id);
  }

  @Get(':id')
  get(@CurrentUser() user: PublicUser, @Param('id', ParseIntPipe) id: number) {
    return this.notes.get(user.id, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: PublicUser,
    @Param('id', ParseIntPipe) id: number,
    @Body(new VineValidationPipe(updateNote))
    input: VineOutput<typeof updateNote>,
  ) {
    return this.notes.update(user.id, id, input);
  }

  @Delete(':id')
  @HttpCode(204)
  delete(
    @CurrentUser() user: PublicUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.notes.delete(user.id, id);
  }
}
