# Changelog

Todos los cambios notables de este proyecto se documentan en este archivo.
El formato sigue [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y el proyecto usa [Versionado Semántico](https://semver.org/lang/es/).

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
