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

const SERVER_DIR = path.dirname(fileURLToPath(import.meta.url));

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const app = express();
const PORT = Number(process.env.PORT || 3000);

// Первичный лимит на генерацию — защищает бесплатные квоты от случайного спама.
const RATE_LIMIT_MAX = Number(process.env.RATE_LIMIT_MAX || 10);
const RATE_LIMIT_WINDOW_MS = 10 * 60_000;
const rateBuckets = new Map();

const BIG_TIMEOUT_MS = Number(process.env.BIG_BOOK_TIMEOUT_MS || 8 * 60_000);

const queue = createJobQueue({
  runner: (input, ctx) => (input.tariff === 'big' ? generateBigBook(input, { progress: ctx.progress }) : generateStory(input)),
  fallback: (input) => (input.tariff === 'big' ? { book: templateBook(input) } : buildTemplateStory(input)),
  timeoutFor: (input) => (input.tariff === 'big' ? BIG_TIMEOUT_MS : null),
  concurrency: Number(process.env.QUEUE_CONCURRENCY || 3),
  storeDir: path.join(SERVER_DIR, 'data', 'generated')
});

app.use(cors());
app.use(express.json({ limit: '10mb' }));

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    message: 'Book generation backend is running',
    hasApiKey: Boolean(process.env.GEMINI_API_KEY),
    model: process.env.GEMINI_MODEL || 'gemini-3.6-flash',
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
// { name, age, gender, eyes, occasion, habits, friends, cast, style, theme }
app.post('/api/book/generate', (req, res) => {
  const big = req.body?.tariff === 'big';
  // большая книга — 7 запросов к ИИ, поэтому лимит строже и считается отдельно
  if (rateLimited(big ? `${req.ip}:big` : req.ip, big ? Number(process.env.BIG_RATE_LIMIT_MAX || 3) : RATE_LIMIT_MAX)) {
    return res.status(429).json({ ok: false, error: 'Слишком много запросов подряд. Подождите пару минут и попробуйте снова.' });
  }

  const body = req.body || {};
  const input = {};
  for (const key of ['name', 'age', 'gender', 'eyes', 'occasion', 'habits', 'friends', 'cast', 'style', 'theme', 'interests', 'special']) {
    input[key] = typeof body[key] === 'string' || typeof body[key] === 'number' ? String(body[key]).slice(0, 500) : '';
  }
  if (big) input.tariff = 'big';

  const job = queue.submit(input);

  res.json({
    ok: true,
    jobId: job.id,
    status: job.status,
    position: queue.position(job)
  });
});

function jobView(job) {
  const done = job.status === 'completed';
  return {
    ok: true,
    jobId: job.id,
    status: job.status,
    ready: done,
    position: queue.position(job),
    progress: done ? '' : job.progress || '',
    elapsedMs: (job.finishedAt || Date.now()) - job.createdAt,
    // клиенту отдаём только книгу; источник (ИИ/шаблон) — служебная информация
    result: !done ? null : job.result.book ? { kind: 'book', book: normalizeBook(job.result.book, { name: job.input?.name, girl: !/^(мал|boy|male)/i.test(job.input?.gender || '') }) } : { title: job.result.title, pages: job.result.pages }
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

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  app.listen(PORT, () => {
    const providers = describeProviders();
    console.log(`Backend listening on http://localhost:${PORT}`);
    console.log(providers.length
      ? `AI providers: ${providers.map((p) => p.name).join(' → ')} → local template`
      : 'AI providers: none configured — books are generated from the local template');
  });
}

export { app, queue, resolvePromptById, generateWithGemini };
