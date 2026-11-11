"""con_tipo_via (pipeline.py): esMadrid quita el tipo de vía («del Prado, s/n») y se recupera del callejero si no hay duda.
También sin_medianoche: la agenda municipal pone «00:00» cuando no sabe la hora."""
import unittest
from cargar import cargar

# callejero de prueba, con la forma del oficial: nombre normalizado → {(clase, ((impar_min, impar_max), (par_min, par_max)))}
CALLEJERO = {
    'del prado': {('Paseo', ((1, 99), (2, 100)))},
    'de alcala': {('Calle', ((1, 601), (2, 592)))},
    'de colon': {('Plaza', ((1, 5), (2, 4))), ('Calle', ((1, 21), (2, 24)))},
    'de espana': {('Plaza', ((1, 19), (2, 18))), ('Avenida', ((0, 0), (0, 0)))},
}
pl = cargar('pipeline.py', ['norm', 'con_tipo_via', 'sin_medianoche'], vias=lambda: CALLEJERO)
con_tipo_via, sin_medianoche = pl['con_tipo_via'], pl['sin_medianoche']


class ConTipoVia(unittest.TestCase):
    def test_recupera_el_tipo_cuando_solo_hay_uno(self):
        self.assertEqual(con_tipo_via('del Prado, s/n'), 'Paseo del Prado, s/n')
        self.assertEqual(con_tipo_via('de Alcalá, 42'), 'Calle de Alcalá, 42')
        self.assertEqual(con_tipo_via('De Alcalá'), 'Calle De Alcalá')

    def test_con_dos_tipos_decide_el_numero(self):
        self.assertEqual(con_tipo_via('de Colón, 15'), 'Calle de Colón, 15', 'el 15 solo existe en la calle')
        self.assertEqual(con_tipo_via('de Colón, 24'), 'Calle de Colón, 24')
        self.assertEqual(con_tipo_via('de Colón, 3'), 'de Colón, 3', 'el 3 existe en la plaza y en la calle: se deja como viene')
        self.assertEqual(con_tipo_via('de Colón, s/n'), 'de Colón, s/n')
        self.assertEqual(con_tipo_via('de Colón'), 'de Colón')

    def test_si_no_empieza_por_de_o_del_no_se_toca(self):
        self.assertEqual(con_tipo_via('Calle de Alcalá, 42'), 'Calle de Alcalá, 42')
        self.assertEqual(con_tipo_via('Gran Vía, 28'), 'Gran Vía, 28')
        self.assertEqual(con_tipo_via('Prado, 21'), 'Prado, 21')

    def test_calle_que_no_esta_en_el_callejero(self):
        self.assertEqual(con_tipo_via('de Ninguna Parte, 7'), 'de Ninguna Parte, 7')

    def test_vacio(self):
        self.assertIsNone(con_tipo_via(None))
        self.assertEqual(con_tipo_via(''), '')


class SinMedianoche(unittest.TestCase):
    def test_medianoche_es_sin_hora(self):
        for t in ['00:00', '0:00', '00:00:00', ' 00:00 ', '', None]:
            self.assertIsNone(sin_medianoche(t), repr(t))

    def test_las_demas_horas_se_quedan(self):
        self.assertEqual(sin_medianoche('19:30'), '19:30')
        self.assertEqual(sin_medianoche(' 10:00 '), '10:00')
        self.assertEqual(sin_medianoche('00:30'), '00:30')
        self.assertEqual(sin_medianoche('10:00:00'), '10:00:00')


if __name__ == '__main__':
    unittest.main()
