// Conexão com o HA: assina só as entidades do pet, alimenta o store e envia o carinho.
// Não toca em window/DOM, para poder ser testado no Node contra o mock.
import {
  callService,
  createConnection,
  ERR_INVALID_AUTH,
  type Auth,
  type Connection,
} from 'home-assistant-js-websocket';
import type { PetConfig } from '../config.ts';
import type { PetViewState } from '../state/derive.ts';
import type { Store } from '../state/store.ts';
import { applyEntityDiff, mapStates, watchedEntityIds, type EntityDiffEvent, type StateMap } from './entities.ts';

interface ConversationResult {
  response?: { speech?: { plain?: { speech?: string } } };
  conversation_id?: string;
}

export interface HaClientOptions {
  /** Login para criar a própria conexão (página avulsa). */
  auth?: Auth;
  /**
   * Conexão já existente, ex.: a do frontend do HA quando o pet roda como cartão.
   * Quem a criou cuida de reconectar e fechar; aqui só se assina e se remove a assinatura.
   */
  connection?: Connection;
  entities: PetConfig['entities'];
  agentId?: string | null;
  store: Store<PetViewState>;
  /** Token recusado ou revogado; a página volta ao setup. */
  onAuthInvalid?: () => void;
  /** Tempo sem conexão antes de mostrar o rosto offline; evita piscar em quedas curtas. */
  offlineGraceMs?: number;
  pingIntervalMs?: number;
  pingTimeoutMs?: number;
}

export interface HaClient {
  pressCarinho(): Promise<void>;
  /** Pede ao HA para o satélite ouvir (input_button do toque longo). */
  pressOuvir(): Promise<void>;
  /** Pergunta por texto ao agente de conversa; devolve a resposta falada. */
  ask(text: string): Promise<string>;
  /** Força uma reconexão (ex.: a rede do tablet voltou). */
  reconnect(): void;
  /** Resumo para o painel dev. */
  describe(): string;
  close(): void;
}

export function startHaClient(options: HaClientOptions): HaClient {
  const { auth, entities, store, onAuthInvalid } = options;
  const graceMs = options.offlineGraceMs ?? 5000;
  const pingIntervalMs = options.pingIntervalMs ?? 30000;
  const pingTimeoutMs = options.pingTimeoutMs ?? 10000;

  let conn: Connection | null = null;
  let closed = false;
  let states: StateMap = {};
  let missing: string[] = [];
  let reportedMissing = '';
  let graceTimer: ReturnType<typeof setTimeout> | undefined;
  let conversationId: string | null = null;

  const markConnecting = (): void => {
    if (store.get().connection !== 'offline') store.set({ connection: 'connecting' });
    graceTimer ??= setTimeout(() => store.set({ connection: 'offline' }), graceMs);
  };
  const markOnline = (): void => {
    clearTimeout(graceTimer);
    graceTimer = undefined;
    store.set({ connection: 'online' });
  };
  const authFailed = (): void => {
    if (closed) return;
    client.close();
    onAuthInvalid?.();
  };
  const onReconnectError = (_conn: Connection, error: unknown): void => {
    if (error === ERR_INVALID_AUTH) authFailed();
  };

  const handleDiff = (event: EntityDiffEvent): void => {
    states = applyEntityDiff(states, event);
    const result = mapStates(states, entities, Date.now());
    missing = result.missing;
    store.set(result.patch);
    const key = missing.join(',');
    if (key && key !== reportedMissing) {
      console.warn('Entidades do pet não encontradas no HA:', missing);
    }
    reportedMissing = key;
  };

  const owned = !options.connection;
  let unsubscribe: Promise<() => Promise<void>> | null = null;

  const attach = (connection: Connection): void => {
    conn = connection;
    connection.addEventListener('ready', markOnline);
    connection.addEventListener('disconnected', markConnecting);
    connection.addEventListener('reconnect-error', onReconnectError);
    // subscribeMessage refaz a assinatura sozinho a cada reconexão.
    unsubscribe = connection.subscribeMessage<EntityDiffEvent>(handleDiff, {
      type: 'subscribe_entities',
      entity_ids: watchedEntityIds(entities),
    });
    if (connection.connected) markOnline();
  };

  // A conexão pode morrer sem evento de fechamento (Wi-Fi caiu); o ping detecta isso.
  // Só na conexão própria: a do frontend do HA já tem o seu.
  const pingTimer = owned
    ? setInterval(() => {
        if (!conn?.connected) return;
        const timeout = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('ping sem resposta')), pingTimeoutMs),
        );
        Promise.race([conn.ping(), timeout]).catch(() => conn?.reconnect(true));
      }, pingIntervalMs)
    : undefined;

  markConnecting();
  if (options.connection) {
    attach(options.connection);
  } else if (auth) {
    createConnection({ auth, setupRetry: -1 }).then(
      (connection) => {
        if (closed) connection.close();
        else attach(connection);
      },
      (error: unknown) => {
        if (error === ERR_INVALID_AUTH) authFailed();
        else console.error('Falha ao conectar ao HA:', error);
      },
    );
  }

  const client: HaClient = {
    async pressCarinho() {
      if (!conn?.connected) return;
      try {
        await callService(conn, 'input_button', 'press', undefined, { entity_id: entities.carinho });
      } catch (error) {
        console.warn('Não foi possível enviar o carinho ao HA:', error);
      }
    },
    async pressOuvir() {
      if (!conn?.connected || !entities.ouvir) return;
      try {
        await callService(conn, 'input_button', 'press', undefined, { entity_id: entities.ouvir });
      } catch (error) {
        console.warn('Não foi possível pedir ao HA para ouvir:', error);
      }
    },
    async ask(text) {
      if (!conn?.connected) throw new Error('sem conexão com o HA');
      const result = await conn.sendMessagePromise<ConversationResult>({
        type: 'conversation/process',
        text,
        language: 'pt-BR',
        ...(options.agentId ? { agent_id: options.agentId } : {}),
        // Mantém o contexto entre perguntas seguidas ("e na cozinha?").
        ...(conversationId ? { conversation_id: conversationId } : {}),
      });
      conversationId = result.conversation_id ?? null;
      return result.response?.speech?.plain?.speech ?? '';
    },
    reconnect() {
      if (owned) conn?.reconnect(true);
    },
    describe() {
      const version = conn?.haVersion ? `HA ${conn.haVersion}` : 'HA —';
      return missing.length ? `${version} · faltam: ${missing.join(', ')}` : version;
    },
    close() {
      closed = true;
      clearInterval(pingTimer);
      clearTimeout(graceTimer);
      if (!conn) return;
      if (owned) {
        conn.close();
        return;
      }
      conn.removeEventListener('ready', markOnline);
      conn.removeEventListener('disconnected', markConnecting);
      conn.removeEventListener('reconnect-error', onReconnectError);
      void unsubscribe?.then((unsub) => unsub()).catch(() => undefined);
    },
  };
  return client;
}
