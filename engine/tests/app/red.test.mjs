// Seguridad: «pega el enlace de tu evento» lee una página desde el servidor. Solo puede leer servidores públicos.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ipPrivada, hostPublico } from '../../../supabase/functions/_shared/red.js';

test('direcciones privadas, locales y reservadas', () => {
  for (const ip of ['127.0.0.1', '10.0.0.5', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0',
    '224.0.0.1', '255.255.255.255', '198.18.0.1', '::1', '::', 'fe80::1', 'fd00::1', 'fc00::1', 'ff02::1', '::ffff:127.0.0.1', '::ffff:10.0.0.1',
    '64:ff9b::a00:1', '2001:db8::1', '[::1]', 'no-es-una-ip', '999.1.1.1']) assert.equal(ipPrivada(ip), true, ip);
});
test('direcciones públicas', () => {
  for (const ip of ['8.8.8.8', '93.184.216.34', '172.32.0.1', '100.128.0.1', '192.169.0.1', '2606:4700:4700::1111', '2a00:1450:4003:80f::200e',
    '::ffff:8.8.8.8']) assert.equal(ipPrivada(ip), false, ip);
});

const dnsDe = (tabla) => async (h, t) => (tabla[h] || {})[t] || [];
test('un dominio que apunta a una dirección interna no pasa', async () => {
  const dns = dnsDe({ 'malo.example.org': { A: ['169.254.169.254'] }, 'mixto.example.org': { A: ['93.184.216.34'], AAAA: ['::1'] },
    'bueno.example.org': { A: ['93.184.216.34'], AAAA: ['2606:4700:4700::1111'] }, 'vacio.example.org': {} });
  assert.equal(await hostPublico('malo.example.org', { dns }), false);
  assert.equal(await hostPublico('mixto.example.org', { dns }), false, 'basta una dirección interna para rechazarlo');
  assert.equal(await hostPublico('vacio.example.org', { dns }), false, 'si no resuelve, no se lee');
  assert.equal(await hostPublico('bueno.example.org', { dns }), true);
});
test('ni direcciones IP a pelo ni nombres internos', async () => {
  const dns = async () => ['93.184.216.34'];
  for (const h of ['127.0.0.1', '2130706433', '[::1]', 'localhost', 'intranet', 'servidor.local', 'db.internal', 'router.lan', ''])
    assert.equal(await hostPublico(h, { dns }), false, h);
});
test('sin DNS del sistema se pregunta por HTTPS', async () => {
  const fetchFn = async (u) => ({ json: async () => ({ Answer: /type=A$/.test(u) ? [{ type: 5, data: 'x.' }, { type: 1, data: '10.1.2.3' }] : [] }) });
  assert.equal(await hostPublico('rebote.example.org', { dns: async () => { throw new Error('no hay'); }, fetchFn }), false);
});
