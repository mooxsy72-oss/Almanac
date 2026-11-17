// Almanac — time.js
// Время сюжета — минуты от 01.01.1970 (UTC, без часовых поясов). Разбор тега, форматирование, относительные метки.

export const DAY = 1440;
export const WD = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];
export const WD_SHORT = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
export const WD_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const MONTH_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
export const MONTH = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];

const pad = (n) => String(n).padStart(2, '0');

export function fromParts(y, m, d, hh = 0, mm = 0) {
    const dt = new Date(0);
    dt.setUTCFullYear(y, m - 1, d);
    dt.setUTCHours(hh, mm, 0, 0);
    const v = dt.getTime();
    return Number.isFinite(v) ? Math.round(v / 60000) : null;
}
export function parts(t) {
    const dt = new Date(t * 60000);
    return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate(), hh: dt.getUTCHours(), mm: dt.getUTCMinutes(), wd: dt.getUTCDay() };
}
export const dayStart = (t) => Math.floor(t / DAY) * DAY;
export const isoOf = (t) => { const p = parts(t); return `${String(p.y).padStart(4, '0')}-${pad(p.m)}-${pad(p.d)}`; };
export function fromIso(iso) {
    const m = String(iso || '').match(/^(-?\d{1,6})-(\d{2})-(\d{2})$/);
    return m ? fromParts(Number(m[1]), Number(m[2]), Number(m[3])) : null;
}
export const clock = (t) => { const p = parts(t); return `${pad(p.hh)}:${pad(p.mm)}`; };
export const dmy = (t) => { const p = parts(t); return `${pad(p.d)}.${pad(p.m)}.${p.y}`; };
export const longDate = (t) => { const p = parts(t); return `${p.d} ${MONTH_GEN[p.m - 1]} ${p.y}`; };
export const weekday = (t) => WD[parts(t).wd];

/** «+2 ч 30 мин», «+1 д 4 ч» */
export function spanText(min) {
    if (min == null) return '';
    const sign = min < 0 ? '−' : '+';
    let m = Math.abs(Math.round(min));
    const d = Math.floor(m / DAY); m -= d * DAY;
    const h = Math.floor(m / 60); m -= h * 60;
    const out = [d && `${d} д`, h && `${h} ч`, (m || (!d && !h)) && `${m} мин`].filter(Boolean);
    return `${sign}${out.join(' ')}`;
}

/** Сколько дней назад — для промпта основной модели */
export function agoEn(days) {
    if (days <= 0) return 'today';
    if (days === 1) return 'yesterday';
    if (days === 2) return 'the day before yesterday';
    if (days < 7) return `${days} days ago`;
    if (days < 14) return `${days} days ago (about a week)`;
    if (days < 28) return `${days} days ago (about ${Math.round(days / 7)} weeks)`;
    if (days < 365) return `${days} days ago (about ${Math.max(1, Math.round(days / 30))} month${Math.round(days / 30) > 1 ? 's' : ''})`;
    return `${days} days ago (over a year)`;
}
export function agoRu(days) {
    if (days <= 0) return 'сегодня';
    if (days === 1) return 'вчера';
    if (days === 2) return 'позавчера';
    const n = days % 100, k = days % 10;
    const w = n >= 11 && n <= 14 ? 'дней' : k === 1 ? 'день' : k >= 2 && k <= 4 ? 'дня' : 'дней';
    return `${days} ${w} назад`;
}

// ─── Сколько длится: «3 часа», «5 дней», «2 недели» ───
function ruPlural(n, one, few, many) {
    const a = n % 100, b = n % 10;
    return a >= 11 && a <= 14 ? many : b === 1 ? one : b >= 2 && b <= 4 ? few : many;
}
function durParts(min) {
    const m = Math.max(0, Math.round(min));
    if (m < 60) return [Math.max(1, m), 'min'];
    if (m < DAY) return [Math.round(m / 60), 'h'];
    const d = Math.floor(m / DAY);
    if (d < 14) return [d, 'd'];
    if (d < 60) return [Math.round(d / 7), 'w'];
    if (d < 730) return [Math.round(d / 30.44), 'mo'];
    return [Math.floor(d / 365.25), 'y'];
}
export function durRu(min) {
    const [n, u] = durParts(min);
    const w = { min: ['минуту', 'минуты', 'минут'], h: ['час', 'часа', 'часов'], d: ['день', 'дня', 'дней'], w: ['неделю', 'недели', 'недель'], mo: ['месяц', 'месяца', 'месяцев'], y: ['год', 'года', 'лет'] }[u];
    return `${n} ${ruPlural(n, ...w)}`;
}
export function durEn(min) {
    const [n, u] = durParts(min);
    const w = { min: 'minute', h: 'hour', d: 'day', w: 'week', mo: 'month', y: 'year' }[u];
    return `${n} ${w}${n === 1 ? '' : 's'}`;
}

