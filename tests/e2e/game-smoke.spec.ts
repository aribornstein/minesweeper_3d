import { expect, type Page, test } from '@playwright/test';

type DebugPhase = 'ready' | 'playing' | 'failed' | 'solved' | 'escaped';

type DebugLevel = {
  levelNumber: number;
  name: string;
  sector: string;
  chamber: string;
  width: number;
  depth: number;
  mineCount: number;
  mineDensity: number;
};

type DebugProgress = {
  mineCount: number;
  flaggedCount: number;
  correctFlagCount: number;
  revealedSafeCount: number;
  safeTileCount: number;
};

declare global {
  interface Window {
    __minesweeperDebug?: {
      phase: () => DebugPhase;
      progress: () => DebugProgress;
      reset: () => DebugPhase;
      solve: () => DebugPhase;
      fail: () => DebugPhase;
      activeExplosions: () => number;
      triggeredExplosions: () => number;
      cameraPosition: () => { x: number; y: number; z: number };
      moveToTile: (tileX: number, tileZ: number) => { x: number; y: number; z: number };
      exitSignal: () => { glow: string; status: string };
      level: () => DebugLevel;
    };
  }
}

test('boots the first-person Minesweeper scene', async ({ page }) => {
  const consoleErrors: string[] = [];

  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text());
    }
  });

  await page.goto('/');
  await page.waitForFunction(() => Boolean(window.__minesweeperDebug));

  const canvas = page.locator('#game-canvas');
  await expect(canvas).toBeVisible();
  await expect(page.getByRole('button', { name: 'Enter Chamber 01' })).toBeVisible();
  await expect(page.locator('.mission-title')).toBeHidden();
  await expect(page.locator('#hud')).toBeHidden();
  await expect(page.locator('.legend')).toBeHidden();
  await expect(page.locator('.loop-strip')).toBeHidden();

  const canvasBox = await canvas.boundingBox();
  expect(canvasBox?.width).toBeGreaterThan(500);
  expect(canvasBox?.height).toBeGreaterThan(300);

  await expectRenderedPixels(page);
  expect(consoleErrors).toEqual([]);

  const level = await page.evaluate(() => window.__minesweeperDebug?.level());
  expect(level).toMatchObject({ levelNumber: 1, chamber: 'Maintenance Bay', width: 5, depth: 6, mineCount: 3 });
});

test('supports failure, checkpoint reset, and solved exit flow', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => Boolean(window.__minesweeperDebug));

  await page.getByRole('button', { name: 'Enter Chamber 01' }).click();
  const firstLevel = await page.evaluate(() => window.__minesweeperDebug?.level());

  await expect.poll(async () => page.evaluate(() => window.__minesweeperDebug?.exitSignal().glow)).toBe('#ff3d2e');

  const failedPhase = await page.evaluate(() => window.__minesweeperDebug?.fail());
  expect(failedPhase).toBe('failed');
  await expect.poll(async () => page.evaluate(() => window.__minesweeperDebug?.triggeredExplosions() ?? 0)).toBeGreaterThan(0);
  await expect.poll(async () => page.evaluate(() => window.__minesweeperDebug?.activeExplosions() ?? 0)).toBeGreaterThan(0);
  await expect(page.getByText('Mine triggered. Checkpoint restored.')).toBeHidden();

  await page.getByRole('button', { name: 'Restart Chamber 01' }).click();
  await expect.poll(async () => page.evaluate(() => window.__minesweeperDebug?.phase())).toBe('playing');
  await expect(page.getByText('Mine triggered. Checkpoint restored.')).toBeHidden();
  await expect.poll(async () => page.evaluate(() => window.__minesweeperDebug?.exitSignal().glow)).toBe('#ff3d2e');

  const restartPosition = await page.evaluate(() => window.__minesweeperDebug?.cameraPosition());
  await page.keyboard.down('ArrowUp');
  await page.waitForTimeout(180);
  await page.keyboard.up('ArrowUp');
  const movedAfterRestart = await page.evaluate(() => window.__minesweeperDebug?.cameraPosition());
  expect(Math.hypot((movedAfterRestart?.x ?? 0) - (restartPosition?.x ?? 0), (movedAfterRestart?.z ?? 0) - (restartPosition?.z ?? 0))).toBeGreaterThan(0.05);

  const solvedPhase = await page.evaluate(() => window.__minesweeperDebug?.solve());
  expect(solvedPhase).toBe('solved');
  await expect(page.getByText('Safe route confirmed. Exit unlocked.')).toBeHidden();
  await expect.poll(async () => page.evaluate(() => window.__minesweeperDebug?.exitSignal().glow)).toBe('#36ff96');

  const progress = await page.evaluate(() => window.__minesweeperDebug?.progress());
  expect(progress?.correctFlagCount).toBe(progress?.mineCount);

  await page.keyboard.down('ArrowUp');
  await expect
    .poll(async () => page.evaluate(() => window.__minesweeperDebug?.level().levelNumber), { timeout: 8_000 })
    .toBe((firstLevel?.levelNumber ?? 1) + 1);
  await page.keyboard.up('ArrowUp');
  await expect.poll(async () => page.evaluate(() => window.__minesweeperDebug?.phase()), { timeout: 4_000 }).toBe('playing');

  const nextLevel = await page.evaluate(() => window.__minesweeperDebug?.level());
  expect(nextLevel?.width).toBeGreaterThan(firstLevel?.width ?? 0);
  expect(nextLevel?.depth).toBeGreaterThan(firstLevel?.depth ?? 0);
  expect(nextLevel?.mineCount).toBeGreaterThan(firstLevel?.mineCount ?? 0);
  expect(nextLevel?.mineDensity).toBeGreaterThan(firstLevel?.mineDensity ?? 0);
  expect(nextLevel?.chamber).not.toBe(firstLevel?.chamber);
  expect(await page.evaluate(() => window.__minesweeperDebug?.phase())).toBe('playing');
  await expect.poll(async () => page.evaluate(() => window.__minesweeperDebug?.exitSignal().glow)).toBe('#ff3d2e');
  await expectRenderedPixels(page);
});

