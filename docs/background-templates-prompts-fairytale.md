# Промпты для иллюстративных страниц — тема «Сказка»

Три сказочных мира (жанр решает ИИ по сюжету — не известен заранее, как в «Путешествии»):
**королевство**, **заколдованный лес**, **подводное царство**. Сцены общие на все три — сказка
про королевство иногда идёт через лес, поэтому библиотека не делится жёстко по жанрам. Структура
промпта и правила — те же, что в `background-templates-prompts.md`: портретная страница ~2:3, без
текста и без детей в кадре, стиль — через технику рендера, настроение — только позитивной
формулировкой, без отрицаний.

## Список сцен

**Королевство:**
1. throne_hall — тронный зал с витражами
2. castle_ballroom — бальный зал замка
3. garden_maze — дворцовый сад с фонтаном и живой изгородью
4. dragon_tower — башня с драконом или стражей

**Заколдованный лес:**
5. fairy_clearing — лесная поляна со светлячками и грибами-домиками
6. talking_grove — роща с говорящими деревьями
7. witch_hut — избушка на опушке леса
8. moonlit_thicket — ночная чаща в лунном свете

**Подводное царство:**
9. coral_palace — дворец из кораллов
10. pearl_cave — подводная пещера с жемчугом
11. sunken_ship — затонувший корабль
12. kelp_forest — заросли водорослей с рыбками

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

```
[throne_hall]
Scene: A grand throne room with tall stained-glass windows casting colored light
across a marble floor, a gilded empty throne on a raised dais, heavy velvet drapes
framing the windows, a long red carpet leading up to it.

Lighting and palette: warm colored light streaming through the stained glass, rich
palette of deep red, gold and royal blue.

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
[castle_ballroom]
Scene: An elegant castle ballroom with a gleaming polished floor reflecting rows of
tall arched windows, a crystal chandelier overhead, garlands of flowers draped along
the walls, a grand staircase in the background.

Lighting and palette: warm golden chandelier light mixing with soft daylight, palette
of ivory, gold and soft rose.

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
[garden_maze]
Scene: A palace garden with tall trimmed hedges forming a maze, a stone fountain at
the center with gently splashing water, climbing roses on an archway, neatly kept
flower beds along the path.

Lighting and palette: soft midday sun, palette of deep green, soft pink roses and
warm stone grey.

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
[dragon_tower]
Scene: A tall stone castle tower at dusk, a coiled dragon tail and folded wing just
visible around its base, scattered gold coins and treasure glinting at the tower's
foot, ivy climbing the old stones.

Lighting and palette: warm dusk light with deep amber sky, palette of stone grey,
warm gold and deep green ivy.

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
[fairy_clearing]
Scene: A magical forest clearing at twilight, clusters of glowing fireflies drifting
in the air, small mushroom houses with tiny glowing windows nestled among the roots,
soft moss covering the ground.

Lighting and palette: soft glowing twilight blue mixed with warm firefly gold, palette
of deep forest green, warm amber glow and dusty violet shadows.

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
[talking_grove]
Scene: A grove of ancient trees with gently curved trunks that suggest calm faces in
the bark, dappled sunlight filtering through a thick canopy, soft ferns and wildflowers
covering the forest floor.

Lighting and palette: soft dappled green-gold light, palette of deep green, warm
amber light patches and soft brown bark tones.

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
[witch_hut]
Scene: A small cosy wooden hut at the edge of the forest, a thatched roof dusted with
moss, a curl of smoke rising from the chimney, herbs hanging to dry by the round
window, a winding path leading up to the door.

Lighting and palette: warm late-afternoon light, palette of deep brown wood, mossy
green and warm amber window glow.

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
[moonlit_thicket]
Scene: A dense forest thicket at night under a bright full moon, silvery moonlight
filtering between dark tree trunks, patches of soft mist low on the ground, a few
pale night flowers glowing faintly.

Lighting and palette: cool silvery moonlight against deep shadow, palette of deep
indigo, cool silver and touches of pale lavender.

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
[coral_palace]
Scene: An underwater palace built from towering branches of coral in pink and
lavender, softly glowing pearls embedded along archways, schools of small fish
drifting past, sunlight filtering down from the surface far above.

Lighting and palette: soft blue-green underwater light with warm coral pinks, palette
of turquoise, coral pink and pearl white.

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
[pearl_cave]
Scene: A softly glowing underwater cave with clusters of large pearls embedded in
the rock walls, gentle beams of light filtering through cracks above, smooth
sand covering the cave floor, delicate seaweed swaying near the entrance.

Lighting and palette: cool blue ambient glow with warm pearlescent highlights,
palette of deep teal, soft pearl white and lavender.

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
[sunken_ship]
Scene: An old sunken ship resting gently on the sea floor, its wooden hull covered
in soft coral and barnacles, a broken mast leaning to one side, small fish swimming
in and out of an open porthole, shafts of light reaching down from above.

Lighting and palette: deep blue-green underwater light with soft golden shafts,
palette of weathered wood brown, deep teal and pale gold.

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
[kelp_forest]
Scene: A tall swaying kelp forest underwater, long ribbons of seaweed reaching up
toward the sunlit surface, small colorful fish darting between the fronds, soft
sandy floor dotted with shells.

Lighting and palette: bright turquoise light filtering from above, palette of deep
emerald green, turquoise and touches of coral orange from the fish.

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

```bash
cd server
node generate-backgrounds.js --file data/background-prompts-fairytale.json
```

Готовые файлы сохранятся в `server/data/generated/` — дальше их нужно вручную просмотреть,
выбрать лучшие и положить в `assets/scenes/<id>.jpg`, как это уже сделано для сцен темы
«Приключения».
