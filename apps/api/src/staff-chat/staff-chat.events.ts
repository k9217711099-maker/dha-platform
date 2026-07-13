import { Injectable } from '@nestjs/common';
import { Observable, Subject, filter, map } from 'rxjs';

export interface StaffChatEvent {
  chatId: string;
  /** id участников чата; пусто = broadcast всем подключённым (напр. presence). */
  memberIds: string[];
  kind: string;
  /** Кто (для typing/presence). */
  userId?: string;
  /** Онлайн ли (для presence). */
  online?: boolean;
  /** Автор нового сообщения (для уведомлений). */
  senderId?: string;
  /** Упомянутые (@) — для уведомлений об упоминании. */
  mentionIds?: string[];
  /** Короткий превью текста (для тела уведомления). */
  preview?: string;
}

export interface StaffChatStreamEvent {
  chatId: string;
  kind: string;
  userId?: string;
  online?: boolean;
  senderId?: string;
  mentionIds?: string[];
  preview?: string;
}

/**
 * Внутришинный pub/sub событий мессенджера (§2) для realtime через SSE. В памяти
 * процесса (одиночный инстанс на MVP; при масштабировании — Redis pub/sub).
 */
@Injectable()
export class StaffChatEvents {
  private readonly subject = new Subject<StaffChatEvent>();

  publish(event: StaffChatEvent): void {
    this.subject.next(event);
  }

  /** Поток событий для пользователя: его чаты + broadcast (presence). */
  forUser(userId: string): Observable<StaffChatStreamEvent> {
    return this.subject.asObservable().pipe(
      filter((e) => e.memberIds.length === 0 || e.memberIds.includes(userId)),
      map((e) => ({
        chatId: e.chatId,
        kind: e.kind,
        userId: e.userId,
        online: e.online,
        senderId: e.senderId,
        mentionIds: e.mentionIds,
        preview: e.preview,
      })),
    );
  }
}
