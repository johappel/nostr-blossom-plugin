import Fastify from 'fastify';
import cors from '@fastify/cors';
import sharp from 'sharp';

type DescribeRequestBody = {
  imageUrl?: string;
};

const ALT_MAX_LENGTH = 140;

function normalizeAltText(value: string) {
  return value
    .replace(/[\u0000-\u001F\u007F]+/g, ' ')
    .replace(/[<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, ALT_MAX_LENGTH);
}

function readRuntimeConfig() {
  return {
    port: Number(process.env.PORT ?? 8787),
    openRouterApiKey: process.env.OPENROUTER_API_KEY,
    visionModel: process.env.OPENROUTER_VISION_MODEL || 'qwen/qwen3-vl-8b-instruct',
    visionResponseLanguage: process.env.OPENROUTER_RESPONSE_LANGUAGE || 'German',
    openRouterTimeoutMs: Number(process.env.OPENROUTER_TIMEOUT_MS ?? 15000),
    inlineImageTimeoutMs: Number(process.env.OPENROUTER_IMAGE_FETCH_TIMEOUT_MS ?? 12000),
    inlineImageMaxBytes: Number(process.env.OPENROUTER_IMAGE_MAX_BYTES ?? 4_000_000),
    inlineImageMaxDim: Number(process.env.OPENROUTER_IMAGE_MAX_DIM ?? 1280),
    inlineImageQuality: Number(process.env.OPENROUTER_IMAGE_QUALITY ?? 78),
    inlineImageMinDim: Number(process.env.OPENROUTER_IMAGE_MIN_DIM ?? 512),
    inlineImageMinQuality: Number(process.env.OPENROUTER_IMAGE_MIN_QUALITY ?? 40),
    inlineOnly: process.env.OPENROUTER_VISION_INLINE_ONLY === 'true',
  };
}

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
    const fallback = fallbackDescriptionFromUrl(imageUrl);
    return {
      description: fallback,
      alt: normalizeAltText(fallback),
      genre: '',
      tags: [] as string[],
    };
  }

  const withoutFence = normalizedText
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  try {
    const parsed = JSON.parse(withoutFence) as {
      description?: unknown;
      alt?: unknown;
      altText?: unknown;
      genre?: unknown;
      tags?: unknown;
    };
    const description = typeof parsed.description === 'string' ? parsed.description.trim() : '';
    const altCandidate =
      typeof parsed.alt === 'string'
        ? parsed.alt.trim()
        : typeof parsed.altText === 'string'
          ? parsed.altText.trim()
          : '';
    const tags = Array.isArray(parsed.tags)
      ? parsed.tags.map((tag) => String(tag).trim()).filter(Boolean)
      : [];
    const genre = typeof parsed.genre === 'string' ? parsed.genre.trim().slice(0, 80) : '';

    if (description) {
      const normalizedDescription = description.slice(0, 280);
      return {
        description: normalizedDescription,
        alt: normalizeAltText(altCandidate || normalizedDescription),
        genre,
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

  const fallback = plainDescription.slice(0, 280) || fallbackDescriptionFromUrl(imageUrl);
  return {
    description: fallback,
    alt: normalizeAltText(fallback),
    genre: '',
    tags: [] as string[],
  };
}

async function optimizeImageForInlineUpload(
  inputBuffer: Buffer,
  options: {
    inlineImageMaxBytes: number;
    inlineImageMaxDim: number;
    inlineImageQuality: number;
    inlineImageMinDim: number;
    inlineImageMinQuality: number;
  },
) {
  const metadata = await sharp(inputBuffer, { failOn: 'none' }).metadata();
  const hasAlpha = Boolean(metadata.hasAlpha);
  const minDimension = Math.max(256, options.inlineImageMinDim);
  const startDimension = Math.max(minDimension, options.inlineImageMaxDim);
  const minQuality = Math.min(95, Math.max(30, options.inlineImageMinQuality));
  const startQuality = Math.min(95, Math.max(minQuality, options.inlineImageQuality));

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

  while (encoded.buffer.byteLength > options.inlineImageMaxBytes) {
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

  if (encoded.buffer.byteLength > options.inlineImageMaxBytes) {
    throw new Error(`Image too large after resize/compression (${encoded.buffer.byteLength} bytes)`);
  }

  return encoded;
}

async function toInlineImageDataUrl(
  imageUrl: string,
  options: {
    inlineImageTimeoutMs: number;
    inlineImageMaxBytes: number;
    inlineImageMaxDim: number;
    inlineImageQuality: number;
    inlineImageMinDim: number;
    inlineImageMinQuality: number;
  },
) {
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), options.inlineImageTimeoutMs);

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
    if (contentLength > options.inlineImageMaxBytes) {
      throw new Error(`Image too large (${contentLength} bytes)`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const sourceBuffer = Buffer.from(arrayBuffer);
    const optimized = await optimizeImageForInlineUpload(sourceBuffer, {
      inlineImageMaxBytes: options.inlineImageMaxBytes,
      inlineImageMaxDim: options.inlineImageMaxDim,
      inlineImageQuality: options.inlineImageQuality,
      inlineImageMinDim: options.inlineImageMinDim,
      inlineImageMinQuality: options.inlineImageMinQuality,
    });
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

const app = Fastify({ logger: true });

await app.register(cors, {
  origin: true,
});

app.get('/health', async () => {
  return { ok: true };
});

app.post<{ Body: DescribeRequestBody }>('/describe', async (request, reply) => {
  const config = readRuntimeConfig();
  const imageUrl = request.body?.imageUrl?.trim();

  if (!imageUrl || !/^https?:\/\//i.test(imageUrl)) {
    return reply.status(400).send({ error: 'Valid imageUrl is required' });
  }

  if (!config.openRouterApiKey) {
    const fallback = fallbackDescriptionFromUrl(imageUrl);
    return reply.send({
      description: fallback,
      alt: normalizeAltText(fallback),
      genre: '',
      tags: [],
      inputMode: 'none',
      warning: 'OPENROUTER_API_KEY is not configured. Returning fallback description.',
    });
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
  const visionModel = config.visionModel;

  try {
    const inline = await toInlineImageDataUrl(imageUrl, {
      inlineImageTimeoutMs: config.inlineImageTimeoutMs,
      inlineImageMaxBytes: config.inlineImageMaxBytes,
      inlineImageMaxDim: config.inlineImageMaxDim,
      inlineImageQuality: config.inlineImageQuality,
      inlineImageMinDim: config.inlineImageMinDim,
      inlineImageMinQuality: config.inlineImageMinQuality,
    });
    imageSourceForModel = inline.dataUrl;
    imageProcessing = {
      sourceBytes: inline.sourceBytes,
      optimizedBytes: inline.optimizedBytes,
      sourceContentType: inline.sourceContentType,
      optimizedContentType: inline.optimizedContentType,
    };
    inputMode = 'inline';
  } catch (error) {
    if (config.inlineOnly) {
      const fallback = fallbackDescriptionFromUrl(imageUrl);
      return reply.send({
        description: fallback,
        alt: normalizeAltText(fallback),
        genre: '',
        tags: [],
        inputMode: 'remote-url',
        ...(imageProcessing ? { imageProcessing } : {}),
        warning:
          error instanceof Error
            ? `Inline image conversion failed: ${error.message}. OPENROUTER_VISION_INLINE_ONLY=true prevents remote URL fallback.`
            : 'Inline image conversion failed. OPENROUTER_VISION_INLINE_ONLY=true prevents remote URL fallback.',
      });
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
        Authorization: `Bearer ${config.openRouterApiKey}`,
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
                text: `Analyze this image and return JSON only with keys description (max 140 chars), alt (max 140 chars, suitable for an HTML img alt attribute), genre (one short style/category label like comic, photorealistic, watercolor), and tags (array of up to 6 short lowercase keywords). The values for description, alt and genre must be written in ${config.visionResponseLanguage}.`,
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
        setTimeout(
          () => reject(new Error(`Vision provider timeout after ${config.openRouterTimeoutMs}ms`)),
          config.openRouterTimeoutMs,
        );
      }),
    ]);
  };

  try {
    upstream = await requestVision(imageSourceForModel);

    if (upstream.status === 413 && imageSourceForModel.startsWith('data:image/')) {
      if (config.inlineOnly) {
        const fallback = fallbackDescriptionFromUrl(imageUrl);
        return reply.send({
          description: fallback,
          alt: normalizeAltText(fallback),
          genre: '',
          tags: [],
          inputMode: 'inline',
          ...(imageProcessing ? { imageProcessing } : {}),
          warning:
            'Vision provider rejected inline image payload with 413. OPENROUTER_VISION_INLINE_ONLY=true prevents remote URL fallback.',
        });
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
    const fallback = fallbackDescriptionFromUrl(imageUrl);
    return reply.send({
      description: fallback,
      alt: normalizeAltText(fallback),
      genre: '',
      tags: [],
      inputMode,
      ...(imageProcessing ? { imageProcessing } : {}),
      warning: [
        imageSourceWarning,
        error instanceof Error ? error.message : 'Vision provider request failed',
      ]
        .filter(Boolean)
        .join(' '),
    });
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
    const fallback = fallbackDescriptionFromUrl(imageUrl);

    return reply.send({
      description: fallback,
      alt: normalizeAltText(fallback),
      genre: '',
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
    });
  }

  const modelContent = upstreamPayload?.choices?.[0]?.message?.content;
  const parsed = parseResponseContent(modelContent, imageUrl);

  return reply.send({
    ...parsed,
    inputMode,
    ...(imageProcessing ? { imageProcessing } : {}),
    ...(imageSourceWarning ? { warning: imageSourceWarning } : {}),
  });
});

const config = readRuntimeConfig();

app
  .listen({ port: config.port, host: '0.0.0.0' })
  .then(() => {
    app.log.info(`image-describer listening on ${config.port}`);
  })
  .catch((error) => {
    app.log.error(error);
    process.exit(1);
  });
