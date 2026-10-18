# 🎵 Artlist Toolbox

<p align="center">
  <img src="icons/icon128.png" width="100" height="100" alt="Artlist Toolbox Logo">
</p>

<p align="center">
  <strong>Extensión de Chrome para facilitar la búsqueda y descarga en MP3 de pistas de música de Artlist.</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Manifest-V3-blue.svg" alt="Manifest V3">
  <img src="https://img.shields.io/badge/Versi%C3%B3n-0.6.0-brightgreen.svg" alt="Version 0.6.0">
  <img src="https://img.shields.io/badge/Licencia-MIT-orange.svg" alt="Licencia MIT">
  <img src="https://img.shields.io/badge/Chrome-Extension-informational.svg" alt="Chrome Extension">
</p>

---

## 📖 Descripción

**Artlist Toolbox** es una extensión de navegador (Manifest V3) creada para mejorar el flujo de trabajo en [Artlist.io](https://artlist.io). El repositorio conserva el nombre histórico `ArtlistMusicDownloader`. Funciona como una **caja de herramientas de biblioteca** (modo compacto, copiar info de pistas, atajos, exportar CSV, cola por lotes) y suma un **flujo opcional de descarga MP3** que intercepta los botones de descarga de las pistas para buscar de forma automática e inteligente la coincidencia más precisa (título, artista y duración) en YouTube y abrir directamente el conversor. El flujo de descarga viene **desactivado por defecto** y todo su comportamiento es configurable desde la página de Ajustes.

---

## ✨ Características Principales

- 🔍 **Búsqueda Automática Inteligente**: Detecta el título, artista y duración exactos de la pista en Artlist y busca el video correspondiente en YouTube.
- 🎯 **Algoritmo de Coincidencia (Smart Matching)**: Compara los resultados por similitud de título, artista y duración, y penaliza versiones no deseadas (karaoke, cover, remix, nightcore, etc.) y premia las preferidas (official audio, topic, etc.).
- 🧠 **Memoria de Matches**: Recuerda el video elegido para cada pista y, en modo Auto, abre el conversor directamente sin repetir la búsqueda. Gestionable desde los ajustes.
- ⏱️ **Veto por Duración**: Si la duración del mejor resultado difiere más de lo permitido (15 s por defecto, ajustable), el modo Auto abre el picker en lugar de decidir solo.
- 🔀 **Tres Modos de Flujo**: **Auto** (busca, elige y abre el conversor), **Ask me** (picker con los 5 mejores resultados) y **Search only** (solo la búsqueda de YouTube).
- 🎚️ **Umbral de Coincidencia Ajustable**: Slider para definir la confianza mínima antes de abrir el conversor automáticamente.
- ✍️ **Términos Personalizados**: Listas de términos penalizados y preferidos editables desde los ajustes, una por línea, con restauración de valores por defecto.
- 📥 **Apertura en Segundo Plano**: Opción para no robar el foco al abrir pestañas.
- ⌨️ **Atajos de Teclado** (desactivables): `d` para descargar la fila bajo el cursor, `c` para copiar su información, `/` para enfocar el buscador y `q` para el modo cola.
- 🖱️ **Clics Modificadores**: Alt+clic fuerza el picker, Shift+clic abre solo la búsqueda y Ctrl/Cmd+clic copia el link de YouTube resuelto sin abrir pestañas.
- 📋 **Copiar Info de Pista**: Formato "Artista - Título (m:ss)" vía atajo `c` o menú contextual.
- 📏 **Modo Compacto**: Filas más densas para ver más pistas por pantalla.
- ✅ **Historial de Procesadas**: Las pistas que ya pasaron por el flujo se atenúan (opcional) y avisan al repetirse.
- 📦 **Cola por Lotes**: Modo selección con barra flotante, procesado secuencial en segundo plano (aplica memoria y veto) y resumen final con contadores. Cancelable en cualquier momento.
- 📤 **Exportar CSV**: Pistas visibles (botón del panel + menú contextual) y descargas recientes (ajustes), con enlace de YouTube enriquecido desde la memoria/historial.
- 📊 **Estadísticas**: Total de descargas y desglose de los últimos 14 días, visibles en el panel y en los ajustes.
- 🧹 **Ocultar Banner Promocional (Opcional)**: Interruptor que elimina el hero de promoción de las páginas de biblioteca antes del primer render, dejando más espacio para la lista de canciones sin afectar la navegación ni la tabla de pistas, e independientemente del interruptor principal.
- 💬 **Tooltip Dinámico con Información de Pista**: Al pasar el cursor sobre el botón de descarga, muestra un tooltip flotante con el título y artista detectados antes de hacer clic.
- 🎛️ **Panel Popup**: Master switch (**desactivado por defecto**), modos de flujo, umbral, toggles de página, exportación rápida, descargas recientes, estadísticas y acceso directo a la página de Ajustes.
- 💾 **Configuración Exportable**: Export/import de la configuración completa en JSON, restauración de valores por defecto y panel de diagnóstico (versión, uso de almacenamiento y contadores).
- 🔒 **Enfocado Exclusivamente en Música**: Diseñado para operar únicamente en las secciones y filas de canciones, evitando interferir con otros elementos de la interfaz.
- ⚡ **Ligero y Seguro**: Desarrollado bajo la especificación **Manifest V3**, sin dependencias externas pesadas y optimizado para ejecutarse en segundo plano sin ralentizar la navegación.

---

## 🚀 Instalación

La extensión se puede instalar fácilmente en **Google Chrome**, **Brave**, **Microsoft Edge**, **Opera** o cualquier navegador basado en Chromium.

### Paso 1: Descargar el proyecto
- **Opción A (ZIP)**: Haz clic en el botón verde **`Code`** arriba y selecciona **`Download ZIP`**. Luego descomprime el archivo `.zip` en una carpeta accesible en tu computadora.
- **Opción B (Git)**: Clona el repositorio desde tu terminal:
  ```bash
  git clone https://github.com/ciroleguia/ArtlistMusicDownloader.git
  ```

### Paso 2: Cargar en el navegador
1. Abre tu navegador y dirígete a:
   - Chrome: `chrome://extensions`
   - Brave: `brave://extensions`
   - Edge: `edge://extensions`
2. En la esquina superior derecha, activa el **Modo de desarrollador** (*Developer mode*).
3. Haz clic en el botón **Cargar descomprimida** (*Load unpacked*).
4. Selecciona la carpeta donde descargaste o descomprimiste el proyecto (`ArtlistMusicDownloader`).
5. ¡Listo! La extensión quedará instalada y visible en tu barra de herramientas.

---

## 🎧 Modo de Uso

1. Ingresa a [Artlist.io](https://artlist.io) y abre cualquier biblioteca de canciones.
2. **Activa el flujo de descarga**: viene **desactivado por defecto**. Enciende **Enable Downloader** en el panel (o en la página de Ajustes). La caja de herramientas de biblioteca (modo compacto, copiar info, atajos, exportar CSV, cola) funciona **sin** activarlo.
3. Navega por el catálogo de canciones.
4. Al pasar el cursor por encima del botón de descarga, verás un tooltip indicando la canción detectada.
5. Haz clic en el botón de descarga (el comportamiento depende del modo elegido):
   - **Auto** (por defecto): la extensión procesa la canción en segundo plano, usa la memoria de matches o busca la mejor coincidencia en YouTube y abre la pestaña del conversor MP3. Si la duración no coincide (veto) o no hay una coincidencia con suficiente confianza, abre el picker o la búsqueda de YouTube.
   - **Ask me**: muestra un panel flotante con los mejores resultados (miniatura, canal, duración y % de coincidencia) para elegir el video. El video elegido se recuerda para la próxima vez (badge "Usada antes").
   - **Search only**: abre únicamente la búsqueda de YouTube, sin redirigir al conversor de MP3.
6. Extras del día a día:
   - `d` descarga la fila bajo el cursor · `c` copia su info · `/` enfoca el buscador · `q` activa el modo cola.
   - **Alt+clic** fuerza el picker para esa pista · **Shift+clic** abre solo la búsqueda · **Ctrl/Cmd+clic** copia el link de YouTube sin abrir pestañas.
   - Clic derecho sobre una pista para copiar su info, o sobre la página para exportar las pistas visibles a CSV.
7. Cola por lotes: presiona `q`, haz clic en las filas que quieras (se marcan en amarillo) y pulsa **Procesar** en la barra flotante. Se procesan en secuencia en segundo plano y el resumen final indica cuántas fueron al conversor, a búsqueda o con error.
8. (Opcional) Ajusta el umbral de coincidencia, la apertura en segundo plano, los toggles de página y todo lo demás desde la **página de Ajustes**.

---

## ⚙️ Página de Ajustes

Accesible desde el enlace **Settings** del panel (o automáticamente en Ajustes de la extensión). Secciones:

- **Download flow**: master switch, modo por defecto, umbral, apertura en segundo plano, veto por duración y su tolerancia.
- **Keywords**: términos penalizados y preferidos (uno por línea) con restauración de valores por defecto.
- **Match memory**: interruptor de memoria + listado de los últimos matches recordados con borrado individual.
- **Processed history**: pistas ya procesadas (usadas para la atenuación y el aviso de repetidas), con borrado individual o total.
- **Page & library**: hide promo banner, modo compacto, atenuación de procesadas y atajos de teclado.
- **Modifier clicks & menus**: referencia rápida de los clics modificadores y del menú contextual.
- **Stats**: total y desglose diario de los últimos 14 días, con reseteo.
- **Config**: export/import de la configuración completa en JSON, export de recientes a CSV y restauración de valores por defecto.
- **Diagnostics**: versión, uso de almacenamiento, contadores y botón para copiar el diagnóstico al portapapeles.

---

## 📁 Estructura del Repositorio

```text
ArtlistMusicDownloader/
├── manifest.json       # Configuración y permisos de la extensión (Manifest V3)
├── package.json        # Scripts de desarrollo (tests, validaciones, empaquetado)
├── icons/              # Íconos de la extensión en diferentes resoluciones (16, 48, 128)
├── popup/              # Panel popup (master switch, modos, export rápido, recientes)
│   ├── popup.html
│   ├── popup.css
│   └── popup.js
├── options/            # Página de Ajustes completa (toda la configuración)
│   ├── options.html
│   ├── options.css
│   └── options.js
├── src/                # Lógica principal de la extensión
│   ├── background.js   # Service Worker (mensajería, matching, memoria, stats, menú contextual)
│   ├── content.js      # Content Script (inyección en la página, tooltips, picker, cola, atajos)
│   ├── early-guard.js  # Guard de document_start (oculta el hero antes del primer render)
│   ├── styles.css      # Estilos de botones, picker, toasts y barra de cola en Artlist
│   └── lib/            # Lógica pura y testeable
│       ├── matcher.js  # Normalización, puntuación, veto por duración y fingerprints
│       ├── defaults.js # Valores por defecto compartidos de chrome.storage
│       ├── csv.js      # Generación de CSV y formato de duraciones
│       └── youtube.js  # Parseo de resultados de YouTube y URLs
├── test/               # Tests unitarios (node --test)
├── scripts/            # Utilidades de validación y empaquetado
├── .github/workflows/  # CI y publicación automática de releases
├── CHANGELOG.md        # Historial de cambios
├── LICENSE             # Licencia de código abierto (MIT)
└── README.md           # Documentación del proyecto
```

---

## 🛠️ Desarrollo

El proyecto no tiene dependencias externas: solo necesitas **Node.js 20+**.

```bash
npm test      # Tests unitarios de la lógica de matching y parseo (node --test)
npm run check # Validación de sintaxis y de archivos referenciados por manifest.json
npm run zip   # Genera dist/ArtlistMusicDownloader-v<versión>.zip listo para distribuir
```

Los workflows de GitHub Actions ejecutan estas validaciones en cada push y publican automáticamente el `.zip` en GitHub Releases al crear un tag `v*`.

---

## 📜 Licencia

Este proyecto está bajo la Licencia **MIT**. Consulta el archivo [LICENSE](LICENSE) para más detalles.

---

## ⚠️ Descargo de Responsabilidad (Disclaimer)

Este proyecto ha sido desarrollado únicamente con fines educativos y de investigación técnica para extensiones de navegador. No está afiliado, respaldado ni asociado de ninguna manera con Artlist, YouTube ni con los servicios de conversión de terceros. Los usuarios son responsables de respetar los términos de servicio y las leyes de propiedad intelectual aplicables.

---

## 👤 Autor

Desarrollado con ❤️ por **Ciro Leguía**  
- GitHub: [@ciroleguia](https://github.com/ciroleguia)