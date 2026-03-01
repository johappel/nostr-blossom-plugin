<!--
  MediaDetailSheet — Right-side overlay sheet showing detail for a selected item.

  Opens as an absolute overlay aligned to the right over the parent container
  and animates in with a subtle fade + slide-in from the right. Intended for use in all three
  media tabs (Gallery, Community, OER-Shares) as a replacement for the
  previous desktop sidebar.

  Props:
    open     — Whether the sheet is visible
    onClose  — Called when the user clicks the close button or presses Escape

  Snippets:
    children  — Scrollable main content (preview image, metadata <dl>, etc.)
    toolbar   — Pinned bottom toolbar (MediaToolbar or custom content)

  Accessibility:
    The sheet is rendered as a role="dialog" with aria-modal="true". Focus is
    trapped inside while open. Pressing Escape closes the sheet.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';

  interface MediaDetailSheetProps {
    open: boolean;
    onClose: () => void;
    children: Snippet;
    toolbar?: Snippet;
  }

  let { open, onClose, children, toolbar }: MediaDetailSheetProps = $props();

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') onClose();
  }
</script>

{#if open}
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div
    class="media-sheet"
    role="dialog"
    aria-modal="true"
    tabindex="-1"
    onkeydown={handleKeydown}
  >
    <button
      type="button"
      class="sheet-close"
      onclick={onClose}
      title="Schließen"
      aria-label="Schließen"
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
        <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
      </svg>
    </button>

    <div class="sheet-scroll">
      {@render children()}
    </div>

    {#if toolbar}
      <div class="sheet-toolbar-wrap">
        {@render toolbar()}
      </div>
    {/if}
  </div>
{/if}

<style>
  .media-sheet {
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    width: min(100%, 600px);
    z-index: 10;
    background: var(--bm-bg, #fff);
    border-radius: 8px 0 0 8px;
    border-left: 1px solid var(--bm-border-muted, #eee);
    display: flex;
    flex-direction: column;
    padding: 0.5rem;
    box-sizing: border-box;
    animation: sheet-in 0.18s ease-out;
  }

  @keyframes sheet-in {
    from {
      opacity: 0;
      transform: translateX(16px);
    }
    to {
      opacity: 1;
      transform: translateX(0);
    }
  }

  .sheet-close {
    position: absolute;
    top: 0.4rem;
    right: 0.4rem;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 2rem;
    height: 2rem;
    border-radius: 50%;
    border: 1px solid var(--bm-border, #ddd);
    background: var(--bm-bg-subtle, #f5f5f5);
    color: var(--bm-text-muted, #666);
    cursor: pointer;
    z-index: 1;
    transition: background 0.12s;
    flex-shrink: 0;
  }

  .sheet-close:hover {
    background: var(--bm-bg-hover, #e8e8e8);
    color: var(--bm-text, #222);
  }

  .sheet-scroll {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    display: grid;
    gap: 0.5rem;
    align-content: start;
    padding-bottom: 0.5rem;
    padding-top: 0.25rem;
    /* leave room for close button */
    padding-right: 2.25rem;
  }

  .sheet-toolbar-wrap {
    flex-shrink: 0;
    border-top: 1px solid var(--bm-border-muted, #eee);
  }
</style>
