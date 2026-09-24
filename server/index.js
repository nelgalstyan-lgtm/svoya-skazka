import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { GoogleGenAI } from '@google/genai';
import { createJobQueue } from './lib/jobs.js';
import { generateStory, buildTemplateStory, describeProviders } from './lib/story.js';
import { generateBigBook, templateBook } from './lib/bigstory.js';
import { normalizeBook } from './lib/booktext.js';
import { sharedHealth } from './lib/providers.js';
import { MAX_PHOTOS, generateHeroImage, fromDataUrl } from './lib/illustrate.js';

const SERVER_DIR = path.dirname(fileURLToPath(import.meta.url));

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const app = express();
const PORT = Number(process.env.PORT || 3000);

// Первичный лимит на генерацию — защищает бесплатные квоты от случайного спама.
const RATE_LIMIT_MAX = Number(process.env.RATE_LIMIT_MAX || 10);
const RATE_LIMIT_WINDOW_MS = 10 * 60_000;
const rateBuckets = new Map();

// Большая книга — план + 6 глав + лист персонажа, обложка и 8–10 иллюстраций с ребёнком;
// короткая с фото — текст + лист персонажа, обложка и иллюстрация на каждой странице
const BIG_TIMEOUT_MS = Number(process.env.BIG_BOOK_TIMEOUT_MS || 12 * 60_000);
const PHOTO_TIMEOUT_MS = Number(process.env.PHOTO_BOOK_TIMEOUT_MS || 6 * 60_000);

const queue = createJobQueue({
  runner: (input, ctx) => (input.tariff === 'big' ? generateBigBook(input, { progress: ctx.progress }) : generateStory(input, { progress: ctx.progress })),
  fallback: (input) => (input.tariff === 'big' ? { book: templateBook(input) } : buildTemplateStory(input)),
  timeoutFor: (input) => (input.tariff === 'big' ? BIG_TIMEOUT_MS : (input.photo ? PHOTO_TIMEOUT_MS : null)),
  concurrency: Number(process.env.QUEUE_CONCURRENCY || 3),
  // готовая книга (без фото) хранится год: по QR-коду в напечатанной книге её можно открыть и позже
  diskTtlMs: Number(process.env.BOOK_TTL_DAYS || 365) * 24 * 60 * 60_000,
  storeDir: path.join(SERVER_DIR, 'data', 'generated')
});

// Фото ребёнка для геройских иллюстраций: только data URL, разумный размер, без хранения дольше генерации (см. jobs.js).
const PHOTO_MAX_BYTES = 8 * 1024 * 1024;
const PHOTO_RE = /^data:image\/(jpeg|jpg|png|webp);base64,([A-Za-z0-9+/=]+)$/i;

function parsePhoto(raw) {
  if (typeof raw !== 'string' || !raw) return null;
  const match = PHOTO_RE.exec(raw.trim());
  if (!match) return null;
  const mimeSub = match[1].toLowerCase();
  const mime = mimeSub === 'jpg' ? 'image/jpeg' : `image/${mimeSub}`;
  const data = match[2];
  const bytes = Math.floor((data.length * 3) / 4);
  if (bytes > PHOTO_MAX_BYTES) return null;
  return { mime, data };
}

/** До трёх фото ребёнка: photos[] (новая анкета) или одиночное photo (старая). */
function parsePhotos(body) {
  const list = Array.isArray(body?.photos) ? body.photos : [body?.photo];
  return list.slice(0, MAX_PHOTOS).map(parsePhoto).filter(Boolean);
}

