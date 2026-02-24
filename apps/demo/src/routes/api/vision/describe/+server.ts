import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import sharp from 'sharp';

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_VISION_MODEL = process.env.OPENROUTER_VISION_MODEL;
const OPENROUTER_TIMEOUT_MS = Number(process.env.OPENROUTER_TIMEOUT_MS ?? 15000);
const INLINE_IMAGE_TIMEOUT_MS = Number(process.env.OPENROUTER_IMAGE_FETCH_TIMEOUT_MS ?? 12000);
const INLINE_IMAGE_MAX_BYTES = Number(process.env.OPENROUTER_IMAGE_MAX_BYTES ?? 4_000_000);
const INLINE_IMAGE_MAX_DIM = Number(process.env.OPENROUTER_IMAGE_MAX_DIM ?? 1280);
const INLINE_IMAGE_QUALITY = Number(process.env.OPENROUTER_IMAGE_QUALITY ?? 78);
const INLINE_IMAGE_MIN_DIM = Number(process.env.OPENROUTER_IMAGE_MIN_DIM ?? 512);
const INLINE_IMAGE_MIN_QUALITY = Number(process.env.OPENROUTER_IMAGE_MIN_QUALITY ?? 40);
const OPENROUTER_VISION_INLINE_ONLY = process.env.OPENROUTER_VISION_INLINE_ONLY === 'true';

function fallbackDescriptionFromUrl(imageUrl: string) {
  try {
    const parsed = new URL(imageUrl);
    const fileName = parsed.pathname.split('/').filter(Boolean).at(-1) ?? '';
    const normalizedName = fileName.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
    if (/^[a-f0-9]{24,}$/i.test(normalizedName)) {
      return 'Uploaded image';
    }
    return normalizedName || 'Uploaded image';
  } catch {
    return 'Uploaded image';
  }
}

function parseResponseContent(rawContent: unknown, imageUrl: string) {
  const text =
    typeof rawContent === 'string'
      ? rawContent
      : Array.isArray(rawContent)
        ? rawContent
            .map((part) => {
              if (typeof part === 'string') {
                return part;
              }

              if (part && typeof part === 'object' && 'text' in part) {
                const maybeText = (part as { text?: unknown }).text;
                return typeof maybeText === 'string' ? maybeText : '';
              }

              return '';
            })
            .join('\n')
        : '';

  const normalizedText = text.trim();
  if (!normalizedText) {
    return {
      description: fallbackDescriptionFromUrl(imageUrl),
      tags: [] as string[],
    };
  }

  const withoutFence = normalizedText
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  try {
    const parsed = JSON.parse(withoutFence) as { description?: unknown; tags?: unknown };
    const description = typeof parsed.description === 'string' ? parsed.description.trim() : '';
    const tags = Array.isArray(parsed.tags)
      ? parsed.tags.map((tag) => String(tag).trim()).filter(Boolean)
      : [];

    if (description) {
      return {
        description,
        tags,
      };
    }
  } catch {
    // Fallback below
  }

  const plainDescription = withoutFence
    .replace(/^description\s*:\s*/i, '')
    .replace(/^beschreibung\s*:\s*/i, '')
    .trim();

  return {
    description: plainDescription.slice(0, 280) || fallbackDescriptionFromUrl(imageUrl),
    tags: [] as string[],
  };
}

