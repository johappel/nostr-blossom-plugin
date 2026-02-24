import { BlossomUploader } from '@nostrify/nostrify/uploaders';
import type { BlossomSigner, BlossomTag, BlossomUploadClientOptions, BlossomUploadResult } from './types';

export interface CreateBlossomUploadClientOptions extends BlossomUploadClientOptions {
  uploaderFactory?: (options: BlossomUploadClientOptions) => { upload: (file: File) => Promise<BlossomTag[]> };
}

export interface UploadExecutionOptions {
  signal?: AbortSignal;
}

function createAbortError() {
  return new DOMException('Upload aborted', 'AbortError');
}

function createTimeoutError(timeoutMs: number) {
  return new Error(`Upload timed out after ${timeoutMs}ms`);
}

export function createBlossomUploadClient(options: CreateBlossomUploadClientOptions) {
  const { uploaderFactory, ...config } = options;
  const normalizedSigner: BlossomSigner = {
    getPublicKey: () => config.signer.getPublicKey(),
    signEvent: (event) => config.signer.signEvent(event),
  };

  const uploader = uploaderFactory
    ? uploaderFactory(config)
    : new BlossomUploader({
        servers: config.servers,
        signer: normalizedSigner as never,
        expiresIn: config.expiresIn,
      });

  return {
    async upload(file: File, executionOptions?: UploadExecutionOptions): Promise<BlossomUploadResult> {
      if (executionOptions?.signal?.aborted) {
        throw createAbortError();
      }

      const uploadPromise = uploader.upload(file);
      const racers: Promise<unknown[]>[] = [uploadPromise as Promise<unknown[]>];

      if (typeof config.timeoutMs === 'number' && config.timeoutMs > 0) {
        racers.push(
          new Promise<unknown[]>((_, reject) => {
            setTimeout(() => reject(createTimeoutError(config.timeoutMs as number)), config.timeoutMs);
          }),
        );
      }

      if (executionOptions?.signal) {
        racers.push(
          new Promise<unknown[]>((_, reject) => {
            executionOptions.signal?.addEventListener('abort', () => reject(createAbortError()), { once: true });
          }),
        );
      }

      const rawTags = await Promise.race(racers);
      const tags: BlossomTag[] = [];
      for (const tag of rawTags) {
        if (Array.isArray(tag) && typeof tag[0] === 'string' && typeof tag[1] === 'string') {
          tags.push([tag[0], tag[1]]);
        }
      }
      const urlTag = tags.find((tag) => tag[0] === 'url');

      if (!urlTag?.[1]) {
        throw new Error('Missing required NIP-94 url tag from Blossom upload response');
      }

      return {
        tags,
        url: urlTag[1],
      };
    },
  };
}
