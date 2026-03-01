# Changelog

All notable changes to this project will be documented in this file.

The format is based on Keep a Changelog.

## [Unreleased]

### Changed

- **Icons**: Alle Emoji-Icons durch Google Material SVG-Icons ersetzt (Tabs, Buttons, Statusanzeigen).
  - Betrifft: MediaWidget Tab-Bar, UploadTab, ImageGenTab, GalleryTab Share-Popover, SettingsPanel Plugin-Liste, CommunityTab, OerSharesTab.
  - Plugin-Icons (`tab-communikey`, `tab-oer-shares`) sind jetzt inline-SVG-Strings statt Emojis.
  - Tab-Icons werden via `{@html}` gerendert für SVG-Unterstützung.
  - Responsive: Tab-Labels werden unter 600px Breite ausgeblendet (nur Icons sichtbar).
- **Einheitliche Search/Filter-Leiste für Media-Grids**: Neue Shared-Komponente `MediaGridSearchBar` (inkl. `iconSync`) für Gallery, Community und OER.
  - Konsistentes Suchverhalten mit Mehrfachbegriffen (Whitespace/Komma) und Trefferanzeige „Keine Treffer für die Suche.“.
  - Duplizierte tab-spezifische Refresh-/Search-UI in Gallery und OER entfernt.
- **Header-/Layout-Harmonisierung (Community + OER)**:
  - **CommunityTab** folgt jetzt dem Aufbau „Aktuelle Community + Dropdown“ → Suche → Grid, mit vereinheitlichten Abständen/Paddings.
  - **OerSharesTab** nutzt einen Community-ähnlichen Header mit Edufeed-Logo + „Meine Shares“, Settings-Icon rechts und ohne Header-Border.
  - Einheitlicher vertikaler Rhythmus in beiden Tabs (Header, Suchleiste, Grid).
- **Examples / Deployment**:
  - `examples/simple-input.html` enthält jetzt einen Hinweis auf den Standalone-Betrieb per Bookmarklet inkl. Link auf `examples/bookmarklet.html`.
  - GitHub-Pages-Workflow hinzugefügt, der das Widget baut und `examples/simple-input.html` als Zielseite ausliefert.

### Added

- **Delete in Detail-Toolbar (Community + OER)**: Löschfunktion in den Detail-Sheets ergänzt.
  - **CommunityTab**: Publiziert NIP-09 `kind:5` Delete-Event für das ausgewählte Kind-`30222` Share-Event (`e` + `k=30222`) und lädt die Community-Medien danach neu.
  - **OerSharesTab**: Publiziert NIP-09 `kind:5` Delete-Event für das ausgewählte Kind-`30142` AMB-Event (`e` + `k=30142`) und lädt die OER-Shares danach neu.
  - Neue Helper: `publishCommunityShareDeletion()` und `publishAmbShareDeletion()`.

- **Einheitliches Grid-UI** (`MediaCard`, `MediaDetailSheet`, `MediaToolbar`): Neue geteilte Svelte-Komponenten unter `packages/blossom-plugin/src/widget/shared/`, exportiert über `@blossom/plugin/plugin`.
  - `MediaCard.svelte`: 4:3-Karte mit Thumbnail, Name, Datum und optionalem Badge-Overlay — ersetzt alle Tab-spezifischen `thumb-btn`/`oer-card` Buttons.
  - `MediaDetailSheet.svelte`: Vollbild-Overlay (Svelte 5-Snippets `children` + `toolbar`) mit Fade+Slide-Animation, Escape-Handler und eingebautem Schließen-Button — ersetzt feste Seitenleisten und Vollansicht in OerSharesTab.
  - `MediaToolbar.svelte`: Unterleiste mit Formatauswahl, Einfügen/Kopieren, Teilen, Bearbeiten und Löschen — ersetzt alle inline-Toolbars in den Tabs.
- **`InsertMode` `'markdown-desc'`**: Neues Ausgabeformat fügt Beschreibung als eigene Zeile vor dem Markdown-Bild ein (`description\n![name](url)\nautor · [license](url)`).
- **`MediaDisplayItem`**: Einheitliches Display-Interface für alle drei Tabs (Gallery, Community, OER-Shares) mit Badge- und ExtraFields-Unterstützung.
- **GalleryTab-Refactoring**: Sheet-Overlay ersetzt die feste 280px-Sidebar; `MediaCard` Grid-Items.
- **CommunityTab-Refactoring**: Gemeinsame Komponenten; erweiterte NIP-94-Extraktion (Lizenz `l`, Keywords `t`); vollständige Metadaten im Detail-Sheet.
- **OerSharesTab-Refactoring**: Sheet-Overlay mit expandierbarer SKOS-Sektion (pädagogische Metadaten); Format-Auswahl in der Toolbar; kein Vollansicht-Seitenwechsel mehr.
- **vitest** (`tab-communikey`): `@sveltejs/vite-plugin-svelte` in `vitest.config.ts` ergänzt.

- **`packages/tab-oer-shares`**: OER-Shares TabPlugin für AMB-Metadaten und Edufeed-Integration (kind:30142).
  - „Im Edufeed teilen" ShareTarget in der Gallery-Sidebar mit AMB-Metadaten-Formular.
  - NIP-94 → AMB Auto-Mapping (alt→name, summary→description, author, license, keywords).
  - SKOS-Vocabulary-Selektoren für Zielgruppe, Bildungsstufe, Ressourcentyp und Fach/Thema.
  - OER-Shares Tab: Übersicht eigener kind:30142 Events mit Detailansicht (prefLabels statt URIs).
  - SKOS-Loader mit In-Memory-Cache für SkoHub JSON-LD Endpoints.
  - Konfigurierbare Vocabulary-URLs und AMB-Relay-Adresse (localStorage-persistiert).
  - Nostr-Helper: `mapNip94ToAmb`, `buildAmbEventTags`, `publishAmbEvent`, `fetchUserAmbShares`, `fetchSkosVocabulary`.
  - Unit-Tests: SKOS-Parsing, AMB-Tag-Builder, Event-Fetch-Parsing.
  - Widget-Integration: OER-Shares als Built-in Tab im Widget-Bundle (opt-in via `features.oerShares: true`).
