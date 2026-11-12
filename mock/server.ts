// Mock do Home Assistant para desenvolver sem o HA real.
// Fala o subconjunto do protocolo WebSocket que a página usa e expõe uma página de
// controle em http://localhost:<porta>/mock para simular presença, voz e quedas.
// As "automações" daqui imitam, de forma simplificada, as de ha-package/pet.yaml.
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import { WebSocketServer, type WebSocket } from 'ws';
import { DEFAULT_CONFIG } from '../src/config.ts';
import { ACCESSORIES, CLIMATES, MOODS, NO_REACTION, REACTIONS } from '../src/face/expressions.ts';

const HA_VERSION = '2026.10.2';
const PORT = Number(process.env.MOCK_PORT ?? 8124);
const TOKEN = process.env.MOCK_TOKEN ?? 'dev-token';
const E = DEFAULT_CONFIG.entities;
const SATELLITE = 'assist_satellite.pet_mock';
// Imita o sensor TTS do VACA: texto da resposta do agente de conversa.
const SPEECH = 'sensor.pet_mock_tts';
// Imita o sensor STT do VACA: texto reconhecido da fala da pessoa.
const HEARD = 'sensor.pet_mock_stt';
const PRESENCE = 'binary_sensor.camera_da_sala_motion_alarm';
const ARRIVAL = 'binary_sensor.entrada_person';
const LIGHT = 'switch.interruptor_sala_switch_1';
const MESSAGE_MAX = 255;

interface Entity {
  entity_id: string;
  state: string;
  attributes: Record<string, unknown>;
  last_changed: string;
  last_updated: string;
  context: { id: string; parent_id: null; user_id: null };
}

interface Client {
  socket: WebSocket;
  authed: boolean;
  /** id da assinatura → filtro de entidades (null = todas). */
  entitySubs: Map<number, Set<string> | null>;
  eventSubs: Set<number>;
}

interface ClientMessage {
  id?: number;
  type: string;
  [key: string]: unknown;
}

const entities = new Map<string, Entity>();
const clients = new Set<Client>();

function contextId(): string {
  return randomUUID().replace(/-/g, '').slice(0, 26).toUpperCase();
}

function seed(entity_id: string, state: string, attributes: Record<string, unknown> = {}): void {
  const now = new Date().toISOString();
  entities.set(entity_id, {
    entity_id,
    state,
    attributes,
    last_changed: now,
    last_updated: now,
    context: { id: contextId(), parent_id: null, user_id: null },
  });
}

seed(E.mood, 'neutro', { options: [...MOODS], friendly_name: 'Pet humor' });
seed(E.reaction!, NO_REACTION, { options: [NO_REACTION, ...REACTIONS], friendly_name: 'Pet reação' });
seed(E.message, '', { min: 0, max: MESSAGE_MAX, mode: 'text', friendly_name: 'Pet mensagem' });
seed(E.sleep, 'off', { friendly_name: 'Pet dormir' });
seed(E.carinho, 'unknown', { friendly_name: 'Pet carinho' });
seed(E.ouvir!, 'unknown', { friendly_name: 'Pet ouvir' });
seed(E.climate!, 'normal', { options: [...CLIMATES], friendly_name: 'Pet clima' });
seed(E.accessory!, 'nenhum', { options: [...ACCESSORIES], friendly_name: 'Pet acessório' });
seed(E.banner!, '', { min: 0, max: MESSAGE_MAX, mode: 'text', friendly_name: 'Pet faixa' });
seed(SATELLITE, 'idle', { friendly_name: 'Pet (mock)', supported_features: 3 });
seed(SPEECH, '', { friendly_name: 'Pet (mock) TTS' });
seed(HEARD, '', { friendly_name: 'Pet (mock) STT' });
seed(PRESENCE, 'off', { device_class: 'motion', friendly_name: 'Câmera Sala Motion Alarm' });
seed(ARRIVAL, 'off', { device_class: 'motion', friendly_name: 'Campainha Entrada Person' });
seed(LIGHT, 'off', { friendly_name: 'Luz da Sala' });
seed('light.luz_do_fundo', 'off', { friendly_name: 'Lâmpada Fundo' });

function compressed(entity: Entity): Record<string, unknown> {
  const epoch = (iso: string): number => new Date(iso).getTime() / 1000;
  return {
    s: entity.state,
    a: entity.attributes,
    c: entity.context.id,
    lc: epoch(entity.last_changed),
    lu: epoch(entity.last_updated),
  };
}

function send(client: Client, payload: unknown): void {
  if (client.socket.readyState === client.socket.OPEN) client.socket.send(JSON.stringify(payload));
}

