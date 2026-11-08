// Cartão do HA (`type: custom:pet-face-card`). Roda dentro do frontend do HA e recebe a
// conexão pronta pelo `hass`, então não tem login próprio: funciona igual no navegador,
// no app oficial e no VACA do tablet.
import css from './style.css?inline';
import type { Connection } from 'home-assistant-js-websocket';
import { mountPetView, type MountedPet } from './app.ts';
import { BUILD_ID } from './build.ts';
import { DEFAULT_CONFIG, type PetConfig } from './config.ts';
import { startHaClient, type HaClient } from './ha/client.ts';
import { initialViewState } from './state/derive.ts';
import { createStore } from './state/store.ts';

const CARD_TAG = 'pet-face-card';

/** Configuração do cartão no YAML do painel; tudo opcional. */
interface CardConfig {
  type: string;
  entities?: Partial<PetConfig['entities']>;
  agent_id?: string | null;
  text_input?: boolean;
  /** Dica no pé da tela; null ou "" esconde. */
  hint?: string | null;
  dev?: boolean;
}

interface Hass {
  connection: Connection;
}

const CARD_CSS = `
:host {
  display: block;
}
.pet-root.card {
  /* Num painel "panel", o cartão ocupa a área abaixo do cabeçalho do HA. */
  height: calc(100vh - var(--header-height, 56px));
  min-height: 320px;
}
`;

class PetFaceCard extends HTMLElement {
  private config: PetConfig = DEFAULT_CONFIG;
  private dev = false;
  private connection: Connection | null = null;
  private client: HaClient | null = null;
  private view: MountedPet | null = null;
  private readonly root: HTMLElement;

  constructor() {
    super();
    const shadow = this.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = css + CARD_CSS;
    this.root = document.createElement('div');
    this.root.className = 'pet-root card';
    shadow.append(style, this.root);
  }

  setConfig(config: CardConfig): void {
    this.config = {
      ...DEFAULT_CONFIG,
      entities: { ...DEFAULT_CONFIG.entities, ...config.entities },
      agentId: config.agent_id ?? null,
      textInput: config.text_input ?? true,
      hint: config.hint === undefined ? DEFAULT_CONFIG.hint : config.hint || null,
    };
    this.dev = config.dev === true;
    this.restart();
  }

  set hass(hass: Hass) {
    // O HA chama isto a cada mudança de estado; só a troca de conexão interessa.
    if (hass.connection === this.connection) return;
    this.connection = hass.connection;
    this.restart();
  }

  connectedCallback(): void {
    if (!this.view) this.restart();
  }

  disconnectedCallback(): void {
    this.stop();
  }

  getCardSize(): number {
    return 12;
  }

  getGridOptions(): { columns: string; rows: number } {
    return { columns: 'full', rows: 8 };
  }

  private stop(): void {
    this.client?.close();
    this.view?.destroy();
    this.client = null;
    this.view = null;
  }

  private restart(): void {
    if (!this.isConnected || !this.connection) return;
    this.stop();
    const store = createStore(initialViewState());
    const client = startHaClient({
      connection: this.connection,
      entities: this.config.entities,
      agentId: this.config.agentId,
      store,
    });
    this.client = client;
    this.view = mountPetView(
      this.root,
      this.config,
      store,
      {
        pressCarinho: () => void client.pressCarinho(),
        pressOuvir: () => void client.pressOuvir(),
        ask: (text) => client.ask(text),
        describe: () => client.describe(),
      },
      { dev: this.dev },
    );
  }
}

// O HA pode carregar o módulo mais de uma vez (ex.: ao trocar de painel).
if (!customElements.get(CARD_TAG)) {
  customElements.define(CARD_TAG, PetFaceCard);
  const registry = window as Window & { customCards?: { type: string; name: string; description: string }[] };
  registry.customCards ??= [];
  registry.customCards.push({ type: CARD_TAG, name: 'Pet Face', description: 'Rosto animado do pet' });
  console.info(`pet-face-card ${BUILD_ID}`);
}
