import { EXPRESSIONS, type Accessory, type ExpressionName, type FaceParams, type Rgb } from './expressions.ts';
import { clamp, damp, dampColor, randRange, rgb, talkNoise } from './anim.ts';

const SVG_NS = 'http://www.w3.org/2000/svg';
const VIEW_W = 400;
const VIEW_H = 300;
const CX = VIEW_W / 2;
const CY = VIEW_H / 2;
const EYE_Y = 128;
const EYE_DX = 74;
const MOUTH_Y = 212;
// As pálpebras são formas com a cor do fundo desenhadas por cima dos olhos.
const BG = '#000';
const BLUSH = '#ff7aa8';
const SWEAT = '#8fd8ff';
/** No Halloween o rosto fica cor de abóbora (mais apagado dormindo). */
const PUMPKIN: Rgb = [255, 140, 30];
const PUMPKIN_ASLEEP: Rgb = [150, 85, 25];
const SWEAT_CYCLE_S = 1.8;

const IDLE_FRAME_MS = 1000 / 30;
const BLINK_MS = 160;
const TOUCH_GAZE_MS = 2500;
const PET_REACTION_MS = 1800;
const PET_COOLDOWN_MS = 1500;
/** Segurar o dedo parado por este tempo vira "ouvir" em vez de carinho. */
const HOLD_MS = 700;
/** Quanto o dedo pode andar e ainda contar como segurar (px de tela); mais que isso é carinho. */
const HOLD_SLOP_PX = 14;
const HEART_LIFE_MS = 1400;
/** Apaixonado: um coração novo a cada intervalo destes. */
const LOVE_HEART_MS = 900;

type NumericKey = Exclude<keyof FaceParams, 'color'>;
const NUMERIC_KEYS: readonly NumericKey[] = [
  'eyeW',
  'eyeH',
  'eyeOpen',
  'eyeSkew',
  'lidTop',
  'lidAngle',
  'lidBottom',
  'gazeX',
  'gazeY',
  'mouthW',
  'mouthCurve',
  'mouthOpen',
  'tilt',
  'blush',
  'bob',
  'shiver',
  'wink',
];

type Attrs = Record<string, string | number>;

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  parent?: Element,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  setAttrs(node, attrs);
  parent?.append(node);
  return node;
}

function setAttrs(node: Element, attrs: Attrs): void {
  for (const key in attrs) node.setAttribute(key, String(attrs[key]));
}

interface EyeParts {
  group: SVGGElement;
  halo: SVGRectElement;
  ball: SVGRectElement;
  shine: SVGCircleElement;
  lidTop: SVGPathElement;
  lidBottom: SVGEllipseElement;
  /** +1 no olho esquerdo (lado de dentro em +x), -1 no direito. */
  side: 1 | -1;
}

interface Heart {
  node: SVGPathElement;
  born: number;
  x: number;
  drift: number;
}

export interface FaceRendererOptions {
  /** Chamado no carinho, no máximo uma vez a cada PET_COOLDOWN_MS. */
  onPet?: () => void;
  /** Chamado ao segurar o dedo parado no rosto (pedido para o pet ouvir). */
  onHold?: () => void;
}

export class FaceRenderer {
  readonly svg: SVGSVGElement;
  private readonly head: SVGGElement;
  private readonly eyes: readonly [EyeParts, EyeParts];
  private readonly mouth: SVGPathElement;
  private readonly blush: readonly SVGEllipseElement[];
  private readonly zzz: readonly SVGTextElement[];
  private readonly dots: readonly SVGCircleElement[];
  private readonly rings: readonly SVGCircleElement[];
  private readonly heartLayer: SVGGElement;
  private readonly sweat: SVGPathElement;
  private readonly question: SVGTextElement;
  private readonly accessories: Record<Exclude<Accessory, 'nenhum'>, SVGGElement>;
  private readonly onPet?: () => void;
  private readonly onHold?: () => void;