function setState(entity_id: string, state: string, attributes?: Record<string, unknown>): void {
  const old = entities.get(entity_id);
  const now = new Date().toISOString();
  const next: Entity = {
    entity_id,
    state,
    attributes: attributes ?? old?.attributes ?? {},
    last_changed: old && old.state === state ? old.last_changed : now,
    last_updated: now,
    context: { id: contextId(), parent_id: null, user_id: null },
  };
  entities.set(entity_id, next);
  for (const client of clients) {
    for (const [id, filter] of client.entitySubs) {
      if (!filter || filter.has(entity_id)) {
        send(client, { id, type: 'event', event: { a: { [entity_id]: compressed(next) } } });
      }
    }
    for (const id of client.eventSubs) {
      send(client, {
        id,
        type: 'event',
        event: {
          event_type: 'state_changed',
          data: { entity_id, old_state: old ?? null, new_state: next },
          origin: 'LOCAL',
          time_fired: now,
          context: next.context,
        },
      });
    }
  }
}

// ---- Simulações (imitam as automações do pacote HA) ----

let scenario: NodeJS.Timeout[] = [];

function runScenario(steps: [number, () => void][]): void {
  scenario.forEach(clearTimeout);
  scenario = steps.map(([delay, step]) => setTimeout(step, delay));
}

function greeting(): string {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return 'Bom dia!';
  if (hour >= 12 && hour < 18) return 'Boa tarde!';
  return 'Boa noite!';
}

function say(text: string, mood: string, durationMs = 3500): [number, () => void][] {
  return [
    [0, () => {
      setState(E.mood, mood);
      setState(E.message, text.slice(0, MESSAGE_MAX));
      setState(SATELLITE, 'responding');
    }],
    [durationMs, () => setState(SATELLITE, 'idle')],
  ];
}

// Como o script pet_reagir: passa por "nenhuma" (para repetir a mesma reação) e limpa depois de 20 s.
let reactionTimer: ReturnType<typeof setTimeout> | undefined;
function react(reaction: string): void {
  clearTimeout(reactionTimer);
  setState(E.reaction!, NO_REACTION);
  setState(E.reaction!, reaction);
  reactionTimer = setTimeout(() => setState(E.reaction!, NO_REACTION), 20000);
}

const simulations = {
  arrive(): void {
    setState(ARRIVAL, 'on');
    setState(PRESENCE, 'on');
    setState(E.sleep, 'off');
    runScenario([
      ...say(`${greeting()} Que bom te ver.`, 'curioso'),
      [8000, () => setState(E.mood, 'neutro')],
      [2000, () => setState(ARRIVAL, 'off')],
    ]);
  },
  leave(): void {
    setState(PRESENCE, 'off');
    // No HA real são N minutos; aqui 10 s para testar.
    runScenario([[10000, () => {
      setState(E.mood, 'dormindo');
      setState(E.sleep, 'on');
    }]]);
  },
  voice(answer?: string, question?: string): void {
    setState(E.sleep, 'off');
    setState(SATELLITE, 'listening');
    runScenario([
      [2200, () => {
        // Como no VACA: o texto reconhecido chega quando a escuta termina.
        setState(HEARD, (question || 'Que horas são?').slice(0, MESSAGE_MAX));
        setState(SATELLITE, 'processing');
      }],
      [3400, () => {
        // Como no HA real: a resposta vai para o sensor do satélite, não para pet_message.
        setState(SPEECH, (answer || 'Claro! Já está feito.').slice(0, MESSAGE_MAX));
        setState(SATELLITE, 'responding');
      }],
      [7400, () => setState(SATELLITE, 'idle')],
    ]);
  },
  carinho(): void {
    // Mesmas frases da automação pet_carinho do pacote HA; a cara feliz é reação passageira.
    const replies = ['Hehe, que carinho bom!', 'Adoro quando você faz isso.', 'De novo, de novo!', 'Obrigado!'];
    setState(E.sleep, 'off');
    react('feliz');
    setState(E.message, replies[Math.floor(Math.random() * replies.length)]);
  },
  drop(): void {
    for (const client of clients) client.socket.close();
  },
};

// ---- Serviços ----

class ServiceError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

function targetIds(data: Record<string, unknown>, target: Record<string, unknown>): string[] {
  const raw = target.entity_id ?? data.entity_id;
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  return list.map(String);
}

