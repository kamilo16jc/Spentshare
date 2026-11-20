"""Catálogo de comercios de SpentShare + sus logos guardados en la app.

Sale del análisis de los gastos reales (19 nov 2026: Amazon, Aldi, T-Mobile, ComEd, Costco,
U-Haul, Starbucks…) más los comercios comunes de Chicago y de Colombia. Con esto la app y el
servidor reconocen el comercio sin llamar a la IA y muestran el logo desde /logos/ (sin
pedirlo a otro sitio).

  python -I tools/build_merchants.py           # descarga logos que falten + regenera el catálogo
  python -I tools/build_merchants.py --force   # vuelve a descargar todos

Salidas:
  logos/<id>.png            96x96, fondo transparente
  functions/merchants.js    catálogo (UMD: lo usan la app y Cloud Functions)
"""
import io
import json
import os
import sys
import tempfile
import urllib.request

from PIL import Image, ImageChops

# icon.horse inventa un cuadro con la inicial cuando no encuentra el logo: para estos no sirve
NO_HORSE = {'doordash', 'enel', 'juanvaldez', 'meijer', 'michoacana'}

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
LOGOS = os.path.join(ROOT, 'logos')
OUT_JS = os.path.join(ROOT, 'functions', 'merchants.js')

# id, nombre, dominio (el que guarda la IA en logoDomain), categoría (None = no la cambia),
# emoji, nombres con que la gente lo escribe (incluye errores comunes), dominio para el logo
M = [
    # ── supermercados y tiendas (EE. UU.)
    ('aldi', 'Aldi', 'aldi.com', 'food', '🛒', ['aldi', 'aldis'], 'aldi.us'),
    ('costco', 'Costco', 'costco.com', 'food', '🛒', ['costco', 'cotsco', 'costco wholesale', 'costco gas'], None),
    ('walmart', 'Walmart', 'walmart.com', None, '🛒', ['walmart', 'wal mart', 'wallmart', 'walmar'], None),
    ('target', 'Target', 'target.com', None, '🎯', ['target'], None),
    ('jewelosco', 'Jewel-Osco', 'jewelosco.com', 'food', '🛒', ['jewel osco', 'jewel'], None),
    ('marianos', "Mariano's", 'marianos.com', 'food', '🛒', ['marianos', 'mariano s'], None),
    ('meijer', 'Meijer', 'meijer.com', 'food', '🛒', ['meijer'], None),
    ('kroger', 'Kroger', 'kroger.com', 'food', '🛒', ['kroger'], None),
    ('traderjoes', "Trader Joe's", 'traderjoes.com', 'food', '🛒', ['trader joes', 'trader joe', 'trader joe s'], None),
    ('wholefoods', 'Whole Foods', 'wholefoodsmarket.com', 'food', '🛒', ['whole foods'], None),
    ('samsclub', "Sam's Club", 'samsclub.com', 'food', '🛒', ['sams club', 'sam s club'], None),
    ('dollartree', 'Dollar Tree', 'dollartree.com', 'shopping', '🛍️', ['dollar tree'], None),
    ('dollargeneral', 'Dollar General', 'dollargeneral.com', 'shopping', '🛍️', ['dollar general'], None),
    ('instacart', 'Instacart', 'instacart.com', 'food', '🛒', ['instacart'], None),
    ('amazon', 'Amazon', 'amazon.com', None, '📦', ['amazon', 'amzn', 'amazon order'], None),
    ('ebay', 'eBay', 'ebay.com', 'shopping', '🛍️', ['ebay'], None),
    # ── restaurantes y café
    ('starbucks', 'Starbucks', 'starbucks.com', 'drinks', '☕', ['starbucks', 'starbuck'], None),
    ('dunkin', "Dunkin'", 'dunkindonuts.com', 'food', '🍩', ['dunkin', 'dunkin donuts', 'dunkin donut'], None),
    ('mcdonalds', "McDonald's", 'mcdonalds.com', 'food', '🍔', ['mcdonalds', 'mcdonald', 'mc donalds', 'mcdonals', 'mcdonald s'], None),
    ('raisingcanes', "Raising Cane's", 'raisingcanes.com', 'food', '🍗', ['raising canes', 'raising cane', 'raising cane s'], None),
    ('pandaexpress', 'Panda Express', 'pandaexpress.com', 'food', '🥡', ['panda express'], None),
    ('chipotle', 'Chipotle', 'chipotle.com', 'food', '🌯', ['chipotle'], None),
    ('panera', 'Panera Bread', 'panerabread.com', 'food', '🥖', ['panera', 'panera bread'], None),
    ('popeyes', 'Popeyes', 'popeyes.com', 'food', '🍗', ['popeyes', 'popeye s'], None),
    ('tacobell', 'Taco Bell', 'tacobell.com', 'food', '🌮', ['taco bell'], None),
    ('wendys', "Wendy's", 'wendys.com', 'food', '🍔', ['wendys', 'wendy s'], None),
    ('burgerking', 'Burger King', 'bk.com', 'food', '🍔', ['burger king'], None),
    ('dominos', "Domino's", 'dominos.com', 'food', '🍕', ['dominos', 'domino s', 'dominos pizza'], None),
    ('pizzahut', 'Pizza Hut', 'pizzahut.com', 'food', '🍕', ['pizza hut'], None),
    ('littlecaesars', 'Little Caesars', 'littlecaesars.com', 'food', '🍕', ['little caesars', 'little caesar', 'little cesars'], None),
    ('chickfila', 'Chick-fil-A', 'chick-fil-a.com', 'food', '🍗', ['chick fil a', 'chickfila', 'chik fil a'], None),
    ('kfc', 'KFC', 'kfc.com', 'food', '🍗', ['kfc'], None),
    ('wingstop', 'Wingstop', 'wingstop.com', 'food', '🍗', ['wingstop', 'wing stop'], None),
    ('bww', 'Buffalo Wild Wings', 'buffalowildwings.com', 'food', '🍗', ['buffalo wild wings', 'bww'], None),
    ('fiveguys', 'Five Guys', 'fiveguys.com', 'food', '🍔', ['five guys'], None),
    ('portillos', "Portillo's", 'portillos.com', 'food', '🌭', ['portillos', 'portillo s'], None),
    ('culvers', "Culver's", 'culvers.com', 'food', '🍦', ['culvers', 'culver s'], None),
    ('olivegarden', 'Olive Garden', 'olivegarden.com', 'food', '🍝', ['olive garden'], None),
    ('chilis', "Chili's", 'chilis.com', 'food', '🌶️', ['chilis', 'chili s'], None),
    ('crackerbarrel', 'Cracker Barrel', 'crackerbarrel.com', 'food', '🍳', ['cracker barrel'], None),
    ('krispykreme', 'Krispy Kreme', 'krispykreme.com', 'food', '🍩', ['krispy kreme', 'krispy kream', 'krispy'], None),
    ('charleys', 'Charleys Philly Steaks', 'charleys.com', 'food', '🥪', ['charleys', 'charley s'], None),
    ('jimmyjohns', "Jimmy John's", 'jimmyjohns.com', 'food', '🥪', ['jimmy johns', 'jimmy john s'], None),
    ('michoacana', 'La Michoacana', 'lamichoacana.com.mx', 'food', '🍦', ['michoacana', 'michocana', 'la michoacana'], None),
    ('doordash', 'DoorDash', 'doordash.com', 'food', '🛵', ['doordash', 'door dash'], None),
    ('ubereats', 'Uber Eats', 'ubereats.com', 'food', '🛵', ['uber eats', 'ubereats'], None),
    ('grubhub', 'Grubhub', 'grubhub.com', 'food', '🛵', ['grubhub'], None),
    # ── transporte y carro
    ('uber', 'Uber', 'uber.com', 'transport', '🚗', ['uber'], None),
    ('lyft', 'Lyft', 'lyft.com', 'transport', '🚗', ['lyft'], None),
    ('shell', 'Shell', 'shell.com', 'transport', '⛽', ['shell'], None),
    ('speedway', 'Speedway', 'speedway.com', 'transport', '⛽', ['speedway'], None),
    ('exxon', 'Exxon', 'exxon.com', 'transport', '⛽', ['exxon', 'exxonmobil', 'mobil'], None),
    ('chevron', 'Chevron', 'chevron.com', 'transport', '⛽', ['chevron'], None),
    ('statefarm', 'State Farm', 'statefarm.com', 'transport', '🛡️', ['state farm'], None),
    ('geico', 'GEICO', 'geico.com', 'transport', '🛡️', ['geico'], None),
    ('uhaul', 'U-Haul', 'uhaul.com', None, '🚚', ['u haul', 'uhaul'], None),
    ('ventra', 'Ventra', 'ventrachicago.com', 'transport', '🚇', ['ventra'], None),
    ('spothero', 'SpotHero', 'spothero.com', 'transport', '🅿️', ['spothero', 'spot hero'], None),
    # ── servicios
    ('tmobile', 'T-Mobile', 't-mobile.com', 'utilities', '📱', ['tmobile', 't mobile', 'tmobil'], None),
    ('comed', 'ComEd', 'comed.com', 'utilities', '💡', ['comed', 'com ed', 'comes bill'], None),
    ('xfinity', 'Xfinity', 'xfinity.com', 'utilities', '📶', ['xfinity', 'comcast'], None),
    ('att', 'AT&T', 'att.com', 'utilities', '📱', ['at t', 'att'], None),
    ('verizon', 'Verizon', 'verizon.com', 'utilities', '📱', ['verizon'], None),
    ('nicor', 'Nicor Gas', 'nicorgas.com', 'utilities', '🔥', ['nicor', 'nicor gas'], None),
    ('peoplesgas', 'Peoples Gas', 'peoplesgasdelivery.com', 'utilities', '🔥', ['peoples gas'], None),
    ('spectrum', 'Spectrum', 'spectrum.com', 'utilities', '📶', ['spectrum'], None),
    # ── suscripciones y ocio
    ('netflix', 'Netflix', 'netflix.com', 'entertainment', '🎬', ['netflix'], None),
    ('spotify', 'Spotify', 'spotify.com', 'entertainment', '🎧', ['spotify'], None),
    ('youtube', 'YouTube', 'youtube.com', 'entertainment', '▶️', ['youtube', 'youtube music', 'youtube premium'], None),
    ('disney', 'Disney+', 'disneyplus.com', 'entertainment', '🎬', ['disney plus', 'disney'], None),
    ('hulu', 'Hulu', 'hulu.com', 'entertainment', '🎬', ['hulu'], None),
    ('max', 'Max', 'max.com', 'entertainment', '🎬', ['hbo max', 'hbo'], None),
    ('xbox', 'Xbox', 'xbox.com', 'entertainment', '🎮', ['xbox', 'game pass'], None),
    ('playstation', 'PlayStation', 'playstation.com', 'entertainment', '🎮', ['playstation', 'psn', 'ps plus'], None),
    ('nintendo', 'Nintendo', 'nintendo.com', 'entertainment', '🎮', ['nintendo'], None),
    ('steam', 'Steam', 'steampowered.com', 'entertainment', '🎮', ['steam'], None),
    ('sixflags', 'Six Flags', 'sixflags.com', 'entertainment', '🎢', ['six flags', 'sixflags'], None),
    ('amc', 'AMC Theatres', 'amctheatres.com', 'entertainment', '🍿', ['amc', 'amc theatres', 'amc theaters'], None),
    ('anthropic', 'Claude (Anthropic)', 'anthropic.com', 'other', '✳️', ['anthropic', 'claude ai', 'claude pro'], 'claude.ai'),
    # ── compras, hogar y salud
    ('macys', "Macy's", 'macys.com', 'shopping', '🛍️', ['macys', 'macy s'], None),
    ('ross', 'Ross Dress for Less', 'rossstores.com', 'shopping', '🛍️', ['ross', 'ross dress for less'], None),
    ('tjmaxx', 'T.J. Maxx', 'tjmaxx.com', 'shopping', '🛍️', ['tj maxx', 'tjmaxx', 't j maxx'], None),
    ('marshalls', 'Marshalls', 'marshalls.com', 'shopping', '🛍️', ['marshalls'], None),
    ('kohls', "Kohl's", 'kohls.com', 'shopping', '🛍️', ['kohls', 'kohl s'], None),
    ('bestbuy', 'Best Buy', 'bestbuy.com', 'shopping', '🖥️', ['best buy', 'bestbuy'], None),
    ('apple', 'Apple', 'apple.com', None, '', ['apple store', 'apple', 'icloud'], None),
    ('nike', 'Nike', 'nike.com', 'shopping', '👟', ['nike'], None),
    ('shein', 'SHEIN', 'shein.com', 'shopping', '👗', ['shein'], None),
    ('temu', 'Temu', 'temu.com', 'shopping', '🛍️', ['temu'], None),
    ('ikea', 'IKEA', 'ikea.com', 'home', '🛋️', ['ikea'], None),
    ('homedepot', 'The Home Depot', 'homedepot.com', 'home', '🔨', ['home depot'], None),
    ('lowes', "Lowe's", 'lowes.com', 'home', '🔨', ['lowes', 'lowe s'], None),
    ('menards', 'Menards', 'menards.com', 'home', '🔨', ['menards'], None),
    ('walgreens', 'Walgreens', 'walgreens.com', 'health', '💊', ['walgreens'], None),
    ('cvs', 'CVS', 'cvs.com', 'health', '💊', ['cvs'], None),
    ('petsmart', 'PetSmart', 'petsmart.com', 'pets', '🐾', ['petsmart', 'pet smart'], None),
    ('petco', 'Petco', 'petco.com', 'pets', '🐾', ['petco'], None),
    ('chewy', 'Chewy', 'chewy.com', 'pets', '🐾', ['chewy'], None),
    # ── viajes
    ('airbnb', 'Airbnb', 'airbnb.com', 'travel', '🏠', ['airbnb', 'air bnb'], None),
    ('booking', 'Booking.com', 'booking.com', 'travel', '🏨', ['booking com', 'booking'], None),
    ('expedia', 'Expedia', 'expedia.com', 'travel', '✈️', ['expedia'], None),
    ('southwest', 'Southwest', 'southwest.com', 'travel', '✈️', ['southwest'], None),
    ('united', 'United Airlines', 'united.com', 'travel', '✈️', ['united airlines'], None),
    ('american', 'American Airlines', 'aa.com', 'travel', '✈️', ['american airlines'], None),
    ('spirit', 'Spirit Airlines', 'spirit.com', 'travel', '✈️', ['spirit airlines'], None),
    ('avianca', 'Avianca', 'avianca.com', 'travel', '✈️', ['avianca'], None),
    ('latam', 'LATAM', 'latamairlines.com', 'travel', '✈️', ['latam'], None),
    # ── Colombia
    ('exito', 'Éxito', 'exito.com', 'food', '🛒', ['exito', 'almacenes exito', 'exito express'], None),
    ('d1', 'D1', 'tiendasd1.com', 'food', '🛒', ['d1', 'tiendas d1'], None),
    ('ara', 'Ara', 'aratiendas.com', 'food', '🛒', ['tiendas ara', 'ara'], None),
    ('olimpica', 'Olímpica', 'olimpica.com', 'food', '🛒', ['olimpica', 'sao olimpica'], None),
    ('carulla', 'Carulla', 'carulla.com', 'food', '🛒', ['carulla'], None),
    ('jumbo', 'Jumbo', 'tiendasjumbo.co', 'food', '🛒', ['jumbo'], None),
    ('makro', 'Makro', 'makro.com.co', 'food', '🛒', ['makro'], None),
    ('rappi', 'Rappi', 'rappi.com', 'food', '🛵', ['rappi'], None),
    ('didi', 'DiDi', 'didiglobal.com', 'transport', '🚗', ['didi'], None),
    ('cabify', 'Cabify', 'cabify.com', 'transport', '🚗', ['cabify'], None),
    ('juanvaldez', 'Juan Valdez', 'juanvaldezcafe.com', 'drinks', '☕', ['juan valdez'], None),
    ('crepes', 'Crepes & Waffles', 'crepesywaffles.com', 'food', '🧇', ['crepes waffles', 'crepes y waffles', 'crepes and waffles'], None),
    ('frisby', 'Frisby', 'frisby.com.co', 'food', '🍗', ['frisby'], None),
    ('elcorral', 'El Corral', 'elcorral.com', 'food', '🍔', ['el corral', 'hamburguesas el corral'], None),
    ('falabella', 'Falabella', 'falabella.com.co', 'shopping', '🛍️', ['falabella'], None),
    ('homecenter', 'Homecenter', 'homecenter.com.co', 'home', '🔨', ['homecenter', 'home center'], None),
    ('movistar', 'Movistar', 'movistar.co', 'utilities', '📱', ['movistar'], None),
    ('claro', 'Claro', 'claro.com.co', 'utilities', '📱', ['claro hogar', 'claro'], None),
    ('tigo', 'Tigo', 'tigo.com.co', 'utilities', '📱', ['tigo', 'une tigo'], None),
    ('enel', 'Enel', 'enel.com.co', 'utilities', '💡', ['enel', 'codensa'], None),
    ('epm', 'EPM', 'epm.com.co', 'utilities', '💡', ['epm'], None),
    ('vanti', 'Vanti', 'grupovanti.com', 'utilities', '🔥', ['vanti'], None),
]


