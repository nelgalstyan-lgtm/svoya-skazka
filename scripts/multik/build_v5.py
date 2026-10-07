# Сборка мультика Алекса v5 (1080p, цвет, заставка поверх кадра, титры поверх финала, логотип):
# v3: обрезка пауз, переходы, титры, кадры из клипов на вставках рассказчика, музыка (Kevin MacLeod, CC BY 4.0).
import subprocess, os
from PIL import Image, ImageDraw, ImageFont, ImageFilter

FF = r"C:/Users/Asus/AppData/Local/Packages/PythonSoftwareFoundation.Python.3.13_qbz5n2kfra8p0/LocalCache/local-packages/Python313/site-packages/imageio_ffmpeg/binaries/ffmpeg-win-x86_64-v7.1.exe"
S = 'C:/Users/Asus/AppData/Local/Temp/claude/C--Users-Asus/b2402df8-8bef-4b20-bd63-3da85569eeb5/scratchpad/'
K = 'C:/Users/Asus/Desktop/multik-alex/klipy/'
B = 'C:/Users/Asus/svoya-skazka/assets/brand/'
OUT = 'C:/Users/Asus/Desktop/multik-alex/Alex_multik_v5.mp4'
M = S + 'm5/'
os.makedirs(M, exist_ok=True)
W, H = 1920, 1080
# цвет: собор (09) снят днём при голубом небе — греем под закат, как остальной мультик
GRADE = {'09': 'colortemperature=temperature=4300:mix=0.75,eq=saturation=0.95:gamma=0.97'}
UP = 'scale=1920:1080:flags=lanczos,unsharp=5:5:0.5:5:5:0'
CROP_WIDE = 'crop=1024:576:128:72'   # полосы появляются на части кадров (10, 12, 13) — режем весь клип одинаково
CROP_07 = 'crop=1138:640:71:68'

def run(args):
    r = subprocess.run([FF, '-loglevel', 'error', '-y'] + args, capture_output=True, text=True)
    if r.returncode: raise SystemExit(r.stderr)

def dur(f):
    r = subprocess.run([FF, '-i', f], capture_output=True, text=True).stderr
    h, m, s = r.split('Duration: ')[1].split(',')[0].split(':')
    return float(h) * 3600 + float(m) * 60 + float(s)

def font(name, size, var=None):
    f = ImageFont.truetype(S + 'fonts/' + name, size)
    if var: f.set_variation_by_name(var)
    return f

def frame(clip, t):
    p = M + f'fr-{clip}-{t}.png'
    vf = ([CROP_WIDE] if clip in ('10', '12', '13') else [CROP_07] if clip == '07' else []) + ([GRADE[clip]] if clip in GRADE else []) + [UP]
    run(['-ss', str(t), '-i', K + f'klip-{clip}.mp4', '-frames:v', '1', '-vf', ','.join(vf), p])
    return Image.open(p).convert('RGB')

def caption(img, text, scale=1.0, top=False):
    d = ImageDraw.Draw(img)
    f = font('Caveat.ttf', int(58 * scale), b'Bold')
    w = d.textlength(text, font=f)
    x, y = (img.width - w) / 2, (int(40 * scale) if top else img.height - int(110 * scale))
    d.rounded_rectangle((x - 30 * scale, y - 8 * scale, x + w + 30 * scale, y + 72 * scale), int(22 * scale), fill=(30, 18, 10))
    d.text((x, y), text, font=f, fill=(240, 205, 140))

def still_full(im, out, cap=None, top=False):
    im = im.resize((1920, 1080))
    if cap: caption(im, cap, 1.5, top)
    im.save(out)

