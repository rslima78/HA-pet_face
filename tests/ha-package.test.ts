// Garante que o pacote HA continua batendo com o contrato que a página consome.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { parse } from 'yaml';
import { DEFAULT_CONFIG } from '../src/config.ts';
import { MOODS, NO_REACTION, REACTIONS } from '../src/face/expressions.ts';

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
  // satellite, speech e heard vêm do app do tablet, não do pacote.
  const { satellite: _satellite, speech: _speech, heard: _heard, ...contract } = DEFAULT_CONFIG.entities;
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

test('as opções de pet_reacao são nenhuma + as reações da página', () => {
  const select = (pkg.input_select as Record<string, { options: string[] }>).pet_reacao;
  assert.deepEqual(select.options, [NO_REACTION, ...REACTIONS]);
});

test('pet_reagir e pet_definir_emocao só oferecem reações que a página conhece', () => {
  const scripts = pkg.script as Record<string, { fields: { emocao: { selector: { select: { options: string[] } } } } }>;
  for (const name of ['pet_reagir', 'pet_definir_emocao']) {
    const options = scripts[name].fields.emocao.selector.select.options;
    assert.ok(
      options.every((option) => (REACTIONS as readonly string[]).includes(option)),
      `${name} tem emoção que não é reação`,
    );
  }
});

test('carinho e pet_definir_emocao usam a reação, sem mexer no humor', () => {
  const automations = pkg.automation as unknown as { id: string; actions: unknown[] }[];
  const carinho = JSON.stringify(automations.find((a) => a.id === 'pet_carinho')?.actions);
  const definir = JSON.stringify((pkg.script as Record<string, { sequence: unknown[] }>).pet_definir_emocao.sequence);
  for (const [name, text] of [['pet_carinho', carinho], ['pet_definir_emocao', definir]]) {
    assert.match(text, /script\.pet_reagir/, `${name} não chama pet_reagir`);
    assert.doesNotMatch(text, /input_select\.pet_mood/, `${name} ainda muda o humor`);
  }
});

test('acordar com humor dormindo volta ao neutro (a reação não troca mais o humor)', () => {
  const automations = pkg.automation as unknown as { id: string; triggers: unknown[]; conditions: unknown[]; actions: unknown[] }[];
  const wake = automations.find((a) => a.id === 'pet_acordado_sem_sono');
  assert.ok(wake, 'falta a automação pet_acordado_sem_sono');
  assert.match(JSON.stringify(wake.triggers), /input_boolean\.pet_sleep/);
  assert.match(JSON.stringify(wake.conditions), /dormindo/);
  assert.match(JSON.stringify(wake.actions), /neutro/);
});

test('humor volta ao normal cobre todo humor passageiro', () => {
  const automations = pkg.automation as unknown as { id: string; triggers: { to?: string[] }[] }[];
  const back = automations.find((a) => a.id === 'pet_humor_volta_ao_normal');
  const covered = back?.triggers.flatMap((t) => t.to ?? []) ?? [];
  const lasting = ['dormindo', 'neutro', 'ouvindo'];
  for (const mood of MOODS.filter((m) => !lasting.includes(m))) {
    assert.ok(covered.includes(mood), `${mood} não volta ao neutro`);
  }
});

test('expressões novas estão ligadas: confuso e piscando na fala, apaixonado no carinho, sonolento ao dormir', () => {
  const automations = pkg.automation as unknown as { id: string; actions: unknown[] }[];
  const text = (id: string) => JSON.stringify(automations.find((a) => a.id === id)?.actions);
  assert.match(text('pet_emocao_pela_fala'), /'confuso'/);
  assert.match(text('pet_emocao_pela_fala'), /'piscando'/);
  assert.match(text('pet_carinho'), /apaixonado/);
  assert.match(text('pet_dormir'), /sonolento/);
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

test('pet_o_que_ve: single, pergunta opcional, recusa dormindo e à noite, nada salvo em disco', () => {
  const script = (pkg.script as Record<string, { mode: string; fields: Record<string, { required?: boolean }>; sequence: unknown[] }>)
    .pet_o_que_ve;
  assert.ok(script, 'pet_o_que_ve não está no pacote');
  assert.equal(script.mode, 'single');
  assert.equal(script.fields.pergunta?.required, false);
  const body = JSON.stringify(script.sequence);
  assert.ok(!body.includes('camera.snapshot') && !body.includes('/media'), 'o script não pode salvar a foto');
  assert.ok(body.includes('media-source://camera/camera.camera_da_sala_hd_stream'));
  // As recusas (dormindo e noite) vêm antes de qualquer ação que olhe a câmera.
  const firstAi = body.indexOf('ai_task.generate_data');
  assert.ok(body.indexOf('input_boolean.pet_sleep') < firstAi);
  assert.ok(body.indexOf('input_datetime.pet_noite_inicio') < firstAi);
  // Só a voz chama o script: nenhuma automação o usa.
  assert.ok(!JSON.stringify(pkg.automation).includes('pet_o_que_ve'));
});

test('pet_volume e pet_brilho: campos, modo e nada de VACA fixo', () => {
  type Script = { mode: string; max?: number; fields: Record<string, { required?: boolean; selector?: { select?: { options: string[] } } }>; sequence: unknown[] };
  const scripts = pkg.script as Record<string, Script>;
  const expected = { pet_volume: ['subir', 'descer', 'definir', 'mudo', 'som'], pet_brilho: ['mais', 'menos', 'definir'] };
  for (const [id, acoes] of Object.entries(expected)) {
    const script = scripts[id];
    assert.ok(script, `${id} não está no pacote`);
    assert.equal(script.mode, 'queued');
    assert.equal(script.max, 3);
    assert.deepEqual(script.fields.acao?.selector?.select?.options, acoes);
    assert.equal(script.fields.valor?.required, false);
    const body = JSON.stringify(script);
    // Tudo pelo rótulo: nenhum id de VACA (nem do pet nem do Echo Show).
    assert.ok(!/vaca_[0-9a-f]+/.test(body), `${id} cita um VACA pelo id`);
  }
  assert.ok(JSON.stringify(scripts.pet_volume).includes('pet_satelite'));
  // O switch _mute do VACA desliga o microfone: o pet ficaria surdo, não mudo.
  assert.ok(!JSON.stringify(scripts.pet_volume.sequence).includes('_mute'));
  // O brilho vai para o ajuste do dia; quem aplica é a automação de brilho.
  const brilho = JSON.stringify(scripts.pet_brilho.sequence);
  assert.ok(brilho.includes('input_number.pet_brilho_dia') && !brilho.includes('screen_brightness'));
});