async function toInlineImageDataUrl(imageUrl: string) {
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), INLINE_IMAGE_TIMEOUT_MS);

  try {
    const response = await fetch(imageUrl, {
      method: 'GET',
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Image download failed with status ${response.status}`);
    }

    const contentType = response.headers.get('content-type')?.split(';')[0]?.trim() || '';
    if (!contentType.startsWith('image/')) {
      throw new Error(`Unsupported content-type: ${contentType || 'unknown'}`);
    }

    const contentLength = Number(response.headers.get('content-length') ?? '0');
    if (contentLength > INLINE_IMAGE_MAX_BYTES) {
      throw new Error(`Image too large (${contentLength} bytes)`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const sourceBuffer = Buffer.from(arrayBuffer);
    const optimized = await optimizeImageForInlineUpload(sourceBuffer);
    const base64 = optimized.buffer.toString('base64');

    return {
      dataUrl: `data:${optimized.contentType};base64,${base64}`,
      optimizedBytes: optimized.buffer.byteLength,
      sourceBytes: sourceBuffer.byteLength,
      sourceContentType: contentType,
      optimizedContentType: optimized.contentType,
    };
  } finally {
    clearTimeout(timeoutHandle);
  }
}

function toProviderErrorDetails(payload: { error?: unknown } | null) {
  const error = payload?.error;

  if (typeof error === 'string') {
    return error;
  }

  if (error && typeof error === 'object') {
    const message = (error as { message?: unknown }).message;
    const code = (error as { code?: unknown }).code;

    const parts = [
      typeof message === 'string' ? message : undefined,
      typeof code === 'string' ? `code=${code}` : undefined,
    ].filter(Boolean) as string[];

    if (parts.length > 0) {
      return parts.join(' ');
    }

    try {
      return JSON.stringify(error);
    } catch {
      return 'Unknown provider error payload';
    }
  }

  return 'Unknown provider error';
}

async function optimizeImageForInlineUpload(inputBuffer: Buffer) {
  const metadata = await sharp(inputBuffer, { failOn: 'none' }).metadata();
  const hasAlpha = Boolean(metadata.hasAlpha);
  const minDimension = Math.max(256, INLINE_IMAGE_MIN_DIM);
  const startDimension = Math.max(minDimension, INLINE_IMAGE_MAX_DIM);
  const minQuality = Math.min(95, Math.max(30, INLINE_IMAGE_MIN_QUALITY));
  const startQuality = Math.min(95, Math.max(minQuality, INLINE_IMAGE_QUALITY));

  const encode = async (quality: number, dimension: number) => {
    const transformed = sharp(inputBuffer, { failOn: 'none' })
      .rotate()
      .resize({
        width: dimension,
        height: dimension,
        fit: 'inside',
        withoutEnlargement: true,
      });

    if (hasAlpha) {
      const buffer = await transformed.webp({ quality }).toBuffer();
      return {
        buffer,
        contentType: 'image/webp',
      } as const;
    }

    const buffer = await transformed.jpeg({ quality, mozjpeg: true }).toBuffer();
    return {
      buffer,
      contentType: 'image/jpeg',
    } as const;
  };

  let dimension = startDimension;
  let quality = startQuality;
  let encoded = await encode(quality, dimension);

  while (encoded.buffer.byteLength > INLINE_IMAGE_MAX_BYTES) {
    if (quality > minQuality) {
      quality = Math.max(minQuality, quality - 8);
      encoded = await encode(quality, dimension);
      continue;
    }

    if (dimension > minDimension) {
      dimension = Math.max(minDimension, Math.floor(dimension * 0.8));
      quality = startQuality;
      encoded = await encode(quality, dimension);
      continue;
    }

    break;
  }

  if (encoded.buffer.byteLength > INLINE_IMAGE_MAX_BYTES) {
    throw new Error(`Image too large after resize/compression (${encoded.buffer.byteLength} bytes)`);
  }

  return encoded;
}

export const POST: RequestHandler = async ({ request }) => {
  const body = (await request.json().catch(() => null)) as { imageUrl?: string } | null;
  const imageUrl = body?.imageUrl?.trim();

  if (!imageUrl || !/^https?:\/\//i.test(imageUrl)) {
    return json({ error: 'Valid imageUrl is required' }, { status: 400 });
  }

  if (!OPENROUTER_API_KEY) {
    return json(
      {
        description: fallbackDescriptionFromUrl(imageUrl),
        tags: [],
        inputMode: 'none',
        warning: 'OPENROUTER_API_KEY is not configured. Returning fallback description.',
      },
      { status: 200 },
    );
  }

  let imageSourceForModel = imageUrl;
  let imageSourceWarning: string | undefined;
  let inputMode: 'inline' | 'remote-url' | 'inline-then-remote-url' = 'remote-url';
  let imageProcessing:
    | {
        sourceBytes: number;
        optimizedBytes: number;
        sourceContentType: string;
        optimizedContentType: string;
      }
    | undefined;
  const visionModel = OPENROUTER_VISION_MODEL || 'sourceful/riverflow-v2-fast';

  try {
    const inline = await toInlineImageDataUrl(imageUrl);
    imageSourceForModel = inline.dataUrl;
    imageProcessing = {
      sourceBytes: inline.sourceBytes,
      optimizedBytes: inline.optimizedBytes,
      sourceContentType: inline.sourceContentType,
      optimizedContentType: inline.optimizedContentType,
    };
    inputMode = 'inline';
  } catch (error) {
    if (OPENROUTER_VISION_INLINE_ONLY) {
      return json(
        {
          description: fallbackDescriptionFromUrl(imageUrl),
          tags: [],
          inputMode: 'remote-url',
          ...(imageProcessing ? { imageProcessing } : {}),
          warning:
            error instanceof Error
              ? `Inline image conversion failed: ${error.message}. OPENROUTER_VISION_INLINE_ONLY=true prevents remote URL fallback.`
              : 'Inline image conversion failed. OPENROUTER_VISION_INLINE_ONLY=true prevents remote URL fallback.',
        },
        { status: 200 },
      );
    }

    imageSourceWarning =
      error instanceof Error
        ? `Inline image conversion failed: ${error.message}. Falling back to remote URL.`
        : 'Inline image conversion failed. Falling back to remote URL.';
  }

  let upstream: Response;

  const requestVision = async (imageSource: string) => {
    const fetchPromise = fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: visionModel,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text:
                  'Analyze this image and return JSON only with keys description (max 140 chars) and tags (array of up to 6 short lowercase keywords).',
              },
              {
                type: 'image_url',
                image_url: {
                  url: imageSource,
                },
              },
            ],
          },
        ],
      }),
    });

    return await Promise.race([
      fetchPromise,
      new Promise<Response>((_, reject) => {
        setTimeout(() => reject(new Error(`Vision provider timeout after ${OPENROUTER_TIMEOUT_MS}ms`)), OPENROUTER_TIMEOUT_MS);
      }),
    ]);
  };

  try {
    upstream = await requestVision(imageSourceForModel);

    if (upstream.status === 413 && imageSourceForModel.startsWith('data:image/')) {
      if (OPENROUTER_VISION_INLINE_ONLY) {
        return json(
          {
            description: fallbackDescriptionFromUrl(imageUrl),
            tags: [],
            inputMode: 'inline',
            ...(imageProcessing ? { imageProcessing } : {}),
            warning:
              'Vision provider rejected inline image payload with 413. OPENROUTER_VISION_INLINE_ONLY=true prevents remote URL fallback.',
          },
          { status: 200 },
        );
      }

      inputMode = 'inline-then-remote-url';
      imageSourceWarning = [
        imageSourceWarning,
        'Inline image payload too large for provider. Retrying with remote URL.',
      ]
        .filter(Boolean)
        .join(' ');

      upstream = await requestVision(imageUrl);
    }
  } catch (error) {
    return json(
      {
        description: fallbackDescriptionFromUrl(imageUrl),
        tags: [],
        inputMode,
        ...(imageProcessing ? { imageProcessing } : {}),
        warning: [
          imageSourceWarning,
          error instanceof Error ? error.message : 'Vision provider request failed',
        ]
          .filter(Boolean)
          .join(' '),
      },
      { status: 200 },
    );
  }

  const upstreamPayload = (await upstream.json().catch(() => null)) as
    | {
        choices?: Array<{
          message?: {
            content?: unknown;
          };
        }>;
        error?: {
          message?: string;
        };
      }
    | null;

  if (!upstream.ok) {
    const providerDetails = toProviderErrorDetails(upstreamPayload);

    return json(
      {
        description: fallbackDescriptionFromUrl(imageUrl),
        tags: [],
        inputMode,
        ...(imageProcessing ? { imageProcessing } : {}),
        warning: [
          imageSourceWarning,
          `Vision provider request failed (status ${upstream.status}, model ${visionModel})`,
          providerDetails,
        ]
          .filter(Boolean)
          .join(' '),
      },
      { status: 200 },
    );
  }

  const modelContent = upstreamPayload?.choices?.[0]?.message?.content;
  const parsed = parseResponseContent(modelContent, imageUrl);

  return json({
    ...parsed,
    inputMode,
    ...(imageProcessing ? { imageProcessing } : {}),
    ...(imageSourceWarning ? { warning: imageSourceWarning } : {}),
  });
};
