"""JSON-LD (generic/formats.py): «Location» con mayúscula (Fundación Unicaja) y el nombre con la dirección entre paréntesis."""
import json
import unittest
import urllib.parse
from zoneinfo import ZoneInfo
from cargar import cargar

jsonld_events = cargar('generic/formats.py', ['clean', 'parse_when', '_walk', '_is_now', '_num', 'jsonld_events'],
                       urllib=urllib, TZ=ZoneInfo('Europe/Madrid'))['jsonld_events']


def evento(**kw):
    e = {'@context': 'http://schema.org/', '@type': 'Event', 'name': 'Recital de piano', 'startDate': '2026-11-19 19:30:00', **kw}
    return jsonld_events([json.dumps(e)], 'https://www.fundacionunicaja.com/event/x/')[0]


class LugarJsonld(unittest.TestCase):
    def test_location_mayuscula_y_direccion_entre_parentesis(self):
        n = 'Sala Fundación Unicaja María Cristina (C. Marqués de Valdecañas, 2)'
        e = evento(Location={'@type': 'Place', 'name': n, 'address': n})
        self.assertEqual(e['lugar'], 'Sala Fundación Unicaja María Cristina')
        self.assertEqual(e['direccion'], 'C. Marqués de Valdecañas, 2')

    def test_parentesis_sin_numero_no_se_toca(self):
        e = evento(location={'@type': 'Place', 'name': 'Centro Fundación Unicaja Granada (Placeta de los Peregrinos)'})
        self.assertEqual(e['lugar'], 'Centro Fundación Unicaja Granada (Placeta de los Peregrinos)')

    def test_direccion_propia_manda(self):
        e = evento(location={'@type': 'Place', 'name': 'Teatro (sala 2)', 'address': {'streetAddress': 'Calle Mayor, 1'}})
        self.assertEqual(e['lugar'], 'Teatro (sala 2)')
        self.assertEqual(e['direccion'], 'Calle Mayor, 1')


if __name__ == '__main__':
    unittest.main()
