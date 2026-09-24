import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { app } from '../index.js';

const STORE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'generated');

function listen() {
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => resolve({ server, url: `http://127.0.0.1:${server.address().port}` }));
  });
}

function writeJob(id, result, extra = {}) {
  const job = { id, status: 'completed', createdAt: Date.now(), finishedAt: Date.now(), input: { name: 'Милена', style: 'Акварель' }, result, ...extra };
  fs.mkdirSync(STORE, { recursive: true });
  fs.writeFileSync(path.join(STORE, `${id}.json`), JSON.stringify(job));
  return () => fs.rmSync(path.join(STORE, `${id}.json`), { force: true });
}

const post = (url, body) => fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

test('правка текста: «Сказка» — страница, «Большая история» — абзац; HTML вырезается', async () => {
  const shortId = 'aaaaaaaa-0000-0000-0000-000000000001';
  const bigId = 'aaaaaaaa-0000-0000-0000-000000000002';
  const rm1 = writeJob(shortId, { title: 'Т', pages: [{ text: 'Было' }, { text: 'Второе' }] });
  const rm2 = writeJob(bigId, { book: { title: 'Т', chapters: [{ n: 1, title: 'Г', blocks: [{ t: 'p', text: 'Абзац' }, { t: 'image', src: 'x' }] }] } });
  const { server, url } = await listen();
  try {
    let r = await (await post(`${url}/api/book/${shortId}/edit`, { edits: [{ page: 0, text: 'Стало <b>лучше</b>' }] })).json();
    assert.equal(r.applied, 1);
    const s = await (await fetch(`${url}/api/book/${shortId}/result`)).json();
    assert.equal(s.result.pages[0].text, 'Стало лучше');

    r = await (await post(`${url}/api/book/${bigId}/edit`, { edits: [{ chapter: 0, block: 0, text: 'Новый абзац' }, { chapter: 0, block: 1, text: 'в картинку нельзя' }] })).json();
    assert.equal(r.applied, 1, 'текст картинки не правится');
    const b = await (await fetch(`${url}/api/book/${bigId}/result`)).json();
    assert.equal(b.result.book.chapters[0].blocks[0].text, 'Новый абзац');
  } finally {
    server.close(); rm1(); rm2();
  }
});

test('перерисовка: без листа персонажа недоступна, лимит в 3 попытки, неудача попытку не тратит', async () => {
  const noSheet = 'aaaaaaaa-0000-0000-0000-000000000003';
  const withSheet = 'aaaaaaaa-0000-0000-0000-000000000004';
  const spent = 'aaaaaaaa-0000-0000-0000-000000000005';
  const rm = [
    writeJob(noSheet, { title: 'Т', pages: [{ text: 'a', heroBrief: 'b' }] }),
    writeJob(withSheet, { title: 'Т', sheet: 'data:image/png;base64,c2hlZXQ=', pages: [{ text: 'a', heroBrief: 'b' }] }),
    writeJob(spent, { title: 'Т', sheet: 'data:image/png;base64,c2hlZXQ=', pages: [{ text: 'a', heroBrief: 'b' }] }, { redraws: 3 })
  ];
  const key = process.env.GEMINI_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;
  delete process.env.GEMINI_API_KEY; // без ключей генерация честно не получается — проверяем, что попытка не списывается
  delete process.env.OPENAI_API_KEY;
  const { server, url } = await listen();
  try {
    assert.equal((await post(`${url}/api/book/${noSheet}/redraw`, { index: 0 })).status, 409);
    assert.equal((await post(`${url}/api/book/${spent}/redraw`, { index: 0 })).status, 403);
    assert.equal((await post(`${url}/api/book/${withSheet}/redraw`, { index: 5 })).status, 400);
    assert.equal((await post(`${url}/api/book/${withSheet}/redraw`, { index: 0 })).status, 502);
    const s = await (await fetch(`${url}/api/book/${withSheet}/status`)).json();
    assert.equal(s.redrawsLeft, 3);
    assert.equal(s.canRedraw, true);
  } finally {
    if (key) process.env.GEMINI_API_KEY = key;
    if (openaiKey) process.env.OPENAI_API_KEY = openaiKey;
    server.close(); rm.forEach((f) => f());
  }
});

test('заказ без фото не принимается: фото обязательно', async () => {
  const { server, url } = await listen();
  try {
    const r = await post(`${url}/api/book/generate`, { name: 'Милена', theme: 'Приключения' });
    assert.equal(r.status, 400);
    assert.match((await r.json()).error, /фото/);
  } finally {
    server.close();
  }
});
