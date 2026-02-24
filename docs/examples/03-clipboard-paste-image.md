# 03: Clipboard Paste Blob → `<img src="blossom-uri">`

```ts
import { createBlossomBridge } from '@blossom/plugin';

const servers = ['https://blossom.primal.net/'];
const signer = await connectYourSigner();
const bridge = createBlossomBridge({ servers, signer });

const target = document.querySelector('#paste-target') as HTMLDivElement;

target.addEventListener('paste', async (event) => {
  const items = event.clipboardData?.items ?? [];
  const fileItem = Array.from(items).find((item) => item.kind === 'file');
  if (!fileItem) return;

  const file = fileItem.getAsFile();
  if (!file) return;

  event.preventDefault();

  const uploaded = await bridge.uploadFile(file);
  const img = document.createElement('img');
  img.src = uploaded.url;
  img.alt = file.name || 'pasted image';
  img.style.maxWidth = '100%';

  target.appendChild(img);
});
```

```html
<div id="paste-target" contenteditable="true">
  Füge hier ein Bild aus der Zwischenablage ein (Ctrl+V).
</div>
```

Hinweis: Für Text/HTML-Paste greift dieses Minimalbeispiel nicht ein.
