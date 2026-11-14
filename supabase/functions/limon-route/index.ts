// Limón · ruta en coche entre dos puntos de una misma ciudad (OSRM), para comprobar cortes en el camino.
// El origen se redondea a ~100 m y la petición sale desde el servidor: OSRM no ve la IP ni la posición exacta del usuario.
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
// cualquier punto de España (península, Baleares y Canarias); además, origen y destino a menos de ~60 km
const inSpain = (p: unknown) => Array.isArray(p) && p.length === 2 && p.every((x) => typeof x === 'number' && isFinite(x)) &&
  p[0] > 27.5 && p[0] < 44 && p[1] > -18.5 && p[1] < 4.5;
const near = (a: number[], b: number[]) => Math.abs(a[0] - b[0]) < 0.55 && Math.abs(a[1] - b[1]) < 0.75;

// Freno para que nadie use esto como pasarela a OSRM: 20 rutas por minuto por origen y 300 por minuto en total.
// Se cuenta en la base de datos (rate_ok): en memoria no vale, porque cada petición puede caer en un servidor distinto.
// Del origen solo se guarda una huella que cambia cada día, nunca la dirección IP. Si el contador falla, se deja pasar.
const SB = Deno.env.get('SUPABASE_URL') || '';
const SKEY = (() => { try { return (Object.values(JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}')) as string[])[0]; } catch { return ''; } })() ||
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
async function cabe(key: string, max: number) {
  if (!SB || !SKEY) return true;
  try {
    const r = await fetch(`${SB}/rest/v1/rpc/rate_ok`, { method: 'POST', signal: AbortSignal.timeout(3000),
      headers: { apikey: SKEY, Authorization: `Bearer ${SKEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ p_key: key, p_max: max, p_window_s: 60 }) });
    return !r.ok || (await r.json()) !== false;
  } catch { return true; }
}
async function tooMany(ip: string) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('limon-ruta:' + ip + ':' + new Date().toISOString().slice(0, 10)));
  const h = [...new Uint8Array(d)].slice(0, 10).map((b) => b.toString(16).padStart(2, '0')).join('');
  const [uno, todos] = await Promise.all([cabe('ruta:' + h, 20), cabe('ruta:total', 300)]);
  return !uno || !todos;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'sin-ip';
    if (await tooMany(ip)) return json({ error: 'Demasiadas rutas seguidas. Espera un minuto.' }, 429);
    const { from, to } = await req.json();
    if (!inSpain(from) || !inSpain(to) || !near(from, to)) return json({ error: 'Solo calculo rutas dentro de la misma ciudad.' }, 400);
    const f = [Math.round(from[0] * 1000) / 1000, Math.round(from[1] * 1000) / 1000];
    const u = `https://router.project-osrm.org/route/v1/driving/${f[1]},${f[0]};${to[1]},${to[0]}?overview=full&geometries=geojson`;
    const r = await fetch(u, { headers: { 'User-Agent': 'LimonPlanes/1.0 (+https://limonplanes.com)' } });
    if (!r.ok) return json({ error: 'El servicio de rutas no responde.' }, 502);
    const j = await r.json();
    const rt = j.routes && j.routes[0];
    if (!rt) return json({ error: 'No encuentro una ruta.' }, 404);
    return json({ distance: rt.distance, duration: rt.duration, line: rt.geometry.coordinates.map((c: number[]) => [c[1], c[0]]) });
  } catch (_e) {
    return json({ error: 'No he podido calcular la ruta.' }, 500);
  }
});
