'use client';

import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Button, Card, Input } from '@dha/ui';
import { adminApi, fileUrl, type AmenityGroup, type PmsRoomOption } from '../../../../../lib/api';
import { BED_TYPE_OPTIONS, ROOM_TYPE_OPTIONS, VIEW_OPTIONS } from '../../../../../lib/room-fund-catalogs';
import { optimizeImage } from '../../../../../lib/image';
import { MapPicker } from '../../../../../components/MapPicker';
import { useRequireAdmin } from '../../../../../lib/use-admin';

const selectCls = 'w-full rounded-md border border-ink/20 bg-white px-3 py-2 text-sm';
const num = (s: string): number | undefined => (s.trim() === '' ? undefined : Number(s));
const numStr = (n: number | null | undefined): string => (n == null ? '' : String(n));

interface Form {
  propertyId: string; name: string; shortName: string; typeLabel: string;
  roomsInUnit: string; mainPlaces: string; extraPlaces: string; securityDeposit: string;
  areaMode: string; areaSqm: string; areaSqmTo: string;
  amenities: string[]; bedPreference: string; viewPreference: string; priorityAmenities: string[];
  description: string; photos: string[]; videos: string[]; confirmationFileUrl: string;
  address: string; latitude: string; longitude: string; howToReach: string;
  showInBooking: boolean; showInOta: boolean;
}
const empty: Form = {
  propertyId: '', name: '', shortName: '', typeLabel: '', roomsInUnit: '', mainPlaces: '2', extraPlaces: '0', securityDeposit: '',
  areaMode: 'SAME', areaSqm: '', areaSqmTo: '', amenities: [], bedPreference: '', viewPreference: '', priorityAmenities: [],
  description: '', photos: [], videos: [], confirmationFileUrl: '', address: '', latitude: '', longitude: '', howToReach: '',
  showInBooking: true, showInOta: true,
};

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <Card className="mb-4">
      <p className="mb-1 text-sm font-medium text-ink">{title}</p>
      {hint ? <p className="mb-3 text-xs text-dark-gray">{hint}</p> : <div className="mb-3" />}
      {children}
    </Card>
  );
}

