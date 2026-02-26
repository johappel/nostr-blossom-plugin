# Changelog

All notable changes to this project will be documented in this file.

The format is based on Keep a Changelog.

## [Unreleased]

### Added

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