- **Share-Action-Infrastruktur**: Generisches Share-System für das Media Widget. Plugins können `shareTargets` registrieren, die in der Gallery-Sidebar als Share-Popover angezeigt werden.
  - `ShareTarget` Interface: `id`, `label`, `icon`, `handler(item, nip94Event, ctx)`.
  - `TabPlugin.shareTargets?: ShareTarget[]`: Plugins liefern Share-Targets über ihre Tab-Definition.
  - Share-Button (📤) in der Gallery-Sidebar-Toolbar mit Popover-Dropdown aller registrierten Share-Targets.
  - `'share-completed'` Event in `WidgetEventMap`.
- **`packages/tab-communikey`**: Community-Media TabPlugin basierend auf COMMUNIKEY-Protokoll.
  - Community-Feed: Lädt kind:30222 (Targeted Publications) + kind:1063 (NIP-94) von Community-Relays.
  - Mitgliedschaften: Liest kind:30382 Events und zeigt abonnierte Communities im Dropdown.
  - Community-Info: Parst kind:10222 Events (Name, Relays, Blossom-Server, Content-Sections).
  - „Share to Community"-Aktion: DOM-Overlay Community-Picker im Gallery-Detail, publiziert kind:30222 an Community-Relays.
  - `CommunityTab.svelte`: Vollständige Community-Media-Browser-UI mit Community-Selector, Info-Bar, Media-Grid und Detail-Sidebar.
  - Nostr-Helper: `parseMembershipEvent`, `parseCommunityEvent`, `parseShareEvent`, `fetchMemberships`, `fetchCommunity`, `fetchCommunityMedia`, `publishCommunityShare`.
- **Community-Tab als Builtin im IIFE-Bundle**: `communityTabPlugin` wird automatisch in `init()` injiziert wenn `features.community !== false`. Kein separates Script nötig.
  - Neues Feature-Flag `community?: boolean` in `BlossomMediaFeatures`.
  - Vite Widget-Build löst `@blossom/tab-communikey` und `@blossom/plugin/plugin` per Alias auf.
  - Deaktivierbar via `features: { community: false }` in der Config.
- **`plugin-api.ts` Erweiterung**: Neue Exports für Plugin-Autoren: `ShareTarget`, `NostrProfile`, `PublishEventResult`, `PublishRelayResult`, `publishEvent`, `fetchProfile`, `shortenPubkey`.

### Tests

- 13 Unit-Tests für `tab-communikey` Nostr-Parser (Membership, Community, Share-Event Parsing).
- Alle 63 Core-Tests weiterhin grün nach Share-Infrastruktur-Änderungen.

- **Tab-Plugin-API**: Externes Tab-Plugin-System für das Media Widget. Neue Tabs können als eigenständige Pakete implementiert werden, ohne den Core-Code anzufassen.
  - `TabPlugin` Interface: Unterstützt sowohl Vanilla-DOM (`render(container, ctx)`) als auch Svelte 5 (`component`) Rendering.
  - `WidgetContext`: Getter-basiertes Context-Objekt mit Zugriff auf `signer`, `servers`, `relayUrls`, `items`, `nip94Data`, `userSettings` und Actions (`insert`, `refreshGallery`, `close`, `switchTab`, `reportError`).
  - Event-System: `ctx.on('signer-changed' | 'settings-changed' | 'gallery-loaded' | 'tab-changed' | 'open' | 'close', handler)` mit Unsubscribe-Support.
  - Plugin-Lifecycle: `onActivate`, `onDeactivate`, `onDestroy` Hooks.
  - Tab-Sortierung: `order`-Feld (Builtin 0–99, Plugins ab 100).
  - Tab-Icons: Optionales `icon`-Feld (Emoji/SVG) für die Tabbar.
- **`@blossom/plugin/plugin` Export**: Neuer Package-Export-Pfad mit allen Types und Utilities für Plugin-Autoren.
- **`packages/tab-example`**: Referenz-Paket mit Vanilla-DOM und Svelte-Component Tab-Plugin-Beispielen.
- **`event-emitter.ts`**: Leichtgewichtiger typisierter Event-Emitter für die Plugin-Kontext-API.
- **`BlossomMediaConfig.plugins`**: Neues Config-Feld zum Registrieren von Tab-Plugins.
- **Plugin-Toggles in User Settings**: Tab-Plugins können vom Benutzer in den Einstellungen ein- und ausgeschaltet werden.
  - `BlossomUserSettings.disabledPlugins`: Array deaktivierter Plugin-IDs, wird in localStorage + NIP-78 persistiert.
  - Neue UI-Sektion „Erweiterungen" im SettingsPanel mit Checkboxen für jedes registrierte Plugin.

### Docs

- **`docs/plugin-tabs.md`**: Plugin-Authoring-Guide mit API-Referenz, Quick-Start, Beispielen und Best Practices.
- **`README.md` aktualisiert**: Veraltete Demo-/`pnpm start`-Hinweise entfernt, Bookmarklet/Examples ergänzt und GitHub-Pages-Startziel (`examples/simple-input.html`) dokumentiert.
- **`integration.md` aktualisiert**: InsertMode-/Feature-Tabellen an aktuellen Widget-Stand angepasst (`markdown-desc`, `json`, `imageGen`, `community`, `plugins`) und Pages/Examples-Flow ergänzt.

### Deprecated

- **`CustomTab` Interface**: Durch `TabPlugin` ersetzt. `CustomTab` bleibt über `config.tabs` rückwärtskompatibel erhalten.

