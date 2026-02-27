/**
 * Browser-only image and PDF preview generation utilities.
 *
 * Creates scaled-down thumbnail and preview files from uploaded images or
 * PDFs using the Canvas API and (optionally) `pdfjs-dist`.
 *
 * ⚠️  These functions require a browser environment with Canvas support.
 *     They will throw in Node.js without a compatible Canvas polyfill.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PreviewSpec {
  /** Nostr tag name for this preview variant (e.g. 'thumb', 'image') */
  tagName: 'thumb' | 'image';
  /** Maximum pixel dimension (longest edge) for the output */
  maxDimension: number;
  /** Filename suffix before `.webp` (e.g. 'thumb', 'preview') */
  suffix: string;
}

/** Default spec set for images: thumbnail (200 px) + preview (600 px). */
export const IMAGE_PREVIEW_SPECS: PreviewSpec[] = [
  { tagName: 'thumb', maxDimension: 200, suffix: 'thumb' },
  { tagName: 'image', maxDimension: 600, suffix: 'preview' },
];

/** Default spec set for PDFs: thumbnail only (200 px). */
export const PDF_PREVIEW_SPECS: PreviewSpec[] = [
  { tagName: 'thumb', maxDimension: 200, suffix: 'thumb' },
];

// ─── Internal helpers ─────────────────────────────────────────────────────────

function scaleDimensions(
  width: number,
  height: number,
  maxDimension: number,
): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= maxDimension) return { width, height };
  const scale = maxDimension / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

async function canvasToImageFile(canvas: HTMLCanvasElement, filename: string): Promise<File> {
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (nextBlob) => {
        if (nextBlob) {
          resolve(nextBlob);
        } else {
          reject(new Error('Canvas toBlob conversion failed'));
        }
      },
      'image/webp',
      0.82,
    );
  });

  return new File([blob], filename, { type: blob.type || 'image/webp' });
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Create a scaled-down WebP preview of an image file.
 *
 * @param file         - Source image File (any browser-decodable format)
 * @param maxDimension - Maximum px length of the longest edge
 * @param filename     - Output filename (should end in `.webp`)
 */
export async function createImagePreviewFile(
  file: File,
  maxDimension: number,
  filename: string,
): Promise<File> {
  const bitmap = await createImageBitmap(file);

  try {
    const target = scaleDimensions(bitmap.width, bitmap.height, maxDimension);
    const canvas = document.createElement('canvas');
    canvas.width = target.width;
    canvas.height = target.height;

    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas 2D context unavailable');

    context.drawImage(bitmap, 0, 0, target.width, target.height);
    return await canvasToImageFile(canvas, filename);
  } finally {
    bitmap.close();
  }
}

/**
 * Create a scaled-down WebP thumbnail from the first page of a PDF file.
 *
 * Requires `pdfjs-dist` to be installed in the host project.
 * The worker URL is set via a dynamic import pointing to the legacy build.
 *
 * @param file         - Source PDF File
 * @param maxDimension - Maximum px length of the longest edge
 * @param filename     - Output filename (should end in `.webp`)
 */
export async function createPdfPreviewFile(
  file: File,
  maxDimension: number,
  filename: string,
): Promise<File> {
  const pdfjs = await (
    // @ts-ignore -- pdfjs-dist is an optional peer dependency
    import('pdfjs-dist/legacy/build/pdf.mjs') as Promise<typeof import('pdfjs-dist')>
  ).catch(() => {
    throw new Error(
      'pdfjs-dist is required for PDF preview generation. Install it: pnpm add pdfjs-dist',
    );
  });

  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    try {
      // @ts-ignore -- optional dynamic URL resolution via bundler
      pdfjs.GlobalWorkerOptions.workerSrc = new URL(
        'pdfjs-dist/legacy/build/pdf.worker.mjs',
        import.meta.url,
      ).href;
    } catch {
      // In environments without URL/import.meta.url support, the consumer
      // must set GlobalWorkerOptions.workerSrc manually before calling this.
    }
  }

  const pdfBytes = await file.arrayBuffer();
  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(pdfBytes) });
  const documentRef = await loadingTask.promise;

  try {
    const page = await documentRef.getPage(1);
    const viewport = page.getViewport({ scale: 1 });
    const target = scaleDimensions(viewport.width, viewport.height, maxDimension);
    const scale = target.width / viewport.width;
    const renderViewport = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.ceil(renderViewport.width));
    canvas.height = Math.max(1, Math.ceil(renderViewport.height));

    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas 2D context unavailable');

    await page.render({
      canvas: canvas as unknown as HTMLCanvasElement,
      canvasContext: context as never,
      viewport: renderViewport,
    }).promise;

    return await canvasToImageFile(canvas, filename);
  } finally {
    await documentRef.destroy();
  }
}

// ─── Utility ──────────────────────────────────────────────────────────────────

/**
 * Derive a safe filesystem basename from a File's name.
 * Strips extension and replaces non-alphanumeric chars with dashes.
 */
export function previewFileBaseName(file: File): string {
  const normalized = file.name
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-z0-9_-]+/gi, '-')
    .trim();
  return normalized || 'upload';
}

/**
 * Normalise a MIME type string to lowercase.
 */
export function normalizeMime(value?: string): string {
  return value?.trim().toLowerCase() ?? '';
}