test('drops a flag on the targeted tile through player input', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => Boolean(window.__minesweeperDebug));

  await page.evaluate(() => window.__minesweeperDebug?.reset());
  const mineCount = await page.evaluate(() => window.__minesweeperDebug?.progress().mineCount ?? 0);
  await expect(page.locator('#scanner-title')).toContainText('Unknown tile');

  await page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('#game-canvas');
    canvas?.dispatchEvent(new PointerEvent('pointerdown', { button: 2, bubbles: true, cancelable: true }));
  });

  await expect(page.getByText(`Flags 1/${mineCount}`)).toBeVisible();
  await expect(page.locator('#scanner-title')).toContainText('Beacon placed');
});

test('supports arrow-key movement alongside WASD', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => Boolean(window.__minesweeperDebug));

  await page.getByRole('button', { name: 'Enter Chamber 01' }).click();
  const before = await page.evaluate(() => window.__minesweeperDebug?.cameraPosition());
  await page.keyboard.down('ArrowUp');
  await page.waitForTimeout(180);
  await page.keyboard.up('ArrowUp');
  const after = await page.evaluate(() => window.__minesweeperDebug?.cameraPosition());

  expect(Math.hypot((after?.x ?? 0) - (before?.x ?? 0), (after?.z ?? 0) - (before?.z ?? 0))).toBeGreaterThan(0.05);
});

test.describe('mobile step activation', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });

  test('activates a safe tile by walking over it', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => Boolean(window.__minesweeperDebug));

    await page.evaluate(() => window.__minesweeperDebug?.reset());
    const before = await page.evaluate(() => window.__minesweeperDebug?.progress().revealedSafeCount ?? 0);

    await page.evaluate(() => window.__minesweeperDebug?.moveToTile(2, 3));

    await expect
      .poll(async () => page.evaluate(() => window.__minesweeperDebug?.progress().revealedSafeCount ?? 0))
      .toBeGreaterThan(before);
  });
});

async function expectRenderedPixels(page: Page): Promise<void> {
  await expect
    .poll(async () => (await readRenderStats(page)).nonBlankPixels, { timeout: 10_000 })
    .toBeGreaterThan(80);
  await expect
    .poll(async () => (await readRenderStats(page)).brightestPixel, { timeout: 10_000 })
    .toBeGreaterThan(120);
}

async function readRenderStats(page: Page): Promise<{ nonBlankPixels: number; brightestPixel: number }> {
  return page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('#game-canvas');

    if (!canvas) {
      return { nonBlankPixels: 0, brightestPixel: 0 };
    }

    const sampleCanvas = document.createElement('canvas');
    sampleCanvas.width = 80;
    sampleCanvas.height = 45;
    const context = sampleCanvas.getContext('2d');

    if (!context) {
      return { nonBlankPixels: 0, brightestPixel: 0 };
    }

    context.drawImage(canvas, 0, 0, sampleCanvas.width, sampleCanvas.height);
    const pixels = context.getImageData(0, 0, sampleCanvas.width, sampleCanvas.height).data;
    let nonBlankPixels = 0;
    let brightestPixel = 0;

    for (let index = 0; index < pixels.length; index += 4) {
      const red = pixels[index];
      const green = pixels[index + 1];
      const blue = pixels[index + 2];
      const brightness = red + green + blue;

      brightestPixel = Math.max(brightestPixel, brightness);

      if (brightness > 35) {
        nonBlankPixels += 1;
      }
    }

    return { nonBlankPixels, brightestPixel };
  });
}