  private expression: ExpressionName = 'neutro';
  private talking = false;
  private current: FaceParams = { ...EXPRESSIONS.neutro };
  private transitioning = true;
  private accessory: Accessory = 'nenhum';
  private extras = { zzz: 0, dots: 0, rings: 0, sweat: 0, question: 0 };
  private hearts: Heart[] = [];
  private nextLoveHeart = 0;

  private gaze = { x: 0, y: 0 };
  private gazeTarget = { x: 0, y: 0 };
  private nextSaccade = 0;
  private touchGazeUntil = 0;
  private blinkStart = -1;
  private nextBlink = 1500;
  private blinkFactor = 1;
  private petUntil = 0;
  private lastPetCall = -Infinity;
  private pointerActive = false;
  private pointerStart = { x: 0, y: 0 };
  private holdTimer: number | undefined;
  private held = false;

  private raf = 0;
  private lastRender = 0;
  private fpsEma = 0;

  constructor(container: HTMLElement, options: FaceRendererOptions = {}) {
    this.onPet = options.onPet;
    this.onHold = options.onHold;
    this.svg = el('svg', {
      viewBox: `0 0 ${VIEW_W} ${VIEW_H}`,
      preserveAspectRatio: 'xMidYMid meet',
    });

    const ringLayer = el('g', { fill: 'none', 'stroke-width': 2 }, this.svg);
    this.rings = [0, 1].map(() => el('circle', { cx: CX, cy: CY, r: 120, opacity: 0 }, ringLayer));

    this.head = el('g', {}, this.svg);
    this.eyes = [this.buildEye(1), this.buildEye(-1)];
    this.blush = [-1, 1].map(() => el('ellipse', { rx: 18, ry: 8, fill: BLUSH, opacity: 0 }, this.head));
    this.mouth = el(
      'path',
      { 'stroke-width': 7, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'fill-opacity': 0.85 },
      this.head,
    );
    this.sweat = el('path', { d: 'M0-9C4-2 6 2 6 5A6 6 0 0 1-6 5C-6 2-4-2 0-9Z', fill: SWEAT, opacity: 0 }, this.head);
    this.accessories = {
      festa: this.buildPartyHat(),
      natal: this.buildSantaHat(),
      halloween: this.buildPumpkinStem(),
    };

    const extraLayer = el('g', {}, this.svg);
    this.zzz = [0, 1, 2].map(() => {
      const text = el(
        'text',
        { 'font-family': 'system-ui, sans-serif', 'font-weight': 700, opacity: 0 },
        extraLayer,
      );
      text.textContent = 'z';
      return text;
    });
    this.dots = [0, 1, 2].map((i) =>
      el('circle', { cx: CX + 105 + i * 16, cy: 72 - i * 10, r: 4 + i * 1.5, opacity: 0 }, extraLayer),
    );
    // "?" do confuso, flutuando ao lado da cabeça.
    this.question = el(
      'text',
      { 'font-family': 'system-ui, sans-serif', 'font-weight': 800, 'font-size': 34, opacity: 0 },
      extraLayer,
    );
    this.question.textContent = '?';
    this.heartLayer = el('g', { fill: BLUSH }, this.svg);

    container.append(this.svg);
    this.bindPointer();
    this.raf = requestAnimationFrame(this.frame);
  }

  /** Expressão alvo e boca falando. A transição é suave. */
  setState(expression: ExpressionName, talking: boolean): void {
    if (expression !== this.expression) this.transitioning = true;
    this.expression = expression;
    this.talking = talking;
  }

  /** Enfeite de data especial; troca na hora. */
  setAccessory(accessory: Accessory): void {
    if (accessory === this.accessory) return;
    this.accessory = accessory;
    this.transitioning = true;
    for (const [name, node] of Object.entries(this.accessories)) {
      node.setAttribute('display', name === accessory ? 'inline' : 'none');
    }
  }

  /** Reação de carinho. Também é disparada por toque no rosto. */
  pet(): void {
    const now = performance.now();
    this.petUntil = now + PET_REACTION_MS;
    this.transitioning = true;
    this.spawnHearts(now);
    if (now - this.lastPetCall >= PET_COOLDOWN_MS) {
      this.lastPetCall = now;
      this.onPet?.();
    }
  }

