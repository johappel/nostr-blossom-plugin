import type { NostrSignerLike } from './signers';

export async function publishEvent(
  signer: NostrSignerLike,
  relayUrl: string,
  content: string,
  tags: string[][],
) {
  if (!signer.signEvent) {
    throw new Error('Signer is not connected.');
  }

  if (!relayUrl) {
    throw new Error('Relay URL is required.');
  }

  const unsignedEvent = {
    kind: 1,
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
