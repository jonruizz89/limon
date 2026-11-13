// Configuración pública de Limón. La clave publicable solo permite lo que dejan
// las políticas de seguridad por filas: leer el catálogo y gestionar los datos propios.
// La web de pruebas (pruebas.limonplanes.com y las vistas previas) usa su propia base de datos, «Limon pruebas»:
// nada de lo que se prueba toca cuentas reales ni el cupo de la de producción.
const LIMON_PRUEBAS = /^pruebas\.|\.pages\.dev$|\.workers\.dev$/.test(location.hostname);
window.BUREO_CONFIG = {
  supabaseUrl: LIMON_PRUEBAS ? 'https://vxxempphqdpzrzcrtfvw.supabase.co' : 'https://pxeqbxxfsrvsxcdfiddc.supabase.co',
  supabaseKey: LIMON_PRUEBAS ? 'sb_publishable_XHPJLeQbxzU9UJYkJ75qpw_H8Qdxo4s' : 'sb_publishable_1oeCUB3vf4XFVH-BS_Km5w_V6NgQgUY',
  city: 'madrid',
  google: true,
  // Cloudflare Turnstile: clave PÚBLICA del widget (la secreta va solo en Supabase → Auth → Bot protection). Vacía = sin captcha.
  turnstile: '0x4AAAAAAFfGPQYgv8dEk1md'
};