  get fps(): number {
    return this.fpsEma;
  }

  destroy(): void {
    cancelAnimationFrame(this.raf);
    clearTimeout(this.holdTimer);
    this.svg.remove();
  }

  private buildEye(side: 1 | -1): EyeParts {
    const group = el('g', {}, this.head);
    return {
      group,
      halo: el('rect', { opacity: 0.16 }, group),
      ball: el('rect', {}, group),
      shine: el('circle', { fill: '#fff' }, group),
      lidTop: el('path', { fill: BG }, group),
      lidBottom: el('ellipse', { fill: BG }, group),
      side,
    };
  }

  // Os enfeites ficam no grupo da cabeça: balançam e inclinam junto com o rosto.
  private buildPartyHat(): SVGGElement {
    // Inclinado sobre o olho direito: deixa o meio livre para a faixa de "Parabéns".
    const hat = el('g', { display: 'none', transform: `translate(${CX + EYE_DX - 4} 82) rotate(18) scale(0.85)` }, this.head);
    el('path', { d: 'M-36 0L0-66L36 0Z', fill: '#ff5fa2' }, hat);
    for (const [x, y] of [[-14, -14], [10, -24], [-4, -38], [18, -6], [2, -52]]) {
      el('circle', { cx: x, cy: y, r: 4, fill: '#ffd166' }, hat);
    }
    el('path', { d: 'M-38 0Q0 9 38 0', stroke: '#ffd166', 'stroke-width': 6, fill: 'none', 'stroke-linecap': 'round' }, hat);
    el('circle', { cx: 0, cy: -70, r: 8, fill: '#ffd166' }, hat);
    return hat;
  }

  private buildSantaHat(): SVGGElement {
    const hat = el('g', { display: 'none', transform: `translate(${CX} 0)` }, this.head);
    el('path', { d: 'M-104 66Q-70 4 20 6Q92 8 128 52L108 60Q84 34 46 30Q86 44 104 66Z', fill: '#e63946' }, hat);
    el('rect', { x: -116, y: 56, width: 232, height: 20, rx: 10, fill: '#f4f4f4' }, hat);
    el('circle', { cx: 120, cy: 60, r: 12, fill: '#f4f4f4' }, hat);
    return hat;
  }

  private buildPumpkinStem(): SVGGElement {
    const stem = el('g', { display: 'none', transform: `translate(${CX} 74)` }, this.head);
    el('path', { d: 'M-7 0L-5-28Q0-33 7-28L8 0Z', fill: '#5a7d2a' }, stem);
    el('path', { d: 'M6-20Q30-38 42-16Q22-6 6-20Z', fill: '#7fb03a' }, stem);
    return stem;
  }

  private bindPointer(): void {
    const look = (event: PointerEvent): void => {
      const ctm = this.svg.getScreenCTM();
      if (!ctm) return;
      const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(ctm.inverse());
      this.gazeTarget = {
        x: clamp((point.x - CX) / 140, -1, 1),
        y: clamp((point.y - EYE_Y) / 110, -1, 1),
      };
      this.touchGazeUntil = performance.now() + TOUCH_GAZE_MS;
    };
    const cancelHold = (): void => {
      clearTimeout(this.holdTimer);
      this.holdTimer = undefined;
    };
    this.svg.addEventListener('pointerdown', (event) => {
      this.pointerActive = true;
      this.held = false;
      this.pointerStart = { x: event.clientX, y: event.clientY };
      look(event);
      if (this.onHold) {
        cancelHold();
        this.holdTimer = window.setTimeout(() => {
          this.holdTimer = undefined;
          this.held = true;
          navigator.vibrate?.(30);
          this.onHold?.();
        }, HOLD_MS);
      }
    });
    this.svg.addEventListener('pointermove', (event) => {
      // Mouse sem botão também guia o olhar; ajuda a testar no computador.
      if (this.pointerActive || event.pointerType === 'mouse') look(event);
      // Arrastar é carinho, não pedido para ouvir.
      if (this.pointerActive && this.holdTimer !== undefined) {
        const moved = Math.hypot(event.clientX - this.pointerStart.x, event.clientY - this.pointerStart.y);
        if (moved > HOLD_SLOP_PX) cancelHold();
      }
    });
    this.svg.addEventListener('pointerup', () => {
      if (!this.pointerActive) return;
      this.pointerActive = false;
      cancelHold();
      if (!this.held) this.pet();
    });
    this.svg.addEventListener('pointercancel', () => {
      this.pointerActive = false;
      cancelHold();
    });
  }

