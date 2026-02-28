/**
 * Vision / AI description client.
 *
 * Sends a file URL to a configurable image-describer endpoint and returns
 * AI-suggested metadata (description, alt text, genre, keywords).
 *
 * The endpoint is expected to implement the same contract as
 * `apps/image-describer`: POST with `{ imageUrl }`, returns
 * `{ description?, alt?, genre?, tags? }`.
 *
 * This module is framework-agnostic and browser / Node compatible.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Response from the image-describer vision endpoint.
 * All fields are optional — the caller should guard each individually.
 */
export interface VisionSuggestResult {
  /** Long-form image description */
  description?: string;
  /** Short alt text */
  alt?: string;
  /** Visual genre / style hint */
  genre?: string;
  /** Suggested keyword tags */
  tags?: string[];
}

export interface VisionClientOptions {
  /**
   * Base URL of the image-describer service.
   *
   * Accepted formats (all normalised internally):
   * - `https://my-host.example`
   * - `https://my-host.example/`
   * - `https://my-host.example/describe`
   * - `https://my-host.example/api/vision/describe`
   */
  endpoint: string;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Normalise a user-supplied endpoint string to the canonical describe URL.
 * Accepts bare host URLs and appends `/describe` if needed.
 */
export function resolveVisionEndpoint(raw: string): string {
  const normalized = raw.trim().replace(/\/$/, '');
  if (!normalized) {
    throw new Error('Vision endpoint URL is required.');
  }

  if (/\/describe$/i.test(normalized) || /\/api\/vision\/describe$/i.test(normalized)) {
    return normalized;
  }

  return `${normalized}/describe`;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Request an AI description for the given image / file URL.
 *
 * @param imageUrl - Publicly accessible URL of the image or PDF to describe
 * @param options  - Vision client options (endpoint URL)
 * @param signal   - Optional AbortSignal for cancellation
 *
 * @throws When the endpoint returns a non-ok response or a network error.
 */
export async function fetchVisionSuggestion(
  imageUrl: string,
  options: VisionClientOptions,
  signal?: AbortSignal,
): Promise<VisionSuggestResult> {
  const endpoint = resolveVisionEndpoint(options.endpoint);

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageUrl }),
      signal,
    });
  } catch (err) {
    // Network error — Docker / AI service likely not running
    if (err instanceof TypeError && /NetworkError|fetch|Failed to fetch|ECONNREFUSED/i.test((err as Error).message)) {
      throw new Error('KI-Service nicht erreichbar. Prüfe, ob die Docker-Instanz läuft.');
    }
    throw err;
  }

  const payload = (await response.json()) as VisionSuggestResult & { error?: string };

  if (!response.ok) {
    throw new Error(payload.error ?? `Vision request failed (HTTP ${response.status})`);
  }

  return {
    description: payload.description?.trim() || undefined,
    alt: payload.alt?.trim() || undefined,
    genre: payload.genre?.trim() || undefined,
    tags: payload.tags?.length ? payload.tags : undefined,
  };
}
