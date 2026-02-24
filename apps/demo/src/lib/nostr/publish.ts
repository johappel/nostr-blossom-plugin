import type { SignerAdapter } from './signers';

export interface ImageMetadataInput {
  description: string;
  author: string;
  license: string;
  keywords: string[];
  altAttribution: string;
}

export function buildImageMetadataTags(uploadTags: string[][], metadata: ImageMetadataInput): string[][] {
  const passthroughTags = uploadTags.filter((tag) => {
    const key = tag[0];
    return Boolean(key) && ['url', 'm', 'x', 'size', 'dim', 'blurhash'].includes(key);
  });

  const tags: string[][] = [...passthroughTags, ['summary', metadata.description], ['alt', metadata.altAttribution]];

  if (metadata.author.trim()) {
    tags.push(['author', metadata.author.trim()]);
  }

  if (metadata.license.trim()) {
    tags.push(['license', metadata.license.trim()]);
  }

  for (const keyword of metadata.keywords) {
    const normalizedKeyword = keyword.trim();
    if (normalizedKeyword) {
      tags.push(['t', normalizedKeyword]);
    }
  }

  return tags;
}

export function buildKind1FallbackTags(uploadTags: string[][], metadata: ImageMetadataInput): string[][] {
  const url = uploadTags.find((tag) => tag[0] === 'url')?.[1];
  const mime = uploadTags.find((tag) => tag[0] === 'm')?.[1];
  const tags: string[][] = [];

  if (url) {
    tags.push(['url', url]);
  }

  if (mime) {
    tags.push(['m', mime]);
  }

  tags.push(['summary', metadata.description], ['alt', metadata.altAttribution]);

  if (metadata.author.trim()) {
    tags.push(['author', metadata.author.trim()]);
  }

  if (metadata.license.trim()) {
    tags.push(['license', metadata.license.trim()]);
  }

  for (const keyword of metadata.keywords) {
    const normalizedKeyword = keyword.trim();
    if (normalizedKeyword) {
      tags.push(['t', normalizedKeyword]);
    }
  }

  return tags;
}

export async function publishEvent(
  signer: SignerAdapter,
  relayUrl: string,
  content: string,
  tags: string[][],
  kind = 1,
) {
  if (!relayUrl) {
    throw new Error('Relay URL is required.');
  }

  const unsignedEvent = {
    kind,
    created_at: Math.floor(Date.now() / 1000),
    tags,
    content,
  };

  const signedEvent = await signer.signEvent(unsignedEvent);

  return {
    relayUrl,
    event: signedEvent,
  };
}
