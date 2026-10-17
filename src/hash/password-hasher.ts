import { Hash } from '@adonisjs/hash';
import { Scrypt } from '@adonisjs/hash/drivers/scrypt';
import { Injectable } from '@nestjs/common';

@Injectable()
export class PasswordHasher {
  private readonly hash = new Hash(new Scrypt({}));

  make(plain: string): Promise<string> {
    return this.hash.make(plain);
  }
}
