// Painel de desenvolvimento (?dev=1). Força estados só na tela local, sem escrever no HA.
import { BUILD_ID } from '../build.ts';
import { ACCESSORIES, CLIMATES, MOODS } from '../face/expressions.ts';
import type { FaceRenderer } from '../face/FaceRenderer.ts';
import { strings } from '../i18n/pt-BR.ts';
import { PET_EVENT } from '../events.ts';
import { CONNECTION_STATES, SATELLITE_STATES, type PetViewState } from '../state/derive.ts';
import type { Store } from '../state/store.ts';

function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

interface Group {
  update(state: PetViewState): void;
}

function buttonGroup<V extends string>(
  parent: HTMLElement,
  title: string,
  values: readonly V[],
  label: (value: V) => string,
  isActive: (state: PetViewState, value: V) => boolean,
  pick: (value: V) => void,
): Group {
  parent.append(h('h3', undefined, title));
  const grid = h('div', 'dev-grid');
  parent.append(grid);
  const buttons = values.map((value) => {
    const button = h('button', undefined, label(value));
    button.type = 'button';
    button.addEventListener('click', () => pick(value));
    grid.append(button);
    return { value, button };
  });
  return {
    update(state) {
      for (const { value, button } of buttons) button.classList.toggle('active', isActive(state, value));
    },
  };
}

export interface DevPanelHooks {
  /** Linha de diagnóstico da conexão (versão do HA, entidades faltando). */
  describe(): string;
  /** Ausente no cartão do HA, que não tem login próprio. */
  onResetAuth?: () => void;
}

// Com o HA conectado, o próximo evento dele sobrescreve o que for forçado aqui.
export function mountDevPanel(
  container: HTMLElement,
  store: Store<PetViewState>,
  face: FaceRenderer,
  hooks: DevPanelHooks,
): void {
  const panel = h('aside', 'dev-panel');
  const toggle = h('button', 'dev-toggle', strings.dev.title);
  toggle.type = 'button';
  toggle.addEventListener('click', () => panel.classList.toggle('collapsed'));
  panel.append(toggle);

  let conversation: number[] = [];
  const cancelConversation = (): void => {
    conversation.forEach((id) => clearTimeout(id));
    conversation = [];
  };

  const groups: Group[] = [
    buttonGroup(panel, strings.dev.mood, MOODS, (m) => strings.moods[m], (s, m) => s.mood === m, (mood) =>
      store.set({ mood }),
    ),
    buttonGroup(
      panel,
      strings.dev.climate,
      CLIMATES,
      (v) => strings.climates[v],
      (s, v) => s.climate === v,
      (climate) => store.set({ climate }),
    ),
    buttonGroup(
      panel,
      strings.dev.accessory,
      ACCESSORIES,
      (v) => strings.accessories[v],
      (s, v) => s.accessory === v,
      (accessory) => store.set({ accessory }),
    ),
    buttonGroup(
      panel,
      strings.dev.satellite,
      SATELLITE_STATES,
      (v) => strings.satellite[v],
      (s, v) => s.satellite === v,
      (satellite) => {
        cancelConversation();
        store.set({ satellite });
      },
    ),
    buttonGroup(
      panel,
      strings.dev.sleep,
      ['on', 'off'] as const,
      (v) => strings.dev.sleepState[v],
      (s, v) => s.sleep === (v === 'on'),
      (v) => store.set({ sleep: v === 'on' }),
    ),
    buttonGroup(
      panel,
      strings.dev.connection,
      CONNECTION_STATES,
      (v) => strings.connection[v],
      (s, v) => s.connection === v,
      (connection) => store.set({ connection }),
    ),
  ];

  panel.append(h('h3', undefined, strings.dev.message));
  const message = h('input');
  message.value = store.get().message;
  message.addEventListener('input', () => store.set({ message: message.value, messageAt: Date.now() }));
  panel.append(message);

  panel.append(h('h3', undefined, strings.dev.banner));
  const banner = h('input');
  banner.value = store.get().banner;
  banner.addEventListener('input', () => store.set({ banner: banner.value }));
  panel.append(banner);

  const actions = h('div', 'dev-row');
  const simulate = h('button', undefined, strings.dev.simulate);
  simulate.type = 'button';
  simulate.addEventListener('click', () => {
    // Mesmo ciclo observado no histórico do VACA: listening → processing → responding → idle.
    cancelConversation();
    store.set({ satellite: 'listening' });
    conversation = [
      window.setTimeout(() => store.set({ satellite: 'processing' }), 2200),
      window.setTimeout(() => {
        const text = message.value.trim() || strings.dev.sampleAnswer;
        store.set({ speech: text, speechAt: Date.now(), satellite: 'responding' });
      }, 3400),
      window.setTimeout(() => store.set({ satellite: 'idle' }), 7400),
    ];
  });
  const pet = h('button', undefined, strings.dev.pet);
  pet.type = 'button';
  pet.addEventListener('click', () => face.pet());
  actions.append(simulate, pet);
  panel.append(actions);

  if (hooks.onResetAuth) {
    const reset = h('button', undefined, strings.dev.resetAuth);
    reset.type = 'button';
    reset.addEventListener('click', hooks.onResetAuth);
    const resetRow = h('div', 'dev-row');
    resetRow.append(reset);
    panel.append(resetRow);
  }

  const status = h('div', 'dev-status');
  panel.append(status);
  let petCount = 0;
  const renderStatus = (): void => {
    status.textContent = `${strings.dev.fps(Math.round(face.fps))} · ${strings.dev.petCount(petCount)} · ${hooks.describe()} · v${BUILD_ID}`;
  };
  container.addEventListener(PET_EVENT, () => {
    petCount++;
    renderStatus();
  });
  window.setInterval(renderStatus, 500);

  const update = (state: PetViewState): void => {
    groups.forEach((group) => group.update(state));
    if (document.activeElement !== message) message.value = state.message;
  };
  store.subscribe(update);
  update(store.get());
  renderStatus();

  container.append(panel);
}
