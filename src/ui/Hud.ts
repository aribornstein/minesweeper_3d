import type { BoardProgress, GamePhase, LevelDefinition, TileState } from '../game/types';

export class Hud {
  private level: LevelDefinition | undefined;
  private readonly scannerTitle = document.querySelector<HTMLElement>('#scanner-title');
  private readonly scannerDetail = document.querySelector<HTMLElement>('#scanner-detail');
  private readonly sectorLabel = document.querySelector<HTMLElement>('#sector-label');
  private readonly objectiveTitle = document.querySelector<HTMLElement>('#objective-title');
  private readonly objectiveDetail = document.querySelector<HTMLElement>('#objective-detail');
  private readonly statusTitle = document.querySelector<HTMLElement>('#status-title');
  private readonly statusDetail = document.querySelector<HTMLElement>('#status-detail');
  private readonly progressSafe = document.querySelector<HTMLElement>('#progress-safe');
  private readonly progressFlags = document.querySelector<HTMLElement>('#progress-flags');
  private readonly loopRisk = document.querySelector<HTMLElement>('#loop-risk');
  private readonly loopLearn = document.querySelector<HTMLElement>('#loop-learn');
  private readonly loopSolve = document.querySelector<HTMLElement>('#loop-solve');
  private readonly banner = document.querySelector<HTMLElement>('#state-banner');
  private readonly startButton = document.querySelector<HTMLButtonElement>('#start-button');

  onStartRequested(callback: () => void): void {
    this.startButton?.addEventListener('click', callback);
  }

  setLevel(level: LevelDefinition): void {
    this.level = level;

    if (this.sectorLabel) {
      this.sectorLabel.textContent = `${level.name} / ${level.sector}`;
    }
  }

  setPhase(phase: GamePhase): void {
    document.body.dataset.phase = phase;

    if (this.startButton) {
      this.startButton.hidden = phase === 'playing' || phase === 'solved' || phase === 'escaped';
      const chamberLabel = this.level ? `Chamber ${String(this.level.levelNumber).padStart(2, '0')}` : 'Training Sector';
      this.startButton.textContent = phase === 'ready' ? `Enter ${chamberLabel}` : `Restart ${chamberLabel}`;
    }

    if (!this.banner) {
      return;
    }

    if (phase === 'failed') {
      this.banner.hidden = false;
      this.banner.textContent = 'Mine triggered. Checkpoint restored.';
      this.banner.dataset.state = 'failed';
    } else if (phase === 'solved') {
      this.banner.hidden = false;
      this.banner.textContent = 'Safe route confirmed. Exit unlocked.';
      this.banner.dataset.state = 'solved';
    } else if (phase === 'escaped') {
      this.banner.hidden = false;
      this.banner.textContent = 'Escape complete. Training sector cleared.';
      this.banner.dataset.state = 'escaped';
    } else {
      this.banner.hidden = true;
      this.banner.textContent = '';
      delete this.banner.dataset.state;
    }

    this.setPhaseCopy(phase);
  }

  setProgress(progress: BoardProgress): void {
    if (this.progressSafe) {
      this.progressSafe.textContent = `Safe ${progress.revealedSafeCount}/${progress.safeTileCount}`;
    }

    if (this.progressFlags) {
      this.progressFlags.textContent = `Flags ${progress.flaggedCount}/${progress.mineCount}`;
    }
  }

  setScannerTile(tile: TileState | undefined, adjacentFlags: number, phase: GamePhase, progress: BoardProgress): void {
    if (!this.scannerTitle || !this.scannerDetail) {
      return;
    }

    if (phase === 'failed') {
      this.scannerTitle.textContent = 'Alarm: mine detected';
      this.scannerDetail.textContent = `Correct flags: ${progress.correctFlagCount}/${progress.mineCount}`;
      return;
    }

    if (phase === 'solved' || phase === 'escaped') {
      this.scannerTitle.textContent = phase === 'escaped' ? 'Exit clear' : 'Path assist';
      this.scannerDetail.textContent = 'Safe route confirmed';
      return;
    }

    if (!tile) {
      this.scannerTitle.textContent = 'No tile targeted';
      this.scannerDetail.textContent = 'Range: 1 tile';
      return;
    }

    if (tile.flagged) {
      this.scannerTitle.textContent = 'Beacon placed';
      this.scannerDetail.textContent = `Flags nearby: ${adjacentFlags}`;
      return;
    }

    if (!tile.revealed) {
      this.scannerTitle.textContent = 'Unknown tile';
      this.scannerDetail.textContent = `Flags nearby: ${adjacentFlags}`;
      return;
    }

    if (tile.hasMine) {
      this.scannerTitle.textContent = 'Mine detected';
      this.scannerDetail.textContent = 'System critical';
      return;
    }

    this.scannerTitle.textContent = tile.adjacentMines === 0 ? 'Clear tile' : `${tile.adjacentMines} adjacent mines`;
    this.scannerDetail.textContent = `Flags nearby: ${adjacentFlags}`;
  }

  private setPhaseCopy(phase: GamePhase): void {
    if (!this.objectiveTitle || !this.objectiveDetail || !this.statusTitle || !this.statusDetail) {
      return;
    }

    if (phase === 'failed') {
      this.objectiveTitle.textContent = 'Learn and retry';
      this.objectiveDetail.textContent = 'Failure revealed the pattern';
      this.statusTitle.textContent = 'Checkpoint restored';
      this.statusDetail.textContent = 'The minefield remains readable';
      this.setLoopState('learn');
      return;
    }

    if (phase === 'solved' || phase === 'escaped') {
      this.objectiveTitle.textContent = phase === 'escaped' ? 'Sector cleared' : 'Reach the Exit';
      this.objectiveDetail.textContent = 'Route unlocked';
      this.statusTitle.textContent = 'Safe route confirmed';
      this.statusDetail.textContent = 'Exit door opening';
      this.setLoopState('solve');
      return;
    }

    this.objectiveTitle.textContent = 'Reach the Exit';
    this.objectiveDetail.textContent = 'Avoid all mines';
    this.statusTitle.textContent = 'Checkpoint armed';
    this.statusDetail.textContent = 'Deduce the safe path tile by tile';
    this.setLoopState('risk');
  }

  private setLoopState(activeState: 'risk' | 'learn' | 'solve'): void {
    this.loopRisk?.toggleAttribute('data-active', activeState === 'risk');
    this.loopLearn?.toggleAttribute('data-active', activeState === 'learn');
    this.loopSolve?.toggleAttribute('data-active', activeState === 'solve');
  }
}