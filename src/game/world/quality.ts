export type QualityTier = 'low' | 'medium' | 'high';

export type QualitySettings = {
  tier: QualityTier;
  pixelRatio: number;
  shadowMapSize: number;
  enableGtao: boolean;
  enableSmaa: boolean;
  enableLut: boolean;
  enableBloom: boolean;
  enableShadows: boolean;
  rectAreaLightDensity: number;
};

const TIER_SETTINGS: Record<QualityTier, Omit<QualitySettings, 'tier' | 'pixelRatio'>> = {
  high: {
    shadowMapSize: 2048,
    enableGtao: true,
    enableSmaa: true,
    enableLut: true,
    enableBloom: true,
    enableShadows: true,
    rectAreaLightDensity: 1,
  },
  medium: {
    shadowMapSize: 1024,
    enableGtao: false,
    enableSmaa: true,
    enableLut: true,
    enableBloom: true,
    enableShadows: true,
    rectAreaLightDensity: 0.55,
  },
  low: {
    shadowMapSize: 768,
    enableGtao: false,
    enableSmaa: false,
    enableLut: false,
    enableBloom: false,
    enableShadows: false,
    rectAreaLightDensity: 0.25,
  },
};

const PIXEL_RATIO_CAP: Record<QualityTier, number> = {
  high: 2.0,
  medium: 2.0,
  low: 1.5,
};

export function detectQualityTier(): QualitySettings {
  const override = readOverride();
  const tier = override ?? autoDetectTier();
  const settings = TIER_SETTINGS[tier];
  const pixelRatio = Math.min(typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1, PIXEL_RATIO_CAP[tier]);
  return { tier, pixelRatio, ...settings };
}

function autoDetectTier(): QualityTier {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return 'high';
  }
  const dpr = window.devicePixelRatio || 1;
  const cores = navigator.hardwareConcurrency || 4;
  const isCoarsePointer = window.matchMedia('(pointer: coarse)').matches;
  const isNarrow = window.innerWidth < 900;
  const memoryGb = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 4;

  if (isCoarsePointer || isNarrow || cores <= 2 || memoryGb <= 2) {
    return 'low';
  }
  if (cores <= 4 || dpr < 1.5 || memoryGb <= 4) {
    return 'medium';
  }
  return 'high';
}

function readOverride(): QualityTier | undefined {
  if (typeof window === 'undefined') return undefined;
  const params = new URLSearchParams(window.location.search);
  const raw = params.get('quality');
  if (raw === 'low' || raw === 'medium' || raw === 'high') {
    return raw;
  }
  try {
    const stored = localStorage.getItem('mw3d.settings.v1');
    if (stored) {
      const parsed = JSON.parse(stored) as { quality?: string };
      if (parsed.quality === 'low' || parsed.quality === 'medium' || parsed.quality === 'high') {
        return parsed.quality;
      }
    }
  } catch {
    // Ignore storage failures.
  }
  return undefined;
}
