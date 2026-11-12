import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EXPRESSIONS, MOODS } from '../src/face/expressions.ts';
import {
  captionDuration,
  LISTEN_REQUEST_MS,
  deriveDecor,
  deriveFace,
  formatHeard,
  HEARD_MAX,
  initialViewState,
  normalizeMood,
  normalizeReaction,
  normalizeSatellite,
  REACTION_MS,
  RESPONSE_FRESH_MS,
  trackReply,
  type PetViewState,
} from '../src/state/derive.ts';

const NOW = 1_800_000_000_000;

const state = (patch: Partial<PetViewState> = {}): PetViewState => ({
  ...initialViewState(),
  connection: 'online',
  ...patch,
});

const face = (patch: Partial<PetViewState> = {}, now = NOW) => deriveFace(state(patch), now);

test('cada humor vira a expressão de mesmo nome', () => {
  for (const mood of MOODS) {
    assert.deepEqual(face({ mood }), { expression: mood, talking: false, caption: null, heard: null, hint: true, refreshAt: null });
  }
});

test('modo dormir vence o humor quando o satélite está parado', () => {
  assert.equal(face({ mood: 'feliz', sleep: true }).expression, 'dormindo');
});

test('satélite: listening → ouvindo, processing → pensando, mesmo dormindo', () => {
  assert.equal(face({ sleep: true, satellite: 'listening' }).expression, 'ouvindo');
  assert.equal(face({ sleep: true, satellite: 'processing' }).expression, 'pensando');
});

test('pergunta digitada em andamento mostra pensando', () => {
  assert.equal(face({ thinking: true }).expression, 'pensando');
});

test('responding anima a boca, mantém o humor e legenda a resposta recente', () => {
  const result = face({ mood: 'feliz', satellite: 'responding', speech: ' Oi! ', speechAt: NOW - 1000 });
  assert.equal(result.expression, 'feliz');
  assert.equal(result.talking, true);
  assert.equal(result.caption, 'Oi!');
  assert.equal(result.refreshAt, NOW - 1000 + RESPONSE_FRESH_MS);
});

test('responding ignora textos antigos (de conversas anteriores)', () => {
  const old = NOW - RESPONSE_FRESH_MS - 1;
  assert.equal(face({ satellite: 'responding', speech: 'velho', speechAt: old, message: 'velha', messageAt: old }).caption, null);
});

test('responding escolhe o texto mais novo entre resposta e mensagem do HA', () => {
  const greeting = face({
    satellite: 'responding',
    speech: 'resposta anterior',
    speechAt: NOW - 15000,
    message: 'Bom dia!',
    messageAt: NOW - 500,
  });
  assert.equal(greeting.caption, 'Bom dia!');
});

test('responding com humor dormindo ou pensando fala com rosto neutro', () => {
  assert.equal(face({ mood: 'dormindo', satellite: 'responding' }).expression, 'neutro');
  assert.equal(face({ mood: 'pensando', satellite: 'responding' }).expression, 'neutro');
});

test('fora da fala, mensagem nova aparece por um tempo e depois some', () => {
  const message = 'Hehe, que carinho bom!';
  const shown = face({ mood: 'feliz', message, messageAt: NOW - 1000 });
  assert.equal(shown.caption, message);
  assert.equal(shown.talking, false);
  assert.equal(shown.refreshAt, NOW - 1000 + captionDuration(message));
  const later = NOW - 1000 + captionDuration(message) + 1;
  assert.equal(face({ message, messageAt: NOW - 1000 }, later).caption, null);
});

test('mensagem de quando a página abriu (messageAt 0) não aparece', () => {
  assert.equal(face({ message: 'Boa noite!', messageAt: 0 }).caption, null);
});

test('resposta digitada aparece como legenda', () => {
  assert.equal(face({ localText: 'A luz está acesa.', localTextAt: NOW }).caption, 'A luz está acesa.');
});

test('dormindo não mostra legenda', () => {
  assert.equal(face({ sleep: true, message: 'oi', messageAt: NOW }).caption, null);
});

test('captionDuration fica entre 4 e 12 segundos', () => {
  assert.equal(captionDuration('oi'), 4000);
  assert.equal(captionDuration('x'.repeat(500)), 12000);
  assert.ok(captionDuration('x'.repeat(60)) > 4000);
});

test('sem conexão: triste, ou dormindo se estava em modo dormir; ignora o satélite', () => {
  assert.equal(face({ connection: 'offline', satellite: 'responding' }).expression, 'triste');
  assert.equal(face({ connection: 'offline', sleep: true }).expression, 'dormindo');
});

