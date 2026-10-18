import { Module } from '@nestjs/common';
import { SessionStoreHost } from './session-store.js';

@Module({
  providers: [SessionStoreHost],
  exports: [SessionStoreHost],
})
export class SessionModule {}
