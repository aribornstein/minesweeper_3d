export type QualityPreference = 'auto' | 'low' | 'medium' | 'high';

export type GameSettings = {
  quality: QualityPreference;
  sensitivity: number;
};

const STORAGE_KEY = 'mw3d.settings.v1';
const DEFAULTS: GameSettings = {
  quality: 'auto',
  sensitivity: 1,
};

type Listener = (settings: GameSettings) => void;

const listeners = new Set<Listener>();
let current: GameSettings = load();

function load(): GameSettings {
  if (typeof localStorage === 'undefined') {
    return { ...DEFAULTS };
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<GameSettings>;
    return {
      quality: normalizeQuality(parsed.quality),
      sensitivity: clampSensitivity(parsed.sensitivity),
    };
  } catch {
    return { ...DEFAULTS };
  }
}

function persist(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch {
    // Storage unavailable (private mode, quota); ignore.
  }
}

function normalizeQuality(value: unknown): QualityPreference {
  return value === 'low' || value === 'medium' || value === 'high' || value === 'auto' ? value : 'auto';
}

function clampSensitivity(value: unknown): number {
  const num = typeof value === 'number' && Number.isFinite(value) ? value : DEFAULTS.sensitivity;
  return Math.min(2, Math.max(0.3, num));
}

export function getSettings(): GameSettings {
  return { ...current };
}

export function updateSettings(patch: Partial<GameSettings>): GameSettings {
  current = {
    quality: patch.quality !== undefined ? normalizeQuality(patch.quality) : current.quality,
    sensitivity: patch.sensitivity !== undefined ? clampSensitivity(patch.sensitivity) : current.sensitivity,
  };
  persist();
  for (const listener of listeners) listener({ ...current });
  return { ...current };
}

export function subscribeSettings(listener: Listener): () => void {
  listeners.add(listener);
  listener({ ...current });
  return () => listeners.delete(listener);
}

export function resetSettings(): GameSettings {
  return updateSettings(DEFAULTS);
}
