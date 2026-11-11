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
print('fallos:', mal)
sys.exit(1 if mal else 0)
