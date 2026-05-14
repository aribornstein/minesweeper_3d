import { getSettings, type QualityPreference, updateSettings } from './Settings';

export type MenuScreen = 'none' | 'main' | 'pause' | 'settings' | 'gameover';

export type MenuHandlers = {
  onPlay: () => void;
  onResume: () => void;
  onRestart: () => void;
  onQuitToMain: () => void;
};

export class MenuController {
  private screen: MenuScreen = 'none';
  private previousScreen: MenuScreen = 'main';
  private readonly root: HTMLDivElement;
  private readonly mainPanel: HTMLDivElement;
  private readonly pausePanel: HTMLDivElement;
  private readonly settingsPanel: HTMLDivElement;
  private readonly gameOverPanel: HTMLDivElement;
  private readonly qualitySelect: HTMLSelectElement;
  private readonly sensitivityInput: HTMLInputElement;
  private readonly sensitivityValue: HTMLSpanElement;
  private readonly qualityNotice: HTMLParagraphElement;
  private appliedQuality: QualityPreference;

  constructor(private readonly handlers: MenuHandlers) {
    const settings = getSettings();
    this.appliedQuality = settings.quality;

    this.root = document.createElement('div');
    this.root.id = 'menu-root';
    this.root.className = 'menu-root';
    this.root.hidden = true;

    this.mainPanel = this.buildMainPanel();
    this.pausePanel = this.buildPausePanel();
    this.settingsPanel = this.buildSettingsPanel();
    this.gameOverPanel = this.buildGameOverPanel();

    this.qualitySelect = this.settingsPanel.querySelector<HTMLSelectElement>('select[name="quality"]')!;
    this.sensitivityInput = this.settingsPanel.querySelector<HTMLInputElement>('input[name="sensitivity"]')!;
    this.sensitivityValue = this.settingsPanel.querySelector<HTMLSpanElement>('.menu-range-value')!;
    this.qualityNotice = this.settingsPanel.querySelector<HTMLParagraphElement>('.menu-quality-notice')!;

    this.qualitySelect.value = settings.quality;
    this.sensitivityInput.value = String(settings.sensitivity);
    this.sensitivityValue.textContent = formatSensitivity(settings.sensitivity);

    this.root.append(this.mainPanel, this.pausePanel, this.settingsPanel, this.gameOverPanel);
    document.body.appendChild(this.root);

    window.addEventListener('keydown', this.onKeyDown);
    this.show('main');
  }

  show(screen: MenuScreen): void {
    if (screen !== 'settings') {
      this.previousScreen = screen;
    }
    this.screen = screen;
    this.mainPanel.hidden = screen !== 'main';
    this.pausePanel.hidden = screen !== 'pause';
    this.settingsPanel.hidden = screen !== 'settings';
    this.gameOverPanel.hidden = screen !== 'gameover';
    this.root.hidden = screen === 'none';
    this.root.dataset.screen = screen;
    if (screen !== 'none') {
      const firstButton = this.root.querySelector<HTMLButtonElement>(`[data-screen="${screen}"] button, [data-screen="${screen}"] select`);
      firstButton?.focus({ preventScroll: true });
    }
  }

  current(): MenuScreen {
    return this.screen;
  }

  isOpen(): boolean {
    return this.screen !== 'none';
  }

  openPause(): void {
    if (this.screen === 'none') this.show('pause');
  }

  openGameOver(): void {
    this.show('gameover');
  }

  close(): void {
    this.show('none');
  }

  private onKeyDown = (event: KeyboardEvent): void => {
    if (event.code !== 'Escape') return;
    if (this.screen === 'settings') {
      event.preventDefault();
      this.show(this.previousScreen);
    } else if (this.screen === 'pause') {
      event.preventDefault();
      this.handlers.onResume();
    }
  };
  private buildMainPanel(): HTMLDivElement {
    const panel = document.createElement('div');
    panel.className = 'menu-panel';
    panel.dataset.screen = 'main';
    panel.innerHTML = `
      <h1 class="menu-title">First-Person Minesweeper</h1>
      <p class="menu-subtitle">Deduce. Flag. Escape.</p>
      <div class="menu-actions">
        <button type="button" data-action="play" class="menu-button menu-button-primary">Play</button>
        <button type="button" data-action="settings" class="menu-button">Settings</button>
      </div>
      <div class="menu-install-hint" hidden>
        <p>For fullscreen landscape, tap <strong>Share → Add to Home Screen</strong>, then launch from the home icon.</p>
        <button type="button" data-action="dismiss-install" class="menu-button menu-button-quiet menu-button-small">Got it</button>
      </div>
      <p class="menu-footnote">Esc to pause · Right click / F to flag · WASD to move</p>
    `;
    panel.querySelector<HTMLButtonElement>('[data-action="play"]')!.addEventListener('click', () => this.handlers.onPlay());
    panel.querySelector<HTMLButtonElement>('[data-action="settings"]')!.addEventListener('click', () => this.show('settings'));
    const hint = panel.querySelector<HTMLDivElement>('.menu-install-hint')!;
    if (shouldShowInstallHint()) {
      hint.hidden = false;
    }
    panel.querySelector<HTMLButtonElement>('[data-action="dismiss-install"]')!.addEventListener('click', () => {
      hint.hidden = true;
      try { localStorage.setItem('mw3d.installHintDismissed.v1', '1'); } catch { /* ignore */ }
    });
    return panel;
  }

