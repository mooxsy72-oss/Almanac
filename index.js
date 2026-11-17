// Almanac — время сюжета, которое идёт логично.
// Основная модель в конце ответа пишет скрытый тег <!-- AL дата, день недели, время | +прошло | на что ушло -->;
// тег сразу вырезается из чата, время хранится в сообщении. Основная модель каждый раз получает текущее время.

import {
    chat, chat_metadata, eventSource, event_types, saveSettingsDebounced, setExtensionPrompt,
    extension_prompt_types, extension_prompt_roles,
    saveChatConditional, updateMessageBlock, substituteParams, main_api,
} from '../../../../script.js';
import { extension_settings, saveMetadataDebounced } from '../../../extensions.js';
import { power_user } from '../../../power-user.js';
import { TAG_RE, parseTag, stripTags, resolveTime, isoOf, fromParts, clock, dmy, weekday, tagLine } from './time.js';
import { buildTagRule, buildClockPrompt } from './prompts.js';
import { info, warn, fail, getLastError } from './log.js';
import { blockHTML, editHTML, STYLES } from './block.js';
import { openMenu, refreshMenu } from './menu.js';

const MODULE = 'almanac';
const VERSION = '0.4.0';
const P_CLOCK = 'almanac_clock', P_TAG = 'almanac_tag';
const DEFAULTS = { enabled: true, showBlock: true, thinkTag: '', style: 'line' };   // thinkTag пусто — тег берётся из «Форматирования»
const OBSOLETE = ['profile', 'context', 'memoryChars', 'maxTokens'];

const S = () => extension_settings[MODULE];

// ═══════════════ Снимки в сообщениях ═══════════════
const swOf = (m) => m?.swipe_id ?? 0;
const isBot = (m) => m && !m.is_user && !m.is_system;
function snap(i) { const m = chat[i]; return m?.extra?.almanac?.[swOf(m)] ?? null; }
function setSnap(i, data) {
    const m = chat[i];
    if (!m) return;
    m.extra = m.extra || {};
    m.extra.almanac = m.extra.almanac || {};
    m.extra.almanac[swOf(m)] = data;
}
function meta() {
    if (!chat_metadata[MODULE]) chat_metadata[MODULE] = { override: null };
    return chat_metadata[MODULE];
}
function lastBot(upTo = chat.length - 1) { for (let k = upTo; k >= 0; k--) if (isBot(chat[k])) return k; return -1; }

/** Время сюжета после сообщения i */
function timeAt(i) {
    let t = null, at = -1;
    for (let k = Math.min(i, chat.length - 1); k >= 0; k--) {
        const s = isBot(chat[k]) ? snap(k) : null;
        if (s && s.t != null) { t = s.t; at = k; break; }
    }
    const ov = meta().override;
    if (ov && ov.t != null && ov.at <= i && ov.at >= at) return ov.t;
    return t;
}

