// Almanac — block.js
// Инфоблок в начале ответа (после думалки): день недели · дата · время, сколько прошло, карандаш для правки. Четыре оформления.

import { weekday, longDate, clock, dmy, spanText, isoOf, parts, WD_SHORT, MONTH_GEN } from './time.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Оформления инфоблока */
export const STYLES = [
    { id: 'line', name: 'Линия' },
    { id: 'pill', name: 'Капсула' },
    { id: 'tablo', name: 'Табло' },
    { id: 'chapter', name: 'Глава' },
];
const shortDate = (t) => { const p = parts(t); return `${p.d} ${MONTH_GEN[p.m - 1].slice(0, 3)}`; };
const PEN = '<span class="al-pen" data-al-act="edit" role="button" tabindex="0" title="Исправить время"><i class="fa-solid fa-pen"></i></span>';
const SP = '<span class="al-pen-sp" aria-hidden="true"></span>';   // противовес карандашу — блок ровно по центру

export function blockHTML(sn, style = 'line') {
    const t = sn.t;
    const pass = sn.passed ? `<span class="al-pass">${esc(spanText(sn.passed))}</span>` : '';
    const title = [sn.why, sn.note].filter(Boolean).join(' · ');
    const core = (cls, inner) => `<span class="al-core ${cls}" data-al-act="open" role="button" tabindex="0"${title ? ` title="${esc(title)}"` : ''}>${inner}</span>`;
    if (style === 'pill') {
        // компактная капсула: ◷ пн 30 мар · 09:15 +5 мин
        return SP + core('', `<i class="fa-regular fa-clock al-ico"></i><span class="al-wd">${WD_SHORT[parts(t).wd]}</span><span class="al-date">${esc(shortDate(t))}</span><span class="al-dot"></span><b class="al-time">${clock(t)}</b>${pass}`) + PEN;
    }
    if (style === 'tablo') {
        // табло: моноширинные ячейки в тонкой рамке — СР │ 22.04.2026 │ 22:12 │ +20 мин
        return SP + core('', `<span class="al-seg al-wd">${WD_SHORT[parts(t).wd]}</span><span class="al-seg al-date">${dmy(t)}</span><b class="al-seg al-time">${clock(t)}</b>${sn.passed ? `<span class="al-seg al-pass">${esc(spanText(sn.passed))}</span>` : ''}`) + PEN;
    }
    if (style === 'chapter') {
        // глава: две строки — время, под ним мелко день недели и дата
        return SP + core('', `<span class="al-row1"><b class="al-time">${clock(t)}</b>${pass}</span><span class="al-sub">${esc(weekday(t))} · ${esc(longDate(t))}</span>`) + PEN;
    }
    // линия: ——— понедельник · 30 марта 2026 · 09:15 +5 мин ———
    return `<span class="al-rule"></span>${SP}
        ${core('', `<span class="al-wd">${esc(weekday(t))}</span><span class="al-sep">·</span><span class="al-date">${esc(longDate(t))}</span><span class="al-sep">·</span><b class="al-time">${clock(t)}</b>${pass}`)}
        ${PEN}
        <span class="al-rule"></span>`;
}

/** Инфоблок в режиме правки: дата, время, сохранить / отмена */
export function editHTML(t) {
    const date = t != null ? isoOf(t) : '', time = t != null ? clock(t) : '12:00';
    return `<span class="al-rule"></span>
        <span class="al-editbox">
            <input type="date" class="text_pole al-f-date" value="${date}">
            <input type="time" class="text_pole al-f-time" value="${time}">
            <span class="al-pen" data-al-act="edit-ok" role="button" tabindex="0" title="Сохранить (Enter)"><i class="fa-solid fa-check"></i></span>
            <span class="al-pen" data-al-act="edit-cancel" role="button" tabindex="0" title="Отмена (Esc)"><i class="fa-solid fa-xmark"></i></span>
        </span>
        <span class="al-rule"></span>`;
}
