// Garante que o pacote HA continua batendo com o contrato que a página consome.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { parse } from 'yaml';
import { DEFAULT_CONFIG } from '../src/config.ts';
import { MOODS } from '../src/face/expressions.ts';

interface Automation {
  id: string;
  alias: string;
  mode?: string;
  triggers: { trigger: string; behavior?: string; options?: { behavior?: string } }[];
}

type Package = Record<string, Record<string, Record<string, unknown>> | Automation[]>;

const pkg = parse(readFileSync(new URL('../ha-package/pet.yaml', import.meta.url), 'utf8')) as Package;

const objectId = (entityId: string): [string, string] => entityId.split('.') as [string, string];

test('o pacote define todas as entidades do contrato com os nomes padrão', () => {
  // satellite e speech vêm do app do tablet, não do pacote.
  const { satellite: _satellite, speech: _speech, ...contract } = DEFAULT_CONFIG.entities;
  // ouvir pode ser null na configuração (gesto desligado), mas o padrão vem do pacote.
  for (const entityId of Object.values(contract).filter((id): id is string => id !== null)) {
    const [domain, id] = objectId(entityId);
    const section = pkg[domain] as Record<string, unknown> | undefined;
    assert.ok(section && id in section, `${entityId} não está no pacote`);
  }
});

test('as opções de pet_mood são exatamente os humores da página', () => {
  const select = (pkg.input_select as Record<string, { options: string[] }>).pet_mood;
  assert.deepEqual(select.options, [...MOODS]);
});

test('pet_definir_emocao só oferece humores que a página conhece, sem dormindo', () => {
  const script = (pkg.script as Record<string, { fields: { emocao: { selector: { select: { options: string[] } } } } }>)
    .pet_definir_emocao;
  const options = script.fields.emocao.selector.select.options;
  assert.ok(options.every((option) => (MOODS as readonly string[]).includes(option)));
  assert.ok(!options.includes('dormindo'));
});

test('input_text.pet_message cabe no limite de estado do HA', () => {
  const text = (pkg.input_text as Record<string, { max: number }>).pet_message;
  assert.ok(text.max <= 255);
});

test('ajustes sem initial, para o HA guardar o valor entre reinícios', () => {
  for (const domain of ['input_select', 'input_text', 'input_boolean', 'input_number', 'input_datetime']) {
    for (const [id, config] of Object.entries(pkg[domain] as Record<string, Record<string, unknown>>)) {
      assert.ok(!('initial' in config), `${domain}.${id} tem initial`);
    }
  }
});

test('automações têm id único e não usam os nomes antigos de behavior', () => {
  const automations = pkg.automation as Automation[];
  const ids = automations.map((a) => a.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const automation of automations) {
    assert.match(automation.id, /^pet_/);
    for (const trigger of automation.triggers) {
      const behavior = trigger.options?.behavior;
      assert.ok(behavior === undefined || ['each', 'first', 'all'].includes(behavior), `${automation.id}: ${behavior}`);
    }
  }
});

test('o script de padrões cobre todos os ajustes numéricos e de horário', () => {
  const script = (pkg.script as Record<string, { sequence: { target: { entity_id: string } }[] }>).pet_aplicar_padroes;
  const touched = new Set(script.sequence.map((step) => step.target.entity_id));
  const settings = [
    ...Object.keys(pkg.input_number as object).map((id) => `input_number.${id}`),
    ...['pet_noite_inicio', 'pet_noite_fim'].map((id) => `input_datetime.${id}`),
    'input_boolean.pet_falar_saudacao',
  ];
  for (const entityId of settings) assert.ok(touched.has(entityId), `${entityId} sem padrão`);
});
