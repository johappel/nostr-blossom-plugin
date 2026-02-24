import { describe, expect, it, vi } from 'vitest';
import { insertBlossomMedia, uploadAndInsertBlossomMedia } from './blossomExtension';

function createEditorMock() {
  const run = vi.fn(() => true);
  const insertContent = vi.fn(() => ({ run }));
  const focus = vi.fn(() => ({ insertContent }));
  const chain = vi.fn(() => ({ focus }));

  return {
    editor: {
      chain,
    },
    spies: {
      chain,
      focus,
      insertContent,
      run,
    },
  };
}

describe('blossomExtension helpers', () => {
  it('inserts plain url content', () => {
    const { editor, spies } = createEditorMock();

    const result = insertBlossomMedia(editor, 'https://cdn.example/file.pdf');

    expect(result).toBe(true);
    expect(spies.insertContent).toHaveBeenCalledWith('https://cdn.example/file.pdf');
  });

  it('inserts image node when mime type is image', () => {
    const { editor, spies } = createEditorMock();

    const result = insertBlossomMedia(editor, {
      url: 'https://cdn.example/image.png',
      mimeType: 'image/png',
    });

    expect(result).toBe(true);
    expect(spies.insertContent).toHaveBeenCalledWith({
      type: 'image',
      attrs: {
        src: 'https://cdn.example/image.png',
      },
    });
  });

  it('returns false if upload is cancelled', async () => {
    const { editor, spies } = createEditorMock();

    const result = await uploadAndInsertBlossomMedia(editor, async () => null);

    expect(result).toBe(false);
    expect(spies.insertContent).not.toHaveBeenCalled();
  });
});
