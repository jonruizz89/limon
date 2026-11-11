"""Duplicados: igual() (load_supabase.py, el mismo plan ya cargado por otra fuente) y parecidos() (pipeline.py, Madrid)."""
import unittest
from cargar import cargar

ls = cargar('load_supabase.py', ['norm', 'igual'])
igual = lambda a, b: ls['igual'](ls['norm'](a), ls['norm'](b))
pl = cargar('pipeline.py', ['norm', 'clave_titulo', 'GENERICOS', 'LUGAR_VACIAS', 'mismo_lugar', 'parecidos'])
parecidos = lambda a, b, la='Teatro Real', lb='Teatro Real': pl['parecidos']({'titulo': a, 'lugar': la}, {'titulo': b, 'lugar': lb})


class Igual(unittest.TestCase):
    def test_mismo_titulo_con_otra_ortografia(self):
        self.assertTrue(igual('Los miserables', 'LOS MISERABLES'))
        self.assertTrue(igual('Concierto de Año Nuevo', 'Concierto de año nuevo.'))
        self.assertTrue(igual('¡Hola, Madrid!', 'Hola Madrid'))

    def test_uno_empieza_por_el_otro(self):
        self.assertTrue(igual('El lago de los cisnes', 'El lago de los cisnes. Ballet de Kiev'))
        self.assertFalse(igual('Carmen', 'Carmen la de Triana'), 'un título corto no basta como principio')

    def test_catalan_y_castellano(self):
        self.assertTrue(igual('Gèneres Fantàstics: Cinema i Literatura', 'Géneros Fantásticos: Cine y Literatura'))
        self.assertFalse(igual('Fira de Nadal', 'Feria de Abril'), 'parecidos pero cortos')

    def test_mismas_palabras_en_otro_orden(self):
        self.assertTrue(igual('JAZZMADRID26. Festival Internacional Jazz Madrid', 'Festival Internacional JAZZMADRID26'))
        self.assertFalse(igual('Festival de Jazz', 'Jazz en el festival'), 'menos de tres palabras con contenido')

    def test_planes_distintos(self):
        self.assertFalse(igual('Concierto de Navidad de la Orquesta Nacional', 'Concierto de Año Nuevo de la Orquesta Nacional'))
        self.assertFalse(igual('Visita guiada al Palacio de Liria', 'Visita guiada al Palacio de Cibeles'))
        self.assertFalse(igual('Taller de cerámica', 'Taller de acuarela'))
        self.assertFalse(igual('Rosalía', 'Rosario'))


class Parecidos(unittest.TestCase):
    def test_titulos_que_solo_cambian_en_palabras_vacias(self):
        self.assertTrue(parecidos('Exposición: El Greco y la pintura moderna', 'El Greco y la pintura moderna'))
        self.assertTrue(parecidos('Concierto de la Orquesta Nacional de España', 'Orquesta Nacional de España'))

    def test_uno_contiene_al_otro(self):
        self.assertTrue(parecidos('Festival de Otoño', 'Festival de Otoño 2026: programación completa'))

    def test_mismas_palabras_en_otro_orden(self):
        self.assertTrue(parecidos('JAZZMADRID26. Festival Internacional Jazz Madrid', 'Festival internacional JAZZMADRID26'))

    def test_casi_iguales(self):
        self.assertTrue(parecidos('La verbena de la Paloma', 'La verbena de la Palomaa'))

    def test_genericos_y_cortos_solo_en_el_mismo_sitio(self):
        self.assertTrue(parecidos('Visitas guiadas', 'Visitas guiadas', 'Museo del Prado', 'Museo Nacional del Prado'))
        self.assertFalse(parecidos('Visitas guiadas', 'Visitas guiadas', 'Museo del Prado', 'Palacio de Liria'))
        self.assertFalse(parecidos('Cuentacuentos', 'Cuentacuentos', 'Biblioteca Eugenio Trías', 'Biblioteca Iván de Vargas'))
        self.assertFalse(parecidos('Carmen', 'Carmen', 'Teatro Real', 'Teatro de la Zarzuela'))
        self.assertTrue(parecidos('Carmen', 'Carmen', 'Teatro Real', 'Teatro Real de Madrid'))
        self.assertTrue(parecidos('Cuentacuentos', 'Cuentacuentos', 'Biblioteca Eugenio Trías', 'Biblioteca Pública Municipal Eugenio Trías (Retiro)'))
        self.assertTrue(parecidos('Actividades', 'Actividades', 'Auditorio Nacional', 'Auditorio Nacional de Música'))

    def test_planes_distintos(self):
        self.assertFalse(parecidos('El lago de los cisnes', 'El cascanueces'))
        self.assertFalse(parecidos('Concierto de Navidad', 'Concierto de Año Nuevo'))
        self.assertFalse(parecidos('', 'El cascanueces'))
        self.assertFalse(parecidos('Exposición', 'Concierto'), 'títulos que se quedan vacíos al limpiar')


import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..', 'src'))
import calidad as C


class AnoYFechas(unittest.TestCase):
    def test_el_ano_al_final_no_cambia_el_plan(self):
        self.assertTrue(C.mismo_titulo('Construtec', 'Construtec 2026'))
        self.assertTrue(C.mismo_titulo('Smart Doors 2026', 'Smart Doors'))
        self.assertFalse(C.mismo_titulo('Festival de Otoño 2026', 'Festival de Otoño 2027'), 'otra edición')

    def test_fecha_que_no_cuadra_con_el_titulo(self):
        self.assertTrue(C.fecha_rara({'titulo': 'CONCIERTO DE AÑO NUEVO', 'inicio': '2026-11-12'}))
        self.assertFalse(C.fecha_rara({'titulo': 'Concierto de Año Nuevo', 'inicio': '2027-01-01'}))
        self.assertFalse(C.fecha_rara({'titulo': 'Fiesta de Nochevieja', 'inicio': '2026-12-31'}))
        self.assertFalse(C.fecha_rara({'titulo': 'Año nuevo chino Madrid 2027', 'inicio': '2027-02-04'}))


if __name__ == '__main__':
    unittest.main()
