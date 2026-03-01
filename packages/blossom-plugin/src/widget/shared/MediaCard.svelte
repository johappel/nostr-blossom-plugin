<!--
  MediaCard — Unified grid card for Gallery, Community and OER-Shares tabs.

  Displays a 4:3 thumbnail image with name and date below.
  An optional badge (e.g. "☁" for remote-only, pubkey snippet for shared-by)
  is shown as a pill overlay in the top-right corner.

  Props:
    item      — MediaDisplayItem to display
    selected  — Whether this card is currently selected
    onclick   — Called when the card button is clicked
-->
<script lang="ts">
  import type { MediaDisplayItem } from '../types';

  interface MediaCardProps {
    item: MediaDisplayItem;
    selected?: boolean;
    onclick: () => void;
  }

  let { item, selected = false, onclick }: MediaCardProps = $props();

  let hasImage = $derived(
    !!(item.thumbnailUrl || item.mimeType?.startsWith('image/')),
  );

  let imgSrc = $derived(item.thumbnailUrl || item.url);

  function placeholderIcon(mime?: string): string {
    if (!mime) return '📁';
    if (mime.includes('pdf')) return '📄';
    if (mime.startsWith('video/')) return '🎬';
    if (mime.startsWith('audio/')) return '🎵';
    return '📁';
  }
</script>

<button
  type="button"
  class="media-card"
  class:selected
  {onclick}
  title={item.description || item.name || item.url}
>
  <div class="media-card-img-wrap">
    {#if hasImage}
      <img src={imgSrc} alt={item.name || ''} loading="lazy" class="media-card-img" />
    {:else}
      <div class="media-card-placeholder">{placeholderIcon(item.mimeType)}</div>
    {/if}
    {#if item.badge}
      <span class="media-card-badge" title={item.badge.title}>{item.badge.text}</span>
    {/if}
  </div>
  <div class="media-card-info">
    <span class="media-card-name">{item.name || '—'}</span>
    <span class="media-card-date">{item.date}</span>
  </div>
</button>

<style>
  .media-card {
    display: flex;
    flex-direction: column;
    border: 1px solid var(--bm-border, #e0e0e0);
    border-radius: 8px;
    overflow: hidden;
    cursor: pointer;
    background: var(--bm-bg, #fff);
    text-align: left;
    padding: 0;
    font: inherit;
    transition: border-color 0.15s, box-shadow 0.15s;
    width: 100%;
    min-height: 0;
  }

  .media-card:hover {
    border-color: var(--bm-text-muted, #aaa);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  }

  .media-card.selected {
    border-color: var(--bm-accent, #6c63ff);
    box-shadow: 0 0 0 2px var(--bm-accent-bg, #c5c2ff);
  }

  .media-card-img-wrap {
    position: relative;
    width: 100%;
    height: 105px;
    background: var(--bm-bg-subtle, #f5f5f5);
    overflow: hidden;
    flex-shrink: 0;
  }

  @supports (aspect-ratio: 4 / 3) {
    .media-card-img-wrap {
      height: auto;
      aspect-ratio: 4 / 3;
    }
  }

  .media-card-img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .media-card-placeholder {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 2rem;
    color: var(--bm-text-muted, #888);
  }

  .media-card-badge {
    position: absolute;
    top: 4px;
    right: 4px;
    font-size: 0.68rem;
    background: rgba(0, 0, 0, 0.55);
    color: #fff;
    border-radius: 4px;
    padding: 1px 4px;
    white-space: nowrap;
    max-width: 60%;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .media-card-info {
    padding: 0.3rem 0.45rem 0.4rem;
    display: flex;
    flex-direction: column;
    gap: 0.08rem;
    min-width: 0;
  }

  .media-card-name {
    font-size: 0.76rem;
    font-weight: 600;
    color: var(--bm-text, #222);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
  }

  .media-card-date {
    font-size: 0.68rem;
    color: var(--bm-text-muted, #999);
  }
</style>