  private frame = (now: number): void => {
    this.raf = requestAnimationFrame(this.frame);
    const minInterval = this.isActive(now) ? 0 : IDLE_FRAME_MS - 1;
    if (now - this.lastRender < minInterval) return;
    const dt = Math.min(0.1, (now - this.lastRender) / 1000);
    this.lastRender = now;
    if (dt > 0) this.fpsEma = this.fpsEma ? this.fpsEma * 0.9 + (1 / dt) * 0.1 : 1 / dt;
    this.update(now, dt);
    this.draw(now);
  };

  /** Em repouso o rosto desenha a 30 fps; em movimento usa o frame rate da tela. */
  private isActive(now: number): boolean {
    return (
      this.transitioning ||
      this.talking ||
      this.blinkStart >= 0 ||
      this.hearts.length > 0 ||
      now < this.touchGazeUntil ||
      now < this.petUntil
    );
  }

  private targetParams(now: number): FaceParams {
    const params = this.expressionParams(now);
    if (this.accessory !== 'halloween') return params;
    return { ...params, color: this.expression === 'dormindo' ? PUMPKIN_ASLEEP : PUMPKIN };
  }

  private expressionParams(now: number): FaceParams {
    if (now >= this.petUntil) return EXPRESSIONS[this.expression];
    // Carinho acordando o pet: abre os olhos curioso e depois volta a dormir.
    if (this.expression === 'dormindo') return { ...EXPRESSIONS.curioso, blush: 0.5 };
    return { ...EXPRESSIONS.feliz, blush: 1, bob: 3.2 };
  }

  private update(now: number, dt: number): void {
    const target = this.targetParams(now);
    const next = { ...this.current };
    let maxDelta = 0;
    for (const key of NUMERIC_KEYS) {
      next[key] = damp(this.current[key], target[key], 9, dt);
      maxDelta = Math.max(maxDelta, Math.abs(target[key] - next[key]));
    }
    next.color = dampColor(this.current.color, target.color, 6, dt);
    maxDelta = Math.max(maxDelta, Math.abs(target.color[0] - next.color[0]) / 50);
    this.current = next;
    this.transitioning = maxDelta > 0.01;

    const asleep = this.expression === 'dormindo' && now >= this.petUntil;
    this.updateGaze(now, dt, asleep);
    this.updateBlink(now, asleep);

    const weight = (on: boolean, value: number): number => damp(value, on ? 1 : 0, 5, dt);
    this.extras = {
      zzz: weight(asleep, this.extras.zzz),
      dots: weight(this.expression === 'pensando', this.extras.dots),
      rings: weight(this.expression === 'ouvindo', this.extras.rings),
      sweat: weight(this.expression === 'calor' && now >= this.petUntil, this.extras.sweat),
      question: weight(this.expression === 'confuso' && now >= this.petUntil, this.extras.question),
    };

    // Apaixonado: corações sobem sem parar, um de cada vez.
    if (this.expression === 'apaixonado' && now >= this.nextLoveHeart) {
      this.spawnHearts(now, 1);
      this.nextLoveHeart = now + LOVE_HEART_MS;
    }
  }

