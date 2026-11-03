// Bilingual (English / Spanish) localization module shared across background,
// content script, popup, options and rankings / side panel views.
// Pure functions + lightweight DOM attribute translator.

export const SUPPORTED_LANGUAGES = ["auto", "en", "es"];

export const MESSAGES = {
  en: {
    // Context menus
    "menu.copyTrack": "Copy track info",
    "menu.exportCsv": "Export visible tracks (CSV)",
    "menu.openSidePanel": "Open Rankings side panel",

    // Background errors
    "error.youtubeSearchFailed": "Could not search for this track on YouTube.",
    "error.converterOpenFailed": "Could not open the converter.",
    "error.ratingSaveFailed": "Could not save that rating.",
    "error.missingTrackInfo": "Could not detect the track title or artist.",
    "error.flowDisabled": "The download flow is disabled in the popup.",
    "error.noResultsManualSearch": "No results found. Opened YouTube search so you can check manually.",
    "error.lowConfidenceManualSearch": "No close enough video match found. Opened YouTube search to check manually.",
    "error.invalidVideo": "The selected video is not valid.",
    "error.youtubeHttp": "YouTube responded with HTTP {status}.",
    "error.youtubeEmpty": "YouTube returned no results for this query.",
    "error.backupInvalid": "That file is not a valid Artlist Toolbox backup or config.",

    // Content script: tooltips & toasts
    "tooltip.thisTrack": "this track",
    "tooltip.searchYoutube": "Search {subject} on YouTube",
    "tooltip.searchAndPick": "Search {subject} on YouTube and pick a video",
    "tooltip.searchAndConvert": "Search {subject} on YouTube and open MP3 converter",
    "tooltip.openingSearch": "Opening YouTube search",
    "tooltip.ready": "Done",
    "tooltip.fromMemory": "From memory · ",
    "tooltip.matchPercent": " · {percent}% match",
    "tooltip.openingVideo": "{prefix}Opening: {title}{percent}",

    "toast.alreadyProcessed": "You already processed this track before.",
    "toast.processFailed": "Could not process this track.",
    "toast.youtubeLinkCopied": "YouTube link copied",
    "toast.youtubeLinkCopyFailed": "Could not copy the link",
    "toast.trackInfoMissing": "Could not detect track details.",
    "toast.copiedTrack": "Copied: {text}",
    "toast.clipboardFailed": "Could not copy to clipboard.",
    "toast.untitledTrack": "Untitled track",
    "toast.ratingSaved": "Rated {rating}/5 · {label}",
    "toast.ratingCleared": "Rating cleared · {label}",
    "toast.metaSaved": "Saved tags/note · {label}",
    "toast.focusOn": "Focus favorites: {min}+ stars · press f to exit",
    "toast.focusOff": "Focus favorites off",
    "toast.queueEnter": "Queue mode: click rows to add them. Press q to exit.",
    "toast.queueFinished": "Queue finished: {done} to converter · {search} to search · {failed} failed",
    "toast.noVisibleTracks": "No visible tracks found to export.",
    "toast.csvBuildFailed": "Could not generate CSV.",
    "toast.csvExported": "CSV exported: {count} tracks",

    // Content script: Candidate picker
    "picker.ariaLabel": "Choose YouTube video",
    "picker.headingVeto": "Duration differs from Artlist. Verify and pick a video (1–5):",
    "picker.headingDefault": "Choose the right video (1–5):",
    "picker.untitled": "Untitled video",
    "picker.usedBefore": "Used before",
    "picker.topicBadge": "Topic",
    "picker.previewYoutube": "Preview on YouTube",
    "picker.searchYoutube": "Search on YouTube",
    "picker.cancel": "Cancel",

    // Content script: Rating HUD & inline editor
    "hud.ariaLabel": "Rate track",
    "hud.starOne": "1 star",
    "hud.starMany": "{count} stars",
    "hud.editMeta": "Tags & note (t)",
    "hud.clear": "Clear",
    "hud.tagsPlaceholder": "Tags (comma-separated, e.g. intro, reel)",
    "hud.notePlaceholder": "Short note (e.g. drop at 1:14)…",
    "hud.save": "Save",
    "hud.close": "Close",

    // Content script: Focus favorites pill
    "focusPill.label": "Focus: {min}+ ★",
    "focusPill.labelFive": "Focus: 5 ★ only",
    "focusPill.cycleTitle": "Switch minimum star filter",
    "focusPill.exitTitle": "Exit Focus favorites (f)",

    // Content script: Queue bar
    "queue.stopping": "Stopping…",
    "queue.processing": "Processing…",
    "queue.processingItem": "Processing {index}/{total}: {title}",
    "queue.trackFallback": "track",
    "queue.selectedOne": "1 track queued",
    "queue.selectedMany": "{count} tracks queued",
    "queue.selectPrompt": "Click tracks to queue them",
    "queue.process": "Process",
    "queue.stop": "Stop",
    "queue.clear": "Clear",
    "queue.exit": "Exit",

    // Popup
    "popup.subtitle": "Library tools for Artlist.",
    "popup.sidePanel": "Open Rankings side panel",
    "popup.rankings": "Rankings",
    "popup.settings": "Settings",
    "popup.openArtlist": "Open Artlist Music",
    "popup.enableDownloader": "Enable Downloader",
    "popup.enableDownloaderHint": "Controls the download flow.",
    "popup.downloadFlow": "Download flow",
    "popup.modeAuto": "Auto",
    "popup.modeAsk": "Ask me",
    "popup.modeSearch": "Search only",
    "popup.flowHintAuto": "Search YouTube and open converter automatically.",
    "popup.flowHintAsk": "Show the top matches and let me pick one.",
    "popup.flowHintSearch": "Only open the YouTube search.",
    "popup.matchThreshold": "Match threshold",
    "popup.hidePromo": "Hide promo banner",
    "popup.hidePromoHint": "Removes the big promo hero on library pages.",
    "popup.compactRows": "Compact rows",
    "popup.compactRowsHint": "Tighter track rows so more of the library fits on screen.",
    "popup.trackRankings": "Track rankings",
    "popup.trackRankingsHint": "Rate with 1–5 · t for tags/note · f to focus favorites.",
    "popup.openInBackground": "Open in background",
    "popup.openInBackgroundHint": "Don't focus the tab we open.",
    "popup.exportCsv": "Export visible tracks (CSV)",
    "popup.openArtlistFirst": "Open an Artlist tab first.",
    "popup.exportingTracks": "Exporting {count} tracks…",
    "popup.noVisibleTracks": "No visible tracks to export.",
    "popup.reloadAndRetry": "Could not reach the page. Reload the tab and retry.",
    "popup.recentDownloads": "Recent downloads",
    "popup.clear": "Clear",
    "popup.noRecent": "No recent downloads.",
    "popup.statsLineOne": "1 download total · {week} in the last 7 days",
    "popup.statsLineMany": "{total} downloads total · {week} in the last 7 days",
    "popup.developedBy": "developed by",
    "popup.shortcutsTitle": "Shortcuts",
    "popup.shortcutRate": "Rate track",
    "popup.shortcutTags": "Tags / Note",
    "popup.shortcutFocus": "Focus favs",
    "popup.shortcutDownload": "Download",
    "popup.shortcutCopy": "Copy info",
    "popup.shortcutQueue": "Queue mode",
    "popup.shortcutSearch": "Search",

    // Rankings & Side Panel
    "rankings.title": "Track rankings",
    "rankings.subtitle": "Your 5-star picks, tags and notes from Artlist. Stored locally.",
    "rankings.openFullTab": "Open in full tab",
    "rankings.searchPlaceholder": "Search title, artist, tag or note…",
    "rankings.sortLabel": "Sort",
    "rankings.sortRating": "Rating",
    "rankings.sortRecent": "Recently rated",
    "rankings.sortTitle": "Title",
    "rankings.filterLabel": "Stars",
    "rankings.filterAll": "All ratings",
    "rankings.filter5": "5 stars",
    "rankings.filter4": "4 stars",
    "rankings.filter3": "3 stars",
    "rankings.filter2": "2 stars",
    "rankings.filter1": "1 star",
    "rankings.tagFilterLabel": "Tag",
    "rankings.tagFilterAll": "All tags",
    "rankings.kindFilterLabel": "Type",
    "rankings.kindAll": "All types",
    "rankings.kindMusic": "Music",
    "rankings.kindSfx": "SFX",
    "rankings.summaryEmpty": "No ranked tracks yet.",
    "rankings.summaryOne": "{shown} of 1 ranked track shown.",
    "rankings.summaryMany": "{shown} of {total} ranked tracks shown.",
    "rankings.emptyFiltered": "No ranked tracks match this search or filter.",
    "rankings.emptyInitial": "No ranked tracks yet. Hover a track on Artlist and press 1–5.",
    "rankings.rateStarOne": "Rate 1 star",
    "rankings.rateStarMany": "Rate {count} stars",
    "rankings.unknownTrack": "Unknown track",
    "rankings.ratedOn": "rated {date}",
    "rankings.openTrack": "Open",
    "rankings.edit": "Edit",
    "rankings.remove": "Remove",
    "rankings.save": "Save",
    "rankings.cancel": "Cancel",
    "rankings.exportCsv": "Export CSV",
    "rankings.exportJson": "Export JSON",
    "rankings.importJson": "Import JSON",
    "rankings.clearAll": "Clear all",
    "rankings.settingsLink": "Settings",
    "rankings.saveError": "Could not save that rating.",
    "rankings.noExport": "No rankings to export.",
    "rankings.exportedCsv": "Rankings CSV exported.",
    "rankings.exportedJson": "Rankings JSON exported.",
    "rankings.importedJson": "Merged {count} ranked tracks.",
    "rankings.importError": "Could not import rankings from that file.",
    "rankings.nothingToClear": "There are no rankings to clear.",
    "rankings.confirmClear": "Clear all {total} ranked tracks? This cannot be undone.",
    "rankings.clearError": "Could not clear rankings.",
    "rankings.cleared": "Cleared {count} rankings.",

    // Options
    "options.title": "Artlist Toolbox — Settings",
    "options.subtitle": "Everything is configurable. The download flow ships disabled by default; page tweaks and library tools work on their own.",
    "options.sectionDownload": "Download flow",
    "options.enableFlow": "Enable download flow",
    "options.enableFlowHint": "Enhances Artlist download buttons for YouTube lookup. Off by default.",
    "options.defaultBehavior": "Default behavior",
    "options.defaultBehaviorHint": "How a click resolves when no modifier key is used.",
    "options.flowHintAuto": "Search YouTube and open converter automatically (memory and duration veto still apply).",
    "options.flowHintAsk": "Show the top matches and let me pick one every time.",
    "options.flowHintSearch": "Only open the YouTube search; never auto-pick.",
    "options.matchThreshold": "Match threshold",
    "options.matchThresholdHint": "Minimum score to auto-pick a video in Auto mode.",
    "options.openBackground": "Open in background",
    "options.openBackgroundHint": "Don't focus the tab we open.",
    "options.durationVeto": "Duration veto",
    "options.durationVetoHint": "In Auto mode, force the manual picker when the video length differs from Artlist.",
    "options.vetoTolerance": "Veto tolerance",
    "options.vetoToleranceHint": "Seconds of difference allowed before asking.",
    "options.secondsUnit": "sec",
    "options.converterTemplate": "Converter URL template",
    "options.converterTemplateHint": "Supports {videoId}, {youtubeUrl} (encoded) and {rawYoutubeUrl}. Must start with https:// or http://.",
    "options.converterReset": "Reset URL",
    "options.converterInvalid": "Invalid URL template. Include https:// and {videoId} or {youtubeUrl}.",
    "options.converterSaved": "Converter URL saved.",

    "options.sectionKeywords": "Keywords",
    "options.keywordsHint": "One term per line. Terms match whole words (case and accents ignored). Clear a list to disable it.",
    "options.penalizedTerms": "Penalized terms",
    "options.penalizedHint": "Videos containing these lose score (unless the Artlist track mentions them too).",
    "options.preferredTerms": "Preferred terms",
    "options.preferredHint": "Videos containing these get a small bonus (max +10%).",
    "options.restoreDefaultsBtn": "Restore defaults",

    "options.sectionMemory": "Match memory",
    "options.rememberPicks": "Remember my picks",
    "options.rememberPicksHint": "In Auto mode, reuse the video you chose before for the same track (skips the search).",
    "options.memoryCountEmpty": "Nothing remembered yet. Pick a video from the picker and it will show up here.",
    "options.memoryCountOne": "1 remembered match (max 500).",
    "options.memoryCountMany": "{count} remembered matches (max 500).",
    "options.clearMemory": "Clear match memory",
    "options.confirmClearMemory": "Clear every remembered match? Future downloads will search YouTube again.",

    "options.sectionProcessed": "Processed history",
    "options.processedHint": "Tracks that went through the flow at least once. Used to dim rows and warn about repeats.",
    "options.processedCountEmpty": "No processed tracks yet.",
    "options.processedCountOne": "1 processed track (max 1000).",
    "options.processedCountMany": "{count} processed tracks (max 1000).",
    "options.clearProcessed": "Clear processed history",
    "options.confirmClearProcessed": "Clear the processed history? Rows will stop being dimmed.",

    "options.sectionPage": "Page & library",
    "options.language": "Language",
    "options.languageHint": "Applies to popup, settings, rankings, menus and in-page overlays.",
    "options.langAuto": "Auto (Browser)",
    "options.langEn": "English",
    "options.langEs": "Español",
    "options.hidePromo": "Hide promo banner",
    "options.hidePromoHint": "Removes the big promo hero on library pages before first paint.",
    "options.compactRows": "Compact rows",
    "options.compactRowsHint": "Tighter track and SFX rows so more of the library fits on screen.",
    "options.dimProcessed": "Dim processed rows",
    "options.dimProcessedHint": "Subtly fade tracks you already processed.",
    "options.shortcuts": "Keyboard shortcuts",
    "options.shortcutsHint": "d = download hovered · c = copy info · 1–5 = rate · 0 = clear · t = tags/note · f = focus favorites · / = search · q = queue.",

    "options.sectionRankings": "Track rankings",
    "options.enableRankings": "Enable track rankings",
    "options.enableRankingsHint": "Rate Music & SFX rows with 1–5, add tags/notes, and focus favorites. Works with the download flow off.",
    "options.rankingsCountEmpty": "No ranked tracks yet. Hover a track on Artlist and press 1–5.",
    "options.rankingsCountOne": "1 ranked track. Rate tracks on Artlist with 1–5.",
    "options.rankingsCountMany": "{count} ranked tracks. Rate tracks on Artlist with 1–5.",
    "options.openRankings": "Open rankings page",
    "options.openSidePanel": "Open in side panel",
    "options.clearRankings": "Clear all rankings",
    "options.confirmClearRankings": "Clear every ranked track? This cannot be undone.",

    "options.sectionAdvanced": "Advanced",
    "options.showPopupCsv": "Show CSV export button in popup",
    "options.showPopupCsvHint": "Adds the \"Export visible tracks (CSV)\" button to the popup. Right-click export stays available either way.",

    "options.sectionModifiers": "Modifier clicks & menus",
    "options.modAlt": " — always show the picker for that track.",
    "options.modShift": " — only open the YouTube search for that track.",
    "options.modCtrl": " — copy the resolved YouTube link (no tab).",
    "options.modRightTrack": "Right click on a track — copy its info from the context menu.",
    "options.modRightPage": "Right click on the page — export visible tracks as CSV or open the Rankings side panel.",

    "options.sectionStats": "Stats",
    "options.statsEmpty": "No downloads recorded yet.",
    "options.statsTotalOne": "1 download recorded (history kept for {days} days).",
    "options.statsTotalMany": "{count} downloads recorded (history kept for {days} days).",
    "options.statsDayOne": "1 download",
    "options.statsDayMany": "{count} downloads",
    "options.resetStats": "Reset stats",
    "options.confirmResetStats": "Reset the download stats?",

    "options.sectionBackup": "Backup & Config",
    "options.backupHint": "Full backups include settings, rankings (stars, tags, notes), match memory, processed history and stats.",
    "options.mergeOnImport": "Merge imported data with existing rankings & history",
    "options.mergeOnImportHint": "Keep existing items and update conflicts using the newest timestamp. Turn off to replace.",
    "options.exportFullBackup": "Export full backup (JSON)",
    "options.exportSettingsOnly": "Export settings only (JSON)",
    "options.importBackup": "Import backup / config",
    "options.exportRecentCsv": "Export recent (CSV)",
    "options.restoreAllDefaults": "Restore default settings",
    "options.confirmRestoreDefaults": "Restore every setting to its default? Memory, history, stats and rankings are NOT touched.",
    "options.backupExported": "Full backup exported.",
    "options.configExported": "Settings exported.",
    "options.importInvalid": "That file does not look like an Artlist Toolbox backup or config.",
    "options.importParseError": "Could not parse that file as JSON.",
    "options.importSuccess": "Imported {summary}. Reloading…",
    "options.defaultsRestored": "Defaults restored. Reloading…",
    "options.noRecentExport": "No recent downloads to export.",
    "options.recentExported": "Recent downloads exported.",

    "options.sectionDiagnostics": "Diagnostics",
    "options.diagnosticsLoading": "Loading…",
    "options.copyDiagnostics": "Copy diagnostics",
    "options.githubRepo": "GitHub repo",
    "options.diagnosticsCopied": "Diagnostics copied to the clipboard.",
    "options.diagnosticsCopyError": "Could not copy diagnostics.",
    "options.removeEntry": "Remove",
    "options.summarySettings": "{count} settings",
    "options.summaryRankings": "{count} rankings",
    "options.summaryMemory": "{count} memory",
    "options.summaryProcessed": "{count} processed",
    "options.summaryRecent": "{count} recent",
    "options.summaryBackup": "backup"
  },

  es: {
    // Context menus
    "menu.copyTrack": "Copiar info de la pista",
    "menu.exportCsv": "Exportar pistas visibles (CSV)",
    "menu.openSidePanel": "Abrir panel lateral de Rankings",

    // Background errors
    "error.youtubeSearchFailed": "No se pudo buscar la pista en YouTube.",
    "error.converterOpenFailed": "No se pudo abrir el conversor.",
    "error.ratingSaveFailed": "No se pudo guardar la calificación.",
    "error.missingTrackInfo": "No pude detectar el nombre de la pista ni el artista.",
    "error.flowDisabled": "El flujo de descarga está desactivado en el panel.",
    "error.noResultsManualSearch": "No encontré resultados. Abrí la búsqueda de YouTube para revisar manualmente.",
    "error.lowConfidenceManualSearch": "No encontré un video suficientemente parecido. Abrí la búsqueda de YouTube para revisar manualmente.",
    "error.invalidVideo": "El video seleccionado no es válido.",
    "error.youtubeHttp": "YouTube respondió con HTTP {status}.",
    "error.youtubeEmpty": "YouTube no devolvió resultados para esta búsqueda.",
    "error.backupInvalid": "Ese archivo no es un respaldo o configuración válida de Artlist Toolbox.",

    // Content script: tooltips & toasts
    "tooltip.thisTrack": "esta pista",
    "tooltip.searchYoutube": "Buscar {subject} en YouTube",
    "tooltip.searchAndPick": "Buscar {subject} en YouTube y elegir el video",
    "tooltip.searchAndConvert": "Buscar {subject} en YouTube y abrir descarga MP3",
    "tooltip.openingSearch": "Abriendo la búsqueda de YouTube",
    "tooltip.ready": "Listo",
    "tooltip.fromMemory": "Desde memoria · ",
    "tooltip.matchPercent": " · {percent}% de coincidencia",
    "tooltip.openingVideo": "{prefix}Abriendo: {title}{percent}",

    "toast.alreadyProcessed": "Esta pista ya la habías procesado antes.",
    "toast.processFailed": "No se pudo procesar la pista.",
    "toast.youtubeLinkCopied": "Link de YouTube copiado",
    "toast.youtubeLinkCopyFailed": "No se pudo copiar el link",
    "toast.trackInfoMissing": "No pude detectar la info de la pista.",
    "toast.copiedTrack": "Copiado: {text}",
    "toast.clipboardFailed": "No se pudo copiar al portapapeles.",
    "toast.untitledTrack": "Pista sin título",
    "toast.ratingSaved": "Calificación {rating}/5 · {label}",
    "toast.ratingCleared": "Calificación quitada · {label}",
    "toast.metaSaved": "Etiquetas/nota guardadas · {label}",
    "toast.focusOn": "Foco en favoritos: {min}+ estrellas · f para salir",
    "toast.focusOff": "Foco en favoritos desactivado",
    "toast.queueEnter": "Modo cola: clic en las filas para agregarlas. q para salir.",
    "toast.queueFinished": "Cola terminada: {done} al conversor · {search} a búsqueda · {failed} con error",
    "toast.noVisibleTracks": "No encontré pistas visibles para exportar.",
    "toast.csvBuildFailed": "No se pudo generar el CSV.",
    "toast.csvExported": "CSV exportado: {count} pistas",

    // Content script: Candidate picker
    "picker.ariaLabel": "Elegir video de YouTube",
    "picker.headingVeto": "La duración no coincide con Artlist. Verificá y elegí el video (1–5):",
    "picker.headingDefault": "Elegí el video correcto (1–5):",
    "picker.untitled": "Video sin título",
    "picker.usedBefore": "Usada antes",
    "picker.topicBadge": "Topic",
    "picker.previewYoutube": "Previsualizar en YouTube",
    "picker.searchYoutube": "Buscar en YouTube",
    "picker.cancel": "Cancelar",

    // Content script: Rating HUD & inline editor
    "hud.ariaLabel": "Calificar pista",
    "hud.starOne": "1 estrella",
    "hud.starMany": "{count} estrellas",
    "hud.editMeta": "Etiquetas y nota (t)",
    "hud.clear": "Quitar",
    "hud.tagsPlaceholder": "Etiquetas (separadas por coma, ej. intro, reel)",
    "hud.notePlaceholder": "Nota breve (ej. corte en 1:14)…",
    "hud.save": "Guardar",
    "hud.close": "Cerrar",

    // Content script: Focus favorites pill
    "focusPill.label": "Foco: {min}+ ★",
    "focusPill.labelFive": "Foco: solo 5 ★",
    "focusPill.cycleTitle": "Cambiar filtro mínimo de estrellas",
    "focusPill.exitTitle": "Salir de Foco en favoritos (f)",

    // Content script: Queue bar
    "queue.stopping": "Deteniendo…",
    "queue.processing": "Procesando…",
    "queue.processingItem": "Procesando {index}/{total}: {title}",
    "queue.trackFallback": "pista",
    "queue.selectedOne": "1 pista en cola",
    "queue.selectedMany": "{count} pistas en cola",
    "queue.selectPrompt": "Seleccioná pistas para la cola",
    "queue.process": "Procesar",
    "queue.stop": "Detener",
    "queue.clear": "Vaciar",
    "queue.exit": "Salir",

    // Popup
    "popup.subtitle": "Herramientas de biblioteca para Artlist.",
    "popup.sidePanel": "Abrir panel lateral de Rankings",
    "popup.rankings": "Rankings",
    "popup.settings": "Ajustes",
    "popup.openArtlist": "Abrir Artlist Music",
    "popup.enableDownloader": "Activar descargador",
    "popup.enableDownloaderHint": "Controla el flujo de descarga.",
    "popup.downloadFlow": "Flujo de descarga",
    "popup.modeAuto": "Auto",
    "popup.modeAsk": "Preguntar",
    "popup.modeSearch": "Solo buscar",
    "popup.flowHintAuto": "Buscar en YouTube y abrir el conversor automáticamente.",
    "popup.flowHintAsk": "Mostrar las mejores coincidencias para elegir.",
    "popup.flowHintSearch": "Abrir únicamente la búsqueda en YouTube.",
    "popup.matchThreshold": "Umbral de coincidencia",
    "popup.hidePromo": "Ocultar banner promo",
    "popup.hidePromoHint": "Quita el banner promocional grande en la biblioteca.",
    "popup.compactRows": "Filas compactas",
    "popup.compactRowsHint": "Filas más ajustadas para ver más pistas en pantalla.",
    "popup.trackRankings": "Calificación de pistas",
    "popup.trackRankingsHint": "Calificá con 1–5 · t etiquetas/nota · f foco en favoritos.",
    "popup.openInBackground": "Abrir en segundo plano",
    "popup.openInBackgroundHint": "No enfocar la pestaña nueva.",
    "popup.exportCsv": "Exportar pistas visibles (CSV)",
    "popup.openArtlistFirst": "Abrí primero una pestaña de Artlist.",
    "popup.exportingTracks": "Exportando {count} pistas…",
    "popup.noVisibleTracks": "No hay pistas visibles para exportar.",
    "popup.reloadAndRetry": "No se pudo conectar con la página. Recargá la pestaña.",
    "popup.recentDownloads": "Descargas recientes",
    "popup.clear": "Borrar",
    "popup.noRecent": "Sin descargas recientes.",
    "popup.statsLineOne": "1 descarga en total · {week} en los últimos 7 días",
    "popup.statsLineMany": "{total} descargas en total · {week} en los últimos 7 días",
    "popup.developedBy": "desarrollado por",
    "popup.shortcutsTitle": "Atajos de teclado",
    "popup.shortcutRate": "Calificar",
    "popup.shortcutTags": "Etiquetas / Nota",
    "popup.shortcutFocus": "Foco favoritos",
    "popup.shortcutDownload": "Descargar",
    "popup.shortcutCopy": "Copiar info",
    "popup.shortcutQueue": "Modo cola",
    "popup.shortcutSearch": "Buscar",

    // Rankings & Side Panel
    "rankings.title": "Rankings de pistas",
    "rankings.subtitle": "Tus selecciones de 5 estrellas, etiquetas y notas de Artlist. Guardado localmente.",
    "rankings.openFullTab": "Abrir en pestaña completa",
    "rankings.searchPlaceholder": "Buscar título, artista, etiqueta o nota…",
    "rankings.sortLabel": "Orden",
    "rankings.sortRating": "Estrellas",
    "rankings.sortRecent": "Recientes",
    "rankings.sortTitle": "Título",
    "rankings.filterLabel": "Filtro",
    "rankings.filterAll": "Todas",
    "rankings.filter5": "5 estrellas",
    "rankings.filter4": "4 estrellas",
    "rankings.filter3": "3 estrellas",
    "rankings.filter2": "2 estrellas",
    "rankings.filter1": "1 estrella",
    "rankings.tagFilterLabel": "Etiqueta",
    "rankings.tagFilterAll": "Todas",
    "rankings.kindFilterLabel": "Tipo",
    "rankings.kindAll": "Todos",
    "rankings.kindMusic": "Música",
    "rankings.kindSfx": "SFX",
    "rankings.summaryEmpty": "Todavía no hay pistas calificadas.",
    "rankings.summaryOne": "Mostrando {shown} de 1 pista calificada.",
    "rankings.summaryMany": "Mostrando {shown} de {total} pistas calificadas.",
    "rankings.emptyFiltered": "Ninguna pista coincide con esta búsqueda o filtro.",
    "rankings.emptyInitial": "Todavía no calificaste pistas. Pasá el cursor sobre una pista en Artlist y presioná 1–5.",
    "rankings.rateStarOne": "Calificar 1 estrella",
    "rankings.rateStarMany": "Calificar {count} estrellas",
    "rankings.unknownTrack": "Pista desconocida",
    "rankings.ratedOn": "calificada {date}",
    "rankings.openTrack": "Abrir",
    "rankings.edit": "Editar",
    "rankings.remove": "Quitar",
    "rankings.save": "Guardar",
    "rankings.cancel": "Cancelar",
    "rankings.exportCsv": "Exportar CSV",
    "rankings.exportJson": "Exportar JSON",
    "rankings.importJson": "Importar JSON",
    "rankings.clearAll": "Borrar todo",
    "rankings.settingsLink": "Ajustes",
    "rankings.saveError": "No se pudo guardar la calificación.",
    "rankings.noExport": "No hay rankings para exportar.",
    "rankings.exportedCsv": "CSV de rankings exportado.",
    "rankings.exportedJson": "JSON de rankings exportado.",
    "rankings.importedJson": "Se combinaron {count} pistas calificadas.",
    "rankings.importError": "No se pudieron importar rankings de ese archivo.",
    "rankings.nothingToClear": "No hay rankings para borrar.",
    "rankings.confirmClear": "¿Borrar las {total} pistas calificadas? Esta acción no se puede deshacer.",
    "rankings.clearError": "No se pudieron borrar los rankings.",
    "rankings.cleared": "Se borraron {count} rankings.",

    // Options
    "options.title": "Artlist Toolbox — Ajustes",
    "options.subtitle": "Todo es configurable. El flujo de descarga viene desactivado por defecto; las herramientas de biblioteca funcionan de forma independiente.",
    "options.sectionDownload": "Flujo de descarga",
    "options.enableFlow": "Activar flujo de descarga",
    "options.enableFlowHint": "Activa la búsqueda en YouTube desde los botones de descarga de Artlist. Desactivado por defecto.",
    "options.defaultBehavior": "Comportamiento por defecto",
    "options.defaultBehaviorHint": "Qué ocurre al hacer clic sin teclas modificadoras.",
    "options.flowHintAuto": "Buscar en YouTube y abrir el conversor automáticamente (respeta memoria y veto de duración).",
    "options.flowHintAsk": "Mostrar las mejores coincidencias para elegir manualmente cada vez.",
    "options.flowHintSearch": "Abrir únicamente la búsqueda de YouTube; nunca elegir automáticamente.",
    "options.matchThreshold": "Umbral de coincidencia",
    "options.matchThresholdHint": "Puntaje mínimo para elegir un video automáticamente en modo Auto.",
    "options.openBackground": "Abrir en segundo plano",
    "options.openBackgroundHint": "No cambiar el foco a la pestaña nueva.",
    "options.durationVeto": "Veto por duración",
    "options.durationVetoHint": "En modo Auto, mostrar el selector manual si la duración difiere de la pista en Artlist.",
    "options.vetoTolerance": "Tolerancia de duración",
    "options.vetoToleranceHint": "Segundos de diferencia permitidos antes de preguntar.",
    "options.secondsUnit": "seg",
    "options.converterTemplate": "Plantilla URL del conversor",
    "options.converterTemplateHint": "Soporta {videoId}, {youtubeUrl} (codificado) y {rawYoutubeUrl}. Debe iniciar con https:// o http://.",
    "options.converterReset": "Restablecer URL",
    "options.converterInvalid": "Plantilla inválida. Incluí https:// y {videoId} o {youtubeUrl}.",
    "options.converterSaved": "URL del conversor guardada.",

    "options.sectionKeywords": "Palabras clave",
    "options.keywordsHint": "Un término por línea. Se comparan palabras completas (sin importar mayúsculas o acentos). Vaciar para desactivar.",
    "options.penalizedTerms": "Términos penalizados",
    "options.penalizedHint": "Los videos con estos términos pierden puntaje (salvo que la pista de Artlist también los incluya).",
    "options.preferredTerms": "Términos preferidos",
    "options.preferredHint": "Los videos con estos términos reciben un pequeño bonus (máx. +10%).",
    "options.restoreDefaultsBtn": "Restaurar valores",

    "options.sectionMemory": "Memoria de coincidencias",
    "options.rememberPicks": "Recordar mis elecciones",
    "options.rememberPicksHint": "En modo Auto, reutilizar el video elegido anteriormente para la misma pista (omite la búsqueda).",
    "options.memoryCountEmpty": "Todavía no hay coincidencias guardadas. Elegí un video del selector y aparecerá acá.",
    "options.memoryCountOne": "1 coincidencia recordada (máx. 500).",
    "options.memoryCountMany": "{count} coincidencias recordadas (máx. 500).",
    "options.clearMemory": "Borrar memoria de coincidencias",
    "options.confirmClearMemory": "¿Borrar todas las coincidencias recordadas? Las próximas descargas volverán a buscar en YouTube.",

    "options.sectionProcessed": "Historial procesado",
    "options.processedHint": "Pistas que pasaron por el flujo al menos una vez. Se usa para atenuar filas y avisar repetidos.",
    "options.processedCountEmpty": "Todavía no hay pistas procesadas.",
    "options.processedCountOne": "1 pista procesada (máx. 1000).",
    "options.processedCountMany": "{count} pistas procesadas (máx. 1000).",
    "options.clearProcessed": "Borrar historial procesado",
    "options.confirmClearProcessed": "¿Borrar el historial procesado? Las filas dejarán de mostrarse atenuadas.",

    "options.sectionPage": "Página y biblioteca",
    "options.language": "Idioma",
    "options.languageHint": "Se aplica al popup, ajustes, rankings, menús y controles en Artlist.",
    "options.langAuto": "Automático (Navegador)",
    "options.langEn": "English",
    "options.langEs": "Español",
    "options.hidePromo": "Ocultar banner promocional",
    "options.hidePromoHint": "Oculta el banner promocional grande antes del primer render.",
    "options.compactRows": "Filas compactas",
    "options.compactRowsHint": "Reduce el alto de las filas de música y efectos de sonido (SFX).",
    "options.dimProcessed": "Atenuar filas procesadas",
    "options.dimProcessedHint": "Atenúa suavemente las pistas que ya procesaste.",
    "options.shortcuts": "Atajos de teclado",
    "options.shortcutsHint": "d = descargar · c = copiar info · 1–5 = calificar · 0 = quitar · t = etiquetas/nota · f = foco favoritos · / = buscar · q = cola.",

    "options.sectionRankings": "Calificación de pistas",
    "options.enableRankings": "Activar calificación de pistas",
    "options.enableRankingsHint": "Calificá música y SFX con 1–5, agregá etiquetas/notas y destacá favoritos. Funciona sin el flujo de descarga.",
    "options.rankingsCountEmpty": "Todavía no hay pistas calificadas. Pasá el cursor sobre una pista en Artlist y presioná 1–5.",
    "options.rankingsCountOne": "1 pista calificada. Calificá pistas en Artlist con 1–5.",
    "options.rankingsCountMany": "{count} pistas calificadas. Calificá pistas en Artlist con 1–5.",
    "options.openRankings": "Abrir página de rankings",
    "options.openSidePanel": "Abrir en panel lateral",
    "options.clearRankings": "Borrar todos los rankings",
    "options.confirmClearRankings": "¿Borrar todas las pistas calificadas? Esta acción no se puede deshacer.",

    "options.sectionAdvanced": "Avanzado",
    "options.showPopupCsv": "Mostrar botón de exportar CSV en el popup",
    "options.showPopupCsvHint": "Agrega el botón \"Exportar pistas visibles (CSV)\" al popup. El menú contextual sigue disponible siempre.",

    "options.sectionModifiers": "Clics con teclas y menús",
    "options.modAlt": " — mostrar siempre el selector para esa pista.",
    "options.modShift": " — abrir solo la búsqueda en YouTube para esa pista.",
    "options.modCtrl": " — copiar el link de YouTube resuelto (sin abrir pestaña).",
    "options.modRightTrack": "Clic derecho en una pista — copiar su información desde el menú contextual.",
    "options.modRightPage": "Clic derecho en la página — exportar pistas visibles a CSV o abrir el panel lateral de Rankings.",

    "options.sectionStats": "Estadísticas",
    "options.statsEmpty": "Todavía no se registraron descargas.",
    "options.statsTotalOne": "1 descarga registrada (historial de {days} días).",
    "options.statsTotalMany": "{count} descargas registradas (historial de {days} días).",
    "options.statsDayOne": "1 descarga",
    "options.statsDayMany": "{count} descargas",
    "options.resetStats": "Reiniciar estadísticas",
    "options.confirmResetStats": "¿Reiniciar las estadísticas de descarga?",

    "options.sectionBackup": "Respaldo y configuración",
    "options.backupHint": "El respaldo completo incluye ajustes, rankings (estrellas, etiquetas, notas), memoria de coincidencias, historial y estadísticas.",
    "options.mergeOnImport": "Combinar datos importados con rankings e historial actuales",
    "options.mergeOnImportHint": "Conserva los elementos existentes y actualiza duplicados según la fecha más reciente. Desactivá para reemplazar.",
    "options.exportFullBackup": "Exportar respaldo completo (JSON)",
    "options.exportSettingsOnly": "Exportar solo ajustes (JSON)",
    "options.importBackup": "Importar respaldo / config",
    "options.exportRecentCsv": "Exportar recientes (CSV)",
    "options.restoreAllDefaults": "Restaurar ajustes por defecto",
    "options.confirmRestoreDefaults": "¿Restaurar todos los ajustes a sus valores por defecto? Memoria, historial, estadísticas y rankings NO se borran.",
    "options.backupExported": "Respaldo completo exportado.",
    "options.configExported": "Ajustes exportados.",
    "options.importInvalid": "Ese archivo no parece un respaldo o configuración de Artlist Toolbox.",
    "options.importParseError": "No se pudo leer ese archivo como JSON.",
    "options.importSuccess": "Importado: {summary}. Recargando…",
    "options.defaultsRestored": "Ajustes restaurados. Recargando…",
    "options.noRecentExport": "No hay descargas recientes para exportar.",
    "options.recentExported": "Descargas recientes exportadas.",

    "options.sectionDiagnostics": "Diagnóstico",
    "options.diagnosticsLoading": "Cargando…",
    "options.copyDiagnostics": "Copiar diagnóstico",
    "options.githubRepo": "Repositorio GitHub",
    "options.diagnosticsCopied": "Diagnóstico copiado al portapapeles.",
    "options.diagnosticsCopyError": "No se pudo copiar el diagnóstico.",
    "options.removeEntry": "Quitar",
    "options.summarySettings": "{count} ajustes",
    "options.summaryRankings": "{count} rankings",
    "options.summaryMemory": "{count} en memoria",
    "options.summaryProcessed": "{count} procesadas",
    "options.summaryRecent": "{count} recientes",
    "options.summaryBackup": "respaldo"
  }
};

