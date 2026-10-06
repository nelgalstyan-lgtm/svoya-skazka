// Письма владелице: «новый заказ» (создано превью) и «заказ оплачен» (решение владелицы 05.10), «книга дорисована»
// с итогом проверки похожести (правило владелицы 07.10, likeness.js).
// Отправка — привязка Cloudflare send_email (NOTIFY, wrangler.jsonc) с адреса orders@geroenok.online на NOTIFY_TO
// (секрет Worker'а; адрес должен быть подтверждён в Email Routing — туда же приходит support@). Нет привязки или
// адреса — письма просто не отправляются, заказ от этого не зависит.

import { priceOf } from './view.js';
import { LIKENESS_MIN } from './likeness.js';

const FROM = 'orders@geroenok.online';
const b64 = (text) => {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
};

export function orderNo(id) { return String(id || '').replace(/[^a-f0-9]/gi, '').slice(0, 8).toUpperCase(); }

const IMAGE_NAMES = { sheet: 'лист героя', cover: 'обложка', 'family-sheet': 'лист родных' };
const imageName = (key) => IMAGE_NAMES[key] || (/^scene-\d+$/.test(key) ? `иллюстрация ${Number(key.slice(6)) + 1}` : key);

/** Строки письма про похожесть: что не прошло проверку, что не проверено, сколько перерисовано. */
export function likenessLines(likeness = {}, family = []) {
  const entries = Object.entries(likeness).sort(([a], [b]) => a.localeCompare(b, 'en', { numeric: true }));
  if (!entries.length) return ['Похожесть: проверки не было — посмотрите все картинки глазами.'];
  const who = (key) => (key === 'child' ? 'ребёнок' : family[Number(key.split('-')[1])]?.who || 'родной');
  const weak = entries.filter(([, v]) => v.score !== null && v.score < LIKENESS_MIN);
  const unchecked = entries.filter(([, v]) => v.score === null);
  const redrawn = entries.filter(([, v]) => v.tries > 1).length;
  const lines = [weak.length
    ? `⚠ Похожесть: посмотрите ${weak.length} из ${entries.length} — проверка не нашла сходства даже после перерисовки:`
    : `Похожесть: все проверенные картинки (${entries.length - unchecked.length}) — ${LIKENESS_MIN}+ из 10.`];
  for (const [key, v] of weak) {
    const parts = Object.entries(v.scores || {}).filter(([, s]) => s !== null).map(([k, s]) => `${who(k)} ${s}/10`);
    lines.push(`  • ${imageName(key)}: ${parts.join(', ')}`);
  }
  if (unchecked.length) lines.push(`Не проверено (сбой проверки): ${unchecked.map(([k]) => imageName(k)).join(', ')} — посмотрите глазами.`);
  if (redrawn) lines.push(`Перерисовано автоматически из-за непохожести: ${redrawn}.`);
  return lines;
}

/** Текст письма о заказе — по анкете, без фото и без лишних личных данных. */
export function orderSummary(job, event) {
  const i = job.input || {};
  const big = i.tariff === 'big';
  const family = (i.family || []).map((p) => [p.who, p.name].filter(Boolean).join(' ')).join(', ');
  const link = `https://geroenok.online/${big ? 'book-pro' : 'book'}?job=${job.id}`;
  const lines = [
    event === 'drawn' ? 'Книга дорисована и открыта покупателю. Проверьте, что все похожи на себя; непохожую картинку можно перерисовать по ссылке ниже.'
      : event === 'paid' ? 'Заказ оплачен — книга дорисовывается.' : 'Новый заказ: создаётся бесплатное превью.',
    '',
    `Номер заказа: ${orderNo(job.id)}`,
    `Книга: ${big ? 'Большая история' : 'Сказка'} · ${priceOf(job)} ₽`,
    `Ребёнок: ${i.name || '—'}${i.age ? `, ${i.age}` : ''}${i.gender ? `, ${String(i.gender).toLowerCase()}` : ''}`,
    `Тема: ${i.theme || '—'}${i.occasion ? ` · повод: ${i.occasion}` : ''} · стиль: ${i.style || '—'}`,
    ...(family ? [`Родные по фото: ${family}`] : []),
    ...(i.coloring && !big ? ['Раскраска: да'] : []),
    `В примеры на сайте: ${i.showcase ? 'можно — заказчик согласен' : 'нет согласия'}`,
    '',
    ...(event === 'drawn' ? [...likenessLines(job.likeness, i.family || []), ''] : []),
    `Книга: ${link}`
  ];
  const weak = event === 'drawn' && Object.values(job.likeness || {}).some((v) => v.score === null || v.score < LIKENESS_MIN);
  const head = event === 'drawn' ? (weak ? '⚠ Проверить похожесть' : 'Дорисована') : event === 'paid' ? 'Оплачен' : 'Новый заказ';
  return { subject: `${head} № ${orderNo(job.id)} — ${i.name || 'без имени'}`, text: lines.join('\n') };
}

export async function notifyOwner(env, job, event, log = console.warn) {
  if (!env.NOTIFY || !env.NOTIFY_TO) return false;
  try {
    const { EmailMessage } = await import('cloudflare:email');
    const { subject, text } = orderSummary(job, event);
    const raw = [
      `From: =?UTF-8?B?${b64('Героёнок')}?= <${FROM}>`,
      `To: <${env.NOTIFY_TO}>`,
      `Subject: =?UTF-8?B?${b64(subject)}?=`,
      `Message-ID: <${crypto.randomUUID()}@geroenok.online>`,
      `Date: ${new Date().toUTCString()}`,
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset=UTF-8',
      'Content-Transfer-Encoding: base64',
      '',
      b64(text).replace(/.{76}/g, '$&\r\n')
    ].join('\r\n');
    await env.NOTIFY.send(new EmailMessage(FROM, env.NOTIFY_TO, raw));
    return true;
  } catch (error) {
    log(`[notify] письмо не отправлено: ${error?.message || error}`);
    return false;
  }
}
