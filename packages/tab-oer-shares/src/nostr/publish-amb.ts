/**
 * Publish AMB Events
 *
 * Signs and publishes kind:30142 AMB metadata events to the Edufeed relay.
 */

import { publishEvent } from '@blossom/plugin/plugin';
import type { BlossomSigner, PublishEventResult } from '@blossom/plugin/plugin';
import type { AmbFormData } from './types';
import { buildAmbEventTags } from './amb-tags';
import { DEFAULT_AMB_RELAY } from '../config';

/**
 * Publish an AMB kind:30142 event to the Edufeed relay.
 *
 * The event is addressable/replaceable — sharing the same file again
 * (same `d` tag = encoding URL) updates the existing event.
 *
 * @param signer     - Nostr signer for signing the event
 * @param formData   - Validated AMB form data
 * @param relayUrl   - Override relay URL (default: wss://amb-relay.edufeed.org)
 * @param dTag       - Override d-tag (for editing existing events)
 * @returns          Publish result with per-relay status
 */
export async function publishAmbEvent(
  signer: BlossomSigner,
  formData: AmbFormData,
  relayUrl: string = DEFAULT_AMB_RELAY,
  dTag?: string,
): Promise<PublishEventResult> {
  const tags = buildAmbEventTags(formData, relayUrl, dTag);
  const content = formData.content?.trim() || formData.description;

  return publishEvent(signer, [relayUrl], content, tags, 30142);
}
