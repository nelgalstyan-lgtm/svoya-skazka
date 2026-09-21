import fs from 'node:fs';
import path from 'node:path';

const promptFile = path.resolve(process.cwd(), 'data/background-prompts-cartoon-classic.json');
const outputDir = path.resolve(process.cwd(), 'data/generated');

function ensureDirectory(dirPath) {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
}

function loadPrompts() {
  const raw = fs.readFileSync(promptFile, 'utf8');
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) throw new Error('JSON must be an array');
  return parsed;
}

async function requestGeneration(promptId) {
  const response = await fetch('http://localhost:3000/api/generate-background', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ promptId })
  });

  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload?.error || `Request failed: ${response.status}`);
  }

  return payload;
}

async function main() {
  const prompts = loadPrompts();
  ensureDirectory(outputDir);

  for (const item of prompts) {
    const result = await requestGeneration(item.id);
    const filePath = path.join(outputDir, `${item.id}.json`);
    fs.writeFileSync(filePath, JSON.stringify({ id: item.id, style: item.style, result }, null, 2));
    console.log(`Saved ${item.id}`);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
