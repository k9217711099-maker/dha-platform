'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card, Input } from '@dha/ui';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth-context';
import type { ChatMessage } from '../../lib/api-types';

export default function ChatPage() {
  const router = useRouter();
  const { guest, loading } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && !guest) router.replace('/login');
  }, [loading, guest, router]);

  useEffect(() => {
    if (guest) api.getChat().then(setMessages).catch(() => undefined);
  }, [guest]);

  if (loading || !guest) {
    return <main className="mx-auto max-w-2xl px-6 py-16 text-dark-gray">Загрузка…</main>;
  }

  async function send() {
    if (!text.trim()) return;
    setBusy(true);
    try {
      const msg = await api.sendChat(text.trim());
      setMessages((m) => [...m, msg]);
      setText('');
    } catch {
      // показываем как есть
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <h1 className="mb-2 text-3xl font-light text-ink">Чат с ресепшен</h1>
      <p className="mb-6 text-sm text-dark-gray">
        Напишите нам — обращение попадёт в открытую линию администраторов.
      </p>

      <Card className="mb-4 max-h-[55vh] space-y-3 overflow-y-auto">
        {messages.length === 0 ? (
          <p className="text-sm text-dark-gray">Сообщений пока нет.</p>
        ) : (
          messages.map((m) => (
            <div key={m.id} className={m.direction === 'GUEST' ? 'text-right' : 'text-left'}>
              <span
                className={`inline-block rounded-lg px-3 py-2 text-sm ${
                  m.direction === 'GUEST' ? 'bg-ink text-white' : 'bg-beige text-ink'
                }`}
              >
                {m.text}
              </span>
              <p className="mt-0.5 text-[10px] text-dark-gray">
                {new Date(m.createdAt).toLocaleString('ru')}
              </p>
            </div>
          ))
        )}
      </Card>

      <div className="flex gap-2">
        <div className="flex-1">
          <Input
            id="msg"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Ваше сообщение"
            onKeyDown={(e) => {
              if (e.key === 'Enter') void send();
            }}
          />
        </div>
        <Button onClick={() => void send()} disabled={busy || !text.trim()}>
          Отправить
        </Button>
      </div>
    </main>
  );
}
