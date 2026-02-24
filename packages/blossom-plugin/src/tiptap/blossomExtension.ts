import { Extension } from '@tiptap/core';

export interface BlossomMediaPayload {
  url: string;
  mimeType?: string;
}

export interface TiptapInsertMediaEditor {
  chain: () => {
    focus: () => {
      insertContent: (content: unknown) => { run: () => boolean };
    };
  };
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    blossom: {
      insertBlossomMedia: (payload: BlossomMediaPayload | string) => ReturnType;
    };
  }
}

function getInsertContent(payload: BlossomMediaPayload) {
  if (payload.mimeType?.startsWith('image/')) {
    return {
      type: 'image',
      attrs: {
        src: payload.url,
      },
    };
  }

  return payload.url;
}

export function insertBlossomMedia(editor: TiptapInsertMediaEditor, payload: BlossomMediaPayload | string) {
  const normalizedPayload: BlossomMediaPayload =
    typeof payload === 'string'
      ? {
          url: payload,
        }
      : payload;

  return editor.chain().focus().insertContent(getInsertContent(normalizedPayload)).run();
}

export async function uploadAndInsertBlossomMedia(
  editor: TiptapInsertMediaEditor,
  upload: () => Promise<BlossomMediaPayload | null>,
) {
  const payload = await upload();

  if (!payload?.url) {
    return false;
  }

  return insertBlossomMedia(editor, payload);
}

export const BlossomExtension = Extension.create({
  name: 'blossom',
  addCommands() {
    return {
      insertBlossomMedia:
        (payload) =>
        ({ editor }) =>
          insertBlossomMedia(editor as unknown as TiptapInsertMediaEditor, payload),
    };
  },
});
