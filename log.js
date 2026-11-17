// Almanac — log.js
// Журнал в консоль браузера (F12) и последняя ошибка — для плашки в окне. Наружу ничего не отправляется и не сохраняется.

let lastError = null;        // { at, where, message }

export function log(level, kind, msg, data) {
    const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.debug;
    fn(`[Almanac] ${kind}: ${msg}`, data ?? '');
}
export const info = (k, m, d) => log('info', k, m, d);
export const warn = (k, m, d) => log('warn', k, m, d);

export function fail(where, e) {
    const chain = [];
    for (let x = e; x && chain.length < 5; x = x.cause) {
        const m = x?.error?.message || x?.message || (typeof x === 'string' ? x : '');
        if (m && !chain.includes(m)) chain.push(m);
    }
    lastError = { at: new Date().toISOString(), where, message: chain.join(' → ') || 'неизвестная ошибка' };
    log('error', where, lastError.message, e?.stack);
    return lastError.message;
}
export const getLastError = () => lastError;
