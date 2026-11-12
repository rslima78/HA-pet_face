import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULT_CONFIG } from '../src/config.ts';
import { normalizeHassUrl } from '../src/ha/auth.ts';
import { applyEntityDiff, mapStates, watchedEntityIds, type StateMap } from '../src/ha/entities.ts';

const E = {
  ...DEFAULT_CONFIG.entities,
  satellite: 'assist_satellite.tablet',
  speech: 'sensor.tablet_tts',
  heard: 'sensor.tablet_stt',
};
const NOW = 1_800_000_000_000;
const at = (s: string, changedAt = 0) => ({ s, changedAt });

test('applyEntityDiff: adiciona, altera e remove, guardando quando mudou', () => {
  let states = applyEntityDiff({}, {
    a: { 'input_select.pet_mood': { s: 'neutro', a: {}, lc: 100 }, 'input_boolean.pet_sleep': { s: 'off', lc: 50 } },
  });
  assert.deepEqual(states, {
    'input_select.pet_mood': at('neutro', 100_000),
    'input_boolean.pet_sleep': at('off', 50_000),
  });

  states = applyEntityDiff(states, { c: { 'input_select.pet_mood': { '+': { s: 'feliz', lc: 200 } } } });
  assert.deepEqual(states['input_select.pet_mood'], at('feliz', 200_000));

  // Mudança só de atributos não mexe no estado nem no horário.
  states = applyEntityDiff(states, { c: { 'input_select.pet_mood': { '+': { a: { icon: 'x' }, lu: 300 } } } });
  assert.deepEqual(states['input_select.pet_mood'], at('feliz', 200_000));

  states = applyEntityDiff(states, { r: ['input_boolean.pet_sleep'] });
  assert.deepEqual(Object.keys(states), ['input_select.pet_mood']);
});

test('applyEntityDiff não altera o objeto original', () => {
  const original: StateMap = { 'input_select.pet_mood': at('neutro') };
  applyEntityDiff(original, { a: { 'input_select.pet_mood': { s: 'bravo', lc: 1 } } });
  assert.equal(original['input_select.pet_mood'].s, 'neutro');
});

test('mapStates traduz as entidades do contrato', () => {
  const { patch, missing } = mapStates(
    {
      'input_select.pet_mood': at('curioso'),
      'input_select.pet_reacao': at('feliz', NOW - 500),
      'input_text.pet_message': at('Oi!', NOW - 2000),
      'input_boolean.pet_sleep': at('on'),
      'input_button.pet_carinho': at('2026-10-22T10:00:00+00:00'),
      'input_button.pet_ouvir': at('unknown'),
      'assist_satellite.tablet': at('listening'),
      'sensor.tablet_tts': at('A luz está acesa.', NOW - 1000),
      'sensor.tablet_stt': at('A luz está acesa?', NOW - 1500),
      'input_select.pet_clima': at('calor'),
      'input_select.pet_acessorio': at('festa'),
      'input_text.pet_faixa': at('Parabéns!'),
    },
    E,
    NOW,
  );
  assert.deepEqual(patch, {
    mood: 'curioso',
    reaction: 'feliz',
    reactionAt: NOW - 500,
    climate: 'calor',
    accessory: 'festa',
    banner: 'Parabéns!',
    sleep: true,
    message: 'Oi!',
    messageAt: NOW - 2000,
    satellite: 'listening',
    speech: 'A luz está acesa.',
    speechAt: NOW - 1000,
    heard: 'A luz está acesa?',
    heardAt: NOW - 1500,
  });
  assert.deepEqual(missing, []);
});

test('mapStates: horário no futuro (relógio do tablet atrasado) vira agora', () => {
  const { patch } = mapStates({ 'input_text.pet_message': at('Oi!', NOW + 60_000) }, E, NOW);
  assert.equal(patch.messageAt, NOW);
});

test('mapStates: entidades ausentes viram padrões e são listadas', () => {
  const { patch, missing } = mapStates({}, E, NOW);
  assert.deepEqual(patch, {
    mood: 'neutro',
    reaction: null,
    reactionAt: 0,
    climate: 'normal',
    accessory: 'nenhum',
    banner: '',
    sleep: false,
    message: '',
    messageAt: 0,
    satellite: 'idle',
    speech: '',
    speechAt: 0,
    heard: '',
    heardAt: 0,
  });
  assert.deepEqual(missing, watchedEntityIds(E));
});

test('mapStates: texto unknown/unavailable vira vazio, sem horário', () => {
  for (const state of ['unknown', 'unavailable']) {
    const { patch } = mapStates({ 'input_text.pet_message': at(state, NOW), 'sensor.tablet_tts': at(state, NOW) }, E, NOW);
    assert.equal(patch.message, '');
    assert.equal(patch.messageAt, 0);
    assert.equal(patch.speech, '');
  }
});

test('mapStates sem satélite nem sensor de fala não os cobra', () => {
  const entities = { ...E, satellite: null, speech: null, heard: null };
  const { patch, missing } = mapStates({}, entities, NOW);
  assert.equal(patch.satellite, 'idle');
  assert.ok(!missing.some((id) => id.startsWith('assist_satellite') || id.startsWith('sensor.')));
});

test('normalizeHassUrl aceita http/https e devolve a origem', () => {
  assert.equal(normalizeHassUrl(' http://192.168.68.65:8123/ '), 'http://192.168.68.65:8123');
  assert.equal(normalizeHassUrl('https://x.ui.nabu.casa/lovelace/0'), 'https://x.ui.nabu.casa');
  assert.equal(normalizeHassUrl('192.168.68.65:8123'), null);
  assert.equal(normalizeHassUrl('ftp://casa'), null);
  assert.equal(normalizeHassUrl(''), null);
});

test('mapStates: clima e acessório desconhecidos viram normal e nenhum', () => {
  const { patch } = mapStates(
    { 'input_select.pet_clima': at('unavailable'), 'input_select.pet_acessorio': at('pascoa') },
    E,
    NOW,
  );
  assert.equal(patch.climate, 'normal');
  assert.equal(patch.accessory, 'nenhum');
});

test('mapStates: reação nenhuma ou desconhecida vira null, sem horário', () => {
  for (const state of ['nenhuma', 'dormindo', 'unknown', 'unavailable']) {
    const { patch } = mapStates({ 'input_select.pet_reacao': at(state, NOW - 100) }, E, NOW);
    assert.equal(patch.reaction, null);
    assert.equal(patch.reactionAt, 0);
  }
});

test('mapStates sem entidade de reação não a cobra', () => {
  const { patch, missing } = mapStates({}, { ...E, reaction: null }, NOW);
  assert.equal(patch.reaction, null);
  assert.ok(!missing.includes('input_select.pet_reacao'));
});
