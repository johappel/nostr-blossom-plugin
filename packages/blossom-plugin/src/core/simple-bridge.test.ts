// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { createBlossomBridge } from './simple-bridge';

const testSigner = {
  getPublicKey: async () => 'pubkey',
  signEvent: async (event: Record<string, unknown>) => ({ ...event, id: 'id', sig: 'sig', pubkey: 'pubkey' }),
};

describe('createBlossomBridge', () => {
  it('uploads a provided file via underlying upload client', async () => {
    const bridge = createBlossomBridge({
      servers: ['https://example.com'],
      signer: testSigner,
      uploaderFactory: () => ({
        upload: async () => [['url', 'https://example.com/file.png']],
      }),
    });

    const result = await bridge.uploadFile(new File(['data'], 'file.png', { type: 'image/png' }));
    expect(result.url).toBe('https://example.com/file.png');
  });

  it('returns null when file selection is canceled', async () => {
    const clickSpy = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(function (this: HTMLInputElement) {
      this.dispatchEvent(new Event('change'));
    });

    const bridge = createBlossomBridge({
      servers: ['https://example.com'],
      signer: testSigner,
      uploaderFactory: () => ({
        upload: async () => [['url', 'https://example.com/file.png']],
      }),
    });

    const result = await bridge.selectAndUpload();
    expect(result).toBeNull();
    clickSpy.mockRestore();
  });

  it('attaches upload button and writes selected url into host input', async () => {
    const clickSpy = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(function (this: HTMLInputElement) {
      Object.defineProperty(this, 'files', {
        configurable: true,
        get: () => ({
          item: () => new File(['data'], 'image.png', { type: 'image/png' }),
        }),
      });
      this.dispatchEvent(new Event('change'));
    });

    const bridge = createBlossomBridge({
      servers: ['https://example.com'],
      signer: testSigner,
      uploaderFactory: () => ({
        upload: async () => [
          ['url', 'https://example.com/image.png'],
          ['m', 'image/png'],
        ],
      }),
    });

    const hostInput = document.createElement('input');
    document.body.appendChild(hostInput);

    const onInput = vi.fn();
    const onChange = vi.fn();
    hostInput.addEventListener('input', onInput);
    hostInput.addEventListener('change', onChange);

    const controller = bridge.attachToInput(hostInput, { iconLabel: 'Upload with Blossom' });
    const button = hostInput.nextElementSibling as HTMLButtonElement;

    expect(button).toBeTruthy();
    expect(button.getAttribute('aria-label')).toBe('Upload with Blossom');

    button.click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(hostInput.value).toBe('https://example.com/image.png');
    expect(onInput).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledTimes(1);

    controller.destroy();
    expect(hostInput.nextElementSibling).toBeNull();

    clickSpy.mockRestore();
  });
});
