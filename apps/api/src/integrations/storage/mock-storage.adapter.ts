import { Injectable, NotFoundException } from '@nestjs/common';
import { StoragePort } from './storage.port.js';

/** In-memory хранилище для разработки и тестов. */
@Injectable()
export class MockStorageAdapter extends StoragePort {
  private readonly objects = new Map<string, { body: Buffer; contentType: string }>();

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    this.objects.set(key, { body, contentType });
  }

  async get(key: string): Promise<Buffer> {
    const obj = this.objects.get(key);
    if (!obj) throw new NotFoundException('Объект не найден');
    return obj.body;
  }

  async getSignedUrl(key: string): Promise<string> {
    return `mock://documents/${key}`;
  }

  async delete(key: string): Promise<void> {
    this.objects.delete(key);
  }
}
