import { publishEvent } from '@blossom/plugin/plugin';
import type { BlossomSigner, PublishEventResult } from '@blossom/plugin/plugin';

/**
 * Publish a NIP-09 deletion event for an AMB share (kind:30142).
 */
export async function publishAmbShareDeletion(
  signer: BlossomSigner,
  eventId: string,
  relayUrl: string,
  reason = 'OER-Share gelöscht',
): Promise<PublishEventResult> {
  if (!eventId) {
    throw new Error('eventId is required.');
  }
  if (!relayUrl) {
    throw new Error('relayUrl is required.');
  }

  const tags: string[][] = [
    ['e', eventId],
    ['k', '30142'],
  ];

  return publishEvent(signer, [relayUrl], reason, tags, 5);
}