- **Pending-Upload-Recovery**: Verwaiste Blossom-Uploads (hochgeladen, aber nicht als NIP-94 publiziert) werden im `localStorage` verfolgt (`blossom-pending:${appId}`). Beim nächsten Öffnen des Widgets zeigt ein Banner die nicht abgeschlossenen Uploads an. Der User kann sie sequentiell vervollständigen (Metadaten eingeben + publizieren) oder mit „Upload löschen" den Blob inkl. Previews vom Server entfernen.
- **`core/pending-uploads.ts`**: Neues framework-agnostisches Modul mit `savePendingUpload()`, `removePendingUpload()`, `removePendingUploadByUrl()`, `loadPendingUploads()`, `clearAllPendingUploads()` und `extractRelatedFromTags()`.
- **`core/publish-media.ts`**: Extrahierte wiederverwendbare `publishMediaMetadata()` Funktion für NIP-94 Publishing mit `InsertResult`-Rückgabe.
- **`MetadataSidebar` — `onDeleteUpload` Prop**: Neuer optionaler Callback zeigt einen roten „Upload löschen"-Button mit Bestätigungsschritt an. Wird im Recovery-Flow und potenziell im normalen Upload-Flow verwendet.
- **`UploadTab` — `appId` Prop**: Upload-Tab erhält jetzt die `appId` zum Scoping der Pending-Upload-Einträge im `localStorage`.

### Changed

- **Kind-1-Fallback entfernt**: Beim Publizieren von Medien-Metadaten wird kein kind-1-Event mehr zusätzlich zum NIP-94 (kind 1063) publiziert. Der Fallback produzierte ungewollte Notes im Feed und wurde nirgends abgefragt.

- **„Bild erstellen"-Tab im Media-Widget**: Neuer Builtin-Tab `imagegen` mit Prompt-Eingabe, KI-Bildgenerierung, Vorschau, Blossom-Upload und Inline-Metadaten/Publish. Wird automatisch angezeigt, wenn eine KI-Service-URL (`imageGenEndpoint` oder `visionEndpoint`) konfiguriert ist.
- **`ImageGenTab.svelte`**: Vollständige State-Machine (idle → generating → preview → uploading → metadata → publishing → done/error) mit Cancel-Support und Retry.
- **`POST /image-gen` Server-Route**: Neue Route in `apps/image-describer` für OpenAI-kompatible Bildgenerierungs-APIs (Ollama, ComfyUI, LocalAI, OpenRouter, DALL-E). Prompt-Validierung, Timeout, strukturierte Fehler.
- **`core/imagegen.ts`**: Framework-agnostiges Client-Modul mit `fetchImageGeneration()` und `resolveImageGenEndpoint()`.
- **`imageGenEndpoint` Config-Option**: Neues optionales Feld in `BlossomMediaConfig` und `BlossomUserSettings` für dedizierte Image-Gen-API-URL. Fällt auf `visionEndpoint` zurück.
- **`imageGen` Feature-Flag**: Neues Feld in `BlossomMediaFeatures` zum expliziten Deaktivieren des Tabs.
- **Image-Gen Env-Variablen**: `IMAGE_GEN_API_URL`, `IMAGE_GEN_API_KEY`, `IMAGE_GEN_MODEL`, `IMAGE_GEN_TIMEOUT_MS`, `IMAGE_GEN_DEFAULT_SIZE` für den Docker-Server.
- **Ollama-Service-Block** in `docker-compose.yml` (auskommentiert, als Referenz).

### Changed

- **Multi-Relay Publishing**: `publishEvent()` und `publishDeletionEvent()` akzeptieren jetzt `relayUrls: string | string[]` und publizieren parallel an alle konfigurierten Relays. Pro Relay wird ein individuelles Ergebnis zurückgegeben (`PublishRelayResult`). Einzelne Relay-Ausfälle blockieren nicht mehr den gesamten Publish-Vorgang.
- **`MergedConfig.relayUrls`**: Interne Config verwendet jetzt `relayUrls: string[]` statt `relayUrl?: string`. Alle User-Relays aus den Einstellungen werden berücksichtigt, nicht nur der erste Eintrag.

### Fixed

- **NIP-07 Poll bei Bunker-Credentials übersprungen**: Wenn gespeicherte Bunker-Credentials (`bunkerUri` + `bunkerLocalKey`) vorhanden sind, wird das 5-Sekunden-Polling für `window.nostr` übersprungen. Der Bunker-Auto-Reconnect übernimmt direkt — schnellerer Widget-Start.
- **Alle konfigurierten Relays werden versucht**: NIP-94-Events und Löschungen werden jetzt an alle Relays gesendet, nicht nur an den ersten. Behebt das Problem, dass Events nicht ankamen, wenn ein einzelner Relay (z.B. `relay.damus.io`) ausfiel.
- **Gallery-Reload nach Bunker-Reconnect**: Die Mediathek wird jetzt explizit neu geladen, sobald der Bunker-Signer verfügbar wird. Vorher blieb die Gallery leer, weil der initiale Ladevorgang ohne Signer stattfand und NIP-94-Events übersprungen wurden.
- **Bookmarklet-Popup Signer-Status**: Statusanzeige aktualisiert sich jetzt korrekt von „Bunker-Verbindung wird hergestellt…" auf „Signer verbunden" via `onSignerReady`-Callback.

### Added

