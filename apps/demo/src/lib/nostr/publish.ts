import type { SignerAdapter } from './signers';
import { Relay } from 'nostr-tools/relay';

export interface ImageMetadataInput {
  description: string;
  author: string;
  license: string;
  licenseLabel?: string;
  genre?: string;
  keywords: string[];
  altAttribution: string;
  aiImageMode?: 'generated' | 'assisted';
  aiMetadataGenerated?: boolean;
}

function buildLicenseTag(metadata: ImageMetadataInput): string[] | null {
  const canonical = metadata.license.trim();
  const label = metadata.licenseLabel?.trim() ?? '';

  if (!canonical && label) {
    throw new Error('License label requires a canonical license value.');
  }

  if (!canonical) {
    return null;
  }

  if (!label) {
    return ['license', canonical];
  }

  return ['license', canonical, label];
}

function buildAiHintTags(metadata: ImageMetadataInput): string[][] {
  const tags: string[][] = [];

  if (metadata.aiImageMode === 'generated') {
    tags.push(['hint', 'ai-image-generated']);
  }

  if (metadata.aiImageMode === 'assisted') {
    tags.push(['hint', 'ai-image-assisted']);
  }

  if (metadata.aiMetadataGenerated) {
    tags.push(['hint', 'ai-metadata-generated']);
  }

  return tags;
}

export function buildImageMetadataTags(uploadTags: string[][], metadata: ImageMetadataInput): string[][] {
  const passthroughTags = uploadTags.filter((tag) => {
    const key = tag[0];
    return Boolean(key) && ['url', 'm', 'x', 'size', 'dim', 'blurhash', 'thumb', 'image'].includes(key);
  });

  const tags: string[][] = [...passthroughTags, ['summary', metadata.description], ['alt', metadata.altAttribution]];

  if (metadata.author.trim()) {
    tags.push(['author', metadata.author.trim()]);
  }

  const licenseTag = buildLicenseTag(metadata);
  if (licenseTag) {
    tags.push(licenseTag);
  }

  if (metadata.genre?.trim()) {
    tags.push(['genre', metadata.genre.trim()]);
  }

  for (const keyword of metadata.keywords) {
    const normalizedKeyword = keyword.trim();
    if (normalizedKeyword) {
      tags.push(['t', normalizedKeyword]);
    }
  }

  tags.push(...buildAiHintTags(metadata));

  return tags;
}

export function buildKind1FallbackTags(uploadTags: string[][], metadata: ImageMetadataInput): string[][] {
  const url = uploadTags.find((tag) => tag[0] === 'url')?.[1];
  const mime = uploadTags.find((tag) => tag[0] === 'm')?.[1];
  const previewTags = uploadTags.filter((tag) => tag[0] === 'thumb' || tag[0] === 'image');
  const tags: string[][] = [];

  if (url) {
    tags.push(['url', url]);
  }

  if (mime) {
    tags.push(['m', mime]);
  }

  tags.push(...previewTags);

  tags.push(['summary', metadata.description], ['alt', metadata.altAttribution]);

  if (metadata.author.trim()) {
    tags.push(['author', metadata.author.trim()]);
  }

  const licenseTag = buildLicenseTag(metadata);
  if (licenseTag) {
    tags.push(licenseTag);
  }

  if (metadata.genre?.trim()) {
    tags.push(['genre', metadata.genre.trim()]);
  }

  for (const keyword of metadata.keywords) {
    const normalizedKeyword = keyword.trim();
    if (normalizedKeyword) {
      tags.push(['t', normalizedKeyword]);
    }
  }

  tags.push(...buildAiHintTags(metadata));

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

  // Deep-clone to strip Svelte 5 reactivity proxies — NIP-07 extensions
  // use structuredClone across the extension boundary which fails on proxies.
  const unsignedEvent = JSON.parse(JSON.stringify({
    kind,
    created_at: Math.floor(Date.now() / 1000),
    tags,
    content,
  }));

  const signedEvent = await signer.signEvent(unsignedEvent);

  // Actually publish to the relay
  let relay: InstanceType<typeof Relay> | null = null;
  try {
    relay = await Relay.connect(relayUrl);
    await relay.publish(signedEvent as never);
    console.log(`[publish] kind ${kind} event published to ${relayUrl}`, (signedEvent as Record<string, unknown>).id);
  } catch (err) {
    console.warn(`[publish] Failed to send kind ${kind} to ${relayUrl}:`, err);
    // Don't throw — the event is signed and can be retried. The caller
    // still gets the signed event back for local bookkeeping.
  } finally {
    relay?.close();
  }

  return {
    relayUrl,
    event: signedEvent,
  };
}
