# Промпты для иллюстративных страниц — тема «Приключения»

## Важное изменение архитектуры

Раньше эти иллюстрации задумывались как альбомные «развороты» с текстом, наложенным
поверх. Это оказалось неправильно — вместо этого:

- Книга состоит из отдельных **портретных страниц** (как обычная книжная страница,
  соотношение сторон примерно 2:3), а не альбомных разворотов.
- Когда книга открыта — видно две страницы рядом: **одна текстовая, одна
  иллюстративная**. Это два разных файла/изображения, не один склеенный.
- **Текстовая страница** — это отдельная, красиво оформленная страница только с
  текстом (текстура бумаги, декоративная рамка/уголок), без иллюстрации сцены внутри.
  Она делается один раз как переиспользуемый дизайн (можно даже просто через CSS,
  без AI-генерации вообще) и подходит под любой текст.
- **Иллюстративная страница** (то, что описано в этом файле) — полноценная сцена
  БЕЗ единой буквы текста на ней. Никакого зарезервированного места под текст
  внутри иллюстрации — текст никогда сюда не накладывается.
- Не каждому развороту истории обязательно нужна уникальная иллюстрация — если
  сцене "нечего показать", можно оставить просто текстовую страницу без пары.

Эти иллюстрации НЕ содержат ребёнка — это чисто декоративные сцены-фоны,
переиспользуемые для всех клиентов с этой темой+стилем. Генерируете один раз,
отбираете и дорабатываете лучшие — дальше используются бесконечно.

Уроки из тестирования "геройских" иллюстраций, которые тут тоже применимы:
- Никаких отрицаний в описании настроения/атмосферы
- Стиль описывается через технику рендеринга (мазки, штриховка, текстура), а не через
  форму объектов

## Список сцен (на тему «Приключения») — со сколькими вариантами делать каждую

Не все сцены одинаково рискуют повторяться между разными клиентами. Структурные сцены
(есть почти в любом приключенческом сюжете) стоит делать в нескольких вариантах, а
специфичные (нужны не всегда) — можно оставить в меньшем количестве.

**Структурные (делать 3-4 варианта каждой):**
1. map_table — стол с картой / чердак с сундуком
2. forest_path — лесная тропа / поляна с костром
3. night_camp — ночной лагерь у костра
4. treasure_room — комната с находками / трофейная стена

**Специфичные (делать 1-2 варианта каждой — на старте достаточно):**
5. cave_entrance — вход в пещеру / подземный ход
6. mountain_bridge — горная тропа / мост
7. ship_deck — палуба корабля / берег моря
8. castle_gate — вход в замок/крепость издалека

## Универсальная структура промпта (заполняете под каждую сцену и стиль)

```
Scene: [конкретное описание сцены и настроения — 2-3 предложения]

Lighting and palette: [источник света, время суток, цветовая температура]

Art style: [ТЕХНИКА рендеринга для выбранного стиля — см. блоки ниже]

Composition: a single full-page book illustration with a portrait aspect ratio of
approximately 2:3 (like a standard book page, taller than wide), no characters or
people in the scene. The scene fills the entire page edge to edge — no text, letters,
writing, signs or symbols rendered anywhere in the image; text is never placed on
this page, it always lives on a separate adjacent page.

Avoid (technical only): text of any kind in the image, blurred details, watermarks.
```

## Блоки "Art style" под каждый из 4 подтверждённых стилей

**Акварель:**
```
traditional watercolor children's book illustration, visible loose brushstrokes and
soft paper grain texture, gentle bleeding edges between colors, muted warm palette
```

**Мультяшный:**
```
modern flat-color cartoon illustration style, bold clean black outlines, simplified
shapes, smooth flat shading with minimal texture, bright saturated colors
```

**Классическая книжная графика:**
```
classic mid-century children's book illustration style, fine ink cross-hatching and
detailed linework, gouache and colored-pencil texture, traditional printed picture
book aesthetic from the 1960s-1980s
```

**3D-анимация:**
```
modern 3D animated feature film style, smooth stylized environment rendering, soft
global illumination, gentle ambient occlusion in crevices and shadows, polished but
warm and inviting render quality — not photorealistic
```

## Пример готового промпта (сцена map_table, стиль — акварель)

```
Scene: An attic room at dusk, dust motes floating in a warm shaft of light from a
small round window. An old wooden trunk sits open in the foreground, a yellowed
hand-drawn map partly unrolled beside it. Cobwebs in the corners, an old lantern
hanging from a beam, stacks of forgotten boxes and toys in soft shadow.

Lighting and palette: warm golden late-afternoon light streaming through the window,
deep soft shadows in the corners, warm amber and dusty brown palette with a touch of
cool blue in the shadows.

Art style: traditional watercolor children's book illustration, visible loose
brushstrokes and soft paper grain texture, gentle bleeding edges between colors,
muted warm palette.

Composition: a single full-page book illustration with a portrait aspect ratio of
approximately 2:3 (like a standard book page, taller than wide), no characters or
people in the scene. The scene fills the entire page edge to edge — no text, letters,
writing, signs or symbols rendered anywhere in the image; text is never placed on
this page, it always lives on a separate adjacent page.

Avoid (technical only): text of any kind in the image, blurred details, watermarks.
```

## Текстовая страница (отдельно от иллюстраций)

Текстовая страница не требует AI-генерации вообще — это переиспользуемый дизайн
(текстура старой бумаги, декоративный уголок/рамка, шрифт под стиль книги),
сделанный один раз в CSS/дизайне сайта и подходящий под любой текст любой длины
(с прокруткой, если текст длинный — текст никогда не обрезается).

## Практический совет по объёму работы

Итого на старте: (4 структурные сцены × 3-4 варианта) + (4 специфичные × 1-2 варианта)
≈ 16-24 иллюстрации на один стиль, ×4 стиля ≈ 65-95 иллюстраций всего. Можно начать
скромнее — по 1 варианту каждой сцены во всех 4 стилях (рабочий MVP), и добирать
варианты по мере роста заказов для тегов, которые используются чаще всего.