- **`onSignerReady` Callback**: Neues optionales Feld in `BlossomMediaConfig`. Wird aufgerufen, sobald ein Signer verfügbar wird (NIP-07, NIP-46 Bunker oder Host-Signer), mit dem Hex-Pubkey als Argument. Ermöglicht externen Status-Indikatoren (z.B. Bookmarklet-Statusleiste) die Signer-Verfügbarkeit zu erkennen.
- **Settings-Panel im Widget**: Neuer User-Icon-Button im Header öffnet ein Einstellungs-Panel (Overlay-Pattern). Enthält Login-Hinweise (NIP-07 Extensions, NIP-46 Bunker), Profil-Anzeige (readonly), und Formulare für Blossom-Server, Nostr-Relays und KI-Service-URL.
- **NIP-46 Remote Signer (Bunker)**: Bunker-URI-Eingabe im Settings-Panel ermöglicht Login über `bunker://`-URIs. Nutzt NDK (`@nostr-dev-kit/ndk`) intern per Dynamic Import. Bunker-Signer wird bevorzugt, wenn konfiguriert.
- **NIP-46 Bunker-Persistenz**: Lokaler App-Schlüssel wird in `localStorage` gespeichert (`bunkerLocalKey`), damit die Bunker-Verbindung beim erneuten Öffnen des Widgets automatisch wiederhergestellt wird. Disconnect-Button zum manuellen Trennen.
- **NIP-78 Settings-Sync**: User-Einstellungen werden als Kind-30078-Event (NIP-78 Application-specific data) auf dem konfigurierten Relay gespeichert und beim Öffnen des Widgets geladen. `localStorage` dient als primäre Persistenz, NIP-78 als Sync-Layer.
- **`BlossomUserSettings`**: Neues Interface für persistierte User-Einstellungen (`bunkerUri`, `servers`, `relays`, `visionEndpoint`). Settings überschreiben die Host-Config als non-destructive Override-Layer.
- **Profil-Fetch (`fetchProfile`)**: Liest Kind-0-Events (NIP-01 Metadata) und zeigt Name, Avatar und NIP-05 im Settings-Panel an.
- **`appId` Config-Option**: Neues optionales Feld in `BlossomMediaConfig` für localStorage-Key-Scoping bei mehreren Widget-Instanzen.
- **Signer-Status-Indikator**: Grüner Punkt am User-Icon zeigt an, ob ein Signer (NIP-07 oder NIP-46) aktiv ist.
- **`@nostr-dev-kit/ndk`** als Dependency für NIP-46-Unterstützung.
- Tests für `settings.ts` (localStorage, merge-Logik), `nip46.ts` (URI-Validierung), `profile.ts` (`shortenPubkey`).

- **`@blossom/plugin/widget` — Embeddable Media Widget**: Neues Widget-Paket als einbettbares Script/ESM-Modul. Ein einziger `<script>`-Tag fügt der Hostseite eine vollständige Mediathek-Funktionalität hinzu (Upload + Gallery + Metadaten + KI-Vorschläge).
- **`MediaWidget.svelte`**: Root-Komponente mit nativem `<dialog>` (Shadow DOM), Tab-Bar (Dateien hochladen / Mediathek / Custom Tabs), signer-Auflösung (config.signer → window.nostr) und Cross-Tab-Navigation für Metadaten-Bearbeitung.
- **`UploadTab.svelte`**: Upload-Tab mit Drag-&-Drop-Zone, Fortschrittsanzeige, Preview-Generierung (Thumb 200px + Image 600px) und nahtlosem Übergang zu `MetadataSidebar` nach erfolgreichem Upload.
- **`GalleryTab.svelte`**: Mediathek-Tab mit NIP-94 + lokaler History Merge-Logik (aus `BlossomGallery.svelte` extrahiert), Thumbnail-Grid, Keyword-Filter-Chips, Volltext-Suche, Metadaten-Sidebar und Löschen-mit-Bestätigung.
- **`MetadataSidebar.svelte`**: Wiederverwendbare Metadaten-Seitenleiste (Beschreibung, Alt-Text, Autor, Genre, Lizenz-Picker, KI-Modus, Keywords). Enthält KI-Vorschlag-Button (via `fetchVisionSuggestion`) und unterscheidet `create`-/`edit`-Modus.
- **`Injector.ts`**: DOM-Scanner + `MutationObserver`: Findet `[data-blossom]`-Elemente (oder konfigurierten CSS-Selektor) und injiziert einen "🌸 Mediathek"-Button inline neben jedem Feld. Schreibt nach Auswahl die URL per synthetischen Events zurück (React/Vue/native kompatibel).
- **`widget/index.svelte.ts`**: `init(config)` erzeugt Shadow-DOM-Host, mountet `MediaWidget` per Svelte 5 `mount()`, startet optional den Injector und gibt `BlossomMediaInstance` (`open/close/destroy`) zurück. Auto-Init via `data-blossom-config`-Attribut am Script-Tag.
- **`widget/types.ts`**: Öffentliche Widget-Typen: `BlossomMediaConfig`, `BlossomMediaInstance`, `InsertResult`, `InsertMode`, `BlossomMediaFeatures`, `CustomTab`.
- **`vite.config.widget.ts`**: Vite-Build für das Widget: IIFE (`window.BlossomMedia`) + ESM-Output. CSS aller Svelte-Komponenten wird via eigenem Rollup-Plugin (`injectCssIntoBundle`) als `__BLOSSOM_CSS__`-Variable in das JS-Bundle eingebettet und zur Laufzeit in den Shadow DOM injiziert — kein separates Stylesheet nötig.
- **`build:widget` Script**: `pnpm --filter @blossom/plugin build:widget` erzeugt `dist/widget/blossom-media.iife.js` und `dist/widget/blossom-media.esm.js`.
- **`examples/simple-input.html`**: Erstes selbständiges HTML-Beispiel für die Widget-Einbettung — zeigt Auto-Init via `data-blossom-config`, manuellen Init via `window.BlossomMedia.init()` und `data-blossom`-Feldmarkierung.
- **`examples/bookmarklet-popup.html`**: Popup-Variante des Bookmarklets für CSP-geschützte Seiten (z. B. Coracle, Primal). Öffnet die Mediathek in einem eigenen Fenster, kopiert die URL in die Zwischenablage. Konfiguration per URL-Parameter (`?servers=…&relay=…&vision=…`).

