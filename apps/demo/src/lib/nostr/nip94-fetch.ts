/**
 * Re-exports from @blossom/plugin/core for use in the demo app.
 * All implementation has moved to the plugin package.
 */
export type {
  Nip94FileEvent,
  Nip94FetchResult,
} from '@blossom/plugin/core';

export {
  fetchNip94Events,
  enrichWithNip94,
  collectNip94Keywords,
} from '@blossom/plugin/core';
