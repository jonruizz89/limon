"""Pruebas de calidad.py con casos reales de la base. Uso: python3 tests/test_calidad.py (desde engine/)."""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))
import calidad as C

HORAS = [
    ('18:00:00', '18:00'), ('17.00', '17:00'), ('11:00 h', '11:00'), ('--', None), ('00:00', None), ('', None), (None, None),
    ('19:30', '19:30'), ('23:59 a 07:30', '23:59 a 07:30'), ('00:30 a 06:00', '00:30 a 06:00'),
    ('Consultar Cartelera', 'Consultar Cartelera'), ('18:00 (puertas 17:30)', '18:00 (puertas 17:30)'),
    ('Apertura de puertas: 17:30 h Concierto: 19:00 h', 'Apertura de puertas: 17:30 · Concierto: 19:00'),
    ('19; 19:30 / 20; 19:00', '19: 19:30 / 20: 19:00'), ('28: 19:30 / 29: 19:00', '28: 19:30 / 29: 19:00'),
    ('De martes a viernes: 18:00-23:00. Sábados: 12', 'De martes a viernes: 18:00-23:00. Sábados'),
    ('10:00 / 11:00 / 12:00 / 18:0', '10:00 / 11:00 / 12:00'), ('Viernes y sábados 18:00- 21:00 / Domingos y festivos 11:30-1', 'Viernes y sábados 18:00- 21:00 / Domingos y festivos 11:30'),
    ('Platea: 22,50 € Anfiteatro: 19,50 €', None), ('Martes a viernes: 16:00?20:30', 'Martes a viernes: 16:00-20:30'), ('4 horas a la semana', '4 horas a la semana'), ('01:00', '01:00'),
    ('Lunes a sábado: 10:00 - 20:00 h Domingos y fe', 'Lunes a sábado: 10:00 - 20:00 · Domingos y fe'),
    ('18:00 a 20:00 (primera sesión: de 17:00 a 19:', '18:00 a 20:00'), ('10:00 + 11:00', '10:00 + 11:00'),
    ('17:00-19:00 (hora aproximada)', '17:00-19:00 (hora aproximada)'), ('Mar-sáb: 18:30 h Domingos: 17:00 h', 'Mar-sáb: 18:30 · Domingos: 17:00'),
    ('12, 13 y 14 noviembre: 20:00 h 15 noviembre: 19:00 h', '12, 13 y 14 noviembre: 20:00 · 15 noviembre: 19:00'), ('8:15 a 13:50', '8:15 a 13:50'),
]
TEXTOS = [
    ('Concierto a las 19:30 en la sala grande.', '19:30'), ('Apertura de puertas: 19:00. Concierto a las 20:00', None),
    ('Película de 1960. Duración: 1:45 h.', None), ('Taller de 17:00 a 19:00 h', None), ('Entrada 12.50 € anticipada', None),
    ('El sábado, a las 12 h, visita guiada', '12:00'), ('Sin hora', None), ('Empieza a las 20.30 h.', '20:30'), ('Sesión golfa a las 01:00', None),
    ('Hora: 18:00. Entrada libre', '18:00'), ('Juvenil: de 19 a 20:30 horas.', None), ('Viernes: de 17:30 a 20:30 horas. Sábados: de 10:00 hasta las 13:30 horas', None),
    ('Ciclo 22 y 23 de octubre a las 12:30 y las 18:30', None), ('Taller de 2 horas de duración', None), ('(De 8 a 12 años) Taller familiar', None), ('20:00 h', '20:00'), ('Del 12.11 al 15.11', None),
]
mal = 0
for a, b in HORAS:
    r = C.norm_hora(a)
    if r != b:
        mal += 1; print('norm_hora', repr(a), '→', repr(r), 'esperado', repr(b))
for a, b in TEXTOS:
    r = C.hora_de_texto(a)
    if r != b:
        mal += 1; print('hora_de_texto', repr(a), '→', repr(r), 'esperado', repr(b))
