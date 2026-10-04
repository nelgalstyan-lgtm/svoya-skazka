"""Оформление подростков (11–16) для сказок — в стиле книги Алекса: полоса-гравюра у края листа и ряд значков с номером.

Из картинки владелицы (ChatGPT, 1536×1024: слева полоса во всю высоту, справа 8 значков-гравюр 2×4) делает
  assets/kit/decor/<набор>/teen-strip.webp  — полоса, как assets/kit/strip-map.png (205×1776, справа прозрачный запас)
  assets/kit/decor/<набор>/teen-icon-1..8.webp — отдельные значки (шапка страницы и разделитель главы в «Большой истории»)
  assets/kit/decor/<набор>/teen-footer.webp — ряд значков, как assets/kit/footer-treasure.png (1500×191: 4 значка,
                                              промежуток под номер на 47.7%, 4 значка, линия снизу)
Значки — одним цветом чернил #4a3323, прозрачность по тому, насколько штрих темнее бумаги вокруг.

  python scripts/teen_decor.py [папка с korolevstvo.png, les.png, podvodnoe.png]
"""
import os
import sys

import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage

SRC = sys.argv[1] if len(sys.argv) > 1 else os.path.expanduser('~/Desktop/svoya-skazka-primery/dlya-chatgpt/oformlenie-podrostki')
OUT = os.path.join(os.path.dirname(__file__), '..', 'assets', 'kit', 'decor')
SETS = ['korolevstvo', 'les', 'podvodnoe']
INK = (0x4a, 0x33, 0x23)
FW, FH, RULE = 1500, 191, (179, 184)  # как footer-treasure.png
LEFT, RIGHT = (10, 620), (810, 1490)   # промежуток под номер — центр 715 px = 47.7%
ICON_H, ICON_W = 150, 135


def strip(im, L):
    # граница полосы — тёмные столбцы в левой части картинки (верёвочная рамка)
    prof = L[:, :260].mean(0)
    dark = np.where(prof < prof[250] - 25)[0]
    x0, x1 = int(dark[0]) - 2, int(dark[-1]) + 3
    band = im.crop((x0, 0, x1, im.height)).convert('RGBA')
    w = round(im.height * 205 / 1776)  # пропорция strip-map.png; справа — прозрачный запас
    out = Image.new('RGBA', (w, im.height), (0, 0, 0, 0))
    out.paste(band, (0, 0))
    return out.resize((205, 1776), Image.LANCZOS), x1


def ink_alpha(L):
    # бумага вокруг: светлый фон без штрихов (максимум по окрестности, затем сглаживание)
    bg = ndimage.gaussian_filter(ndimage.maximum_filter(L, size=25), 12)
    a = (bg - L - 10) / 120.0
    return np.clip(a, 0, 1)


def icons(L, x_from):
    a = ink_alpha(L)
    a[:, :x_from + 30] = 0
    mask = ndimage.binary_dilation(a > 0.25, iterations=14)
    lab, n = ndimage.label(mask)
    boxes = ndimage.find_objects(lab)
    sizes = ndimage.sum(mask, lab, range(1, n + 1))
    big = sorted(range(n), key=lambda i: -sizes[i])[:8]
    found = [boxes[i] for i in big]
    # ряды сверху вниз, в ряду — слева направо
    found.sort(key=lambda b: ((b[0].start + b[0].stop) / 2 > L.shape[0] / 2, b[1].start))
    out = []
    for b in found:
        ys, xs = b
        crop = a[ys, xs]
        rgba = np.zeros(crop.shape + (4,), np.uint8)
        rgba[..., :3] = INK
        rgba[..., 3] = (crop * 255).astype(np.uint8)
        icon = Image.fromarray(rgba, 'RGBA')
        icon = icon.crop(icon.getbbox())
        out.append(icon)
    return out


def footer(items):
    out = Image.new('RGBA', (FW, FH), (0, 0, 0, 0))
    for side, group in ((LEFT, items[:4]), (RIGHT, items[4:])):
        slot = (side[1] - side[0]) / 4
        for k, icon in enumerate(group):
            s = min(ICON_H / icon.height, ICON_W / icon.width)
            ic = icon.resize((max(1, round(icon.width * s)), max(1, round(icon.height * s))), Image.LANCZOS)
            x = round(side[0] + slot * k + (slot - ic.width) / 2)
            y = round(RULE[0] - 14 - ic.height)  # стоят на линии с небольшим зазором
            out.alpha_composite(ic, (x, y))
    rule = Image.new('RGBA', (FW, RULE[1] - RULE[0]), INK + (230,))
    out.alpha_composite(rule, (0, RULE[0]))
    return out


for name in SETS:
    im = Image.open(os.path.join(SRC, name + '.png')).convert('RGB')
    L = np.asarray(im.convert('L'), dtype=float)
    st, edge = strip(im, L)
    items = icons(L, edge)
    assert len(items) == 8, (name, len(items))
    os.makedirs(os.path.join(OUT, name), exist_ok=True)
    st.save(os.path.join(OUT, name, 'teen-strip.webp'), quality=85, method=6)
    footer(items).save(os.path.join(OUT, name, 'teen-footer.webp'), quality=90, method=6)
    for k, icon in enumerate(items):
        s = 120 / icon.height
        icon.resize((max(1, round(icon.width * s)), 120), Image.LANCZOS).save(os.path.join(OUT, name, 'teen-icon-%d.webp' % (k + 1)), quality=90, method=6)
    print(name, 'ok')
