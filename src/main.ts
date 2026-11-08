// Página avulsa (index.html): faz o próprio login no HA. Dentro do HA, prefira o cartão
// custom:pet-face-card (src/card.ts), que recebe a conexão pronta.
import './style.css';
import { mountPetView } from './app.ts';
import { loadConfig, type PetConfig } from './config.ts';
import {
  forgetAuth,
  isAuthCallback,
  isEmbedded,
  restoreAuth,
  startOAuth,
  storedHassUrl,
  useLongLivedToken,
} from './ha/auth.ts';
import { startHaClient, type HaClient } from './ha/client.ts';
import type { Auth } from 'home-assistant-js-websocket';
import { strings } from './i18n/pt-BR.ts';
import { initialViewState, type PetViewState } from './state/derive.ts';
import { createStore, type Store } from './state/store.ts';
import { fullscreenOnFirstTouch, keepScreenOn } from './ui/kiosk.ts';
import { showSetup } from './ui/setup.ts';

const params = new URLSearchParams(location.search);

/** ?config=caminho/relativo.json troca o arquivo de configuração (útil com o mock). */
function configUrl(): string {
  const custom = params.get('config');
  return custom && !custom.includes(':') && !custom.startsWith('//') ? custom : 'pet.config.json';
}

function createHaController(config: PetConfig, store: Store<PetViewState>) {
  let client: HaClient | null = null;
  let closeSetup: (() => void) | null = null;

  const connect = (auth: Auth): void => {
    client?.close();
    client = startHaClient({
      auth,
      entities: config.entities,
      agentId: config.agentId,
      store,
      onAuthInvalid: () => {
        forgetAuth();
        client = null;
        openSetup(strings.setup.errors.invalidAuth);
      },
    });
  };

  const openSetup = (error?: string): void => {
    closeSetup?.();
    closeSetup = showSetup({
      defaultUrl: config.hassUrl ?? storedHassUrl() ?? location.origin,
      error,
      onOAuth: (url) => startOAuth(url),
      onToken: (url, token) => {
        closeSetup = null;
        connect(useLongLivedToken(url, token));
      },
      onCancel: client ? () => (closeSetup = null) : undefined,
    });
  };

  return {
    async start(): Promise<void> {
      try {
        // O retorno do OAuth sempre é processado; ?setup=1 só ignora a sessão guardada.
        const auth = params.has('setup') && !isAuthCallback() ? null : await restoreAuth();
        if (auth) connect(auth);
        // Dentro de um painel do HA o login deveria vir do HA em volta; o OAuth aí não funciona.
        else openSetup(isEmbedded() ? strings.setup.errors.embedded : undefined);
      } catch (error) {
        console.error('Falha na autenticação:', error);
        openSetup(strings.setup.errors.oauthFailed);
      }
    },
    openSetup,
    resetAuth(): void {
      client?.close();
      client = null;
      forgetAuth();
      openSetup();
    },
    pressCarinho: () => void client?.pressCarinho(),
    pressOuvir: () => void client?.pressOuvir(),
    ask: (text: string): Promise<string> =>
      client ? client.ask(text) : Promise.reject(new Error('sem conexão com o HA')),
    reconnect: () => client?.reconnect(),
    describe: () => client?.describe() ?? strings.dev.noHa,
  };
}

async function boot(): Promise<void> {
  const config = await loadConfig(configUrl());
  const store = createStore(initialViewState());
  const ha = createHaController(config, store);

  mountPetView(
    document.getElementById('app')!,
    config,
    store,
    {
      pressCarinho: ha.pressCarinho,
      pressOuvir: ha.pressOuvir,
      ask: ha.ask,
      describe: ha.describe,
      onConfigure: () => ha.openSetup(),
      onResetAuth: ha.resetAuth,
    },
    { dev: params.has('dev') },
  );

  // A rede do tablet voltou: não espera o próximo ciclo de reconexão.
  window.addEventListener('online', () => ha.reconnect());
  keepScreenOn();
  if (params.has('kiosk')) fullscreenOnFirstTouch();
  await ha.start();
}

void boot();
