/**
 * The click-to-play / paused prompt.
 *
 * Pointer lock requires a user gesture, and the browser rate-limits re-locking after
 * ESC (docs/browser-integration.md). So there is always a moment where the game is
 * running but not captured, and the player needs to be told what to do — silence here
 * reads as the game being broken.
 */

export interface Prompt {
  show(title: string, detail?: string): void;
  hide(): void;
  readonly visible: boolean;
  /** Fires on click or Enter/Space, the gesture that can request pointer lock. */
  onActivate(handler: () => void): () => void;
  dispose(): void;
}

export function createPrompt(parent: HTMLElement = document.body): Prompt {
  const element = document.createElement('div');
  element.id = 'prompt';
  element.setAttribute('role', 'button');
  element.setAttribute('tabindex', '0');
  element.style.cssText = [
    'position:fixed',
    'inset:0',
    'display:none',
    'flex-direction:column',
    'align-items:center',
    'justify-content:center',
    'gap:.5rem',
    'background:rgba(0,0,0,.72)',
    'color:#e8e8e8',
    'font:15px/1.6 system-ui,sans-serif',
    'text-align:center',
    'cursor:pointer',
    'z-index:20',
    'user-select:none',
  ].join(';');

  const title = document.createElement('p');
  title.style.cssText = 'margin:0;font-size:1.05rem;font-weight:600';
  const detail = document.createElement('p');
  detail.style.cssText = 'margin:0;color:#9a9a9a;font-size:.86rem';
  element.append(title, detail);
  parent.appendChild(element);

  const handlers = new Set<() => void>();
  let visible = false;

  const activate = (): void => {
    for (const handler of [...handlers]) handler();
  };

  const handleKey = (event: KeyboardEvent): void => {
    if (event.code !== 'Enter' && event.code !== 'Space') return;
    event.preventDefault();
    activate();
  };

  element.addEventListener('click', activate);
  element.addEventListener('keydown', handleKey);

  return {
    get visible() {
      return visible;
    },

    show(titleText: string, detailText = ''): void {
      title.textContent = titleText;
      detail.textContent = detailText;
      element.style.display = 'flex';
      visible = true;
      element.focus();
    },

    hide(): void {
      element.style.display = 'none';
      visible = false;
    },

    onActivate(handler: () => void): () => void {
      handlers.add(handler);
      return () => handlers.delete(handler);
    },

    dispose(): void {
      element.removeEventListener('click', activate);
      element.removeEventListener('keydown', handleKey);
      handlers.clear();
      element.remove();
    },
  };
}
