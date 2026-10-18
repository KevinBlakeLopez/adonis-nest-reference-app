import vine from '@vinejs/vine';

export const createNote = vine.compile(
  vine.object({
    title: vine.string().trim().minLength(1).maxLength(200),
    body: vine.string(),
  }),
);

export const updateNote = vine.compile(
  vine.object({
    title: vine.string().trim().minLength(1).maxLength(200).optional(),
    body: vine.string().optional(),
  }),
);