  private updateGaze(now: number, dt: number, asleep: boolean): void {
    if (asleep) {
      this.gazeTarget = { x: 0, y: 0 };
    } else if (now >= this.touchGazeUntil && now >= this.nextSaccade) {
      // Olhar errante: volta ao centro com frequência, às vezes desvia.
      this.gazeTarget =
        Math.random() < 0.4
          ? { x: 0, y: 0 }
          : { x: randRange(-0.7, 0.7), y: randRange(-0.45, 0.45) };
      this.nextSaccade = now + randRange(1200, 4200);
    }
    const p = this.current;
    this.gaze = {
      x: damp(this.gaze.x, clamp(this.gazeTarget.x + p.gazeX, -1, 1), 16, dt),
      y: damp(this.gaze.y, clamp(this.gazeTarget.y + p.gazeY, -1, 1), 16, dt),
    };
  }

  private updateBlink(now: number, asleep: boolean): void {
    if (this.blinkStart < 0 && now >= this.nextBlink && !asleep) this.blinkStart = now;
    if (this.blinkStart < 0) {
      this.blinkFactor = 1;
      return;
    }
    const progress = (now - this.blinkStart) / BLINK_MS;
    if (progress >= 1) {
      this.blinkStart = -1;
      this.blinkFactor = 1;
      // 20% de chance de piscar duas vezes seguidas.
      this.nextBlink = now + (Math.random() < 0.2 ? 120 : randRange(2500, 6000));
      return;
    }
    this.blinkFactor = 0.05 + 0.95 * Math.abs(1 - 2 * progress);
  }

  private draw(now: number): void {
    const p = this.current;
    const t = now / 1000;
    const asleep = this.expression === 'dormindo';
    const bob = Math.sin(t * (asleep ? 1.2 : 2.1)) * p.bob;
    const breath = asleep ? 1 + Math.sin(t * 1.2) * 0.012 : 1;
    const shiver = Math.sin(t * 55) * p.shiver * 2.2;
    this.head.setAttribute(
      'transform',
      `translate(${CX + shiver} ${CY + bob}) rotate(${p.tilt}) scale(${breath}) translate(${-CX} ${-CY})`,
    );

    const color = rgb(p.color);
    const gx = this.gaze.x * 14;
    const gy = this.gaze.y * 10;
    for (const eye of this.eyes) this.drawEye(eye, p, gx, gy, color);
    this.drawMouth(p, t, gx, gy, color);

    this.blush.forEach((node, i) => {
      setAttrs(node, {
        cx: CX + (i === 0 ? -EYE_DX : EYE_DX) + gx * 0.5,
        cy: EYE_Y + 62 + gy * 0.5,
        opacity: p.blush * 0.5,
      });
    });

    this.drawExtras(now, t, color);
  }

  private drawEye(eye: EyeParts, p: FaceParams, gx: number, gy: number, color: string): void {
    const scale = 1 + eye.side * p.eyeSkew;
    const w = p.eyeW * scale;
    // Piscadela: o olho do lado escolhido vira um arco (pálpebra de baixo quase no topo).
    // side -1 é o olho da direita da tela, fechado com wink positivo.
    const wink = clamp(eye.side === -1 ? p.wink : -p.wink, 0, 1);
    const hh = Math.max(1.5, p.eyeH * scale * p.eyeOpen * this.blinkFactor * (1 - 0.35 * wink));
    const lidBottom = p.lidBottom + (0.86 - p.lidBottom) * wink;
    const radius = Math.min(w * 0.6, hh);
    eye.group.setAttribute(
      'transform',
      `translate(${CX - eye.side * EYE_DX + gx} ${EYE_Y + gy})`,
    );
    setAttrs(eye.ball, { x: -w, y: -hh, width: 2 * w, height: 2 * hh, rx: radius, fill: color });
    setAttrs(eye.halo, {
      x: -w - 6,
      y: -hh - 6,
      width: 2 * w + 12,
      height: 2 * hh + 12,
      rx: radius + 6,
      fill: color,
    });
    setAttrs(eye.shine, {
      cx: w * 0.35,
      cy: -hh * 0.45,
      r: Math.min(w, hh) * 0.18,
      opacity: hh > 14 && wink < 0.5 ? 0.85 : 0,
    });

    // Pálpebra de cima: linha inclinada; y(x) = base + tan(ângulo) * x * lado.
    const edge = w + 8;
    const base = -hh + p.lidTop * 2 * hh;
    const slope = Math.tan((p.lidAngle * Math.PI) / 180) * eye.side;
    eye.lidTop.setAttribute(
      'd',
      `M${-edge} ${-hh - 80}H${edge}V${base + slope * edge}L${-edge} ${base - slope * edge}Z`,
    );

    // Pálpebra de baixo: elipse que sobe e deixa o olho em arco (^ ^).
    const ry = hh * 1.4 + 10;
    const top = hh - lidBottom * 2 * hh;
    setAttrs(eye.lidBottom, { cx: 0, cy: top + ry, rx: w * 1.5, ry });
  }

