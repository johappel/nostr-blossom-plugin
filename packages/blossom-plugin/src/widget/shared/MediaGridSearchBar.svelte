<script lang="ts">
  import { iconSync } from '../icons';

  interface MediaGridSearchBarProps {
    value?: string;
    placeholder?: string;
    loading?: boolean;
    disabled?: boolean;
    refreshTitle?: string;
    onRefresh: () => void;
  }

  let {
    value = $bindable(''),
    placeholder = 'Suchen…',
    loading = false,
    disabled = false,
    refreshTitle = 'Neu laden',
    onRefresh,
  }: MediaGridSearchBarProps = $props();
</script>

<div class="media-grid-search">
  <input
    class="search-input"
    bind:value
    placeholder={placeholder}
  />
  <button
    type="button"
    class="btn-refresh"
    onclick={onRefresh}
    disabled={loading || disabled}
    title={refreshTitle}
  >
    {#if loading}
      …
    {:else}
      {@html iconSync(16)}
    {/if}
  </button>
</div>

<style>
  .media-grid-search {
    display: flex;
    gap: 0.5rem;
    align-items: center;
  }

  .search-input {
    flex: 1;
    min-width: 0;
    font: inherit;
    font-size: 0.875rem;
    padding: 0.4rem 0.6rem;
    border: 1px solid var(--bm-input-border, #ccc);
    border-radius: 4px;
    background: var(--bm-input-bg, #fff);
    color: var(--bm-text, #222);
  }

  .search-input::placeholder {
    color: var(--bm-text-subtle, #888);
  }

  .btn-refresh {
    font: inherit;
    padding: 0.4rem 0.7rem;
    border: 1px solid var(--bm-input-border, #ccc);
    border-radius: 4px;
    background: var(--bm-bg-subtle, #f5f5f5);
    cursor: pointer;
    font-size: 1rem;
    color: var(--bm-text, #222);
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .btn-refresh:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
