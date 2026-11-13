"""web/config.js elige la base de datos según la dirección (pruebas o producción); el motor debe leer siempre la de producción."""
import os, re, unittest

CFG = open(os.path.join(os.path.dirname(__file__), '..', '..', '..', 'web', 'config.js')).read()


class ConfigWeb(unittest.TestCase):
    def test_motor_lee_produccion(self):
        url = re.search(r"supabaseUrl:[^\n]*'([^']+)'\s*,", CFG).group(1)
        key = re.search(r"supabaseKey:[^\n]*'([^']+)'\s*,", CFG).group(1)
        self.assertEqual(url, 'https://pxeqbxxfsrvsxcdfiddc.supabase.co')
        self.assertTrue(key.startswith('sb_publishable_'))

    def test_los_scripts_usan_esa_lectura(self):
        src = os.path.join(os.path.dirname(__file__), '..', '..', 'src')
        for f in ('site.py', 'export_events.py', 'x_post.py'):
            self.assertIn(r"supabaseUrl:[^\n]*'([^']+)'\s*,", open(os.path.join(src, f)).read(), f)


if __name__ == '__main__':
    unittest.main()