  private drawMouth(p: FaceParams, t: number, gx: number, gy: number, color: string): void {
    const talk = this.talking ? 0.12 + talkNoise(t) * 0.5 : 0;
    const open = clamp(p.mouthOpen + talk, 0, 1);
    const w = p.mouthW;
    const curve = p.mouthCurve * w * 0.5;
    const upper = curve * (1 - open * 0.6);
    const lower = curve + open * w * 2.2;
    setAttrs(this.mouth, {
      transform: `translate(${CX + gx * 0.35} ${MOUTH_Y + gy * 0.35})`,
      d: `M${-w} 0Q0 ${upper} ${w} 0Q0 ${lower} ${-w} 0Z`,
      stroke: color,
      fill: color,
    });
  }

  private drawExtras(now: number, t: number, color: string): void {
    const { zzz, dots, rings, sweat, question } = this.extras;

    setAttrs(this.question, {
      x: CX + EYE_DX + 62,
      y: EYE_Y - 52 + Math.sin(t * 2.2) * 5,
      transform: `rotate(${Math.sin(t * 1.4) * 10} ${CX + EYE_DX + 72} ${EYE_Y - 64})`,
      fill: color,
      opacity: question * 0.9,
    });

    // Gota de suor escorrendo ao lado do olho direito, em ciclo.
    const drip = (t / SWEAT_CYCLE_S) % 1;
    setAttrs(this.sweat, {
      transform: `translate(${CX + EYE_DX + 48} ${EYE_Y - 34 + drip * 44})`,
      opacity: sweat * Math.sin(drip * Math.PI),
    });

    this.zzz.forEach((node, i) => {
      const phase = (t * 0.35 + i / 3) % 1;
      setAttrs(node, {
        x: CX + 110 + phase * 30,
        y: 92 - phase * 60,
        'font-size': 14 + phase * 14,
        fill: color,
        opacity: zzz * Math.sin(phase * Math.PI),
      });
    });

    this.dots.forEach((node, i) => {
      const pulse = Math.max(0, Math.sin(t * 4 - i * 0.9));
      setAttrs(node, { fill: color, opacity: dots * (0.3 + 0.7 * pulse) });
    });

    this.rings.forEach((node, i) => {
      const phase = (t * 0.6 + i * 0.5) % 1;
      setAttrs(node, { r: 120 + phase * 50, stroke: color, opacity: rings * (1 - phase) * 0.35 });
    });

    this.hearts = this.hearts.filter((heart) => {
      const age = (now - heart.born) / HEART_LIFE_MS;
      if (age < 0) return true;
      if (age >= 1) {
        heart.node.remove();
        return false;
      }
      const scale = 1.2 + age * 0.8;
      setAttrs(heart.node, {
        transform: `translate(${heart.x + heart.drift * age} ${EYE_Y - 30 - age * 80}) scale(${scale})`,
        opacity: 1 - age,
      });
      return true;
    });
  }

  private spawnHearts(now: number, count = 3): void {
    for (let i = 0; i < count; i++) {
      this.hearts.push({
        node: el('path', { d: 'M0 6C-12-4-6-14 0-7C6-14 12-4 0 6Z', opacity: 0 }, this.heartLayer),
        born: now + i * 140,
        x: CX + randRange(-70, 70),
        drift: randRange(-20, 20),
      });
    }
  }
}
