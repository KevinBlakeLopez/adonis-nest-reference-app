import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { NotesController } from './notes.controller.js';
import { NotesService } from './notes.service.js';

@Module({
  imports: [AuthModule],
  controllers: [NotesController],
  providers: [NotesService],
})
export class NotesModule {}