  private buildPausePanel(): HTMLDivElement {
    const panel = document.createElement('div');
    panel.className = 'menu-panel';
    panel.dataset.screen = 'pause';
    panel.innerHTML = `
      <h1 class="menu-title">Paused</h1>
      <div class="menu-actions">
        <button type="button" data-action="resume" class="menu-button menu-button-primary">Resume</button>
        <button type="button" data-action="restart" class="menu-button">Restart Chamber</button>
        <button type="button" data-action="settings" class="menu-button">Settings</button>
        <button type="button" data-action="quit" class="menu-button menu-button-quiet">Quit to Main</button>
      </div>
    `;
    panel.querySelector<HTMLButtonElement>('[data-action="resume"]')!.addEventListener('click', () => this.handlers.onResume());
    panel.querySelector<HTMLButtonElement>('[data-action="restart"]')!.addEventListener('click', () => this.handlers.onRestart());
    panel.querySelector<HTMLButtonElement>('[data-action="settings"]')!.addEventListener('click', () => this.show('settings'));
    panel.querySelector<HTMLButtonElement>('[data-action="quit"]')!.addEventListener('click', () => this.handlers.onQuitToMain());
    return panel;
  }

  private buildSettingsPanel(): HTMLDivElement {    const panel = document.createElement('div');
    panel.className = 'menu-panel';
    panel.dataset.screen = 'settings';
    panel.innerHTML = `
      <h1 class="menu-title">Settings</h1>
      <div class="menu-form">
        <label class="menu-field">
          <span class="menu-field-label">Quality</span>
          <select name="quality">
            <option value="auto">Auto-detect</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </label>
        <p class="menu-quality-notice" hidden>Quality changes apply after reload.</p>
        <label class="menu-field">
          <span class="menu-field-label">Mouse Sensitivity <span class="menu-range-value">1.00x</span></span>
          <input type="range" name="sensitivity" min="0.3" max="2" step="0.05" />
        </label>
      </div>
      <div class="menu-actions">
        <button type="button" data-action="back" class="menu-button menu-button-primary">Back</button>
      </div>
    `;
    const qualitySelect = panel.querySelector<HTMLSelectElement>('select[name="quality"]')!;
    qualitySelect.addEventListener('change', () => {
      const next = qualitySelect.value as QualityPreference;
      updateSettings({ quality: next });
      this.refreshQualityNotice(next);
    });
    const sensitivity = panel.querySelector<HTMLInputElement>('input[name="sensitivity"]')!;
    sensitivity.addEventListener('input', () => {
      const value = Number(sensitivity.value);
      updateSettings({ sensitivity: value });
      const valueLabel = panel.querySelector<HTMLSpanElement>('.menu-range-value');
      if (valueLabel) valueLabel.textContent = formatSensitivity(value);
    });
    panel.querySelector<HTMLButtonElement>('[data-action="back"]')!.addEventListener('click', () => this.show(this.previousScreen));
    return panel;
  }

  private refreshQualityNotice(next: QualityPreference): void {
    this.qualityNotice.hidden = next === this.appliedQuality;
  }

  private buildGameOverPanel(): HTMLDivElement {
    const panel = document.createElement('div');
    panel.className = 'menu-panel';
    panel.dataset.screen = 'gameover';
    panel.innerHTML = `
      <h1 class="menu-title menu-title-danger">Mine Triggered</h1>
      <p class="menu-subtitle">The chamber recorded your last move.</p>
      <div class="menu-actions">
        <button type="button" data-action="restart" class="menu-button menu-button-primary">Restart Chamber</button>
        <button type="button" data-action="quit" class="menu-button menu-button-quiet">Quit to Main</button>
      </div>
    `;
    panel.querySelector<HTMLButtonElement>('[data-action="restart"]')!.addEventListener('click', () => this.handlers.onRestart());
    panel.querySelector<HTMLButtonElement>('[data-action="quit"]')!.addEventListener('click', () => this.handlers.onQuitToMain());
    return panel;
  }
}

function formatSensitivity(value: number): string {
  return `${value.toFixed(2)}x`;
}

function shouldShowInstallHint(): boolean {
  if (typeof navigator === 'undefined' || typeof window === 'undefined') return false;
  try {
    if (localStorage.getItem('mw3d.installHintDismissed.v1') === '1') return false;
  } catch { /* ignore */ }
  // Treat any iOS Safari tab as the target. Skip when already standalone (installed PWA).
  const ua = navigator.userAgent || '';
  const isIOS = /iPhone|iPod|iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  if (!isIOS) return false;
  const standalone = (navigator as Navigator & { standalone?: boolean }).standalone === true
    || window.matchMedia('(display-mode: standalone)').matches
    || window.matchMedia('(display-mode: fullscreen)').matches;
  return !standalone;
}
