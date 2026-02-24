# 02: TipTap Client (minimal)

```ts
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import {
  BlossomExtension,
  createBlossomBridge,
  uploadAndInsertBlossomMedia,
} from '@blossom/plugin';

const servers = ['https://blossom.primal.net/'];
const signer = await connectYourSigner();
const bridge = createBlossomBridge({ servers, signer });

const editor = new Editor({
  element: document.querySelector('#editor')!,
  extensions: [StarterKit, Image, BlossomExtension],
  content: '<p>Hello Blossom</p>',
});

async function onUploadIntoEditor() {
  await uploadAndInsertBlossomMedia(editor, async () => {
    const result = await bridge.selectAndUpload({ accept: 'image/*,application/pdf' });
    if (!result) return null;

    const mimeType = result.tags.find((t) => t[0] === 'm')?.[1];
    return { url: result.url, mimeType };
  });
}
```

```html
<button onclick="onUploadIntoEditor()">Upload into TipTap</button>
<div id="editor"></div>
```
