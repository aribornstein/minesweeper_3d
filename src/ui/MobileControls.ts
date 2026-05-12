import type { GamePhase } from '../game/types';

type MobileControlsCallbacks = {
  onMove: (x: number, z: number) => void;
  onLook: (movementX: number, movementY: number) => void;
  onReveal: () => void;
  onFlag: () => void;
  onReset: () => void;
};

export class MobileControls {
  private readonly root = document.querySelector<HTMLElement>('#mobile-controls');
  private readonly stick = document.querySelector<HTMLElement>('#mobile-stick');
  private readonly knob = document.querySelector<HTMLElement>('#mobile-stick-knob');
  private readonly lookPad = document.querySelector<HTMLElement>('#mobile-look-pad');
  private readonly revealButton = document.querySelector<HTMLButtonElement>('#mobile-reveal-button');
  private readonly flagButton = document.querySelector<HTMLButtonElement>('#mobile-flag-button');
  private readonly resetButton = document.querySelector<HTMLButtonElement>('#mobile-reset-button');
  private readonly enabled = window.matchMedia('(pointer: coarse)').matches;
  private stickPointerId: number | undefined;
  private lookPointerId: number | undefined;
  private lastLookX = 0;
  private lastLookY = 0;
  private active = false;

  constructor(private readonly callbacks: MobileControlsCallbacks) {
    this.root?.toggleAttribute('data-enabled', this.enabled);
    this.root?.addEventListener('contextmenu', this.preventDefault);
    this.stick?.addEventListener('pointerdown', this.onStickPointerDown);
    this.stick?.addEventListener('pointermove', this.onStickPointerMove);
    this.stick?.addEventListener('pointerup', this.onStickPointerUp);
    this.stick?.addEventListener('pointercancel', this.onStickPointerUp);
    this.lookPad?.addEventListener('pointerdown', this.onLookPointerDown);
    this.lookPad?.addEventListener('pointermove', this.onLookPointerMove);
    this.lookPad?.addEventListener('pointerup', this.onLookPointerUp);
    this.lookPad?.addEventListener('pointercancel', this.onLookPointerUp);
    this.revealButton?.addEventListener('click', this.onRevealClick);
    this.flagButton?.addEventListener('click', this.onFlagClick);
    this.resetButton?.addEventListener('click', this.onResetClick);
    this.setPhase('ready');
  }

  setPhase(phase: GamePhase): void {
    this.active = this.enabled && (phase === 'playing' || phase === 'solved');

    if (this.root) {
      this.root.hidden = !this.active;
    }

    if (!this.active) {
      this.resetStick();
    }
  }

  private onStickPointerDown = (event: PointerEvent): void => {
    if (!this.active || !this.stick) {
      return;
    }

    event.preventDefault();
    this.stickPointerId = event.pointerId;
    this.stick.setPointerCapture(event.pointerId);
    this.updateStick(event);
  };

  private onStickPointerMove = (event: PointerEvent): void => {
    if (event.pointerId !== this.stickPointerId) {
      return;
    }

    event.preventDefault();
    this.updateStick(event);
  };

  private onStickPointerUp = (event: PointerEvent): void => {
    if (event.pointerId !== this.stickPointerId) {
      return;
    }

    event.preventDefault();
    this.stickPointerId = undefined;
    this.resetStick();
  };

  private updateStick(event: PointerEvent): void {
    if (!this.stick || !this.knob) {
      return;
    }

    const rect = this.stick.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const maxDistance = rect.width * 0.34;
    const rawX = event.clientX - centerX;
    const rawY = event.clientY - centerY;
    const distance = Math.min(Math.hypot(rawX, rawY), maxDistance);
    const angle = Math.atan2(rawY, rawX);
    const knobX = Math.cos(angle) * distance;
    const knobY = Math.sin(angle) * distance;

    this.knob.style.transform = `translate(${knobX}px, ${knobY}px)`;
    this.callbacks.onMove(knobX / maxDistance, -knobY / maxDistance);
  }

  private resetStick(): void {
    this.callbacks.onMove(0, 0);

    if (this.knob) {
      this.knob.style.transform = 'translate(0, 0)';
    }
  }

  private onLookPointerDown = (event: PointerEvent): void => {
    if (!this.active || !this.lookPad) {
      return;
    }

    event.preventDefault();
    this.lookPointerId = event.pointerId;
    this.lastLookX = event.clientX;
    this.lastLookY = event.clientY;
    this.lookPad.setPointerCapture(event.pointerId);
  };

  private onLookPointerMove = (event: PointerEvent): void => {
    if (event.pointerId !== this.lookPointerId) {
      return;
    }

    event.preventDefault();
    this.callbacks.onLook(event.clientX - this.lastLookX, event.clientY - this.lastLookY);
    this.lastLookX = event.clientX;
    this.lastLookY = event.clientY;
  };

  private onLookPointerUp = (event: PointerEvent): void => {
    if (event.pointerId !== this.lookPointerId) {
      return;
    }

    event.preventDefault();
    this.lookPointerId = undefined;
  };

  private onRevealClick = (event: MouseEvent): void => {
    event.preventDefault();
    this.callbacks.onReveal();
  };

  private onFlagClick = (event: MouseEvent): void => {
    event.preventDefault();
    this.callbacks.onFlag();
  };

  private onResetClick = (event: MouseEvent): void => {
    event.preventDefault();
    this.callbacks.onReset();
  };

  private preventDefault = (event: Event): void => {
    event.preventDefault();
  };
}