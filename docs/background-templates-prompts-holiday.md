# Промпты для иллюстративных страниц — тема «Праздник»

Первый набор поводов: **день рождения** и **Новый год** (остальные поводы — «первый день
в школе», «выпускной» и т.д. — пока не делаем, по договорённости расширяем позже).
Структура промпта и правила — те же, что и в `background-templates-prompts.md` для темы
«Приключения»: портретная страница ~2:3, без текста и без детей в кадре (декоративный фон,
переиспользуется для всех клиентов с этим поводом+стилем), стиль — через технику рендера,
настроение — только позитивной формулировкой, без отрицаний.

## Список сцен

**День рождения (делать 3-4 варианта каждой — используются чаще всего):**
1. party_room — комната с шариками и гирляндами, украшенная к празднику
2. gift_pile — гора ярких подарков с бантами и лентами
3. birthday_table — праздничный стол с тортом и зажжёнными свечами
4. confetti_moment — момент залпа конфетти и серпантина в воздухе (кульминационная, 1-2 варианта достаточно)

**Новый год (делать 3-4 варианта каждой):**
5. tree_lights — наряженная ёлка с игрушками и гирляндой
6. snow_yard — заснеженный двор со снеговиком
7. fireplace_stockings — камин с носками и подарками
8. midnight_fireworks — окно с ночным салютом под бой курантов (кульминационная, 1-2 варианта достаточно)

Повод определяется по свободному тексту анкеты (`occasion`): если там встречается
«новый год», «ёлка», «рождество», «дед мороз», «снегурочка» и т.п. — берётся набор
Нового года, иначе — набор дня рождения (он же используется как нейтральный
«праздничный» вариант, если повод не указан или это другой праздник).

## Блоки "Art style" — переиспользуются как есть из темы «Приключения»

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

## Готовые промпты (стиль — акварель, по одному варианту на сцену)

Дальше можно добирать варианты и другие стили тем же способом — заменить блок Scene
и Lighting, Art style и Composition оставить как есть.

```
[party_room]
Scene: A cosy living room decorated for a birthday party, paper garlands strung
across the walls, a cluster of colorful balloons in one corner, a "Happy Birthday"
bunting hanging over a window (bunting shows only shapes and dots, no legible
letters). Streamers hang from a light fixture, a small pile of wrapped presents
waits on a chair.

Lighting and palette: warm afternoon light through a window, bright cheerful
palette of coral, teal and golden yellow with soft warm shadows.

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

```
[gift_pile]
Scene: A joyful pile of birthday presents wrapped in bright paper with ribbons and
bows, stacked in different sizes, a few loose confetti pieces scattered around the
base, soft afternoon light catching the glossy ribbon.

Lighting and palette: warm soft daylight from one side, playful palette of pink,
turquoise and gold with gentle pastel shadows.

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

```
[birthday_table]
Scene: A festive table set for a birthday, a frosted layered cake in the center
with lit candles, small plates with treats around it, a few balloons tied to the
back of a chair, a light dusting of scattered confetti on the tablecloth.

Lighting and palette: warm glow from the candle flames mixing with soft daylight,
rich palette of cream, raspberry pink and warm gold.

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

```
[confetti_moment]
Scene: A festive room caught mid-celebration, a burst of colorful confetti and
paper streamers frozen in the air, balloons drifting upward, warm light catching
the falling paper pieces like tiny sparks.

Lighting and palette: bright warm light from above, vivid joyful palette of coral,
sunny yellow and sky blue with confetti in mixed bright colors.

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

```
[tree_lights]
Scene: A tall New Year tree decorated with ornaments, glowing garland lights and
a star on top, wrapped presents nestled at its base, a soft-focus cosy room in the
background.

Lighting and palette: warm glow from the garland lights against a cool dim room,
deep green, gold and warm amber palette with touches of soft red.

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

```
[snow_yard]
Scene: A snow-covered yard at dusk with a cheerful snowman wearing a scarf, soft
falling snowflakes, small footprints leading across the snow, warm light glowing
from a nearby window.

Lighting and palette: cool blue twilight with warm golden light spilling from a
window, soft palette of icy blue, white and warm amber accents.

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

```
[fireplace_stockings]
Scene: A cosy fireplace with a crackling fire, knitted stockings hanging from the
mantel alongside pine branches and small ornaments, a couple of wrapped gifts
resting on the hearth rug.

Lighting and palette: warm flickering firelight as the main source, deep red,
forest green and warm wood-brown palette.

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

```
[midnight_fireworks]
Scene: A frosted window at night with fireworks blooming in the dark sky outside,
snow gently falling past the glass, a lit candle and a small clock on the
windowsill inside.

Lighting and palette: cool midnight blue outside contrasted with warm candlelight
inside, deep navy, gold firework sparks and warm amber palette.

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

## Как сгенерировать

Промпты уже лежат в машиночитаемом виде в `server/data/background-prompts-holiday.json`
(пока только акварель, по одному варианту на сцену — старт по той же логике, что и с
темой «Приключения»). Как только решится вопрос с квотой/billing на image-модель
(см. `server/README.md`), сгенерировать все восемь одной командой:

```bash
cd server
node generate-backgrounds.js --file data/background-prompts-holiday.json
```

Готовые файлы сохранятся в `server/data/generated/` — дальше их нужно вручную
просмотреть, выбрать лучшие и положить в `assets/scenes/<id>.jpg`, как это уже сделано
для сцен темы «Приключения».
