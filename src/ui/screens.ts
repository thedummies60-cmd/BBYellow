/**
 * Title, death and victory screens.
 *
 * Driven by the mode machine in `game/mode.ts` — `app/` maps a mode change to a screen,
 * so there is no second source of truth about what state the game is in.
 */

export interface Screen {
  show(title: string, body: string, action: string): void;
  hide(): void;
  readonly visible: boolean;
  onActivate(handler: () => void): () => void;
  dispose(): void;
}

export function createScreen(parent: HTMLElement = document.body): Screen {
  const root = document.createElement('div');
  root.id = 'screen';
  root.setAttribute('role', 'dialog');
  root.setAttribute('tabindex', '0');
  root.style.cssText = [
    'position:fixed',
    'inset:0',
    'display:none',
    'flex-direction:column',
    'align-items:center',
    'justify-content:center',
    'gap:.85rem',
    'background:rgba(0,0,0,.86)',
    'color:#e8e8e8',
    'font:15px/1.6 system-ui,sans-serif',
    'text-align:center',
    'cursor:pointer',
    'z-index:30',
    'user-select:none',
    'padding:2rem',
  ].join(';');

  const heading = document.createElement('h1');
  heading.style.cssText = 'margin:0;font-size:1.5rem;font-weight:600;letter-spacing:.02em';
  const body = document.createElement('p');
  body.style.cssText = 'margin:0;max-width:30rem;color:#a8a8a8';
  const action = document.createElement('p');
  action.style.cssText = 'margin:.6rem 0 0;font-size:.85rem;color:#6f6f6f';
  root.append(heading, body, action);
  parent.appendChild(root);

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

  root.addEventListener('click', activate);
  root.addEventListener('keydown', handleKey);

  return {
    get visible() {
      return visible;
    },

    show(titleText: string, bodyText: string, actionText: string): void {
      heading.textContent = titleText;
      body.textContent = bodyText;
      action.textContent = actionText;
      root.style.display = 'flex';
      visible = true;
      root.focus();
    },

    hide(): void {
      root.style.display = 'none';
      visible = false;
    },

    onActivate(handler: () => void): () => void {
      handlers.add(handler);
      return () => handlers.delete(handler);
    },

    dispose(): void {
      root.removeEventListener('click', activate);
      root.removeEventListener('keydown', handleKey);
      handlers.clear();
      root.remove();
    },
  };
}
