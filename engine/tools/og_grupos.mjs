// Imágenes de vista previa (1200×630) por tipo de plan, para las fichas sin foto oficial: lo que se ve al compartir en
// WhatsApp, Telegram o X. Se generan una vez y se guardan en web/og/<grupo>.png.
// Uso: node engine/tools/og_grupos.mjs   (necesita Playwright; lee los grupos de web/datos/taxonomia.json)
import { chromium } from 'playwright';
import fs from 'node:fs';
const EMO = { musica: '🎵', escena: '🎭', arte: '🖼️', patrimonio: '🏛️', cine: '🎬', letras: '📚', ciencia: '🔬', gastro: '🍽️', aprender: '✏️', naturaleza: '🌿', ciudad: '🎉', deporte: '🏃', mascotas: '🐾', ferias: '🛍️', familia: '🧒', comunidad: '🤝' };
const tax = JSON.parse(fs.readFileSync('web/datos/taxonomia.json', 'utf8'));
const limon = fs.readFileSync('web/limon.svg', 'utf8');
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1200, height: 630 } });
for (const g of tax.grupos) {
  if (!EMO[g.id]) continue;
  await p.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>
    body{margin:0;width:1200px;height:630px;background:#FFD43B;font-family:'IBM Plex Sans','Inter',sans-serif;color:#231D02;display:flex;align-items:center}
    .e{width:330px;height:330px;margin:0 70px 0 90px;border-radius:50%;background:#FFF6CC;display:flex;align-items:center;justify-content:center;font-size:190px;box-shadow:0 18px 40px rgba(122,89,0,.18)}
    .t{flex:1;padding-right:70px}.m{display:flex;align-items:center;gap:14px;font-size:44px;font-weight:800;font-style:italic;letter-spacing:-1px}
    .m svg{width:58px;height:58px}h1{font-size:76px;line-height:1.02;margin:22px 0 18px;letter-spacing:-1.5px}p{font-size:32px;margin:0;line-height:1.3}
  </style></head><body><div class="e">${EMO[g.id]}</div><div class="t"><div class="m">${limon.replace(/<\?xml[^>]*>/, '')}limón</div>
  <h1>${g.name}</h1><p>Fecha, hora, lugar y precio de este plan, y muchos más en tu zona.</p></div></body></html>`);
  await p.waitForTimeout(150);
  await p.screenshot({ path: `web/og/${g.id}.png` });
  console.log('og/' + g.id + '.png');
}
await b.close();
