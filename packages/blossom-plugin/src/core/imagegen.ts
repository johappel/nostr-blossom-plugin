/**
 * Image generation client.
 *
 * Sends a text prompt to a configurable image-generation endpoint and returns
 * a base64 data URL of the generated image.
 *
 * The endpoint is expected to implement the same contract as
 * `apps/image-describer`'s `/image-gen` route: POST with `{ prompt }`,
 * returns `{ image }` (data URL).
 *
 * This module is framework-agnostic and browser / Node compatible.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Response from the image-generation endpoint.
 */
export interface ImageGenResult {
  /** Base64 data URL of the generated image (e.g. `data:image/png;base64,…`) */
  image: string;
}

export interface ImageGenClientOptions {
  /**
   * Base URL of the image-generation service.
   *
   * Accepted formats (all normalised internally):
   * - `https://my-host.example`
   * - `https://my-host.example/`
   * - `https://my-host.example/image-gen`
   */
  endpoint: string;

  /** Request timeout in milliseconds. Defaults to 90 000 (90 s). */
  timeoutMs?: number;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Normalise a user-supplied endpoint string to the canonical image-gen URL.
 * Accepts bare host URLs and appends `/image-gen` if needed.
 */
export function resolveImageGenEndpoint(raw: string): string {
  const normalized = raw.trim().replace(/\/$/, '');
  if (!normalized) {
    throw new Error('Image generation endpoint URL is required.');
  }

  if (/\/image-gen$/i.test(normalized)) {
    return normalized;
  }

  // If the URL ends with /describe (vision endpoint shared URL), replace it
  if (/\/describe$/i.test(normalized)) {
    return normalized.replace(/\/describe$/i, '/image-gen');
  }

  return `${normalized}/image-gen`;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Request image generation for the given text prompt.
 *
 * @param prompt  - Text description of the image to generate
 * @param options - Image gen client options (endpoint URL, timeout)
 * @param signal  - Optional AbortSignal for cancellation
 *
 * @throws When the endpoint returns a non-ok response or a network error.
 */
export async function fetchImageGeneration(
  prompt: string,
  options: ImageGenClientOptions,
  signal?: AbortSignal,
): Promise<ImageGenResult> {
  const endpoint = resolveImageGenEndpoint(options.endpoint);
  const timeoutMs = options.timeoutMs ?? 90_000;

  const controller = new AbortController();
  const chainedSignal = signal
    ? AbortSignal.any([signal, controller.signal])
    : controller.signal;

  const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt }),
      signal: chainedSignal,
    });

    const payload = (await response.json()) as ImageGenResult & { error?: string };

    if (!response.ok) {
      throw new Error(payload.error ?? `Image generation failed (HTTP ${response.status})`);
    }

    if (!payload.image) {
      throw new Error('Image generation returned empty result');
    }

    return { image: payload.image };
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError' && !signal?.aborted) {
      throw new Error(`Image generation timed out after ${timeoutMs}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timeoutHandle);
  }
}
