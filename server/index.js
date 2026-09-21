import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import { GoogleGenAI } from '@google/genai';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const app = express();
const PORT = Number(process.env.PORT || 3000);

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

function extractPromptValue(value) {
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
      const backgroundPrompt = extractPromptValue(candidate);
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
          const prompt = extractPromptValue(item);
          if (prompt) return prompt;
        }
      }

      if (parsed && typeof parsed === 'object') {
        if (parsed.id === promptId || parsed.promptId === promptId) {
          const prompt = extractPromptValue(parsed);
          if (prompt) return prompt;
        }

        if (parsed[promptId]) {
          const prompt = extractPromptValue(parsed[promptId]);
          if (prompt) return prompt;
        }
      }
    } catch (error) {
      console.warn('Prompt loader warning:', filePath, error.message);
    }
  }

  return null;
}

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

    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({
        ok: false,
        error: 'GEMINI_API_KEY is missing. Copy .env.example to .env and add your key.'
      });
    }

    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const selectedModel = model || process.env.GEMINI_MODEL || 'gemini-3.6-flash';

    const response = await ai.models.generateContent({
      model: selectedModel,
      contents: finalPrompt
    });

    res.json({
      ok: true,
      promptId: promptId || null,
      model: selectedModel,
      response
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

app.listen(PORT, () => {
  console.log(`Gemini backend listening on http://localhost:${PORT}`);
});
