/**
 * Re-exports from @blossom/plugin/core for use in the demo app.
 * All implementation has moved to the plugin package.
 */
export type {
  BlossomDeleteResult,
  BlossomDeleteServerResult,
  PublishDeletionResult,
} from '@blossom/plugin/core';

export {
  deleteBlossomBlob,
  publishDeletionEvent,
} from '@blossom/plugin/core';
