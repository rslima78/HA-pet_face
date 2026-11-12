// Tradução do estado do HA para o que o rosto mostra. Não decide comportamento:
// humor, sono e mensagem vêm prontos das automações; aqui só se escolhe o desenho.
import {
  isAccessory,
  isClimate,
  isMood,
  isReaction,
  type Accessory,
  type Climate,
  type ExpressionName,
  type Mood,
  type Reaction,
} from '../face/expressions.ts';

export const SATELLITE_STATES = ['idle', 'listening', 'processing', 'responding', 'unavailable'] as const;
export type SatelliteState = (typeof SATELLITE_STATES)[number];

export const CONNECTION_STATES = ['connecting', 'online', 'offline'] as const;
export type ConnectionState = (typeof CONNECTION_STATES)[number];

export interface PetViewState {
  mood: Mood;
  /**
   * Reação passageira (input_select.pet_reacao) e quando começou (ms; 0 = nenhuma).
   * Vale por REACTION_MS sobre o humor; depois o rosto volta sozinho ao humor.
   */
  reaction: Reaction | null;
  reactionAt: number;
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
  /** Texto reconhecido pela voz (ex.: sensor STT do VACA), se configurado, e quando mudou. */
  heard: string;
  heardAt: number;
  connection: ConnectionState;
  /** Pergunta digitada na página aguardando resposta. */
  thinking: boolean;
  /** Resposta da pergunta digitada. */
  localText: string;
  localTextAt: number;
  /** Quando o toque longo pediu para o pet ouvir (ms; 0 = nunca). */
  listenRequestAt: number;
  /**
   * Resposta de conversa (o satélite passou de processing para responding): quando começou e
   * quando acabou, no relógio da página (ms; 0 = nenhuma / ainda falando). Avisos do próprio
   * pet (idle → responding) não contam: neles o HA só marca responding quando o som já começou.
   */
  replyAt: number;
  replyEndAt: number;
}

/**
 * Atraso da voz em relação ao estado do satélite, nas respostas de conversa. O HA marca
 * responding quando manda gerar o áudio e só envia o som ao tablet depois de pronto; e volta a
 * idle um pouco antes do som acabar. Zero mantém a boca presa ao estado do satélite.
 */
export interface SpeechTiming {
  /** Quanto esperar, depois de responding, para mexer a boca e mostrar a legenda. */
  delayMs: number;
  /** Quanto continuar falando depois que o satélite volta a idle. */
  tailMs: number;
}

export const NO_SPEECH_DELAY: SpeechTiming = { delayMs: 0, tailMs: 0 };

export interface FaceTarget {
  expression: ExpressionName;
  talking: boolean;
  /** Legenda a exibir, ou null. */
  caption: string | null;
  /** O que o pet entendeu da voz, já entre aspas, acima da legenda; ou null. */
  heard: string | null;
  /** Mostra a dica de como falar com o pet: só acordado, parado e sem legenda. */
  hint: boolean;
  /** Instante (ms) em que o resultado pode mudar só pela passagem do tempo, ou null. */
  refreshAt: number | null;
}

/** Durante a fala, só vale texto que mudou há pouco; o resto é de conversas anteriores. */
export const RESPONSE_FRESH_MS = 20000;

/** Depois do toque longo, o rosto já mostra "ouvindo" por até este tempo, enquanto o satélite não responde. */
export const LISTEN_REQUEST_MS = 4000;

/** Quanto tempo uma reação passageira fica no rosto, contado de quando o HA a escolheu. */
export const REACTION_MS = 6000;

/** Tamanho máximo da linha "entendi", em caracteres (com as reticências). */
export const HEARD_MAX = 80;

/** Texto reconhecido → linha "entendi": entre aspas tipográficas e cortado com reticências. */
export function formatHeard(text: string): string {
  const clean = text.trim().replace(/\s+/g, ' ');
  const cut = clean.length > HEARD_MAX ? `${clean.slice(0, HEARD_MAX - 1).trimEnd()}…` : clean;
  return `“${cut}”`;
}

/** Quanto tempo uma legenda fica na tela fora da fala: cresce com o texto, entre 4 e 12 s. */
export function captionDuration(text: string): number {
  return Math.min(12000, Math.max(4000, 2500 + text.length * 60));
}

export function initialViewState(): PetViewState {
  return {
    mood: 'neutro',
    reaction: null,
    reactionAt: 0,
    climate: 'normal',
    accessory: 'nenhum',
    banner: '',
    sleep: false,
    satellite: 'idle',
    message: '',
    messageAt: 0,
    speech: '',
    speechAt: 0,
    heard: '',
    heardAt: 0,
    connection: 'connecting',
    thinking: false,
    localText: '',
    localTextAt: 0,
    listenRequestAt: 0,
    replyAt: 0,
    replyEndAt: 0,
  };
}

/**
 * Marca o começo e o fim de uma resposta de conversa quando o satélite muda de estado.
 * Devolve o trecho a aplicar no estado, ou null se nada muda.
 */
export function trackReply(
  previous: SatelliteState,
  next: SatelliteState,
  now: number,
): Partial<Pick<PetViewState, 'replyAt' | 'replyEndAt'>> | null {
  if (previous === next) return null;
  if (next === 'responding') return { replyAt: previous === 'processing' ? now : 0, replyEndAt: 0 };
  if (previous === 'responding') return { replyEndAt: now };
  if (next === 'listening' || next === 'processing') return { replyAt: 0, replyEndAt: 0 };
  return null;
}

