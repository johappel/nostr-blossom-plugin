/**
 * Fetch AMB Shares
 *
 * Connects to the AMB relay and retrieves kind:30142 events for a user,
 * parsing them back into `AmbShareItem` objects with prefLabels.
 */

import { Relay } from 'nostr-tools/relay';
import type { AmbShareItem, SkosSelection } from './types';
import { DEFAULT_AMB_RELAY } from '../config';

/**
 * Extract all values for a given tag key from a tags array.
 */
function getTagValues(tags: string[][], key: string): string[] {
  return tags.filter((t) => t[0] === key).map((t) => t[1]);
}

/**
 * Extract the first value for a tag key, or undefined.
 */
function getTagValue(tags: string[][], key: string): string | undefined {
  const tag = tags.find((t) => t[0] === key);
  return tag?.[1];
}

/**
 * Extract SKOS concept selections from flattened tags.
 *
 * Looks for `<prop>:id` and `<prop>:prefLabel:de` tag pairs.
 * Since AMB repeats the same tag keys for multiple concepts, we zip
 * them by position (tag order is preserved per spec).
 */
function extractConcepts(tags: string[][], propName: string): SkosSelection[] {
  const ids = getTagValues(tags, `${propName}:id`);
  const labels = getTagValues(tags, `${propName}:prefLabel:de`);

  const concepts: SkosSelection[] = [];
  for (let i = 0; i < ids.length; i++) {
    concepts.push({
      id: ids[i],
      prefLabel: labels[i] ?? ids[i], // Fallback to id if label missing
    });
  }
  return concepts;
}

/**
 * Parse a raw kind:30142 Nostr event into an `AmbShareItem`.
 */
function parseAmbEvent(event: Record<string, unknown>): AmbShareItem | null {
  const tags = event.tags as string[][] | undefined;
  if (!tags || !Array.isArray(tags)) return null;

  const dTag = getTagValue(tags, 'd');
  if (!dTag) return null;

  return {
    eventId: event.id as string,
    dTag,
    createdAt: event.created_at as number,
    pubkey: event.pubkey as string,

    name: getTagValue(tags, 'name') ?? '',
    description: getTagValue(tags, 'description') ?? (event.content as string) ?? '',
    keywords: getTagValues(tags, 't'),

    audience: extractConcepts(tags, 'audience'),
    educationalLevel: extractConcepts(tags, 'educationalLevel'),
    learningResourceType: extractConcepts(tags, 'learningResourceType'),
    about: extractConcepts(tags, 'about'),

    licenseId: getTagValue(tags, 'license:id'),
    creatorName: getTagValue(tags, 'creator:name'),
    inLanguage: getTagValue(tags, 'inLanguage'),
    isAccessibleForFree: getTagValue(tags, 'isAccessibleForFree') === 'true',

    encodingUrl: getTagValue(tags, 'encoding:contentUrl'),
    imageUrl: getTagValue(tags, 'image'),
  };
}

/**
 * Fetch all AMB kind:30142 events for a given pubkey from the relay.
 *
 * @param pubkey    - Hex pubkey of the user
 * @param relayUrl  - AMB relay URL (default: wss://amb-relay.edufeed.org)
 * @param timeoutMs - Connection/query timeout in ms (default: 10000)
 * @returns         Parsed AMB share items, newest first
 */
export async function fetchUserAmbShares(
  pubkey: string,
  relayUrl: string = DEFAULT_AMB_RELAY,
  timeoutMs = 10000,
): Promise<AmbShareItem[]> {
  let relay: InstanceType<typeof Relay> | null = null;

  try {
    relay = await Relay.connect(relayUrl);

    const events = await new Promise<Record<string, unknown>[]>(
      (resolve, reject) => {
        const collected: Record<string, unknown>[] = [];
        const timer = setTimeout(() => {
          resolve(collected); // Return whatever we have
        }, timeoutMs);

        const sub = relay!.subscribe(
          [{ kinds: [30142], authors: [pubkey] }],
          {
            onevent(event: Record<string, unknown>) {
              collected.push(event);
            },
            oneose() {
              clearTimeout(timer);
              resolve(collected);
            },
            onclose(reason: string) {
              clearTimeout(timer);
              if (collected.length > 0) {
                resolve(collected);
              } else {
                reject(new Error(`Relay subscription closed: ${reason}`));
              }
            },
          },
        );

        // Safety: unsubscribe after timeout
        setTimeout(() => {
          try { sub.close(); } catch { /* ignore */ }
        }, timeoutMs + 500);
      },
    );

    const items = events
      .map(parseAmbEvent)
      .filter((item): item is AmbShareItem => item !== null)
      .sort((a, b) => b.createdAt - a.createdAt); // Newest first

    return items;
  } finally {
    try { relay?.close(); } catch { /* ignore */ }
  }
}
