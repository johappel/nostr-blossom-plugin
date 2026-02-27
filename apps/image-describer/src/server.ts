import Fastify from 'fastify';
import cors from '@fastify/cors';
import sharp from 'sharp';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createCanvas } from '@napi-rs/canvas';

type DescribeRequestBody = {
  imageUrl?: string;
};

type ImageGenRequestBody = {
  prompt?: string;
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
    pdfMaxPages: Number(process.env.OPENROUTER_PDF_MAX_PAGES ?? 4),
    pdfTextMaxChars: Number(process.env.OPENROUTER_PDF_TEXT_MAX_CHARS ?? 4500),
    inlineOnly: process.env.OPENROUTER_VISION_INLINE_ONLY === 'true',
    // Image generation settings
    imageGenApiUrl: process.env.IMAGE_GEN_API_URL || 'http://localhost:11434/v1',
    imageGenApiKey: process.env.IMAGE_GEN_API_KEY || '',
    imageGenModel: process.env.IMAGE_GEN_MODEL || 'black-forest-labs/FLUX.1-schnell',
    imageGenTimeoutMs: Number(process.env.IMAGE_GEN_TIMEOUT_MS ?? 60000),
    imageGenDefaultSize: process.env.IMAGE_GEN_DEFAULT_SIZE || '1024x1024',
  };
}

function fallbackDescriptionFromUrl(imageUrl: string) {
  try {
    const parsed = new URL(imageUrl);
    const fileName = parsed.pathname.split('/').filter(Boolean).at(-1) ?? '';
    const normalizedName = fileName.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
    if (/^[a-f0-9]{24,}$/i.test(normalizedName)) {
      return 'Uploaded file';
    }
    return normalizedName || 'Uploaded file';
  } catch {
    return 'Uploaded file';
  }
}

async function renderPdfToImages(
  pdfBuffer: Buffer,
  options: {
    maxDimension: number;
    maxPages: number;
  },
) {
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(pdfBuffer) });
  const document = await loadingTask.promise;

  try {
    const pageCount = document.numPages;
    const maxPages = Math.min(pageCount, Math.max(1, options.maxPages));
    const normalizedMaxDimension = Math.max(512, options.maxDimension);
    const pages: Buffer[] = [];

    for (let pageNumber = 1; pageNumber <= maxPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 1 });
      const longestSide = Math.max(viewport.width, viewport.height);
      const scale = longestSide > normalizedMaxDimension ? normalizedMaxDimension / longestSide : 1;
      const renderViewport = page.getViewport({ scale });
      const canvas = createCanvas(
        Math.max(1, Math.ceil(renderViewport.width)),
        Math.max(1, Math.ceil(renderViewport.height)),
      );
      const context = canvas.getContext('2d');

      await page.render({
        canvas: canvas as unknown as HTMLCanvasElement,
        canvasContext: context as never,
        viewport: renderViewport,
      }).promise;

      pages.push(canvas.toBuffer('image/png'));
    }

    return {
      pageCount,
      renderedPageCount: pages.length,
      pages,
    };
  } finally {
    await document.destroy();
  }
}

