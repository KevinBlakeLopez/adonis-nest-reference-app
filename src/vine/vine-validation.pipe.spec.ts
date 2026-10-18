import { Body, Controller, HttpException, Post } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import vine, { ValidationError } from '@vinejs/vine';
import request from 'supertest';
import { VineValidationPipe, type VineOutput } from './vine-validation.pipe.js';

const nameValidator = vine.compile(
  vine.object({
    name: vine.string().minLength(2),
  }),
);

describe('VineValidationPipe', () => {
  const pipe = new VineValidationPipe(nameValidator);

  it('returns the validated output', async () => {
    await expect(pipe.transform({ name: 'ada', extra: true })).resolves.toEqual(
      {
        name: 'ada',
      },
    );
  });

  it('preserves the compiled validator output type', () => {
    expectTypeOf<VineOutput<typeof nameValidator>>().toEqualTypeOf<{
      name: string;
    }>();
    expectTypeOf<Awaited<ReturnType<typeof pipe.transform>>>().toEqualTypeOf<{
      name: string;
    }>();
  });

  it('turns a Vine failure into HTTP 422 with the Vine messages', async () => {
    const error = await pipe.transform({ name: 'a' }).then(
      () => {
        throw new Error('expected validation to fail');
      },
      (caught: unknown) => caught,
    );

    expect(error).toBeInstanceOf(HttpException);
    const exception = error as HttpException;
    expect(exception.getStatus()).toBe(422);
    expect(exception.getResponse()).toEqual({
      statusCode: 422,
      errors: [
        {
          message: 'The name field must have at least 2 characters',
          rule: 'minLength',
          field: 'name',
          meta: { min: 2 },
        },
      ],
    });
  });

  it('does not convert other failures into validation responses', async () => {
    const failure = new Error('hasher unavailable');
    vi.spyOn(nameValidator, 'validate').mockRejectedValueOnce(failure);

    await expect(pipe.transform({ name: 'ada' })).rejects.toBe(failure);
    expect(failure).not.toBeInstanceOf(ValidationError);
  });
});

const measurement = vine.compile(
  vine.object({
    quantity: vine.number(),
    label: vine.string().transform((value) => value.trim().toUpperCase()),
  }),
);

@Controller('measurements')
class MeasurementsController {
  @Post()
  create(
    @Body(new VineValidationPipe(measurement))
    input: VineOutput<typeof measurement>,
  ) {
    return input;
  }
}

describe('VineValidationPipe transformations', () => {
  it('preserves a transformed output type', () => {
    expectTypeOf<VineOutput<typeof measurement>>().toEqualTypeOf<{
      quantity: number;
      label: string;
    }>();
  });

  it('gives the controller the transformed runtime value', async () => {
    const module = await Test.createTestingModule({
      controllers: [MeasurementsController],
    }).compile();
    const app = module.createNestApplication();
    await app.init();

    try {
      const response = await request(app.getHttpServer())
        .post('/measurements')
        .send({ quantity: '12', label: '  kg ' })
        .expect(201);

      expect(response.body).toEqual({ quantity: 12, label: 'KG' });
      expect(typeof response.body.quantity).toBe('number');
    } finally {
      await app.close();
    }
  });
});