// ─── Тег основной модели ───
// <!-- AL 05.05.2025, понедельник, 23:15 | +20м | умылась и почистила зубы -->
// Модель иногда сбивается с формата: ⟦AL: … | PASSED: +5м | WHY: …⟧, строка без обёртки
// («15.04.2026, среда, 08:40 — PASSED: +9ч39м. WHY: …»), незакрытый «<!-- AL …», особые пробелы (U+2007).
// Всё это тоже разбирается и вырезается из ответа.
export const TAG_RE = /\s*(?:<|&lt;)!--\s*AL\b([\s\S]*?)--(?:>|&gt;)/gi;
const OPEN_RE = /(?:<|&lt;)!--\s*AL\b/gi;
const SP_RE = /[\u00A0\u2000-\u200B\u202F\u205F\u3000\uFEFF]/g;      // особые пробелы → обычные (длина строки та же)
const normSp = (s) => String(s ?? '').replace(SP_RE, ' ');
const AL_HEAD = /^(?:AL|[Aa]lmanac)(?![A-Za-z])\s*[:\-—–]?\s*/;
const DATE_NUM = /(\d{1,2})[./-](\d{1,2})[./-](\d{4}|\d{2})(?!\d)/;
const TIME_NUM = /(?<![\d:.])([01]?\d|2[0-3]):([0-5]\d)(?![\d:])/;
const DECOR_L = /^(?:[\s`*_~>#]|(?:<|&lt;)!--|[\[({⟦【〔«<])+/u;
const DECOR_R = /(?:[\s`*_~]|--(?:>|&gt;)|[\])}⟧】〕»>])+$/u;
const UNIT = 'дней|дня|дн|д|суток|сутки|сут|days|day|d|часов|часа|час|ч|hours|hour|hrs|hr|h|минуты|минут|мин|м|minutes|minute|mins|min|m';
const SPAN_PART = `(?:\\d+(?:[.,]\\d+)?\\s*(?:${UNIT})\\.?\\s*)+(?![a-zа-яё])|\\d{1,3}:\\d{2}(?!\\d)|0(?![\\d:.,])`;
const SPAN_LBL = new RegExp(`(?:\\bPASSED\\b|(?<![а-яё])прошло)\\s*[:=]?\\s*\\+?\\s*(${SPAN_PART})`, 'i');
const SPAN_PLUS = new RegExp(`\\+\\s*(${SPAN_PART})`, 'i');
const WHY_RE = /(?:\bWHY\b|(?<![а-яё])(?:почему|причина)(?![а-яё]))\s*[:=]?\s*/i;

export function parseSpan(s) {
    const src = String(s || '').toLowerCase().replace(',', '.');
    let total = 0, hit = false;
    const re = new RegExp(`(\\d+(?:\\.\\d+)?)\\s*(${UNIT})(?![a-zа-яё])\\.?`, 'g');
    let m;
    while ((m = re.exec(src)) !== null) {
        hit = true;
        const v = parseFloat(m[1]);
        const u = m[2];
        total += /^(д|дн|дня|дней|сут|суток|сутки|d|day|days)$/.test(u) ? v * DAY : /^(ч|час|часа|часов|h|hr|hrs|hour|hours)$/.test(u) ? v * 60 : v;
    }
    if (!hit) {
        const hm = src.match(/(\d{1,3}):(\d{2})/);
        if (hm) { hit = true; total = Number(hm[1]) * 60 + Number(hm[2]); }
        else if (/^\s*\+?\s*0\s*$/.test(src)) hit = true;
    }
    return hit ? Math.round(total) : null;
}

/** Содержимое тега → дата, время, сколько прошло, на что ушло */
function parseInner(raw) {
    const s = normSp(raw).replace(/\s+/g, ' ').trim().replace(AL_HEAD, '').replace(/^[\s:\-—–]+/, '').replace(DECOR_R, '').trim();
    let why = null, body = s, core = s, passed = null;
    const w = WHY_RE.exec(s);
    if (w) { why = s.slice(w.index + w[0].length); body = core = s.slice(0, w.index); }
    const pm = SPAN_LBL.exec(body) || SPAN_PLUS.exec(body);
    if (pm) {
        passed = parseSpan(pm[1]);
        core = body.slice(0, pm.index);
        if (why == null) why = body.slice(pm.index + pm[0].length);
    } else if (body.includes('|')) {
        const segs = body.split('|');
        core = segs[0];
        let rest = segs.slice(1);
        if (rest.length && /^\s*\d/.test(rest[0])) { passed = parseSpan(rest[0]); rest = rest.slice(1); }
        if (why == null) why = rest.join(' | ');
    }
    const dm = core.match(DATE_NUM);
    const tm = (dm ? core.slice(dm.index + dm[0].length).match(TIME_NUM) : null) || core.match(TIME_NUM);
    let year = dm ? Number(dm[3]) : null;
    if (dm && dm[3].length === 2) year += 2000;
    const date = dm ? { y: year, m: Number(dm[2]), d: Number(dm[1]) } : null;
    const time = tm ? { hh: Number(tm[1]), mm: Number(tm[2]) } : null;
    why = String(why ?? '').replace(/^[\s|—–:.,;\-]+/, '').replace(/[\s|]+$/, '').trim().slice(0, 160) || null;
    const valid = date ? date.m >= 1 && date.m <= 12 && date.d >= 1 && date.d <= 31 : true;
    if (!valid) return { raw: s, date: null, time: null, passed, why, bad: true };
    return { raw: s, date, time, passed, why };
}

