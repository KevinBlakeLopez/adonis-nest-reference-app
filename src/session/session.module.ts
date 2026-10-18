import { Module } from '@nestjs/common';
import { AppConfigModule } from '../config/app-config.module.js';
import { SessionStoreHost } from './session-store.js';

@Module({
  imports: [AppConfigModule],
  providers: [SessionStoreHost],
  exports: [SessionStoreHost],
})
export class SessionModule {}