test('satélite indisponível não altera o rosto', () => {
  assert.equal(face({ mood: 'curioso', satellite: 'unavailable' }).expression, 'curioso');
});

test('normalizeMood aceita os humores e troca o resto por neutro', () => {
  assert.equal(normalizeMood('bravo'), 'bravo');
  assert.equal(normalizeMood('unknown'), 'neutro');
  assert.equal(normalizeMood(undefined), 'neutro');
});

test('normalizeSatellite aceita os estados do VACA e troca o resto por idle', () => {
  for (const s of ['idle', 'listening', 'processing', 'responding', 'unavailable']) {
    assert.equal(normalizeSatellite(s), s);
  }
  assert.equal(normalizeSatellite('wake_word'), 'idle');
  assert.equal(normalizeSatellite(undefined), 'idle');
});

test('dica de como falar: só com o pet acordado, parado, online e sem legenda', () => {
  assert.equal(face().hint, true);
  assert.equal(face({ sleep: true }).hint, false);
  assert.equal(face({ connection: 'connecting' }).hint, false);
  assert.equal(face({ connection: 'offline' }).hint, false);
  assert.equal(face({ satellite: 'unavailable' }).hint, false);
  for (const satellite of ['listening', 'processing', 'responding'] as const) {
    assert.equal(face({ satellite }).hint, false, satellite);
  }
  assert.equal(face({ thinking: true }).hint, false);
  assert.equal(face({ message: 'Oi!', messageAt: NOW - 1000 }).hint, false);
  assert.equal(face({ message: 'Oi!', messageAt: NOW - 60_000 }).hint, true);
});

test('toque longo mostra ouvindo na hora e expira se o satélite não responder', () => {
  const asked = { listenRequestAt: NOW - 1000 };
  assert.deepEqual(face(asked), {
    expression: 'ouvindo',
    talking: false,
    caption: null,
    heard: null,
    hint: false,
    refreshAt: NOW - 1000 + LISTEN_REQUEST_MS,
  });
  assert.equal(face({ ...asked, sleep: true }).expression, 'ouvindo');
  assert.equal(face({ listenRequestAt: NOW - LISTEN_REQUEST_MS - 1 }).expression, 'neutro');
  // O satélite assume: pensando e falando vêm dele.
  assert.equal(face({ ...asked, satellite: 'processing' }).expression, 'pensando');
  assert.equal(face({ ...asked, satellite: 'responding' }).talking, true);
});

test('clima não muda o rosto: em repouso fica neutro; calor e frio vêm do humor', () => {
  assert.equal(face({ climate: 'calor' }).expression, 'neutro');
  assert.equal(face({ climate: 'frio', satellite: 'responding' }).expression, 'neutro');
  assert.equal(face({ climate: 'calor', mood: 'calor' }).expression, 'calor');
});

test('faixa: aparece com texto e conexão; some vazia ou offline', () => {
  assert.deepEqual(deriveDecor(state({ accessory: 'festa', banner: ' Parabéns! ' })), {
    accessory: 'festa',
    banner: 'Parabéns!',
  });
  assert.equal(deriveDecor(state({ banner: '   ' })).banner, null);
  assert.equal(deriveDecor(state({ banner: 'Parabéns!', connection: 'offline' })).banner, null);
  // O enfeite continua dormindo.
  assert.equal(deriveDecor(state({ accessory: 'natal', sleep: true })).accessory, 'natal');
});

// ---- Reação passageira (fase 1 do PLANO-BROOKESIA) ----

test('reação aparece sobre o humor e some depois de REACTION_MS', () => {
  const at = NOW - 1000;
  const live = face({ mood: 'calor', reaction: 'feliz', reactionAt: at });
  assert.equal(live.expression, 'feliz');
  assert.equal(live.refreshAt, at + REACTION_MS);
  const gone = face({ mood: 'calor', reaction: 'feliz', reactionAt: at }, at + REACTION_MS);
  assert.equal(gone.expression, 'calor');
  assert.equal(gone.refreshAt, null);
});

test('refreshAt da reação convive com o da legenda: vale o mais cedo', () => {
  const result = face({ reaction: 'feliz', reactionAt: NOW, message: 'Oi!', messageAt: NOW });
  assert.equal(result.caption, 'Oi!');
  assert.equal(result.refreshAt, Math.min(NOW + REACTION_MS, NOW + captionDuration('Oi!')));
});

