"""http_only (load_supabase.py): a la app solo llegan enlaces http(s) bien formados."""
import unittest
from cargar import cargar

http_only = cargar('load_supabase.py', ['http_only'])['http_only']


class HttpOnly(unittest.TestCase):
    def test_enlaces_normales(self):
        self.assertEqual(http_only('https://www.teatroreal.es/es/espectaculo/carmen'), 'https://www.teatroreal.es/es/espectaculo/carmen')
        self.assertEqual(http_only('http://www.madrid.es/sites/v/index.jsp?vgnextoid=43120e'), 'http://www.madrid.es/sites/v/index.jsp?vgnextoid=43120e')
        self.assertEqual(http_only('  https://sala.es/agenda \n'), 'https://sala.es/agenda')
        self.assertEqual(http_only('HTTPS://Sala.es/Agenda'), 'HTTPS://Sala.es/Agenda')

    def test_enlace_entre_comillas_angulares(self):
        # la IA a veces devuelve el enlace entre ‹ › (como se lo damos), solo o pegado a la web base
        self.assertEqual(http_only('‹https://entradas.sala.es/e/123›'), 'https://entradas.sala.es/e/123')
        self.assertEqual(http_only('https://www.sala.es/‹https://entradas.sala.es/e/123›'), 'https://entradas.sala.es/e/123')
        self.assertEqual(http_only('https://www.sala.es/%E2%80%B9https://entradas.sala.es/e/123%E2%80%BA'), 'https://entradas.sala.es/e/123')
        self.assertEqual(http_only('https://www.sala.es/%e2%80%b9https://entradas.sala.es/e/123%e2%80%ba'), 'https://entradas.sala.es/e/123')
        self.assertEqual(http_only('‹ www.sala.es/agenda ›'), 'https://www.sala.es/agenda')

    def test_una_sola_barra(self):
        self.assertEqual(http_only('https:/sala.es/agenda'), 'https://sala.es/agenda')
        self.assertEqual(http_only('http:/sala.es'), 'http://sala.es')
        self.assertEqual(http_only('‹https:/sala.es/agenda›'), 'https://sala.es/agenda')
        self.assertEqual(http_only('https://sala.es/a'), 'https://sala.es/a')  # las dos barras no se tocan

    def test_sin_esquema_se_completa(self):
        self.assertEqual(http_only('www.sala.es/agenda'), 'https://www.sala.es/agenda')
        self.assertEqual(http_only('sala.es'), 'https://sala.es')
        self.assertEqual(http_only('kultura.getxo.eus/eu/agenda/123'), 'https://kultura.getxo.eus/eu/agenda/123')

    def test_lo_que_no_es_un_enlace_web_se_descarta(self):
        for u in [None, '', '   ', 'javascript:alert(1)', 'JavaScript:void(0)', '‹javascript:alert(1)›', 'data:text/html,<script>alert(1)</script>',
                  'mailto:info@sala.es', 'tel:+34910000000', 'ftp://sala.es/archivo', '/agenda/evento-1', '#', 'Consultar web', 'sala',
                  'javascript://sala.es/%0Aalert(1)']:
            self.assertIsNone(http_only(u), repr(u))


if __name__ == '__main__':
    unittest.main()