export function detectBrowserLanguage() {
  try {
    if (globalThis.chrome?.i18n?.getUILanguage) {
      return String(globalThis.chrome.i18n.getUILanguage() || "");
    }
  } catch (_error) {
    // Fall back to navigator.language
  }
  return String(globalThis.navigator?.language || "");
}

export function resolveLanguage(preference = "auto", uiLanguage = detectBrowserLanguage()) {
  if (preference === "en" || preference === "es") {
    return preference;
  }
  return /^es\b/i.test(String(uiLanguage || "").trim()) ? "es" : "en";
}

export function t(key, params = {}, lang = "en") {
  const activeLang = lang === "es" ? "es" : "en";
  const template = MESSAGES[activeLang]?.[key] ?? MESSAGES.en[key] ?? key;

  if (!params || typeof params !== "object") {
    return template;
  }

  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (full, token) =>
    token in params && params[token] !== undefined && params[token] !== null
      ? String(params[token])
      : full
  );
}

export function applyDomTranslations(root, lang = "en") {
  if (!root?.querySelectorAll) {
    return;
  }

  const activeLang = lang === "es" ? "es" : "en";
  if (root.documentElement) {
    root.documentElement.lang = activeLang;
  }

  root.querySelectorAll("[data-i18n]").forEach((node) => {
    const key = node.getAttribute("data-i18n");
    if (key) {
      node.textContent = t(key, {}, activeLang);
    }
  });

  root.querySelectorAll("[data-i18n-title]").forEach((node) => {
    const key = node.getAttribute("data-i18n-title");
    if (key) {
      node.setAttribute("title", t(key, {}, activeLang));
    }
  });

  root.querySelectorAll("[data-i18n-placeholder]").forEach((node) => {
    const key = node.getAttribute("data-i18n-placeholder");
    if (key) {
      node.setAttribute("placeholder", t(key, {}, activeLang));
    }
  });

  root.querySelectorAll("[data-i18n-aria-label]").forEach((node) => {
    const key = node.getAttribute("data-i18n-aria-label");
    if (key) {
      node.setAttribute("aria-label", t(key, {}, activeLang));
    }
  });
}
