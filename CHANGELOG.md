# Changelog

All notable changes to this project will be documented in this file.

The format is based on Keep a Changelog.

## [Unreleased]

### Added

- Demo-Metadaten-Dialog hat jetzt ein Lizenz-Dropdown mit bekannten OER-Presets (CC/PD/MIT) sowie die Option „Andere Lizenz" mit Eingabeformat `uri|label`.
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
