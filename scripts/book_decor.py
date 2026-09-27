"""Оформление книг в фирменном стиле: нарезка акварельных предметов из листов владелицы.

Исходники (рисует владелица в ChatGPT по dlya-chatgpt/oformlenie-knig/PROMPT.txt, в git не кладём — большие):
  nabor-<тема>.png     — лист из 8 предметов и 2 веточек на бумаге
  zastavka-<тема>.png  — заставка под название главы
Результат: assets/kit/decor/<тема>/item-N.webp (N по порядку на листе: слева направо, сверху вниз) и vignette.webp —
на прозрачном фоне: бумага убирается, чтобы предмет лежал на странице книги как напечатанный.

Запуск: python scripts/book_decor.py "C:/Users/Asus/Desktop/svoya-skazka-primery/dlya-chatgpt/oformlenie-knig"
"""
import glob
import os
import re
import sys

import cv2
import numpy as np
from PIL import Image

OUT = os.path.join(os.path.dirname(__file__), '..', 'assets', 'kit', 'decor')
ITEM_MAX = 240       # px по большей стороне: в книге значок 20–60 px, запас на печать и экраны с высокой плотностью
VIGNETTE_W = 900


def paper_color(rgb):
    """Цвет бумаги — медиана по краям листа."""
    edge = np.concatenate([rgb[:20].reshape(-1, 3), rgb[-20:].reshape(-1, 3), rgb[:, :20].reshape(-1, 3), rgb[:, -20:].reshape(-1, 3)])
    return np.median(edge, axis=0)


def to_rgba(rgb, paper):
    """Бумага → прозрачность: чем дальше цвет от бумаги, тем плотнее; цвет восстанавливается без примеси бумаги."""
    diff = rgb.astype(np.float32) - paper.astype(np.float32)
    dist = np.sqrt((diff ** 2).sum(axis=2))
    # тёмные штрихи и насыщенная краска — непрозрачные, лёгкие размывы — полупрозрачные; слабую текстуру бумаги отсекаем
    alpha = np.clip((dist - 10) / 55.0, 0, 1)
    a = alpha[..., None]
    color = np.where(a > 0.01, (rgb.astype(np.float32) - (1 - a) * paper) / np.maximum(a, 0.01), 0)
    color = np.clip(color, 0, 255)
    return np.dstack([color, alpha * 255]).astype(np.uint8)


def object_mask(rgb, paper):
    diff = np.sqrt(((rgb.astype(np.float32) - paper.astype(np.float32)) ** 2).sum(axis=2))
    mask = (diff > 22).astype(np.uint8)
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    return mask


def boxes(mask, join=28, min_area=1500):
    """Рамки отдельных предметов: части одного предмета (листики веточки) склеиваются расширением маски."""
    grown = cv2.dilate(mask, np.ones((join, join), np.uint8))
    n, labels, stats, _ = cv2.connectedComponentsWithStats(grown)
    out = []
    for i in range(1, n):
        x, y, w, h, area = stats[i]
        if area < min_area:
            continue
        sub = mask[y:y + h, x:x + w] * (labels[y:y + h, x:x + w] == i)
        ys, xs = np.nonzero(sub)
        if len(xs) < 200:
            continue
        out.append((x + xs.min(), y + ys.min(), x + xs.max() + 1, y + ys.max() + 1))
    # порядок чтения: строки (по центру по вертикали), в строке — слева направо
    out.sort(key=lambda b: (b[1] + b[3]) / 2)
    rows, row = [], []
    for b in out:
        if row and (b[1] + b[3]) / 2 - (row[-1][1] + row[-1][3]) / 2 > 120:
            rows.append(sorted(row, key=lambda r: r[0]))
            row = []
        row.append(b)
    if row:
        rows.append(sorted(row, key=lambda r: r[0]))
    return [b for r in rows for b in r]


def crop(rgba, box, pad=6):
    x0, y0, x1, y1 = box
    h, w = rgba.shape[:2]
    return rgba[max(0, y0 - pad):min(h, y1 + pad), max(0, x0 - pad):min(w, x1 + pad)]


def save(arr, path, max_side=None, width=None):
    im = Image.fromarray(arr, 'RGBA')
    if width:
        im = im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)
    elif max_side and max(im.size) > max_side:
        k = max_side / max(im.size)
        im = im.resize((round(im.width * k), round(im.height * k)), Image.LANCZOS)
    im.save(path, 'WEBP', quality=90, method=6)


def main(src):
    for path in sorted(glob.glob(os.path.join(src, 'nabor-*.png*')) + glob.glob(os.path.join(src, 'zastavka-*.png*'))):
        m = re.match(r'(nabor|zastavka)-(.+?)\.png', os.path.basename(path))
        kind, theme = m.group(1), m.group(2)
        rgb = np.array(Image.open(path).convert('RGB'))
        paper = paper_color(rgb)
        rgba = to_rgba(rgb, paper)
        mask = object_mask(rgb, paper)
        folder = os.path.join(OUT, theme)
        os.makedirs(folder, exist_ok=True)
        if kind == 'zastavka':
            # заставка — одна композиция: общая рамка всех её частей
            bs = boxes(mask, join=60)
            x0 = min(b[0] for b in bs); y0 = min(b[1] for b in bs); x1 = max(b[2] for b in bs); y1 = max(b[3] for b in bs)
            save(crop(rgba, (x0, y0, x1, y1), 10), os.path.join(folder, 'vignette.webp'), width=VIGNETTE_W)
            print(f'{theme}: заставка {x1 - x0}x{y1 - y0}')
        else:
            bs = boxes(mask)
            for i, b in enumerate(bs, 1):
                save(crop(rgba, b), os.path.join(folder, f'item-{i}.webp'), max_side=ITEM_MAX)
            print(f'{theme}: {len(bs)} предметов')


def hare():
    """Героёнок машет на странице «Конец» — из листа эмоций (как pose-greeting на сайте), но с прозрачным фоном:
    на сайте белый фон убирает mix-blend-mode, а в PDF книги (html2canvas) он не работает."""
    src = os.path.join(os.path.dirname(__file__), '..', 'docs', 'brand', 'emotions-actions.png')
    rgb = np.array(Image.open(src).convert('RGB').crop((877, 807, 1065, 1082)))
    save(to_rgba(rgb, paper_color(rgb)), os.path.join(OUT, 'hare-greeting.webp'))
    print('hare-greeting')


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else '.')
    hare()