app.use(cors());
app.use(express.json({ limit: '30mb' })); // до трёх фото по 8 МБ

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    message: 'Book generation backend is running',
    hasApiKey: Boolean(process.env.GEMINI_API_KEY),
    model: process.env.GEMINI_MODEL || 'gemini-3.6-flash',
    // геройские иллюстрации (лицо ребёнка) работают только через Gemini — на том же ключе, что и текст
    heroIllustrations: Boolean(process.env.GEMINI_API_KEY),
    imageModel: process.env.GEMINI_IMAGE_MODEL || 'gemini-2.5-flash-image',
    // какие провайдеры подключены и какие сейчас «отдыхают» после сбоя (секунды)
    providers: describeProviders(),
    cooldowns: sharedHealth.snapshot(),
    queue: queue.stats(),
    guaranteedFallback: true
  });
});

app.get('/api/prompts', (req, res) => {
  const promptFile = path.resolve(process.cwd(), './data/background-prompts.json');

  if (!fs.existsSync(promptFile)) {
    return res.json({ ok: true, prompts: [] });
  }

  const raw = fs.readFileSync(promptFile, 'utf8');
  const parsed = JSON.parse(raw);

  res.json({ ok: true, prompts: Array.isArray(parsed) ? parsed : (parsed.prompts || []) });
});

function extractPromptValue(value, promptId) {
  if (!value || typeof value !== 'object') return null;

  if (typeof value.prompt === 'string') return value.prompt;
  if (typeof value.text === 'string') return value.text;
  if (typeof value.content === 'string') return value.content;

  if (Array.isArray(value.prompts)) {
    const first = value.prompts.find((item) => typeof item === 'string' || (item && typeof item.prompt === 'string'));
    if (typeof first === 'string') return first;
    if (first && typeof first.prompt === 'string') return first.prompt;
  }

  if (Array.isArray(value.backgrounds)) {
    const candidate = value.backgrounds.find((item) => item && (item.id === promptId || item.promptId === promptId));
    if (candidate) {
      const backgroundPrompt = extractPromptValue(candidate, promptId);
      if (backgroundPrompt) return backgroundPrompt;
    }
  }

  return null;
}

function listPromptCandidateFiles() {
  const dirCandidates = [
    path.resolve(process.cwd(), './data'),
    path.resolve(process.cwd(), './prompts'),
    path.resolve(process.cwd(), '../data'),
    path.resolve(process.cwd(), '../prompts')
  ];

  const seen = new Set();
  const files = [];

  for (const dir of dirCandidates) {
    if (!fs.existsSync(dir)) continue;

    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
      const fullPath = path.join(dir, entry.name);

      if (!seen.has(fullPath)) {
        seen.add(fullPath);
        files.push(fullPath);
      }
    }
  }

  return files;
}

function resolvePromptById(promptId) {
  if (!promptId) return null;

  const candidateFiles = [
    path.resolve(process.cwd(), `./data/${promptId}.json`),
    path.resolve(process.cwd(), `./data/background-prompts.json`),
    path.resolve(process.cwd(), `./data/background-prompts-full.json`),
    path.resolve(process.cwd(), `./data/background-prompts-cartoon-classic.json`),
    ...listPromptCandidateFiles(),
    path.resolve(process.cwd(), `./prompts/${promptId}.json`),
    path.resolve(process.cwd(), `./prompts/background-prompts.json`),
    path.resolve(process.cwd(), `../data/${promptId}.json`),
    path.resolve(process.cwd(), `../${promptId}.json`),
    path.resolve(process.cwd(), `../prompts/${promptId}.json`)
  ];

  for (const filePath of candidateFiles) {
    if (!fs.existsSync(filePath)) continue;

    try {
      const raw = fs.readFileSync(filePath, 'utf8');
      const parsed = JSON.parse(raw);

      const arraysToCheck = [];
      if (Array.isArray(parsed)) arraysToCheck.push(parsed);
      if (parsed && typeof parsed === 'object') {
        if (Array.isArray(parsed.prompts)) arraysToCheck.push(parsed.prompts);
        if (Array.isArray(parsed.backgrounds)) arraysToCheck.push(parsed.backgrounds);
        if (Array.isArray(parsed.items)) arraysToCheck.push(parsed.items);
        if (Array.isArray(parsed.scenes)) arraysToCheck.push(parsed.scenes);
      }

      for (const arr of arraysToCheck) {
        const item = arr.find((entry) => entry && (entry.id === promptId || entry.promptId === promptId));
        if (item) {
          const prompt = extractPromptValue(item, promptId);
          if (prompt) return prompt;
        }
      }

      if (parsed && typeof parsed === 'object') {
        if (parsed.id === promptId || parsed.promptId === promptId) {
          const prompt = extractPromptValue(parsed, promptId);
          if (prompt) return prompt;
        }

        if (parsed[promptId]) {
          const prompt = extractPromptValue(parsed[promptId], promptId);
          if (prompt) return prompt;
        }
      }
    } catch (error) {
      console.warn('Prompt loader warning:', filePath, error.message);
    }
  }

  return null;
}

