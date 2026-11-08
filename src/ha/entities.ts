// Estado das entidades do pet a partir do formato compactado de `subscribe_entities`.
// A biblioteca oficial só assina todas as entidades da casa; aqui filtramos por entity_ids
// e guardamos o estado e o momento da última mudança (para a legenda não mostrar texto velho).
import type { PetConfig } from '../config.ts';
import {
  normalizeAccessory,
  normalizeClimate,
  normalizeMood,
  normalizeSatellite,
  type PetViewState,
} from '../state/derive.ts';

interface CompressedState {
  s?: string;
  a?: Record<string, unknown>;
  /** last_changed, em segundos desde a época. */
  lc?: number;
  /** last_updated, em segundos desde a época. */
  lu?: number;
}

export interface EntityDiffEvent {
  /** Entidades adicionadas ou substituídas por inteiro. */
  a?: Record<string, CompressedState>;
  /** Mudanças parciais: "+" traz os campos novos. */
  c?: Record<string, { '+'?: CompressedState; '-'?: { a?: string[] } }>;
  /** Entidades removidas. */
  r?: string[];
}

export interface EntityState {
  s: string;
  /** Última mudança de estado, em ms desde a época (relógio do HA). */
  changedAt: number;
}

export type StateMap = Readonly<Record<string, EntityState>>;

export function applyEntityDiff(states: StateMap, event: EntityDiffEvent): StateMap {
  const next: Record<string, EntityState> = { ...states };
  for (const [id, entity] of Object.entries(event.a ?? {})) {
    if (entity.s !== undefined) next[id] = { s: entity.s, changedAt: (entity.lc ?? entity.lu ?? 0) * 1000 };
  }
  for (const [id, change] of Object.entries(event.c ?? {})) {
    const plus = change['+'];
    if (plus?.s === undefined) continue;
    const at = plus.lc ?? plus.lu;
    next[id] = { s: plus.s, changedAt: at !== undefined ? at * 1000 : (next[id]?.changedAt ?? 0) };
  }
  for (const id of event.r ?? []) delete next[id];
  return next;
}

export type HaViewPatch = Pick<
  PetViewState,
  'mood' | 'climate' | 'accessory' | 'banner' | 'sleep' | 'message' | 'messageAt' | 'satellite' | 'speech' | 'speechAt'
>;

const NO_VALUE = new Set(['unknown', 'unavailable']);

export function watchedEntityIds(entities: PetConfig['entities']): string[] {
  return [
    entities.mood,
    entities.message,
    entities.sleep,
    entities.carinho,
    entities.ouvir,
    entities.satellite,
    entities.speech,
    entities.climate,
    entities.accessory,
    entities.banner,
  ].filter((id): id is string => Boolean(id));
}

function text(states: StateMap, id: string | null, now: number): { value: string; at: number } {
  const entity = id ? states[id] : undefined;
  if (!entity || NO_VALUE.has(entity.s)) return { value: '', at: 0 };
  // Relógio do tablet atrasado em relação ao HA: trata a mudança como "agora", não como futuro.
  return { value: entity.s, at: Math.min(entity.changedAt, now) };
}

export function mapStates(
  states: StateMap,
  entities: PetConfig['entities'],
  now: number,
): { patch: HaViewPatch; missing: string[] } {
  const message = text(states, entities.message, now);
  const speech = text(states, entities.speech, now);
  return {
    patch: {
      mood: normalizeMood(states[entities.mood]?.s),
      climate: entities.climate ? normalizeClimate(states[entities.climate]?.s) : 'normal',
      accessory: entities.accessory ? normalizeAccessory(states[entities.accessory]?.s) : 'nenhum',
      banner: text(states, entities.banner, now).value,
      sleep: states[entities.sleep]?.s === 'on',
      message: message.value,
      messageAt: message.at,
      satellite: entities.satellite ? normalizeSatellite(states[entities.satellite]?.s) : 'idle',
      speech: speech.value,
      speechAt: speech.at,
    },
    missing: watchedEntityIds(entities).filter((id) => !(id in states)),
  };
}
