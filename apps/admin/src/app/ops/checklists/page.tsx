'use client';

import { useEffect, useState } from 'react';
import { Button, Card } from '@dha/ui';
import { adminApi, type OpsChecklist, type OpsSnapshotItem } from '../../../lib/api';
import { useRequireAdmin } from '../../../lib/use-admin';

type Row = { kind: 'HEADER' | 'ITEM' | 'SUBITEM'; text: string; thirdOption: string; requirePhoto: boolean; excludeFromScore: boolean };

const emptyRow = (kind: Row['kind'] = 'ITEM'): Row => ({ kind, text: '', thirdOption: '', requirePhoto: false, excludeFromScore: false });

const R = (kind: Row['kind'], text: string, opts: Partial<Row> = {}): Row => ({ ...emptyRow(kind), text, ...opts });

/** Готовые шаблоны чек-листов (библиотека, #13) — добавляются в один клик и потом правятся. */
const PRESETS: { name: string; desc: string; rows: Row[] }[] = [
  {
    name: 'Уборка номера после выезда',
    desc: 'Санузел, комната, финальная проверка',
    rows: [
      R('HEADER', 'Санузел'),
      R('ITEM', 'Унитаз вымыт и продезинфицирован', { requirePhoto: true }),
      R('ITEM', 'Раковина и смеситель без налёта'),
      R('ITEM', 'Душ/ванна вымыты'),
      R('ITEM', 'Зеркало без разводов'),
      R('ITEM', 'Полотенца заменены'),
      R('ITEM', 'Расходники пополнены (мыло, бумага, шампунь)'),
      R('HEADER', 'Комната'),
      R('ITEM', 'Постельное бельё заменено', { requirePhoto: true }),
      R('ITEM', 'Пол вымыт / пропылесосен'),
      R('ITEM', 'Пыль вытерта (поверхности, техника)'),
      R('ITEM', 'Мусор вынесен, корзины чистые'),
      R('ITEM', 'Окна и подоконники чистые'),
      R('ITEM', 'Мини-бар проверен и пополнен'),
      R('HEADER', 'Проверка'),
      R('ITEM', 'Техника работает (ТВ, кондиционер, свет)'),
      R('ITEM', 'Номер проветрен, запах свежий'),
      R('ITEM', 'Забытые вещи гостя проверены'),
    ],
  },
  {
    name: 'Текущая уборка (в проживании)',
    desc: 'Быстрое обслуживание занятого номера',
    rows: [
      R('ITEM', 'Заправить кровать'),
      R('ITEM', 'Освежить санузел'),
      R('ITEM', 'Заменить полотенца по запросу'),
      R('ITEM', 'Вынести мусор'),
      R('ITEM', 'Пополнить расходники'),
      R('ITEM', 'Проветрить номер'),
    ],
  },
  {
    name: 'Приёмка номера после ремонта',
    desc: 'Отделка, сантехника, электрика',
    rows: [
      R('HEADER', 'Отделка'),
      R('ITEM', 'Стены/потолок без дефектов', { requirePhoto: true }),
      R('ITEM', 'Пол и плинтусы ровные, без сколов'),
      R('ITEM', 'Двери открываются/закрываются, замок работает'),
      R('HEADER', 'Сантехника'),
      R('ITEM', 'Нет протечек', { requirePhoto: true }),
      R('ITEM', 'Напор воды в норме'),
      R('ITEM', 'Слив работает'),
      R('HEADER', 'Электрика'),
      R('ITEM', 'Все розетки работают'),
      R('ITEM', 'Освещение исправно'),
      R('ITEM', 'Выключатели работают'),
    ],
  },
  {
    name: 'Проверка перед заездом гостя',
    desc: 'Финальная готовность номера',
    rows: [
      R('ITEM', 'Номер убран и готов', { requirePhoto: true }),
      R('ITEM', 'Ключ / замок настроен'),
      R('ITEM', 'Температура комфортная'),
      R('ITEM', 'Приветственный набор на месте'),
      R('ITEM', 'Wi-Fi работает'),
      R('ITEM', 'Нет следов предыдущего гостя'),
    ],
  },
  {
    name: 'Общественные зоны (ежедневно)',
    desc: 'Холл, коридоры, общие санузлы',
    rows: [
      R('ITEM', 'Холл и ресепшн убраны'),
      R('ITEM', 'Лифты чистые'),
      R('ITEM', 'Коридоры и лестницы вымыты'),
      R('ITEM', 'Санузлы общего пользования'),
      R('ITEM', 'Урны опустошены'),
      R('ITEM', 'Входная зона и стекло'),
    ],
  },
  // ——— Хозяйственная деятельность отеля: инженерия, регламент, обходы (#13) ———
  {
    name: 'Инженерный обход (ежедневный)',
    desc: 'ИТП, вода, электрика, вентиляция, лифты',
    rows: [
      R('HEADER', 'Теплоузел / ИТП'),
      R('ITEM', 'Давление и температура в норме', { requirePhoto: true }),
      R('ITEM', 'Нет протечек и посторонних шумов'),
      R('ITEM', 'Насосы работают штатно'),
      R('HEADER', 'Водоснабжение'),
      R('ITEM', 'Напор холодной/горячей воды в норме'),
      R('ITEM', 'Температура ГВС ≥ 60 °C'),
      R('ITEM', 'Нет протечек в санузлах общих зон'),
      R('HEADER', 'Электрохозяйство'),
      R('ITEM', 'Показания счётчиков сняты'),
      R('ITEM', 'Щиты закрыты, нет запаха гари', { requirePhoto: true }),
      R('ITEM', 'Аварийное освещение исправно'),
      R('HEADER', 'Вентиляция и лифты'),
      R('ITEM', 'Приточно-вытяжная вентиляция работает'),
      R('ITEM', 'Лифты в работе, кабины чистые'),
      R('ITEM', 'Связь «лифт–диспетчер» исправна'),
    ],
  },
  {
    name: 'ППР инженерных систем (регламент)',
    desc: 'Планово-предупредительное ТО, ежемесячно',
    rows: [
      R('HEADER', 'Отопление / ИТП'),
      R('ITEM', 'Проверка запорной арматуры'),
      R('ITEM', 'Промывка фильтров'),
      R('ITEM', 'Проверка КИП (манометры/термометры)', { requirePhoto: true }),
      R('HEADER', 'Электрика'),
      R('ITEM', 'Протяжка контактов в щитах'),
      R('ITEM', 'Проверка УЗО/автоматов «тест»'),
      R('ITEM', 'Замер сопротивления заземления (по графику)'),
      R('HEADER', 'Вентиляция / кондиционирование'),
      R('ITEM', 'Замена/чистка фильтров', { requirePhoto: true }),
      R('ITEM', 'Чистка сплит-систем, слив дренажа'),
      R('ITEM', 'Проверка ремней и подшипников вентиляторов'),
      R('HEADER', 'Сантехника'),
      R('ITEM', 'Проверка запорной арматуры стояков'),
      R('ITEM', 'Ревизия насосов и обратных клапанов'),
      R('ITEM', 'Отметка в журнале ППР', { excludeFromScore: true }),
    ],
  },
  {
    name: 'Пожарная безопасность (обход)',
    desc: 'Еженедельный контроль ПБ',
    rows: [
      R('ITEM', 'Огнетушители на местах, сроки поверки в норме', { requirePhoto: true }),
      R('ITEM', 'Эвакуационные выходы свободны и не заперты', { requirePhoto: true }),
      R('ITEM', 'Двери эвакуационных выходов исправны (доводчики)'),
      R('ITEM', 'Знаки эвакуации и указатели читаемы, подсвечены'),
      R('ITEM', 'Пожарная сигнализация «норма» на панели'),
      R('ITEM', 'Пожарные краны/шкафы укомплектованы'),
      R('ITEM', 'Планы эвакуации на этажах на месте'),
      R('ITEM', 'Пути эвакуации не загромождены'),
      R('ITEM', 'Отметка в журнале ПБ', { excludeFromScore: true }),
    ],
  },
  {
    name: 'Обход здания (открытие смены)',
    desc: 'Инженер / дежурный: приём объекта',
    rows: [
      R('HEADER', 'Периметр и входы'),
      R('ITEM', 'Фасад и входная группа без повреждений'),
      R('ITEM', 'Двери и замки исправны, доводчики работают'),
      R('ITEM', 'Освещение фасада/двора включается'),
      R('HEADER', 'Внутри'),
      R('ITEM', 'Холл, лифты, коридоры — освещение и чистота'),
      R('ITEM', 'Температура в общих зонах комфортная'),
      R('ITEM', 'Нет протечек, посторонних запахов, шума'),
      R('HEADER', 'Безопасность'),
      R('ITEM', 'Видеонаблюдение пишет, мониторы работают'),
      R('ITEM', 'Домофоны/СКУД исправны'),
      R('ITEM', 'Замечания переданы (журнал/задача)', { excludeFromScore: true }),
    ],
  },
  {
    name: 'Лифтовое хозяйство (осмотр)',
    desc: 'Ежесменный осмотр лифтов',
    rows: [
      R('ITEM', 'Кабина чистая, освещение работает'),
      R('ITEM', 'Точность остановки на этажах'),
      R('ITEM', 'Двери открываются/закрываются плавно'),
      R('ITEM', 'Кнопки и индикация исправны'),
      R('ITEM', 'Двусторонняя связь с диспетчером', { requirePhoto: true }),
      R('ITEM', 'Нет посторонних шумов/вибраций'),
      R('ITEM', 'Табличка с датой освидетельствования актуальна'),
    ],
  },
  {
    name: 'Слаботочные системы (проверка)',
    desc: 'Wi-Fi, видеонаблюдение, СКУД, ТВ',
    rows: [
      R('ITEM', 'Wi-Fi доступен на всех этажах'),
      R('ITEM', 'Скорость интернета в норме'),
      R('ITEM', 'Камеры онлайн, архив пишется', { requirePhoto: true }),
      R('ITEM', 'СКУД/электронные замки на связи'),
      R('ITEM', 'ТВ/IPTV в номерах работает'),
      R('ITEM', 'ИБП/серверная — питание и охлаждение в норме'),
    ],
  },
];

