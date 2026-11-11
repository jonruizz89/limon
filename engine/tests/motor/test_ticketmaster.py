"""Filtro de Ticketmaster (TM_NO, generic/connectors.py): fuera lo que se vende junto a un concierto y no es un plan."""
import unittest
from cargar import cargar

TM_NO = cargar('generic/connectors.py', ['TM_NO'])['TM_NO']
fuera = lambda nombre: bool(TM_NO.search(nombre))


class Ticketmaster(unittest.TestCase):
    def test_parkings_y_transporte(self):
        for n in ['Parking - Rosalía', 'PARKING Movistar Arena: Aitana', 'Aparcamiento Metropolitano - Bad Bunny', 'Bus oficial Mad Cool 2026',
                  'Autobús lanzadera BBK Live', 'Shuttle Bus - Primavera Sound', 'Transfer aeropuerto + entrada']:
            self.assertTrue(fuera(n), n)

    def test_vip_y_paquetes(self):
        for n in ['Paquete VIP - Dua Lipa', 'Dua Lipa | VIP Packages', 'Hospitality - Real Madrid vs FC Barcelona', 'Upgrade Golden Circle',
                  'Meet & Greet con Morat', 'Meet&Greet Morat', 'Palco privado - Final Copa del Rey', 'Suite Movistar Arena', 'Acceso preferente Aitana']:
            self.assertTrue(fuera(n), n)

    def test_pases_y_extras(self):
        for n in ['Fast Track - Coldplay', 'FastTrack Pass Mad Cool', 'Early Entry Pass - Karol G', 'All Access Pass', 'Pase VIP 3 días - Mad Cool',
                  'Abono de temporada 2026/27 Estudiantes', 'Tarjeta regalo Ticketmaster', 'Gift Card', 'Merchandising oficial Rosalía', 'Early Bird Bundle']:
            self.assertTrue(fuera(n), n)

    def test_los_planes_de_verdad_se_quedan(self):
        for n in ['Rosalía', 'Aitana - Cuarto Azul World Tour', 'Real Madrid vs FC Barcelona', 'Mad Cool Festival 2026 - Abono 3 días', 'El Rey León, el musical',
                  'Vipers Club Night', 'Busta Rhymes', 'Los Busters', 'Paquita Salas: el musical']:
            self.assertFalse(fuera(n), n)


if __name__ == '__main__':
    unittest.main()
