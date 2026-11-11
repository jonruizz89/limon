"""Limpieza común de los datos de un plan antes de cargarlo (todas las ciudades): hora, título, lugar y dirección.

Son funciones puras (sin red ni base de datos) para poder probarlas: `python3 tests/test_calidad.py`.
"""
import re

_T = r'(?:[01]?\d|2[0-3])[:.][0-5]\d'


def norm_hora(h):
    """Deja la hora legible o None: sin segundos, «17.00» → «17:00», sin la «h» suelta, sin guiones ni medianoches
    que en realidad son «sin hora», y sin frases cortadas a medias."""
    h = re.sub(r'\s+', ' ', str(h or '')).strip()
    if not re.search(r'\w', h) or re.fullmatch(r'[\W_]*(--+|—+)[\W_]*', h):
        return None
    h = re.sub(r'^[\s\-–·:,;]+', '', h).rstrip('… ')
    if '€' in h and not re.search(r'\d{1,2}[:.]\d{2}\s?h|\d{1,2}:\d{2}', h):
        return None  # eran precios, no horas
    h = re.sub(r'(\d{1,2}:\d{2})\?(\d{1,2}:\d{2})', r'\1-\2', h)             # «16:00?20:30» (guion mal codificado)
    h = re.sub(r'\b(\d{1,2}:\d{2}):\d{2}\b', r'\1', h)                       # 18:00:00 → 18:00
    h = re.sub(r'(?<![\d.,/])([01]?\d|2[0-3])\.([0-5]\d)(?![\d.,/])(?=\s*(?:h\b|horas\b|$|[-–a/+,;)]))', r'\1:\2', h)  # 17.00 → 17:00
    h = re.sub(r'(?:^|(?<=/ ))(\d{1,2});(?= ?\d{1,2}:\d{2})', r'\1:', h)       # «19; 19:30 / 20; 19:00» (día; hora)
    h = re.sub(r'(\d{1,2}:\d{2})\s?h(?:oras|rs)?\.?(?=\s+[A-ZÁÉÍÓÚÑ0-9(])', r'\1 ·', h)  # «17:30 h Concierto: 19:00» → «17:30 · Concierto…»
    h = re.sub(r'(\d{1,2}:\d{2})\s?h(?:oras|rs)?\b\.?', r'\1', h)             # «11:00 h» → «11:00»
    if re.fullmatch(r'0?0:00(\s*(a|-|–)\s*0?0:00)?', h):
        return None  # 00:00 a secas es una fecha sin hora, no una cita a medianoche
    if len(h) > 160:  # demasiado largo para una tarjeta: se corta en una pausa, no a mitad de palabra
        corte = max(h.rfind(s, 0, 160) for s in ('. ', ' / ', ' | ', '; ', ' · '))
        h = h[:corte] if corte > 40 else h[:160].rsplit(' ', 1)[0]
    for _ in range(4):  # restos de un corte: paréntesis sin cerrar, hora a medias, conectores y signos colgando
        h0 = h
        if h.count('(') > h.count(')'):
            h = h[:h.rfind('(')]
        if not re.search(r'\d{1,2}:\d{2}$', h):  # «… / 18:0», «16:00-20», «Sábados: 12»: la última hora quedó a medias
            h = re.sub(r'(?i)(?<=[\-–/+:a])\s?\d{1,2}(:\d?)?$', '', h)
        h = re.sub(r'(?i)[\s,;:\-–/(+·|]+$', '', h)
        h = re.sub(r'(?i)\s(a|y|e|o|de|del|las|los|el|la|en|con|por|para|desde|hasta)$', '', h)
        if h == h0:
            break
    h = h.strip()
    return h if re.search(r'\w', h) else None


_DUR = re.compile(r'(?i)(duraci[oó]n|durada|iraupena|minutos|min\b)')


def hora_de_texto(desc):
    """Si la descripción da UNA sola hora inequívoca («a las 19:30», «20:00 h»), la devuelve como HH:MM; si no, None."""
    t = re.sub(r'\s+', ' ', str(desc or ''))
    if not t:
        return None
    horas = set()
    for m in re.finditer(r'(?i)(?<![\d:.,/-])(' + _T + r')\s?(h\b|horas\b|hrs?\b)', t):
        antes = t[max(0, m.start() - 14):m.start()]
        if re.search(r'(?i)\d\s?(?:h|horas)?\s?(?:a|-|–|hasta)(?:\s+las?)?\s?$', antes):
            continue  # «de 19 a 20:30 horas»: es la hora de fin de un tramo
        if not _DUR.search(t[max(0, m.start() - 25):m.end() + 12]):
            horas.add(m.group(1))
    for m in re.finditer(r'(?i)\b(?:a las?|a les|desde las?|hora:|horario:|horari:|ordua:)\s?(' + _T + r')(?!\d|:|[.,/-]\d|\s?(?:€|eur))', t):
        horas.add(m.group(1))
    for m in re.finditer(r'(?i)\ba las? ([01]?\d|2[0-3])\s?(?:h\b|horas\b)', t):
        horas.add(m.group(1) + ':00')
    # cualquier otra hora escrita en el texto (un rango, otra sesión, apertura de puertas) lo vuelve ambiguo
    todas = {x.replace('.', ':').zfill(5) for x in re.findall(r'(?<![\d:.,/-])(' + _T.replace('[:.]', ':') + r')(?!\d|:|[.,/-]\d)', t)}
    horas = {x.replace('.', ':').zfill(5) for x in horas}
    if len(horas) != 1 or len(todas | horas) != 1:
        return None
    h = next(iter(horas))
    return h if '06:00' <= h <= '23:59' else None
