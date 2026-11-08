// Tela de configuração da conexão: login pelo HA (OAuth) ou token de longa duração.
import { BUILD_ID } from '../build.ts';
import { normalizeHassUrl } from '../ha/auth.ts';
import { strings } from '../i18n/pt-BR.ts';

export interface SetupOptions {
  defaultUrl: string;
  error?: string;
  onOAuth(hassUrl: string): void;
  onToken(hassUrl: string, token: string): void;
  /** Se presente, mostra "Cancelar" (já existe uma conexão configurada). */
  onCancel?: () => void;
}

const s = strings.setup;

/** Mostra o setup por cima do rosto. Retorna a função que o fecha. */
export function showSetup(options: SetupOptions): () => void {
  const overlay = document.createElement('div');
  overlay.className = 'setup';
  overlay.innerHTML = `
    <form class="setup-card" novalidate>
      <h1></h1>
      <p class="setup-error" role="alert" hidden></p>
      <label>
        <span data-text="urlLabel"></span>
        <input name="url" type="url" inputmode="url" autocomplete="url" required />
      </label>
      <button type="button" class="setup-primary" data-action="oauth"></button>
      <div class="setup-divider"><span data-text="or"></span></div>
      <label>
        <span data-text="tokenLabel"></span>
        <input name="token" type="password" autocomplete="off" spellcheck="false" />
      </label>
      <p class="setup-hint" data-text="tokenHint"></p>
      <div class="setup-actions">
        <button type="button" data-action="cancel" hidden></button>
        <button type="submit" data-action="token"></button>
      </div>
      <p class="setup-version"></p>
    </form>`;

  const form = overlay.querySelector('form')!;
  const error = overlay.querySelector<HTMLElement>('.setup-error')!;
  const urlInput = form.elements.namedItem('url') as HTMLInputElement;
  const tokenInput = form.elements.namedItem('token') as HTMLInputElement;
  const button = (action: string): HTMLButtonElement =>
    overlay.querySelector<HTMLButtonElement>(`[data-action="${action}"]`)!;

  overlay.querySelector('h1')!.textContent = s.title;
  overlay.querySelectorAll<HTMLElement>('[data-text]').forEach((node) => {
    node.textContent = s[node.dataset.text as 'urlLabel' | 'or' | 'tokenLabel' | 'tokenHint'];
  });
  button('oauth').textContent = s.oauthButton;
  button('token').textContent = s.tokenButton;
  button('cancel').textContent = s.cancel;
  urlInput.value = options.defaultUrl;
  overlay.querySelector('.setup-version')!.textContent = s.version(BUILD_ID);

  const showError = (message: string | undefined): void => {
    error.textContent = message ?? '';
    error.hidden = !message;
  };
  showError(options.error);

  const readUrl = (): string | null => {
    const url = normalizeHassUrl(urlInput.value);
    if (!url) {
      showError(s.errors.invalidUrl);
      urlInput.focus();
    }
    return url;
  };

  const close = (): void => overlay.remove();

  button('oauth').addEventListener('click', () => {
    const url = readUrl();
    if (url) options.onOAuth(url);
  });
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const url = readUrl();
    if (!url) return;
    const token = tokenInput.value.trim();
    if (!token) {
      showError(s.errors.emptyToken);
      tokenInput.focus();
      return;
    }
    close();
    options.onToken(url, token);
  });
  if (options.onCancel) {
    const cancel = button('cancel');
    cancel.hidden = false;
    cancel.addEventListener('click', () => {
      close();
      options.onCancel?.();
    });
  }

  document.body.append(overlay);
  return close;
}
