# Simple Integration (Unknown Clients)

Dieses Dokument zeigt den minimalen Integrationsweg für Host-Apps, die wir nicht kennen.

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
- `tags: [string, string][]`

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
