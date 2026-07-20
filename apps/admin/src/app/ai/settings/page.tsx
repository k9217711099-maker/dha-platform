'use client';

import { useEffect, useState } from 'react';
import { Button, Card } from '@dha/ui';
import { adminApi, type AiChannel, type EmailAdminConfig, type MaxAdminConfig, type TelegramAdminConfig, type TgUserbotState, type UmnicoAdminConfig, type WaState } from '../../../lib/api';
import { useRequireAdmin } from '../../../lib/use-admin';
import { useEsc } from '../../../lib/use-esc';

const fieldCls = 'w-full rounded-md border border-ink/20 bg-white px-3 py-2 text-sm';
const labelCls = 'mb-1 block text-xs font-medium text-dark-gray';

type Tab = 'integrations';
const TABS: { id: Tab; label: string }[] = [{ id: 'integrations', label: 'Интеграции' }];

export default function AiSettingsPage() {
  const ready = useRequireAdmin();
  const [tab, setTab] = useState<Tab>('integrations');
  if (!ready) return <main className="px-8 py-12 text-dark-gray">Загрузка…</main>;
  return (
    <main className="px-8 py-8">
      <h1 className="mb-1 text-3xl font-light text-ink">AI и коммуникации · настройки</h1>
      <p className="mb-6 text-sm text-dark-gray">
        Каналы, через которые гость общается с AI-агентом и операторами. Подключение — вводом реквизитов аккаунта; часть каналов работает из коробки.
      </p>

      <div className="mb-6 flex flex-wrap gap-1 border-b border-ink/10">
        {TABS.map((t) => (
          <button key={t.id} type="button" onClick={() => setTab(t.id)}
            className={`-mb-px border-b-2 px-4 py-2.5 text-sm transition ${tab === t.id ? 'border-ink font-medium text-ink' : 'border-transparent text-dark-gray hover:text-ink'}`}>{t.label}</button>
        ))}
      </div>

      {tab === 'integrations' ? <IntegrationsTab /> : null}
    </main>
  );
}

