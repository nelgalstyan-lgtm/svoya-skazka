# Раскраска из Gemini → в стиле первой: тонкие чёткие линии без утолщения, мягкий край (сглаживание), белый фон.
#   python ink2.py SRC OUT [чёрная точка] [белая точка]
import sys
from PIL import Image, ImageFilter, ImageOps

src, out = sys.argv[1], sys.argv[2]
lo = int(sys.argv[3]) if len(sys.argv) > 3 else 90    # темнее — чисто чёрный
hi = int(sys.argv[4]) if len(sys.argv) > 4 else 200   # светлее — чисто белый (уходит серый карандаш и шум)

g = ImageOps.grayscale(Image.open(src))
g = ImageOps.fit(g, (1024, 1536), Image.LANCZOS)
g = g.filter(ImageFilter.MedianFilter(3))             # убирает зерно JPEG
g = g.point(lambda v: 0 if v <= lo else 255 if v >= hi else round((v - lo) * 255 / (hi - lo)))
g.convert('RGB').save(out)


def ink(path):
    im = ImageOps.grayscale(Image.open(path))
    px = im.getdata()
    return sum(1 for v in px if v < 128) / len(px) * 100

print(f'{out}: чёрного {ink(out):.1f}%')
