// Recursos de quiosque da página avulsa (no VACA, o app já cuida da tela).
// - Tela sempre ligada (Screen Wake Lock), quando o navegador permite: exige contexto
//   seguro (HTTPS ou localhost); em HTTP na rede local o navegador simplesmente não oferece.
// - Tela cheia no primeiro toque, com ?kiosk=1 (navegadores só permitem tela cheia após um gesto).

type WakeLockSentinelLike = { release(): Promise<void>; addEventListener(type: 'release', cb: () => void): void };
type WakeLockNavigator = Navigator & {
  wakeLock?: { request(type: 'screen'): Promise<WakeLockSentinelLike> };
};

export function keepScreenOn(): void {
  const nav = navigator as WakeLockNavigator;
  if (!nav.wakeLock) {
    console.info('Wake Lock indisponível (requer HTTPS); a tela segue as configurações do aparelho.');
    return;
  }
  let sentinel: WakeLockSentinelLike | null = null;
  const request = async (): Promise<void> => {
    if (sentinel || document.visibilityState !== 'visible') return;
    try {
      sentinel = await nav.wakeLock!.request('screen');
      sentinel.addEventListener('release', () => {
        sentinel = null;
      });
    } catch (error) {
      console.warn('Não foi possível manter a tela ligada:', error);
    }
  };
  // O navegador solta a trava ao esconder a aba; pede de novo ao voltar.
  document.addEventListener('visibilitychange', () => void request());
  void request();
}

export function fullscreenOnFirstTouch(): void {
  const enter = (): void => {
    if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen({ navigationUI: 'hide' }).catch(() => undefined);
    }
  };
  // Sai da tela cheia (botão voltar do Android) → o próximo toque entra de novo.
  document.addEventListener('pointerup', enter);
}