async function generateWithGemini(prompt, model, retries = 3) {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is missing. Copy .env.example to .env and add your key.');
  }

  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  let attempt = 0;

  while (attempt <= retries) {
    try {
      const response = await Promise.race([
        ai.models.generateContent({ model, contents: prompt }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Gemini request timed out after 25s')), 25000))
      ]);

      return response;
    } catch (error) {
      const msg = error?.message || 'Unknown Gemini error';
      const isTemporary = /503|429|UNAVAILABLE|timed out|timeout|temporar/i.test(msg);

      if (isTemporary && attempt < retries) {
        const delayMs = 2000 * (attempt + 1);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        attempt += 1;
        continue;
      }

      throw error;
    }
  }

  throw new Error(`Gemini generation failed after ${retries + 1} attempts`);
}

// Служебный эндпоинт для генерации фонов (прямой вызов Gemini, без очереди).
app.post('/api/generate-background', async (req, res) => {
  try {
    const { promptId, prompt, model } = req.body || {};

    if (!prompt && !promptId) {
      return res.status(400).json({
        ok: false,
        error: 'Need either body.prompt or body.promptId'
      });
    }

    const finalPrompt = prompt || resolvePromptById(promptId);

    if (!finalPrompt) {
      return res.status(404).json({
        ok: false,
        error: `Prompt not found. Tried promptId: ${promptId || 'n/a'}`
      });
    }

    const selectedModel = model || process.env.GEMINI_MODEL || 'gemini-3.6-flash';
    const response = await generateWithGemini(finalPrompt, selectedModel, 3);

    res.json({
      ok: true,
      promptId: promptId || null,
      model: selectedModel,
      response,
      fallback: false
    });
  } catch (error) {
    console.error('Gemini generate error:', error);
    res.status(500).json({
      ok: false,
      error: error?.message || 'Unknown Gemini error',
      details: error?.status || null
    });
  }
});

