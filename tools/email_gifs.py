"""Genera las imagenes de los correos de SpentShare (identidad morado + lima).

Salida (en /email, servido por GitHub Pages en spentshare.com/email/):
  pago.gif  / pago.png   -> recibo de deuda pagada (check lima + confeti)
  cobro.gif / cobro.png  -> factura de cobro (hoja que sube + moneda lima)
  gasto.gif / gasto.png  -> gasto compartido (dona que se reparte, tu parte salta)
  invita.gif / invita.png -> invitación a un grupo (avatares + tú te unes)
  logo.png               -> el logo de la app (Gmail no muestra SVG)

Los .png de pago/cobro son el ultimo cuadro: Outlook de Windows no anima GIFs,
asi que el correo le muestra el PNG con un comentario condicional <!--[if mso]>.

Uso:  python tools/email_gifs.py
"""
import math
import os
import random

from PIL import Image, ImageDraw, ImageFont

OUT = 240            # tamano del GIF (se muestra a 120 px -> nitido en retina)
SS = 4               # supermuestreo para bordes suaves
S = OUT * SS
FRAME_MS = 40

# Identidad nueva (spentshare-ui.html)
PURPLE = (0x69, 0x41, 0xF5)
DEEP = (0x4C, 0x24, 0xCE)
LAVENDER = (0xEA, 0xE3, 0xFF)
LIME = (0xD9, 0xF7, 0x6B)
LIME_HI = (0xEA, 0xFB, 0xA6)
INK = (0x25, 0x21, 0x34)
PINK = (0xF8, 0xDA, 0xE8)
PEACH = (0xFF, 0xE4, 0xC4)
WHITE = (0xFF, 0xFF, 0xFF)
BG = PURPLE                      # mismo fondo que el bloque morado del correo

HERE = os.path.dirname(os.path.abspath(__file__))
DEST = os.path.join(os.path.dirname(HERE), 'email')
FONT_BOLD = r'C:\Windows\Fonts\segoeuib.ttf'


def clamp(x, a=0.0, b=1.0):
    return max(a, min(b, x))


def prog(t, start, dur):
    return clamp((t - start) / dur)


def ease_out_cubic(p):
    return 1 - (1 - p) ** 3


def ease_out_back(p, s=1.9):
    p -= 1
    return p * p * ((s + 1) * p + s) + 1


def mix(c, a, bg=BG):
    """Color c con opacidad a sobre el fondo (los elementos casi no se tapan)."""
    return tuple(round(bg[i] * (1 - a) + c[i] * a) for i in range(3))


def u(v):
    """Unidades de salida (240) -> lienzo supermuestreado."""
    return v * SS


def circle(d, cx, cy, r, fill=None, outline=None, width=0):
    d.ellipse([u(cx - r), u(cy - r), u(cx + r), u(cy + r)], fill=fill,
              outline=outline, width=round(u(width)) if width else 0)


def thick_polyline(d, pts, w, color):
    for (x1, y1), (x2, y2) in zip(pts, pts[1:]):
        d.line([u(x1), u(y1), u(x2), u(y2)], fill=color, width=round(u(w)))
    for x, y in pts:
        circle(d, x, y, w / 2, fill=color)


def partial_path(pts, p):
    """Primeros p (0..1) del largo total de la polilinea."""
    segs = list(zip(pts, pts[1:]))
    lens = [math.dist(a, b) for a, b in segs]
    want = sum(lens) * p
    out = [pts[0]]
    for (a, b), L in zip(segs, lens):
        if want >= L:
            out.append(b)
            want -= L
        else:
            k = want / L if L else 0
            out.append((a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k))
            break
    return out


def finish(img):
    return img.resize((OUT, OUT), Image.LANCZOS)


