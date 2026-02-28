# @blossom/tab-oer-shares

OER-Shares Tab-Plugin für das Blossom Media Widget — teile Medien als AMB-Bildungsressourcen über das Edufeed-Netzwerk.

## Zweck

Dieses Plugin erweitert das Blossom Media Widget um:

- **"Im Edufeed teilen"** — ShareTarget-Aktion in der Gallery-Sidebar
- **AMB-Metadaten-Formular** — Felder nach dem [AMB-Standard](https://dini-ag-kim.github.io/amb/latest/) mit SKOS-Vocabulary-Selektoren
- **OER-Shares Tab** — Übersicht der eigenen kind:30142 Events auf dem Edufeed-Relay

## Installation

```bash
pnpm add @blossom/tab-oer-shares
```

## Minimalbeispiel

```ts
import { oerSharesPlugin } from '@blossom/tab-oer-shares';

BlossomMedia.init({
  servers: ['https://blossom.primal.net'],
  plugins: [oerSharesPlugin],
});
```

## Funktionsweise

### ShareTarget: "Im Edufeed teilen"

1. User wählt ein Bild/Video in der Gallery aus
2. Im Share-Menü erscheint "🎓 Im Edufeed teilen"
3. Ein Formular-Overlay öffnet sich mit vorausgefüllten NIP-94-Metadaten:
   - **Name** ← `alt`-Tag
   - **Beschreibung** ← `summary`/`content`
   - **Autor** ← `author`-Tag
   - **Lizenz** ← `license`-Tag (normalisiert zu CC-URL)
   - **Schlagworte** ← `t`-Tags
4. Zusätzlich: SKOS-Vocabulary-Selektoren für:
   - Zielgruppe (LRMI Audience Roles)
   - Bildungsstufe (ISCED-basiert)
   - Ressourcentyp (HCRT)
   - Fach/Thema (Schulfächer, konfigurierbar)
5. Klick auf "Jetzt im Edufeed teilen" → kind:30142 Event wird signiert und an `wss://relay-amb.edufeed.org` gesendet

### OER-Shares Tab

- Zeigt alle eigenen kind:30142 Events vom AMB-Relay
- Klick auf einen Share → Detailansicht mit allen AMB-Metadaten (prefLabels statt URIs)
- "URL übernehmen"-Button zum Einfügen in den Editor
- Einstellungen: Vocabulary-URLs und Relay anpassbar

## NIP-AMB Spezifikation

Events folgen der [NIP-AMB](https://github.com/edufeed-org/nips/blob/edufeed-amb/AMB.md) Spezifikation:

- **Kind**: 30142 (addressable, replaceable)
- **d-Tag**: Blob-URL als stabiler Identifier
- **Flattening**: Verschachtelte AMB-Objekte werden mit `:` als Delimiter geflacht
- **Concepts**: SKOS-Auswahlen als `<prop>:id`, `<prop>:prefLabel:de`, `<prop>:type` Tags
- **Creator**: Nostr-nativer `p`-Tag mit Pubkey + `creator`-Rolle

## Konfiguration

Vocabulary-URLs und Relay können im OER-Shares Tab unter "⚙️ Einstellungen" überschrieben werden. Die Konfiguration wird in `localStorage` unter `blossom:oer-shares:config` persistiert.

### Defaults

| Feld | Default |
|---|---|
| AMB Relay | `wss://relay-amb.edufeed.org` |
| Zielgruppe | LRMI Audience Roles (SkoHub) |
| Bildungsstufe | Educational Level (SkoHub) |
| Ressourcentyp | HCRT (SkoHub) |
| Fach/Thema | Schulfächer (SkoHub) |

## Limits & Annahmen

- Benötigt einen NIP-07 oder NIP-46 Signer (Login im Host-Widget)
- SKOS-Vocabularies werden bei Bedarf von SkoHub geladen und im Speicher gecacht
- Events werden nur an das konfigurierte AMB-Relay gesendet (default: Edufeed)
- UI-Sprache: Deutsch; SKOS-Labels werden als `prefLabel.de` geladen
