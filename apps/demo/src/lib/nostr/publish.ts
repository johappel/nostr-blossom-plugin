/**
 * Re-exports from @blossom/plugin/core for use in the demo app.
 * Tag-builder functions and publishEvent now live in the plugin package.
 */
export type {
  ImageMetadataInput,
  AiImageMode,
} from '@blossom/plugin/core';

export {
  buildImageMetadataTags,
  buildKind1FallbackTags,
  publishEvent,
} from '@blossom/plugin/core';
