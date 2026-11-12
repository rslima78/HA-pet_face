// Sobe o mock numa porta própria e o exercita com a biblioteca oficial
// home-assistant-js-websocket e com o cliente da página (src/ha/client.ts).
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import {
  callService,
  createConnection,
  createLongLivedTokenAuth,
  ERR_INVALID_AUTH,
  subscribeEntities,
  type HassEntities,
} from 'home-assistant-js-websocket';
import { DEFAULT_CONFIG } from '../src/config.ts';
import { startHaClient } from '../src/ha/client.ts';
import { initialViewState } from '../src/state/derive.ts';
import { createStore } from '../src/state/store.ts';

const PORT = 8199;
const URL = `http://127.0.0.1:${PORT}`;
const entities = {
  ...DEFAULT_CONFIG.entities,
  satellite: 'assist_satellite.pet_mock',
  speech: 'sensor.pet_mock_tts',
  heard: 'sensor.pet_mock_stt',
};

function startMock(): Promise<ChildProcess> {
  const child = spawn(process.execPath, ['mock/server.ts'], {
    env: { ...process.env, MOCK_PORT: String(PORT) },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('mock não subiu')), 10000);
    child.stdout!.on('data', (chunk: Buffer) => {
      if (String(chunk).includes('Mock do Home Assistant')) {
        clearTimeout(timer);
        resolve(child);
      }
    });
  });
}

function stopMock(child: ChildProcess): Promise<void> {
  return new Promise((resolve) => {
    child.once('exit', () => resolve());
    child.kill();
  });
}

async function until(check: () => boolean, label: string, timeoutMs = 3000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!check()) {
    if (Date.now() > deadline) throw new Error(`Tempo esgotado esperando: ${label}`);
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

const post = (path: string, body: unknown = {}): Promise<Response> =>
  fetch(`${URL}${path}`, { method: 'POST', body: JSON.stringify(body) });

let mock = await startMock();
try {
  // ---- Biblioteca oficial contra o mock ----
  const conn = await createConnection({ auth: createLongLivedTokenAuth(URL, 'dev-token') });
  let states: HassEntities = {};
  const unsubscribe = subscribeEntities(conn, (next) => {
    states = next;
  });
  await until(() => states['input_select.pet_mood']?.state === 'neutro', 'estado inicial');
  console.log('✓ autenticação e subscribe_entities');

  await callService(conn, 'input_select', 'select_option', { option: 'bravo' }, {
    entity_id: 'input_select.pet_mood',
  });
  await until(() => states['input_select.pet_mood']?.state === 'bravo', 'humor bravo');
  console.log('✓ call_service altera estado e o evento chega');

  const reply = await conn.sendMessagePromise<{ response: { speech: { plain: { speech: string } } } }>({
    type: 'conversation/process',
    text: 'acende a luz da sala',
    language: 'pt-BR',
  });
  assert.match(reply.response.speech.plain.speech, /acendi/);
  console.log('✓ conversation/process');

  await assert.rejects(
    callService(conn, 'input_select', 'select_option', { option: 'inexistente' }, {
      entity_id: 'input_select.pet_mood',
    }),
  );
  console.log('✓ serviço inválido retorna erro');
  unsubscribe();
  conn.close();

  // ---- Cliente da página ----
  const store = createStore(initialViewState());
  const client = startHaClient({
    auth: createLongLivedTokenAuth(URL, 'dev-token'),
    entities,
    store,
    onAuthInvalid: () => assert.fail('token válido foi recusado'),
    offlineGraceMs: 300,
    pingIntervalMs: 60000,
  });
  await until(() => store.get().connection === 'online' && store.get().mood === 'bravo', 'cliente online');
  console.log('✓ cliente conecta e lê o humor atual');

  await post('/mock/set', { entity_id: entities.mood, state: 'triste' });
  await until(() => store.get().mood === 'triste', 'humor triste');
  await post('/mock/voice', { answer: 'Pronto, feito.', question: 'Acende a luz' });
  await until(() => store.get().satellite === 'listening', 'satélite ouvindo');
  await until(
    () => store.get().satellite === 'responding' && store.get().speech === 'Pronto, feito.' && store.get().speechAt > 0 &&
      store.get().heard === 'Acende a luz' && store.get().heardAt > 0,
    'resposta falada no sensor',
    6000,
  );
  console.log('✓ cliente recebe humor, satélite, texto entendido e texto da resposta em tempo real');

  assert.match(await client.ask('acende a luz da sala'), /acendi/);
  console.log('✓ pergunta por texto pelo cliente');

  await client.pressCarinho();
  await until(
    () => store.get().reaction === 'feliz' && store.get().reactionAt > 0 && store.get().message !== '',
    'reação ao carinho',
  );
  console.log('✓ carinho aperta o input_button');

  await client.pressOuvir();
  await until(() => store.get().satellite === 'listening', 'satélite ouvindo após o toque longo');
  await until(() => store.get().satellite === 'idle', 'fim da conversa simulada', 10000);
  console.log('✓ toque longo aperta pet_ouvir e o satélite ouve');

  await stopMock(mock);
  await until(() => store.get().connection === 'offline', 'rosto offline');
  console.log('✓ queda do HA vira offline após a carência');

  mock = await startMock();
  await until(() => store.get().connection === 'online', 'reconexão', 15000);
  await until(() => store.get().mood === 'neutro', 'estado relido após reconectar');
  console.log('✓ reconecta sozinho e reassina as entidades');
  client.close();

  let rejected = false;
  const bad = startHaClient({
    auth: createLongLivedTokenAuth(URL, 'errado'),
    entities,
    store: createStore(initialViewState()),
    onAuthInvalid: () => {
      rejected = true;
    },
  });
  await until(() => rejected, 'token inválido');
  bad.close();
  await assert.rejects(createConnection({ auth: createLongLivedTokenAuth(URL, 'errado') }), (error) => {
    assert.equal(error, ERR_INVALID_AUTH);
    return true;
  });
  console.log('✓ token inválido é recusado e avisa a página');

  console.log('smoke ok');
} finally {
  mock.kill();
}
