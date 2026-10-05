// Цепочка ИИ-провайдеров с автоматическим переключением.
//
// Идея: ни один сервис не должен быть единственной точкой отказа.
// Пробуем провайдеров по порядку; упавшего (лимит, перегрузка, таймаут,
// неверный ключ) на время «остужаем» и сразу идём к следующему.
// С 05.10 основной автор — платный OpenAI GPT-5.5 (решение владелицы: бесплатные пишут заметно слабее; проба по анкете
// «Люсечки» — GPT-5.5 ≈ $0,10 за «Сказку»), бесплатные Gemini, Groq, OpenRouter, Cerebras — запасные.
// Без OPENAI_API_KEY цепочка та же, только без OpenAI.

const DEFAULT_ORDER = ['openai', 'gemini', 'groq', 'openrouter', 'cerebras'];

const CATALOG = {
  gemini: {
    type: 'gemini',
    keyEnv: 'GEMINI_API_KEY',
    modelsEnv: 'GEMINI_MODELS',
    // проверено 27.09: 3.6 — основная (по ней принимали тексты), 3.8/3.7 — новые, flash-lite — быстрая запасная;
    // 3.5-flash убрана — зависала на минуту
    defaultModels: ['gemini-3.6-flash', 'gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-3.5-flash-lite'],
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta'
  },
  groq: {
    type: 'openai',
    keyEnv: 'GROQ_API_KEY',
    modelsEnv: 'GROQ_MODELS',
    defaultModels: ['openai/gpt-oss-120b', 'qwen/qwen3.8-27b', 'openai/gpt-oss-20b'],
    baseUrl: 'https://api.groq.com/openai/v1'
  },
  openrouter: {
    type: 'openai',
    keyEnv: 'OPENROUTER_API_KEY',
    modelsEnv: 'OPENROUTER_MODELS',
    // z-ai/glm-5.2:free больше не бесплатная (404); gemma и qwen часто 429 — nemotron страхует
    defaultModels: ['google/gemma-4-31b-it:free', 'qwen/qwen3.8-27b:free', 'nvidia/nemotron-3-ultra-550b-a55b:free', 'nvidia/nemotron-3-super-120b-a12b:free'],
    baseUrl: 'https://openrouter.ai/api/v1'
  },
  cerebras: {
    type: 'openai',
    keyEnv: 'CEREBRAS_API_KEY',
    modelsEnv: 'CEREBRAS_MODELS',
    defaultModels: ['llama-3.3-70b'],
    baseUrl: 'https://api.cerebras.ai/v1'
  },
  openai: {
    type: 'openai',
    keyEnv: 'OPENAI_API_KEY',
    modelsEnv: 'OPENAI_MODELS',
    // gpt-5.4-mini — запасная: втрое дешевле и быстрее, если 5.5 не успел (проба 05.10: 5.5 — 51 с, mini — 21 с)
    defaultModels: ['gpt-5.5', 'gpt-5.4-mini'],
    baseUrl: 'https://api.openai.com/v1'
  }
};

export class ProviderError extends Error {
  // kind: 'transient' (лимит/перегрузка/сеть) | 'auth' (плохой ключ) | 'model' (модель недоступна) | 'invalid' (мусорный ответ)
  constructor(message, { kind = 'transient', status = null, retryAfterMs = null } = {}) {
    super(message);
    this.name = 'ProviderError';
    this.kind = kind;
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }
}

async function httpError(res, provider) {
  let detail = '';
  try { detail = (await res.text()).slice(0, 200); } catch { /* ignore */ }
  const status = res.status;
  const retryAfter = Number(res.headers.get('retry-after'));
  const retryAfterMs = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : null;
  const message = `${provider} HTTP ${status}: ${detail}`;

  // Gemini на неверный ключ отвечает 400 с текстом «API key not valid»
  if (status === 401 || status === 403 || /api key not valid|invalid api key/i.test(detail)) return new ProviderError(message, { kind: 'auth', status });
  if (status === 404) return new ProviderError(message, { kind: 'model', status });
  // прочие 400 — проблема конкретного запроса, модель из-за этого не блокируем
  if (status === 400) return new ProviderError(message, { kind: 'invalid', status });
  return new ProviderError(message, { kind: 'transient', status, retryAfterMs });
}

async function post(url, { headers, body, signal }, provider) {
  let res;
  try {
    res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body), signal });
  } catch (error) {
    // сеть недоступна или сработал таймаут — это временная проблема
    throw new ProviderError(`${provider} network/timeout: ${error?.message || error}`, { kind: 'transient' });
  }
  if (!res.ok) throw await httpError(res, provider);
  try {
    return await res.json();
  } catch {
    throw new ProviderError(`${provider} returned non-JSON body`, { kind: 'transient' });
  }
}

function geminiCaller({ apiKey, baseUrl }) {
  return async (model, { system, user }, signal) => {
    const data = await post(
      `${baseUrl}/models/${encodeURIComponent(model)}:generateContent`,
      {
        headers: { 'x-goog-api-key': apiKey },
        signal,
        body: {
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: 'user', parts: [{ text: user }] }],
          generationConfig: { responseMimeType: 'application/json', temperature: 0.9, maxOutputTokens: 8192 }
        }
      },
      'gemini'
    );
    const text = data?.candidates?.[0]?.content?.parts?.map((p) => p?.text || '').join('');
    if (!text) throw new ProviderError('gemini returned empty text', { kind: 'invalid' });
    return text;
  };
}