export default function CategoryEditorPage() {
  const ready = useRequireAdmin();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const isNew = params.id === 'new';

  const [form, setForm] = useState<Form>(empty);
  const [options, setOptions] = useState<PmsRoomOption[]>([]);
  const [amenityGroups, setAmenityGroups] = useState<AmenityGroup[]>([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const photoInput = useRef<HTMLInputElement>(null);
  const pdfInput = useRef<HTMLInputElement>(null);
  const videoInput = useRef<HTMLInputElement>(null);

  const set = (patch: Partial<Form>) => setForm((f) => ({ ...f, ...patch }));

  useEffect(() => {
    if (!ready) return;
    void adminApi.pmsRoomOptions().then(setOptions).catch(() => undefined);
    void adminApi.roomFundAmenities().then(setAmenityGroups).catch(() => undefined);
    if (isNew) {
      set({ propertyId: search.get('propertyId') ?? '' });
    } else {
      void adminApi.roomFundCategory(params.id).then((c) => setForm({
        propertyId: c.propertyId, name: c.name, shortName: c.shortName ?? '', typeLabel: c.typeLabel ?? '',
        roomsInUnit: numStr(c.roomsInUnit), mainPlaces: numStr(c.mainPlaces), extraPlaces: numStr(c.extraPlaces), securityDeposit: numStr(c.securityDeposit),
        areaMode: c.areaMode, areaSqm: numStr(c.areaSqm), areaSqmTo: numStr(c.areaSqmTo),
        amenities: c.amenities, bedPreference: c.bedPreference ?? '', viewPreference: c.viewPreference ?? '', priorityAmenities: c.priorityAmenities,
        description: c.description ?? '', photos: c.photos, videos: c.videos ?? [], confirmationFileUrl: c.confirmationFileUrl ?? '',
        address: c.address ?? '', latitude: numStr(c.latitude), longitude: numStr(c.longitude), howToReach: c.howToReach ?? '',
        showInBooking: c.showInBooking, showInOta: c.showInOta,
      })).catch((e) => setError(e instanceof Error ? e.message : 'Ошибка загрузки'));
    }
  }, [ready]);

  // code → label оснащения (для приоритетов).
  const amenityLabel = useMemo(() => {
    const m = new Map<string, string>();
    for (const g of amenityGroups) for (const it of g.items) m.set(it.code, it.label);
    return m;
  }, [amenityGroups]);
  const chosenAmenities = form.amenities;

  async function onPhotos(files: FileList | null) {
    if (!files?.length) return;
    setError(''); setUploading(true);
    try {
      for (const f of Array.from(files)) {
        if (form.photos.length >= 30) { setError('Максимум 30 фотографий'); break; }
        const optimized = await optimizeImage(f); // крупные фото ужимаем в браузере до загрузки
        const r = await adminApi.uploadImage(optimized);
        setForm((s) => ({ ...s, photos: [...s.photos, r.url] }));
      }
    } catch (e) { setError(e instanceof Error ? e.message : 'Ошибка загрузки'); }
    finally { setUploading(false); if (photoInput.current) photoInput.current.value = ''; }
  }
  async function onVideos(files: FileList | null) {
    if (!files?.length) return;
    setError(''); setUploading(true);
    try {
      for (const f of Array.from(files)) {
        if (form.videos.length >= 10) { setError('Максимум 10 видео'); break; }
        const r = await adminApi.uploadVideo(f);
        setForm((s) => ({ ...s, videos: [...s.videos, r.url] }));
      }
    } catch (e) { setError(e instanceof Error ? e.message : 'Ошибка загрузки видео (MP4/WebM/MOV, до 100 МБ)'); }
    finally { setUploading(false); if (videoInput.current) videoInput.current.value = ''; }
  }
  async function onPdf(files: FileList | null) {
    const f = files?.[0];
    if (!f) return;
    setError(''); setUploading(true);
    try { const r = await adminApi.uploadDocument(f); set({ confirmationFileUrl: r.url }); }
    catch (e) { setError(e instanceof Error ? e.message : 'Ошибка загрузки'); }
    finally { setUploading(false); if (pdfInput.current) pdfInput.current.value = ''; }
  }
  function movePhoto(from: number, to: number) {
    setForm((s) => { const p = [...s.photos]; const [x] = p.splice(from, 1); if (x !== undefined) p.splice(to, 0, x); return { ...s, photos: p }; });
  }

  function save() {
    if (!form.name.trim()) { setError('Укажите название'); return; }
    if (isNew && !form.propertyId) { setError('Выберите объект'); return; }
    if (!form.propertyId) { setError('Выберите объект'); return; }
    setError(''); setSaving(true);
    const body = {
      propertyId: form.propertyId,
      name: form.name.trim(), shortName: form.shortName || undefined, typeLabel: form.typeLabel || undefined,
      roomsInUnit: num(form.roomsInUnit), mainPlaces: num(form.mainPlaces), extraPlaces: num(form.extraPlaces) ?? 0,
      securityDeposit: num(form.securityDeposit),
      areaMode: form.areaMode, areaSqm: num(form.areaSqm), areaSqmTo: form.areaMode === 'RANGE' ? num(form.areaSqmTo) : undefined,
      amenities: form.amenities, bedPreference: form.bedPreference || undefined, viewPreference: form.viewPreference || undefined,
      priorityAmenities: form.priorityAmenities.filter(Boolean).slice(0, 5),
      description: form.description || undefined, photos: form.photos, videos: form.videos, confirmationFileUrl: form.confirmationFileUrl || undefined,
      address: form.address || undefined, latitude: num(form.latitude), longitude: num(form.longitude), howToReach: form.howToReach || undefined,
      showInBooking: form.showInBooking, showInOta: form.showInOta,
    };
    const p = isNew
      ? adminApi.createRoomFundCategory(body)
      : adminApi.updateRoomFundCategory(params.id, body);
    p.then(() => router.push('/settings/room-fund')).catch((e) => { setError(e instanceof Error ? e.message : 'Ошибка сохранения'); setSaving(false); });
  }

  const lat = Number(form.latitude); const lng = Number(form.longitude);
  const hasCoords = form.latitude.trim() !== '' && form.longitude.trim() !== '' && !Number.isNaN(lat) && !Number.isNaN(lng);

  if (!ready) return <main className="px-8 py-12 text-dark-gray">Загрузка…</main>;

  return (
    <main className="px-8 py-8 pb-24">
      <button type="button" onClick={() => router.push('/settings/room-fund')} className="mb-2 text-sm text-dark-gray hover:text-ink">← Номерной фонд</button>
      <h1 className="mb-5 text-3xl font-light text-ink">{isNew ? 'Новая категория' : 'Категория номеров'}</h1>
      {error ? <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p> : null}

      <div className="max-w-3xl">
        <Section title="Основное">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block sm:col-span-2"><span className="mb-1.5 block text-sm text-dark-gray">Объект{!isNew ? <span className="ml-1 text-xs text-dark-gray">— смена перенесёт номера и брони категории на выбранный объект</span> : null}</span>
              <select value={form.propertyId} onChange={(e) => set({ propertyId: e.target.value })} className={selectCls}>
                <option value="">— выберите —</option>
                {options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            </label>
            <Input id="name" label="Название" value={form.name} onChange={(e) => set({ name: e.target.value })} />
            <Input id="short" label="Сокращённое название" value={form.shortName} onChange={(e) => set({ shortName: e.target.value })} />
            <label className="block"><span className="mb-1.5 block text-sm text-dark-gray">Тип</span>
              <select value={form.typeLabel} onChange={(e) => set({ typeLabel: e.target.value })} className={selectCls}>
                <option value="">— не указан —</option>
                {ROOM_TYPE_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </label>
          </div>
        </Section>

        <Section title="Площадь и вместимость">
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block"><span className="mb-1.5 block text-sm text-dark-gray">Площадь</span>
              <select value={form.areaMode} onChange={(e) => set({ areaMode: e.target.value })} className={selectCls}>
                <option value="SAME">Одинаковая</option>
                <option value="RANGE">Диапазон (от–до)</option>
              </select>
            </label>
            <Input id="area" label={form.areaMode === 'RANGE' ? 'от, м²' : 'м²'} type="number" value={form.areaSqm} onChange={(e) => set({ areaSqm: e.target.value })} />
            {form.areaMode === 'RANGE'
              ? <Input id="areaTo" label="до, м²" type="number" value={form.areaSqmTo} onChange={(e) => set({ areaSqmTo: e.target.value })} />
              : <div />}
            <Input id="rooms" label="Количество комнат" type="number" value={form.roomsInUnit} onChange={(e) => set({ roomsInUnit: e.target.value })} />
            <label className="block"><span className="mb-1.5 block text-sm text-dark-gray">Основных мест</span>
              <select value={form.mainPlaces} onChange={(e) => set({ mainPlaces: e.target.value })} className={selectCls}>
                {Array.from({ length: 15 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
            <label className="block"><span className="mb-1.5 block text-sm text-dark-gray">Дополнительных мест</span>
              <select value={form.extraPlaces} onChange={(e) => set({ extraPlaces: e.target.value })} className={selectCls}>
                {Array.from({ length: 9 }, (_, i) => i).map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
            <Input id="deposit" label="Залог по умолчанию, ₽" type="number" value={form.securityDeposit} onChange={(e) => set({ securityDeposit: e.target.value })} />
          </div>
        </Section>

        <Section title="Оснащение номера" hint="Выбор из списка удобств, сгруппированных по смыслу.">
          <div className="grid gap-2 sm:grid-cols-2">
            {amenityGroups.map((g) => {
              const open = openGroups[g.value] ?? false;
              const count = g.items.filter((it) => form.amenities.includes(it.code)).length;
              return (
                <div key={g.value} className="self-start rounded-md border border-ink/10">
                  <button type="button" onClick={() => setOpenGroups((s) => ({ ...s, [g.value]: !open }))} className="flex w-full items-center justify-between px-3 py-2 text-sm">
                    <span className="font-medium text-ink">{g.label}{count ? <span className="ml-1 text-xs text-emerald-600">({count})</span> : null}</span>
                    <span className="text-ink/30">{open ? '▾' : '▸'}</span>
                  </button>
                  {open && (
                    <div className="max-h-56 overflow-y-auto border-t border-ink/5 px-3 py-2">
                      {g.items.map((it) => (
                        <label key={it.code} className="flex items-center gap-2 py-0.5 text-sm text-ink">
                          <input type="checkbox" checked={form.amenities.includes(it.code)}
                            onChange={(e) => set({ amenities: e.target.checked ? [...form.amenities, it.code] : form.amenities.filter((x) => x !== it.code) })} />
                          {it.label}
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Section>

        <Section title="Предпочтение в номере" hint="Условия проживания, которые гость может выбрать при бронировании (выполнение не гарантируется).">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block"><span className="mb-1.5 block text-sm text-dark-gray">Кровати</span>
              <select value={form.bedPreference} onChange={(e) => set({ bedPreference: e.target.value })} className={selectCls}>
                <option value="">не выбрано</option>
                {BED_TYPE_OPTIONS.map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
            </label>
            <label className="block"><span className="mb-1.5 block text-sm text-dark-gray">Вид из окна</span>
              <select value={form.viewPreference} onChange={(e) => set({ viewPreference: e.target.value })} className={selectCls}>
                <option value="">не выбрано</option>
                {VIEW_OPTIONS.map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            </label>
          </div>
        </Section>

        <Section title="Приоритетные элементы оснащения" hint="Иконки оснащения, которые выделяются в карточке номера в модуле бронирования и помогают гостям выбрать номер. Подбираются автоматически из «Оснащения номера», но вы можете задать до 5 приоритетных вручную.">
          <div className="grid gap-2 sm:grid-cols-5">
            {[0, 1, 2, 3, 4].map((i) => (
              <label key={i} className="block"><span className="mb-1.5 block text-xs text-dark-gray">{i + 1}</span>
                <select value={form.priorityAmenities[i] ?? ''} onChange={(e) => { const arr = [...form.priorityAmenities]; arr[i] = e.target.value; set({ priorityAmenities: arr }); }} className={selectCls}>
                  <option value="">—</option>
                  {chosenAmenities.map((code) => <option key={code} value={code}>{amenityLabel.get(code) ?? code}</option>)}
                </select>
              </label>
            ))}
          </div>
        </Section>

        <Section title="Описание">
          <textarea value={form.description} onChange={(e) => set({ description: e.target.value })} rows={4} className={selectCls} />
        </Section>

        {/* Фотогалерея — в середине страницы */}
        <Section title="Фотогалерея" hint="Максимум 30 фото, до 10 МБ, форматы JPG/PNG/GIF. Обложка — первое фото (показывается первым); чтобы сделать обложкой, перетащите фото на первое место или нажмите «Обложка». Рекомендуем обложкой фото спального места.">
          <input ref={photoInput} type="file" accept="image/jpeg,image/png,image/gif" multiple className="hidden" onChange={(e) => onPhotos(e.target.files)} />
          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={() => photoInput.current?.click()} disabled={uploading || form.photos.length >= 30}
              className="flex h-24 w-24 shrink-0 flex-col items-center justify-center rounded-md border-2 border-dashed border-ink/20 text-xs text-dark-gray hover:border-ink/40 disabled:opacity-50">
              <span className="text-2xl leading-none">+</span>{uploading ? 'Загрузка…' : 'Фото'}
            </button>
            {form.photos.map((url, i) => (
              <div key={url} draggable onDragStart={() => setDragIdx(i)} onDragOver={(e) => e.preventDefault()} onDrop={() => { if (dragIdx !== null) movePhoto(dragIdx, i); setDragIdx(null); }}
                className={`group relative h-24 w-24 shrink-0 overflow-hidden rounded-md border ${i === 0 ? 'border-emerald-400 ring-1 ring-emerald-400' : 'border-ink/10'}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={fileUrl(url)} alt="" className="h-full w-full object-cover" />
                {i === 0 ? <span className="absolute left-1 top-1 rounded bg-emerald-500 px-1 text-[10px] text-white">Обложка</span> : null}
                <div className="absolute inset-x-0 bottom-0 flex justify-between bg-black/50 px-1 py-0.5 opacity-0 transition group-hover:opacity-100">
                  {i !== 0 ? <button type="button" onClick={() => movePhoto(i, 0)} className="text-[10px] text-white" title="Сделать обложкой">Обложка</button> : <span />}
                  <button type="button" onClick={() => set({ photos: form.photos.filter((_, j) => j !== i) })} className="text-[10px] text-white" title="Удалить">✕</button>
                </div>
              </div>
            ))}
          </div>
        </Section>

        {/* Видео категории */}
        <Section title="Видео" hint="Максимум 10 роликов, до 100 МБ каждый, форматы MP4/WebM/MOV. Показываются в карточке категории для гостя.">
          <input ref={videoInput} type="file" accept="video/mp4,video/webm,video/quicktime" multiple className="hidden" onChange={(e) => onVideos(e.target.files)} />
          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={() => videoInput.current?.click()} disabled={uploading || form.videos.length >= 10}
              className="flex h-24 w-32 shrink-0 flex-col items-center justify-center rounded-md border-2 border-dashed border-ink/20 text-xs text-dark-gray hover:border-ink/40 disabled:opacity-50">
              <span className="text-2xl leading-none">＋</span>{uploading ? 'Загрузка…' : 'Видео'}
            </button>
            {form.videos.map((url, i) => (
              <div key={url} className="group relative h-24 w-32 shrink-0 overflow-hidden rounded-md border border-ink/10 bg-black">
                <video src={fileUrl(url)} className="h-full w-full object-cover" muted preload="metadata" />
                <div className="absolute inset-x-0 bottom-0 flex justify-end bg-black/50 px-1 py-0.5 opacity-0 transition group-hover:opacity-100">
                  <button type="button" onClick={() => set({ videos: form.videos.filter((_, j) => j !== i) })} className="text-[10px] text-white" title="Удалить">✕</button>
                </div>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Адрес и карта" hint="Начните вводить адрес в поле поиска над картой — выберите подсказку, координаты и метка проставятся автоматически. Можно также кликнуть по карте или перетащить метку.">
          <MapPicker
            lat={hasCoords ? lat : null}
            lng={hasCoords ? lng : null}
            address={form.address}
            onChange={(a, b) => set({ latitude: String(a), longitude: String(b) })}
            onAddressChange={(a) => set({ address: a })}
          />
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Input id="addr" label="Адрес" className="sm:col-span-2" value={form.address} onChange={(e) => set({ address: e.target.value })} />
            <Input id="lat" label="Широта" type="number" value={form.latitude} onChange={(e) => set({ latitude: e.target.value })} />
            <Input id="lng" label="Долгота" type="number" value={form.longitude} onChange={(e) => set({ longitude: e.target.value })} />
            <label className="block sm:col-span-2"><span className="mb-1.5 block text-sm text-dark-gray">Как до нас добраться</span>
              <textarea value={form.howToReach} onChange={(e) => set({ howToReach: e.target.value })} rows={2} className={selectCls} />
            </label>
          </div>
        </Section>

        <Section title="Дополнительный файл к подтверждению брони" hint="Можно прикрепить приветственное письмо, правила проживания или иной документ (PDF), который отправится гостю к подтверждению брони.">
          <input ref={pdfInput} type="file" accept="application/pdf" className="hidden" onChange={(e) => onPdf(e.target.files)} />
          <div className="flex items-center gap-3">
            <Button variant="secondary" onClick={() => pdfInput.current?.click()} disabled={uploading}>{uploading ? 'Загрузка…' : 'Загрузить PDF'}</Button>
            {form.confirmationFileUrl ? (
              <>
                <a href={fileUrl(form.confirmationFileUrl)} target="_blank" rel="noreferrer" className="text-sm text-primary hover:underline">Открыть файл</a>
                <button type="button" onClick={() => set({ confirmationFileUrl: '' })} className="text-sm text-red-600 hover:underline">Удалить</button>
              </>
            ) : <span className="text-sm text-dark-gray">Файл не прикреплён</span>}
          </div>
        </Section>

        <Section title="Видимость">
          <div className="flex flex-wrap gap-6">
            <label className="flex items-center gap-2 text-sm text-ink"><input type="checkbox" checked={form.showInBooking} onChange={(e) => set({ showInBooking: e.target.checked })} /> Показывать в модуле «Бронирования»</label>
            <label className="flex items-center gap-2 text-sm text-ink"><input type="checkbox" checked={form.showInOta} onChange={(e) => set({ showInOta: e.target.checked })} /> Выгружать на OTA</label>
          </div>
        </Section>

        <div className="sticky bottom-0 -mx-8 flex justify-end gap-2 border-t border-ink/10 bg-white/90 px-8 py-3 backdrop-blur">
          <Button variant="secondary" onClick={() => router.push('/settings/room-fund')}>Отмена</Button>
          <Button onClick={save} disabled={saving || uploading}>{saving ? 'Сохранение…' : (isNew ? 'Создать категорию' : 'Сохранить')}</Button>
        </div>
      </div>
    </main>
  );
}
