"""Protección ante caídas de una fuente: si de golpe trae casi nada, no se retiran sus planes de antes."""
import unittest
from cargar import cargar

caida = cargar('generic/extract.py', ['caida'])['caida']
ls = cargar('load_supabase.py', ['fuente_floja', 'retirada_sospechosa'])
fuente_floja, retirada_sospechosa = ls['fuente_floja'], ls['retirada_sospechosa']


class CaidaDeUnaFuente(unittest.TestCase):
    """Motor genérico (extract.py): caida(eventos de antes, eventos de hoy, días que lleva caída)."""

    def test_de_golpe_casi_nada_es_un_fallo(self):
        self.assertTrue(caida(40, 0, 0), 'la web no respondió')
        self.assertTrue(caida(40, 5, 0), 'la IA se quedó a medias')
        self.assertTrue(caida(40, 11, 1), 'menos del 30 %, segundo día')
        self.assertTrue(caida(3, 0, 0))

    def test_una_bajada_normal_no_es_un_fallo(self):
        self.assertFalse(caida(40, 12, 0), 'justo el 30 %')
        self.assertFalse(caida(40, 30, 0))
        self.assertFalse(caida(40, 55, 0), 'trae más que antes')

    def test_fuentes_pequenas_o_nuevas_no_cuentan(self):
        self.assertFalse(caida(2, 0, 0), 'solía traer 2: puede que hoy no tenga nada')
        self.assertFalse(caida(0, 0, 0), 'fuente nueva')

    def test_si_dura_tres_dias_es_de_verdad(self):
        self.assertTrue(caida(40, 0, 2))
        self.assertFalse(caida(40, 0, 3), 'al tercer día se acepta y se retiran sus planes')
        self.assertFalse(caida(40, 0, 10))


class RetiradaEnMadrid(unittest.TestCase):
    """Madrid (load_supabase.py): qué fuentes se dan por leídas y cuánto se puede retirar de una vez."""

    def test_fuente_floja(self):
        self.assertTrue(fuente_floja(0, 1200), 'la agenda municipal no ha llegado')
        self.assertTrue(fuente_floja(27, 40), 'menos del 70 %')
        self.assertFalse(fuente_floja(28, 40), 'justo el 70 %')
        self.assertFalse(fuente_floja(45, 40))
        self.assertFalse(fuente_floja(0, 2), 'fuente pequeña')
        self.assertFalse(fuente_floja(0, 0), 'fuente nueva')

    def test_retirada_sospechosa(self):
        self.assertFalse(retirada_sospechosa(30, 100), 'hasta 30 planes siempre se pueden retirar')
        self.assertTrue(retirada_sospechosa(31, 100))
        self.assertFalse(retirada_sospechosa(250, 2500), 'el 10 % justo')
        self.assertTrue(retirada_sospechosa(251, 2500), 'más del 10 % de golpe')
        self.assertFalse(retirada_sospechosa(0, 0))


if __name__ == '__main__':
    unittest.main()