function openAiCaller({ name, apiKey, baseUrl }) {
  return async (model, { system, user }, signal) => {
    const data = await post(
      `${baseUrl}/chat/completions`,
      {
        headers: { authorization: `Bearer ${apiKey}`, 'x-title': 'Geroenok' },
        signal,
        // модели GPT-5 не принимают temperature и max_tokens: у них max_completion_tokens и «сколько думать» (low — хватает)
        body: /^(gpt-5|o\d)/.test(model) ? {
          model,
          max_completion_tokens: 16000,
          reasoning_effort: 'low',
          ...(/json/i.test(system + user) ? { response_format: { type: 'json_object' } } : {}),
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user }
          ]
        } : {
          model,
          temperature: 0.9,
          max_tokens: 9000,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user }
          ]
        }
      },
      name
    );
    const text = data?.choices?.[0]?.message?.content;
    if (!text) throw new ProviderError(`${name} returned empty text`, { kind: 'invalid' });
    return text;
  };
}

function splitList(value) {
  return String(value || '').split(',').map((s) => s.trim()).filter(Boolean);
}

/** Собирает список настроенных провайдеров из переменных окружения. */
export function buildProviders(env = process.env) {
  const order = splitList(env.PROVIDER_ORDER).length ? splitList(env.PROVIDER_ORDER) : DEFAULT_ORDER;
  const providers = [];

  for (const name of order) {
    const spec = CATALOG[name];
    const apiKey = spec && env[spec.keyEnv];
    if (!spec || !apiKey || /your_|_here/i.test(apiKey)) continue;

    let models = splitList(env[spec.modelsEnv]);
    if (!models.length) {
      // для Gemini модель из GEMINI_MODEL — приоритетная, остальные — запасные
      const preferred = name === 'gemini' ? splitList(env.GEMINI_MODEL) : [];
      models = [...new Set([...preferred, ...spec.defaultModels])];
    }

    const baseUrl = env[`${name.toUpperCase()}_BASE_URL`] || spec.baseUrl;
    const call = spec.type === 'gemini'
      ? geminiCaller({ apiKey, baseUrl })
      : openAiCaller({ name, apiKey, baseUrl });

    providers.push({ name, models, call });
  }

  return providers;
}

/** Память о недавних сбоях: не долбим сервис, который только что вернул 429/503. */
export function createHealth() {
  const until = new Map(); // ключ -> timestamp, до которого пропускаем

  const key = (provider, model) => `${provider}/${model}`;

  return {
    isCoolingDown(provider, model, now = Date.now()) {
      return (until.get(key(provider, '*')) || 0) > now || (until.get(key(provider, model)) || 0) > now;
    },
    fail(provider, model, error, now = Date.now()) {
      const kind = error?.kind;
      if (kind === 'auth') until.set(key(provider, '*'), now + 10 * 60_000); // плохой ключ — весь провайдер
      else if (kind === 'model') until.set(key(provider, model), now + 30 * 60_000);
      else if (kind === 'transient') {
        const wait = error.retryAfterMs ?? (error.status === 429 ? 60_000 : 30_000);
        until.set(key(provider, model), now + Math.min(wait, 5 * 60_000));
      }
      // 'invalid' (модель вернула мусор) — без паузы, просто идём дальше
    },
    ok(provider, model) {
      until.delete(key(provider, model));
    },
    snapshot(now = Date.now()) {
      const out = {};
      for (const [k, t] of until) if (t > now) out[k] = Math.ceil((t - now) / 1000);
      return out;
    }
  };
}

export const sharedHealth = createHealth();

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export class AllProvidersFailed extends Error {
  constructor(attempts) {
    super(`All providers failed (${attempts.length} attempts)`);
    this.name = 'AllProvidersFailed';
    this.attempts = attempts;
  }
}

/**
 * Идёт по провайдерам/моделям, пока кто-то не вернёт ответ, прошедший validate().
 * Никогда не выходит за deadlineAt. Бросает AllProvidersFailed, если не вышло.
 */
export async function generateWithFailover(providers, prompt, {
  validate,
  deadlineAt,
  attemptTimeoutMs = 20_000,
  passes = 2,
  health = sharedHealth,
  log = () => {}
}) {
  const attempts = [];
  const timeLeft = () => deadlineAt - Date.now();

  // Модели по кругу между сервисами: первая модель каждого, потом вторая… Когда перегружен один сервис
  // (у Gemini 05.10 все модели отвечали 503 и таймаутами), очередь быстро доходит до других, а не тратит всё время на него.
  const queue = [];
  for (let i = 0; i < Math.max(0, ...providers.map((p) => p.models.length)); i += 1) {
    for (const provider of providers) if (provider.models[i]) queue.push({ provider, model: provider.models[i] });
  }

  for (let pass = 0; pass < passes; pass += 1) {
    let tried = 0;

    for (const { provider, model } of queue) {
      if (timeLeft() < 2_000) throw new AllProvidersFailed(attempts);
      if (health.isCoolingDown(provider.name, model)) continue;

      tried += 1;
      const signal = AbortSignal.timeout(Math.min(attemptTimeoutMs, timeLeft()));
      try {
        const text = await provider.call(model, prompt, signal);
        const value = validate(text);
        health.ok(provider.name, model);
        return { value, provider: provider.name, model };
      } catch (error) {
        const wrapped = error instanceof ProviderError ? error : new ProviderError(error?.message || String(error), { kind: 'invalid' });
        health.fail(provider.name, model, wrapped);
        attempts.push({ provider: provider.name, model, kind: wrapped.kind, message: wrapped.message });
        log(`[ai] ${provider.name}/${model} failed (${wrapped.kind}): ${wrapped.message}`);
      }
    }

    if (!tried) break; // все в паузе — не ждём, отдаём шаблон
    if (pass < passes - 1) await sleep(Math.min(1_500, Math.max(0, timeLeft() - 2_000)));
  }

  throw new AllProvidersFailed(attempts);
}