def still_triple(ims, out, cap):
    bg = ims[1].resize((1920, 1080)).filter(ImageFilter.GaussianBlur(40))
    bg = Image.blend(bg, Image.new('RGB', bg.size, (25, 15, 8)), 0.4)
    pw, ph = 560, 760
    x = (1920 - 3 * pw - 2 * 40) // 2
    for im in ims:
        r = ph / im.height
        p = im.resize((int(im.width * r), ph)); l = (p.width - pw) // 2
        p = p.crop((l, 0, l + pw, ph))
        fr = Image.new('RGB', (pw + 14, ph + 14), (201, 154, 75)); fr.paste(p, (7, 7))
        bg.paste(fr, (x, 60)); x += pw + 40
    caption(bg, cap, 1.5)
    bg.save(out)

# ---------- картинки для вставок
still_full(frame('05', 3), M + 's1.png')
still_full(frame('06', 1), M + 's2.png', 'Дорога в Ани · через Грузию и Карс')
still_triple([frame('08', 6), frame('09', 1), frame('10', 6.5)], M + 's3.png', 'Лев · Крест · Розетка')
still_full(frame('11', 5.9), M + 's4.png')
still_full(frame('15', 7.5), M + 's5.png', 'Ани', top=True)

# заставка: название поверх живого кадра (широкий план Ани из клипа 15, замедленный)
def gradient(img, side):
    g = Image.new('L', (W, H), 0); d = ImageDraw.Draw(g)
    for x in range(W):
        v = int(200 * max(0, 1 - x / (W * 0.62))) if side == 'left' else 0
        d.line([(x, 0), (x, H)], fill=v)
    sh = Image.new('RGBA', (W, H), (18, 10, 4, 0)); sh.putalpha(g)
    img.alpha_composite(sh)
def text_c(d, y, text, f, fill, x0=0, x1=W):
    d.text((x0 + (x1 - x0 - d.textlength(text, font=f)) / 2, y), text, font=f, fill=fill)
t = Image.new('RGBA', (W, H), (0, 0, 0, 0)); gradient(t, 'left'); d = ImageDraw.Draw(t)
L, R = 90, 1100
text_c(d, 200, 'Алекс', font('Lora.ttf', 150, b'Bold'), (252, 240, 218), L, R)
text_c(d, 380, 'и тайна Ани', font('Lora.ttf', 112, b'SemiBold'), (252, 240, 218), L, R)
text_c(d, 540, 'мультфильм по книге', font('Caveat.ttf', 78, b'Bold'), (240, 200, 130), L, R)
text_c(d, 635, 'в главной роли — Алекс', font('Caveat.ttf', 60, b'Bold'), (252, 240, 218), L, R)
t.save(M + 'title-over.png')

# финальный кадр (машина на дороге на закате) — фон для титров и концовки
base = frame('18', 7.9)
def dark(img, k):
    return Image.blend(img, Image.new('RGB', img.size, (14, 8, 3)), k)
cr = dark(base, 0.55).convert('RGBA'); d = ImageDraw.Draw(cr)
text_c(d, 120, 'В ролях', font('Lora.ttf', 76, b'Bold'), (252, 240, 218))
y = 250
for a_, b_ in [('Алекс', 'в роли самого себя'), ('Макс', 'его младший брат'), ('Мама', 'самая терпеливая мама на свете')]:
    text_c(d, y, f'{a_} — {b_}', font('Caveat.ttf', 70, b'Bold'), (240, 200, 130)); y += 95
