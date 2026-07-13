import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StoragePort } from './storage.port.js';
import { MockStorageAdapter } from './mock-storage.adapter.js';
import { S3StorageAdapter } from './s3-storage.adapter.js';
import type { Env } from '../../config/env.schema.js';

/** Реализация StoragePort выбирается по STORAGE_PROVIDER. */
@Global()
@Module({
  providers: [
    MockStorageAdapter,
    S3StorageAdapter,
    {
      provide: StoragePort,
      inject: [ConfigService, MockStorageAdapter, S3StorageAdapter],
      useFactory: (config: ConfigService<Env, true>, mock: MockStorageAdapter, s3: S3StorageAdapter) =>
        config.get('STORAGE_PROVIDER', { infer: true }) === 's3' ? s3 : mock,
    },
  ],
  exports: [StoragePort],
})
export class StorageModule {}
