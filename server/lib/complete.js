// Дорисовка книги после оплаты.
//
// В бесплатном превью готовы весь текст, лист персонажа, обложка и первая иллюстрация. После оплаты здесь
// дорисовываются остальные иллюстрации (по тому же листу персонажа — одежда и спутники не «поплывут»)
// и раскраска, если она заказана. Фото ребёнка берутся из временного хранилища; если их там уже нет —
// рисуем по листу персонажа, он держит и лицо, и одежду.

import { illustrateBook, coloringPages, generateHeroImage } from './illustrate.js';

const isDrawn = (src) => /^data:/.test(src || '');

/** Иллюстрации книги по порядку: { brief, src, set(src) } — одинаково для «Сказки» и «Большой истории». */
function imagesOf(result) {
  if (result.book) {
    return result.book.chapters.flatMap((c) => c.blocks.filter((b) => b.t === 'image')).map((b) => ({ brief: b.brief, src: b.src, set: (src) => { b.src = src; } }));
  }
  return result.pages.map((p) => ({ brief: p.heroBrief, src: p.heroImage, set: (src) => { p.heroImage = src; p.hero = true; } }));
}

/**
 * Дорисовывает книгу задачи job на месте (меняет job.result). Никогда не бросает: не получилось нарисовать —
 * страница остаётся текстовой, иллюстрация «Большой истории» убирается.
 */
export async function completeBook(job, {
  photos = [],
  illustrate = generateHeroImage,
  progress = () => {},
  budgetMs = Number(process.env.COMPLETE_IMAGE_BUDGET_MS || 6 * 60_000),
  log = console.warn
} = {}) {
  const result = job.result;
  const target = result.book || result;
  const images = imagesOf(result);
  const missing = images.map((im, i) => (isDrawn(im.src) ? -1 : i)).filter((i) => i >= 0);
  const deadlineAt = Date.now() + budgetMs;
  const input = { ...job.input, photos };

  const art = await illustrateBook(input, {
    scenes: images.map((im) => ({ brief: im.brief })),
    coverBrief: target.cover ? '' : target.coverBrief || `The child at the heart of the story "${target.title}", looking ahead with excitement.`,
    look: target.look,
    sheet: target.sheet,
    only: missing,
    illustrate,
    deadlineAt,
    onProgress: (done, total) => progress(`Дорисовываем иллюстрации (${done} из ${total})…`),
    log
  });
  missing.forEach((i) => { if (art.scenes[i]) images[i].set(art.scenes[i]); });
  if (art.cover) target.cover = art.cover;

  // «Большая история»: иллюстрация так и не получилась — убираем её, фоновых сцен в книге клиента нет
  if (result.book) for (const ch of result.book.chapters) ch.blocks = ch.blocks.filter((b) => b.t !== 'image' || isDrawn(b.src));

  if (job.input?.coloring) {
    progress('Готовим раскраску…');
    const sources = imagesOf(result).map((im) => im.src).filter(isDrawn);
    target.coloring = await coloringPages(sources, { illustrate, deadlineAt: deadlineAt + 2 * 60_000, log });
  }

  delete target.preview;
  return job;
}
