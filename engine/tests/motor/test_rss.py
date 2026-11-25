"""RSS (generic/formats.py, feed_items): la descripción de cada entrada llega a la IA (en ella van las fechas, p. ej. Jimmy Jazz Gasteiz)."""
import html
import re
import unicodedata
import unittest
import xml.etree.ElementTree as ET
from cargar import cargar

feed_items = cargar('generic/formats.py', ['clean', 'feed_items'], re=re, unicodedata=unicodedata, html=html, ET=ET)['feed_items']

RSS = """<?xml version="1.0"?><rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/"><channel><title>Sala</title>
<item><title>Mateo Zikuta</title><link>https://sala.example/mateo/</link>
<description><![CDATA[<h3><strong>MATEO ZIKUTA</strong></h3> Jueves 26 Noviembre]]></description></item>
<item><title>Sin resumen</title><link>https://sala.example/otro/</link><description></description>
<content:encoded><![CDATA[<p>Viernes 27 Noviembre, 21:00</p>]]></content:encoded></item>
</channel></rss>"""

ATOM = """<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><entry><title>Taller</title>
<link href="https://sala.example/taller"/><summary>Sábado 28 de noviembre</summary></entry></feed>"""


class FeedItems(unittest.TestCase):
    def test_descripcion_con_fecha(self):
        it = feed_items(RSS)
        self.assertEqual(len(it), 2)
        self.assertIn('Jueves 26 Noviembre', it[0])
        self.assertIn('‹https://sala.example/mateo/›', it[0])

    def test_descripcion_vacia_usa_contenido(self):
        self.assertIn('Viernes 27 Noviembre', feed_items(RSS)[1])

    def test_atom(self):
        it = feed_items(ATOM)
        self.assertIn('Sábado 28 de noviembre', it[0])
        self.assertIn('‹https://sala.example/taller›', it[0])


if __name__ == '__main__':
    unittest.main()
