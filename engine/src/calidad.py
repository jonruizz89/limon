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


# ---------- duplicados: el mismo plan dos veces (misma ficha de origen, o el mismo título «envuelto» de otra forma)
import unicodedata, urllib.parse


def fold(t):
    t = unicodedata.normalize('NFD', str(t or '').lower())
    return re.sub(r'\s+', ' ', re.sub(r'[^a-z0-9 ]+', ' ', ''.join(c for c in t if unicodedata.category(c) != 'Mn'))).strip()


_COLA_FECHA = re.compile(r'\s*\(\s*\d{1,2}(?:\s*(?:,|y|-)\s*\d{1,2})*\s+de\s+\w+(?:\s+de\s+\d{4})?(?:\s*[-–]\s*[^)]*)?\)?\s*$', re.I)
_NOVEDAD = re.compile(r'\s*\*\s*N(?:OU|EW|UEVO|OVETAT)?\s*\*\s*', re.I)
_TIPO = (r'(?:concert|concierto|kontzertua|espectacle|espectaculo|exposicio|exposicion|erakusketa|xerrada|charla|conferencia|hitzaldia|'
         r'fira|feria|festa|fiesta|teatro|teatre|antzerkia|cine|cinema|zinema|dansa|danza|presentacio|presentacion|projeccio|proyeccion)')
_VACIOS = {'programa', 'concierto', 'concert', 'inauguracion', 'clausura', 'entrada libre', 'taller', 'visita guiada', 'cuentacuentos'}


def claves_titulo(t):
    """(título completo normalizado, núcleos). Núcleos = el título sin envoltorio: lo que va entre comillas, tras los
    últimos dos puntos, sin «Entradas …», sin «(11 de noviembre - Bilbao)», sin «Concert …» delante o sin el paréntesis final."""
    s = _NOVEDAD.sub(' ', str(t or '')).strip()
    completo = fold(s)
    s = re.sub(r'(?i)^entradas\s+(?:para\s+)?', '', _COLA_FECHA.sub('', s)).strip()
    nuc = {fold(s)}
    for m in re.finditer(r'["“”«]([^"“”«»]{3,})["“”»]', s):
        nuc.add(fold(m.group(1)))
    for m in re.finditer(r"(?:^|[\s(:])['‘]([^'‘’]{3,})['’](?=$|[\s),.:;])", s):
        nuc.add(fold(m.group(1)))
    if ':' in s:
        nuc.add(fold(s.rsplit(':', 1)[1]))
    nuc.add(fold(re.sub(r'\s*\([^()]*\)\s*$', '', s)))
    nuc.add(fold(re.sub(r'\s*[-–(]?\s*(?:19|20)\d\d\)?\s*$', '', s)))  # «Construtec 2026» es «Construtec»
    f = fold(s)
    m = re.match(_TIPO + r'(?: familiar| musical| infantil)? (.+)$', f)
    if m:
        nuc.add(m.group(1))
    return completo, {x for x in nuc if len(x) >= 5 and x not in _VACIOS}


_FECHA_FIJA = re.compile(r'\b(a[nñ]o nuevo|nochevieja|fin de a[nñ]o|cap d any|urte berri|urtezahar)\b')
_NO_FIJA = re.compile(r'\b(chino|lunar|persa|judio|islamico|hindu|vietnamita|tet)\b')


def fecha_rara(e):
    """Un «Concierto de Año Nuevo» o una «Nochevieja» con fecha de noviembre es la fecha de venta o de la noticia,
    no la del plan: mejor no enseñarlo que enseñarlo mal."""
    t = fold(e.get('titulo'))
    if not _FECHA_FIJA.search(t) or _NO_FIJA.search(t):
        return False
    ini = str(e.get('inicio') or '')
    return len(ini) >= 7 and ini[5:7] not in ('12', '01')


def mismo_titulo(a, b):
    """¿Dos títulos nombran lo mismo? Iguales, o uno es el núcleo del otro («Concert "Frazey Ford"» / «Frazey Ford»)."""
    ca, na = claves_titulo(a)
    cb, nb = claves_titulo(b)
    if ca == cb:
        return bool(ca)
    return ca in nb or cb in na or fold(_COLA_FECHA.sub('', a)) == fold(_COLA_FECHA.sub('', b))


def url_ficha(u):
    """La URL normalizada si parece la ficha de UN plan (no una portada ni un listado); si no, None."""
    try:
        p = urllib.parse.urlparse(str(u or '').strip())
    except ValueError:
        return None
    if p.scheme not in ('http', 'https') or not p.netloc:
        return None
    ruta = re.sub(r'/+$', '', p.path)
    segs = [x for x in ruta.split('/') if x]
    q = '&'.join(sorted(x for x in p.query.split('&') if x and not re.match(r'(?i)(utm_|fbclid|gclid|ref=|origin=|o=)', x)))
    if not segs and not re.search(r'(?i)(^|&)(id|ide|p|event|evento|productid|idevento)=\w', q):
        return None
    if len(segs) == 1 and not q and (len(segs[0]) < 12 or re.fullmatch(r'(?i)(agenda|eventos?|events?|programacion|actividades|conciertos|calendario|home|index)(\.\w+)?', segs[0])):
        return None
    if segs and re.fullmatch(r'(?i)(agenda|eventos?|events?|programacion|actividades|conciertos|calendario|home|index|festivals?)(\.\w+)?', segs[-1]) and not q:
        return None
    return re.sub(r'^www\.', '', p.netloc.lower()) + ruta.lower() + ('?' + q if q else '')