/** Строка в конце ответа без обёртки — похожа ли на тег */
function looseCheck(line) {
    let s = line.replace(DECOR_L, '').replace(DECOR_R, '');
    const al = AL_HEAD.test(s);
    if (al) s = s.replace(AL_HEAD, '');
    if (!s || s.length > 300) return null;
    const p = parseInner(s);
    if (al) return (p.date || p.time || p.passed != null) ? { s, al } : null;
    // начинается с даты (можно с днём недели впереди) и есть время: «15.04.2026, среда, 08:40 — …»
    if (/^(?:[а-яёa-z]+,?\s+)?\d/i.test(s) && p.date && p.time) return { s, al };
    // строка — только время: «08:40», «Утро, 08:40»
    if (/^(?:[а-яёa-z]+,?\s+)?\d{1,2}:\d{2}\.?$/i.test(s)) return { s, al };
    return null;
}

/**
 * Где тег в тексте. kind: ok — обычный; open — не закрыт; loose — строка без обёртки в конце ответа.
 * start/end — позиции в исходном тексте.
 */
export function findTag(text) {
    const src = normSp(text);
    let last = null;
    for (const m of src.matchAll(TAG_RE)) last = m;
    if (last) return { inner: last[1], start: last.index, end: last.index + last[0].length, kind: 'ok', al: true };
    let om = null;
    for (const m of src.matchAll(OPEN_RE)) om = m;
    if (om) {
        const from = om.index + om[0].length;
        const nl = src.indexOf('\n', from);
        const end = nl < 0 ? src.length : nl;
        return { inner: src.slice(from, end), start: om.index, end, kind: 'open', al: true };
    }
    let seen = 0, end = src.length;
    while (end > 0 && seen < 3) {
        const st = src.lastIndexOf('\n', end - 1) + 1;
        const line = src.slice(st, end);
        if (line.trim()) {
            seen++;
            const r = looseCheck(line);
            if (r) return { inner: r.s, start: st, end, kind: 'loose', al: r.al };
        }
        end = st - 1;
    }
    return null;
}

export function parseTag(text) {
    const f = findTag(text);
    if (!f) return null;
    return { ...parseInner(f.inner), kind: f.kind, al: f.al, loose: f.kind !== 'ok' };
}
export function stripTags(text) {
    let src = String(text ?? '');
    const f = findTag(src);
    if (f && f.kind !== 'ok') src = src.slice(0, f.start).replace(/[ \t]+$/, '') + src.slice(f.end);
    return src.replace(TAG_RE, '').replace(/\s+$/, '');
}

/** «+20м», «+2ч30м», «+1д4ч» — как в теге */
export function spanTag(min) {
    let m = Math.max(0, Math.round(min ?? 0));
    const d = Math.floor(m / DAY); m -= d * DAY;
    const h = Math.floor(m / 60); m -= h * 60;
    return '+' + [d && `${d}д`, h && `${h}ч`, (m || (!d && !h)) && `${m}м`].filter(Boolean).join('');
}
/** Правильный тег по снимку — образец для модели */
export const tagLine = (sn) => `<!-- AL ${dmy(sn.t)}, ${weekday(sn.t)}, ${clock(sn.t)} | ${spanTag(sn.passed)} | ${String(sn.why || '—').replace(/--+>?/g, '—')} -->`;

/**
 * Время конца ответа по тегу и прошлому времени. Назад время не идёт.
 * @returns {{t:number|null, passed:number|null, note:string|null}}
 */
export function resolveTime(prev, tag) {
    if (!tag) return { t: prev, passed: prev != null ? 0 : null, note: prev != null ? 'нет тега — время не сдвинуто' : null };
    let cand = null;
    if (tag.date && tag.time) cand = fromParts(tag.date.y, tag.date.m, tag.date.d, tag.time.hh, tag.time.mm);
    else if (tag.time && prev != null) {
        // только часы: тот же день, а если раньше прошлого — следующий
        const base = dayStart(prev);
        cand = base + tag.time.hh * 60 + tag.time.mm;
        while (cand < prev - 1) cand += DAY;
        if (tag.passed != null && tag.passed >= DAY) { const want = prev + tag.passed; while (cand < want - DAY / 2) cand += DAY; }
    } else if (tag.date && prev != null) {
        cand = fromParts(tag.date.y, tag.date.m, tag.date.d) + (prev - dayStart(prev));
    }
    if (prev == null) return { t: cand, passed: null, note: cand == null ? 'нет даты в теге' : null };
    if (cand == null) {
        if (tag.passed != null) return { t: prev + Math.max(0, tag.passed), passed: Math.max(0, tag.passed), note: null };
        return { t: prev, passed: 0, note: 'в теге нет времени' };
    }
    if (cand < prev) {
        const fix = prev + Math.max(0, tag.passed ?? 0);
        return { t: fix, passed: fix - prev, note: `модель повела время назад (${dmy(cand)} ${clock(cand)}) — поправлено` };
    }
    return { t: cand, passed: cand - prev, note: null };
}
