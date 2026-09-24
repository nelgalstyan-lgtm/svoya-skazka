import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const ID_RE = /^[a-f0-9-]{36}$/;

/**
 * Очередь задач генерации книги.
 * runner(input) должен вернуть готовую историю; fallback(input) — мгновенный запасной вариант.
 * Гарантия: у каждой задачи рано или поздно появляется результат (runner упал/завис/очередь забита — отдаём fallback).
 */
export function createJobQueue({
  runner,
  fallback,
  concurrency = 3,
  maxQueue = 100,
  hardTimeoutMs = 70_000,
  timeoutFor = null, // (input) => мс; у большой книги свой, более длинный лимит
  memoryTtlMs = 60 * 60_000,
  diskTtlMs = 7 * 24 * 60 * 60_000,
  storeDir = null,
  log = console.log
}) {
  const jobs = new Map();
  const waiting = [];
  let running = 0;

  if (storeDir) fs.mkdirSync(storeDir, { recursive: true });

  function persist(job) {
    if (!storeDir) return;
    fs.writeFile(path.join(storeDir, `${job.id}.json`), JSON.stringify(job), (error) => {
      if (error) log(`[jobs] persist failed for ${job.id}: ${error.message}`);
    });
  }

  function finish(job, story) {
    if (job.status === 'completed') return;
    // Фото ребёнка нужно только на время генерации — дальше не храним даже в памяти, а тем более на диске
    if (job.input && (job.input.photo || job.input.photos)) job.input = { ...job.input, photo: undefined, photos: undefined };
    job.status = 'completed';
    job.result = story;
    job.finishedAt = Date.now();
    persist(job);
    log(`[jobs] ${job.id} done via ${story.source}${story.provider ? `/${story.provider}` : ''} in ${job.finishedAt - job.createdAt}ms`);
  }

  async function run(job) {
    job.status = 'processing';
    job.startedAt = Date.now();

    let guard;
    const limit = (timeoutFor && timeoutFor(job.input)) || hardTimeoutMs;
    const ctx = { progress: (text) => { job.progress = text; } };
    try {
      const story = await Promise.race([
        runner(job.input, ctx),
        new Promise((_, reject) => { guard = setTimeout(() => reject(new Error('hard timeout')), limit); })
      ]);
      finish(job, story);
    } catch (error) {
      log(`[jobs] ${job.id} runner failed (${error?.message}), using fallback`);
      finish(job, { ...fallback(job.input), source: 'template', provider: null, model: null });
    } finally {
      clearTimeout(guard);
    }
  }

  function pump() {
    while (running < concurrency && waiting.length) {
      const job = waiting.shift();
      running += 1;
      run(job).finally(() => {
        running -= 1;
        pump();
      });
    }
  }

  function submit(input) {
    const job = {
      id: crypto.randomUUID(),
      status: 'queued',
      createdAt: Date.now(),
      startedAt: null,
      finishedAt: null,
      input,
      progress: '',
      result: null
    };
    jobs.set(job.id, job);

    if (waiting.length >= maxQueue) {
      // очередь перегружена — не заставляем клиента ждать, сразу отдаём шаблонную книгу
      finish(job, { ...fallback(input), source: 'template', provider: null, model: null });
    } else {
      waiting.push(job);
      pump();
    }
    return job;
  }

  function get(id) {
    if (jobs.has(id)) return jobs.get(id);
    if (!storeDir || !ID_RE.test(id)) return null;
    try {
      return JSON.parse(fs.readFileSync(path.join(storeDir, `${id}.json`), 'utf8'));
    } catch {
      return null;
    }
  }

  function position(job) {
    const index = waiting.indexOf(job);
    return index === -1 ? 0 : index + 1;
  }

  function cleanup() {
    const now = Date.now();
    for (const [id, job] of jobs) {
      if (job.status === 'completed' && now - job.finishedAt > memoryTtlMs) jobs.delete(id);
    }
    // готовые книги не храним дольше diskTtlMs (фото ребёнка не хранятся вовсе — см. finish)
    if (!storeDir) return;
    fs.readdir(storeDir, (error, files) => {
      if (error) return;
      for (const file of files) {
        const full = path.join(storeDir, file);
        fs.stat(full, (statError, stat) => {
          if (!statError && now - stat.mtimeMs > diskTtlMs) fs.unlink(full, () => {});
        });
      }
    });
  }

  const timer = setInterval(cleanup, 10 * 60_000);
  timer.unref?.();

  /** Сохраняет изменения готовой книги (правка текста, перерисовка). */
  function save(job) {
    // книга, поднятая с диска, остаётся в памяти: так ход дорисовки виден в /status сразу, а не после записи на диск
    jobs.set(job.id, job);
    persist(job);
  }

  return { submit, get, save, position, stats: () => ({ running, waiting: waiting.length, inMemory: jobs.size }) };
}