MISMO = [('"Esencia"', 'Esencia'), ('Concert "Frazey Ford"', 'Frazey Ford'), ('Concert "Jacob Banks', 'Jacob Banks'),
         ('Entradas Jóse Rafael Guzmán: "Cositas bonitas" (11 de noviembre - Bilb', 'Cositas bonitas'),
         ('Ciclo "Emakume zientzialarien argitan" 2026: "Trantsizio energetikoaz hausnartzen"', 'Trantsizio energetikoaz hausnartzen'),
         ('Umore 2027: Galder varas: "Esto no es una terapia"', 'Esto no es una terapia'), ('Musikagileak 2026: Quatuor Béla', 'Quatuor Béla'),
         ('VANTA CLUB', 'Vanta Club'), ('Bateria', 'Batería'), ('Espectacle familiar "El monstre de colors"', 'El monstre de colors'),
         ("Espectacle Musical 'Germans de sang'", 'Germans de Sang'), ("Taller 'Ganxet' *NOU*", "Taller 'Ganxet'"),
         ('Exposición Vidas de un mismo tiempo. Fotografía social', 'Vidas de un mismo tiempo. Fotografía social')]
DISTINTO = [("Taller per a la gent gran 'Sardanes'", "Taller per a la gent gran 'Tai-txi'"), ("Taller 'Cremalleres: Iniciació'", "Taller 'Cremalleres: Avançat'"),
            ('Curso anual de K-POP', 'Curso anual de teatro'), ("Mojo Workin' 2027: Natty Bo with Dandy Fever", "Mojo Workin' 2027"),
            ('Circuito Mujeres en escena 2026: "Invita la casa"', 'Circuito Mujeres en escena 2026'), ('Midfulness', 'Yoga y midfulness'),
            ('Club de lectura para jóvenes (10-13 años): "Pikolo"', 'Club de lectura para jóvenes (14-18 años): "Utzi kontatzen"'),
            ("Taller 'Ioga relaxació'", "Taller 'Ioga restauratiu'"), ('Concierto: MASKAK', 'Concierto de Navidad: KALAKAN'),
            ('Tartalo 2026: "Mitología Vasca"', 'Tartalo 2026: "Mesa redonda sobre el mito"')]
for a, b in MISMO:
    if not C.mismo_titulo(a, b):
        mal += 1; print('debería ser el mismo:', a, '|', b)
for a, b in DISTINTO:
    if C.mismo_titulo(a, b):
        mal += 1; print('no debería ser el mismo:', a, '|', b)
for u, ok in [('https://altxerri.com/', False), ('https://www.tartalogasteiz.com/es/actividades', False), ('https://www.ecartelera.com/peliculas//', False),
              ('https://auditoriozaragoza.com/programacion/el-lago-de-los-cisnes-11/?o=3', True), ('https://tickets.donostiakultura.eus/selection/event/date?productId=102', True)]:
    if bool(C.url_ficha(u)) != ok:
        mal += 1; print('url_ficha', u)


def ev(t, lugar, ini, hora=None, url=None, fuente='A', fin=None, **k):
    return dict({'titulo': t, 'lugar': lugar, 'inicio': ini, 'fin': fin or ini, 'hora': hora, 'fuentes': [{'nombre': fuente, 'url': url}], 'sesiones': []}, **k)