def _hora1(h):
    m = re.search(r'(\d{1,2}):(\d{2})', str(h or ''))
    return f'{int(m.group(1)):02d}:{m.group(2)}' if m else None


_PSTOP = {'de', 'del', 'la', 'el', 'los', 'las', 'y', 'sala', 'teatro', 'teatre', 'antzokia', 'museo', 'museoa', 'museu', 'aretoa', 'centro',
          'centre', 'cultural', 'kultur', 'etxea', 'k', 'e', 'civic', 'civico'}


def mismo_sitio(a, b):
    """Mismo recinto por nombre («Larratxo K.E.» / «Larratxo Kultur Etxea») o a menos de ~300 m; si uno no dice dónde, vale."""
    la, lb = fold(a.get('lugar')), fold(b.get('lugar'))
    if not la or not lb:
        return True
    if la == lb or la in lb or lb in la:
        return True
    ta, tb = set(la.split()) - _PSTOP, set(lb.split()) - _PSTOP
    if ta and tb and (ta <= tb or tb <= ta):
        return True
    if a.get('lat') and b.get('lat') and a.get('lng') and b.get('lng'):
        return abs(a['lat'] - b['lat']) < 0.003 and abs(a['lng'] - b['lng']) < 0.004
    return False


def _lejos(a, b):
    return bool(a.get('lat') and b.get('lat') and a.get('lng') and b.get('lng')
                and (abs(a['lat'] - b['lat']) > 0.02 or abs(a['lng'] - b['lng']) > 0.027))  # más de ~2 km


def _visita(t):
    return bool(re.match(r'(visitas? (guiada|comentada|teatralizada)s?|bisita gidatua)', fold(t)))


def unir_duplicados(evs):
    """Une en una sola tarjeta los planes repetidos de una misma carga. Devuelve (planes, cuántos se han unido).

    Dos planes que empiezan el mismo día son el mismo si comparten la URL de su ficha (una URL que no usan más de
    3 planes), o si nombran lo mismo (mismo_titulo), están en el mismo sitio y no dan horas de inicio distintas.
    Se queda el primero (orden estable de las fuentes) y hereda del otro lo que le falte, sus fuentes y sesiones."""
    usos = {}
    for e in evs:
        for u in {url_ficha(f.get('url')) for f in e.get('fuentes') or []} - {None}:
            usos[u] = usos.get(u, 0) + 1
    por_dia = {}
    for e in evs:
        e['_urls'] = {u for u in (url_ficha(f.get('url')) for f in e.get('fuentes') or []) if u and usos.get(u, 0) <= 3}
        por_dia.setdefault(e['inicio'], []).append(e)
    fuera = set()
    for lst in por_dia.values():
        for i, a in enumerate(lst):
            if id(a) in fuera:
                continue
            for b in lst[i + 1:]:
                if id(b) in fuera:
                    continue
                ha, hb = _hora1(a.get('hora')), _hora1(b.get('hora'))
                if (ha and hb and ha != hb) or _visita(a['titulo']) != _visita(b['titulo']):
                    continue  # otra hora de inicio, o la visita guiada a una exposición: son planes distintos
                misma_url = bool(a['_urls'] & b['_urls'])
                if misma_url:
                    # la misma ficha con dos títulos o dos nombres de sala: no pueden estar lejos, y deben compartir alguna
                    # palabra del título o, si son de un solo día, la hora (hay agendas que enlazan actividades distintas
                    # a una misma página)
                    pa, pb = ({w for w in fold(x['titulo']).split() if len(w) >= 4} for x in (a, b))
                    un_dia = all((x.get('fin') or x['inicio']) == x['inicio'] for x in (a, b))
                    if _lejos(a, b) or not (pa & pb or (un_dia and ha and ha == hb)):
                        continue
                else:
                    if not mismo_titulo(a['titulo'], b['titulo']) or not mismo_sitio(a, b):
                        continue
                    if (a.get('fin') or a['inicio']) != (b.get('fin') or b['inicio']) and not (a.get('sesiones') or b.get('sesiones')):
                        continue  # dos periodos distintos con el mismo nombre (dos ediciones de un curso)
                for k, v in b.items():
                    if k not in ('_urls', 'fuentes', 'sesiones', 'descripcion') and not a.get(k) and v:
                        a[k] = v
                if len(b.get('descripcion') or '') > len(a.get('descripcion') or ''):
                    a['descripcion'] = b['descripcion']
                nombres = {f['nombre'] for f in a['fuentes']}
                a['fuentes'] = a['fuentes'] + [f for f in b['fuentes'] if f['nombre'] not in nombres]
                if a.get('sesiones') or b.get('sesiones'):
                    a['sesiones'] = sorted(set(a.get('sesiones') or [a['inicio']]) | set(b.get('sesiones') or [b['inicio']]))[:40]
                a['fin'] = max(a.get('fin') or a['inicio'], b.get('fin') or b['inicio'])
                a['_urls'] |= b['_urls']
                fuera.add(id(b))
    out = [e for e in evs if id(e) not in fuera]
    for e in evs:
        e.pop('_urls', None)
    return out, len(fuera)