// ─── Интеграции (каналы) ───
function IntegrationsTab() {
  const [items, setItems] = useState<AiChannel[]>([]);
  const [configuring, setConfiguring] = useState<AiChannel['id'] | null>(null);
  const [openSetup, setOpenSetup] = useState<string | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);
  const [aiOn, setAiOn] = useState<boolean | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const load = () => adminApi.aiChannels().then(setItems).catch(() => setItems([]));
  useEffect(() => { void load(); void adminApi.aiAgentEnabled().then((r) => setAiOn(r.enabled)).catch(() => setAiOn(true)); }, []);

  const setEnabled = async (id: string, enabled: boolean) => {
    setToggling(id);
    try { setItems(await adminApi.aiSetChannelEnabled(id, enabled)); } catch { /* игнор */ } finally { setToggling(null); }
  };
  const setChannelAi = async (id: string, enabled: boolean) => {
    setToggling(id);
    try { setItems(await adminApi.aiSetChannelAi(id, enabled)); } catch { /* игнор */ } finally { setToggling(null); }
  };
  const toggleAi = async () => {
    if (aiOn === null) return;
    setAiBusy(true);
    try { const r = await adminApi.aiSetAgentEnabled(!aiOn); setAiOn(r.enabled); } catch { /* игнор */ } finally { setAiBusy(false); }
  };

  return (
    <div className="max-w-2xl space-y-4">
      <Card className="flex items-center justify-between gap-4 p-5">
        <div className="min-w-0">
          <p className="text-lg font-medium text-ink">AI-агент {aiOn === false ? <span className="text-amber-700">выключен</span> : <span className="text-emerald-700">включён</span>}</p>
          <p className="mt-1 text-sm text-dark-gray">
            {aiOn === false
              ? 'AI не отвечает автоматически. Все входящие из всех каналов идут оператору в «ленту эскалаций» — отвечаете вручную.'
              : 'AI отвечает гостям автоматически во всех каналах. Выключите, чтобы переписки шли только оператору.'}
          </p>
        </div>
        <button type="button" role="switch" aria-checked={!!aiOn} aria-label="AI-агент вкл/выкл" disabled={aiBusy || aiOn === null}
          onClick={() => void toggleAi()}
          className={`relative h-6 w-11 shrink-0 rounded-full transition disabled:opacity-50 ${aiOn ? 'bg-emerald-500' : 'bg-ink/20'}`}>
          <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${aiOn ? 'left-[22px]' : 'left-0.5'}`} />
        </button>
      </Card>
      {items.map((i) => (
        <Card key={i.id} className="p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-lg font-medium text-ink">{i.name}</p>
                {!i.available
                  ? <span className="rounded-full bg-ink/10 px-2 py-0.5 text-xs text-dark-gray">Скоро (v2)</span>
                  : i.toggleable && !i.enabled
                  ? <span className="rounded-full bg-ink/10 px-2 py-0.5 text-xs text-dark-gray">Выключено</span>
                  : <span className={`rounded-full px-2 py-0.5 text-xs ${i.connected ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                      {i.connected ? 'Подключено' : 'Не настроено'}
                    </span>}
                {i.available && !i.needsSetup ? <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs text-sky-800">Из коробки</span> : null}
              </div>
              <p className="mt-1 text-sm text-dark-gray">{i.description}</p>

              <div className="mt-3 flex flex-wrap gap-2">
                {i.id === 'telegram' && i.available && i.enabled ? (
                  <Button variant="secondary" onClick={() => setConfiguring('telegram')}>Настроить</Button>
                ) : null}
                {i.id === 'max' && i.available && i.enabled ? (
                  <Button variant="secondary" onClick={() => setConfiguring('max')}>Настроить</Button>
                ) : null}
                {i.id === 'whatsapp' && i.available && i.enabled ? (
                  <Button variant="secondary" onClick={() => setConfiguring('whatsapp')}>Настроить</Button>
                ) : null}
                {i.id === 'tg_direct' && i.available && i.enabled ? (
                  <Button variant="secondary" onClick={() => setConfiguring('tg_direct')}>Настроить</Button>
                ) : null}
                {i.id === 'umnico' && i.available ? (
                  <Button variant="secondary" onClick={() => setConfiguring('umnico')}>Настроить</Button>
                ) : null}
                {i.id === 'email' && i.available ? (
                  <Button variant="secondary" onClick={() => setConfiguring('email')}>Настроить</Button>
                ) : null}
                {i.setup ? (
                  <Button variant="secondary" onClick={() => setOpenSetup(openSetup === i.id ? null : i.id)}>
                    {openSetup === i.id ? 'Скрыть инструкцию' : 'Инструкция'}
                  </Button>
                ) : null}
              </div>

              {openSetup === i.id && i.setup ? (
                <pre className="mt-3 whitespace-pre-wrap rounded-md bg-ink/[0.03] px-3 py-2 text-xs leading-relaxed text-dark-gray">{i.setup}</pre>
              ) : null}
            </div>
            {i.available && i.toggleable ? (
              <div className="flex shrink-0 flex-col items-end gap-1.5">
                <div className="flex items-center gap-2">
                  <span className="w-9 text-right text-[11px] text-dark-gray">Канал</span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={i.enabled}
                    aria-label={i.enabled ? 'Выключить канал' : 'Включить канал'}
                    disabled={toggling === i.id}
                    onClick={() => void setEnabled(i.id, !i.enabled)}
                    className={`relative h-6 w-11 rounded-full transition disabled:opacity-50 ${i.enabled ? 'bg-emerald-500' : 'bg-ink/20'}`}
                  >
                    <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${i.enabled ? 'left-[22px]' : 'left-0.5'}`} />
                  </button>
                </div>
                {i.category === 'guest' ? (
                  <div className="flex items-center gap-2">
                    <span className="w-9 text-right text-[11px] text-dark-gray">AI</span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={i.aiEnabled}
                      aria-label={i.aiEnabled ? 'Выключить AI на канале' : 'Включить AI на канале'}
                      disabled={toggling === i.id || !i.enabled}
                      onClick={() => void setChannelAi(i.id, !i.aiEnabled)}
                      className={`relative h-6 w-11 rounded-full transition disabled:opacity-40 ${i.aiEnabled && i.enabled ? 'bg-sky-500' : 'bg-ink/20'}`}
                    >
                      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${i.aiEnabled ? 'left-[22px]' : 'left-0.5'}`} />
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
          {!i.available ? <p className="mt-3 rounded-md bg-ink/[0.03] px-3 py-2 text-xs text-dark-gray">Канал появится на следующем этапе. Здесь будут поля подключения аккаунта.</p> : null}
        </Card>
      ))}
      {items.length === 0 ? <Card className="p-6 text-sm text-dark-gray">Загрузка каналов…</Card> : null}
      {configuring === 'telegram' ? <TelegramSettingsModal onClose={() => setConfiguring(null)} onSaved={() => { setConfiguring(null); void load(); }} /> : null}
      {configuring === 'max' ? <MaxSettingsModal onClose={() => setConfiguring(null)} onSaved={() => { setConfiguring(null); void load(); }} /> : null}
      {configuring === 'whatsapp' ? <WhatsAppSettingsModal onClose={() => { setConfiguring(null); void load(); }} /> : null}
      {configuring === 'tg_direct' ? <TgDirectSettingsModal onClose={() => { setConfiguring(null); void load(); }} /> : null}
      {configuring === 'email' ? <EmailSettingsModal onClose={() => setConfiguring(null)} onSaved={() => { setConfiguring(null); void load(); }} /> : null}
      {configuring === 'umnico' ? <UmnicoSettingsModal onClose={() => setConfiguring(null)} onSaved={() => { setConfiguring(null); void load(); }} /> : null}
    </div>
  );
}

