/**
 * Injector
 *
 * Scans the host page DOM for target elements matching the configured selector
 * (or the default `[data-blossom]` attribute) and injects a trigger button
 * next to each matching element. Uses a MutationObserver to handle dynamically
 * added elements.
 *
 * Injection strategy:
 *  - Wraps the target element + button in a `<span class="bm-wrapper">` (inline-flex)
 *    so that layout is minimally disrupted for both `<input>` and `<textarea>`.
 *  - The wrapper is not injected into Shadow DOM or custom elements.
 *  - Each element is injected at most once (tracked by a WeakSet).
 *
 * After the user selects/uploads a file the `onSelect` callback is called
 * with the target element and the chosen URL so the caller can write it back.
 */

export interface InjectorOptions {
  /** CSS selector for target elements. Default: `[data-blossom]` */
  targetSelector?: string;
  /** Label for the injected trigger button. Default: `🌸 Mediathek` */
  buttonLabel?: string;
  /** CSS class(es) added to the injected button. Default: `bm-trigger` */
  buttonClass?: string;
  /** Called when the user selects a file for a given target element */
  onSelect: (target: HTMLElement, url: string) => void;
  /** Called when the trigger button is clicked for a given target element */
  onOpen: (target: HTMLElement) => void;
}

const DEFAULT_SELECTOR = '[data-blossom]';
const INJECTED_ATTR = 'data-bm-injected';

export class Injector {
  private readonly opts: Required<Omit<InjectorOptions, 'onSelect' | 'onOpen'>> &
    Pick<InjectorOptions, 'onSelect' | 'onOpen'>;
  private readonly injected = new WeakSet<Element>();
  private observer: MutationObserver | null = null;

  constructor(opts: InjectorOptions) {
    this.opts = {
      targetSelector: opts.targetSelector ?? DEFAULT_SELECTOR,
      buttonLabel: opts.buttonLabel ?? '🌸 Mediathek',
      buttonClass: opts.buttonClass ?? 'bm-trigger',
      onSelect: opts.onSelect,
      onOpen: opts.onOpen,
    };
  }

  /** Start scanning the document and watching for new elements */
  start(): void {
    this.scanRoot(document.body);

    this.observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'childList') {
          for (const node of mutation.addedNodes) {
            if (node.nodeType === Node.ELEMENT_NODE) {
              this.scanRoot(node as Element);
            }
          }
        }
      }
    });

    this.observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  /** Stop the MutationObserver */
  stop(): void {
    this.observer?.disconnect();
    this.observer = null;
  }

  /** Remove all injected wrappers and buttons from the document */
  destroy(): void {
    this.stop();

    const wrappers = document.querySelectorAll('.bm-wrapper[data-bm-injected]');
    for (const wrapper of wrappers) {
      // Move children back before the wrapper, then remove wrapper
      const parent = wrapper.parentNode;
      if (!parent) continue;
      while (wrapper.firstChild) {
        // Move each child except the button back to before the wrapper
        const child = wrapper.firstChild;
        if ((child as Element).classList?.contains(this.opts.buttonClass)) {
          wrapper.removeChild(child);
        } else {
          parent.insertBefore(child, wrapper);
        }
      }
      parent.removeChild(wrapper);
    }
  }

  /** Force re-scan (e.g. after programmatic DOM changes) */
  refresh(): void {
    this.scanRoot(document.body);
  }

  private scanRoot(root: Element): void {
    // The root itself might match
    if (root.matches?.(this.opts.targetSelector)) {
      this.injectButton(root as HTMLElement);
    }

    // All descendants
    const matches = root.querySelectorAll<HTMLElement>(this.opts.targetSelector);
    for (const el of matches) {
      this.injectButton(el);
    }
  }

  private injectButton(target: HTMLElement): void {
    if (this.injected.has(target)) return;
    if (target.hasAttribute(INJECTED_ATTR)) return;

    this.injected.add(target);
    target.setAttribute(INJECTED_ATTR, '');

    const button = this.createButton(target);
    const wrapper = this.createWrapper(target, button);

    // Insert wrapper directly before target
    const parent = target.parentNode;
    if (!parent) return;
    parent.insertBefore(wrapper, target);
    wrapper.appendChild(target);
    wrapper.appendChild(button);
  }

  private createWrapper(target: HTMLElement, _button: HTMLButtonElement): HTMLSpanElement {
    const wrapper = document.createElement('span');
    wrapper.className = 'bm-wrapper';
    wrapper.setAttribute(INJECTED_ATTR, '');
    // Match the display mode of the target
    const targetDisplay = window.getComputedStyle(target).display;
    wrapper.style.display = targetDisplay === 'block' ? 'flex' : 'inline-flex';
    wrapper.style.alignItems = 'center';
    wrapper.style.gap = '6px';
    return wrapper;
  }

  private createButton(target: HTMLElement): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = this.opts.buttonClass;
    button.textContent = this.opts.buttonLabel;
    button.style.cssText = [
      'font: inherit',
      'font-size: 0.85em',
      'padding: 0.35em 0.65em',
      'background: #6c63ff',
      'color: #fff',
      'border: none',
      'border-radius: 4px',
      'cursor: pointer',
      'white-space: nowrap',
      'flex-shrink: 0',
    ].join(';');

    button.addEventListener('click', (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      this.opts.onOpen(target);
    });

    return button;
  }

  /**
   * Write a selected URL back to the target element.
   * Fires the appropriate synthetic events so that framework bindings update.
   */
  static writeUrlToTarget(target: HTMLElement, url: string): void {
    const tag = target.tagName.toLowerCase();

    if (tag === 'input' || tag === 'textarea') {
      const el = target as HTMLInputElement | HTMLTextAreaElement;
      const nativeInputValue = Object.getOwnPropertyDescriptor(
        tag === 'textarea' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype,
        'value',
      );
      nativeInputValue?.set?.call(el, url);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    } else if ((target as HTMLElement & { value?: unknown }).value !== undefined) {
      (target as HTMLElement & { value: string }).value = url;
      target.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }
}
