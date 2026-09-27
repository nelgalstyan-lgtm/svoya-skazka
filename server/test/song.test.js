// Песня по книге: проверка ответа ИИ, настроение по возрасту, запрос к ElevenLabs. Бесплатно — без сети.

import test from 'node:test';
import assert from 'node:assert/strict';
import { GOOD_SONG } from './song-fixture.js';
import { parseSong, moodForAge, musicPrompt, songSections, songSource, buildSongPrompt, writeSong } from '../lib/song.js';

const ALEX = { name: 'Алекс', age: '13', gender: 'Мальчик' };

test('песня: годный ответ ИИ принимается, мусор в ```json``` не мешает', () => {
  const song = parseSong('```json\n' + JSON.stringify(GOOD_SONG) + '\n```', ALEX);
  assert.equal(song.mood, 'thoughtful');
  assert.equal(song.chorus.length, 4);
  assert.equal(song.verses.length, 3);
  assert.equal(song.color, 'Armenian duduk melody in the intro');
});

test('песня: без имени в припеве, с латиницей, с чужим брендом, не того размера — отклоняется', () => {
  const bad = (patch) => () => parseSong(JSON.stringify({ ...GOOD_SONG, ...patch }), ALEX);
  assert.throws(bad({ chorus: ['Не сдавайся, не сдавайся,', 'Если снова всё не так —', 'Начинай опять сначала,', 'Так советует нам Макс!'] }), /name/);
  assert.throws(bad({ outro: ['Happy end, happy end', 'Стены помнят всё подряд.'] }), /Russian/);
  assert.throws(bad({ outro: ['Там играли в Майнкрафт люди', 'Стены помнят всё подряд.'] }), /brands/);
  assert.throws(bad({ verses: GOOD_SONG.verses.slice(0, 2) }), /3 verses/);
  assert.throws(bad({ mood: 'sad' }), /mood/);
  // имя в другом падеже — годится
  assert.doesNotThrow(bad({ chorus: ['Ждёт Алекса путь далёкий,', 'Если снова всё не так —', 'Начинай опять сначала,', 'Так советует нам Макс!'] }));
  // оттенок звучания не по-английски — просто отбрасывается
  assert.equal(parseSong(JSON.stringify({ ...GOOD_SONG, color: 'дудук' }), ALEX).color, '');
});

test('песня: малышам только весёлая или колыбельная', () => {
  assert.equal(moodForAge('thoughtful', 3), 'lullaby');
  assert.equal(moodForAge('adventure', 4), 'joyful');
  assert.equal(moodForAge('thoughtful', 5), 'thoughtful');
  assert.equal(moodForAge('adventure', ''), 'adventure');
  assert.equal(parseSong(JSON.stringify({ ...GOOD_SONG, chorus: ['Милена, Милена, не сдавайся,', 'Если снова всё не так —', 'Начинай опять сначала,', 'Так советует нам Макс!'] }), { name: 'Милена', age: '3' }).mood, 'lullaby');
});

test('песня: запрос к ElevenLabs — стиль по настроению и голос по герою, части в проверенном порядке', () => {
  const song = parseSong(JSON.stringify(GOOD_SONG), ALEX);
  const prompt = musicPrompt(song, ALEX);
  assert.match(prompt, /reflective acoustic pop/);
  assert.match(prompt, /Armenian duduk/);
  assert.match(prompt, /young male vocal/);
  assert.match(prompt, /Russian language/);
  assert.deepEqual(songSections(song).map((s) => s.label), ['Verse 1', 'Chorus', 'Verse 2', 'Verse 3', 'Chorus', 'Outro']);
  assert.ok(prompt.indexOf('[Verse 1]') < prompt.indexOf('[Chorus]'));
  assert.equal(prompt.split('Алекс, Алекс, не сдавайся').length - 1, 2, 'припев поётся дважды');
  assert.match(musicPrompt({ ...song, mood: 'lullaby' }, ALEX), /female vocal/);
  assert.match(musicPrompt({ ...song, mood: 'joyful' }, { gender: 'Девочка' }), /young female vocal/);
});

test('песня: текст книги для ИИ — сказка целиком, у «Большой истории» начало каждой главы', () => {
  const short = songSource({ title: 'Сказка', pages: [{ text: 'Раз' }, { text: 'Два' }] });
  assert.equal(short.text, 'Раз\nДва');
  const long = 'слово '.repeat(2000);
  const big = songSource({ book: { title: 'Книга', chapters: Array.from({ length: 6 }, (_, i) => ({ n: i + 1, title: `Глава${i}`, blocks: [{ t: 'p', text: long }, { t: 'image', caption: 'x' }] })) } });
  assert.ok(big.text.length < 9500);
  assert.equal(big.text.split('Глава ').length - 1, 6);
  const { user } = buildSongPrompt({ name: 'Алекс', age: 13, cast: 'брат Макс' }, big);
  assert.match(user, /Алекс/);
  assert.match(user, /брат Макс/);
});

test('песня: ИИ недоступен — песни нет, ошибки нет', async () => {
  assert.equal(await writeSong(ALEX, { title: 'Т', pages: [] }, { providers: [], log: () => {} }), null);
  const broken = [{ name: 'broken', models: ['m'], call: async () => 'не JSON' }];
  assert.equal(await writeSong(ALEX, { title: 'Т', pages: [] }, { providers: broken, deadlineMs: 3_000, log: () => {} }), null);
  const good = [{ name: 'fake', models: ['m'], call: async () => JSON.stringify(GOOD_SONG) }];
  const song = await writeSong(ALEX, { title: 'Т', pages: [] }, { providers: good, log: () => {} });
  assert.equal(song.title, 'Тайна Ани');
  assert.equal(song.provider, 'fake');
});
