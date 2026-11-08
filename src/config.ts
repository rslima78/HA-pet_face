import { strings } from './i18n/pt-BR.ts';

export interface Shortcut {
  label: string;
  /** Nome de ícone (definido na etapa da grade de atalhos). */
  icon?: string;
  domain: string;
  service: string;
  entity_id: string;
  data?: Record<string, unknown>;
}

export interface PetConfig {
  /** URL do HA. null = mesma origem da página (servida em /local/pet/). */
  hassUrl: string | null;
  entities: {
    mood: string;
    message: string;
    sleep: string;
    carinho: string;
    /** input_button que o toque longo no rosto aperta para o pet ouvir; null desliga o gesto. */
    ouvir: string | null;
    /** assist_satellite do tablet; null até o VACA ser instalado. */
    satellite: string | null;
    /** Sensor com o texto da resposta falada (ex.: sensor.vaca_<id>_tts); opcional. */
    speech: string | null;
    /** input_select com o clima de fora (normal, calor, frio); null desliga. */
    climate: string | null;
    /** input_select com o acessório de data especial (nenhum, festa, natal, halloween); null desliga. */
    accessory: string | null;
    /** input_text com a faixa do topo (ex.: "Parabéns!"); null desliga. */
    banner: string | null;
  };
  /** Agente de conversa da pergunta digitada; null = agente padrão do HA. */
  agentId: string | null;
  /** Mostra o botão de pergunta por texto. */
  textInput: boolean;
  /** Dica de como falar com o pet, no pé da tela quando ele está parado; null esconde. */
  hint: string | null;
  shortcuts: Shortcut[];
}

export const DEFAULT_CONFIG: PetConfig = {
  hassUrl: null,
  entities: {
    mood: 'input_select.pet_mood',
    message: 'input_text.pet_message',
    sleep: 'input_boolean.pet_sleep',
    carinho: 'input_button.pet_carinho',
    ouvir: 'input_button.pet_ouvir',
    satellite: null,
    speech: null,
    climate: 'input_select.pet_clima',
    accessory: 'input_select.pet_acessorio',
    banner: 'input_text.pet_faixa',
  },
  agentId: null,
  textInput: true,
  hint: strings.hint,
  shortcuts: [],
};

/**
 * Lê pet.config.json ao lado do index.html. Se o arquivo não existir ou for inválido,
 * usa os padrões, para que a página sempre abra.
 */
export async function loadConfig(url = 'pet.config.json'): Promise<PetConfig> {
  try {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok || !response.headers.get('content-type')?.includes('json')) return DEFAULT_CONFIG;
    const raw = (await response.json()) as Partial<PetConfig>;
    return {
      ...DEFAULT_CONFIG,
      ...raw,
      entities: { ...DEFAULT_CONFIG.entities, ...raw.entities },
      shortcuts: Array.isArray(raw.shortcuts) ? raw.shortcuts : DEFAULT_CONFIG.shortcuts,
    };
  } catch (error) {
    console.warn('pet.config.json inválido; usando padrões.', error);
    return DEFAULT_CONFIG;
  }
}