// ═══════════════ Автоподхват времени в старом чате ═══════════════
// Ищем дату и время в последних сообщениях: в видимом тексте (заголовки) и в данных сообщений — общим поиском по шаблонам.
const MONTHS_RE = 'январ[яь]|феврал[яь]|марта?|апрел[яь]|ма[яй]|июн[яь]|июл[яь]|августа?|сентябр[яь]|октябр[яь]|ноябр[яь]|декабр[яь]|january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec';
const monthOf = (w) => {
    const s = w.toLowerCase();
    const ru = ['янв', 'фев', 'мар', 'апр', 'ма', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
    const en = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
    let i = en.findIndex(p => s.startsWith(p));
    if (i < 0) i = ru.findIndex(p => s.startsWith(p));
    return i + 1;
};
// дата в любом привычном виде: 2026-09-17, 2026/09/17, 17.09.2026, 17.09.26, «17 сентября 2026»; метки времени систем (2026-10-24T04:28) — мимо
const DATE_RES = [
    [/(?<!\d)(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?!\d|T\d)/g, (m) => ({ y: +m[1], m: +m[2], d: +m[3] })],
    [/(?<![\d.])(\d{1,2})[./](\d{1,2})[./](\d{4}|\d{2})(?![\d.])/g, (m) => ({ y: m[3].length === 2 ? 2000 + +m[3] : +m[3], m: +m[2], d: +m[1] })],
    [new RegExp(`(?<!\\d)(\\d{1,2})\\s+(${MONTHS_RE})\\.?,?\\s+(\\d{4})`, 'gi'), (m) => ({ y: +m[3], m: monthOf(m[2]), d: +m[1] })],
];
const KEY_NEAR = /(date|дата|today|сегодня|time|clock|время|day|день)\W{0,6}$/i;
const TIME_KEY_RE = /(?:time|clock|время)\W{0,6}(?:\d{4}[-/.]\d{1,2}[-/.]\d{1,2}\s+)?([01]?\d|2[0-3]):([0-5]\d)(?!\d)/i;
const TIME_ANY_RE = /(?<![\d:])([01]?\d|2[0-3]):([0-5]\d)(?![\d:])/;
/** Дата и время в одном сообщении: сначала то, что подписано («date:», «time:»), потом любое */
function findIn(src) {
    let best = null;
    for (const [re, conv] of DATE_RES) {
        re.lastIndex = 0;
        let m;
        while ((m = re.exec(src)) !== null) {
            const d = conv(m);
            if (d.m < 1 || d.m > 12 || d.d < 1 || d.d > 31 || d.y < 1) continue;
            const keyed = KEY_NEAR.test(src.slice(Math.max(0, m.index - 30), m.index));
            if (!best || (keyed && !best.keyed)) best = { ...d, keyed, index: m.index };
            if (keyed) break;
        }
    }
    const tk = src.match(TIME_KEY_RE);
    const ta = tk ? null : (best ? src.slice(best.index, best.index + 60).match(TIME_ANY_RE) : null) || src.match(TIME_ANY_RE);
    const tm = tk || ta;
    return { date: best ? { y: best.y, m: best.m, d: best.d } : null, time: tm ? { hh: +tm[1], mm: +tm[2] } : null };
}
function seedFromChat(upTo) {
    let lateTime = null;          // часы из более новых сообщений без даты (тот же день, позже)
    for (let k = Math.min(upTo, chat.length - 1); k >= Math.max(0, upTo - 14); k--) {
        const m = chat[k];
        if (!m || m.is_system || m.is_user) continue;
        let extra = '';
        try { const { almanac, reasoning, ...rest } = m.extra || {}; extra = JSON.stringify(rest).replace(/\\n/g, '\n'); } catch (e) { extra = ''; }
        for (const [s, where] of [[String(m.mes || ''), 'текст ответа'], [extra, 'данные сообщений']]) {
            const f = findIn(s);
            if (f.date) {
                const time = lateTime || f.time;
                const t = fromParts(f.date.y, f.date.m, f.date.d, time?.hh ?? 12, time?.mm ?? 0);
                if (t != null) return { t, at: k, src: where, noTime: !time };
            }
            if (!lateTime && f.time) lateTime = f.time;
        }
    }
    return null;
}
/** В чате ещё нет времени Almanac — пробуем взять его из самого чата */
const trySeed = () => (chat.length ? trySeedAt(chat.length - 1) : false);
function trySeedAt(last) {
    if (!S().enabled || last < 0) return false;
    if (timeAt(last) != null) return false;
    const found = seedFromChat(last);
    if (!found) return false;
    meta().override = { at: last, t: found.t, seeded: true, src: found.src, confirmed: false };
    saveMetadataDebounced();
    info('время', `в чате не было времени Almanac — взято из чата (${found.src}): ${weekday(found.t)} ${dmy(found.t)} ${clock(found.t)}${found.noTime ? ', часы не нашлись — 12:00' : ''}`);
    return true;
}

// ═══════════════ Ответ бота ═══════════════
/** Тег вырезается из текста, свайпа и показанного текста */
function takeTag(id) {
    const m = chat[id];
    const src = [m.mes, m.extra?.display_text].filter(Boolean).join('\n');
    let tag = parseTag(src);
    if (tag) {
        m.mes = stripTags(m.mes);
        const sw = swOf(m);
        if (Array.isArray(m.swipes) && typeof m.swipes[sw] === 'string') m.swipes[sw] = stripTags(m.swipes[sw]);
        if (typeof m.extra?.display_text === 'string') m.extra.display_text = stripTags(m.extra.display_text);
        try { updateMessageBlock(id, m); } catch (e) { /* сообщение не на экране */ }
    } else if (typeof m.extra?.reasoning === 'string') {
        // строка есть только в размышлениях — берём оттуда (из размышлений не вырезаем)
        const rt = parseTag(m.extra.reasoning);
        if (rt && rt.al && (rt.date || rt.time)) tag = { ...rt, loose: true, kind: 'think' };
    }
    return tag;
}

const KIND = { open: 'не закрыт', loose: 'без обёртки', think: 'только в размышлениях' };
/** Снимок времени для ответа id по найденному тегу */
function applyTag(id, tag) {
    if (timeAt(id - 1) == null && id > 0) trySeedAt(id - 1);
    const prev = timeAt(id - 1);
    const r = resolveTime(prev, tag);
    const loose = tag?.kind === 'loose' || tag?.kind === 'think';
    setSnap(id, { t: r.t, prev, passed: r.passed, why: tag?.why || null, note: r.note, noTag: !tag, loose, kind: tag?.kind || null, raw: tag?.raw || null, bad: !!tag?.bad });
    return r;
}

/** Старые ответы, где тег был в другом формате и не подхватился, — разбираем заново */
function repairChat() {
    if (!S().enabled) return;
    let n = 0;
    for (let k = 0; k < chat.length; k++) {
        if (!isBot(chat[k]) || !snap(k)?.noTag) continue;
        const m = chat[k];
        if (!parseTag([m.mes, m.extra?.display_text].filter(Boolean).join('\n'))) continue;
        try { applyTag(k, takeTag(k)); n++; } catch (e) { fail('починка чата', e); }
    }
    if (n) { saveChatConditional(); info('тег', `подхвачено ${n} старых тегов в другом формате`); }
}

function handleReply(id) {
    if (!S().enabled) return;
    const m = chat[id];
    if (!isBot(m)) return;
    try {
        const tag = takeTag(id);
        const r = applyTag(id, tag);
        const prev = snap(id)?.prev;
        if (!tag) warn('тег', `#${id}: основная модель не поставила тег AL — время ${prev != null ? 'не сдвинуто' : 'не задано'}`);
        else info('тег', `#${id}${KIND[tag.kind] ? ` (тег ${KIND[tag.kind]} — разобран)` : ''}: ${tag.raw}${r.note ? ` → ${r.note}` : ''}`, { t: r.t != null ? `${dmy(r.t)} ${clock(r.t)}` : null });
    } catch (e) {
        fail('ответ бота', e);
    }
    saveChatConditional();
    injectFor(chat.length - 1);
    scheduleRender();
    announce();
    refreshMenu(menuApi);
}

// ═══════════════ Ручная правка времени ═══════════════
/** Модель ошиблась — время ответа i задаётся вручную; у следующих ответов пересчитывается «прошло» */
function editTime(i, t) {
    if (t == null) return;
    const md = meta();
    const s = i >= 0 && isBot(chat[i]) ? snap(i) : null;
    if (!s) {
        md.override = { at: Math.max(0, chat.length - 1), t, confirmed: true };
        saveMetadataDebounced();
    } else {
        if (md.override && md.override.at >= i) { md.override = null; saveMetadataDebounced(); }
        const prev = timeAt(i - 1);
        setSnap(i, { ...s, t, prev, passed: prev != null ? t - prev : null, note: 'исправлено вручную', edited: true, noTag: false, loose: false });
        for (let k = i + 1; k < chat.length; k++) {
            const n = isBot(chat[k]) ? snap(k) : null;
            if (!n) continue;
            const p = timeAt(k - 1);
            // ответ без тега идёт за новым временем, с тегом — остаётся, меняется только «прошло»
            if (n.noTag && !n.edited) setSnap(k, { ...n, t: p, prev: p, passed: 0 });
            else setSnap(k, { ...n, prev: p, passed: p != null && n.t != null ? n.t - p : n.passed });
        }
        saveChatConditional();
    }
    info('время', `исправлено вручную${s ? ` (#${i})` : ''}: ${weekday(t)} ${dmy(t)} ${clock(t)}`);
    injectFor(chat.length - 1);
    scheduleRender();
    announce();
    refreshMenu(menuApi);
}
const mesIndex = (el) => Number(el?.closest('.mes[mesid]')?.getAttribute('mesid'));
function startEdit(box) {
    const i = mesIndex(box);
    const t = snap(i)?.t ?? timeAt(i);
    box.classList.add('al-editing');
    box.dataset.key = '';
    box.innerHTML = editHTML(t);
    box.querySelector('.al-f-time')?.focus();
}
function finishEdit(box, save) {
    const i = mesIndex(box);
    if (save) {
        const d = box.querySelector('.al-f-date')?.value || '', tm = box.querySelector('.al-f-time')?.value || '12:00';
        const dm = d.match(/^(\d{1,6})-(\d{2})-(\d{2})$/), hm = tm.match(/^(\d{2}):(\d{2})/);
        if (!dm || !hm) { window.toastr?.warning?.('Укажите дату и время', 'Almanac'); return; }
        box.classList.remove('al-editing');
        editTime(i, fromParts(Number(dm[1]), Number(dm[2]), Number(dm[3]), Number(hm[1]), Number(hm[2])));
    } else box.classList.remove('al-editing');
    box.dataset.key = '';
    renderAll();
}

// ═══════════════ Инджект ═══════════════
let genType = null;
const isCC = () => main_api === 'openai';
const mainGen = () => !['quiet', 'impersonate'].includes(genType);
function clearPrompts() {
    setExtensionPrompt(P_CLOCK, '', extension_prompt_types.IN_CHAT, 1);
    setExtensionPrompt(P_TAG, '', extension_prompt_types.IN_CHAT, 0);
}
/** Состояние прошлого ответа для правила: не было тега / был в чужом формате + образец правильного тега */
function ruleArgs(base) {
    const k = lastBot(base);
    const s = k >= 0 ? snap(k) : null;
    const t = timeAt(base);
    return { missed: !!s?.noTag, loose: !!s?.loose, prevLine: t != null ? tagLine({ t, passed: s && !s.noTag ? s.passed : 0, why: s && !s.noTag ? s.why : null }) : null };
}
let lastRule = '', promptBase = null;
function injectFor(base) {
    if (!S().enabled || !mainGen()) { clearPrompts(); return; }
    setExtensionPrompt(P_CLOCK, buildClockPrompt(timeAt(base)), extension_prompt_types.IN_CHAT, 1, false, extension_prompt_roles.SYSTEM);
    // для Chat Completion правило тега ставится в самый конец в onPromptReady
    promptBase = base;
    lastRule = buildTagRule(ruleArgs(base));
    setExtensionPrompt(P_TAG, isCC() ? '' : lastRule, extension_prompt_types.IN_CHAT, 0, false, extension_prompt_roles.SYSTEM);
}
// у ответов бота вырезаем и теги в чужом формате, у остального — только обычные
const stripText = (t, role) => (role === 'assistant' ? stripTags(t) : String(t).replace(TAG_RE, ''));
function onPromptReady(data) {
    if (!data || !Array.isArray(data.chat)) return;
    for (const msg of data.chat) {
        if (typeof msg.content === 'string') msg.content = stripText(msg.content, msg.role);
        else if (Array.isArray(msg.content)) for (const part of msg.content) if (part?.type === 'text') part.text = stripText(part.text, msg.role);
    }
    if (data.dryRun || !S().enabled || !mainGen()) return;
    let at = data.chat.length;
    while (at > 0 && data.chat[at - 1]?.role === 'assistant') at--;
    data.chat.splice(at, 0, { role: 'system', content: substituteParams(buildTagRule(ruleArgs(promptBase ?? chat.length - 1))) });
}
function onTextPrompt(data) {
    if (data && typeof data.prompt === 'string') {
        const rule = lastRule || buildTagRule({});
        data.prompt = data.prompt.replace(TAG_RE, (x) => (rule.includes(x.trim()) ? x : ''));
    }
}
function onAfterCommands(type) {
    genType = type || 'normal';
    if (!S().enabled) return;
    const last = chat.length - 1;
    const rewrites = ['swipe', 'regenerate', 'continue'].includes(type) && isBot(chat[last]);
    injectFor(rewrites ? last - 1 : last);
}
function onGenerationStarted(type, opts, dryRun) { if (dryRun) return; genType = type || 'normal'; generating = true; if (!mainGen()) clearPrompts(); }
function onGenerationEnded() { genType = null; generating = false; injectFor(chat.length - 1); scheduleRender(); }

// ═══════════════ События ═══════════════
let generating = false;
function onMessageReceived(id, type) {
    if (['first_message', 'quiet', 'impersonate'].includes(type)) return;
    const i = Number(id);
    if (!isBot(chat[i])) return;
    setTimeout(() => handleReply(i), 30);
}
function onSwiped(id) {
    const i = Number(id);
    setTimeout(() => {
        const m = chat[i];
        if (!isBot(m)) return;
        const pendingNew = swOf(m) >= (m.swipes?.length ?? 1) || !String(m.mes || '').trim();
        if (pendingNew) return;
        if (!snap(i) && i === lastBot()) handleReply(i);
        else { injectFor(chat.length - 1); scheduleRender(); announce(); }
    }, 150);
}
function onEdited(id) {
    const i = Number(id);
    if (isBot(chat[i]) && parseTag(chat[i].mes)) handleReply(i);
    else scheduleRender();
}
function onDeleted() {
    const md = meta(), last = chat.length - 1;
    if (md.override && md.override.at > last) md.override.at = Math.max(0, last);
    injectFor(last);
    scheduleRender();
    announce();
}
function onChatChanged() {
    repairChat();
    trySeed();
    injectFor(chat.length - 1);
    scheduleRender();
    announce();
}

/** Для других расширений: текущее время сюжета */
function nowInfo() {
    const t = timeAt(chat.length - 1);
    return t == null ? null : { t, iso: isoOf(t), date: dmy(t), time: clock(t), weekday: weekday(t) };
}
function announce() {
    try { document.dispatchEvent(new CustomEvent('almanac:time', { detail: nowInfo() })); } catch (e) { /* нет */ }
}

// ═══════════════ Инфоблок ═══════════════
let renderTimer = null;
function scheduleRender() { clearTimeout(renderTimer); renderTimer = setTimeout(renderAll, 60); }

// ─── Где кончается думалка ───
// Разобранная думалка лежит в отдельном блоке над текстом — тогда инфоблок просто в начале текста.
// Если не разобралась, она остаётся в тексте: свой тег (например <reasoning>) показывается абзацем, а <think> таверна вырезает совсем.
// Поэтому конец думалки ищем по самому сообщению: по закрывающему тегу, а если его не видно — по последним словам думалки.
const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Теги думалки: заданный вручную, из «Форматирования → Рассуждения», затем обычные */
export function thinkMarks() {
    const out = [];
    const add = (pre, suf, src) => { pre = String(pre || '').trim(); suf = String(suf || '').trim(); if (pre && suf && !out.some(x => x.pre === pre && x.suf === suf)) out.push({ pre, suf, src }); };
    const custom = String(S().thinkTag || '').trim().replace(/[<>/\s]/g, '');
    if (custom) add(`<${custom}>`, `</${custom}>`, 'вручную');
    add(power_user?.reasoning?.prefix, power_user?.reasoning?.suffix, 'форматирование');
    for (const t of ['think', 'thinking', 'reasoning']) add(`<${t}>`, `</${t}>`, 'по умолчанию');
    return out;
}
/** Думалка в начале сырого текста: { suf, body } или null */
function thinkInRaw(mes) {
    const src = String(mes || '');
    const lead = src.match(/^\s*/)[0].length;
    for (const k of thinkMarks()) {
        if (!src.slice(lead, lead + k.pre.length + 2).toLowerCase().startsWith(k.pre.toLowerCase())) continue;
        const end = src.toLowerCase().indexOf(k.suf.toLowerCase(), lead + k.pre.length);
        return { suf: k.suf, body: end < 0 ? null : src.slice(lead + k.pre.length, end) };
    }
    // любой тег вида <Слово>…</Слово> в самом начале
    const g = src.slice(lead).match(/^<([A-Za-z][\w-]{0,30})>([\s\S]*?)<\/\1\s*>/i);
    return g ? { suf: `</${g[1]}>`, body: g[2] } : null;
}
const THINKISH = (n) => n.nodeType === 1 && (/^(details|think|thinking|reasoning)$/i.test(n.tagName) || /think|reason/i.test(String(n.className || '')));
/** Точка в тексте сразу после думалки: { node, off } или null */
function thinkPoint(textEl, el, mes) {
    const th = thinkInRaw(mes);
    if (!th) return null;
    const nodes = [];
    const tw = document.createTreeWalker(textEl, NodeFilter.SHOW_TEXT, { acceptNode: (n) => (el.contains(n) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT) });
    for (let n = tw.nextNode(); n; n = tw.nextNode()) nodes.push(n);
    const full = nodes.map(n => n.textContent).join('');
    const at = (pos) => { let acc = 0; for (const n of nodes) { const L = n.textContent.length; if (pos <= acc + L) return { node: n, off: pos - acc }; acc += L; } return null; };
    // 1. закрывающий тег виден в тексте
    const si = full.toLowerCase().indexOf(th.suf.toLowerCase());
    if (si >= 0) return at(si + th.suf.length);
    // 2. тег вырезан — ищем последние буквы думалки (без пробелов и разметки)
    if (!th.body) return null;
    const letters = (s) => [...s].filter(c => /[\p{L}\p{N}]/u.test(c));
    const tail = letters(th.body).slice(-24).join('').toLowerCase();
    if (tail.length < 6) return null;
    const map = [], flat = [];
    [...full].reduce((pos, c) => { if (/[\p{L}\p{N}]/u.test(c)) { flat.push(c.toLowerCase()); map.push(pos + c.length); } return pos + c.length; }, 0);
    const fi = flat.join('').indexOf(tail);
    return fi < 0 ? null : at(map[fi + tail.length - 1]);
}
/** После какого узла ставить инфоблок (null — в самое начало). Если думалка кончается посреди абзаца, абзац делится. */
function anchorIn(textEl, el, mes) {
    let prev = null;
    for (const n of textEl.childNodes) {
        if (n === el || n.nodeType === 8 || (n.nodeType === 3 && !n.textContent.trim())) continue;
        if (THINKISH(n)) { prev = n; continue; }
        break;
    }
    if (prev) return prev;
    const pt = thinkPoint(textEl, el, mes);
    if (!pt) return null;
    let top = pt.node;
    while (top.parentNode && top.parentNode !== textEl) top = top.parentNode;
    if (top.parentNode !== textEl) return null;
    const rest = document.createRange();
    rest.setStart(pt.node, pt.off);
    rest.setEndAfter(top.lastChild || top);
    if (top.nodeType === 1 && rest.toString().trim()) {
        const tail = rest.extractContents();
        const part = document.createElement(top.tagName);
        part.append(tail);
        while (part.firstChild && (part.firstChild.nodeName === 'BR' || (part.firstChild.nodeType === 3 && !part.firstChild.textContent.trim()))) part.firstChild.remove();
        top.after(part);
    }
    return top;
}
function renderAll() {
    const s = S();
    if (!s.enabled || !s.showBlock) { document.querySelectorAll('#chat .al-ib').forEach(x => x.remove()); return; }
    document.querySelectorAll('#chat .mes[mesid]').forEach(mesEl => {
        const i = Number(mesEl.getAttribute('mesid'));
        const sn = isBot(chat[i]) ? snap(i) : null;
        let el = mesEl.querySelector('.al-ib');
        if (!sn || sn.t == null) { el?.remove(); return; }
        const textEl = mesEl.querySelector('.mes_text');
        if (!textEl) return;
        if (!el) { el = document.createElement('div'); el.className = 'al-ib'; }
        if (el.classList.contains('al-editing')) return;   // идёт правка — не трогаем
        const prev = anchorIn(textEl, el, chat[i]?.mes);
        const want = prev ? prev.nextSibling : textEl.firstChild;
        if (el.parentNode !== textEl || (el !== want && el.previousElementSibling !== (prev || null))) {
            if (prev) prev.after(el); else textEl.prepend(el);
        }
        const style = STYLES.some(x => x.id === s.style) ? s.style : 'line';
        const key = JSON.stringify([sn.t, sn.passed, sn.why, sn.note, style]);
        if (el.dataset.key !== key) { el.dataset.key = key; el.className = `al-ib al-s-${style}`; el.innerHTML = blockHTML(sn, style); }
    });
}

// Другие расширения перерисовывают текст ответа — блок возвращается на место
let mo = null;
function watchChat() {
    const chatEl = document.getElementById('chat');
    if (!chatEl || mo) return;
    let t = null;
    mo = new MutationObserver(() => { if (generating) return; clearTimeout(t); t = setTimeout(() => {
        const s = S();
        if (!s.enabled || !s.showBlock) return;
        const missing = [...chatEl.querySelectorAll('.mes[mesid]')].some(m => {
            const i = Number(m.getAttribute('mesid'));
            const sn = isBot(chat[i]) ? snap(i) : null;
            return sn?.t != null && !m.querySelector('.mes_text > .al-ib');
        });
        if (missing) renderAll();
    }, 200); });
    mo.observe(chatEl, { childList: true, subtree: true });
    chatEl.addEventListener('click', (e) => {
        const b = e.target.closest('.al-ib [data-al-act]');
        if (!b) return;
        e.stopPropagation();
        const box = b.closest('.al-ib'), act = b.dataset.alAct;
        if (act === 'edit') startEdit(box);
        else if (act === 'edit-ok') finishEdit(box, true);
        else if (act === 'edit-cancel') finishEdit(box, false);
        else openMenu(menuApi);
    }, true);
    // в полях правки клавиши не уходят таверне (стрелки = свайпы и т.п.); Enter — сохранить, Esc — отмена
    chatEl.addEventListener('keydown', (e) => {
        const box = e.target.closest?.('.al-ib');
        if (!box) return;
        const act = e.target.dataset?.alAct;
        if (box.classList.contains('al-editing')) {
            e.stopPropagation();
            if (e.key === 'Enter') { e.preventDefault(); finishEdit(box, act !== 'edit-cancel'); }
            else if (e.key === 'Escape') { e.preventDefault(); finishEdit(box, false); }
        } else if (act && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault(); e.stopPropagation();
            if (act === 'edit') startEdit(box); else openMenu(menuApi);
        }
    }, true);
}

// ═══════════════ Меню ═══════════════
const menuApi = {
    now: () => timeAt(chat.length - 1),
    /** время взято из чата и ещё не подтверждено */
    seeded() {
        const ov = meta().override;
        if (!ov?.seeded || ov.confirmed) return null;
        // после него уже были ответы со своим тегом — подсказка больше не нужна
        for (let k = ov.at + 1; k < chat.length; k++) if (isBot(chat[k]) && snap(k)?.t != null && !snap(k)?.noTag) return null;
        return { src: ov.src };
    },
    confirmSeed() { const ov = meta().override; if (ov) { ov.confirmed = true; saveMetadataDebounced(); } },
    settings: () => S(),
    lastError: () => getLastError(),
    /** правка из окна — время последнего ответа (или стартовое, если ответов ещё нет) */
    setTime(t) { editTime(lastBot(), t); },
    /** тег думалки: что сейчас используется */
    thinkInfo() { const k = thinkMarks()[0]; return k ? { tag: `${k.pre}…${k.suf}`, src: k.src } : null; },
    /** перечитать тег из «Форматирования» и переставить инфоблоки */
    refreshThink() {
        S().thinkTag = '';
        saveSettingsDebounced();
        document.querySelectorAll('#chat .al-ib').forEach(x => x.remove());
        renderAll();
        const k = thinkMarks()[0];
        info('думалка', `тег думалки: ${k ? `${k.pre}…${k.suf} (${k.src})` : 'не задан'}`);
        window.toastr?.success?.(k ? `Тег думалки: ${k.pre}…${k.suf}` : 'Тег думалки не задан', 'Almanac');
    },
    toggle(key, val) {
        const s = S();
        if (key === 'thinkTag') val = String(val || '').trim().replace(/[<>/\s]/g, '');
        s[key] = val;
        saveSettingsDebounced();
        if (key === 'enabled') { if (val) injectFor(chat.length - 1); else clearPrompts(); }
        if (key === 'thinkTag') document.querySelectorAll('#chat .al-ib').forEach(x => x.remove());
        scheduleRender();
    },
};

function addWandItem() {
    if (document.getElementById('almanac_wand')) return true;
    const menu = document.getElementById('extensionsMenu');
    if (!menu) return false;
    const item = document.createElement('div');
    item.id = 'almanac_wand';
    item.className = 'list-group-item flex-container flexGap5 interactable';
    item.tabIndex = 0;
    item.innerHTML = '<div class="fa-solid fa-hourglass-half extensionsMenuExtensionButton"></div><span>Almanac</span>';
    item.addEventListener('click', () => openMenu(menuApi));
    menu.appendChild(item);
    return true;
}

// ═══════════════ Запуск ═══════════════
function on(evt, fn) { if (evt) eventSource.on(evt, fn); }
jQuery(() => {
    extension_settings[MODULE] = Object.assign({}, DEFAULTS, extension_settings[MODULE] || {});
    for (const k of OBSOLETE) delete extension_settings[MODULE][k];
    if (extension_settings[MODULE].thinkTag === 'think') extension_settings[MODULE].thinkTag = '';   // старое значение по умолчанию → авто
    if (!addWandItem()) { const iv = setInterval(() => { if (addWandItem()) clearInterval(iv); }, 1000); setTimeout(() => clearInterval(iv), 30000); }
    if (typeof eventSource.makeFirst === 'function') eventSource.makeFirst(event_types.MESSAGE_RECEIVED, onMessageReceived);
    else on(event_types.MESSAGE_RECEIVED, onMessageReceived);
    on(event_types.MESSAGE_SWIPED, onSwiped);
    on(event_types.MESSAGE_SENT, () => injectFor(chat.length - 1));
    on(event_types.MESSAGE_EDITED, onEdited);
    on(event_types.MESSAGE_DELETED, onDeleted);
    on(event_types.CHAT_CHANGED, onChatChanged);
    on(event_types.GENERATION_AFTER_COMMANDS, onAfterCommands);
    on(event_types.GENERATION_STARTED, onGenerationStarted);
    on(event_types.GENERATION_ENDED, onGenerationEnded);
    on(event_types.GENERATION_STOPPED, onGenerationEnded);
    on(event_types.CHAT_COMPLETION_PROMPT_READY, onPromptReady);
    on(event_types.SETTINGS_UPDATED, () => { scheduleRender(); refreshMenu(menuApi); });   // поменяли тег в «Форматировании»
    on(event_types.GENERATE_AFTER_COMBINE_PROMPTS, onTextPrompt);
    for (const evt of [event_types.CHARACTER_MESSAGE_RENDERED, event_types.MESSAGE_UPDATED, event_types.MORE_MESSAGES_LOADED]) on(evt, scheduleRender);
    watchChat();
    window.addEventListener('error', (e) => { if (/Almanac/.test(String(e?.filename || ''))) fail('страница', e.error || e.message); });
    globalThis.Almanac = { version: VERSION, now: nowInfo, timeAt, snap, openMenu: () => openMenu(menuApi), editTime, handleReply, injectFor, renderAll };
    info('запуск', `Almanac ${VERSION} загружен`);
});
