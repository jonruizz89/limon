"""Datos abiertos (generic/formats.py, mapped_events): columna de lugar de reserva y distrito oficial (agenda de Málaga)."""
import re
import unicodedata
import unittest
from zoneinfo import ZoneInfo
from cargar import cargar

mapped_events = cargar('generic/formats.py', ['clean', 'parse_when', '_num', 'mapped_events'], re=re, unicodedata=unicodedata,
                       TZ=ZoneInfo('Europe/Madrid'))['mapped_events']

MAPA = {'titulo': 'NOMBRE', 'inicio': 'F_INICIO', 'fin': 'F_FIN', 'hora': 'HORARIO', 'lugar': 'OTROS_LUGARES', 'lugar2': 'EQP_DESCRIPCION',
        'direccion': 'EQP_NOMBRECALLE', 'distrito': 'EQP_DISTRITO', 'municipio': None, 'url': 'DIRECCION_WEB', 'es_agenda': True}
DISTRITOS = ['Centro', 'Este', 'Bailén-Miraflores', 'Carretera de Cádiz', 'Puerto de la Torre', 'Teatinos-Universidad']


def fila(**kw):
    return {'NOMBRE': 'Taller de cerámica', 'F_INICIO': '20/11/2026 00:00:00', 'F_FIN': '20/11/2026 00:00:00', 'HORARIO': '17 a 20 horas',
            'OTROS_LUGARES': '', 'EQP_DESCRIPCION': '', 'EQP_NOMBRECALLE': '', 'EQP_DISTRITO': '', 'DIRECCION_WEB': '', **kw}


def leer(distritos=DISTRITOS, **kw):
    return mapped_events([fila(**kw)], MAPA, 'https://datosabiertos.malaga.eu/dataset/agenda-2026', distritos)[0]


class DatosAbiertos(unittest.TestCase):
    def test_lugar_de_la_segunda_columna_si_la_primera_viene_vacia(self):
        e = leer(EQP_DESCRIPCION='Museo Carmen Thyssen Málaga', EQP_NOMBRECALLE='CALLE COMPAÑÍA, 10')
        self.assertEqual(e['lugar'], 'Museo Carmen Thyssen Málaga')
        self.assertEqual(e['direccion'], 'CALLE COMPAÑÍA, 10')

    def test_la_primera_columna_manda_si_trae_algo(self):
        self.assertEqual(leer(OTROS_LUGARES='MUCAC. Sede La Coracha', EQP_DESCRIPCION='Otro sitio')['lugar'], 'MUCAC. Sede La Coracha')

    def test_sin_ninguna_no_hay_lugar(self):
        self.assertIsNone(leer()['lugar'])

    def test_distrito_oficial_con_su_nombre_exacto(self):
        self.assertEqual(leer(EQP_DISTRITO='CARRETERA DE CADIZ')['distrito'], 'Carretera de Cádiz')
        self.assertEqual(leer(EQP_DISTRITO='BAILEN-MIRAFLORES')['distrito'], 'Bailén-Miraflores')
        self.assertEqual(leer(EQP_DISTRITO='PUERTO DE LA TORRE')['distrito'], 'Puerto de la Torre')
        self.assertEqual(leer(EQP_DISTRITO='Teatinos - Universidad')['distrito'], 'Teatinos-Universidad')

    def test_un_distrito_que_no_es_de_la_ciudad_no_se_guarda(self):
        self.assertIsNone(leer(EQP_DISTRITO='TORREMOLINOS')['distrito'])
        self.assertIsNone(leer(EQP_DISTRITO='')['distrito'])
        self.assertIsNone(leer(distritos=None, EQP_DISTRITO='CENTRO')['distrito'], 'sin lista de distritos no se inventa')

    def test_el_distrito_no_se_toma_por_municipio(self):
        # antes la columna del distrito iba como «municipio» y el plan se descartaba por «no ser de Málaga»
        self.assertIsNone(leer(EQP_DISTRITO='CENTRO')['municipio'])

    def test_fechas_y_enlace(self):
        e = leer()
        self.assertEqual((e['inicio'], e['fin'], e['hora']), ('2026-11-20', '2026-11-20', '17 a 20 horas'))
        self.assertEqual(e['url'], 'https://datosabiertos.malaga.eu/dataset/agenda-2026')


if __name__ == '__main__':
    unittest.main()
