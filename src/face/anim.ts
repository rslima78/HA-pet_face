import type { Rgb } from './expressions.ts';

export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

/** Aproximação exponencial independente do frame rate. `lambda` maior = mais rápido. */
export function damp(current: number, target: number, lambda: number, dt: number): number {
  return target + (current - target) * Math.exp(-lambda * dt);
}

export function dampColor(current: Rgb, target: Rgb, lambda: number, dt: number): Rgb {
  return [
    damp(current[0], target[0], lambda, dt),
    damp(current[1], target[1], lambda, dt),
    damp(current[2], target[2], lambda, dt),
  ];
}

export function randRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

export function rgb(color: Rgb): string {
  return `rgb(${Math.round(color[0])},${Math.round(color[1])},${Math.round(color[2])})`;
}

/** Abertura de boca pseudoaleatória, de 0 a 1, com ritmo parecido com sílabas. */
export function talkNoise(seconds: number): number {
  const syllable = Math.sin(seconds * 15.7) * Math.sin(seconds * 6.1 + 1.3);
  const jitter = Math.sin(seconds * 23.3 + 0.7) * 0.18;
  return clamp(Math.abs(syllable) + jitter, 0, 1);
}
