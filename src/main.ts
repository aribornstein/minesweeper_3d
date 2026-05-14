import './styles.css';
import { Game } from './game/Game';

const canvas = document.querySelector<HTMLCanvasElement>('#game-canvas');

if (!canvas) {
  throw new Error('Game canvas was not found.');
}

function showFatalError(message: string): void {
  const banner = document.createElement('div');
  banner.style.cssText =
    'position:fixed;inset:0;display:flex;align-items:center;justify-content:center;padding:24px;background:#06090f;color:#e8f2ff;font-family:system-ui,sans-serif;text-align:center;z-index:9999;';
  banner.innerHTML = `<div style="max-width:420px;line-height:1.5"><h2 style="margin:0 0 12px;font-size:20px;color:#7ad7ff">Unable to start</h2><p style="margin:0 0 8px">${message}</p><p style="margin:0;opacity:0.7;font-size:14px">Try a newer device or browser, or append <code>?quality=low</code> to the URL.</p></div>`;
  document.body.appendChild(banner);
}

function hasWebGL(testCanvas: HTMLCanvasElement): boolean {
  try {
    const ctx = testCanvas.getContext('webgl2') || testCanvas.getContext('webgl');
    return Boolean(ctx);
  } catch {
    return false;
  }
}

if (!hasWebGL(canvas)) {
  showFatalError('WebGL is unavailable in this browser.');
} else {
  try {
    const game = new Game(canvas);
    game.start();
  } catch (error) {
    console.error('Failed to start game', error);
    showFatalError(error instanceof Error ? error.message : 'Unknown error during startup.');
  }
}

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/service-worker.js');
  });
}