text_c(d, 570, 'по книге «Алекс и тайна Ани» · Героёнок', font('Lora.ttf', 44, b'SemiBold'), (252, 240, 218))
sm = font('Lora.ttf', 30)
text_c(d, 760, 'Музыка: «Teller of the Tales», «Comfortable Mystery 4», «Heartwarming» — Kevin MacLeod (incompetech.com)', sm, (230, 215, 190))
text_c(d, 805, 'Licensed under Creative Commons: By Attribution 4.0 — https://creativecommons.org/licenses/by/4.0/', sm, (230, 215, 190))
cr.convert('RGB').save(M + 'credits.png')
en = dark(base, 0.62).convert('RGBA'); d = ImageDraw.Draw(en)
logo = Image.open(B + 'logo-wordmark-light-440.webp').convert('RGBA')
logo = logo.resize((880, int(880 * logo.height / logo.width)), Image.LANCZOS)
en.alpha_composite(logo, ((W - logo.width) // 2, 300))
text_c(d, 560, 'книги и мультфильмы, где главный герой — ваш ребёнок', font('Caveat.ttf', 72, b'Bold'), (240, 200, 130))
text_c(d, 690, 'geroenok.online', font('Lora.ttf', 64, b'SemiBold'), (252, 240, 218))
en.convert('RGB').save(M + 'end.png')

# ---------- сегменты (видео ровно N кадров, звук PCM ровно N/24 с)
ENC = ['-c:v', 'libx264', '-preset', 'medium', '-crf', '16', '-pix_fmt', 'yuv420p', '-c:a', 'pcm_s16le', '-ar', '48000', '-ac', '2']
segs = []

def VT(d, fi=0, fo=0):
    v = f'fps=24,format=yuv420p,tpad=stop_mode=clone:stop_duration=2,trim=duration={d},setpts=PTS-STARTPTS'
    if fi: v += f',fade=t=in:st=0:d={fi}'
    if fo: v += f',fade=t=out:st={d - fo}:d={fo}'
    return v

def AT(d):
    return f'aresample=48000,apad,atrim=duration={d},asetpts=PTS-STARTPTS'

def q(d): return round(round(d * 24) / 24, 4)

def clip(name, ss, to, crop='', fi=0, fo=0):
    d = q(to - ss); out = M + f'seg{len(segs):02d}.mkv'
    v = (crop + ',' if crop else '') + (GRADE[name] + ',' if name in GRADE else '') + UP + ',' + VT(d, fi, fo)
    a = f'loudnorm=I=-18:TP=-1.5:LRA=11,afade=t=in:st=0:d=0.15,afade=t=out:st={d - 0.2}:d=0.2,' + AT(d)
    run(['-ss', str(ss), '-i', K + f'klip-{name}.mp4', '-filter_complex', f'[0:v]{v}[v];[0:a]{a}[a]', '-map', '[v]', '-map', '[a]'] + ENC + [out])
    segs.append((out, d, name))

def still(png, mp3, kind='still'):
    d = q(dur(mp3) + 0.9); n = round(d * 24); out = M + f'seg{len(segs):02d}.mkv'
    v = f"scale=2880:1620,zoompan=z='1+0.06*on/{n}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d={n}:s=1920x1080:fps=24," + VT(d, 0.4, 0.4)
    a = 'loudnorm=I=-17:TP=-1.5,adelay=400|400,' + AT(d)
    run(['-i', png, '-i', mp3, '-filter_complex', f'[0:v]{v}[v];[1:a]{a}[a]', '-map', '[v]', '-map', '[a]'] + ENC + [out])
    segs.append((out, d, kind))

def card(png, d):
    d = q(d); out = M + f'seg{len(segs):02d}.mkv'
    run(['-loop', '1', '-i', png, '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo', '-filter_complex',
         f'[0:v]scale=1920:1080,{VT(d, 0.6, 0.6)}[v];[1:a]{AT(d)}[a]', '-map', '[v]', '-map', '[a]'] + ENC + [out])
    segs.append((out, d, 'card'))

def title_over(clip_name, ss, to, png, slow=1.5):
    d = q((to - ss) * slow); out = M + f'seg{len(segs):02d}.mkv'
    v = f'[0:v]setpts={slow}*PTS,' + UP + ',' + VT(d, 0.5, 0.6) + '[bg];[1:v]format=rgba,fade=t=in:st=0.6:d=0.8:alpha=1[t];[bg][t]overlay=0:0,format=yuv420p[v]'
    run(['-ss', str(ss), '-t', str(to - ss), '-i', K + f'klip-{clip_name}.mp4', '-loop', '1', '-t', str(d), '-i', png, '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo',
         '-filter_complex', v + f';[2:a]{AT(d)}[a]', '-map', '[v]', '-map', '[a]'] + ENC + [out])
    segs.append((out, d, 'title'))

N = S + 'narr/'
still(M + 's1.png', N + 'n1.mp3')
title_over('15', 6.3, 8.0, M + 'title-over.png', slow=2.2)
clip('01', 0.8, 7.3)
clip('02-golos', 1.8, 6.0)
clip('02', 0.0, 5.0, fo=0.3)
clip('03', 0.7, 6.2, fi=0.3)
clip('04', 0.4, 8.0)
clip('05', 1.0, 8.0)
still(M + 's2.png', N + 'n2.mp3')
clip('06', 0.0, 8.0)
clip('07', 0.3, 7.3, CROP_07)
clip('08', 0.0, 8.0)
clip('09', 0.0, 7.0)
clip('10', 0.0, 6.6, CROP_WIDE)
mystery_from = len(segs)
still(M + 's3.png', N + 'n3.mp3')
clip('11', 0.0, 6.0)
still(M + 's4.png', N + 'n4.mp3')
clip('12', 0.0, 6.4, CROP_WIDE)
warm_from = len(segs)
clip('13', 0.0, 7.0, CROP_WIDE)
clip('14', 0.0, 8.0)
still(M + 's5.png', N + 'n5.mp3')
clip('15', 0.6, 8.0, fo=0.4)
clip('16', 0.0, 7.6, fi=0.4)
clip('17', 0.5, 7.4)
clip('18', 0.0, 8.0, fo=0.6)
card(M + 'credits.png', 7.0)
still(M + 'end.png', N + 'n6.mp3')

# ---------- склейка: видео + «голоса»
open(M + 'list.txt', 'w').write(''.join(f"file '{s[0]}'\n" for s in segs))
run(['-f', 'concat', '-safe', '0', '-i', M + 'list.txt', '-c:v', 'copy', '-c:a', 'pcm_s16le', M + 'joined.mkv'])
starts = []; t = 0
for s in segs: starts.append(t); t += s[1]
total = t
t1, t2 = starts[mystery_from], starts[warm_from]
print('total', round(total, 2), 'mystery at', round(t1, 2), 'warm at', round(t2, 2))

# ---------- музыка: три темы с переходами 2 с, тише под голосами (sidechain)
MU = S + 'music/'
X = 2.0
fc = (
    f"[1:a]aresample=48000,loudnorm=I=-26,atrim=0:{t1 + X},afade=t=in:d=1.5,afade=t=out:st={t1}:d={X}[m1];"
    f"[2:a]aresample=48000,loudnorm=I=-27,atrim=0:{t2 - t1 + X},afade=t=in:d={X},afade=t=out:st={t2 - t1}:d={X},adelay={int(t1 * 1000)}|{int(t1 * 1000)}[m2];"
    f"[3:a]aresample=48000,loudnorm=I=-26,atrim=0:{total - t2 + X},afade=t=in:d={X},afade=t=out:st={total - t2 - 3}:d=3,adelay={int(t2 * 1000)}|{int(t2 * 1000)}[m3];"
    f"[m1][m2][m3]amix=inputs=3:normalize=0,atrim=0:{total}[mus];"
    f"[0:a]asplit=2[dlg][key];"
    f"[mus][key]sidechaincompress=threshold=0.015:ratio=6:attack=30:release=500[duck];"
    f"[dlg][duck]amix=inputs=2:normalize=0,alimiter=limit=0.95[aout]"
)
run(['-i', M + 'joined.mkv', '-i', MU + 'Teller of the Tales.mp3', '-i', MU + 'Comfortable Mystery 4.mp3', '-i', MU + 'Heartwarming.mp3',
     '-filter_complex', fc, '-map', '0:v', '-map', '[aout]', '-c:v', 'libx264', '-preset', 'medium', '-crf', '18',
     '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', '-t', str(total), OUT])
print('done', OUT)
