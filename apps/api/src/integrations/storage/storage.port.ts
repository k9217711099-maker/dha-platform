/**
 * Порт объектного хранилища (S3-совместимое). Реализации: MockStorageAdapter
 * (in-memory, разработка) и S3StorageAdapter (Yandex Object Storage / MinIO).
 * Сканы документов кладутся УЖЕ зашифрованными (шифрование — на стороне приложения).
 */
export abstract class StoragePort {
  abstract put(key: string, body: Buffer, contentType: string): Promise<void>;
  abstract get(key: string): Promise<Buffer>;
  /** Временная подписанная ссылка на объект (для просмотра администратором). */
  abstract getSignedUrl(key: string, expiresSec?: number): Promise<string>;
  abstract delete(key: string): Promise<void>;
}
