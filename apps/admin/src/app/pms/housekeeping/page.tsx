import { redirect } from 'next/navigation';

/** Раздел заменён модулем «Операции · Задачи» (TASKS-HOUSEKEEPING-TZ §12.5). */
export default function HousekeepingRedirect() {
  redirect('/ops/tasks?kind=CLEANING');
}
