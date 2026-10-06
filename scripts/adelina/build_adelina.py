import json, re, os
from PIL import Image

SRC = 'C:/Users/Asus/Desktop/zakaz-adelina'
OUT = 'C:/Users/Asus/svoya-skazka/assets/examples/adelina'
WEB = 'assets/examples/adelina'
os.makedirs(OUT, exist_ok=True)

def webp(src, dst, w=None, q=82):
    im = Image.open(f'{SRC}/{src}').convert('RGB')
    if w: im = im.resize((w, round(im.height * w / im.width)), Image.LANCZOS)
    im.save(f'{OUT}/{dst}', quality=q, method=6)

webp('oblozhka.png', 'cover.webp')
webp('oblozhka.png', 'cover-480.webp', 480)
for i in range(1, 11):
    webp(f'stranica-{i}.png', f'ill-{i}.webp')
coloring = sorted(f for f in os.listdir(SRC) if re.fullmatch(r'raskraska-\d+\.png', f))
for f in coloring:
    n = re.search(r'\d+', f).group()
    webp(f, f'coloring-{n}.webp')

# подписи — по тому, что нарисовано на картинке
CAPTIONS = {
    1: 'Аделина с мамой у окна провожает солнце. В руках — любимая мышка Пуговка.',
    2: 'Аделина рисует свою семью: два сердечка, разноцветный цветочек и большого доброго динозавра. Аэлита смотрит рядом.',
    3: 'Нарисованный динозавр вылезает из светящегося альбома. Аделина шепчет «тсс» — Аэлита спит.',
    4: 'Волшебные качели взлетают над крышами, рядом летит динозавр Дино с цветочком на макушке.',
    5: 'Аделина на качелях летит над океаном, а внизу кит пускает фонтан.',
    6: 'Заснеженная площадь, вдали Арарат в лунном свете. Аделина встречает Дзмер Папи с порванным мешком.',
    7: 'Аделина на синем самокате мчится между снеговиками и собирает рассыпанные подарки.',
    8: 'Аделина и бабушка Ануш пекут новогоднюю гату: Аделина рисует вилкой узор-солнышко.',
    9: 'Над заснеженными горами рассыпается салют: Аделина встречает Новый год в Армении.',
    10: 'Новогодняя ночь: папа качает Аделину на качелях в саду.',
}

md = open(f'{SRC}/tekst-ru.md', encoding='utf-8').read()
strip = lambda s: s.replace('**', '').replace('*', '').strip()
title = strip(re.search(r'^# (.+)$', md, re.M).group(1))
sections = []
for s in re.split(r'^## ', md, flags=re.M)[1:]:
    head, _, rest = s.partition('\n')
    sections.append((head.strip(), [p.strip() for p in re.split(r'\n\s*\n', rest) if p.strip() and p.strip() != '---']))

ded = dict(sections)['Посвящение']
lead = strip(ded[0])
dedication = {
    'title': 'Посвящается',
    'lead': re.sub(r'^Посвящается\s+', '', lead),
    'paragraphs': [strip(p) for p in ded[1:-1]],
    'signature': strip(ded[-1]).replace('С любовью, ', 'С любовью,\n'),
}

chapters = []
for head, paras in sections:
    m = re.match(r'Глава (\d+)\.\s*(.+)', head)
    if not m: continue
    blocks = []
    for p in paras:
        im = re.match(r'>\s*\*\*Иллюстрация (\d+)\.\*\*', p)
        if im:
            n = int(im.group(1))
            blocks.append({'t': 'image', 'src': f'{WEB}/ill-{n}.webp', 'caption': CAPTIONS[n]})
        elif p.startswith('*Из альбома Аделины:'):
            # записка в конце главы — как «Из записей …» в заказах «Большой истории»
            blocks.append({'t': 'note', 'label': 'Из альбома Аделины', 'text': (lambda x: x[:1].upper() + x[1:])(strip(p).split(':', 1)[1].strip())})
        elif strip(p).rstrip('.') == 'Конец':
            continue  # у книги своя страница «Конец»
        else:
            blocks.append({'t': 'p', 'text': strip(p.replace('\n', ' '))})
    chapters.append({'n': int(m.group(1)), 'title': m.group(2).strip(), 'initial': None, 'blocks': blocks})

back = dict(sections)['Для задней обложки']
quote = strip(re.sub(r'^\*\*Цитата:\*\*', '', back[0])).strip('«»')
blurb = strip(re.sub(r'^\*\*Аннотация:\*\*', '', back[1]))

audio = [{'title': 'Посвящение', 'src': '/api/media/adelina-audio/dedication.mp3'}] + \
        [{'title': f"Глава {c['n']}. {c['title']}", 'src': f"/api/media/adelina-audio/ch{c['n']}.mp3"} for c in chapters]

book = {
    'audio': audio,
    'title': title,
    'theme': 'parchment',
    'genre': 'newyear',
    'occasion': 'newyear',
    'age': 4,
    'ageGroup': '0-4',
    'cover': f'{WEB}/cover.webp',
    'coverTitle': {'place': 'bottom'},  # вверху голова Аделины и цветок Дино — название вниз (правило: не закрывать лица)
    'meta': {'heroName': 'Аделина', 'heroGirl': True},
    'dedication': dedication,
    'chapters': chapters,
    'coloring': [f'{WEB}/coloring-{re.search(chr(92) + "d+", f).group()}.webp' for f in coloring],
    'backQuote': quote,
    'blurb': blurb,
    'backImage': f'{WEB}/ill-5.webp',
    'backQr': {'label': 'Аудиокнига', 'url': 'https://geroenok.online/book-pro?demo=adelina'},
}
head = ('// Книга-образец «Аделина и волшебные качели» («Большая история», акварель, Новый год, 4 года) — для страницы «Примеры».\n'
        '// Согласие родителей на публикацию есть (06.10). Картинки нарисованы владелицей в ChatGPT (Desktop/zakaz-adelina),\n'
        '// на стр. 1–3 и 10 — родные по фото (опция «Родные по фото»). Текст — Desktop/zakaz-adelina/tekst-ru.md.\n')
open(f'{OUT}/book.js', 'w', encoding='utf-8').write(head + 'window.SKAZKA_ADELINA_BOOK = ' + json.dumps(book, ensure_ascii=False, indent=1) + ';\n')
print('chapters', len(chapters), 'images', sum(b['t'] == 'image' for c in chapters for b in c['blocks']), 'coloring', len(coloring))
print('quote:', quote); print('ded:', dedication)