function callService(domain: string, service: string, data: Record<string, unknown>, ids: string[]): void {
  const require = (id: string): Entity => {
    const entity = entities.get(id);
    if (!entity) throw new ServiceError('not_found', `Entidade ${id} não existe no mock`);
    return entity;
  };
  const key = `${domain}.${service}`;
  if (key === 'script.pet_definir_emocao' || key === 'script.pet_reagir') {
    const reaction = String(data.emocao ?? '');
    if (!(REACTIONS as readonly string[]).includes(reaction)) {
      throw new ServiceError('invalid_format', `Emoção inválida: ${reaction}`);
    }
    if (key === 'script.pet_definir_emocao') setState(E.sleep, 'off');
    react(reaction);
    return;
  }
  for (const id of ids) {
    const entity = require(id);
    switch (key) {
      case 'input_select.select_option': {
        const option = String(data.option);
        const options = entity.attributes.options as string[];
        if (!options.includes(option)) throw new ServiceError('invalid_format', `Opção inválida: ${option}`);
        setState(id, option);
        break;
      }
      case 'input_text.set_value':
        setState(id, String(data.value ?? '').slice(0, MESSAGE_MAX));
        break;
      case 'input_button.press':
        setState(id, new Date().toISOString());
        if (id === E.carinho) simulations.carinho();
        // Como a automação pet_ouvir: o satélite começa a ouvir.
        if (id === E.ouvir) simulations.voice();
        break;
      case 'input_boolean.turn_on':
      case 'switch.turn_on':
      case 'light.turn_on':
        setState(id, 'on');
        break;
      case 'input_boolean.turn_off':
      case 'switch.turn_off':
      case 'light.turn_off':
        setState(id, 'off');
        break;
      case 'input_boolean.toggle':
      case 'switch.toggle':
      case 'light.toggle':
        setState(id, entity.state === 'on' ? 'off' : 'on');
        break;
      default:
        throw new ServiceError('not_found', `Serviço ${key} não existe no mock`);
    }
  }
}

function conversation(text: string): Record<string, unknown> {
  const normalized = text.toLowerCase();
  let speech: string;
  if (normalized.includes('luz')) {
    const on = !normalized.includes('apag') && !normalized.includes('deslig');
    setState(LIGHT, on ? 'on' : 'off');
    speech = on ? 'Pronto, acendi a luz da sala.' : 'Pronto, apaguei a luz da sala.';
  } else {
    speech = `Você disse: ${text}`;
  }
  return {
    response: {
      speech: { plain: { speech, extra_data: null } },
      card: {},
      language: 'pt-BR',
      response_type: 'action_done',
      data: { targets: [], success: [], failed: [] },
    },
    conversation_id: contextId(),
    continue_conversation: false,
  };
}

// ---- Protocolo WebSocket ----

function handle(client: Client, msg: ClientMessage): void {
  const id = msg.id ?? 0;
  const ok = (result: unknown = null): void => send(client, { id, type: 'result', success: true, result });
  const fail = (code: string, message: string): void =>
    send(client, { id, type: 'result', success: false, error: { code, message } });

  if (!client.authed) {
    if (msg.type === 'auth' && msg.access_token === TOKEN) {
      client.authed = true;
      send(client, { type: 'auth_ok', ha_version: HA_VERSION });
    } else {
      send(client, { type: 'auth_invalid', message: 'Token inválido (mock)' });
      client.socket.close();
    }
    return;
  }

  switch (msg.type) {
    case 'supported_features':
      return ok();
    case 'ping':
      return send(client, { id, type: 'pong' });
    case 'get_states':
      return ok([...entities.values()]);
    case 'get_config':
      return ok({
        version: HA_VERSION,
        location_name: 'Casa (mock)',
        time_zone: 'America/Bahia',
        language: 'pt-BR',
        components: ['input_select', 'input_text', 'input_boolean', 'input_button', 'assist_satellite'],
        unit_system: { length: 'km', mass: 'g', temperature: '°C', volume: 'L' },
        state: 'RUNNING',
      });
    case 'get_services':
      return ok({});
    case 'subscribe_entities': {
      const filter = Array.isArray(msg.entity_ids) ? new Set(msg.entity_ids.map(String)) : null;
      client.entitySubs.set(id, filter);
      ok();
      const added: Record<string, unknown> = {};
      for (const entity of entities.values()) {
        if (!filter || filter.has(entity.entity_id)) added[entity.entity_id] = compressed(entity);
      }
      return send(client, { id, type: 'event', event: { a: added } });
    }
    case 'subscribe_events':
      if (msg.event_type && msg.event_type !== 'state_changed') return ok();
      client.eventSubs.add(id);
      return ok();
    case 'unsubscribe_events': {
      const subscription = Number(msg.subscription);
      client.entitySubs.delete(subscription);
      client.eventSubs.delete(subscription);
      return ok();
    }
    case 'call_service':
      try {
        const data = (msg.service_data ?? {}) as Record<string, unknown>;
        const target = (msg.target ?? {}) as Record<string, unknown>;
        callService(String(msg.domain), String(msg.service), data, targetIds(data, target));
        return ok({ context: { id: contextId(), parent_id: null, user_id: null } });
      } catch (error) {
        if (error instanceof ServiceError) return fail(error.code, error.message);
        throw error;
      }
    case 'conversation/process':
      return ok(conversation(String(msg.text ?? '')));
    default:
      return fail('unknown_command', `Comando ${msg.type} não existe no mock`);
  }
}

