export interface TiptapInsertMediaEditor {
  chain: () => {
    focus: () => {
      insertContent: (content: string) => { run: () => boolean };
    };
  };
}

export function insertBlossomMedia(editor: TiptapInsertMediaEditor, url: string) {
  return editor.chain().focus().insertContent(url).run();
}
