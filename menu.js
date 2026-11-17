// Almanac — menu.js
// Окно из волшебной палочки. Вкладка «Время»: текущее время сюжета с правкой, переключатели, тег думалки. Вкладка «Вид»: оформление инфоблока.

import { fromParts, parts, clock, longDate, weekday } from './time.js';
import { STYLES, blockHTML } from './block.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = (n) => String(n).padStart(2, '0');

let root = null;
const view = { editTime: false, tab: 'time' };

/**
 * api: { now(), setTime(t), seeded(), confirmSeed(), settings(), lastError(), toggle(key,val), thinkInfo(), refreshThink() }
 */
export async function openMenu(api) {
    const { callGenericPopup, POPUP_TYPE } = await import('../../../popup.js');
    view.editTime = false;
    root = document.createElement('div');
    root.className = 'al-menu';
    root.addEventListener('click', (e) => onClick(e, api));
    root.addEventListener('change', (e) => onChange(e, api));
    root.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches?.('.al-style')) { e.preventDefault(); e.target.click(); } });
    render(api);
    await callGenericPopup(root, POPUP_TYPE.DISPLAY, '', { wide: false, large: false, allowVerticalScrolling: true });
    root = null;
}

export function refreshMenu(api) { if (root?.isConnected) render(api); }

function render(api) {
    if (!root) return;
    const s = api.settings();
    const now = api.now();
    const err = api.lastError();
    const head = now == null
        ? `<div class="al-now"><div class="al-now-main"><span class="al-now-wd">время ещё не задано</span><span class="al-now-date">—</span></div>${timeButton()}</div>`
        : `<div class="al-now"><div class="al-now-main"><span class="al-now-wd">${esc(weekday(now))}</span><span class="al-now-date">${esc(longDate(now))}</span></div><span class="al-now-time">${clock(now)}</span>${timeButton()}</div>`;
    const edit = view.editTime ? timeForm(now) : '';
    const seeded = api.seeded();
    const seedHint = seeded && now != null ? `<div class="al-hint"><i class="fa-solid fa-circle-info"></i><span>Время взято из чата (${esc(seeded.src)}) — проверьте</span><button class="menu_button al-btn al-ghost" data-al-act="seed-ok"><i class="fa-solid fa-check"></i>Верно</button></div>` : '';
    const toggles = `<div class="al-toggles">
        ${toggle('enabled', 'Almanac', s.enabled)}
        ${toggle('showBlock', 'Инфоблок', s.showBlock)}
    </div>`;
    const banner = err ? `<div class="al-banner"><i class="fa-solid fa-triangle-exclamation"></i><span>${esc(err.message)}</span></div>` : '';
    const think = api.thinkInfo?.();
    const settings = `<div class="al-set">
        <div class="al-row"><span>Тег думалки</span><span class="al-think"><input class="text_pole" type="text" data-al-set="thinkTag" value="${esc(s.thinkTag)}" placeholder="${esc(think?.tag || 'think')} · авто"><button class="al-icon" data-al-act="think-refresh" title="Взять тег из «Форматирования» заново"><i class="fa-solid fa-arrows-rotate"></i></button></span></div>
    </div>`;
    const tabs = `<div class="al-top"><div class="al-title"><i class="fa-solid fa-hourglass-half"></i>Almanac</div><div class="al-tabs" role="tablist">
        ${[['time', 'Время'], ['look', 'Вид']].map(([id, label]) => `<button class="al-tab${view.tab === id ? ' on' : ''}" role="tab" aria-selected="${view.tab === id}" data-al-act="tab" data-tab="${id}">${label}</button>`).join('')}
    </div></div>`;
    root.innerHTML = tabs + (view.tab === 'look' ? lookTab(s, now) : `${head}${edit}${seedHint}${toggles}${banner}${settings}`);
}

/** Вкладка «Вид»: четыре оформления с живым предпросмотром */
function lookTab(s, now) {
    const sample = { t: now ?? fromParts(2026, 4, 22, 22, 12), passed: 20 };
    const cur = STYLES.some(x => x.id === s.style) ? s.style : 'line';
    return `<div class="al-styles" role="radiogroup">${STYLES.map(st => `
        <div class="al-style${cur === st.id ? ' on' : ''}" role="radio" aria-checked="${cur === st.id}" tabindex="0" data-al-act="style" data-style="${st.id}">
            <span class="al-style-name">${esc(st.name)}<i class="fa-solid fa-check"></i></span>
            <div class="al-ib al-s-${st.id} al-preview" aria-hidden="true">${blockHTML(sample, st.id)}</div>
        </div>`).join('')}
    </div>`;
}

const timeButton = () => `<button class="al-icon" data-al-act="edit-time" title="Исправить время"><i class="fa-solid fa-pen"></i></button>`;
const toggle = (key, label, on) => `<label class="al-switch"><input type="checkbox" data-al-set="${key}"${on ? ' checked' : ''}><span class="al-knob"></span><span>${label}</span></label>`;

function timeForm(now) {
    const p = now != null ? parts(now) : null;
    const date = p ? `${String(p.y).padStart(4, '0')}-${pad(p.m)}-${pad(p.d)}` : '';
    const time = p ? `${pad(p.hh)}:${pad(p.mm)}` : '12:00';
    return `<div class="al-timeform">
        <input type="date" class="text_pole" data-al-f="date" value="${date}">
        <input type="time" class="text_pole" data-al-f="time" value="${time}">
        <button class="menu_button al-btn" data-al-act="save-time"><i class="fa-solid fa-check"></i>Сохранить</button>
    </div>`;
}

function onClick(e, api) {
    const b = e.target.closest('[data-al-act]');
    if (!b || !root?.contains(b)) return;
    const act = b.dataset.alAct;
    if (act === 'tab') { view.tab = b.dataset.tab; view.editTime = false; }
    else if (act === 'style') api.toggle('style', b.dataset.style);
    else if (act === 'edit-time') view.editTime = !view.editTime;
    else if (act === 'seed-ok') api.confirmSeed();
    else if (act === 'save-time') {
        const d = root.querySelector('[data-al-f="date"]').value;
        const t = root.querySelector('[data-al-f="time"]').value || '12:00';
        const dm = d.match(/^(\d{1,6})-(\d{2})-(\d{2})$/), tm = t.match(/^(\d{2}):(\d{2})/);
        if (!dm || !tm) { window.toastr?.warning?.('Укажите дату и время', 'Almanac'); return; }
        api.setTime(fromParts(Number(dm[1]), Number(dm[2]), Number(dm[3]), Number(tm[1]), Number(tm[2])));
        view.editTime = false;
    } else if (act === 'think-refresh') api.refreshThink();
    render(api);
}

function onChange(e, api) {
    const el = e.target.closest('[data-al-set]');
    if (!el) return;
    const val = el.type === 'checkbox' ? el.checked : el.value;
    api.toggle(el.dataset.alSet, val);
    if (el.type === 'checkbox') render(api);
}
