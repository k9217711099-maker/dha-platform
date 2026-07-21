import { Injectable } from '@nestjs/common';
import { Observable, Subject } from 'rxjs';

export interface InboxEvent {
  /** Тип изменения ленты: escalated (новая эскалация) / message (сообщение гостя) / read (прочитано). */
  kind: 'escalated' | 'message' | 'read';
}

/**
 * Внутришинный pub/sub событий ленты эскалаций для realtime-бейджа непрочитанных (#1).
 * В памяти процесса (одиночный инстанс на MVP; при масштабировании — Redis pub/sub).
 * Все операторы видят одну очередь эскалаций — фильтрации по пользователю нет.
 */
@Injectable()
export class InboxEvents {
  private readonly subject = new Subject<InboxEvent>();

  publish(kind: InboxEvent['kind']): void {
    this.subject.next({ kind });
  }

  stream(): Observable<InboxEvent> {
    return this.subject.asObservable();
  }
}
