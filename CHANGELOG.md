# Changelog

All notable changes to this project will be documented in this file.

The format is based on Keep a Changelog.

## [Unreleased]

### Added

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

- Demo-Uploadflow auf `createBlossomBridge` als primäre Integrations-API umgestellt.
- Publish-Scope des Plugin-Pakets bereinigt: Testdateien werden über `.npmignore` nicht mehr mit veröffentlicht.
- TypeScript/SvelteKit Tooling auf lauffähigen Monorepo-Stand gebracht.
- Upload-Client um optionale `timeoutMs` und `AbortSignal`-Unterstützung erweitert.
- Demo-App von `@sveltejs/adapter-auto` auf festen Node-Adapter (`@sveltejs/adapter-node`) umgestellt.
- Signer- und Publish-Flow im Demo auf adapter-basiertes Interface vereinheitlicht.
- Plugin-Upload-Signer auf explizites `BlossomSigner`-Interface gehärtet (`getPublicKey` + `signEvent`).

### Fixed

- Demo-Blossom-Serverliste korrigiert (nur HTTPS-Uploadserver, kein `wss://`-Relay in Upload-Targets).
- Paketversion und Typauflösungen korrigiert, sodass `typecheck` ohne Fehler läuft.
- Fehlendes Root-Script `check` ergänzt (`pnpm run check` funktioniert wieder).
- NIP-07 `signEvent`-Aufruf auf gebundenen Provider-Kontext umgestellt (Fix für `this._call is not a function`).
- Upload-Fehlerbehandlung in der Demo verbessert (klare Meldung bei AggregateError/CORS/Auth-Problemen).
- NIP-46-Signierung robust gemacht: Relay-URLs werden normalisiert, bei `relay not connected` erfolgt Reconnect + Retry.
- NIP-46-Handshake stabilisiert: Popup-Auth-Handling, expliziter Timeout und verlässlicher `error`-Status statt dauerhaftem `connecting`.

### Docs

- Regeln für Komponenten-, Usage- und Progress-Dokumentation festgelegt.
- Root-Dokumentation in `README.md` mit Setup und Usage-Beispielen ergänzt.
- Separater Quickstart für unbekannte Host-Clients ergänzt (`docs/simple-integration.md`).
- Quickstart um Kurzsektion „SignerAdapter in 60 Sekunden“ mit NIP-07/NIP-46 Mini-Beispielen ergänzt.
- Quickstart um optionales Mini-Beispiel für einen Custom-`nsec`-Signer inkl. Sicherheits-Hinweis ergänzt.
- Neues `docs/examples/`-Set mit stark reduzierten Client-Beispielen ergänzt (URL-Input, TipTap, Clipboard-Paste→`img`).

### Tests

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

- `nsec` für MVP explizit ausgeschlossen.
