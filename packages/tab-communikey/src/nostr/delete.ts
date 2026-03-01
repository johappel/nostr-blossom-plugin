import { publishEvent } from '@blossom/plugin/plugin';
import type { BlossomSigner, PublishEventResult } from '@blossom/plugin/plugin';

/**
 * Publish a NIP-09 deletion event for a community share (kind:30222).
 */
export async function publishCommunityShareDeletion(
  signer: BlossomSigner,
  shareEventId: string,
  relayUrls: string[],
  reason = 'Community share gelöscht',
): Promise<PublishEventResult> {
  if (!shareEventId) {
    throw new Error('shareEventId is required.');
  }
  if (!relayUrls.length) {
    throw new Error('At least one relay URL is required.');
  }

  const tags: string[][] = [
    ['e', shareEventId],
    ['k', '30222'],
  ];

  return publishEvent(signer, relayUrls, reason, tags, 5);
}