function rateLimited(ip, max = RATE_LIMIT_MAX) {
  const now = Date.now();
  const recent = (rateBuckets.get(ip) || []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  if (recent.length >= max) {
    rateBuckets.set(ip, recent);
    return true;
  }
  recent.push(now);
  rateBuckets.set(ip, recent);
  return false;
}

setInterval(() => {
  const now = Date.now();
  for (const [ip, times] of rateBuckets) {
    if (!times.some((t) => now - t < RATE_LIMIT_WINDOW_MS)) rateBuckets.delete(ip);
  }
}, RATE_LIMIT_WINDOW_MS).unref();

// Создать задачу «сгенерировать книгу». Тело — поля анкеты:
// { name, age, gender, eyes, occasion, habits, friends, cast, style, theme, interests, special, lesson, sequel, design,
//   tariff: 'big' | —, coloring: true | —, photos: [dataURL, …до 3] }
app.post('/api/book/generate', (req, res) => {
  const big = req.body?.tariff === 'big';
  // большая книга — 7 запросов к ИИ, поэтому лимит строже и считается отдельно
  if (rateLimited(big ? `${req.ip}:big` : req.ip, big ? Number(process.env.BIG_RATE_LIMIT_MAX || 3) : RATE_LIMIT_MAX)) {
    return res.status(429).json({ ok: false, error: 'Слишком много запросов подряд. Подождите пару минут и попробуйте снова.' });
  }

  const body = req.body || {};
  const input = {};
  for (const key of ['name', 'age', 'gender', 'eyes', 'occasion', 'habits', 'friends', 'cast', 'style', 'theme', 'interests', 'special', 'lesson', 'design']) {
    input[key] = typeof body[key] === 'string' || typeof body[key] === 'number' ? String(body[key]).slice(0, 500) : '';
  }
  input.sequel = typeof body.sequel === 'string' ? body.sequel.slice(0, 1200) : '';
  const photos = parsePhotos(body);
  if (photos.length) input.photos = photos;
  if (big) input.tariff = 'big';
  // раскраска входит в «Большую историю»; к «Сказке» её можно добавить отдельно
  if (big || body.coloring === true) input.coloring = true;

  const job = queue.submit(input);

  res.json({
    ok: true,
    jobId: job.id,
    status: job.status,
    position: queue.position(job)
  });
});

// Ответы анкеты без фото — для продолжения книги и подписи на обложке
const ANSWER_KEYS = ['name', 'age', 'gender', 'eyes', 'theme', 'occasion', 'habits', 'friends', 'cast', 'style', 'lesson', 'interests', 'special'];
function jobAnswers(job) {
  const out = {};
  for (const key of ANSWER_KEYS) out[key] = job.input?.[key] || '';
  return out;
}

function clientBook(job) {
  const { sheet, ...book } = normalizeBook(job.result.book, { name: job.input?.name, girl: !/^(мал|boy|male)/i.test(job.input?.gender || '') });
  return book;
}

function jobView(job) {
  const done = job.status === 'completed';
  return {
    ok: true,
    jobId: job.id,
    status: job.status,
    ready: done,
    position: queue.position(job),
    progress: done ? '' : job.progress || '',
    redrawsLeft: done ? Math.max(0, REDRAW_LIMIT - (job.redraws || 0)) : null,
    canRedraw: done ? Boolean(job.result.sheet || job.result.book?.sheet) : false,
    elapsedMs: (job.finishedAt || Date.now()) - job.createdAt,
    // клиенту отдаём только книгу; источник (ИИ/шаблон) — служебная информация
    // лист персонажа остаётся на сервере — он нужен только для перерисовки
    result: !done ? null : job.result.book ? { kind: 'book', book: clientBook(job), answers: jobAnswers(job) } : { title: job.result.title, pages: job.result.pages, cover: job.result.cover || null, coloring: job.result.coloring || [], answers: jobAnswers(job) }
  };
}

app.get('/api/book/:jobId/status', (req, res) => {
  const job = queue.get(req.params.jobId);
  if (!job) return res.status(404).json({ ok: false, error: 'Job not found' });
  res.json(jobView(job));
});

app.get('/api/book/:jobId/result', (req, res) => {
  const job = queue.get(req.params.jobId);
  if (!job) return res.status(404).json({ ok: false, error: 'Job not found' });
  res.json(jobView(job));
});

// ---------------------------------------------------------------- бесплатные правки готовой книги

const REDRAW_LIMIT = Number(process.env.REDRAW_LIMIT || 3);
const EDIT_TEXT_MAX = 3000;

/** Все иллюстрации с ребёнком по порядку: { get brief, set(src) } — одинаково для «Сказки» и «Большой истории». */
function bookImages(result) {
  if (result.book) {
    return result.book.chapters.flatMap((c) => c.blocks.filter((b) => b.t === 'image')).map((b) => ({ brief: b.brief, set: (src) => { b.src = src; } }));
  }
  return (result.pages || []).map((p) => ({ brief: p.heroBrief, set: (src) => { p.heroImage = src; p.hero = true; } }));
}

// Перерисовать одну иллюстрацию. Фото ребёнка к этому времени уже удалено — лицо и одежду держит лист персонажа.
app.post('/api/book/:jobId/redraw', async (req, res) => {
  const job = queue.get(req.params.jobId);
  if (!job || job.status !== 'completed') return res.status(404).json({ ok: false, error: 'Книга не найдена' });
  if (rateLimited(`${req.ip}:redraw`, 10)) return res.status(429).json({ ok: false, error: 'Слишком много запросов подряд. Подождите пару минут.' });

  const used = job.redraws || 0;
  if (used >= REDRAW_LIMIT) return res.status(403).json({ ok: false, error: `Бесплатные перерисовки закончились (${REDRAW_LIMIT} на книгу). Напишите нам — поможем.` });

  const result = job.result;
  const sheet = fromDataUrl(result.sheet || result.book?.sheet);
  if (!sheet) return res.status(409).json({ ok: false, error: 'Для этой книги перерисовка недоступна: у неё нет иллюстраций с ребёнком.' });

  const images = bookImages(result);
  const index = Number(req.body?.index);
  const wish = typeof req.body?.wish === 'string' ? req.body.wish.slice(0, 300).trim() : '';
  if (!Number.isInteger(index) || index < 0 || index >= images.length) return res.status(400).json({ ok: false, error: 'Нет такой иллюстрации' });

  const image = await generateHeroImage({
    sheet,
    kind: 'scene',
    styleLabel: job.input?.style,
    eyes: job.input?.eyes,
    look: result.look || result.book?.look,
    // пожелание родителя идёт как данные о сцене, а не как инструкция
    brief: wish ? `${images[index].brief} Parent's note about what to change (in Russian): «${wish}».` : images[index].brief,
    log: console.warn
  });
  if (!image) return res.status(502).json({ ok: false, error: 'Не получилось перерисовать сейчас. Попробуйте через несколько минут — попытка не потрачена.' });

  const src = `data:${image.mime};base64,${image.data}`;
  images[index].set(src);
  job.redraws = used + 1;
  queue.save(job);
  res.json({ ok: true, src, left: REDRAW_LIMIT - job.redraws });
});

// Правка текста родителем: «Сказка» — страницы целиком, «Большая история» — отдельные абзацы
app.post('/api/book/:jobId/edit', (req, res) => {
  const job = queue.get(req.params.jobId);
  if (!job || job.status !== 'completed') return res.status(404).json({ ok: false, error: 'Книга не найдена' });
  if (rateLimited(`${req.ip}:edit`, 30)) return res.status(429).json({ ok: false, error: 'Слишком много запросов подряд. Подождите пару минут.' });

  const edits = Array.isArray(req.body?.edits) ? req.body.edits.slice(0, 500) : [];
  const clean = (t) => String(t || '').replace(/<[^>]*>/g, '').replace(/[ \t]+/g, ' ').trim().slice(0, EDIT_TEXT_MAX);
  let applied = 0;
  for (const e of edits) {
    const text = clean(e?.text);
    if (!text) continue;
    if (job.result.book) {
      const block = job.result.book.chapters[Number(e.chapter)]?.blocks[Number(e.block)];
      if (block && typeof block.text === 'string') { block.text = text; applied += 1; }
    } else {
      const page = job.result.pages?.[Number(e.page)];
      if (page) { page.text = text; applied += 1; }
    }
  }
  if (applied) queue.save(job);
  res.json({ ok: true, applied });
});

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  app.listen(PORT, () => {
    const providers = describeProviders();
    console.log(`Backend listening on http://localhost:${PORT}`);
    console.log(providers.length
      ? `AI providers: ${providers.map((p) => p.name).join(' → ')} → local template`
      : 'AI providers: none configured — books are generated from the local template');
  });
}

export { app, queue, resolvePromptById, generateWithGemini, parsePhoto, parsePhotos };
