"""Листы с текстом для малышей (2–7 лет) из проб владелицы: proba-<тема>.png — 3 страницы на одной картинке 3:2.
Режет страницы, расширяет до A4 через пустую середину (seam carving, предметы защищены маской),
увеличивает до 1588x2246 (2x листа 794x1123): половина Lanczos + половина Real-ESRGAN x4plus (если есть up/<имя>.png),
сохраняет в assets/kit/decor/<набор>/kids-1|2.webp; для «Большой истории» (лист 582x888) — kids-N-pro.webp 1164x1776:
готовый лист по высоте 1776, лишняя ширина убирается из пустой середины (seam carving). Поля текста для каждого листа — KIDS в book.html (подобраны вручную).
Запуск: python scripts/kids_pages.py  (pip install seam-carving scipy; Real-ESRGAN: realesrgan-ncnn-vulkan -n realesrgan-x4plus wide/X.png -o up/X.png)
"""
import sys, numpy as np, seam_carving
from PIL import Image
SRC = r"C:/Users/Asus/Desktop/svoya-skazka-primery/dlya-chatgpt/oformlenie-malyshi/"
def pages(theme):
    a = np.asarray(Image.open(SRC + f"proba-{theme}.png").convert("RGB"))
    g = a.astype(int).mean(2); col = g.std(0)
    low = col < 6
    seps=[];st=None
    for i,v in enumerate(list(low)+[False]):
        if v and st is None: st=i
        if not v and st is not None:
            if i-st>=3 or st==0 or i==len(low): seps.append((st,i))
            st=None
    if not seps or seps[0][0]>0: seps.insert(0,(0,0))
    if seps[-1][1]<len(low): seps.append((len(low),len(low)))
    runs=[(seps[k][1],seps[k+1][0]) for k in range(len(seps)-1) if seps[k+1][0]-seps[k][1]>300]
    out=[]
    for x0,x1 in runs:
        sub = g[:, x0:x1]; row = sub.std(1); rows = np.where(row>=6)[0]
        y0,y1 = rows[0], rows[-1]+1
        out.append(a[y0+4:y1-4, x0+4:x1-4])
    return out
def objmask(img):
    from scipy.ndimage import binary_dilation, binary_opening
    f = img.astype(int); h,w,_=f.shape
    paper = np.median(f[h//3:2*h//3, w//3:2*w//3].reshape(-1,3), 0)
    d = np.abs(f - paper).sum(2) > 45
    d = binary_opening(d, iterations=1)
    return binary_dilation(d, iterations=3)
def widen(img, ratio=794/1123):
    h,w,_ = img.shape; target = round(h*ratio)
    cur = img
    while cur.shape[1] < target:
        step = min(target - cur.shape[1], int(cur.shape[1]*0.18))
        cur = seam_carving.resize(cur, (cur.shape[1]+step, h), energy_mode='forward', order='width-first', keep_mask=objmask(cur))
    return cur

PICK = {'tajny':(1,3),'more':(1,3),'poxod':(1,2),'korolevstvo':(1,3),'les':(1,2),'podvodnoe':(1,3),'novyj-god':(1,3),'den-rozhdeniya':(1,3)}
DST = "assets/kit/decor/"
if __name__ == "__main__":
    import os
    W, H = 1588, 2246
    os.makedirs("wide", exist_ok=True)
    for t, ids in PICK.items():
        p = pages(t)
        for n, i in enumerate(ids, 1):
            name = f"{t}-{n}"
            Image.fromarray(widen(p[i - 1])).save(f"wide/{name}.png")
            a = Image.open(f"wide/{name}.png").convert("RGB").resize((W, H), Image.LANCZOS)
            if os.path.exists(f"up/{name}.png"):
                a = Image.blend(a, Image.open(f"up/{name}.png").convert("RGB").resize((W, H), Image.LANCZOS), 0.5)
            a.save(f"{DST}{t}/kids-{n}.webp", quality=84, method=6)
            print(name)

    # «Большая история»: сужаем готовые листы под 582x888
    import seam_carving as sc
    PW, PH = 1164, 1776
    for t, ids in PICK.items():
        for n in (1, 2):
            a = Image.open(f"{DST}{t}/kids-{n}.webp").convert("RGB")
            a = np.asarray(a.resize((round(a.width * PH / a.height), PH), Image.LANCZOS))
            out = sc.resize(a, (PW, PH), energy_mode='forward', order='width-first', keep_mask=objmask(a))
            Image.fromarray(out).save(f"{DST}{t}/kids-{n}-pro.webp", quality=84, method=6)
            print(t, n, "pro")
