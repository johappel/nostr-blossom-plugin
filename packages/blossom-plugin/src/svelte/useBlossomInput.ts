export interface BlossomInputActionOptions {
  onSelectUrl: () => Promise<string | null>;
  iconLabel?: string;
}

export function useBlossomInput(node: HTMLInputElement, options: BlossomInputActionOptions) {
  const button = document.createElement('button');
  button.type = 'button';
  button.setAttribute('aria-label', options.iconLabel ?? 'Upload with Blossom');
  button.textContent = '⬆';
  button.style.marginInlineStart = '0.5rem';

  node.insertAdjacentElement('afterend', button);

  async function handleClick() {
    const selectedUrl = await options.onSelectUrl();
    if (!selectedUrl) {
      return;
    }

    node.value = selectedUrl;
    node.dispatchEvent(new Event('input', { bubbles: true }));
    node.dispatchEvent(new Event('change', { bubbles: true }));
  }

  button.addEventListener('click', handleClick);

  return {
    destroy() {
      button.removeEventListener('click', handleClick);
      button.remove();
    },
  };
}