### Changed

- **`apps/demo` entfernt**: Die SvelteKit-Demo-App wurde entfernt. Ihre Inhalte sind vollständig im Plugin (`@blossom/plugin/core` + `@blossom/plugin/widget`) aufgegangen. Anstelle der Demo gibt es jetzt eigenständige HTML-Beispiele unter `examples/`.
- Root-`package.json`: `dev`- und `start`-Skripte (Demo-spezifisch) entfernt; `build:widget`-Shortcut ergänzt.
- **`docs/`-Ordner entfernt**: Veraltete Einzeldokumente ersetzt durch [`integration.md`](../integration.md) im Repo-Root.

### Fixed

- **`MediaWidget.svelte` — Signer-Erkennung**: `window.nostr` (NIP-07) wurde nur einmal beim Mount geprüft. Da `$derived` globale Variablen nicht reaktiv trackt und NIP-07-Extensions `window.nostr` asynchron injizieren, blieb der Signer auf `null`. Ersetzt durch reaktiven `$state` mit Polling (bis 5 s), sodass spät injizierte NIP-07-Signer zuverlässig erkannt werden.
- **`widget/index.svelte.ts`** (Umbenennung von `index.ts`): `$state()`-Runes konnten in einer plain `.ts`-Datei nicht genutzt werden; die Umbenennung auf `.svelte.ts` aktiviert den Svelte-5-Rune-Compiler für diese Datei.
- **Svelte-Warnungen `state_referenced_locally`** in `MetadataSidebar.svelte` und `MediaWidget.svelte`: Form-State-Initialisierungen aus Props werden jetzt mit `untrack(() => ...)` gekapselt.
- **Svelte-Warnung `a11y_no_noninteractive_element_to_interactive_role`** in `MediaWidget.svelte`: `<nav role="tablist">` durch semantisch korrektes `<div role="tablist">` ersetzt.

### Docs

- **`integration.md`** (neu): Vollständige Integrations-Referenz mit tabellarischen Config-Optionen (`BlossomMediaConfig`, `BlossomMediaFeatures`, `InsertMode`, `InsertResult`), Methoden-Beschreibungen (`init`, `open`, `close`, `destroy`), Signer-Interface, Vision-Service-Setup und Sicherheitshinweisen.


- **Blossom Gallery**: Neuer „Blossom Gallery"-Button neben dem Upload-Input öffnet eine WordPress-ähnliche Mediathek-Dialog mit Thumbnail-Grid aller hochgeladenen Dateien.
- **Blossom Gallery Server-Listing**: Gallery lädt beim Öffnen automatisch alle Blobs des eingeloggten Users von allen konfigurierten Blossom-Servern (`GET /list/{pubkey}`, BUD-02/BUD-04) und merged sie mit lokaler Upload-History. Remote-only Dateien werden mit ☁-Badge gekennzeichnet.
- **Blossom Gallery NIP-94 Integration**: Gallery fetcht parallel zu den Blossom-Server-Blobs auch NIP-94 Kind-1063 Events vom Relay und reichert Galerie-Items automatisch mit Metadaten (Beschreibung, Autor, Lizenz, Genre, Keywords, KI-Hints, Thumbnails) an, soweit vorhanden.
- **Gallery Keyword-Filter**: Neues Suchfeld und klickbare Keyword-Chips im Gallery-Header ermöglichen Volltextfilterung nach Keywords, Beschreibung, Autor, Genre und MIME-Typ.
- Gallery unterstützt Refresh-Button zum erneuten Laden der Server-Daten und zeigt Loading-/Fehlerzustand an.
- Gallery-Seitenleiste zeigt bei Selektion Vorschau und Metadaten (URL, Typ, Datum, SHA-256, Beschreibung, Autor, Lizenz, Genre, Keywords, KI-Hints, Event IDs).
- „Übernehmen"-Button in der Gallery überträgt die URL der selektierten Datei ins Upload-Input.
- „Löschen"-Button in der Gallery mit Bestätigungsdialog löscht die Datei (inkl. Thumbnails/Vorschaubilder) von allen Blossom-Servern und publiziert ein NIP-09 Kind-5 Deletion-Event für zugehörige NIP-94 Events.
- Upload-History speichert jetzt `sha256`, `uploadTags` und `publishedEventIds` für vollständige Metadaten-Nachverfolgung und Löschung.
- Neue Lösch-Logik in `blossom-delete.ts`: BUD-02-konforme `DELETE`-Requests mit signiertem Kind-24242 Auth-Event sowie NIP-09 Deletion-Events.
- Neue List-Logik in `blossom-list.ts`: BUD-02/BUD-04-konforme `GET /list/{pubkey}`-Requests mit optionalem Auth-Header, Deduplizierung nach SHA-256.

### Changed

