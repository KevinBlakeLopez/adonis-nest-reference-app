import { EntityManager } from '@mikro-orm/core';
import { Injectable, NotFoundException } from '@nestjs/common';
import { Note } from './note.entity.js';
import { User } from '../users/user.entity.js';

export type NoteResponse = {
  id: number;
  title: string;
  body: string;
  createdAt: string;
  updatedAt: string;
};

@Injectable()
export class NotesService {
  constructor(private readonly em: EntityManager) {}

  async create(
    userId: number,
    input: { title: string; body: string },
  ): Promise<NoteResponse> {
    const note = this.em.create(Note, {
      user: this.em.getReference(User, userId),
      title: input.title,
      body: input.body,
    });
    await this.em.flush();
    return toNoteResponse(note);
  }

  async list(userId: number): Promise<NoteResponse[]> {
    const notes = await this.em.find(
      Note,
      { user: userId },
      { orderBy: { createdAt: 'asc', id: 'asc' } },
    );
    return notes.map(toNoteResponse);
  }

  async get(userId: number, id: number): Promise<NoteResponse> {
    return toNoteResponse(await this.owned(userId, id));
  }

  async update(
    userId: number,
    id: number,
    input: { title?: string; body?: string },
  ): Promise<NoteResponse> {
    const note = await this.owned(userId, id);
    if (input.title !== undefined) {
      note.title = input.title;
    }
    if (input.body !== undefined) {
      note.body = input.body;
    }
    await this.em.flush();
    return toNoteResponse(note);
  }

  async delete(userId: number, id: number): Promise<void> {
    const note = await this.owned(userId, id);
    this.em.remove(note);
    await this.em.flush();
  }

  private async owned(userId: number, id: number) {
    const note = await this.em.findOne(Note, { id, user: userId });
    if (!note) {
      throw new NotFoundException('Note not found');
    }
    return note;
  }
}

function toNoteResponse(note: {
  id: number;
  title: string;
  body: string;
  createdAt: Date;
  updatedAt: Date;
}): NoteResponse {
  return {
    id: note.id,
    title: note.title,
    body: note.body,
    createdAt: note.createdAt.toISOString(),
    updatedAt: note.updatedAt.toISOString(),
  };
}