// ─── Настройка Telegram-бота ───
function TelegramSettingsModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  useEsc(onClose);
  const [cfg, setCfg] = useState<TelegramAdminConfig | null>(null);
  const [token, setToken] = useState('');
  const [secret, setSecret] = useState('');
  const [username, setUsername] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  useEffect(() => {
    void adminApi.aiTelegramConfig().then((c) => { setCfg(c); setUsername(c.botUsername); }).catch(() => setErr('Не удалось загрузить настройки'));
  }, []);

  const save = async () => {
    setBusy(true); setErr('');
    try {
      await adminApi.aiSaveTelegram({
        botToken: token || undefined,
        botUsername: username,
        webhookSecret: secret || undefined,
      });
      onSaved();
    } catch (e) { setErr(e instanceof Error ? e.message : 'Ошибка сохранения'); } finally { setBusy(false); }
  };

  const test = async () => {
    setTesting(true); setErr(''); setTestResult(null);
    try {
      const r = await adminApi.aiTestTelegram(token || undefined);
      setTestResult(r);
    } catch (e) { setTestResult({ ok: false, message: e instanceof Error ? e.message : 'Ошибка проверки' }); } finally { setTesting(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <Card className="max-h-[90vh] w-full max-w-lg overflow-auto p-6" onClick={(e) => e.stopPropagation()}>
        <div className="mb-1 flex items-center justify-between">
          <p className="text-xl font-light text-ink">Telegram-бот</p>
          {cfg ? <span className={`rounded-full px-2 py-0.5 text-xs ${cfg.connected ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>{cfg.connected ? 'Подключено' : 'Не настроено'}</span> : null}
        </div>
        <p className="mb-5 text-sm text-dark-gray">Токен выдаёт @BotFather при создании бота. После сохранения нажмите «Проверить подключение», затем один раз зарегистрируйте вебхук (см. инструкцию внизу).</p>

        {!cfg ? <p className="text-sm text-dark-gray">Загрузка…</p> : (
          <>
            <div className="space-y-3">
              <div>
                <label className={labelCls}>Токен бота (@BotFather)</label>
                <input type="password" value={token} onChange={(e) => setToken(e.target.value)} className={fieldCls} autoComplete="new-password"
                  placeholder={cfg.tokenSet ? '•••••••• (задан — оставьте пустым, чтобы не менять)' : 'например 123456789:AA...'} />
                <p className="mt-1 text-xs text-dark-gray">Хранится в зашифрованном виде и обратно не показывается.</p>
              </div>
              <div>
                <label className={labelCls}>Username бота (без @)</label>
                <input value={username} onChange={(e) => setUsername(e.target.value)} className={fieldCls} placeholder="dha_bot" autoComplete="off" />
                <p className="mt-1 text-xs text-dark-gray">По нему собирается ссылка для гостей: t.me/&lt;username&gt;.{cfg.botLink ? ` Текущая: ${cfg.botLink}` : ''}</p>
              </div>
              <div>
                <label className={labelCls}>Секрет вебхука</label>
                <input type="password" value={secret} onChange={(e) => setSecret(e.target.value)} className={fieldCls} autoComplete="new-password"
                  placeholder={cfg.webhookSecretSet ? '•••••••• (задан — оставьте пустым, чтобы не менять)' : 'любая длинная строка'} />
                <p className="mt-1 text-xs text-dark-gray">Проверяется в заголовке входящих вебхуков (X-Telegram-Bot-Api-Secret-Token).</p>
              </div>
            </div>

            {testResult ? <p className={`mt-4 rounded-md px-3 py-2 text-sm ${testResult.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'}`}>{testResult.ok ? '✓ ' : '✕ '}{testResult.message}</p> : null}
            {err ? <p className="mt-3 text-sm text-red-600">{err}</p> : null}

            <div className="mt-6 flex flex-wrap items-center gap-2">
              <Button onClick={save} disabled={busy || testing}>{busy ? 'Сохранение…' : 'Сохранить'}</Button>
              <Button variant="secondary" onClick={test} disabled={busy || testing}>{testing ? 'Проверка…' : 'Проверить подключение'}</Button>
              <Button variant="secondary" onClick={onClose} disabled={busy || testing}>Отмена</Button>
            </div>

            <div className="mt-5 rounded-md bg-ink/[0.03] px-3 py-3 text-xs leading-relaxed text-dark-gray">
              <p className="mb-1 font-medium text-ink">Регистрация вебхука (один раз)</p>
              <p>После сохранения токена подставьте свой публичный адрес API и откройте ссылку в браузере:</p>
              <code className="mt-1 block break-all rounded bg-white px-2 py-1">https://api.telegram.org/bot&lt;ТОКЕН&gt;/setWebhook?url=&lt;ПУБЛИЧНЫЙ_URL&gt;/api/ai/telegram/webhook&amp;secret_token=&lt;СЕКРЕТ&gt;</code>
              <p className="mt-1">Проверка подключения использует метод getMe и не трогает вебхук.</p>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}

// ─── Настройка MAX-бота ───
function MaxSettingsModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  useEsc(onClose);
  const [cfg, setCfg] = useState<MaxAdminConfig | null>(null);
  const [token, setToken] = useState('');
  const [username, setUsername] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  useEffect(() => {
    void adminApi.aiMaxConfig().then((c) => { setCfg(c); setUsername(c.botUsername); }).catch(() => setErr('Не удалось загрузить настройки'));
  }, []);

  const save = async () => {
    setBusy(true); setErr('');
    try {
      await adminApi.aiSaveMax({ botToken: token || undefined, botUsername: username });
      onSaved();
    } catch (e) { setErr(e instanceof Error ? e.message : 'Ошибка сохранения'); } finally { setBusy(false); }
  };

  const test = async () => {
    setTesting(true); setErr(''); setTestResult(null);
    try {
      const r = await adminApi.aiTestMax(token || undefined);
      setTestResult(r);
    } catch (e) { setTestResult({ ok: false, message: e instanceof Error ? e.message : 'Ошибка проверки' }); } finally { setTesting(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <Card className="max-h-[90vh] w-full max-w-lg overflow-auto p-6" onClick={(e) => e.stopPropagation()}>
        <div className="mb-1 flex items-center justify-between">
          <p className="text-xl font-light text-ink">MAX-бот</p>
          {cfg ? <span className={`rounded-full px-2 py-0.5 text-xs ${cfg.connected ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>{cfg.connected ? 'Подключено' : 'Не настроено'}</span> : null}
        </div>
        <p className="mb-5 text-sm text-dark-gray">Токен выдаёт @MasterBot при создании бота в MAX. После сохранения нажмите «Проверить подключение». Приём входящих — long polling, отдельная настройка вебхука не нужна.</p>

        {!cfg ? <p className="text-sm text-dark-gray">Загрузка…</p> : (
          <>
            <div className="space-y-3">
              <div>
                <label className={labelCls}>Токен бота (@MasterBot)</label>
                <input type="password" value={token} onChange={(e) => setToken(e.target.value)} className={fieldCls} autoComplete="new-password"
                  placeholder={cfg.tokenSet ? '•••••••• (задан — оставьте пустым, чтобы не менять)' : 'вставьте токен от @MasterBot'} />
                <p className="mt-1 text-xs text-dark-gray">Хранится в зашифрованном виде и обратно не показывается.</p>
              </div>
              <div>
                <label className={labelCls}>Username бота (без @)</label>
                <input value={username} onChange={(e) => setUsername(e.target.value)} className={fieldCls} placeholder="dha_bot" autoComplete="off" />
                <p className="mt-1 text-xs text-dark-gray">По нему собирается ссылка для гостей: max.ru/&lt;username&gt;.{cfg.botLink ? ` Текущая: ${cfg.botLink}` : ''}</p>
              </div>
            </div>

            {testResult ? <p className={`mt-4 rounded-md px-3 py-2 text-sm ${testResult.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'}`}>{testResult.ok ? '✓ ' : '✕ '}{testResult.message}</p> : null}
            {err ? <p className="mt-3 text-sm text-red-600">{err}</p> : null}

            <div className="mt-6 flex flex-wrap items-center gap-2">
              <Button onClick={save} disabled={busy || testing}>{busy ? 'Сохранение…' : 'Сохранить'}</Button>
              <Button variant="secondary" onClick={test} disabled={busy || testing}>{testing ? 'Проверка…' : 'Проверить подключение'}</Button>
              <Button variant="secondary" onClick={onClose} disabled={busy || testing}>Отмена</Button>
            </div>

            <div className="mt-5 rounded-md bg-ink/[0.03] px-3 py-3 text-xs leading-relaxed text-dark-gray">
              <p className="mb-1 font-medium text-ink">Как получить токен</p>
              <p>В приложении MAX найдите <b>@MasterBot</b> → создайте бота (имя и username) → скопируйте выданный токен и вставьте в поле выше. Сохраните и проверьте подключение — сервер начнёт опрашивать MAX автоматически.</p>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}

// ─── Настройка WhatsApp (Baileys) ───
const WA_BADGE: Record<WaState['status'], { label: string; cls: string }> = {
  disabled: { label: 'Выключено', cls: 'bg-ink/10 text-dark-gray' },
  disconnected: { label: 'Не подключено', cls: 'bg-amber-100 text-amber-800' },
  connecting: { label: 'Подключение…', cls: 'bg-sky-100 text-sky-800' },
  qr: { label: 'Ожидает QR', cls: 'bg-sky-100 text-sky-800' },
  connected: { label: 'Подключено', cls: 'bg-emerald-100 text-emerald-800' },
};

function WhatsAppSettingsModal({ onClose }: { onClose: () => void }) {
  useEsc(onClose);
  const [st, setSt] = useState<WaState | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    let alive = true;
    const tick = () => adminApi.aiWhatsappState().then((s) => { if (alive) setSt(s); }).catch(() => {});
    void tick();
    const id = setInterval(tick, 2000); // ловим появление QR и переход в «Подключено»
    return () => { alive = false; clearInterval(id); };
  }, []);

  const start = async () => {
    setBusy(true); setErr('');
    try { setSt(await adminApi.aiWhatsappStart()); } catch (e) { setErr(e instanceof Error ? e.message : 'Ошибка'); } finally { setBusy(false); }
  };
  const logout = async () => {
    if (!confirm('Отвязать номер WhatsApp и удалить сессию?')) return;
    setBusy(true); setErr('');
    try { setSt(await adminApi.aiWhatsappLogout()); } catch (e) { setErr(e instanceof Error ? e.message : 'Ошибка'); } finally { setBusy(false); }
  };

  const badge = st ? WA_BADGE[st.status] : null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <Card className="max-h-[90vh] w-full max-w-lg overflow-auto p-6" onClick={(e) => e.stopPropagation()}>
        <div className="mb-1 flex items-center justify-between">
          <p className="text-xl font-light text-ink">WhatsApp</p>
          {badge ? <span className={`rounded-full px-2 py-0.5 text-xs ${badge.cls}`}>{badge.label}</span> : null}
        </div>
        <p className="mb-4 text-sm text-dark-gray">Неофициальное подключение по QR (Baileys). Подключайте <b>отдельный номер</b> — за автоматизацию WhatsApp может заблокировать аккаунт.</p>

        {!st ? <p className="text-sm text-dark-gray">Загрузка…</p> : (
          <>
            <p className="mb-4 rounded-md bg-ink/[0.03] px-3 py-2 text-sm text-dark-gray">{st.message}</p>

            {st.status === 'qr' && st.qr ? (
              <div className="mb-4 flex flex-col items-center gap-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={st.qr} alt="QR для привязки WhatsApp" className="h-64 w-64 rounded-md border border-ink/10" />
                <p className="text-center text-xs text-dark-gray">WhatsApp → Настройки → Связанные устройства → Привязка устройства → сканируйте код. Код обновляется автоматически.</p>
              </div>
            ) : null}

            {st.status === 'connected' && st.me ? (
              <p className="mb-4 text-sm text-ink">Номер: <b>{st.me}</b></p>
            ) : null}

            {err ? <p className="mb-3 text-sm text-red-600">{err}</p> : null}

            <div className="flex flex-wrap items-center gap-2">
              {st.status === 'connected' ? (
                <Button variant="secondary" onClick={logout} disabled={busy}>{busy ? '…' : 'Отвязать номер'}</Button>
              ) : st.status === 'disabled' ? (
                <p className="text-xs text-amber-700">Канал выключен — включите переключателем на карточке.</p>
              ) : (
                <Button onClick={start} disabled={busy || st.status === 'connecting'}>{busy ? '…' : st.status === 'qr' ? 'Обновить' : 'Подключить'}</Button>
              )}
              <Button variant="secondary" onClick={onClose} disabled={busy}>Закрыть</Button>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}

// ─── Настройка Umnico (агрегатор) ───
function UmnicoSettingsModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  useEsc(onClose);
  const [cfg, setCfg] = useState<UmnicoAdminConfig | null>(null);
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [hooks, setHooks] = useState<{ id: number; url: string; name?: string; status?: number }[] | null>(null);
  const [hookBusy, setHookBusy] = useState(false);
  const [hookResult, setHookResult] = useState<{ ok: boolean; message: string } | null>(null);
  const webhookUrl = adminApi.aiUmnicoWebhookUrl();

  const loadHooks = () => { void adminApi.aiUmnicoWebhooks().then(setHooks).catch(() => setHooks([])); };
  useEffect(() => { void adminApi.aiUmnicoConfig().then(setCfg).catch(() => setErr('Не удалось загрузить настройки')); }, []);
  useEffect(() => { if (cfg?.tokenSet) loadHooks(); }, [cfg?.tokenSet]);

  const registerHook = async () => {
    setHookBusy(true); setHookResult(null);
    try {
      const r = await adminApi.aiRegisterUmnicoWebhook(webhookUrl);
      setHookResult(r);
      if (r.ok) loadHooks();
    } catch (e) { setHookResult({ ok: false, message: e instanceof Error ? e.message : 'Ошибка регистрации' }); }
    finally { setHookBusy(false); }
  };

  const save = async () => {
    setBusy(true); setErr('');
    try { setCfg(await adminApi.aiSaveUmnico({ token: token || undefined })); onSaved(); }
    catch (e) { setErr(e instanceof Error ? e.message : 'Ошибка сохранения'); } finally { setBusy(false); }
  };
  const test = async () => {
    setTesting(true); setErr(''); setTestResult(null);
    try {
      const r = await adminApi.aiTestUmnico(token || undefined);
      setTestResult(r);
      if (r.ok) { await adminApi.aiSaveUmnico({ token: token || undefined }); setCfg(await adminApi.aiUmnicoConfig()); }
    } catch (e) { setTestResult({ ok: false, message: e instanceof Error ? e.message : 'Ошибка проверки' }); } finally { setTesting(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <Card className="max-h-[90vh] w-full max-w-lg overflow-auto p-6" onClick={(e) => e.stopPropagation()}>
        <div className="mb-1 flex items-center justify-between">
          <p className="text-xl font-light text-ink">Umnico (агрегатор)</p>
          {cfg ? <span className={`rounded-full px-2 py-0.5 text-xs ${cfg.connected ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>{cfg.connected ? 'Подключено' : 'Не настроено'}</span> : null}
        </div>
        <p className="mb-5 text-sm text-dark-gray">Единое окно для мессенджеров через Umnico. Токен — в Umnico → Настройки → API. Подключением WhatsApp/Telegram и т.д. занимается сам Umnico (прокси и api_id не нужны).</p>

        {!cfg ? <p className="text-sm text-dark-gray">Загрузка…</p> : (
          <>
            <div>
              <label className={labelCls}>API-токен Umnico</label>
              <input type="password" value={token} onChange={(e) => setToken(e.target.value)} className={fieldCls} autoComplete="new-password"
                placeholder={cfg.tokenSet ? '•••••••• (задан — оставьте пустым, чтобы не менять)' : 'вставьте токен из настроек Umnico'} />
              <p className="mt-1 text-xs text-dark-gray">Хранится в зашифрованном виде.</p>
            </div>

            {cfg.channels.length > 0 ? (
              <div className="mt-4">
                <p className="mb-1 text-sm font-medium text-ink">Подключённые каналы Umnico ({cfg.channels.length})</p>
                <div className="overflow-hidden rounded-md border border-ink/10">
                  {cfg.channels.map((c) => (
                    <div key={c.id} className="flex items-center justify-between border-b border-ink/5 px-3 py-1.5 text-sm last:border-b-0">
                      <span className="text-ink">{c.label}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] ${c.status === 'active' ? 'bg-emerald-100 text-emerald-800' : 'bg-ink/10 text-dark-gray'}`}>{c.status || '—'}</span>
                    </div>
                  ))}
                </div>
                <p className="mt-1 text-xs text-dark-gray">Эти каналы можно выбирать в этапах воронки (в списке появятся как «Umnico · …»).</p>
              </div>
            ) : cfg.tokenSet ? <p className="mt-3 text-xs text-dark-gray">Каналы не найдены — проверьте, что в Umnico подключены мессенджеры и токен верный.</p> : null}

            {testResult ? <p className={`mt-4 rounded-md px-3 py-2 text-sm ${testResult.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'}`}>{testResult.ok ? '✓ ' : '✕ '}{testResult.message}</p> : null}
            {err ? <p className="mt-3 text-sm text-red-600">{err}</p> : null}

            <div className="mt-6 flex flex-wrap items-center gap-2">
              <Button onClick={save} disabled={busy || testing}>{busy ? 'Сохранение…' : 'Сохранить'}</Button>
              <Button variant="secondary" onClick={test} disabled={busy || testing}>{testing ? 'Проверка…' : 'Проверить подключение'}</Button>
              <Button variant="secondary" onClick={onClose} disabled={busy || testing}>Отмена</Button>
            </div>

            <div className="mt-5 rounded-md bg-ink/[0.03] px-3 py-3 text-xs leading-relaxed text-dark-gray">
              <p className="mb-1 font-medium text-ink">Вебхук для входящих сообщений</p>
              <p>В личном кабинете Umnico такой настройки нет — вебхук регистрируется через API. Нажмите кнопку ниже: мы сами зарегистрируем этот адрес в Umnico (событие «входящее сообщение»).</p>
              <code className="mt-1 block break-all rounded bg-white px-2 py-1">{webhookUrl}</code>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Button variant="secondary" onClick={registerHook} disabled={hookBusy || !cfg.tokenSet}>
                  {hookBusy ? 'Регистрация…' : 'Зарегистрировать вебхук'}
                </Button>
                {!cfg.tokenSet ? <span className="text-[11px] text-amber-700">Сначала сохраните токен.</span> : null}
              </div>
              {hookResult ? <p className={`mt-2 ${hookResult.ok ? 'text-emerald-700' : 'text-red-600'}`}>{hookResult.ok ? '✓ ' : '✕ '}{hookResult.message}</p> : null}
              {hooks && hooks.length > 0 ? (
                <div className="mt-2">
                  <p className="font-medium text-ink">Зарегистрированные вебхуки ({hooks.length}):</p>
                  {hooks.map((h) => (
                    <div key={h.id} className="mt-0.5 flex items-center gap-2 break-all">
                      <span className={`inline-block h-1.5 w-1.5 rounded-full ${h.status === 0 ? 'bg-ink/30' : 'bg-emerald-500'}`} />
                      <span>{h.url}</span>
                    </div>
                  ))}
                </div>
              ) : hooks ? <p className="mt-2">Вебхуки ещё не зарегистрированы.</p> : null}
            </div>
          </>
        )}
      </Card>
    </div>
  );
}

// ─── Настройка Email (SMTP) ───
function EmailSettingsModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  useEsc(onClose);
  const [cfg, setCfg] = useState<EmailAdminConfig | null>(null);
  const [host, setHost] = useState('');
  const [port, setPort] = useState('465');
  const [secure, setSecure] = useState(true);
  const [user, setUser] = useState('');
  const [pass, setPass] = useState('');
  const [from, setFrom] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  useEffect(() => {
    void adminApi.aiEmailConfig().then((c) => {
      setCfg(c); setHost(c.host); setPort(String(c.port)); setSecure(c.secure); setUser(c.user); setFrom(c.from);
    }).catch(() => setErr('Не удалось загрузить настройки'));
  }, []);

  // Отправка напрямую (порт открыт) — принудительно очищаем возможный сохранённый прокси.
  const payload = () => ({ host, port: Number(port), secure, user, pass: pass || undefined, from, proxy: '' });
  const save = async () => {
    setBusy(true); setErr('');
    try {
      await adminApi.aiSaveEmail(payload());
      onSaved();
    } catch (e) { setErr(e instanceof Error ? e.message : 'Ошибка сохранения'); } finally { setBusy(false); }
  };
  const test = async () => {
    setTesting(true); setErr(''); setTestResult(null);
    try {
      await adminApi.aiSaveEmail(payload());
      setTestResult(await adminApi.aiTestEmail());
    } catch (e) { setTestResult({ ok: false, message: e instanceof Error ? e.message : 'Ошибка проверки' }); } finally { setTesting(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <Card className="max-h-[90vh] w-full max-w-lg overflow-auto p-6" onClick={(e) => e.stopPropagation()}>
        <div className="mb-1 flex items-center justify-between">
          <p className="text-xl font-light text-ink">Email (SMTP)</p>
          {cfg ? <span className={`rounded-full px-2 py-0.5 text-xs ${cfg.configured ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>{cfg.configured ? 'Настроено' : 'Не настроено'}</span> : null}
        </div>
        <p className="mb-5 text-sm text-dark-gray">Реквизиты SMTP вашего почтового ящика. Пока не заданы — письма гостю (приглашения воронки, ссылки) не уходят, только пишутся в лог.</p>

        {!cfg ? <p className="text-sm text-dark-gray">Загрузка…</p> : (
          <>
            <div className="space-y-3">
              <div>
                <label className={labelCls}>SMTP-хост</label>
                <input value={host} onChange={(e) => setHost(e.target.value)} className={fieldCls} placeholder="smtp.yandex.ru" autoComplete="off" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Порт</label>
                  <input value={port} onChange={(e) => setPort(e.target.value)} inputMode="numeric" className={fieldCls} placeholder="465" />
                </div>
                <label className="flex items-end gap-2 pb-2 text-sm text-dark-gray">
                  <input type="checkbox" checked={secure} onChange={(e) => setSecure(e.target.checked)} /> SSL (порт 465)
                </label>
              </div>
              <div>
                <label className={labelCls}>Логин (адрес ящика)</label>
                <input value={user} onChange={(e) => setUser(e.target.value)} className={fieldCls} placeholder="noreply@nomero.online" autoComplete="off" />
              </div>
              <div>
                <label className={labelCls}>Пароль приложения</label>
                <input type="password" value={pass} onChange={(e) => setPass(e.target.value)} className={fieldCls} autoComplete="new-password"
                  placeholder={cfg.passSet ? '•••••••• (задан — оставьте пустым, чтобы не менять)' : 'пароль приложения'} />
                <p className="mt-1 text-xs text-dark-gray">Именно «пароль приложения» из настроек почты, не основной пароль. Хранится в зашифрованном виде.</p>
              </div>
              <div>
                <label className={labelCls}>Отправитель (From)</label>
                <input value={from} onChange={(e) => setFrom(e.target.value)} className={fieldCls} placeholder="D H&A <noreply@nomero.online>" autoComplete="off" />
              </div>
            </div>

            {testResult ? <p className={`mt-4 rounded-md px-3 py-2 text-sm ${testResult.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'}`}>{testResult.ok ? '✓ ' : '✕ '}{testResult.message}</p> : null}
            {err ? <p className="mt-3 text-sm text-red-600">{err}</p> : null}

            <div className="mt-6 flex flex-wrap items-center gap-2">
              <Button onClick={save} disabled={busy || testing}>{busy ? 'Сохранение…' : 'Сохранить'}</Button>
              <Button variant="secondary" onClick={test} disabled={busy || testing}>{testing ? 'Проверка…' : 'Сохранить и проверить'}</Button>
              <Button variant="secondary" onClick={onClose} disabled={busy || testing}>Отмена</Button>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}

// ─── Настройка Telegram Direct (userbot) ───
const UB_BADGE: Record<TgUserbotState['status'], { label: string; cls: string }> = {
  disabled: { label: 'Выключено', cls: 'bg-ink/10 text-dark-gray' },
  disconnected: { label: 'Не подключено', cls: 'bg-amber-100 text-amber-800' },
  awaiting_qr: { label: 'Ожидает QR', cls: 'bg-sky-100 text-sky-800' },
  awaiting_code: { label: 'Ожидает код', cls: 'bg-sky-100 text-sky-800' },
  awaiting_password: { label: 'Ожидает пароль', cls: 'bg-sky-100 text-sky-800' },
  connected: { label: 'Подключено', cls: 'bg-emerald-100 text-emerald-800' },
};

function TgDirectSettingsModal({ onClose }: { onClose: () => void }) {
  useEsc(onClose);
  const [st, setSt] = useState<TgUserbotState | null>(null);
  const [apiId, setApiId] = useState('');
  const [apiHash, setApiHash] = useState('');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    void adminApi.aiTgDirectState().then((s) => { setSt(s); if (s.phone) setPhone(s.phone); }).catch(() => setErr('Не удалось загрузить статус'));
  }, []);

  // При QR-входе QR и подключение приходят асинхронно — опрашиваем статус.
  useEffect(() => {
    if (st?.status !== 'awaiting_qr') return;
    const id = setInterval(() => { void adminApi.aiTgDirectState().then(setSt).catch(() => {}); }, 2000);
    return () => clearInterval(id);
  }, [st?.status]);

  const run = async (fn: () => Promise<TgUserbotState>) => {
    setBusy(true); setErr('');
    try { setSt(await fn()); } catch (e) { setErr(e instanceof Error ? e.message : 'Ошибка'); } finally { setBusy(false); }
  };

  const badge = st ? UB_BADGE[st.status] : null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <Card className="max-h-[90vh] w-full max-w-lg overflow-auto p-6" onClick={(e) => e.stopPropagation()}>
        <div className="mb-1 flex items-center justify-between">
          <p className="text-xl font-light text-ink">Telegram Direct (личный аккаунт)</p>
          {badge ? <span className={`rounded-full px-2 py-0.5 text-xs ${badge.cls}`}>{badge.label}</span> : null}
        </div>
        <p className="mb-4 text-sm text-dark-gray">Вход от личного аккаунта (userbot). ⚠️ Неофициально — риск блокировки аккаунта. Используйте <b>отдельный</b> аккаунт и SOCKS5-прокси.</p>

        {!st ? <p className="text-sm text-dark-gray">Загрузка…</p> : (
          <>
            <p className="mb-4 rounded-md bg-ink/[0.03] px-3 py-2 text-sm text-dark-gray">{st.message}</p>

            {st.status === 'disabled' ? (
              <p className="text-xs text-amber-700">Канал выключен — включите переключателем на карточке. Для подключения на сервере нужен SOCKS5-прокси (TG_USERBOT_PROXY).</p>
            ) : st.status === 'disconnected' ? (
              <div className="space-y-3">
                <div>
                  <label className={labelCls}>api_id</label>
                  <input value={apiId} onChange={(e) => setApiId(e.target.value)} className={fieldCls} placeholder="1234567" autoComplete="off" />
                </div>
                <div>
                  <label className={labelCls}>api_hash</label>
                  <input value={apiHash} onChange={(e) => setApiHash(e.target.value)} className={fieldCls} placeholder="abcdef0123456789..." autoComplete="off" />
                  <p className="mt-1 text-xs text-dark-gray">api_id и api_hash — на my.telegram.org → API development tools.</p>
                </div>
                <div>
                  <label className={labelCls}>Телефон (только для входа по телефону; для QR не нужен)</label>
                  <input value={phone} onChange={(e) => setPhone(e.target.value)} className={fieldCls} placeholder="+79990000000" autoComplete="off" />
                </div>
                <p className="text-xs text-dark-gray">Рекомендуем вход по QR (как в Telegram Web): нажмите «Войти по QR» и отсканируйте код в приложении Telegram → Настройки → Устройства.</p>
              </div>
            ) : st.status === 'awaiting_qr' ? (
              <div className="flex flex-col items-center gap-2">
                {st.qr ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={st.qr} alt="QR для входа в Telegram" className="h-60 w-60 rounded-md border border-ink/10" />
                ) : <p className="text-sm text-dark-gray">Готовим QR…</p>}
                <p className="text-center text-xs text-dark-gray">Telegram → Настройки → Устройства → «Подключить устройство» → отсканируйте код. Код обновляется автоматически.</p>
              </div>
            ) : st.status === 'awaiting_code' ? (
              <div>
                <label className={labelCls}>Код из Telegram</label>
                <input value={code} onChange={(e) => setCode(e.target.value)} className={fieldCls} placeholder="12345" autoComplete="off" />
                <p className="mt-1 text-xs text-dark-gray">Код придёт в приложение Telegram на номер {st.phone ?? phone}.</p>
              </div>
            ) : st.status === 'awaiting_password' ? (
              <div>
                <label className={labelCls}>Облачный пароль (2FA)</label>
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className={fieldCls} autoComplete="new-password" />
              </div>
            ) : st.status === 'connected' && st.me ? (
              <p className="text-sm text-ink">Аккаунт: <b>{st.me}</b></p>
            ) : null}

            {err ? <p className="mt-3 text-sm text-red-600">{err}</p> : null}

            <div className="mt-6 flex flex-wrap items-center gap-2">
              {st.status === 'disconnected' ? (
                <>
                  <Button onClick={() => run(() => adminApi.aiTgDirectStartQr({ apiId, apiHash }))} disabled={busy || !apiId || !apiHash}>{busy ? '…' : 'Войти по QR'}</Button>
                  <Button variant="secondary" onClick={() => run(() => adminApi.aiTgDirectStart({ apiId, apiHash, phone }))} disabled={busy || !apiId || !apiHash || !phone}>{busy ? '…' : 'Войти по телефону'}</Button>
                </>
              ) : st.status === 'awaiting_qr' ? (
                <Button variant="secondary" onClick={() => run(() => adminApi.aiTgDirectLogout())} disabled={busy}>Отмена входа</Button>
              ) : st.status === 'awaiting_code' ? (
                <Button onClick={() => run(() => adminApi.aiTgDirectCode(code))} disabled={busy || !code}>{busy ? '…' : 'Отправить код'}</Button>
              ) : st.status === 'awaiting_password' ? (
                <Button onClick={() => run(() => adminApi.aiTgDirectPassword(password))} disabled={busy || !password}>{busy ? '…' : 'Войти'}</Button>
              ) : st.status === 'connected' ? (
                <Button variant="secondary" onClick={() => run(() => adminApi.aiTgDirectLogout())} disabled={busy}>{busy ? '…' : 'Отвязать аккаунт'}</Button>
              ) : null}
              <Button variant="secondary" onClick={onClose} disabled={busy}>Закрыть</Button>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
