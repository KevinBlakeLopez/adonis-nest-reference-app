import vine from '@vinejs/vine';

export const loginUser = vine.compile(
  vine.object({
    email: vine.string().email(),
    password: vine.string(),
  }),
);