test('ouvindo, pensando e o toque longo vencem a reação', () => {
  const reaction = { reaction: 'feliz' as const, reactionAt: NOW };
  assert.equal(face({ ...reaction, satellite: 'listening' }).expression, 'ouvindo');
  assert.equal(face({ ...reaction, satellite: 'processing' }).expression, 'pensando');
  assert.equal(face({ ...reaction, thinking: true }).expression, 'pensando');
  assert.equal(face({ ...reaction, listenRequestAt: NOW }).expression, 'ouvindo');
});

test('na fala, a reação é o rosto que fala e dura a resposta inteira', () => {
  const at = NOW - REACTION_MS - 1000;
  const result = face({ mood: 'neutro', satellite: 'responding', reaction: 'surpreso', reactionAt: at });
  assert.equal(result.expression, 'surpreso');
  assert.equal(result.talking, true);
  assert.equal(result.refreshAt, at + RESPONSE_FRESH_MS);
  // Terminada a fala, a reação já passou dos 6 s: volta ao humor.
  assert.equal(face({ mood: 'neutro', reaction: 'surpreso', reactionAt: at }).expression, 'neutro');
});

test('na fala, reação pensando fala com rosto neutro, como o humor pensando', () => {
  assert.equal(face({ satellite: 'responding', reaction: 'pensando', reactionAt: NOW }).expression, 'neutro');
});

test('dormindo e sem conexão ignoram a reação', () => {
  assert.equal(face({ sleep: true, reaction: 'feliz', reactionAt: NOW }).expression, 'dormindo');
  assert.equal(face({ connection: 'offline', reaction: 'feliz', reactionAt: NOW }).expression, 'triste');
});

test('reação sem horário não aparece', () => {
  assert.equal(face({ mood: 'neutro', reaction: 'feliz', reactionAt: 0 }).expression, 'neutro');
});

test('normalizeReaction: nenhuma, desconhecido e indisponível viram null', () => {
  assert.equal(normalizeReaction('feliz'), 'feliz');
  for (const raw of ['nenhuma', 'dormindo', 'ouvindo', 'unavailable', 'unknown', undefined]) {
    assert.equal(normalizeReaction(raw), null);
  }
});

// ---- Expressões novas (fase 2 do PLANO-BROOKESIA) ----

test('sonolento fala com rosto neutro, como dormindo', () => {
  assert.equal(face({ mood: 'sonolento', satellite: 'responding' }).expression, 'neutro');
});

test('reações novas falam com a própria cara', () => {
  for (const reaction of ['confuso', 'piscando', 'apaixonado'] as const) {
    assert.equal(face({ satellite: 'responding', reaction, reactionAt: NOW }).expression, reaction);
  }
});

test('só piscando fecha um olho', () => {
  for (const [name, params] of Object.entries(EXPRESSIONS)) {
    assert.equal(params.wink !== 0, name === 'piscando', name);
  }
});

test('linha "entendi": aparece pensando e falando, entre aspas', () => {
  const heard = { heard: ' que horas são ', heardAt: NOW - 1000 };
  const thinking = face({ ...heard, satellite: 'processing' });
  assert.equal(thinking.expression, 'pensando');
  assert.equal(thinking.heard, '“que horas são”');
  assert.equal(thinking.refreshAt, NOW - 1000 + RESPONSE_FRESH_MS);
  const speaking = face({ ...heard, satellite: 'responding', speech: 'São 10h.', speechAt: NOW - 500 });
  assert.equal(speaking.heard, '“que horas são”');
  assert.equal(speaking.caption, 'São 10h.');
  assert.equal(speaking.refreshAt, NOW - 1000 + RESPONSE_FRESH_MS);
});

test('linha "entendi": some parado, ouvindo, dormindo parado, offline e na pergunta digitada', () => {
  const heard = { heard: 'que horas são', heardAt: NOW - 1000 };
  assert.equal(face(heard).heard, null);
  assert.equal(face({ ...heard, satellite: 'listening' }).heard, null);
  assert.equal(face({ ...heard, sleep: true }).heard, null);
  assert.equal(face({ ...heard, satellite: 'responding', connection: 'offline' }).heard, null);
  assert.equal(face({ ...heard, thinking: true }).heard, null);
  assert.equal(face({ satellite: 'responding', heard: '', heardAt: NOW - 1000 }).heard, null);
});

