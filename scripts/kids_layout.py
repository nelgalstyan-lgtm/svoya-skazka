"""Поля текста на листах малышей (KIDS в book.html и js/book-engine.js): подбор и проверка по рисунку.
Маска рисунка (крупные пятна, отличные от бумаги) с запасом ~2%; поле [сверху, справа, снизу, слева] + вырезы в углах
(tl/tr/bl/br) растут, пока не задевают рисунок; не ближе 6% к краю листа, строки не уже 38% листа.
Запуск: python scripts/kids_layout.py           — подбор для «Сказки» (стартует с таблицы KIDS в book.html) → tuned.json
        python scripts/kids_layout.py -pro      — для «Большой истории» (kids-N-pro.webp, стартует с tuned.json) → tuned-pro.json
Таблицы в код переносятся вручную (формат как в KIDS).
"""
import json, subprocess, sys, numpy as np
SUF = sys.argv[1] if len(sys.argv) > 1 else ''
from PIL import Image
from scipy.ndimage import binary_opening, binary_dilation, label
src = open(r'book.html', encoding='utf-8').read()
tbl = src[src.index('const KIDS = {') + len('const KIDS = '): src.index('};', src.index('const KIDS = {')) + 1]
K = json.load(open('tuned.json')) if SUF else json.loads(subprocess.check_output(['node', '-e', 'console.log(JSON.stringify(' + tbl + '))']))
W0, H0 = (200, 283) if not SUF else (200, 305)
X, Y = np.meshgrid((np.arange(W0) + .5) * 100 / W0, (np.arange(H0) + .5) * 100 / H0)
def mask(s, n):
    im = Image.open(f'assets/kit/decor/{s}/kids-{n}{SUF}.webp').convert('RGB').resize((397, 561 if not SUF else 606))
    a = np.asarray(im).astype(int); h, w, _ = a.shape
    paper = np.median(a[h//3:2*h//3, w//3:2*w//3].reshape(-1, 3), 0)
    d = binary_opening(np.abs(a - paper).sum(2) > 45, iterations=1)
    lab, _ = label(binary_dilation(d, iterations=1)); sz = np.bincount(lab.ravel()); big = sz >= 40; big[0] = False
    d = big[lab] & d
    d = binary_dilation(d, iterations=7)  # запас ≈1,8%
    return np.asarray(Image.fromarray(d.astype(np.uint8) * 255).resize((W0, H0))) > 0
CUTS = ['tl', 'tr', 'bl', 'br']
def unpack(p):
    t, r, b, l = p[:4]; cuts = {c: (p[4 + 2 * i], p[5 + 2 * i]) for i, c in enumerate(CUTS)}
    return t, r, b, l, cuts
def region(p):
    t, r, b, l, cuts = unpack(p)
    a = (Y >= t) & (Y <= 100 - b) & (X >= l) & (X <= 100 - r)
    for c, (cx, cy) in cuts.items():
        a &= ~(((X < cx) if c[1] == 'l' else (X > cx)) & ((Y < cy) if c[0] == 't' else (Y > cy)))
    return a
def score(p, d):
    a = region(p)
    rows = a.sum(1); narrow = ((rows > 0) & (rows < W0 * 0.38)).sum()
    t, r, b, l, cuts = unpack(p)
    bad = 10**9 if min(p[:4]) < 6 else 0  # не ближе 6% к краю листа (поля для печати)
    return a.sum() - 400 * (a & d).sum() - 300 * narrow - bad
out = {}
for s, pair in K.items():
    out[s] = []
    for n, k in enumerate(pair, 1):
        d = mask(s, n)
        t, r, b, l = [max(6, v) for v in k[:4]]; cuts = k[4] if len(k) > 4 else {}
        p = [t, r, b, l]
        for c in CUTS:
            if c in cuts: p += list(cuts[c])
            else: p += [l if c[1] == 'l' else 100 - r, t if c[0] == 't' else 100 - b]  # пустой вырез
        p = [float(v) for v in p]; best = score(p, d)
        for step in (4, 2, 1, 0.5):
            improved = True
            while improved:
                improved = False
                for i in range(len(p)):
                    for dv in (step, -step):
                        q = p[:]; q[i] += dv
                        sc = score(q, d)
                        if sc > best: p, best, improved = q, sc, True
        t, r, b, l, cuts = unpack(p)
        cd = {}
        for c, (cx, cy) in cuts.items():
            w = (cx - l) if c[1] == 'l' else (100 - r - cx); h = (cy - t) if c[0] == 't' else (100 - b - cy)
            if w > 0.5 and h > 0.5: cd[c] = [round(cx, 1), round(cy, 1)]
        res = [round(t, 1), round(r, 1), round(b, 1), round(l, 1), cd]
        out[s].append(res)
        print(f'{s}-{n}', res, 'hits', int((region(p) & d).sum()), 'area', round(region(p).mean() * 100))
json.dump(out, open('tuned' + SUF + '.json', 'w'))
