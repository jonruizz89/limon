// Limón · comprobar que un nombre de servidor es público antes de pedirle una página desde el servidor.
// Sin esto, alguien podría dar un dominio suyo que apunte a una dirección interna (127.0.0.1, 10.x, 169.254.169.254…)
// y usar la función para leer lo que hay ahí. En JavaScript sin tipos para poder probarlo con node (engine/tests/app).

/** ¿Es una dirección privada, local o reservada? (IPv4 o IPv6, tal como las devuelve el DNS) */
export function ipPrivada(ip) {
  ip = String(ip || '').trim().toLowerCase().replace(/^\[|\]$/g, '');
  const m = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const [a, b, c] = [+m[1], +m[2], +m[3]];
    if ([a, b, c, +m[4]].some((x) => x > 255)) return true;
    return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 192 && b === 0 && (c === 0 || c === 2)) ||
      (a === 198 && (b === 18 || b === 19)) || (a === 198 && b === 51 && c === 100) || (a === 203 && b === 0 && c === 113);
  }
  if (!ip.includes(':')) return true;  // ni IPv4 ni IPv6: no se acepta
  const v4 = ip.match(/^(?:::ffff:|64:ff9b::)(\d{1,3}(?:\.\d{1,3}){3})$/);  // IPv4 dentro de IPv6
  if (v4) return ipPrivada(v4[1]);
  if (ip === '::' || ip === '::1' || /^::ffff:/.test(ip) || /^64:ff9b:/.test(ip)) return true;
  return /^(f[cd]|fe[89ab]|ff)/.test(ip) || /^2001:0?db8:/.test(ip) || /^0{0,4}:/.test(ip);
}

/** Direcciones a las que resuelve un nombre (A y AAAA). Usa el DNS del sistema si existe (Deno) y, si no, DNS sobre HTTPS. */
export async function resuelve(host, opts = {}) {
  const dns = opts.dns || (typeof Deno !== 'undefined' && Deno.resolveDns ? (h, t) => Deno.resolveDns(h, t) : null);
  const fetchFn = opts.fetchFn || fetch;
  const out = [];
  for (const tipo of ['A', 'AAAA']) {
    let ips = null;
    if (dns) { try { ips = await dns(host, tipo); } catch (_) { ips = null; } }
    if (!ips) {
      try {
        const r = await fetchFn(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(host)}&type=${tipo}`,
          { headers: { accept: 'application/dns-json' }, signal: AbortSignal.timeout(5000) });
        const j = await r.json();
        ips = (j.Answer || []).filter((a) => a.type === 1 || a.type === 28).map((a) => a.data);
      } catch (_) { ips = []; }
    }
    out.push(...ips);
  }
  return out;
}

/** true solo si el nombre resuelve a algo y ninguna de sus direcciones es privada o reservada */
export async function hostPublico(host, opts = {}) {
  host = String(host || '').toLowerCase().replace(/\.$/, '');
  if (!host || !host.includes('.') || /^(localhost|.*\.(local|internal|lan|localhost|home|corp|test|invalid|example))$/.test(host)) return false;
  if (/^[\d.]+$/.test(host) || host.includes(':') || host.startsWith('[')) return false;  // nada de direcciones IP a pelo
  const ips = await resuelve(host, opts);
  return ips.length > 0 && !ips.some(ipPrivada);
}