- **Gallery nur noch NIP-94-basiert**: Blossom-Server `/list/`-Abfragen komplett aus der Gallery entfernt. Gallery-Einträge kommen jetzt ausschließlich aus NIP-94 Kind-1063 Events + lokaler Upload-History. Eliminiert Duplikate durch Thumb/Image-Blobs, die zuvor als separate Einträge erschienen.
- **NIP-94-first Gallery-Architektur**: Gallery nutzt jetzt NIP-94 Kind-1063 Events als primäre Datenquelle (reichste Metadaten). Blossom-Server-Blobs dienen nur noch zur Erkennung von Orphan-Dateien (auf Server vorhanden, aber kein NIP-94 Event publiziert).
- **Thumb/Image-Duplikat-Filter**: URLs, die als `thumb` oder `image` Preview in einem NIP-94 Event oder der lokalen Upload-History vorkommen, werden aus der Gallery-Übersicht gefiltert — keine doppelten Einträge mehr für Preview-Bilder.
- Sidebar zeigt jetzt klar differenzierte Quell-Badges: 📡 NIP-94 vom Relay, oder „nur lokal".
- Metadaten-Felder (Beschreibung, Autor, Genre, Lizenz) werden immer angezeigt (mit „—" als Fallback), nicht mehr nur wenn `metadata` vorhanden ist.

### Fixed

- **`publishDeletionEvent()` sendet Kind-5 jetzt tatsächlich an den Relay**: Das NIP-09 Deletion-Event wurde nur signiert, aber nie per WebSocket an den Relay gesendet — daher blieben NIP-94 Events nach dem Löschen in der Gallery bestehen. Jetzt wird `Relay.connect()` + `relay.publish()` verwendet.
- **NIP-09 Kind-5 enthält jetzt `k`-Tag**: Deletion-Events enthalten nun `['k', '1063']` per NIP-09 Spec, damit Relays wissen, welche Event-Kinds gelöscht werden sollen.
- **Svelte-5-Proxy-Fehler bei `publishEvent()`**: Events werden jetzt vor der Übergabe an NIP-07 Extensions deep-gecloned (`JSON.parse/stringify`), um `structuredClone`-Fehler bei Svelte-5-Reactivity-Proxies zu vermeiden.
- **`publishEvent()` sendet jetzt tatsächlich an Relays**: Events wurden bisher nur signiert und zurückgegeben, aber nie per WebSocket an den konfigurierten Relay gesendet. Daher waren NIP-94 Abfragen immer leer. Jetzt wird `Relay.connect()` + `relay.publish()` aus `nostr-tools/relay` verwendet.
- **SHA-256 Case-Mismatch**: Die NIP-94 `bySha256`-Map normalisiert Hashes jetzt auf Lowercase, damit Blossom-Server-Hashes (ggf. anderer Case) zuverlässig matchen.

- Demo-Upload erzeugt jetzt automatisch NIP-94 `thumb` (200px) und `image`-Preview (600px) für Bilder und PDFs und nimmt diese in Publish-Tags auf.
- Upload-Bereich der Demo zeigt jetzt auch für PDFs einen Metadaten-Vorschau-Block mit direktem Link zur Datei.
- Demo-Metadaten-Dialog öffnet jetzt auch für PDF-Uploads (`application/pdf`) und erlaubt Vision-gestützte Kurzbeschreibungen.
- `image-describer` unterstützt jetzt PDF-Beschreibung über mehrere gerenderte Seiten plus Textauszug, damit Dokumentinhalt statt nur Cover analysiert wird.
- `image-describer` unterstützt jetzt `OPENROUTER_RESPONSE_LANGUAGE` zur Steuerung der Modell-Antwortsprache für `description`, `alt` und `genre` (Default: `German`).
- Bild-Metadaten unterstützen jetzt ein zusätzliches Feld `Genre` (z. B. comic, photorealistic, aquarell) im Dialog, in der Vorschau und in der Upload-History.
- Metadaten-Dialog unterstützt jetzt KI-Attribution für Bilder: Auswahl zwischen „KI generiert“ und „Mit Hilfe von KI generiert“ inkl. automatischer Autor-Setzung.
- Bei KI-Bild-Attribution wird die Lizenz automatisch auf CC0 gesetzt.
- Publish-Helper ergänzt `hint`-Tags für KI-Herkunft (`ai-image-generated`, `ai-image-assisted`) und KI-generierte Metadaten (`ai-metadata-generated`).
- Demo-Metadaten-Dialog hat jetzt ein Lizenz-Dropdown mit bekannten OER-Presets (CC/PD/MIT) sowie die Option „Andere Lizenz" mit Eingabeformat `uri|label`.
- `Default Metadata Source` nutzt jetzt ebenfalls ein Lizenz-Dropdown (CC/PD/MIT) plus „Andere Lizenz" (`uri|label`) für konsistente Auto-Fill-Vorgaben.
- `image-describer` liefert jetzt optional ein `alt`-Feld (für HTML-`img` Alt-Attribute) zusätzlich zu `description` und `tags`.
- Neuer Service `apps/image-describer` (Fastify + Sharp) für Vision-Beschreibungen als eigenständiger HTTP-Dienst mit `POST /describe` und `GET /health`.
- `docker-compose.yml` ergänzt, um den `image-describer` als separaten Container zu betreiben.
- Vision-Endpoint unterstützt jetzt `OPENROUTER_VISION_INLINE_ONLY=true`, um URL-Fallbacks vollständig zu verhindern und ausschließlich Inline-Bilddaten zu verwenden.
- Demo-Metadaten-Dialog kann jetzt per Vision-Modell eine Kurzbeschreibung (und optionale Keywords) aus der Bild-URL vorschlagen.
- Demo unterstützt jetzt Auto-Fill von Bild-Metadaten aus Input-Quellen (`Default Metadata Source`) und optionalen `data-metadata-*` Attributen am Upload-Input.
- Demo zeigt standardmäßig unter dem Upload-Input eine Metadaten-Zielsektion mit Bildvorschau (falls kein separates Target verwendet wird).
- Demo-Uploadflow für Bilder um verpflichtende Metadaten-Eingabe erweitert (Beschreibung, Alt-Attribution; optional Autor, Lizenz, Keywords).
- Demo publiziert nach Bild-Upload automatisch ein NIP-94 File-Metadata-Event (kind `1063`) plus kompatibles kind-`1` Fallback.
- Subpath-Exports für gezielte Imports ergänzt: `@blossom/plugin/core`, `@blossom/plugin/svelte`, `@blossom/plugin/tiptap`.
- Neue „Dead Simple“-Bridge `createBlossomBridge` (`uploadFile`, `selectAndUpload`, `attachToInput`) für host-agnostische Integration ergänzt.
- Monorepo-Grundstruktur (`apps/*`, `packages/*`) definiert.
- Projekt-Governance in `AGENTS.md` eingeführt.
- Erstes Plugin-Paket `@blossom/plugin` mit Headless Upload-Client erstellt.
- Svelte Action `useBlossomInput` für URL-Input-Enhancement hinzugefügt.
- Demo-App (`apps/demo`) mit NIP-07/NIP-46 Login, Upload-Flow und Event-Publish Scaffold erstellt.
- Upload-History Store und initiale Testdateien für Plugin und Demo ergänzt.
- Root-Script `start` ergänzt, um die Demo-Produktionsinstanz zentral zu starten.
- Echte TipTap-Extension (`BlossomExtension`) inkl. Upload-Insert-Helper im Plugin ergänzt.
- TipTap-Demo-Integration mit Upload-Button und Editor-Preview in der Demo-App ergänzt.
- Gemeinsame `SignerAdapter`-Schnittstelle für NIP-07/NIP-46 im Demo-Auth-Layer ergänzt.
- Sichtbarer Session-Status (connecting/connected/error/disconnected) in der Login-Sektion ergänzt.
- NIP-46 in der Demo auf NDK-basierten Signaturpfad umgestellt (echte Signatur statt Demo-Sig).

### Changed

- Vision- und Upload-Fallback-Texte wurden auf dateitypunabhängige Formulierungen umgestellt (`Uploaded file` statt nur `Uploaded image`).
- PDF-Analyse im Vision-Service berücksichtigt nun standardmäßig mehrere Seiten (konfigurierbar) und einen extrahierten Textauszug.
- Lizenz-Dropdowns enthalten jetzt die vollständige CC-4.0-Auswahl (`BY`, `BY-SA`, `BY-ND`, `BY-NC`, `BY-NC-SA`, `BY-NC-ND`) zusätzlich zu `CC0`/`PDM`.
- Vision-Service `image-describer` liefert jetzt zusätzlich `genre` in der `/describe`-Antwort (inkl. Fallback-Pfaden) und fragt das Modell explizit danach.
- Lizenz-Tags werden im Publish-Helper jetzt als `['license', canonical, label?]` aufgebaut; bekannte Presets liefern automatisch URL + Kurzlabel.
- `image-describer` normalisiert `alt` jetzt explizit (Control-Chars/`<>` entfernen, Whitespace glätten, Länge auf 140 Zeichen begrenzen) und liefert `alt` konsistent auch in Fallback-/Fehlerpfaden zurück.
- Demo verwendet für den externen Vision-Service jetzt die Browser-Variable `VITE_IMAGE_DESCRIBER_URL` (statt `PUBLIC_IMAGE_DESCRIBER_URL`) für robuste Client-Auflösung.
- Vision-Flow der Demo ist jetzt eindeutig auf externen `image-describer` ausgerichtet; `PUBLIC_IMAGE_DESCRIBER_URL` ist als Ziel-Endpoint vorgesehen.
- Demo unterstützt jetzt einen externen Vision-Service via `PUBLIC_IMAGE_DESCRIBER_URL` ohne lokalen Fallback.
- Standardmodell für Vision-Beschreibungen wurde auf qwen/qwen3-vl-8b-instruct umgestellt (über OPENROUTER_VISION_MODEL weiterhin überschreibbar).
- Vision-Optimierung nutzt jetzt eine harte Mehrstufen-Strategie: erst Qualitätsreduktion, danach schrittweise Dimensionsreduktion bis zur Mindestgröße, um Inline-Requests stabil unter dem Größenlimit zu halten.
- Vision-Endpoint skaliert und komprimiert Bilder jetzt serverseitig (max. Dimension + Qualität) vor dem Inline-Base64-Upload an das Modell.
- Vision-Endpoint liefert jetzt `inputMode` (`inline`, `remote-url`, `inline-then-remote-url`, `none`) zurück, damit transparent ist, welches Bild-Eingabeformat tatsächlich an den Provider ging.
- `Default Metadata Source` wurde auf wiederverwendbare Felder Autor/Lizenz reduziert, um die UI klarer zu halten.
- Metadaten aus der Default-Zielsektion können über einen Edit-Button nachträglich aktualisiert und erneut publiziert werden.
- Metadaten-Erfassung in der Demo von Browser-Prompts auf einen In-Page-Dialog mit Pflichtfeld-Validierung umgestellt.
- Publish-Helper in der Demo unterstützt nun variable Event-Kinds statt festem kind `1`.
- Blossom-Tag-Normalisierung bewahrt zusätzliche Tag-Segmente (mehr als 2 Werte) statt sie abzuschneiden.
- Demo-Uploadflow auf `createBlossomBridge` als primäre Integrations-API umgestellt.
- Publish-Scope des Plugin-Pakets bereinigt: Nur `dist/` wird veröffentlicht, Testdateien bleiben außerhalb des Tarballs.
- `@blossom/plugin` Package-Entrypoints/Exports auf `dist/*` umgestellt (statt `src/*`) für saubere Consumer-Resolution.
- TypeScript/SvelteKit Tooling auf lauffähigen Monorepo-Stand gebracht.
- Upload-Client um optionale `timeoutMs` und `AbortSignal`-Unterstützung erweitert.
- Demo-App von `@sveltejs/adapter-auto` auf festen Node-Adapter (`@sveltejs/adapter-node`) umgestellt.
- Signer- und Publish-Flow im Demo auf adapter-basiertes Interface vereinheitlicht.
- Plugin-Upload-Signer auf explizites `BlossomSigner`-Interface gehärtet (`getPublicKey` + `signEvent`).

### Fixed

- PDF-Uploads übersprangen im Demo-Flow bisher den Metadaten-Dialog; der Dialog wird nun korrekt geöffnet.
- Publisher validiert jetzt Lizenz-Attribution strikt: ein Label ohne kanonischen Lizenzwert wird mit klarer Fehlermeldung abgewiesen.
- Im Demo-Metadaten-Dialog überschreibt ein Vision-Vorschlag die Alt-Attribution jetzt konsistent mit dem gelieferten `alt`-Wert.
- Lokale Demo-Route `/api/vision/describe` gibt jetzt bewusst `410` zurück, damit versehentliche lokale Vision-Nutzung früh und eindeutig auffällt.
- Vision-Endpoint liest Umgebungsvariablen jetzt zur Request-Zeit (statt nur beim Modul-Load), wodurch geänderte Runtime-Config im laufenden Dev-Flow konsistenter übernommen wird.
- Vision-Endpoint liefert zusätzlich `imageProcessing` (Quelle/optimierte Bytes und MIME), damit Inline-Resize-Verhalten transparent nachvollziehbar ist.
- Vision-Endpoint antwortet bei fehlendem `OPENROUTER_API_KEY` jetzt mit robustem Fallback (`200` + Warning) statt mit hartem `500`.
- Hash-basierte Bilddateinamen werden im Vision-Fallback nicht mehr als kryptische Beschreibung ausgegeben, sondern als `Uploaded image` normalisiert.
- Demo-Importpfad für NIP-46 Runtime korrigiert (`./ndk-runtime`), sodass die Modulauflösung wieder stabil funktioniert.
- Demo-TSConfig gehärtet (`strict`, `forceConsistentCasingInFileNames`) und aufgedeckte Folgeprobleme bereinigt.
- Strict-Nullability-Fix im NIP-46 Disconnect-Pfad sowie kompatibler TipTap-Type-Cast im Upload-Callsite ergänzt.
- Demo-Blossom-Serverliste korrigiert (nur HTTPS-Uploadserver, kein `wss://`-Relay in Upload-Targets).
- Paketversion und Typauflösungen korrigiert, sodass `typecheck` ohne Fehler läuft.
- Fehlendes Root-Script `check` ergänzt (`pnpm run check` funktioniert wieder).
- NIP-07 `signEvent`-Aufruf auf gebundenen Provider-Kontext umgestellt (Fix für `this._call is not a function`).
- Upload-Fehlerbehandlung in der Demo verbessert (klare Meldung bei AggregateError/CORS/Auth-Problemen).
- NIP-46-Signierung robust gemacht: Relay-URLs werden normalisiert, bei `relay not connected` erfolgt Reconnect + Retry.
- NIP-46-Handshake stabilisiert: Popup-Auth-Handling, expliziter Timeout und verlässlicher `error`-Status statt dauerhaftem `connecting`.

### Docs

- README ergänzt um Hinweis auf PDF-Unterstützung im `image-describer` und im Metadaten-Dialog.
- README um Compose-Setup für den separaten `image-describer`-Service erweitert.
- Anleitung für Demo-Umgebungsvariablen via `apps/demo/.env` ergänzt (inkl. `apps/demo/.env.example`).
- Dokumentation um Hinweise zum Metadaten-Publish nach Bild-Upload (kind `1063` + kind `1`) ergänzt.
- Regeln für Komponenten-, Usage- und Progress-Dokumentation festgelegt.
- Root-Dokumentation in `README.md` mit Setup und Usage-Beispielen ergänzt.
- Separater Quickstart für unbekannte Host-Clients ergänzt (`docs/simple-integration.md`).
- Quickstart um Kurzsektion „SignerAdapter in 60 Sekunden“ mit NIP-07/NIP-46 Mini-Beispielen ergänzt.
- Quickstart um optionales Mini-Beispiel für einen Custom-`nsec`-Signer inkl. Sicherheits-Hinweis ergänzt.
- Neues `docs/examples/`-Set mit stark reduzierten Client-Beispielen ergänzt (URL-Input, TipTap, Clipboard-Paste→`img`).
- Neue `docs/dist/`-Dokumentation ergänzt: je Integrationsbereich (`core`, `svelte`, `tiptap`) mit Einsatzkriterien und Minimalbeispiel.

### Tests

- Tests für Metadaten-Tag-Building prüfen jetzt auch den neuen `genre`-Tag.
- Tests für KI-`hint`-Tags im Publish-Flow ergänzt (kind `1063` und kind `1` Fallback).
- Tests für Lizenz-Tagging ergänzt (3-teiliges `license`-Tag und Validierungsfehler bei fehlendem kanonischem Wert).
- Tests für Metadaten-Tag-Building und kind-`1063` Publish-Pfad ergänzt.
- Upload-Client-Test ergänzt, der mehrteilige Tags validiert.
- Unit-Tests für `createBlossomBridge` (Datei-Upload, Cancel, Input-Attach-Flow) ergänzt.
- P0/P1 Teststrategie als Projektstandard definiert.
- Unit-Tests für Upload-Client und Signer-Basisflow implementiert.
- P0-Action-Test für URL-Input-Integration (`useBlossomInput`) ergänzt.
- Integrationstest für Demo-Flow Upload → Publish mit NIP-94 `url` Tag ergänzt.
- P0-Tests für Timeout- und Abort-Verhalten im Upload-Kern ergänzt.
- P0-Test für partiellen Multi-Server-Ausfall mit erfolgreichem Fallback ergänzt.
- Tests für TipTap-Insert- und Upload-Cancel-Verhalten ergänzt.
- Signer-Tests um Session-Status- und Disconnect-Verhalten erweitert.
- Regressionstest für NIP-07 Provider-Kontext (`this`-Bindung) ergänzt.
- Test für NIP-46 Reconnect-/Retry-Verhalten bei nicht verbundenem Relay ergänzt.
- Test für NIP-46 Timeout-Pfad und Store-Status `error` ergänzt.

### Security

- `image-describer` Docker-Image auf `node:22-alpine` angehoben, Alpine-Pakete beim Build aktualisiert und Container-Ausführung auf Non-Root (`USER node`) gestellt.
- `nsec` für MVP explizit ausgeschlossen.
