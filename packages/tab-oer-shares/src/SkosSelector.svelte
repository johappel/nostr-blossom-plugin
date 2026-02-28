<!--
  SkosSelector — SKOS Vocabulary Checkbox Selector

  Loads a SKOS vocabulary from a SkoHub URL and renders a scrollable
  checkbox grid. Supports hierarchical concepts (parent → children).

  Props:
    vocabUrl   — JSON-LD URL (or local path) to load
    vocabKey   — Optional vocab key for bundled fallback (e.g. 'audience')
    label      — Section heading text
    selected   — Currently selected concepts (bindable)
    onchange   — Called when selection changes

  Usage:
    <SkosSelector
      vocabUrl="https://skohub.io/..."
      label="Zielgruppe"
      selected={form.audience}
      onchange={(sel) => form.audience = sel}
    />
-->
<script lang="ts">
  import { fetchSkosVocabulary } from './nostr/skos';
  import type { SkosConcept, SkosSelection } from './nostr/types';

  let {
    vocabUrl,
    vocabKey,
    label,
    selected = [],
    onchange,
  }: {
    vocabUrl: string;
    vocabKey?: string;
    label: string;
    selected: SkosSelection[];
    onchange: (selected: SkosSelection[]) => void;
  } = $props();

  let concepts = $state<SkosConcept[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);

  // Set of selected IDs for fast lookup
  let selectedIds = $derived(new Set(selected.map((s) => s.id)));

  // Load vocabulary when URL changes
  $effect(() => {
    if (!vocabUrl) return;
    loading = true;
    error = null;

    fetchSkosVocabulary(vocabUrl, vocabKey)
      .then((result) => {
        concepts = result;
        loading = false;
      })
      .catch((err) => {
        error = err instanceof Error ? err.message : String(err);
        loading = false;
      });
  });

  function toggle(concept: SkosConcept) {
    const isSelected = selectedIds.has(concept.id);
    let next: SkosSelection[];

    if (isSelected) {
      next = selected.filter((s) => s.id !== concept.id);
    } else {
      next = [...selected, { id: concept.id, prefLabel: concept.prefLabel }];
    }

    onchange(next);
  }

  function retry() {
    loading = true;
    error = null;
    fetchSkosVocabulary(vocabUrl, vocabKey)
      .then((result) => {
        concepts = result;
        loading = false;
      })
      .catch((err) => {
        error = err instanceof Error ? err.message : String(err);
        loading = false;
      });
  }
</script>

<fieldset class="oer-skos-selector">
  <legend class="oer-skos-legend">{label}</legend>

  {#if loading}
    <div class="oer-skos-loading">
      <span class="oer-skos-spinner"></span> Lade Vokabular…
    </div>
  {:else if error}
    <div class="oer-skos-error">
      <span>Fehler: {error}</span>
      <button type="button" class="oer-skos-retry" onclick={retry}>
        Erneut versuchen
      </button>
    </div>
  {:else}
    <div class="oer-skos-grid">
      {#each concepts as concept (concept.id)}
        <label class="oer-skos-item">
          <input
            type="checkbox"
            checked={selectedIds.has(concept.id)}
            onchange={() => toggle(concept)}
          />
          <span>{concept.prefLabel}</span>
        </label>

        {#if concept.children}
          {#each concept.children as child (child.id)}
            <label class="oer-skos-item oer-skos-child">
              <input
                type="checkbox"
                checked={selectedIds.has(child.id)}
                onchange={() => toggle(child)}
              />
              <span>{child.prefLabel}</span>
            </label>
          {/each}
        {/if}
      {/each}
    </div>
  {/if}
</fieldset>

<style>
  .oer-skos-selector {
    border: 1px solid var(--bm-input-border, #ddd);
    border-radius: 8px;
    padding: 0.6rem 0.8rem;
    margin: 0;
  }

  .oer-skos-legend {
    font-size: 0.78rem;
    font-weight: 600;
    color: var(--bm-text-muted, #666);
    padding: 0 0.3rem;
  }

  .oer-skos-loading {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.8rem;
    color: var(--bm-text-muted, #888);
    padding: 0.4rem 0;
  }

  .oer-skos-spinner {
    display: inline-block;
    width: 14px;
    height: 14px;
    border: 2px solid var(--bm-input-border, #ccc);
    border-top-color: var(--bm-accent, #6c63ff);
    border-radius: 50%;
    animation: oer-spin 0.8s linear infinite;
  }

  @keyframes oer-spin {
    to { transform: rotate(360deg); }
  }

  .oer-skos-error {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.78rem;
    color: var(--bm-danger, #d63031);
    padding: 0.3rem 0;
  }

  .oer-skos-retry {
    font: inherit;
    font-size: 0.72rem;
    padding: 0.2rem 0.5rem;
    border: 1px solid var(--bm-input-border, #ccc);
    border-radius: 4px;
    background: var(--bm-bg-subtle, #f5f5f5);
    color: var(--bm-text, #222);
    cursor: pointer;
  }

  .oer-skos-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.15rem 1rem;
    max-height: 200px;
    overflow-y: auto;
    padding: 0.3rem 0;
  }

  .oer-skos-item {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    font-size: 0.8rem;
    color: var(--bm-text, #222);
    cursor: pointer;
    padding: 0.15rem 0;
  }

  .oer-skos-item input[type='checkbox'] {
    accent-color: var(--bm-accent, #6c63ff);
    margin: 0;
    flex-shrink: 0;
  }

  .oer-skos-child {
    padding-left: 1.2rem;
    font-size: 0.76rem;
    color: var(--bm-text-muted, #555);
  }
</style>
