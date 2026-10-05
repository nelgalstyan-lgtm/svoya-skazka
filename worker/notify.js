// Письма владелице: «новый заказ» (создано превью) и «заказ оплачен» (решение владелицы 05.10).
// Отправка — привязка Cloudflare send_email (NOTIFY, wrangler.jsonc) с адреса orders@geroenok.online на NOTIFY_TO
// (секрет Worker'а; адрес должен быть подтверждён в Email Routing — туда же приходит support@). Нет привязки или
// адреса — письма просто не отправляются, заказ от этого не зависит.

import { priceOf } from './view.js';

const FROM = 'orders@geroenok.online';
const b64 = (text) => {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
};

export function orderNo(id) { return String(id || '').replace(/[^a-f0-9]/gi, '').slice(0, 8).toUpperCase(); }

/** Текст письма о заказе — по анкете, без фото и без лишних личных данных. */
export function orderSummary(job, event) {
  const i = job.input || {};
  const big = i.tariff === 'big';
  const family = (i.family || []).map((p) => [p.who, p.name].filter(Boolean).join(' ')).join(', ');
  const link = `https://geroenok.online/${big ? 'book-pro' : 'book'}?job=${job.id}`;
  const lines = [
    event === 'paid' ? 'Заказ оплачен — книга дорисовывается.' : 'Новый заказ: создаётся бесплатное превью.',
    '',
    `Номер заказа: ${orderNo(job.id)}`,
    `Книга: ${big ? 'Большая история' : 'Сказка'} · ${priceOf(job)} ₽`,
    `Ребёнок: ${i.name || '—'}${i.age ? `, ${i.age}` : ''}${i.gender ? `, ${String(i.gender).toLowerCase()}` : ''}`,
    `Тема: ${i.theme || '—'}${i.occasion ? ` · повод: ${i.occasion}` : ''} · стиль: ${i.style || '—'}`,
    ...(family ? [`Родные по фото: ${family}`] : []),
    ...(i.coloring && !big ? ['Раскраска: да'] : []),
    `В примеры на сайте: ${i.showcase ? 'можно (перед публикацией спросить)' : 'нет согласия'}`,
    '',
    `Книга: ${link}`
  ];
  return { subject: `${event === 'paid' ? 'Оплачен' : 'Новый заказ'} № ${orderNo(job.id)} — ${i.name || 'без имени'}`, text: lines.join('\n') };
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