/**
 * Fase da resposta de conversa considerando o atraso da voz: esperando o som (ainda pensando),
 * falando (inclusive um pouco depois do idle) ou null (sem ajuste: segue o estado do satélite).
 */
function replyPhase(
  state: PetViewState,
  now: number,
  timing: SpeechTiming,
): { phase: 'waiting' | 'talking'; until: number | null } | null {
  if (!state.replyAt || (timing.delayMs <= 0 && timing.tailMs <= 0)) return null;
  const start = state.replyAt + Math.max(0, timing.delayMs);
  if (state.satellite === 'responding') return now < start ? { phase: 'waiting', until: start } : null;
  if (state.satellite !== 'idle' || !state.replyEndAt) return null;
  const end = state.replyEndAt + Math.max(0, timing.tailMs);
  if (now >= end) return null;
  // O satélite pode voltar a idle antes de o som começar (resposta curta): espera e fala depois.
  if (now < start) return start < end ? { phase: 'waiting', until: start } : null;
  return { phase: 'talking', until: end };
}

/** Estado do HA → humor. Valor desconhecido, `unknown` ou `unavailable` viram neutro. */
export function normalizeMood(raw: string | undefined): Mood {
  return isMood(raw) ? raw : 'neutro';
}

/** Estado do pet_reacao → reação, ou null para `nenhuma`, valor desconhecido ou indisponível. */
export function normalizeReaction(raw: string | undefined): Reaction | null {
  return isReaction(raw) ? raw : null;
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

export function deriveFace(state: PetViewState, now: number, timing: SpeechTiming = NO_SPEECH_DELAY): FaceTarget {
  const plain = (expression: ExpressionName): FaceTarget => ({
    expression,
    talking: false,
    caption: null,
    heard: null,
    hint: false,
    refreshAt: null,
  });

  if (state.connection === 'offline') return plain(state.sleep ? 'dormindo' : 'triste');

  // A voz tem prioridade sobre o sono: falar com o pet o acorda na hora.
  if (state.satellite === 'listening') return plain('ouvindo');
  const reply = replyPhase(state, now, timing);
  // Linha "entendi": só na conversa por voz, com texto reconhecido há pouco.
  const heardUntil = state.heardAt + RESPONSE_FRESH_MS;
  const heardLive =
    (state.satellite === 'processing' || state.satellite === 'responding' || reply !== null) &&
    state.heard.trim() !== '' &&
    state.heardAt > 0 &&
    now < heardUntil;
  const heard = heardLive ? formatHeard(state.heard) : null;
  const heardRefresh = heardLive ? heardUntil : null;

  if (state.satellite === 'processing') return { ...plain('pensando'), heard, refreshAt: heardRefresh };
  // O HA já marcou a resposta, mas o som ainda não saiu: continua pensando, sem boca nem legenda.
  if (reply?.phase === 'waiting') return { ...plain('pensando'), heard, refreshAt: earliest(reply.until, heardRefresh) };
  if (state.thinking) return plain('pensando');
  // Resposta imediata ao toque longo; o satélite assume em seguida (ou o pedido expira).
  const listenUntil = state.listenRequestAt + LISTEN_REQUEST_MS;
  if (state.satellite === 'idle' && state.listenRequestAt > 0 && now < listenUntil) {
    return { ...plain('ouvindo'), refreshAt: listenUntil };
  }
  // Reação passageira: vale sobre o humor até expirar; depois o rosto volta sozinho ao humor.
  // Durante a fala, dura a resposta inteira (mesma janela da legenda), para não mudar no meio da frase.
  const reactionWindow = state.satellite === 'responding' ? Math.max(REACTION_MS, RESPONSE_FRESH_MS) : REACTION_MS;
  const reactionUntil = state.reactionAt + reactionWindow;
  const reaction = state.reaction && state.reactionAt > 0 && now < reactionUntil ? state.reaction : null;
  const reactionRefresh = reaction ? reactionUntil : null;

  if (state.satellite === 'responding' || reply?.phase === 'talking') {
    const base = reaction ?? state.mood;
    const speakingFace = ['dormindo', 'sonolento', 'pensando', 'ouvindo'].includes(base) ? 'neutro' : base;
    const { caption, refreshAt } = pickCaption(
      [
        { text: state.speech, at: state.speechAt, window: RESPONSE_FRESH_MS },
        { text: state.message, at: state.messageAt, window: RESPONSE_FRESH_MS },
      ],
      now,
    );
    return {
      expression: speakingFace,
      talking: true,
      caption,
      heard,
      hint: false,
      refreshAt: earliest(earliest(earliest(refreshAt, reactionRefresh), heardRefresh), reply?.until ?? null),
    };
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
  return {
    expression: reaction ?? state.mood,
    talking: false,
    caption,
    heard: null,
    hint,
    refreshAt: earliest(refreshAt, reactionRefresh),
  };
}

function earliest(a: number | null, b: number | null): number | null {
  if (a === null) return b;
  if (b === null) return a;
  return Math.min(a, b);
}
