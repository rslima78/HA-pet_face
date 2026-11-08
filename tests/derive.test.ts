import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MOODS } from '../src/face/expressions.ts';
import {
  captionDuration,
  LISTEN_REQUEST_MS,
  deriveDecor,
  deriveFace,
  initialViewState,
  normalizeMood,
  normalizeSatellite,
  RESPONSE_FRESH_MS,
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
    assert.deepEqual(face({ mood }), { expression: mood, talking: false, caption: null, hint: true, refreshAt: null });
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