/** Конструктор чек-листов (§5.1): заголовки → пункты → подпункты, доп. вариант, фото. */
export default function ChecklistsPage() {
  const ready = useRequireAdmin();
  const [lists, setLists] = useState<OpsChecklist[]>([]);
  const [editing, setEditing] = useState<{ id?: string; name: string; rows: Row[] } | null>(null);
  const [error, setError] = useState('');
  const [showLibrary, setShowLibrary] = useState(false);

  // Открыть редактор как НОВЫЙ чек-лист с готовыми строками (дублирование / шаблон из библиотеки, #13).
  const openDraft = (name: string, rows: Row[]) => {
    setShowLibrary(false);
    setEditing({ name, rows: rows.length ? rows.map((r) => ({ ...r })) : [emptyRow()] });
  };
  const duplicate = (cl: OpsChecklist) => {
    const items = [...(cl.items as unknown as (OpsSnapshotItem & { order: number })[])].sort((a, b) => a.order - b.order);
    openDraft(
      `${cl.name} (копия)`,
      items.map((i) => ({ kind: i.kind, text: i.text, thirdOption: i.thirdOption ?? '', requirePhoto: i.requirePhoto, excludeFromScore: i.excludeFromScore })),
    );
  };

  const load = () => adminApi.opsChecklists().then(setLists).catch(() => undefined);
  useEffect(() => { if (ready) void load(); }, [ready]);

  const startEdit = (cl?: OpsChecklist) => {
    if (!cl) { setEditing({ name: '', rows: [emptyRow()] }); return; }
    const items = [...(cl.items as unknown as (OpsSnapshotItem & { parentId: string | null })[])].sort((a, b) => a.order - b.order);
    setEditing({
      id: cl.id,
      name: cl.name,
      rows: items.map((i) => ({ kind: i.kind, text: i.text, thirdOption: i.thirdOption ?? '', requirePhoto: i.requirePhoto, excludeFromScore: i.excludeFromScore })),
    });
  };

  const save = () => {
    if (!editing) return;
    setError('');
    // parentIndex: подпункт цепляется к ближайшему пункту выше (§5.1).
    let lastItemIdx: number | null = null;
    const items = editing.rows.filter((r) => r.text.trim()).map((r, idx) => {
      if (r.kind === 'ITEM') lastItemIdx = idx;
      return {
        kind: r.kind, text: r.text.trim(), thirdOption: r.thirdOption.trim() || undefined,
        requirePhoto: r.requirePhoto, excludeFromScore: r.excludeFromScore,
        parentIndex: r.kind === 'SUBITEM' ? lastItemIdx : null,
      };
    });
    void adminApi.opsSaveChecklist({ name: editing.name.trim(), items }, editing.id)
      .then(() => { setEditing(null); void load(); })
      .catch((e) => setError(e instanceof Error ? e.message : 'Ошибка'));
  };

  const setRow = (idx: number, patch: Partial<Row>) => setEditing((e) => e && ({ ...e, rows: e.rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)) }));
  const move = (idx: number, dir: -1 | 1) => setEditing((e) => {
    if (!e) return e;
    const rows = [...e.rows];
    const j = idx + dir;
    if (j < 0 || j >= rows.length) return e;
    [rows[idx], rows[j]] = [rows[j]!, rows[idx]!];
    return { ...e, rows };
  });

  if (!ready) return <main className="px-8 py-12 text-dark-gray">Загрузка…</main>;

  return (
    <main className="px-8 py-8">
      <div className="mb-1 flex items-center justify-between">
        <h1 className="text-3xl font-light text-ink">Операции · Чек-листы</h1>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setShowLibrary(true)}>📚 Библиотека шаблонов</Button>
          <Button onClick={() => startEdit()}>Создать чек-лист</Button>
        </div>
      </div>
      <p className="mb-6 text-sm text-dark-gray">Прикрепляются к задачам и типам уборок; задача не закроется, пока чек-лист не завершён (§5).</p>

      {showLibrary ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/40 p-4" onClick={() => setShowLibrary(false)}>
          <div className="my-4 w-full max-w-2xl rounded-2xl bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-1 flex items-center justify-between">
              <h2 className="text-lg text-ink">Библиотека шаблонов</h2>
              <button type="button" onClick={() => setShowLibrary(false)} className="text-2xl leading-none text-slate-400 hover:text-ink">×</button>
            </div>
            <p className="mb-3 text-sm text-dark-gray">Готовые чек-листы — добавьте в один клик, дальше можно отредактировать под себя.</p>
            <div className="space-y-2">
              {PRESETS.map((p) => (
                <div key={p.name} className="flex items-center justify-between gap-3 rounded-xl border border-ink/10 px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink">{p.name}</p>
                    <p className="text-xs text-dark-gray">{p.desc} · {p.rows.filter((r) => r.kind !== 'HEADER').length} пунктов</p>
                  </div>
                  <Button variant="secondary" onClick={() => openDraft(p.name, p.rows)}>Использовать</Button>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {lists.map((cl) => (
          <Card key={cl.id}>
            <div className="mb-2 flex items-start justify-between gap-2">
              <p className="font-medium text-ink">{cl.name}</p>
              <div className="flex gap-2 text-sm">
                <button type="button" className="text-primary-700 hover:underline" onClick={() => startEdit(cl)}>Изменить</button>
                <button type="button" className="text-slate-500 hover:underline" onClick={() => duplicate(cl)}>Дублировать</button>
                <button type="button" className="text-rose-500 hover:underline" onClick={() => { if (confirm('Архивировать чек-лист?')) void adminApi.opsArchiveChecklist(cl.id).then(load); }}>В архив</button>
              </div>
            </div>
            <p className="text-xs text-slate-400">{(cl.items as unknown as OpsSnapshotItem[]).filter((i) => i.kind !== 'HEADER').length} пунктов</p>
          </Card>
        ))}
        {lists.length === 0 ? <p className="text-sm text-dark-gray">Чек-листов пока нет.</p> : null}
      </div>

      {editing ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/40 p-4" onClick={() => setEditing(null)}>
          <div className="my-4 w-full max-w-3xl rounded-xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-ink/10 px-5 py-4">
              <h2 className="text-lg font-semibold text-ink">{editing.id ? 'Чек-лист' : 'Новый чек-лист'}</h2>
              <button type="button" onClick={() => setEditing(null)} className="text-2xl leading-none text-slate-400 hover:text-ink">×</button>
            </div>
            <div className="space-y-3 px-5 py-4">
              <input value={editing.name} onChange={(e) => setEditing((s) => s && { ...s, name: e.target.value })} placeholder="Название (напр. «Инспекция номера»)" className="w-full rounded-md border border-ink/20 px-3 py-2 text-sm" />
              <div className="space-y-1.5">
                {editing.rows.map((r, idx) => (
                  <div key={idx} className={`flex flex-wrap items-center gap-2 rounded-lg border border-ink/10 px-2 py-1.5 ${r.kind === 'SUBITEM' ? 'ml-8' : r.kind === 'HEADER' ? 'bg-slate-50' : ''}`}>
                    <select value={r.kind} onChange={(e) => setRow(idx, { kind: e.target.value as Row['kind'] })} className="rounded-md border border-ink/15 px-1.5 py-1 text-xs">
                      <option value="HEADER">Заголовок</option>
                      <option value="ITEM">Пункт</option>
                      <option value="SUBITEM">Подпункт</option>
                    </select>
                    <input value={r.text} onChange={(e) => setRow(idx, { text: e.target.value })} placeholder="Текст…" className={`min-w-0 flex-1 rounded-md border border-ink/15 px-2 py-1 text-sm ${r.kind === 'HEADER' ? 'font-semibold' : ''}`} />
                    {r.kind !== 'HEADER' ? (
                      <>
                        <input value={r.thirdOption} onChange={(e) => setRow(idx, { thirdOption: e.target.value })} placeholder="Доп. вариант (N/A)" className="w-28 rounded-md border border-ink/15 px-2 py-1 text-xs" />
                        <label className="flex items-center gap-1 text-xs text-dark-gray" title="Обязательное фото при любом ответе"><input type="checkbox" checked={r.requirePhoto} onChange={(e) => setRow(idx, { requirePhoto: e.target.checked })} />фото</label>
                        <label className="flex items-center gap-1 text-xs text-dark-gray" title="Не влияет на процент выполнения"><input type="checkbox" checked={r.excludeFromScore} onChange={(e) => setRow(idx, { excludeFromScore: e.target.checked })} />вне %</label>
                      </>
                    ) : null}
                    <div className="flex gap-0.5 text-slate-400">
                      <button type="button" onClick={() => move(idx, -1)} className="hover:text-ink">↑</button>
                      <button type="button" onClick={() => move(idx, 1)} className="hover:text-ink">↓</button>
                      <button type="button" onClick={() => setEditing((e) => e && ({ ...e, rows: e.rows.filter((_, i) => i !== idx) }))} className="hover:text-rose-600">×</button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => setEditing((e) => e && ({ ...e, rows: [...e.rows, emptyRow('HEADER')] }))}>+ Заголовок</Button>
                <Button variant="secondary" onClick={() => setEditing((e) => e && ({ ...e, rows: [...e.rows, emptyRow('ITEM')] }))}>+ Пункт</Button>
                <Button variant="secondary" onClick={() => setEditing((e) => e && ({ ...e, rows: [...e.rows, emptyRow('SUBITEM')] }))}>+ Подпункт</Button>
              </div>
              {error ? <p className="text-sm text-rose-600">{error}</p> : null}
              <div className="flex justify-end gap-2">
                <Button variant="secondary" onClick={() => setEditing(null)}>Отмена</Button>
                <Button disabled={!editing.name.trim() || editing.rows.every((r) => !r.text.trim())} onClick={save}>Сохранить</Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