async function extractPdfTextExcerpt(pdfBuffer: Buffer, maxChars: number) {
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(pdfBuffer) });
  const document = await loadingTask.promise;

  try {
    const safeMaxChars = Math.max(600, maxChars);
    const parts: string[] = [];

    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      if (parts.join(' ').length >= safeMaxChars) {
        break;
      }

      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      const text = content.items
        .map((item) => ('str' in item ? String(item.str) : ''))
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();

      if (text) {
        parts.push(`Seite ${pageNumber}: ${text}`);
      }
    }

    return parts.join('\n').slice(0, safeMaxChars);
  } finally {
    await document.destroy();
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
    pdfMaxPages: number;
    pdfTextMaxChars: number;
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

    const contentType = response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() || '';
    const looksLikePdf = contentType === 'application/pdf' || /\.pdf(?:$|[?#])/i.test(imageUrl);
    const isImage = contentType.startsWith('image/');

    if (!isImage && !looksLikePdf) {
      throw new Error(`Unsupported content-type: ${contentType || 'unknown'}`);
    }

    const contentLength = Number(response.headers.get('content-length') ?? '0');
    if (contentLength > options.inlineImageMaxBytes) {
      throw new Error(`Image too large (${contentLength} bytes)`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const sourceBuffer = Buffer.from(arrayBuffer);
    const sourceKind = looksLikePdf ? ('pdf' as const) : ('image' as const);
    const imageBuffers: Buffer[] = [];
    let pdfTextExcerpt = '';
    let pdfPageCount: number | undefined;
    let renderedPageCount: number | undefined;

    if (looksLikePdf) {
      const rendered = await renderPdfToImages(sourceBuffer, {
        maxDimension: options.inlineImageMaxDim,
        maxPages: options.pdfMaxPages,
      });
      imageBuffers.push(...rendered.pages);
      pdfPageCount = rendered.pageCount;
      renderedPageCount = rendered.renderedPageCount;
      pdfTextExcerpt = await extractPdfTextExcerpt(sourceBuffer, options.pdfTextMaxChars);
    } else {
      imageBuffers.push(sourceBuffer);
    }

    const optimizedImages: Array<{ buffer: Buffer; contentType: string }> = [];
    let optimizedBytesTotal = 0;

    for (const imageBuffer of imageBuffers) {
      const optimized = await optimizeImageForInlineUpload(imageBuffer, {
        inlineImageMaxBytes: options.inlineImageMaxBytes,
        inlineImageMaxDim: options.inlineImageMaxDim,
        inlineImageQuality: options.inlineImageQuality,
        inlineImageMinDim: options.inlineImageMinDim,
        inlineImageMinQuality: options.inlineImageMinQuality,
      });
      optimizedImages.push(optimized);
      optimizedBytesTotal += optimized.buffer.byteLength;
    }

    const dataUrls = optimizedImages.map(
      (optimized) => `data:${optimized.contentType};base64,${optimized.buffer.toString('base64')}`,
    );
    const optimizedContentType = optimizedImages[0]?.contentType ?? 'image/jpeg';

    return {
      dataUrls,
      optimizedBytes: optimizedBytesTotal,
      sourceBytes: sourceBuffer.byteLength,
      sourceContentType: looksLikePdf ? 'application/pdf' : contentType,
      optimizedContentType,
      sourceKind,
      ...(typeof pdfPageCount === 'number' ? { pdfPageCount } : {}),
      ...(typeof renderedPageCount === 'number' ? { renderedPageCount } : {}),
      ...(pdfTextExcerpt ? { pdfTextExcerpt } : {}),
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
  let imageSourcesForModel = [imageUrl];
  let imageSourceWarning: string | undefined;
  let inputMode: 'inline' | 'remote-url' | 'inline-then-remote-url' = 'remote-url';
  let sourceKind: 'image' | 'pdf' = 'image';
  let pdfTextExcerpt = '';
  let pdfPageCount: number | undefined;
  let renderedPageCount: number | undefined;
  let imageProcessing:
    | {
        sourceBytes: number;
        optimizedBytes: number;
        sourceContentType: string;
        optimizedContentType: string;
        sourceKind: 'image' | 'pdf';
        pdfPageCount?: number;
        renderedPageCount?: number;
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
      pdfMaxPages: config.pdfMaxPages,
      pdfTextMaxChars: config.pdfTextMaxChars,
    });
    imageSourceForModel = inline.dataUrls[0] ?? imageUrl;
    imageSourcesForModel = inline.dataUrls;
    sourceKind = inline.sourceKind;
    pdfTextExcerpt = inline.pdfTextExcerpt ?? '';
    pdfPageCount = inline.pdfPageCount;
    renderedPageCount = inline.renderedPageCount;
    imageProcessing = {
      sourceBytes: inline.sourceBytes,
      optimizedBytes: inline.optimizedBytes,
      sourceContentType: inline.sourceContentType,
      optimizedContentType: inline.optimizedContentType,
      sourceKind: inline.sourceKind,
      ...(typeof inline.pdfPageCount === 'number' ? { pdfPageCount: inline.pdfPageCount } : {}),
      ...(typeof inline.renderedPageCount === 'number'
        ? { renderedPageCount: inline.renderedPageCount }
        : {}),
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
    const contentParts: Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }> = [
      {
        type: 'text',
        text:
          sourceKind === 'pdf'
            ? `Analyze this document input (multi-page PDF rendered as page previews) and return JSON only with keys description (max 140 chars), alt (max 140 chars, suitable for an HTML img alt attribute), genre (one short style/category label), and tags (array of up to 6 short lowercase keywords). Describe the document as a whole, not just the cover page. The values for description, alt and genre must be written in ${config.visionResponseLanguage}.`
            : `Analyze this visual input (image or PDF first-page render) and return JSON only with keys description (max 140 chars), alt (max 140 chars, suitable for an HTML img alt attribute), genre (one short style/category label like comic, photorealistic, watercolor), and tags (array of up to 6 short lowercase keywords). The values for description, alt and genre must be written in ${config.visionResponseLanguage}.`,
      },
    ];

    if (sourceKind === 'pdf' && pdfTextExcerpt) {
      contentParts.push({
        type: 'text',
        text: `Extracted document text excerpt:\n${pdfTextExcerpt}`,
      });
    }

    const sources = sourceKind === 'pdf' ? imageSourcesForModel : [imageSource];
    for (const source of sources) {
      contentParts.push({
        type: 'image_url',
        image_url: {
          url: source,
        },
      });
    }

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
            content: contentParts,
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
      if (sourceKind === 'pdf') {
        if (imageSourcesForModel.length > 1) {
          imageSourceWarning = [
            imageSourceWarning,
            'Inline PDF payload too large. Retrying with reduced page set.',
          ]
            .filter(Boolean)
            .join(' ');

          imageSourcesForModel = [imageSourcesForModel[0]];
          renderedPageCount = 1;
          if (imageProcessing) {
            imageProcessing = {
              ...imageProcessing,
              renderedPageCount: 1,
            };
          }

          upstream = await requestVision(imageSourcesForModel[0]);
        } else {
          const fallback = fallbackDescriptionFromUrl(imageUrl);
          return reply.send({
            description: fallback,
            alt: normalizeAltText(fallback),
            genre: '',
            tags: [],
            inputMode: 'inline',
            ...(imageProcessing ? { imageProcessing } : {}),
            warning:
              'Vision provider rejected rendered PDF preview with 413. Remote URL fallback is disabled for PDFs.',
          });
        }
      }

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
    ...(typeof pdfPageCount === 'number' ? { pdfPageCount } : {}),
    ...(typeof renderedPageCount === 'number' ? { renderedPageCount } : {}),
    ...(imageSourceWarning ? { warning: imageSourceWarning } : {}),
  });
});

// ─── Image Generation ─────────────────────────────────────────────────────────

app.post<{ Body: ImageGenRequestBody }>('/image-gen', async (request, reply) => {
  const config = readRuntimeConfig();
  const prompt = request.body?.prompt?.trim();

  if (!prompt) {
    return reply.status(400).send({ error: 'prompt is required' });
  }

  if (prompt.length > 2000) {
    return reply.status(400).send({ error: 'prompt must be 2000 characters or less' });
  }

  const apiUrl = config.imageGenApiUrl.replace(/\/$/, '');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (config.imageGenApiKey) {
    headers['Authorization'] = `Bearer ${config.imageGenApiKey}`;
  }

  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), config.imageGenTimeoutMs);

  try {
    const upstream = await fetch(`${apiUrl}/images/generations`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: config.imageGenModel,
        prompt,
        n: 1,
        size: config.imageGenDefaultSize,
        response_format: 'b64_json',
      }),
      signal: controller.signal,
    });

    if (!upstream.ok) {
      const errorBody = await upstream.text().catch(() => '');
      let errorMessage = `Image generation failed (HTTP ${upstream.status})`;
      try {
        const parsed = JSON.parse(errorBody) as { error?: { message?: string } };
        if (parsed.error?.message) {
          errorMessage = parsed.error.message;
        }
      } catch {
        if (errorBody) errorMessage += `: ${errorBody.slice(0, 200)}`;
      }
      return reply.status(upstream.status).send({ error: errorMessage });
    }

    const payload = (await upstream.json()) as {
      data?: Array<{ b64_json?: string; url?: string }>;
    };

    const imageData = payload.data?.[0];

    if (!imageData) {
      return reply.status(502).send({ error: 'No image data in response' });
    }

    // Prefer b64_json, fall back to url
    if (imageData.b64_json) {
      return reply.send({
        image: `data:image/png;base64,${imageData.b64_json}`,
      });
    }

    if (imageData.url) {
      // Download the image and convert to data URL
      const imgResponse = await fetch(imageData.url);
      if (!imgResponse.ok) {
        return reply.status(502).send({ error: 'Failed to fetch generated image from URL' });
      }
      const buffer = Buffer.from(await imgResponse.arrayBuffer());
      const contentType = imgResponse.headers.get('content-type') || 'image/png';
      return reply.send({
        image: `data:${contentType};base64,${buffer.toString('base64')}`,
      });
    }

    return reply.status(502).send({ error: 'Response contained neither b64_json nor url' });
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      return reply.status(504).send({
        error: `Image generation timed out after ${config.imageGenTimeoutMs}ms`,
      });
    }
    return reply.status(500).send({
      error: err instanceof Error ? err.message : 'Image generation failed',
    });
  } finally {
    clearTimeout(timeoutHandle);
  }
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
