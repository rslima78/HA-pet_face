// Tradução do estado do HA para o que o rosto mostra. Não decide comportamento:
// humor, sono e mensagem vêm prontos das automações; aqui só se escolhe o desenho.
import {
  isAccessory,
  isClimate,
  isMood,
  type Accessory,
  type Climate,
  type ExpressionName,
  type Mood,
} from '../face/expressions.ts';

export const SATELLITE_STATES = ['idle', 'listening', 'processing', 'responding', 'unavailable'] as const;
export type SatelliteState = (typeof SATELLITE_STATES)[number];

export const CONNECTION_STATES = ['connecting', 'online', 'offline'] as const;
export type ConnectionState = (typeof CONNECTION_STATES)[number];

export interface PetViewState {
  mood: Mood;
  /**
   * Clima de fora (painel de desenvolvimento). Não muda o rosto: a cara de calor ou frio
   * vem do humor, quando o HA comenta o tempo (automação pet_comentario_clima).
   */
  climate: Climate;
  /** Enfeite de data especial. */
  accessory: Accessory;
  /** Faixa fixa no topo (ex.: "Parabéns!"); vazia esconde. */
  banner: string;
  sleep: boolean;
  satellite: SatelliteState;
  /** input_text.pet_message e quando mudou (ms; 0 = antigo/desconhecido). */
  message: string;
  messageAt: number;
  /** Texto da resposta falada pelo satélite (ex.: sensor TTS do VACA), se configurado. */
  speech: string;
  speechAt: number;
  connection: ConnectionState;
  /** Pergunta digitada na página aguardando resposta. */
  thinking: boolean;
  /** Resposta da pergunta digitada. */
  localText: string;
  localTextAt: number;
  /** Quando o toque longo pediu para o pet ouvir (ms; 0 = nunca). */
  listenRequestAt: number;
}

export interface FaceTarget {
  expression: ExpressionName;
  talking: boolean;
  /** Legenda a exibir, ou null. */
  caption: string | null;
  /** Mostra a dica de como falar com o pet: só acordado, parado e sem legenda. */
  hint: boolean;
  /** Instante (ms) em que o resultado pode mudar só pela passagem do tempo, ou null. */
  refreshAt: number | null;
}

/** Durante a fala, só vale texto que mudou há pouco; o resto é de conversas anteriores. */
export const RESPONSE_FRESH_MS = 20000;

/** Depois do toque longo, o rosto já mostra "ouvindo" por até este tempo, enquanto o satélite não responde. */
export const LISTEN_REQUEST_MS = 4000;

/** Quanto tempo uma legenda fica na tela fora da fala: cresce com o texto, entre 4 e 12 s. */
export function captionDuration(text: string): number {
  return Math.min(12000, Math.max(4000, 2500 + text.length * 60));
}

export function initialViewState(): PetViewState {
  return {
    mood: 'neutro',
    climate: 'normal',
    accessory: 'nenhum',
    banner: '',
    sleep: false,
    satellite: 'idle',
    message: '',
    messageAt: 0,
    speech: '',
    speechAt: 0,
    connection: 'connecting',
    thinking: false,
    localText: '',
    localTextAt: 0,
    listenRequestAt: 0,
  };
}

/** Estado do HA → humor. Valor desconhecido, `unknown` ou `unavailable` viram neutro. */
export function normalizeMood(raw: string | undefined): Mood {
  return isMood(raw) ? raw : 'neutro';
}

export function normalizeClimate(raw: string | undefined): Climate {
  return isClimate(raw) ? raw : 'normal';
}

export function normalizeAccessory(raw: string | undefined): Accessory {
  return isAccessory(raw) ? raw : 'nenhum';
}

export interface Decor {
  accessory: Accessory;
  /** Texto da faixa do topo, ou null. */
  banner: string | null;
}

/** Enfeites de data especial: valem acordado ou dormindo; a faixa some sem conexão. */
export function deriveDecor(state: PetViewState): Decor {
  const banner = state.banner.trim();
  return {
    accessory: state.accessory,
    banner: banner && state.connection !== 'offline' ? banner : null,
  };
}

/** Estado do assist_satellite → estado conhecido. Valor inesperado é tratado como parado. */
export function normalizeSatellite(raw: string | undefined): SatelliteState {
  return (SATELLITE_STATES as readonly string[]).includes(raw ?? '')
    ? (raw as SatelliteState)
    : 'idle';
}

interface Candidate {
  text: string;
  at: number;
  window: number;
}

/** O texto mais recente ainda dentro da sua janela, e quando ele (ou outro) deixa de valer. */
function pickCaption(candidates: Candidate[], now: number): { caption: string | null; refreshAt: number | null } {
  const live = candidates
    .map((c) => ({ ...c, text: c.text.trim(), until: c.at + c.window }))
    .filter((c) => c.text && c.at > 0 && now < c.until);
  if (!live.length) return { caption: null, refreshAt: null };
  const newest = live.reduce((a, b) => (b.at > a.at ? b : a));
  return { caption: newest.text, refreshAt: Math.min(...live.map((c) => c.until)) };
}

export function deriveFace(state: PetViewState, now: number): FaceTarget {
  const plain = (expression: ExpressionName): FaceTarget => ({
    expression,
    talking: false,
    caption: null,
    hint: false,
    refreshAt: null,
  });

  if (state.connection === 'offline') return plain(state.sleep ? 'dormindo' : 'triste');

  // A voz tem prioridade sobre o sono: falar com o pet o acorda na hora.
  if (state.satellite === 'listening') return plain('ouvindo');
  if (state.satellite === 'processing' || state.thinking) return plain('pensando');
  // Resposta imediata ao toque longo; o satélite assume em seguida (ou o pedido expira).
  const listenUntil = state.listenRequestAt + LISTEN_REQUEST_MS;
  if (state.satellite === 'idle' && state.listenRequestAt > 0 && now < listenUntil) {
    return { ...plain('ouvindo'), refreshAt: listenUntil };
  }
  if (state.satellite === 'responding') {
    const speakingMood = ['dormindo', 'pensando', 'ouvindo'].includes(state.mood) ? 'neutro' : state.mood;
    const { caption, refreshAt } = pickCaption(
      [
        { text: state.speech, at: state.speechAt, window: RESPONSE_FRESH_MS },
        { text: state.message, at: state.messageAt, window: RESPONSE_FRESH_MS },
      ],
      now,
    );
    return { expression: speakingMood, talking: true, caption, hint: false, refreshAt };
  }

  if (state.sleep) return plain('dormindo');

  // Fora da fala: mensagens novas do HA (saudação, carinho) e respostas digitadas aparecem por um tempo.
  const { caption, refreshAt } = pickCaption(
    [
      { text: state.message, at: state.messageAt, window: captionDuration(state.message) },
      { text: state.localText, at: state.localTextAt, window: captionDuration(state.localText) },
    ],
    now,
  );
  // A dica não compete com a legenda nem aparece offline ou conectando.
  const hint = caption === null && state.connection === 'online' && state.satellite === 'idle';
  return { expression: state.mood, talking: false, caption, hint, refreshAt };
}
