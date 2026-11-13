"""JSON-LD (generic/formats.py): un precio «0» no es gratis si la descripción dice que la entrada es de pago (Bizkaimusic)."""
import json
import unittest
import urllib.parse
from zoneinfo import ZoneInfo
from cargar import cargar

jsonld_events = cargar('generic/formats.py', ['clean', 'parse_when', '_walk', '_is_now', '_num', 'jsonld_events'],
                       urllib=urllib, TZ=ZoneInfo('Europe/Madrid'))['jsonld_events']


def evento(desc, price='0', **kw):
    e = {'@context': 'https://schema.org', '@type': 'Event', 'name': 'BRYAN ADAMS', 'startDate': '2026-11-13T20:30:00+01:00',
         'location': {'@type': 'Place', 'name': 'BIZKAIA ARENA - BEC'}, 'description': desc,
         'offers': {'@type': 'Offer', 'price': price, 'priceCurrency': 'EUR'}, **kw}
    return jsonld_events([json.dumps(e)], 'https://www.agenda.bizkaimusic.com/x')[0]


class PrecioJsonld(unittest.TestCase):
    def test_cero_pero_de_pago(self):
        e = evento('BRYAN ADAMS EL VIERNES 13 DE NOVIEMBRE EN BARAKALDO CON ENTRADA DE PAGO')
        self.assertFalse(e['gratis'])
        self.assertIsNone(e['precio'])  # sin «0 €»

    def test_cero_y_entrada_libre(self):
        self.assertTrue(evento('TIGRE Y DIAMANTE EN POWER RECORDS (BILBAO) CON ENTRADA LIBRE')['gratis'])

    def test_cero_sin_texto(self):
        self.assertTrue(evento(None)['gratis'])

    def test_gratis_explicito(self):
        self.assertTrue(evento('con entrada de pago', price=None, isAccessibleForFree=True)['gratis'])

    def test_con_precio(self):
        e = evento('concierto', price='54')
        self.assertFalse(e['gratis'])
        self.assertEqual(e['precio'], '54 €')


if __name__ == '__main__':
    unittest.main()
