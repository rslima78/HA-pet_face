// Miolo da tela do pet, montável dentro de qualquer elemento: a página avulsa (index.html)
// e o cartão do HA (custom:pet-face-card) usam o mesmo código.
import type { PetConfig } from './config.ts';
import { PET_EVENT } from './events.ts';
import { FaceRenderer } from './face/FaceRenderer.ts';
import { strings } from './i18n/pt-BR.ts';
import { deriveDecor, deriveFace, trackReply, type PetViewState, type SpeechTiming } from './state/derive.ts';
import type { Store } from './state/store.ts';
import { mountAsk } from './ui/ask.ts';

/** O que a tela precisa de quem a hospeda (conexão com o HA). */
export interface PetHost {
  pressCarinho(): void;
  /** Toque longo no rosto: pede ao HA para o satélite começar a ouvir. */
  pressOuvir(): void;
  ask(text: string): Promise<string>;
  /** Linha de diagnóstico para o painel dev. */
  describe(): string;
  /** Botão "Configurar" no aviso de offline; ausente no cartão. */
  onConfigure?: () => void;
  /** Botão "Trocar conexão" no painel dev; ausente no cartão. */
  onResetAuth?: () => void;
}

export interface MountedPet {
  face: FaceRenderer;
  destroy(): void;
}

export function mountPetView(
  root: HTMLElement,
  config: PetConfig,
  store: Store<PetViewState>,
  host: PetHost,
  options: { dev?: boolean } = {},
): MountedPet {
  const faceHost = document.createElement('div');
  faceHost.className = 'pet-face';
  faceHost.setAttribute('role', 'img');
  faceHost.setAttribute('aria-label', strings.faceLabel);

  // Pé da tela: o que o pet entendeu da voz, logo acima da legenda da resposta.
  const lines = document.createElement('div');
  lines.className = 'lines';
  const heard = document.createElement('div');
  heard.className = 'heard';
  const caption = document.createElement('div');
  caption.className = 'caption';
  caption.setAttribute('aria-live', 'polite');
  lines.append(heard, caption);

  const offline = document.createElement('div');
  offline.className = 'offline';
  offline.setAttribute('role', 'status');
  offline.hidden = true;
  const offlineText = document.createElement('span');
  offlineText.textContent = strings.offline.message;
  offline.append(offlineText);
  if (host.onConfigure) {
    const configure = document.createElement('button');
    configure.type = 'button';
    configure.textContent = strings.offline.configure;
    configure.addEventListener('click', host.onConfigure);
    offline.append(configure);
  }

  const hint = document.createElement('div');
  hint.className = 'hint';
  hint.textContent = config.hint ?? '';

  const banner = document.createElement('div');
  banner.className = 'banner';

  root.append(faceHost, banner, lines, hint, offline);

  const face = new FaceRenderer(faceHost, {
    onPet: () => {
      host.pressCarinho();
      root.dispatchEvent(new CustomEvent(PET_EVENT));
    },
    onHold: config.entities.ouvir
      ? () => {
          host.pressOuvir();
          store.set({ listenRequestAt: Date.now() });
        }
      : undefined,
  });

  // A legenda depende do tempo (some depois de alguns segundos); o próprio resultado
  // diz quando renderizar de novo.
  let refreshTimer: number | undefined;
  const timing: SpeechTiming = { delayMs: config.speechDelayMs, tailMs: config.speechTailMs };
  // Começo e fim de cada resposta de conversa, no relógio da página (o do HA pode estar adiantado).
  const unsubscribeReply = store.subscribe((state, previous) => {
    const patch = trackReply(previous.satellite, state.satellite, Date.now());
    if (patch) store.set(patch);
  });
  const render = (): void => {
    const now = Date.now();
    const state = store.get();
    // O satélite já reagiu ao toque longo: o pedido local não vale mais.
    if (state.listenRequestAt && state.satellite !== 'idle') {
      store.set({ listenRequestAt: 0 });
      return;
    }
    const target = deriveFace(state, now, timing);
    face.setState(target.expression, target.talking);
    const decor = deriveDecor(state);
    face.setAccessory(decor.accessory);
    if (decor.banner) banner.textContent = decor.banner;
    banner.classList.toggle('visible', decor.banner !== null);
    if (target.caption) caption.textContent = target.caption;
    caption.classList.toggle('visible', target.caption !== null);
    if (target.heard) heard.textContent = target.heard;
    heard.classList.toggle('visible', target.heard !== null);
    hint.classList.toggle('visible', target.hint && Boolean(config.hint));
    offline.hidden = state.connection !== 'offline';
    clearTimeout(refreshTimer);
    if (target.refreshAt !== null) refreshTimer = window.setTimeout(render, target.refreshAt - now + 50);
  };
  const unsubscribe = store.subscribe(render);
  render();

  if (config.textInput) {
    mountAsk(root, (text) => {
      store.set({ thinking: true });
      host
        .ask(text)
        .then((answer) => answer.trim() || strings.ask.empty)
        .catch((error: unknown) => {
          console.warn('Pergunta por texto falhou:', error);
          return strings.ask.error;
        })
        .then((answer) => store.set({ thinking: false, localText: answer, localTextAt: Date.now() }));
    });
  }

  if (options.dev) {
    void import('./dev/DevPanel.ts').then(({ mountDevPanel }) =>
      mountDevPanel(root, store, face, { describe: host.describe, onResetAuth: host.onResetAuth }),
    );
  }

  return {
    face,
    destroy() {
      unsubscribeReply();
      unsubscribe();
      clearTimeout(refreshTimer);
      face.destroy();
      root.replaceChildren();
    },
  };
}
