// Valores do input_select.pet_mood no HA. A ordem aparece no painel dev.
export const MOODS = [
  'dormindo',
  'neutro',
  'feliz',
  'curioso',
  'surpreso',
  'triste',
  'bravo',
  'pensando',
  'calor',
  'frio',
  'ouvindo',
] as const;

export type Mood = (typeof MOODS)[number];

/** Valores do input_select.pet_clima: o HA compara a temperatura de fora com os limites. */
export const CLIMATES = ['normal', 'calor', 'frio'] as const;
export type Climate = (typeof CLIMATES)[number];

/** Valores do input_select.pet_acessorio: datas especiais escolhidas pelo HA. */
export const ACCESSORIES = ['nenhum', 'festa', 'natal', 'halloween'] as const;
export type Accessory = (typeof ACCESSORIES)[number];

// "ouvindo" vem do satélite; também é humor para a demo simular a escuta.
// "falando" é a boca animada sobre o humor atual.
export type ExpressionName = Mood;

export type Rgb = readonly [number, number, number];

export interface FaceParams {
  /** Meia largura do olho, em unidades do viewBox. */
  eyeW: number;
  /** Meia altura do olho aberto. */
  eyeH: number;
  /** 0 = fechado, 1 = aberto. */
  eyeOpen: number;
  /** Assimetria: olho esquerdo maior quando positivo. */
  eyeSkew: number;
  /** Quanto a pálpebra de cima cobre (0..1). */
  lidTop: number;
  /** Inclinação da pálpebra de cima em graus; positivo baixa o lado de dentro (bravo). */
  lidAngle: number;
  /** Quanto a pálpebra de baixo sobe (0..1); dá o olho sorridente. */
  lidBottom: number;
  /** Viés do olhar, de -1 a 1. */
  gazeX: number;
  gazeY: number;
  mouthW: number;
  /** -1 = boca triste, 1 = sorriso. */
  mouthCurve: number;
  /** 0 = fechada, 1 = bem aberta. */
  mouthOpen: number;
  /** Inclinação da cabeça em graus. */
  tilt: number;
  blush: number;
  /** Amplitude do balanço ocioso. */
  bob: number;
  /** Tremedeira de frio, de 0 a 1. */
  shiver: number;
  color: Rgb;
}

const neutro: FaceParams = {
  eyeW: 34,
  eyeH: 44,
  eyeOpen: 1,
  eyeSkew: 0,
  lidTop: 0.06,
  lidAngle: 0,
  lidBottom: 0,
  gazeX: 0,
  gazeY: 0,
  mouthW: 22,
  mouthCurve: 0.35,
  mouthOpen: 0,
  tilt: 0,
  blush: 0,
  bob: 1.2,
  shiver: 0,
  color: [94, 231, 255],
};

export const EXPRESSIONS: Record<ExpressionName, FaceParams> = {
  neutro,
  feliz: {
    ...neutro,
    lidTop: 0,
    lidBottom: 0.42,
    mouthW: 34,
    mouthCurve: 1,
    mouthOpen: 0.28,
    blush: 0.75,
    bob: 2.4,
    color: [125, 255, 176],
  },
  curioso: {
    ...neutro,
    eyeH: 48,
    eyeSkew: 0.12,
    lidTop: 0,
    gazeX: 0.25,
    mouthW: 12,
    mouthCurve: 0.1,
    mouthOpen: 0.18,
    tilt: 8,
    color: [255, 209, 102],
  },
  surpreso: {
    ...neutro,
    eyeW: 38,
    eyeH: 54,
    lidTop: 0,
    mouthW: 13,
    mouthCurve: 0,
    mouthOpen: 0.95,
    bob: 0.6,
    color: [235, 245, 255],
  },
  triste: {
    ...neutro,
    eyeH: 40,
    lidTop: 0.28,
    lidAngle: -20,
    gazeY: 0.45,
    mouthCurve: -0.75,
    tilt: -4,
    bob: 0.5,
    color: [106, 168, 255],
  },
  bravo: {
    ...neutro,
    eyeH: 42,
    lidTop: 0.2,
    lidAngle: 20,
    mouthW: 26,
    mouthCurve: -0.55,
    mouthOpen: 0.08,
    bob: 0.4,
    color: [255, 94, 94],
  },
  pensando: {
    ...neutro,
    lidTop: 0.22,
    eyeSkew: 0.06,
    gazeX: 0.55,
    gazeY: -0.7,
    mouthW: 12,
    mouthCurve: -0.15,
    tilt: -5,
    bob: 0.6,
    color: [180, 155, 255],
  },
  // Calor: olhos pesados, boca aberta ofegante, bochecha vermelha; a gota de suor é um extra.
  calor: {
    ...neutro,
    eyeH: 40,
    lidTop: 0.3,
    lidAngle: -8,
    gazeY: 0.15,
    mouthW: 20,
    mouthCurve: 0.2,
    mouthOpen: 0.45,
    tilt: -3,
    blush: 0.9,
    bob: 0.5,
    color: [255, 150, 80],
  },
  // Frio: olhos apertados, boquinha tensa e a cabeça tremendo.
  frio: {
    ...neutro,
    eyeW: 30,
    eyeH: 40,
    lidTop: 0.24,
    lidBottom: 0.18,
    mouthW: 18,
    mouthCurve: -0.25,
    mouthOpen: 0.1,
    bob: 0.3,
    shiver: 1,
    color: [170, 220, 255],
  },
  dormindo: {
    ...neutro,
    eyeOpen: 0.06,
    lidTop: 0,
    gazeY: 0.3,
    mouthW: 10,
    mouthCurve: 0.3,
    mouthOpen: 0.05,
    bob: 2.5,
    color: [70, 120, 140],
  },
  ouvindo: {
    ...neutro,
    eyeW: 36,
    eyeH: 50,
    lidTop: 0,
    mouthW: 16,
    mouthCurve: 0.4,
    mouthOpen: 0.08,
    tilt: 6,
    bob: 0.8,
    color: [120, 240, 255],
  },
};

export function isMood(value: unknown): value is Mood {
  return typeof value === 'string' && (MOODS as readonly string[]).includes(value);
}

export function isClimate(value: unknown): value is Climate {
  return typeof value === 'string' && (CLIMATES as readonly string[]).includes(value);
}

export function isAccessory(value: unknown): value is Accessory {
  return typeof value === 'string' && (ACCESSORIES as readonly string[]).includes(value);
}
