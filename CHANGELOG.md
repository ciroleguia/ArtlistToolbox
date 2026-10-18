# Changelog

Todos los cambios notables de este proyecto se documentan en este archivo.
El formato sigue [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y el proyecto usa [Versionado Semántico](https://semver.org/lang/es/).

## [0.6.0] - 2026-10-18

### Added
- **Flujo de descarga desactivado por defecto**: la extensión ahora funciona primero como caja de herramientas de biblioteca; el flujo de YouTube MP3 se activa explícitamente desde el panel o los ajustes. Las instalaciones existentes conservan su valor guardado.
- **Página de Ajustes completa** (`options/`) con absolutamente todo configurable: flujo, modo por defecto, umbral, apertura en segundo plano, veto por duración y su tolerancia, términos penalizados/preferidos, memoria, historial, ajustes de página, estadísticas, import/export de configuración y diagnóstico.
- **Memoria de matches**: recuerda el video elegido para cada pista (título + artista, hasta 500 entradas) y en modo Auto abre el conversor directamente, sin repetir la búsqueda. Se gestiona desde los ajustes (listado + borrado individual o total).
- **Veto por duración**: si la duración del mejor resultado difiere más de lo permitido (15 s por defecto, configurable), el modo Auto abre el picker en lugar de decidir solo.
- **Términos personalizados**: las listas de términos penalizados y preferidos son editables desde los ajustes (uno por línea), con restauración de valores por defecto.
- **Clics modificadores**: Alt+clic fuerza el picker, Shift+clic abre solo la búsqueda y Ctrl/Cmd+clic copia el link de YouTube resuelto sin abrir pestañas.
- **Atajos de teclado** (desactivables): `d` descarga la fila bajo el cursor, `c` copia su información, `/` enfoca el buscador y `q` activa el modo cola.
- **Copiar info de pista**: formato "Artista - Título (m:ss)" vía atajo `c` o menú contextual.
- **Modo compacto**: filas de la biblioteca más densas para ver más pistas por pantalla.
- **Historial de procesadas**: las pistas que ya pasaron por el flujo se atenúan (opcional) y avisan al repetirse.
- **Cola por lotes**: modo selección (`q` o desde el flujo), barra flotante con progreso, procesado secuencial en segundo plano (memoria y veto incluidos, pestañas en segundo plano) y resumen final con contadores. Cancelable.
- **Exportar CSV**: pistas visibles (botón del panel + menú contextual) y descargas recientes (ajustes). La columna de YouTube se enriquece desde la memoria/historial cuando se conoce el video.
- **Estadísticas**: total de descargas y desglose por día (últimos 14 días), visibles en panel y ajustes, con reseteo.
- **Menú contextual** en páginas de Artlist: copiar info de pista y exportar pistas visibles.
- Badge **"Usada antes"** en el picker para el video recordado, y el picker ahora también alimenta la memoria (aprende de cada elección manual).

### Changed
- El interruptor **Enable Downloader** ahora controla únicamente el flujo de descarga (botones, matching y apertura de pestañas); los ajustes de página como **Hide promo banner** son independientes y siguen activos con el flujo desactivado.
- El hero promocional se oculta **antes del primer render**, sin parpadeo: un guard de página (`src/early-guard.js`) corre en `document_start` y aplica el ajuste síncronamente usando una caché local del valor efectivo; el resto de la lógica de la extensión sigue ejecutándose en `document_idle` como antes.
- El popup se reorganizó: master switch, modos, umbral, toggles de página, exportar CSV, estadísticas y acceso a Ajustes.
- La extensión pasa a llamarse **Artlist Toolbox** (antes *Artlist Downloader*); el acceso a Ajustes es ahora un icono de engranaje en la cabecera del panel, junto al nombre.
- Los tests pasan a 34 casos (términos personalizados, veto por duración, fingerprints y CSV).

### Fixed
- **Modo compacto**: las filas ya no se agrandan. Las reglas genéricas anteriores podían *añadir* padding; ahora solo se reducen los paddings verticales reales verificados en la app: filas de música (`music-row`, 82→58 px) y tabla SFX (`AudioRow`, 93→61 px). Además, las filas de música se etiquetan por su `data-testid` estable, sin depender solo de la heurística por enlaces.
- **Popup**: se eliminó el estado vacío duplicado en *Recent downloads*; la lista ahora dice "No recent downloads." y la línea de estadísticas solo aparece cuando hay descargas registradas.

## [0.5.0] - 2026-10-15

### Added
- Tres modos de flujo configurables desde el panel: **Auto**, **Ask me** y **Search only** (con migración automática del antiguo interruptor `searchOnly`).
- Picker flotante en la página con los 5 mejores resultados de YouTube (miniatura, canal, duración y % de coincidencia) para elegir el video manualmente.
- Coincidencia por duración: se compara la duración de la pista con la del video y se pondera en el puntaje (título 55%, artista 30%, duración 15%).
- Penalización de versiones no deseadas: karaoke, cover, remix, slowed/sped up, nightcore, instrumental, 8D, mashup, etc.
- Umbral de coincidencia ajustable desde el panel (Match threshold).
- Historial de descargas recientes (últimos 10 videos) con acceso directo.
- Opción para abrir pestañas en segundo plano.
- Tema claro automático según la preferencia del sistema.
- Lógica de matching y parseo extraída a módulos puros (`src/lib/`) con 24 tests unitarios, workflows de CI y release automático con `.zip`.

### Changed
- El fondo ahora es un service worker como módulo ES (`"type": "module"`).
- El fetch a YouTube reintenta una vez y agrega parámetros `hl`/`gl` para resultados consistentes.

## [0.4.3] - 2026-10-15

### Added
- Interruptor **Open YouTube search only** en el panel: detiene el flujo en la búsqueda de YouTube sin abrir el conversor de MP3.

### Changed
- Nuevo dominio del conversor: `y2mate.gs` (antes `v3.y2mate.nu`), abriendo directamente la ruta `/mp3` del video.
- Color de acento de la interfaz actualizado a amarillo (`#F9DB54`) en el panel y en el contorno de los botones de descarga.
- Créditos del panel: ahora "developed by Ciro" con enlace a GitHub.

## [0.4.2] - 2026-08-25

### Added
- Tooltip dinámico con el título y artista detectados al pasar el cursor sobre el botón de descarga.

## [0.4.1] - 2026-07-15

### Added
- Interruptor general para activar o desactivar la extensión.
- Limitación de la mejora exclusivamente a las filas y páginas de canciones.