def fetch(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (SpentShare logo builder)'})
    with urllib.request.urlopen(req, timeout=20) as r:
        if r.status != 200:
            return None
        return r.read()


def make_logo(raw, min_side=48):
    """Valida la imagen descargada y la deja de 96x96 con fondo transparente."""
    im = Image.open(io.BytesIO(raw))
    if getattr(im, 'n_frames', 1) > 1 or im.format == 'ICO':   # .ico con varios tamaños: el más grande
        sizes = getattr(im, 'ico', None) and im.ico.sizes()
        if sizes:
            im.size = max(sizes)
    im.load()
    if min(im.size) < min_side:      # Google devuelve un globo de 16 px cuando no conoce el sitio
        return None
    im = im.convert('RGBA')
    # recorta el margen vacío (transparente o casi blanco) para que el logo llene el cuadro
    flat = Image.new('RGB', im.size, (255, 255, 255)); flat.paste(im, mask=im.getchannel('A'))
    ink = ImageChops.difference(flat, Image.new('RGB', im.size, (255, 255, 255))).convert('L').point(lambda v: 255 if v > 24 else 0)
    box = ink.getbbox()
    if box:
        x0, y0, x1, y1 = box
        side = max(x1 - x0, y1 - y0)
        pad = round(side * 0.06)
        cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
        half = side / 2 + pad
        im = im.crop((round(cx - half), round(cy - half), round(cx + half), round(cy + half)))
    im = im.resize((88, 88), Image.LANCZOS)
    out = Image.new('RGBA', (96, 96), (0, 0, 0, 0))
    out.alpha_composite(im, (4, 4))
    return out


def main():
    force = '--force' in sys.argv
    os.makedirs(LOGOS, exist_ok=True)
    tmp = tempfile.mkdtemp(prefix='ss_logos_')     # descargas aparte (datos de internet)
    have, missing = [], []
    for mid, name, domain, cat, emoji, aliases, logo_domain in M:
        path = os.path.join(LOGOS, mid + '.png')
        if os.path.exists(path) and not force:
            have.append(mid); continue
        src = logo_domain or domain
        # varias fuentes, de la mejor a la peor; la última acepta íconos de 32 px
        sources = [
            (f'https://www.google.com/s2/favicons?domain={src}&sz=128', 48),
            (f'https://{src}/apple-touch-icon.png', 48),
            (f'https://www.{src}/apple-touch-icon.png', 48),
            (f'https://icon.horse/icon/{src}', 48),
            (f'https://icons.duckduckgo.com/ip3/{src}.ico', 32),
        ]
        img = None
        for k, (url, min_side) in enumerate(sources):
            if mid in NO_HORSE and 'icon.horse' in url:
                continue
            try:
                raw = fetch(url)
                if not raw:
                    continue
                open(os.path.join(tmp, f'{mid}-{k}.bin'), 'wb').write(raw)
                img = make_logo(raw, min_side)
            except Exception:  # noqa: BLE001  (404, imagen rara…: se prueba la siguiente)
                img = None
            if img:
                break
        if img:
            img.save(path, optimize=True); have.append(mid)
        else:
            missing.append(mid)
    print(f'logos: {len(have)} listos, {len(missing)} sin logo: {", ".join(missing)}')

    items = []
    for mid, name, domain, cat, emoji, aliases, logo_domain in M:
        items.append({'id': mid, 'name': name, 'domain': domain, 'cat': cat, 'emoji': emoji,
                      'aliases': aliases, 'logo': os.path.exists(os.path.join(LOGOS, mid + '.png'))})
    js = """// GENERADO por tools/build_merchants.py — no editar a mano.
// Catálogo de comercios: la app y Cloud Functions lo usan para reconocer el comercio de un
// gasto sin llamar a la IA, y la app muestra su logo desde /logos/<id>.png.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SSMerchants = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const LIST = %s;
  const fold = s => ' ' + String(s || '').toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g, '')
    .replace(/&/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim() + ' ';
  // Busca primero los nombres más largos ("uber eats" antes que "uber")
  const ALIASES = [];
  LIST.forEach(m => m.aliases.forEach(a => ALIASES.push({ a: fold(a), m })));
  ALIASES.sort((x, y) => y.a.length - x.a.length);
  const BY_DOMAIN = {};
  LIST.forEach(m => { BY_DOMAIN[m.domain] = m; });
  function find(text) {
    const t = fold(text);
    if (t.trim().length < 2) return null;
    const hit = ALIASES.find(x => t.includes(x.a));
    return hit ? hit.m : null;
  }
  const byDomain = d => BY_DOMAIN[String(d || '').toLowerCase().replace(/^www\\./, '')] || null;
  return { LIST, find, byDomain };
}));
""" % json.dumps(items, ensure_ascii=False, indent=0).replace('\n', '')
    open(OUT_JS, 'w', encoding='utf-8').write(js)
    print('catálogo:', OUT_JS, len(items), 'comercios')


if __name__ == '__main__':
    main()
