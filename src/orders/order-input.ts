import vine from '@vinejs/vine';

export const idempotencyKey = vine.compile(
  vine.string().minLength(1).maxLength(255),
);

export const createOrder = vine.compile(
  vine.object({
    sku: vine.string().minLength(1).maxLength(200),
    quantity: vine.number().withoutDecimals().min(1),
  }),
);