# ---------- lugar, dirección y título tal como se enseñan
_VIA = (r'(?:calle|c/|cl\.?|c\.|avda\.?|av\.?|avenida|plaza|pza\.?|pl\.?|paseo|p[ºo]\.?|ps\.?|camino|carretera|ctra\.?|ronda|glorieta|gta\.?|'
        r'traves[ií]a|costanilla|cuesta|pasaje|pje\.?|bulevar|rambla|rbla\.?|v[ií]a|carrer|passeig|pg\.?|pla[çc]a|avinguda|passatge|ptge\.?|'
        r'travessera|cam[ií]|moll|r[úu]a|praza)')
_VIA_EU = r'(?:kalea|etorbidea|enparantza|plaza|pasealekua|bidea|ibilbidea|zumarkalea|hiribidea|kaia)'


def lugar_dir(lugar, direccion=None):
    """(lugar, dirección). Si el nombre del lugar trae la dirección pegada («Independance Club, Calle Atocha 127, Madrid»),
    se separa: así el mismo sitio no cuenta como dos recintos (ni el mismo plan como dos) según cómo lo escriba la fuente."""
    l = re.sub(r'\s+', ' ', str(lugar or '')).strip(' ,;-') or None
    d = re.sub(r'\s+', ' ', str(direccion or '')).strip(' ,;-') or None
    if l:
        m = re.match(r'(?i)^(.{3,}?)\s*[,(\-–]\s*((?:' + _VIA + r'\s[^,]*(?:,\s*)?\d|[^,]*\s' + _VIA_EU + r',?\s*\d).*)$', l)
        if m and not re.match(r'(?i)^' + _VIA + r'\s', m.group(1)):
            l, resto = m.group(1).strip(' ,;-('), m.group(2).strip(' ,;-)')
            d = d or resto
    if d and l and fold(d) == fold(l):
        d = None
    return l, d


_SIGLAS = {'DJ', 'DJS', 'MC', 'TV', 'FM', 'UK', 'USA', 'EEUU', 'BSO', 'ONG', 'VOSE', 'VO', '3D', 'IA', 'LGTBI', 'LGTBIQ', 'EHU', 'UPV', 'CSIC', 'UNED',
           'B2B', 'AC', 'DC', 'BCN', 'NBA', 'ACB', 'FC', 'CF', 'CD', 'SD', 'RCD', 'OSE', 'BOS', 'ONE', 'OCNE', 'RTVE', 'TEDX'}
_MINUS = {'de', 'del', 'la', 'las', 'el', 'los', 'y', 'e', 'o', 'u', 'en', 'con', 'por', 'para', 'a', 'al', 'un', 'una', 'the', 'of', 'and',
          'i', 'd', 'l', 'els', 'les', 'amb', 'per', 'eta', 'edo', 'da', 'do', 'das', 'dos', 'vs', 'feat', 'x'}


def _capital(w, primero):
    b = re.sub(r'[^\wÀ-ÿ]', '', w)
    if b.upper() in _SIGLAS or re.fullmatch(r'[IVXLCDM]{2,}', b) or re.search(r'\d', b) or (len(b) <= 4 and '.' in w):
        return w
    low = w.lower()
    if not primero and re.sub(r'[^\wà-ÿ]', '', low) in _MINUS:
        return low
    return re.sub(r'[a-zà-ÿ]', lambda m: m.group(0).upper(), low, count=1)


def titulo_limpio(t):
    """El título como se enseña: sin «*NOU*», sin «Entradas … (11 de noviembre - Bilbao)» y sin gritar en mayúsculas.
    La clave del plan se sigue calculando con el título original, así que limpiar no crea planes nuevos."""
    s = re.sub(r'\s+', ' ', str(t or '')).strip()
    s = re.sub(r'\s*\*\s*N(?:OU|EW|UEVO|OVETAT)?\s*\*?\s*$', '', _NOVEDAD.sub(' ', s)).strip()
    if re.match(r'(?i)^entradas\s', s):
        s2 = re.sub(r'(?i)^entradas\s+(?:para\s+)?', '', _COLA_FECHA.sub('', s)).strip()
        s = s2 if len(s2) >= 3 else s
    letras = re.sub(r'[^A-Za-zÀ-ÿ]', '', s)
    if len(letras) >= 10 and letras == letras.upper() and len(s.split()) >= 2:
        partes, primero = [], True
        for w in s.split(' '):
            partes.append(_capital(w, primero))
            primero = bool(re.search(r'[:.–\-!?¡¿«"“(]$', w)) or not re.search(r'\w', w)
        s = ' '.join(partes)
    return re.sub(r'\s+', ' ', s).strip() or str(t or '').strip()
