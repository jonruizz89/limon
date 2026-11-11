// Limón · arranque. data.js llama a startApp cuando tiene los planes; aquí se carga js/inicio.js, que crea el estado, engancha los
// eventos y pinta la app. Los demás archivos de js/ (cargados antes, desde index.html) solo declaran funciones y valores fijos.
// Todos son scripts normales que comparten nombres entre sí: sin compilación ni dependencias.
(function () {
  const INICIO = document.currentScript.src.replace('js/app.js', 'js/inicio.js');  // misma carpeta y misma versión (?v=)
  // se adelanta su descarga mientras llegan los datos. Con el service worker ya activo no sirve (el navegador no reutiliza esa
  // descarga) y la petición es solo una comprobación rápida de que no ha cambiado.
  if (!(navigator.serviceWorker && navigator.serviceWorker.controller)) {
    const l = document.createElement('link');
    l.rel = 'preload'; l.as = 'script'; l.href = INICIO;
    document.head.appendChild(l);
  }
  // los archivos por tema (defer) se ejecutan al terminar de leerse la página, justo antes de DOMContentLoaded: si los datos
  // llegan antes, inicio.js espera a ese momento (este archivo se ejecuta mientras la página aún se está leyendo)
  const temas = new Promise((ya) => document.addEventListener('DOMContentLoaded', ya, { once: true }));
  function startApp(DATA, TAX, sync) {
    return new Promise((listo, fallo) => {
      let hecho = false, error = null;
      window.LIMON_INICIO = { DATA, TAX, sync, listo: (app) => { hecho = true; listo(app); } };
      const anota = (ev) => { error = error || ev.error || new Error(ev.message); };
      window.addEventListener('error', anota);
      const carga = () => {
        const s = document.createElement('script');
        s.src = INICIO;
        // si inicio.js falla a medias, data.js lo trata como hasta ahora: avisa de que no se han podido cargar los planes
        s.onload = () => { window.removeEventListener('error', anota); if (!hecho) fallo(error || new Error('js/inicio.js no ha terminado')); };
        s.onerror = () => { window.removeEventListener('error', anota); fallo(new Error('No se ha podido cargar js/inicio.js')); };
        document.body.appendChild(s);
      };
      temas.then(carga);
    });
  }
  bootLimon(startApp);
})();