def save(frames, name):
    os.makedirs(DEST, exist_ok=True)
    # Paleta comun para todos los cuadros: asi el GIF solo guarda lo que cambia
    sample = Image.new('RGB', (OUT * 4, OUT))
    for i, f in enumerate([frames[len(frames) // 4], frames[len(frames) // 2],
                           frames[3 * len(frames) // 4], frames[-1]]):
        sample.paste(f, (i * OUT, 0))
    pal = sample.quantize(colors=96, method=Image.Quantize.MEDIANCUT)
    # El fondo tiene que quedar EXACTO o se ve un recuadro en el correo
    # (Pillow busca el color con precision reducida y puede caer en un tono
    # vecino, asi que todo tono casi igual al fondo se vuelve el fondo)
    colors = pal.getpalette()
    for i in range(len(colors) // 3):
        if sum(abs(colors[i * 3 + k] - BG[k]) for k in range(3)) <= 12:
            colors[i * 3:i * 3 + 3] = list(BG)
    pal.putpalette(colors)
    q = [f.quantize(palette=pal, dither=Image.Dither.NONE) for f in frames]
    durations = [FRAME_MS] * (len(q) - 1) + [2000]
    gif = os.path.join(DEST, name + '.gif')
    # sin "loop": se reproduce una sola vez y se queda en el ultimo cuadro
    q[0].save(gif, save_all=True, append_images=q[1:], duration=durations,
              optimize=True, disposal=1)
    frames[-1].save(os.path.join(DEST, name + '.png'), optimize=True)
    print(f'{name}.gif  {len(frames)} cuadros  {os.path.getsize(gif) // 1024} KB')


# ─────────────────────────────────────────────────────────────
# Pago: circulo lima que rebota, check que se dibuja, onda y confeti
# ─────────────────────────────────────────────────────────────
def pago():
    rnd = random.Random(7)
    cx = cy = 120
    R = 54
    colors = [WHITE, LIME, LAVENDER, PINK, PEACH, LIME, WHITE]
    bits = []
    for i in range(16):
        ang = (i / 16) * math.tau + rnd.uniform(-0.15, 0.15)
        bits.append(dict(
            ang=ang, dist=rnd.uniform(1.55, 1.95), size=rnd.uniform(4.0, 6.5),
            color=colors[i % len(colors)], shape=i % 3, spin=rnd.uniform(-4, 4),
            delay=rnd.uniform(0, 0.08)))
    check = [(-0.40 * R, 0.02 * R), (-0.11 * R, 0.30 * R), (0.42 * R, -0.27 * R)]

    frames = []
    n = 52
    for f in range(n):
        t = f * FRAME_MS / 1000
        img = Image.new('RGB', (S, S), BG)
        d = ImageDraw.Draw(img)

        # onda expansiva
        p = prog(t, 0.30, 0.75)
        if 0 < p < 1:
            rr = R * (1 + 0.62 * ease_out_cubic(p))
            circle(d, cx, cy, rr, outline=mix(WHITE, (1 - p) * 0.55), width=3)

        # confeti
        for b in bits:
            p = prog(t, 0.36 + b['delay'], 0.95)
            if 0 < p < 1:
                e = ease_out_cubic(p)
                dist = R * (0.9 + (b['dist'] - 0.9) * e)
                x = cx + math.cos(b['ang']) * dist
                y = cy + math.sin(b['ang']) * dist + 14 * p * p
                a = 1 if p < 0.55 else 1 - (p - 0.55) / 0.45
                col = mix(b['color'], a)
                s = b['size'] * (1 - 0.3 * p)
                if b['shape'] == 0:
                    circle(d, x, y, s / 2, fill=col)
                else:
                    rot = b['ang'] + b['spin'] * p
                    lx = math.cos(rot) * s * (0.9 if b['shape'] == 1 else 1.3)
                    ly = math.sin(rot) * s * (0.9 if b['shape'] == 1 else 1.3)
                    w = s * (0.55 if b['shape'] == 1 else 0.38)
                    thick_polyline(d, [(x - lx / 2, y - ly / 2), (x + lx / 2, y + ly / 2)], w, col)

        # circulo
        p = prog(t, 0.04, 0.42)
        if p > 0:
            r = R * ease_out_back(p)
            circle(d, cx, cy, r + 8, fill=mix(LIME, 0.2))     # halo suave
            circle(d, cx, cy, r, fill=LIME)

        # check
        p = prog(t, 0.34, 0.40)
        if p > 0:
            pts = [(cx + x, cy + y) for x, y in check]
            thick_polyline(d, partial_path(pts, ease_out_cubic(p)), R * 0.17, INK)

        frames.append(finish(img))
    save(frames, 'pago')


# ─────────────────────────────────────────────────────────────
# Cobro: hoja que sube, renglones que se escriben, moneda lima que salta
# ─────────────────────────────────────────────────────────────
def gradient_coin(size, c1, c2):
    g = Image.new('RGB', (size, size))
    px = g.load()
    for y in range(size):
        for x in range(size):
            k = clamp((x + y) / (2 * size))
            px[x, y] = tuple(round(c1[i] + (c2[i] - c1[i]) * k) for i in range(3))
    mask = Image.new('L', (size, size), 0)
    ImageDraw.Draw(mask).ellipse([0, 0, size - 1, size - 1], fill=255)
    return g, mask


def cobro():
    coin_r = 25
    frames = []
    n = 56
    for f in range(n):
        t = f * FRAME_MS / 1000
        img = Image.new('RGB', (S, S), BG)
        d = ImageDraw.Draw(img)

        # hoja
        p = prog(t, 0.0, 0.5)
        if p > 0:
            e = ease_out_cubic(p)
            dy = (1 - e) * 60
            a = clamp(p * 4)
            x0, y0, x1, y1 = 60, 50 + dy, 172, 196 + dy
            d.rounded_rectangle([u(x0), u(y0), u(x1), u(y1)], radius=u(14), fill=mix(WHITE, a))

            def bar(x, y, w, h, col, start, dur):
                q = prog(t, start, dur)
                if q > 0:
                    ww = w * ease_out_cubic(q)
                    d.rounded_rectangle([u(x), u(y + dy), u(x + ww), u(y + dy + h)],
                                        radius=u(h / 2), fill=col)

            bar(74, 68, 34, 8, PURPLE, 0.32, 0.22)                    # titulo
            bar(74, 82, 22, 4, (0xDD, 0xD6, 0xEE), 0.38, 0.18)        # numero
            for i, y in enumerate([102, 118, 134]):                    # conceptos
                bar(74, y, 48, 5, (0xE5, 0xDE, 0xF9), 0.46 + i * 0.1, 0.22)
                bar(140, y, 18, 5, (0xC9, 0xBE, 0xEA), 0.54 + i * 0.1, 0.16)
            q = prog(t, 0.78, 0.12)                                    # linea punteada
            if q > 0:
                for k in range(int(12 * q)):
                    xx = 74 + k * 7.2
                    d.rounded_rectangle([u(xx), u(152 + dy), u(xx + 4), u(153.6 + dy)],
                                        radius=u(0.8), fill=(0xCF, 0xC3, 0xE7))
            bar(74, 166, 28, 8, INK, 0.86, 0.18)                       # TOTAL
            bar(128, 166, 30, 8, PURPLE, 0.92, 0.2)                    # monto

        # moneda
        p = prog(t, 1.02, 0.42)
        if p > 0:
            ccx, ccy = 170, 58
            q = prog(t, 1.25, 0.6)
            if 0 < q < 1:
                circle(d, ccx, ccy, coin_r * (1 + 0.7 * ease_out_cubic(q)),
                       outline=mix(WHITE, (1 - q) * 0.55), width=2.5)
            r = coin_r * ease_out_back(p, 2.2)
            if r > 1:
                circle(d, ccx, ccy, r + 4, fill=BG)                   # separa de la hoja
                size = max(2, round(u(2 * r)))
                g, m = gradient_coin(size, LIME_HI, LIME)
                img.paste(g, (round(u(ccx) - size / 2), round(u(ccy) - size / 2)), m)
                fs = max(4, round(u(34) * r / coin_r))
                fnt = ImageFont.truetype(FONT_BOLD, fs)
                d.text((u(ccx), u(ccy) + fs * 0.04), '$', font=fnt, fill=INK, anchor='mm')

        # destellos
        for sx, sy, st in [(206, 30, 1.32), (212, 92, 1.42), (136, 28, 1.5)]:
            q = prog(t, st, 0.5)
            if 0 < q < 1:
                k = math.sin(q * math.pi)
                L = 7 * k
                col = mix(LIME, k)
                thick_polyline(d, [(sx - L, sy), (sx + L, sy)], 2.2, col)
                thick_polyline(d, [(sx, sy - L), (sx, sy + L)], 2.2, col)

        frames.append(finish(img))
    save(frames, 'cobro')


# ─────────────────────────────────────────────────────────────
# Gasto compartido: dona que se reparte en partes; la tuya (lima) salta
# (como la dona de Estadísticas del diseño, con puntas planas)
# ─────────────────────────────────────────────────────────────
def gasto():
    cx = cy = 120
    R_OUT, W = 70, 24
    TRACK = (0x7C, 0x59, 0xF6)
    GAP = 7
    segs = [  # (color, inicio, fin) en grados; 0 = las 3, sentido horario, -90 = arriba
        (LIME, -90 + GAP / 2, 30 - GAP / 2),
        (LAVENDER, 30 + GAP / 2, 150 - GAP / 2),
        (PINK, 150 + GAP / 2, 270 - GAP / 2),
    ]
    mid = math.radians(-30)

    frames = []
    n = 52
    for f in range(n):
        t = f * FRAME_MS / 1000
        img = Image.new('RGB', (S, S), BG)
        d = ImageDraw.Draw(img)

        def ring(color, a0, a1, r_out=R_OUT, w=W, dx=0, dy=0):
            if a1 - a0 < 0.5:
                return
            box = [u(cx + dx - r_out), u(cy + dy - r_out), u(cx + dx + r_out), u(cy + dy + r_out)]
            d.arc(box, a0, a1, fill=color, width=round(u(w)))

        # pista
        p = prog(t, 0.0, 0.25)
        if p > 0:
            ring(mix(TRACK, p), -90, 270)

        # partes que se dibujan una tras otra
        pop = prog(t, 0.98, 0.42)
        for i, (col, a0, a1) in enumerate(segs):
            q = prog(t, 0.12 + i * 0.22, 0.34)
            if q <= 0:
                continue
            end = a0 + (a1 - a0) * ease_out_cubic(q)
            if i == 0 and pop > 0:
                e = ease_out_back(pop, 2.4)
                off = 9 * e
                ring(col, a0, end, r_out=R_OUT + 2 * e, w=W + 4 * e,
                     dx=math.cos(mid) * off, dy=math.sin(mid) * off)
            else:
                ring(col, a0, end)

        # recibito en el centro
        p = prog(t, 0.05, 0.35)
        if p > 0:
            s = ease_out_back(p)
            w2, h2 = 15 * s, 19 * s
            d.rounded_rectangle([u(cx - w2), u(cy - h2), u(cx + w2), u(cy + h2)], radius=u(5 * s), fill=WHITE)
            for k, (yy, ww) in enumerate([(-9, 16), (-1, 20), (7, 12)]):
                q = prog(t, 0.3 + k * 0.08, 0.2)
                if q > 0:
                    x0 = cx - 10 * s
                    d.rounded_rectangle([u(x0), u(cy + yy * s - 1.6), u(x0 + ww * s * ease_out_cubic(q)), u(cy + yy * s + 1.6)],
                                        radius=u(1.6), fill=PURPLE if k == 0 else (0xDD, 0xD6, 0xEE))

        # destellos junto a tu parte
        for sx, sy, st in [(206, 52, 1.2), (214, 104, 1.3), (168, 26, 1.38)]:
            q = prog(t, st, 0.5)
            if 0 < q < 1:
                k = math.sin(q * math.pi)
                L = 7 * k
                col = mix(LIME, k)
                thick_polyline(d, [(sx - L, sy), (sx + L, sy)], 2.2, col)
                thick_polyline(d, [(sx, sy - L), (sx, sy + L)], 2.2, col)

        frames.append(finish(img))
    save(frames, 'gasto')


# ─────────────────────────────────────────────────────────────
# Invitación: tres avatares llegan al grupo y un círculo lima con "+"
# (tú) se une con un rebote y se vuelve un check
# ─────────────────────────────────────────────────────────────
def avatar_layer(r, bg, fg):
    """Avatar pastel con silueta, recortado en círculo (lienzo supermuestreado)."""
    D = round(u(2 * r))
    img = Image.new('RGBA', (D, D), bg + (255,))
    d = ImageDraw.Draw(img)
    k = D / 2
    d.ellipse([k - D * 0.17, D * 0.20, k + D * 0.17, D * 0.54], fill=fg + (255,))          # cabeza
    d.ellipse([k - D * 0.36, D * 0.62, k + D * 0.36, D * 1.30], fill=fg + (255,))          # hombros
    mask = Image.new('L', (D, D), 0)
    ImageDraw.Draw(mask).ellipse([0, 0, D - 1, D - 1], fill=255)
    img.putalpha(mask)
    return img


def invita():
    R = 25
    people = [((0xE5, 0xDC, 0xF7), (0x55, 0x3A, 0x8F)), ((0xF3, 0xDE, 0xC6), (0x75, 0x4D, 0x28)),
              ((0xDC, 0xEC, 0xCD), (0x47, 0x63, 0x37))]
    layers = [avatar_layer(R, bg, fg) for bg, fg in people]
    xs = [62, 101, 140]
    cy = 120
    youx = 182
    frames = []
    n = 56
    for f in range(n):
        t = f * FRAME_MS / 1000
        img = Image.new('RGB', (S, S), BG)
        d = ImageDraw.Draw(img)

        # los que ya están: llegan uno tras otro desde la izquierda
        for i, (x, lay) in enumerate(zip(xs, layers)):
            p = prog(t, 0.05 + i * 0.16, 0.42)
            if p <= 0:
                continue
            e = ease_out_back(p, 1.6)
            cx = x - (1 - e) * 46
            a = clamp(p * 3)
            circle(d, cx, cy, R + 4, fill=BG)                         # aro que separa del vecino
            lay2 = lay if a >= 1 else lay.copy()
            if a < 1:
                al = lay2.getchannel('A').point(lambda v: int(v * a))
                lay2.putalpha(al)
            img.paste(lay2, (round(u(cx - R)), round(u(cy - R))), lay2)

        # tú: el círculo lima cae con rebote
        p = prog(t, 0.78, 0.5)
        if p > 0:
            e = ease_out_back(p, 2.2)
            yy = cy - (1 - e) * 70
            q = prog(t, 1.32, 0.22)                                    # "+" se vuelve check
            circle(d, youx, yy, R + 4, fill=BG)
            circle(d, youx, yy, R, fill=LIME)
            if q < 1:
                a = 1 - q
                col = mix(INK, a, LIME)
                thick_polyline(d, [(youx - 9, yy), (youx + 9, yy)], 4.2, col)
                thick_polyline(d, [(youx, yy - 9), (youx, yy + 9)], 4.2, col)
            if q > 0:
                pts = [(youx - 10, yy + 1), (youx - 3, yy + 8), (youx + 11, yy - 7)]
                thick_polyline(d, partial_path(pts, ease_out_cubic(q)), 4.2, INK)
            # onda al unirse
            w = prog(t, 1.25, 0.6)
            if 0 < w < 1:
                circle(d, youx, yy, R * (1 + 0.7 * ease_out_cubic(w)), outline=mix(WHITE, (1 - w) * 0.55), width=2.5)

        # destellos
        for sx, sy, st in [(206, 78, 1.4), (214, 150, 1.5), (160, 74, 1.58)]:
            q = prog(t, st, 0.5)
            if 0 < q < 1:
                k = math.sin(q * math.pi)
                L = 7 * k
                col = mix(LIME, k)
                thick_polyline(d, [(sx - L, sy), (sx + L, sy)], 2.2, col)
                thick_polyline(d, [(sx, sy - L), (sx, sy + L)], 2.2, col)

        frames.append(finish(img))
    save(frames, 'invita')


# ─────────────────────────────────────────────────────────────
# Logo: cuadro morado inclinado -5° con el icono blanco derecho
# (mismo trazo que el <symbol id="i-logo"> del diseño, caja de 24)
# ─────────────────────────────────────────────────────────────
def logo():
    px = 40                       # tamano en el correo (el cuadro mide 34)
    k = 2 * 4                     # 2x retina * 4x supermuestreo
    W = px * k
    img = Image.new('RGBA', (W, W), (0, 0, 0, 0))

    sq = Image.new('RGBA', (W, W), (0, 0, 0, 0))
    o = (px - 34) / 2 * k
    ImageDraw.Draw(sq).rounded_rectangle([o, o, o + 34 * k, o + 34 * k], radius=12 * k, fill=PURPLE + (255,))
    img.alpha_composite(sq.rotate(5, resample=Image.BICUBIC))   # PIL: positivo = antihorario = CSS -5deg

    d = ImageDraw.Draw(img)
    scale = 23 / 24 * k
    off = (px - 23) / 2 * k

    def P(x, y):
        return (off + x * scale, off + y * scale)

    def arc(cx, cy, r, a0, a1, steps=24):
        return [P(cx + r * math.cos(math.radians(a0 + (a1 - a0) * i / steps)),
                  cy + r * math.sin(math.radians(a0 + (a1 - a0) * i / steps))) for i in range(steps + 1)]

    w = 2.4 * scale
    paths = [
        [P(17, 5), P(9, 5)] + arc(9, 9, 4, 270, 90)[1:] + [P(15, 13)] + arc(15, 16, 3, -90, 90)[1:] + [P(6, 19)],
        [P(14, 2), P(17, 5), P(14, 8)],
        [P(10, 16), P(6, 19), P(10, 22)],
    ]
    for pts in paths:
        d.line(pts, fill=WHITE + (255,), width=round(w), joint='curve')
        for x, y in (pts[0], pts[-1]):
            d.ellipse([x - w / 2, y - w / 2, x + w / 2, y + w / 2], fill=WHITE + (255,))

    out = img.resize((px * 2, px * 2), Image.LANCZOS)
    out.save(os.path.join(DEST, 'logo.png'), optimize=True)
    print('logo.png', out.size)


if __name__ == '__main__':
    pago()
    cobro()
    gasto()
    invita()
    logo()
