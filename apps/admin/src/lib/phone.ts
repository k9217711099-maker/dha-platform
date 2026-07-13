/**
 * Телефоны: ввод и отображение по российским и международным стандартам (E.164).
 * Без внешних зависимостей. РФ-номера нормализуются к +7XXXXXXXXXX и показываются
 * как +7 (XXX) XXX-XX-XX; международные — как +<код> с группировкой.
 */

/** Только цифры и ведущий «+». */
function clean(raw: string): string {
  const plus = raw.trim().startsWith('+');
  const digits = raw.replace(/\D/g, '');
  return (plus ? '+' : '') + digits;
}

/** Нормализовать к E.164 для хранения (или '' если пусто). РФ 8XXX/7XXX → +7XXX. */
export function normalizePhone(raw: string): string {
  if (!raw?.trim()) return '';
  const c = clean(raw);
  let digits = c.replace('+', '');
  // РФ: 11 цифр, начинается с 8 или 7 → +7XXXXXXXXXX; 10 цифр → +7XXXXXXXXXX.
  if (!c.startsWith('+')) {
    if (digits.length === 11 && (digits[0] === '8' || digits[0] === '7')) digits = '7' + digits.slice(1);
    else if (digits.length === 10) digits = '7' + digits;
  }
  return '+' + digits;
}

/** Валиден ли номер: РФ (+7 и 11 цифр) либо международный E.164 (8–15 цифр). */
export function isValidPhone(raw: string): boolean {
  if (!raw?.trim()) return false;
  const e164 = normalizePhone(raw);
  const digits = e164.replace('+', '');
  if (digits.startsWith('7')) return digits.length === 11; // РФ/Казахстан-формат
  return digits.length >= 8 && digits.length <= 15;
}

/** Форматирование по мере ввода (для поля). РФ → +7 (XXX) XXX-XX-XX. */
export function formatPhoneInput(raw: string): string {
  const c = clean(raw);
  const digits = c.replace('+', '');
  // РФ-ветка: пользователь ввёл 8/7 в начале или уже +7.
  const isRu = c.startsWith('+7') || (!c.startsWith('+') && (digits[0] === '8' || digits[0] === '7'));
  if (isRu) {
    const d = ('7' + digits.replace(/^[78]/, '')).slice(0, 11);
    const p = d.slice(1);
    let out = '+7';
    if (p.length) out += ' (' + p.slice(0, 3);
    if (p.length >= 3) out += ') ' + p.slice(3, 6);
    if (p.length >= 6) out += '-' + p.slice(6, 8);
    if (p.length >= 8) out += '-' + p.slice(8, 10);
    return out;
  }
  // Международный: '+' + цифры группами по 3.
  if (c.startsWith('+')) return '+' + digits.replace(/(\d{3})(?=\d)/g, '$1 ').trim();
  return digits;
}

/** Красивое отображение сохранённого номера. */
export function formatPhoneDisplay(e164: string | null | undefined): string {
  if (!e164) return '';
  return formatPhoneInput(e164);
}

/** Номер в формате для ссылок tel:/wa.me (только цифры, для wa/tg — без «+»). */
export function phoneDigits(e164: string | null | undefined): string {
  return (e164 ?? '').replace(/\D/g, '');
}
