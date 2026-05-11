import { expect, type Page, test } from '@playwright/test';

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
  await expect(page.getByText('First-Person Minesweeper')).toBeVisible();
  await expect(page.getByText('Enter Training Sector')).toBeVisible();
  await expect(page.getByText('Training Facility / Sector 7')).toBeVisible();
  await expect(page.getByText('Reach the Exit')).toBeVisible();
  await expect(page.getByText('Scanner v2.1')).toBeVisible();
  await expect(page.getByText('Route Status')).toBeVisible();

  const canvasBox = await canvas.boundingBox();
  expect(canvasBox?.width).toBeGreaterThan(500);
  expect(canvasBox?.height).toBeGreaterThan(300);

  await expectRenderedPixels(page);
  expect(consoleErrors).toEqual([]);
});

test('supports failure, checkpoint reset, and solved exit flow', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => Boolean(window.__minesweeperDebug));

  const failedPhase = await page.evaluate(() => window.__minesweeperDebug?.fail());
  expect(failedPhase).toBe('failed');
  await expect.poll(async () => page.evaluate(() => window.__minesweeperDebug?.activeExplosions() ?? 0)).toBeGreaterThan(0);
  await expect(page.getByText('Mine triggered. Checkpoint restored.')).toBeVisible();
  await expect(page.getByText('Alarm: mine detected')).toBeVisible();

  const resetPhase = await page.evaluate(() => window.__minesweeperDebug?.reset());
  expect(resetPhase).toBe('playing');
  await expect(page.getByText('Mine triggered. Checkpoint restored.')).toBeHidden();

  const solvedPhase = await page.evaluate(() => window.__minesweeperDebug?.solve());
  expect(solvedPhase).toBe('solved');
  await expect(page.getByText('Safe route confirmed. Exit unlocked.')).toBeVisible();
  await expect(page.getByText('Path assist')).toBeVisible();

  const progress = await page.evaluate(() => window.__minesweeperDebug?.progress());
  expect(progress?.correctFlagCount).toBe(progress?.mineCount);
  await expectRenderedPixels(page);
});

test('drops a flag on the targeted tile through player input', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => Boolean(window.__minesweeperDebug));

  await page.evaluate(() => window.__minesweeperDebug?.reset());
  await expect(page.locator('#scanner-title')).toContainText('Unknown tile');

  await page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('#game-canvas');
    canvas?.dispatchEvent(new PointerEvent('pointerdown', { button: 2, bubbles: true, cancelable: true }));
  });

  await expect(page.getByText('Flags 1/10')).toBeVisible();
  await expect(page.locator('#scanner-title')).toContainText('Beacon placed');
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