test('linha "entendi": texto de conversa anterior (mais de 20 s) não aparece', () => {
  const old = { heard: 'pergunta velha', heardAt: NOW - RESPONSE_FRESH_MS - 1, satellite: 'responding' as const };
  assert.equal(face(old).heard, null);
  assert.equal(face({ ...old, heardAt: 0 }).heard, null);
  // Na hora em que a janela fecha, o rosto renderiza de novo e a linha some.
  const fresh = { ...old, heardAt: NOW - 1000 };
  assert.equal(face(fresh).heard, '“pergunta velha”');
  assert.equal(face(fresh, NOW - 1000 + RESPONSE_FRESH_MS).heard, null);
});

test('formatHeard corta texto longo com reticências e junta espaços', () => {
  assert.equal(formatHeard('  oi \t\t pet  '), '“oi pet”');
  const long = formatHeard('a'.repeat(200));
  assert.equal(long.length, HEARD_MAX + 2);
  assert.ok(long.endsWith('…”'));
  assert.equal(formatHeard('b'.repeat(HEARD_MAX)), `“${'b'.repeat(HEARD_MAX)}”`);
});

// Atraso da voz: o HA marca responding antes de o som sair e volta a idle antes de ele acabar.
const TIMING = { delayMs: 3000, tailMs: 1500 };

test('trackReply marca só respostas de conversa (processing → responding)', () => {
  assert.deepEqual(trackReply('processing', 'responding', NOW), { replyAt: NOW, replyEndAt: 0 });
  assert.deepEqual(trackReply('idle', 'responding', NOW), { replyAt: 0, replyEndAt: 0 }, 'aviso do pet não conta');
  assert.deepEqual(trackReply('responding', 'idle', NOW), { replyEndAt: NOW });
  assert.deepEqual(trackReply('idle', 'listening', NOW), { replyAt: 0, replyEndAt: 0 });
  assert.equal(trackReply('idle', 'idle', NOW), null);
});

test('resposta de conversa: pensa até o som sair, depois fala com legenda', () => {
  const reply = { satellite: 'responding' as const, replyAt: NOW, speech: 'Oi!', speechAt: NOW, mood: 'feliz' as const };
  const waiting = deriveFace(state(reply), NOW + 1000, TIMING);
  assert.equal(waiting.expression, 'pensando');
  assert.equal(waiting.talking, false);
  assert.equal(waiting.caption, null);
  assert.equal(waiting.refreshAt, NOW + 3000);
  const talking = deriveFace(state(reply), NOW + 3000, TIMING);
  assert.equal(talking.expression, 'feliz');
  assert.equal(talking.talking, true);
  assert.equal(talking.caption, 'Oi!');
});

test('resposta de conversa: continua falando um pouco depois do idle', () => {
  const ended = { satellite: 'idle' as const, replyAt: NOW - 6000, replyEndAt: NOW, speech: 'Oi!', speechAt: NOW - 6000 };
  const tail = deriveFace(state(ended), NOW + 1000, TIMING);
  assert.equal(tail.talking, true);
  assert.equal(tail.caption, 'Oi!');
  assert.equal(tail.refreshAt, NOW + 1500);
  assert.equal(deriveFace(state(ended), NOW + 1500, TIMING).talking, false);
  // Dormindo: a cauda da fala ainda vence o sono.
  assert.equal(deriveFace(state({ ...ended, sleep: true }), NOW + 1000, TIMING).talking, true);
});

test('resposta curta que volta a idle antes do som: espera e depois fala', () => {
  const quick = { satellite: 'idle' as const, replyAt: NOW, replyEndAt: NOW + 2000 };
  assert.equal(deriveFace(state(quick), NOW + 2500, TIMING).expression, 'pensando');
  assert.equal(deriveFace(state(quick), NOW + 3200, TIMING).talking, true);
  assert.equal(deriveFace(state(quick), NOW + 3500, TIMING).talking, false);
});

test('sem atraso configurado, ou em aviso do pet, a boca segue o satélite', () => {
  const reply = { satellite: 'responding' as const, replyAt: NOW };
  assert.equal(deriveFace(state(reply), NOW + 1000).talking, true);
  assert.equal(deriveFace(state({ satellite: 'responding', replyAt: 0 }), NOW + 1000, TIMING).talking, true);
  assert.equal(deriveFace(state({ satellite: 'idle', replyAt: 0, replyEndAt: NOW }), NOW + 500, TIMING).talking, false);
});

test('nova escuta interrompe a espera da resposta', () => {
  const listening = { satellite: 'listening' as const, replyAt: NOW, replyEndAt: NOW + 1000 };
  assert.equal(deriveFace(state(listening), NOW + 1500, TIMING).expression, 'ouvindo');
});
