"""Картинки Героёнка для сайта из эталонных листов в docs/brand/ (канон персонажа).

Вырезает фигуры, переводит цвет бумаги в чисто белый и сохраняет WebP в assets/brand/.
На сайте картинки стоят с mix-blend-mode: multiply (класс .brand-art в assets/geroenok.css): белое исчезает,
и Героёнок ложится на любой светлый бумажный фон без прямоугольника. Так файлы в разы легче, чем с прозрачностью.

Запуск (нужны Pillow и numpy): python scripts/brand_assets.py
Новые картинки высокого разрешения — положить в docs/brand/ и поправить таблицу CROPS.
"""
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'docs' / 'brand'
OUT = ROOT / 'assets' / 'brand'

# имя: (файл-источник, (left, top, right, bottom), ширины для сайта; () — один файл name.webp в исходном размере)
SHEET = 'emotions-actions.png'
LOGO = 'logo.png'
CANON = 'character-sheet.png'
CROPS = {
    'geroenok-main': ('geroenok-main.png', (60, 40, 990, 1490), (360, 560, 820)),
    # эмоции (головы)
    'emotion-joyful': (SHEET, (84, 71, 229, 272), ()),
    'emotion-curious': (SHEET, (299, 91, 451, 272), ()),
    'emotion-thoughtful': (SHEET, (526, 71, 708, 272), ()),
    'emotion-surprised': (SHEET, (768, 71, 894, 272), ()),
    'emotion-smile': (SHEET, (83, 303, 240, 495), ()),
    'emotion-calm': (SHEET, (301, 303, 444, 495), ()),
    'emotion-serious': (SHEET, (527, 303, 660, 495), ()),
    'emotion-playful': (SHEET, (727, 303, 906, 495), ()),
    'emotion-sleepy': (SHEET, (70, 522, 240, 705), ()),
    'emotion-reading': (SHEET, (293, 522, 460, 705), ()),
    'emotion-shy': (SHEET, (533, 522, 673, 705), ()),
    'emotion-sad': (SHEET, (757, 522, 896, 705), ()),
    # характер в действии (фигуры)
    'pose-walking': (SHEET, (36, 807, 208, 1082), ()),
    'pose-reading': (SHEET, (237, 807, 459, 1082), ()),
    'pose-thinking': (SHEET, (487, 807, 669, 1082), ()),
    'pose-helping': (SHEET, (687, 807, 841, 1082), ()),
    'pose-greeting': (SHEET, (877, 807, 1065, 1082), ()),
    'pose-caring': (SHEET, (1076, 807, 1280, 1082), ()),
    # предметы мира (character-sheet.png, блок «Атрибуты») и веточка
    'item-bag': (CANON, (549, 948, 636, 1048), ()),
    'item-books': (CANON, (647, 948, 756, 1048), ()),
    'item-key': (CANON, (774, 948, 818, 1048), ()),
    'item-lantern': (CANON, (845, 948, 904, 1048), ()),
    'item-feather': (CANON, (555, 1079, 622, 1156), ()),
    'item-letter': (CANON, (636, 1079, 719, 1156), ()),
    'item-star': (CANON, (746, 1079, 805, 1156), ()),
    'item-map': (CANON, (820, 1079, 903, 1156), ()),
    'sprig': (CANON, (1114, 737, 1173, 875), ()),
    # логотип (docs/brand/logo.png): надпись и Героёнок для шапки, весь знак целиком
    'logo-wordmark': (LOGO, (250, 776, 1025, 950), (220, 440)),
    'logo-mark': (LOGO, (470, 158, 830, 530), (96,)),
    'logo-full': (LOGO, (250, 150, 1025, 1095), (480,)),
}

# Светлые версии с прозрачностью — для тёмного фона (подвал, панель книги), где «умножение» не работает
LIGHT = {'logo-wordmark-light': (LOGO, (250, 776, 1025, 950), (220, 440), (0xFB, 0xF3, 0xE3))}

# Над надписью заканчиваются цветы под фигурой: закрашиваем бумагой всё правее «Г» выше строки 792
ERASE = {'logo-wordmark': [(420, 776, 1025, 792)], 'logo-wordmark-light': [(420, 776, 1025, 792)]}


def erase(img, name, box):
    from PIL import ImageDraw
    d = ImageDraw.Draw(img)
    for (x0, y0, x1, y1) in ERASE.get(name, []):
        d.rectangle((x0 - box[0], y0 - box[1], x1 - box[0], y1 - box[1]), fill=tuple(int(v) for v in paper_color(img)))
    return img


def paper_color(img):
    """Цвет бумаги — медиана по краям кадра."""
    a = np.asarray(img)
    edge = np.concatenate([a[:6].reshape(-1, 3), a[-6:].reshape(-1, 3), a[:, :6].reshape(-1, 3), a[:, -6:].reshape(-1, 3)])
    return np.median(edge, axis=0)


def paper_to_white(img, paper):
    """Бумага → белый: делим на цвет бумаги; почти белое (фактура бумаги) — в чистый белый."""
    p = np.asarray(img).astype(np.float64) / np.maximum(np.asarray(paper, dtype=np.float64), 1)
    p = np.clip(p, 0, 1)
    near_white = p.min(axis=2) > 0.955
    p[near_white] = 1
    return Image.fromarray((p * 255).round().astype(np.uint8), 'RGB')


def content_box(img):
    """Рамка вокруг нарисованного (без белых полей)."""
    a = np.asarray(img)
    ink = a.min(axis=2) < 245
    ys, xs = np.where(ink)
    return (xs.min(), ys.min(), xs.max() + 1, ys.max() + 1)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for name, (src, box, widths) in CROPS.items():
        img = erase(Image.open(SRC / src).convert('RGB').crop(box), name, box)
        cut = paper_to_white(img, paper_color(img))
        cut = cut.crop(content_box(cut))  # без пустых полей
        if not widths:
            cut.save(OUT / f'{name}.webp', 'WEBP', quality=80, method=6)
            print(f'{name}: {cut.size}')
            continue
        for w in widths:
            h = round(cut.height * w / cut.width)
            cut.resize((w, h), Image.LANCZOS).save(OUT / f'{name}-{w}.webp', 'WEBP', quality=80, method=6)
        print(f'{name}: {cut.size} -> {widths}')
    for name, (src, box, widths, color) in LIGHT.items():
        img = erase(Image.open(SRC / src).convert('RGB').crop(box), name, box)
        paper = paper_color(img)
        a = np.asarray(img).astype(np.float64)
        ink = np.clip((np.asarray(paper, dtype=np.float64) - a).max(axis=2) / 140, 0, 1)  # насколько пиксель темнее бумаги
        ink[ink < 0.06] = 0
        rgba = np.dstack([np.broadcast_to(np.array(color, dtype=np.float64), a.shape), ink * 255]).astype(np.uint8)
        cut = Image.fromarray(rgba, 'RGBA')
        cut = cut.crop(cut.getbbox())
        for w in widths:
            h = round(cut.height * w / cut.width)
            cut.resize((w, h), Image.LANCZOS).save(OUT / f'{name}-{w}.webp', 'WEBP', quality=90, method=6)
        print(f'{name}: {cut.size} -> {widths}')

if __name__ == '__main__':
    main()
