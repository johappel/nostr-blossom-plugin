# Minimal Examples

Stark reduzierte Client-Beispiele mit `createBlossomBridge`.

- [01-url-input-client.md](01-url-input-client.md): URL-Input + Upload-Button
- [02-tiptap-client.md](02-tiptap-client.md): TipTap + Blossom Upload
- [03-clipboard-paste-image.md](03-clipboard-paste-image.md): Paste von Blob aus Zwischenablage → `<img src="blossom-uri">`

Alle Beispiele erwarten:

- `servers: string[]` mit Blossom HTTPS-Endpunkten
- `signer` mit `getPublicKey()` und `signEvent()`
