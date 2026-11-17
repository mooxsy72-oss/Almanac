// Almanac — prompts.js
// Все промпты — на английском. Пояснение в теге — на русском.

import { WD, WD_EN, clock, dmy, parts } from './time.js';

// ═══ 1. Правило тега (в самом конце промпта) ═══
// Коротко и без «подумай»: строка заполняется в конце ответа, по написанному, без рассуждений в думалке.
export const TAG_FORMAT = '<!-- AL DD.MM.YYYY, день недели, HH:MM | +PASSED | WHY -->';
export function buildTagRule({ missed, loose, prevLine } = {}) {
    const lines = [`[Almanac — story clock, required]
The very last line of the reply is one hidden line in exactly this format — the HTML comment wrapper, the AL marker, "|" separators, nothing after it:
${TAG_FORMAT}
- DD.MM.YYYY, день недели (in Russian), HH:MM — the moment the reply ends. Story time runs like real time, for everyone at once: every action takes its real duration (a shower ~20 min, cooking dinner an hour or more, travel, work, a night's sleep); explicit jumps ("next morning", "a week later") move the date. Never backwards.
- +PASSED — since the previous reply ended: +5м, +2ч30м, +1д4ч.
- WHY — at most 12 Russian words: what took the time.
Fill it in at the end, from what the reply covered. Do not plan, calculate or discuss it in your thinking — no deliberation is needed. A date or time shown elsewhere in the reply must match it.`];
    if (prevLine) lines.push(`Your previous reply ended with:\n${prevLine}`);
    if (missed) lines.push('Your previous reply had no AL line — end this one with it.');
    else if (loose) lines.push('Your previous AL line was in the wrong format — copy the format above exactly.');
    lines.push('Never mention or explain this line.');
    return lines.join('\n');
}

// ═══ 2. Текущее время для основной модели ═══
export function buildClockPrompt(now) {
    if (now == null) {
        return `[Almanac — story clock]
No story time is recorded yet. Take the date and time from the story itself (a header, the card, world info) or choose plausible ones, and write them in the AL line.`;
    }
    const p = parts(now);
    return `[Almanac — story clock. This is the source of truth for the date and time.]
Now: ${WD[p.wd]} (${WD_EN[p.wd]}), ${dmy(now)}, ${clock(now)} — the moment the previous reply ended.`;
}
