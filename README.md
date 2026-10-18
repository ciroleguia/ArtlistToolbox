# 🎵 Artlist Downloader

<p align="center">
  <img src="icons/icon128.png" width="100" height="100" alt="Artlist Downloader Logo">
</p>

<p align="center">
  <strong>Extensión de Chrome para facilitar la búsqueda y descarga en MP3 de pistas de música de Artlist.</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Manifest-V3-blue.svg" alt="Manifest V3">
  <img src="https://img.shields.io/badge/Versi%C3%B3n-0.5.0-brightgreen.svg" alt="Version 0.5.0">
  <img src="https://img.shields.io/badge/Licencia-MIT-orange.svg" alt="Licencia MIT">
  <img src="https://img.shields.io/badge/Chrome-Extension-informational.svg" alt="Chrome Extension">
</p>

---

## 📖 Descripción

**Artlist Downloader** es una extensión de navegador (Manifest V3) creada para mejorar el flujo de trabajo en [Artlist.io](https://artlist.io). Intercepta y optimiza los botones de descarga de pistas musicales para buscar de forma automática e inteligente la coincidencia más precisa (título, artista y duración) en YouTube y abrir directamente el conversor de descarga en formato MP3. Incluye tres modos de flujo (automático, elegir video y solo búsqueda) configurables desde el panel.

---

## ✨ Características Principales

- 🔍 **Búsqueda Automática Inteligente**: Detecta el título, artista y duración exactos de la pista en Artlist y busca el video correspondiente en YouTube.
- 🎯 **Algoritmo de Coincidencia (Smart Matching)**: Compara los resultados por similitud de título, artista y duración, y penaliza versiones no deseadas (karaoke, cover, remix, nightcore, etc.).
- 🔀 **Tres Modos de Flujo**:
  - **Auto**: busca, elige la mejor coincidencia y abre el conversor de MP3.
  - **Ask me**: muestra un panel con los mejores resultados para elegir manualmente el video.
  - **Search only**: abre únicamente la búsqueda de YouTube, sin conversor.
- 🎚️ **Umbral de Coincidencia Ajustable**: Slider en el panel para definir la confianza mínima antes de abrir el conversor automáticamente.
- 🕘 **Descargas Recientes**: Historial de los últimos 10 videos abiertos, con acceso directo desde el panel.
- 📥 **Apertura en Segundo Plano**: Opción para no robar el foco al abrir pestañas.
- 🧹 **Ocultar Banner Promocional (Opcional)**: Interruptor que elimina el hero de promoción de las páginas de biblioteca, dejando más espacio para la lista de canciones sin afectar la navegación ni la tabla de pistas, e independientemente del interruptor principal.
- 💬 **Tooltip Dinámico con Información de Pista**: Al pasar el cursor sobre el botón de descarga, muestra un tooltip flotante con el título y artista detectados antes de hacer clic.
- 🎛️ **Panel Popup con Switch ON/OFF**: Permite activar o desactivar el flujo de descarga en cualquier momento con un solo interruptor (los ajustes de página, como Hide promo banner, funcionan de forma independiente), además de incluir un botón de acceso directo a Artlist Music.
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

1. Ingresa a [Artlist.io](https://artlist.io) en tu navegador.
2. Navega por el catálogo de canciones.
3. Al pasar el cursor por encima del botón de descarga, verás un tooltip indicando la canción detectada.
4. Haz clic en el botón de descarga (el comportamiento depende del modo elegido en el panel):
   - **Auto** (por defecto): la extensión procesa la canción en segundo plano, encuentra el mejor resultado en YouTube y abre la pestaña del conversor MP3. Si no hay una coincidencia con suficiente confianza, abre la búsqueda directa de YouTube.
   - **Ask me**: muestra un panel flotante con los mejores resultados (miniatura, canal, duración y % de coincidencia) para elegir el video que se abrirá en el conversor.
   - **Search only**: abre únicamente la búsqueda de YouTube, sin redirigir al conversor de MP3.
5. (Opcional) Ajusta el **umbral de coincidencia** (Match threshold), la apertura en segundo plano y el interruptor **Hide promo banner** (oculta el hero promocional en las páginas de biblioteca) desde el panel.

---

## 📁 Estructura del Repositorio

```text
ArtlistMusicDownloader/
├── manifest.json       # Configuración y permisos de la extensión (Manifest V3)
├── package.json        # Scripts de desarrollo (tests, validaciones, empaquetado)
├── icons/              # Íconos de la extensión en diferentes resoluciones (16, 48, 128)
├── popup/              # Interfaz gráfica del panel popup (ajustes y accesos)
│   ├── popup.html
│   ├── popup.css
│   └── popup.js
├── src/                # Lógica principal de la extensión
│   ├── background.js   # Service Worker (mensajería, ajustes y apertura de pestañas)
│   ├── content.js      # Content Script (inyección en la página, tooltips y picker)
│   ├── styles.css      # Estilos visuales del tooltip, botones y picker en Artlist
│   └── lib/            # Lógica pura y testeable
│       ├── matcher.js  # Normalización y puntuación de coincidencias
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