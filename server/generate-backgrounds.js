import fs from 'node:fs';
import path from 'node:path';

const outputDir = path.resolve(process.cwd(), 'data/generated');

function ensureDirectory(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function resolvePromptFile() {
  const args = process.argv.slice(2);
  const fileIndex = args.findIndex((arg) => arg === '--file');

  if (fileIndex >= 0) {
    const filePath = args[fileIndex + 1];
    if (!filePath) throw new Error('Missing value for --file');
    return path.resolve(process.cwd(), filePath);
  }

  const defaultFile = path.resolve(process.cwd(), 'data/background-prompts-cartoon-classic.json');
  if (fs.existsSync(defaultFile)) return defaultFile;

  return path.resolve(process.cwd(), 'data/background-prompts.json');
}

function loadPrompts() {
  const promptFile = resolvePromptFile();

  if (!fs.existsSync(promptFile)) {
    throw new Error(`Prompt file not found: ${promptFile}`);
  }

  const raw = fs.readFileSync(promptFile, 'utf8');
  const parsed = JSON.parse(raw);

  if (Array.isArray(parsed)) return parsed;
  if (Array.isArray(parsed.prompts)) return parsed.prompts;

  throw new Error('Prompt file must be an array or contain a prompts array.');
}

async function requestGeneration(promptId, retries = 3) {
  let attempt = 0;

  while (attempt <= retries) {
    const response = await fetch('http://localhost:3000/api/generate-background', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ promptId })
    });

    const payload = await response.json();

    if (response.ok) {
      return payload;
    }

    const message = payload?.error || `Request failed with status ${response.status}`;

    if (response.status === 503 && attempt < retries) {
      const delayMs = 2000 * (attempt + 1);
      console.warn(`Temporary Gemini overload for ${promptId}; retrying in ${delayMs}ms (attempt ${attempt + 1}/${retries})`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      attempt += 1;
      continue;
    }

    throw new Error(message);
  }

  throw new Error(`Request failed after ${retries + 1} attempts for ${promptId}`);
}

async function main() {
  const args = process.argv.slice(2);
  const fileIndex = args.findIndex((arg) => arg === '--file');
  const positional = fileIndex >= 0 ? args.slice(fileIndex + 2) : args;
  const requested = positional.filter((value) => !value.startsWith('--'));

  const prompts = loadPrompts();
  const selected = requested.length > 0
    ? prompts.filter((item) => requested.includes(item.id))
    : prompts;

  if (selected.length === 0) {
    console.log('No prompt IDs matched. Available IDs:');
    prompts.forEach((item) => console.log(`- ${item.id}`));
    return;
  }

  ensureDirectory(outputDir);

  for (const item of selected) {
    console.log(`Generating: ${item.id}`);

    try {
      const result = await requestGeneration(item.id);
      const fileName = `${item.id}.json`;
      const outputPath = path.join(outputDir, fileName);
      fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));
      console.log(`Saved -> ${outputPath}`);
    } catch (error) {
      console.error(`Failed for ${item.id}: ${error.message}`);
    }
  }
}

main().catch((error) => {
  console.error('Generator failed:', error.message);
  process.exit(1);
});
