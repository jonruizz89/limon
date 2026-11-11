// Limón · arranque de la app. Lo carga js/app.js cuando data.js tiene los planes y los archivos por tema ya se han ejecutado.
// Aquí solo está el ORDEN: cada paso es una función del archivo de su tema (inicia…), y los tres manejadores generales
// (clics, cambios y envíos) reparten cada evento entre las funciones de los temas. El orden es el de siempre: no cambiarlo
// sin comprobar qué usa cada paso de los anteriores.
iniciaDatos();              // base.js: los datos de la zona, las etiquetas, lo guardado en el dispositivo y la fecha de hoy
iniciaFiltros();            // filtros.js: filtros guardados, distancia, municipio elegido y planes nuevos
iniciaTemporada();          // temporadas.js: la temporada que toca hoy
iniciaFichas();             // compartir.js: ahorro de datos, botón atrás con una ficha abierta e icono de compartir
iniciaCalle();              // calle.js: cortes con mapa, estadios, lluvia y avisos
iniciaSocial();             // social.js: temas seguidos, diario y ventajas
iniciaCuenta();             // cuenta.js: instalar la app, avisos push, versión y vuelta a primer plano

// Cambios en casillas y desplegables: cada tema atiende los suyos, con las funciones cambio… de su archivo. Se prueban EN ESTE ORDEN y gana la
// primera que lo reconoce (devuelve algo distinto de false). No reordenar: hay controles dentro de otros.
const CAMBIOS = [
  cambioVentaja, cambioListaDePlan, cambioDemo, cambioPush, cambioAvisos
];
document.addEventListener('change', ev => { for (const f of CAMBIOS) if (f(ev)) return; });


// Envíos de formularios: cada tema atiende los suyos, con las funciones envio… de su archivo. Se prueban EN ESTE ORDEN y gana la
// primera que lo reconoce (devuelve algo distinto de false). No reordenar: hay controles dentro de otros.
const ENVIOS = [
  envioIdea, envioIdeaAdmin, envioPerfil, envioBuscarGente, envioSeguirTema, envioListaNueva, envioNota, envioInvitar, envioQuedada,
  envioPerfilCuenta, envioOrganizador
];
document.addEventListener('submit', ev => { for (const f of ENVIOS) if (f(ev)) return; });

iniciaFui();                // parati.js: «¿al final fuiste?»
iniciaFinde();              // compartir.js: «este finde», si ya está publicado
iniciaPagina();             // vistas.js: recuento por categoría, pestañas, nombre de la ciudad y pie
iniciaControles();          // vistas.js: controles de Para ti, Explorar e Intereses
iniciaMisCalles();          // calle.js: formulario de «mis calles»
iniciaBuscadorYOpciones();  // vistas.js: buscador de arriba y opciones de Perfil
iniciaGustosYCerca();       // parati.js: «cuéntanos qué te gusta» y «ahora cerca de ti»
iniciaAviso();              // base.js: botones del aviso (deshacer y cerrar)

// Clics: cada tema atiende los suyos, con las funciones clic… de su archivo. Se prueban EN ESTE ORDEN y gana la
// primera que lo reconoce (devuelve algo distinto de false). No reordenar: hay controles dentro de otros.
const CLICS = [
  clicEnlaceDeLaApp, clicCuenta, clicCakind, clicCaday, clicCadayGo, clicRmtema, clicRmtcat, clicAiRefresh, clicFtoggle, clicFset,
  clicFclear, clicCutmap, clicCutgo, clicRmstreet, clicFiltroDeTarjeta, clicExClear, clicGoto, clicSave, clicDismiss, clicWent,
  clicSheetClose, clicCityBtn, clicNuevosVer, clicInteresesRapido, clicTema, clicCuando, clicCalq, clicCalm, clicCald, clicCalok,
  clicInstalarNo, clicInstalar, clicQgrp, clicQver, clicQmas, clicSharev, clicIcs, clicShareFinde, clicZoneWider, clicZoneLocate, clicZoneHintX,
  clicCity, clicIdeas, clicProf, clicList, clicSocial, clicTopic, clicAddlist, clicRate, clicSocEdit, clicSocCancel, clicSocShare,
  clicSocContacts, clicYear, clicYearShare, clicListPub, clicListShare, clicListDel, clicListFollow, clicGoev, clicRoute, clicInvite,
  clicInviteCancel, clicReshare, clicFui, clicStatsDays, clicGotoEv, clicConsent, clicTarjeta, clicGrp, clicCat
];
document.addEventListener('click', ev => { for (const f of CLICS) if (f(ev)) return; });

iniciaPrimeraVista();       // vistas.js: la pestaña o el plan con el que se abre la app
iniciaCuentaVisible();      // cuenta.js: bloques de la cuenta y bajas de avisos desde un correo
iniciaQuedada();            // compartir.js: enlace de una quedada
iniciaPlegables();          // vistas.js: secciones plegables de Perfil
iniciaEnlacesExternos();    // base.js: clics en enlaces a las webs de los planes
renderSocialAll();
loadIdeas();
loadAffinity();
loadPast();
renderZoneHint();
initSheet();
iniciaVersion();            // cuenta.js: texto de la versión
iniciaEnlacesDirectos();    // vistas.js: ideas parecidas y enlaces ?fui, ?ideas, ?u y ?lista
entregaApp();               // base.js: lo que data.js necesita de la app (sincronizar con la cuenta, repintar…)
