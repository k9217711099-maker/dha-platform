import { Injectable } from '@nestjs/common';
import { Observable, Subject, filter, map } from 'rxjs';

export interface OpsEvent {
  kind: 'task_created' | 'task_updated' | 'task_status' | 'task_comment' | 'plan_sent' | 'reminder' | 'escalation' | 'deadline';
  taskId?: string;
  /// Получатели (adminId). Пусто — всем подписчикам тенанта.
  userIds?: string[];
  payload?: Record<string, unknown>;
}

/** Шина событий модуля «Задачи и Уборка» (SSE, по образцу StaffChatEvents). */
@Injectable()
export class OpsEvents {
  private readonly subject = new Subject<OpsEvent>();

  emit(event: OpsEvent): void {
    this.subject.next(event);
  }

  /** Полный поток событий (для мостов доставки, напр. Web Push). */
  stream(): Observable<OpsEvent> {
    return this.subject.asObservable();
  }

  /** Поток событий для конкретного сотрудника (адресованные ему или широковещательные). */
  forUser(userId: string): Observable<OpsEvent> {
    return this.subject.pipe(
      filter((e) => !e.userIds || e.userIds.length === 0 || e.userIds.includes(userId)),
      map((e) => ({ ...e, userIds: undefined })),
    );
  }
}
