# @blossom/tab-communikey

Community Media Tab-Plugin für das Blossom Media Widget. Implementiert das COMMUNIKEY-Protokoll (kind:10222, kind:30222, kind:30382).

## Features

- **Community Feed**: Zeigt Medien an, die über kind:30222 (Targeted Publication) mit einer Community geteilt wurden. Löst referenzierte kind:1063 (NIP-94) Events auf.
- **Mitgliedschaften**: Liest kind:30382 Events und zeigt abonnierte Communities im Dropdown-Selektor.
- **Community Info**: Parst kind:10222 Events — Name, Relays, Blossom-Server, Content-Sections.
- **Share to Community**: Share-Target in der Gallery-Sidebar ermöglicht das Teilen von Medien mit einer Community via kind:30222.

## Installation

```bash
pnpm add @blossom/tab-communikey
```

## Usage

```ts
import { communityTabPlugin } from '@blossom/tab-communikey';

BlossomMedia.init({
  servers: ['https://blossom.example.com'],
  relayUrls: ['wss://relay.example.com'],
  plugins: [communityTabPlugin],
});
```

Das Plugin registriert:
1. **Community Media Tab** (👥) — Community-Selektor mit Media-Grid und Detail-Sidebar.
2. **Share-Target** (📤 „An Community teilen") — erscheint im Gallery-Share-Popover.

## Nostr Event Kinds

| Kind | Typ | Beschreibung |
|------|-----|-------------|
| 10222 | Replaceable | Community-Definition (Name, Relays, Blossom, Sections) |
| 30222 | Addressable Replaceable | Targeted Publication (Share mit Community) |
| 30382 | Addressable Replaceable | Membership/Relationship (Community-Abo) |
| 1063 | Regular | NIP-94 File Metadata (aufgelöste Medien) |

## Nostr Helpers

Das Paket exportiert auch die einzelnen Parser und Fetch-Funktionen:

```ts
import {
  parseMembershipEvent,
  parseCommunityEvent,
  parseShareEvent,
  fetchMemberships,
  fetchCommunity,
  fetchCommunityMedia,
  publishCommunityShare,
} from '@blossom/tab-communikey';
```

## Peer Dependencies

- `@blossom/plugin` (workspace)
- `nostr-tools` >= 2.0
- `svelte` >= 5.0

## Limits / Annahmen

- MVP: Nur Single-Community-Share (kein Multi-Select).
- Community-Relays werden aus kind:10222 `r`-Tags gelesen.
- Membership-Cache pro Session (kein localStorage-Persist).
- Share-Events werden an Community-Relays publiziert, nicht an User-Relays.
