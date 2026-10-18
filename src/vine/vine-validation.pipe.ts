import { HttpException, type PipeTransform } from '@nestjs/common';
import { ValidationError, type VineValidator } from '@vinejs/vine';
import type { Infer, SchemaTypes } from '@vinejs/vine/types';

/**
 * Metadata accepted by `vine.compile` and `vine.create`.
 * `vine.withMetaData()` validators require a meta object and are a separate call shape.
 */
type OptionalVineMeta = Record<string, any> | undefined;

/**
 * Output of a compiled VineJS validator. Use it to type a route argument:
 * `input: VineOutput<typeof validator>`.
 */
export type VineOutput<
  Validator extends VineValidator<SchemaTypes, OptionalVineMeta>,
> = Infer<Validator['schema']>;

/**
 * Validates one route argument with a compiled VineJS validator.
 *
 * Pass an instance to the parameter decorator. Do not register this pipe
 * globally: each instance holds one validator.
 *
 * A Vine `ValidationError` becomes HTTP 422 `{ statusCode, errors }`, where
 * `errors` is the validator's message list. Other failures propagate unchanged.
 */
export class VineValidationPipe<
  Schema extends SchemaTypes,
> implements PipeTransform<unknown, Promise<Infer<Schema>>> {
  constructor(
    private readonly validator: VineValidator<Schema, OptionalVineMeta>,
  ) {}

  async transform(value: unknown): Promise<Infer<Schema>> {
    try {
      return await this.validator.validate(value);
    } catch (error) {
      if (!(error instanceof ValidationError)) {
        throw error;
      }
      throw new HttpException(
        {
          statusCode: error.status,
          errors: error.messages,
        },
        error.status,
      );
    }
  }
}
