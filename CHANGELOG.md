# Changelog

All notable changes to this project will be documented in this file.

The format is based on Keep a Changelog.

## [Unreleased]

### Added

- Monorepo-Grundstruktur (`apps/*`, `packages/*`) definiert.
- Projekt-Governance in `AGENTS.md` eingeführt.
- Erstes Plugin-Paket `@blossom/plugin` mit Headless Upload-Client erstellt.
- Svelte Action `useBlossomInput` für URL-Input-Enhancement hinzugefügt.
- Demo-App (`apps/demo`) mit NIP-07/NIP-46 Login, Upload-Flow und Event-Publish Scaffold erstellt.
- Upload-History Store und initiale Testdateien für Plugin und Demo ergänzt.

### Changed

- TypeScript/SvelteKit Tooling auf lauffähigen Monorepo-Stand gebracht.

### Fixed

- Paketversion und Typauflösungen korrigiert, sodass `typecheck` ohne Fehler läuft.

### Docs

- Regeln für Komponenten-, Usage- und Progress-Dokumentation festgelegt.
- Root-Dokumentation in `README.md` mit Setup und Usage-Beispielen ergänzt.

### Tests

- P0/P1 Teststrategie als Projektstandard definiert.
- Unit-Tests für Upload-Client und Signer-Basisflow implementiert.
- P0-Action-Test für URL-Input-Integration (`useBlossomInput`) ergänzt.
- Integrationstest für Demo-Flow Upload → Publish mit NIP-94 `url` Tag ergänzt.

### Security

- `nsec` für MVP explizit ausgeschlossen.