casos = [  # (planes, cuántos deben quedar)
    ([ev('"Esencia"', 'Teatro Principal', '2026-11-13', '19:30', fuente='KK'), ev('Esencia', 'Antzoki Zaharra', '2026-11-13', '19:30', fuente='DK', lat=43.3, lng=-1.98)], 2),
    ([ev('"Esencia"', 'Teatro Principal', '2026-11-13', '19:30', fuente='KK', lat=43.3001, lng=-1.9801), ev('Esencia', 'Antzoki Zaharra', '2026-11-13', '19:30', fuente='DK', lat=43.3, lng=-1.98)], 1),
    ([ev('Enperadorearen kondaira', 'Larratxo Kultur Etxea', '2026-11-14', '18:00'), ev('Enperadorearen kondaira', 'Larratxo K.E.', '2026-11-14', '18:00', fuente='B')], 1),
    ([ev('EL LAGO DE LOS CISNES', 'Auditorio de Zaragoza', '2026-11-23', '20:00', 'https://auditoriozaragoza.com/programacion/el-lago-de-los-cisnes-11/?o=3', fin='2026-12-22'),
      ev('EL LAGO DE LOS CISNES', 'Sala Mozart', '2026-11-23', '20:00', 'https://auditoriozaragoza.com/programacion/el-lago-de-los-cisnes-11/', fuente='B')], 1),
    ([ev('Klasikoak 2026: "La amiga"', 'Artium Museoa', '2026-11-18', '19:00', 'https://filmoteka.eus/es/programacion/la-amiga'),
      ev('La amiga (Jeanine Meerapfel, 1988)', 'Artium Museoa, Museo de Arte Contemporáneo', '2026-11-18', '19:00', 'https://filmoteka.eus/es/programacion/la-amiga', fuente='B')], 1),
    ([ev('Club de lectura', 'Biblioteca', '2026-12-11', '18:15'), ev('Club de lectura', 'Biblioteca', '2026-12-11', '16:30', fuente='B')], 2),
    ([ev('Txorinho', 'Altxerri', '2026-11-20', url='https://altxerri.com/'), ev('Pablo Torti 4tet', 'Altxerri', '2026-11-20', url='https://altxerri.com/', fuente='B')], 2),
    ([ev('Vanta Club', 'Independance Club', '2026-12-24', '23:59 a 07:30'), ev('VANTA CLUB', 'Independance Club, Calle Atocha 127, Madrid', '2026-12-24', '23:59 a 07:30')], 1),
    ([ev('Curso de cerámica', 'Centro Cívico', '2026-10-01', fin='2026-12-17'), ev('Curso de cerámica', 'Centro Cívico', '2026-10-01', fin='2027-05-27', fuente='B')], 2),
]
for lst, n in casos:
    out, _ = C.unir_duplicados(lst)
    if len(out) != n:
        mal += 1; print('unir_duplicados:', [e['titulo'] for e in lst], '→', len(out), 'esperado', n)
r, _ = C.unir_duplicados([ev('A largo plazo', 'Sala X', '2026-11-20', None, 'https://x.es/eventos/a-largo-plazo-2026', 'F1'), ev('A largo plazo', 'Sala X', '2026-11-20', '20:00', 'https://x.es/eventos/a-largo-plazo-2026', 'F2')])
if not (len(r) == 1 and r[0]['hora'] == '20:00' and {f['nombre'] for f in r[0]['fuentes']} == {'F1', 'F2'}):
    mal += 1; print('la unión no hereda hora o fuentes', r)
for a, b in [('Independance Club, Calle Atocha 127, Madrid', ('Independance Club', 'Calle Atocha 127, Madrid')), ('Sala X (Calle Mayor 3)', ('Sala X', 'Calle Mayor 3')),
             ('Artium Museoa, Museo de Arte Contemporáneo', ('Artium Museoa, Museo de Arte Contemporáneo', None)), ('Carrer Nou de la Rambla 111', ('Carrer Nou de la Rambla 111', None)),
             ('Baztartxo Udal Antzokia (Azkoitia)', ('Baztartxo Udal Antzokia (Azkoitia)', None)), ('Teatro Arriaga, Arriaga Plaza, 1', ('Teatro Arriaga', 'Arriaga Plaza, 1'))]:
    if C.lugar_dir(a) != b:
        mal += 1; print('lugar_dir', a, '→', C.lugar_dir(a))
for a, b in [("Taller 'Ganxet' *NOU*", "Taller 'Ganxet'"), ('Entradas La Mare (29 de enero - Donostia/San Sebastián)', 'La Mare'), ('EL LAGO DE LOS CISNES', 'El Lago de los Cisnes'),
             ('KTULU', 'KTULU'), ('DJ SET: XIV ANIVERSARIO DE LA SALA', 'DJ Set: XIV Aniversario de la Sala'), ('Negufest 2027: LOS ENEMIGOS', 'Negufest 2027: LOS ENEMIGOS'),
             ('Entradas Hard GZ (10 y 11 de diciembre - Bilbao)', 'Hard GZ'), ('Concert "Frazey Ford"', 'Concert "Frazey Ford"')]:
    if C.titulo_limpio(a) != b:
        mal += 1; print('titulo_limpio', a, '→', C.titulo_limpio(a))
print('fallos:', mal)
sys.exit(1 if mal else 0)
