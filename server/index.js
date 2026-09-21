import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import { GoogleGenAI } from '@google/genai';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const app = express();
const PORT = Number(process.env.PORT || 3000);
const JOB_TIMEOUT_MS = 60_000;
const jobs = new Map();

app.use(cors());
app.use(express.json({ limit: '10mb' }));

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    message: 'Gemini backend is running',
    hasApiKey: Boolean(process.env.GEMINI_API_KEY),
    model: process.env.GEMINI_MODEL || 'gemini-3.6-flash'
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

function createFallbackResult(job) {
  return {
    ok: true,
    fallback: true,
    source: 'prebuilt-template',
    jobId: job.id,
    promptId: job.promptId || null,
    model: job.model,
    message: 'Gemini is temporarily unavailable. A fallback template was returned so the flow stays usable.',
    content: {
      title: job.title || 'Story scene',
      scene: job.promptId || 'fallback-scene',
      status: 'fallback',
      note: 'This is a safe fallback output for UX continuity while the AI backend recovers.'
    }
  };
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

function scheduleJobTimeout(jobId) {
  setTimeout(() => {
    const job = jobs.get(jobId);
    if (!job) return;

    if (job.status === 'queued' || job.status === 'processing') {
      job.status = 'fallback';
      job.updatedAt = Date.now();
      job.progress = 'Timed out after 60s';
      job.error = 'AI generation exceeded the 60-second safety limit.';
      job.result = createFallbackResult(job);
    }
  }, JOB_TIMEOUT_MS);
}

async function processJob(jobId) {
  const job = jobs.get(jobId);
  if (!job) return;

  job.timeoutHandle = scheduleJobTimeout(jobId);

  try {
    job.status = 'processing';
    job.updatedAt = Date.now();
    job.progress = 'Generating with Gemini';

    const result = await generateWithGemini(job.prompt, job.model, 3);

    if (job.timeoutHandle) {
      clearTimeout(job.timeoutHandle);
      job.timeoutHandle = null;
    }

    job.status = 'completed';
    job.updatedAt = Date.now();
    job.progress = 'Completed';
    job.result = {
      ok: true,
      promptId: job.promptId || null,
      model: job.model,
      response: result,
      fallback: false
    };
  } catch (error) {
    if (job.timeoutHandle) {
      clearTimeout(job.timeoutHandle);
      job.timeoutHandle = null;
    }

    const fallback = createFallbackResult(job);
    job.status = 'fallback';
    job.updatedAt = Date.now();
    job.progress = 'Fallback activated';
    job.error = error?.message || 'Unknown Gemini error';
    job.result = fallback;
  }
}

app.post('/api/generate-background', async (req, res) => {
  try {
    const { promptId, prompt, model, async: asyncMode } = req.body || {};

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

    if (asyncMode === true || req.query.async === '1') {
      const jobId = `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      jobs.set(jobId, {
        id: jobId,
        status: 'queued',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        promptId: promptId || null,
        title: req.body?.title || 'Generated scene',
        prompt: finalPrompt,
        model: selectedModel,
        progress: 'Queued',
        result: null,
        error: null,
        timeoutHandle: null
      });

      setTimeout(() => processJob(jobId), 0);

      return res.json({
        ok: true,
        async: true,
        jobId,
        status: 'queued',
        message: 'Generation started in background.'
      });
    }

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

app.post('/api/book/generate', async (req, res) => {
  const { promptId, prompt, model, title } = req.body || {};

  if (!prompt && !promptId) {
    return res.status(400).json({ ok: false, error: 'Need either body.prompt or body.promptId' });
  }

  const finalPrompt = prompt || resolvePromptById(promptId);
  if (!finalPrompt) {
    return res.status(404).json({ ok: false, error: `Prompt not found. Tried promptId: ${promptId || 'n/a'}` });
  }

  const jobId = `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const selectedModel = model || process.env.GEMINI_MODEL || 'gemini-3.6-flash';

  jobs.set(jobId, {
    id: jobId,
    status: 'queued',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    promptId: promptId || null,
    title: title || 'Generated story scene',
    prompt: finalPrompt,
    model: selectedModel,
    progress: 'Queued',
    result: null,
    error: null,
    timeoutHandle: null
  });

  setTimeout(() => processJob(jobId), 0);

  res.json({
    ok: true,
    async: true,
    jobId,
    status: 'queued',
    message: 'Book generation started. Poll status endpoint until completion.'
  });
});

app.get('/api/book/:jobId/status', (req, res) => {
  const job = jobs.get(req.params.jobId);

  if (!job) {
    return res.status(404).json({ ok: false, error: 'Job not found' });
  }

  return res.json({
    ok: true,
    jobId: job.id,
    status: job.status,
    progress: job.progress,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    timeoutMs: JOB_TIMEOUT_MS
  });
});

app.get('/api/book/:jobId/result', (req, res) => {
  const job = jobs.get(req.params.jobId);

  if (!job) {
    return res.status(404).json({ ok: false, error: 'Job not found' });
  }

  if (!job.result) {
    return res.json({
      ok: true,
      jobId: job.id,
      status: job.status,
      ready: false,
      progress: job.progress,
      result: null
    });
  }

  return res.json({
    ok: true,
    ready: true,
    jobId: job.id,
    status: job.status,
    progress: job.progress,
    result: job.result
  });
});

app.listen(PORT, () => {
  console.log(`Gemini backend listening on http://localhost:${PORT}`);
});
