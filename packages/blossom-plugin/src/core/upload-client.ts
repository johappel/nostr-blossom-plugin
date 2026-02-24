import { BlossomUploader } from '@nostrify/nostrify/uploaders';
import type { BlossomTag, BlossomUploadClientOptions, BlossomUploadResult } from './types';

export interface CreateBlossomUploadClientOptions extends BlossomUploadClientOptions {
  uploaderFactory?: (options: BlossomUploadClientOptions) => { upload: (file: File) => Promise<BlossomTag[]> };
}

export function createBlossomUploadClient(options: CreateBlossomUploadClientOptions) {
  const { uploaderFactory, ...config } = options;

  const uploader = uploaderFactory
    ? uploaderFactory(config)
    : new BlossomUploader({
        servers: config.servers,
        signer: config.signer as never,
        expiresIn: config.expiresIn,
      });

  return {
    async upload(file: File): Promise<BlossomUploadResult> {
      const rawTags = await uploader.upload(file);
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