// ---- HTTP: página de controle e endpoints ----

const CONTROL_PAGE = `<!doctype html><html lang="pt-BR"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Mock HA</title>
<style>body{font:16px system-ui;margin:16px;background:#111;color:#eee}button,select,input{font:inherit;padding:8px;margin:4px 0}
button{min-width:150px}section{margin-bottom:16px}pre{background:#000;padding:8px;overflow:auto;max-height:40vh}</style>
<h1>Mock do Home Assistant</h1>
<section><button data-sim="arrive">Alguém chegou</button> <button data-sim="leave">Todos saíram</button>
<button data-sim="voice">Conversa por voz</button> <button data-sim="drop">Derrubar conexões</button></section>
<section><select id="mood">${MOODS.map((m) => `<option>${m}</option>`).join('')}</select>
<button id="setMood">Definir humor</button></section>
<section><input id="msg" placeholder="Mensagem do pet" size="40"><button id="setMsg">Definir mensagem</button></section>
<pre id="states"></pre>
<script>
const post=(p,b)=>fetch(p,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(b||{})}).then(refresh);
document.querySelectorAll('[data-sim]').forEach(b=>b.onclick=()=>post('/mock/'+b.dataset.sim));
setMood.onclick=()=>post('/mock/set',{entity_id:'${E.mood}',state:mood.value});
setMsg.onclick=()=>post('/mock/set',{entity_id:'${E.message}',state:msg.value});
function refresh(){fetch('/mock/states').then(r=>r.json()).then(s=>states.textContent=s.map(e=>e.entity_id+' = '+e.state).join('\\n'))}
refresh();setInterval(refresh,1000);
</script></html>`;

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  let body = '';
  for await (const chunk of req) body += chunk;
  return body ? (JSON.parse(body) as Record<string, unknown>) : {};
}

async function handleHttp(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const reply = (status: number, body: unknown, type = 'application/json'): void => {
    res.writeHead(status, { 'content-type': `${type}; charset=utf-8` });
    res.end(typeof body === 'string' ? body : JSON.stringify(body));
  };
  const path = (req.url ?? '/').split('?')[0];
  if (req.method === 'GET' && (path === '/' || path === '/mock')) return reply(200, CONTROL_PAGE, 'text/html');
  if (req.method === 'GET' && path === '/mock/states') return reply(200, [...entities.values()]);
  if (req.method !== 'POST') return reply(404, { error: 'not_found' });

  const body = await readJson(req);
  switch (path) {
    case '/mock/set':
      setState(String(body.entity_id), String(body.state), body.attributes as Record<string, unknown> | undefined);
      return reply(200, { ok: true });
    case '/mock/arrive':
    case '/mock/leave':
    case '/mock/drop':
      simulations[path.slice(6) as 'arrive' | 'leave' | 'drop']();
      return reply(200, { ok: true });
    case '/mock/voice':
      simulations.voice(
        typeof body.answer === 'string' ? body.answer : undefined,
        typeof body.question === 'string' ? body.question : undefined,
      );
      return reply(200, { ok: true });
    default:
      return reply(404, { error: 'not_found' });
  }
}

const server = createServer((req, res) => {
  handleHttp(req, res).catch((error: unknown) => {
    res.writeHead(400, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: String(error) }));
  });
});
const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (req, socket, head) => {
  if (!req.url?.startsWith('/api/websocket')) return socket.destroy();
  wss.handleUpgrade(req, socket, head, (ws) => {
    const client: Client = { socket: ws, authed: false, entitySubs: new Map(), eventSubs: new Set() };
    clients.add(client);
    send(client, { type: 'auth_required', ha_version: HA_VERSION });
    ws.on('message', (data) => {
      try {
        const parsed = JSON.parse(String(data)) as ClientMessage | ClientMessage[];
        for (const msg of Array.isArray(parsed) ? parsed : [parsed]) handle(client, msg);
      } catch (error) {
        console.error('Mensagem inválida:', error);
      }
    });
    ws.on('close', () => clients.delete(client));
  });
});

server.listen(PORT, () => {
  console.log(`Mock do Home Assistant em http://localhost:${PORT} (token: ${TOKEN})`);
  console.log(`Controle: http://localhost:${PORT}/mock`);
});
