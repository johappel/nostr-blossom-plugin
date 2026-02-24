// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { useBlossomInput } from './useBlossomInput';

function flush() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe('useBlossomInput', () => {
  it('injects button and writes selected url to input', async () => {
    const input = document.createElement('input');
    document.body.appendChild(input);

    const onInput = vi.fn();
    const onChange = vi.fn();
    input.addEventListener('input', onInput);
    input.addEventListener('change', onChange);

    const action = useBlossomInput(input, {
      onSelectUrl: async () => 'https://cdn.example/image.png',
      iconLabel: 'Upload with Blossom',
    });

    const button = input.nextElementSibling as HTMLButtonElement;
    expect(button).toBeTruthy();
    expect(button.getAttribute('aria-label')).toBe('Upload with Blossom');

    button.click();
    await flush();

    expect(input.value).toBe('https://cdn.example/image.png');
    expect(onInput).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledTimes(1);

    action.destroy();
    expect(input.nextElementSibling).toBeNull();
  });

  it('keeps input unchanged when selection is canceled', async () => {
    const input = document.createElement('input');
    input.value = 'https://existing.example/file.png';
    document.body.appendChild(input);

    const action = useBlossomInput(input, {
      onSelectUrl: async () => null,
    });

    const button = input.nextElementSibling as HTMLButtonElement;
    button.click();
    await flush();

    expect(input.value).toBe('https://existing.example/file.png');

    action.destroy();
  });
});
