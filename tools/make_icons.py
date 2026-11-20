"""Íconos de la app instalable (PWA) desde brand/logo-3d.png (logo 3D con anillos lima).

  icon-192.png / icon-512.png                 -> "any": fondo transparente, logo grande
  icon-maskable-192.png / icon-maskable-512.png -> "maskable" (Android): fondo marfil, logo en la zona segura
  apple-touch-icon.png (180)                  -> iPhone: sin transparencia
  favicon-32.png / favicon-48.png             -> pestaña del navegador

Uso:  python tools/make_icons.py
"""
import os

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SRC = os.path.join(ROOT, 'brand', 'logo-3d.png')
IVORY = (0xF8, 0xF7, 0xFC, 255)

logo = Image.open(SRC).convert('RGBA')
logo = logo.crop(logo.getchannel('A').point(lambda v: 255 if v > 8 else 0).getbbox())


def place(size, fill_w, bg=None):
    """Logo centrado ocupando fill_w del ancho del lienzo."""
    canvas = Image.new('RGBA', (size, size), bg or (0, 0, 0, 0))
    w = round(size * fill_w)
    h = round(logo.height * w / logo.width)
    if h > size * fill_w:                      # por si el logo fuera más alto que ancho
        h = round(size * fill_w)
        w = round(logo.width * h / logo.height)
    small = logo.resize((w, h), Image.LANCZOS)
    canvas.alpha_composite(small, ((size - w) // 2, (size - h) // 2))
    return canvas


def save(img, name, opaque=False):
    path = os.path.join(ROOT, name)
    (img.convert('RGB') if opaque else img).save(path, optimize=True)
    print(f'{name:28s} {img.size[0]}x{img.size[1]}  {os.path.getsize(path) // 1024} KB')


for s in (192, 512):
    save(place(s, 0.94), f'icon-{s}.png')
    save(place(s, 0.72, IVORY), f'icon-maskable-{s}.png', opaque=True)   # zona segura: círculo del 80 %
save(place(180, 0.84, IVORY), 'apple-touch-icon.png', opaque=True)
for s in (32, 48):
    save(place(s, 1.0), f'favicon-{s}.png')

# Logo 3D de la pantalla de entrada (se ve a 196 px de ancho; 2x y 3x para pantallas densas).
# Antes era un logo armado con ~30 capas de CSS 3D que parpadeaban al flotar.
for w in (392, 588):
    h = round(logo.height * w / logo.width)
    img = logo.resize((w, h), Image.LANCZOS)
    path = os.path.join(ROOT, 'brand', f'logo-3d-{w}.webp')
    img.save(path, quality=88, method=6)
    print(f'brand/logo-3d-{w}.webp       {w}x{h}  {os.path.getsize(path) // 1024} KB')
    if w == 392:
        save(img, os.path.join('brand', 'logo-3d-392.png'))
