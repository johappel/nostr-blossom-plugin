import { createBlossomUploadClient, type CreateBlossomUploadClientOptions, type UploadExecutionOptions } from './upload-client';
import type { BlossomUploadResult } from './types';

export interface BlossomBridge {
  uploadFile: (file: File, executionOptions?: UploadExecutionOptions) => Promise<BlossomUploadResult>;
  selectAndUpload: (
    selectOptions?: {
      accept?: string;
      multiple?: boolean;
    },
  ) => Promise<BlossomUploadResult | null>;
  attachToInput: (
    input: HTMLInputElement,
    options?: {
      iconLabel?: string;
      buttonText?: string;
      accept?: string;
    },
  ) => { destroy: () => void };
}

function pickSingleFile(options?: { accept?: string; multiple?: boolean }): Promise<File | null> {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = options?.accept ?? 'image/*,application/pdf';
  input.multiple = options?.multiple ?? false;

  return new Promise((resolve) => {
    input.addEventListener(
      'change',
      () => {
        resolve(input.files?.item(0) ?? null);
      },
      { once: true },
    );
    input.click();
  });
}

export function createBlossomBridge(options: CreateBlossomUploadClientOptions): BlossomBridge {
  const client = createBlossomUploadClient(options);

  async function uploadFile(file: File, executionOptions?: UploadExecutionOptions) {
    return client.upload(file, executionOptions);
  }

  async function selectAndUpload(selectOptions?: { accept?: string; multiple?: boolean }) {
    const file = await pickSingleFile(selectOptions);
    if (!file) {
      return null;
    }

    return uploadFile(file);
  }

  function attachToInput(
    input: HTMLInputElement,
    attachOptions?: {
      iconLabel?: string;
      buttonText?: string;
      accept?: string;
    },
  ) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = attachOptions?.buttonText ?? '↑';
    button.setAttribute('aria-label', attachOptions?.iconLabel ?? 'Upload with Blossom');

    const onClick = async () => {
      const result = await selectAndUpload({ accept: attachOptions?.accept });
      if (!result?.url) {
        return;
      }

      input.value = result.url;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    };

    button.addEventListener('click', onClick);
    input.insertAdjacentElement('afterend', button);

    return {
      destroy() {
        button.removeEventListener('click', onClick);
        button.remove();
      },
    };
  }

  return {
    uploadFile,
    selectAndUpload,
    attachToInput,
  };
}
