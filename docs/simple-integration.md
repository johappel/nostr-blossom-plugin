# Simple Integration (Unknown Clients)

Dieses Dokument zeigt den minimalen Integrationsweg für Host-Apps, die wir nicht kennen.

Weitere ultra-reduzierte Client-Snippets: [examples/README.md](examples/README.md)

## Ziel

Mit nur zwei Inputs arbeiten:

- `servers: string[]`
- `signer: { getPublicKey, signEvent }`

Damit bleibt Upload unabhängig von Auth-Methode (z. B. NIP-07 oder NIP-46).

## 1) Bridge erstellen

```ts
import { createBlossomBridge } from '@blossom/plugin';

const bridge = createBlossomBridge({
  servers: ['https://blossom.primal.net/', 'https://blossom.band/'],
  signer,
});
```

## 2) Einfacher Upload per Datei-Dialog

```ts
const result = await bridge.selectAndUpload({
  accept: 'image/*,application/pdf',
});

if (result) {
  console.log(result.url); // Pflichtfeld aus NIP-94 tags
}
```

Rückgabe bei Erfolg:

- `url: string`
- `tags: [string, string, ...string[]][]`

Bei Abbruch: `null`.

## 3) In bestehendes Input einhängen (ohne Svelte-Action)

```ts
const input = document.querySelector('#upload-url') as HTMLInputElement;

const handle = bridge.attachToInput(input, {
  iconLabel: 'Upload with Blossom',
  buttonText: '↑',
  accept: 'image/*,application/pdf',
});

// optional cleanup:
handle.destroy();
```

Verhalten:

- Fügt einen Button direkt nach dem Input ein.
- Öffnet Dateiauswahl.
- Schreibt die hochgeladene URL in das Input.
- Triggert `input` + `change` Events.

## 4) Direkter Upload mit vorhandenem `File`

```ts
const file = new File(['demo'], 'demo.txt', { type: 'text/plain' });
const result = await bridge.uploadFile(file);
console.log(result.url);
```

## Fehlerfälle

- Wenn alle Blossom-Server fehlschlagen, wird ein Fehler geworfen (z. B. `AggregateError`).
- Wenn die Upload-Antwort kein `url`-Tag enthält, wird der Upload als ungültig abgelehnt.
- Fehlerbehandlung bleibt in der Host-App.

## Hinweise

- Für Upload-Targets nur HTTPS Blossom-Server verwenden, keine `wss://` Relays.
- Der `signer` darf intern NIP-07 oder NIP-46 verwenden; die Bridge ist auth-agnostisch.

## SignerAdapter in 60 Sekunden

Die Bridge braucht nur dieses Interface:

```ts
type SignerAdapter = {
  getPublicKey: () => Promise<string>;
  signEvent: (event: Record<string, unknown>) => Promise<Record<string, unknown>>;
};
```

### NIP-07 (Browser Extension)

```ts
const signer = {
  getPublicKey: () => window.nostr!.getPublicKey(),
  signEvent: (event: Record<string, unknown>) => window.nostr!.signEvent(event),
};

const bridge = createBlossomBridge({ servers, signer });
```

### NIP-46 (Bunker / Remote Signer)

```ts
const signer = await connectNip46Signer('bunker://...');
const bridge = createBlossomBridge({ servers, signer });
```

### Custom `nsec` Signer (nur wenn bewusst gewünscht)

```ts
import { finalizeEvent, getPublicKey } from 'nostr-tools/pure';
import { decode } from 'nostr-tools/nip19';

const decoded = decode(nsecInput);
if (decoded.type !== 'nsec') {
  throw new Error('Expected nsec');
}

const secretKey = decoded.data;

const signer = {
  getPublicKey: async () => getPublicKey(secretKey),
  signEvent: async (event: Record<string, unknown>) => finalizeEvent(event as never, secretKey) as never,
};

const bridge = createBlossomBridge({ servers, signer });
```

Sicherheit: `nsec` möglichst nicht persistent speichern, nur kurzzeitig im Speicher halten und nach Nutzung verwerfen.

Wichtig: Für die Bridge ist nur relevant, dass `getPublicKey` und `signEvent` funktionieren.
