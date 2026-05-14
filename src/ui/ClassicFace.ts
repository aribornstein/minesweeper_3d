// Shared classic-Minesweeper face drawing helpers.
// Used by the scanner viewmodel and the game-over menu so both show the same face.

export type FaceMood = 'idle' | 'risky' | 'cool' | 'dead';

export function drawClassicTile(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  raised: boolean,
): void {
  const half = size / 2;
  context.fillStyle = raised ? '#c8c8c8' : '#bdbdbd';
  context.fillRect(x - half, y - half, size, size);
  context.lineWidth = 4;
  context.strokeStyle = raised ? '#f4f4f4' : '#777';
  context.beginPath();
  context.moveTo(x - half, y + half);
  context.lineTo(x - half, y - half);
  context.lineTo(x + half, y - half);
  context.stroke();
  context.strokeStyle = raised ? '#777' : '#f4f4f4';
  context.beginPath();
  context.moveTo(x + half, y - half);
  context.lineTo(x + half, y + half);
  context.lineTo(x - half, y + half);
  context.stroke();
  context.strokeStyle = '#444';
  context.lineWidth = 1;
  context.strokeRect(x - half, y - half, size, size);
}

function drawXEye(context: CanvasRenderingContext2D, x: number, y: number, size: number): void {
  context.lineWidth = 4;
  context.beginPath();
  context.moveTo(x - size, y - size);
  context.lineTo(x + size, y + size);
  context.moveTo(x + size, y - size);
  context.lineTo(x - size, y + size);
  context.stroke();
}

function drawSunglassLens(context: CanvasRenderingContext2D, x: number, y: number, size: number): void {
  context.fillStyle = '#111';
  context.beginPath();
  context.ellipse(x, y, size, size * 0.62, -0.18, 0, Math.PI * 2);
  context.fill();
}

export function drawClassicFace(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  mood: FaceMood,
): void {
  const faceRadius = radius * 0.74;
  const dead = mood === 'dead';
  const cool = mood === 'cool';
  const risky = mood === 'risky';

  drawClassicTile(context, x, y, radius * 2.22, true);

  const faceGradient = context.createRadialGradient(
    x - faceRadius * 0.25,
    y - faceRadius * 0.32,
    faceRadius * 0.1,
    x,
    y,
    faceRadius,
  );
  faceGradient.addColorStop(0, '#fff69a');
  faceGradient.addColorStop(1, dead ? '#f0c322' : '#ffe100');

  context.shadowColor = dead
    ? 'rgba(255, 61, 46, 0.32)'
    : cool
      ? 'rgba(85, 255, 157, 0.24)'
      : 'rgba(247, 212, 74, 0.28)';
  context.shadowBlur = 16;
  context.fillStyle = faceGradient;
  context.beginPath();
  context.arc(x, y, faceRadius, 0, Math.PI * 2);
  context.fill();
  context.shadowBlur = 0;
  context.strokeStyle = '#111';
  context.lineWidth = 4;
  context.stroke();

  context.strokeStyle = '#111';
  context.fillStyle = '#111';
  if (dead) {
    drawXEye(context, x - faceRadius * 0.35, y - faceRadius * 0.22, faceRadius * 0.13);
    drawXEye(context, x + faceRadius * 0.35, y - faceRadius * 0.22, faceRadius * 0.13);
  } else if (cool) {
    context.lineWidth = 4;
    context.beginPath();
    context.moveTo(x - faceRadius * 0.56, y - faceRadius * 0.22);
    context.lineTo(x + faceRadius * 0.56, y - faceRadius * 0.22);
    context.stroke();
    drawSunglassLens(context, x - faceRadius * 0.28, y - faceRadius * 0.2, faceRadius * 0.22);
    drawSunglassLens(context, x + faceRadius * 0.28, y - faceRadius * 0.2, faceRadius * 0.22);
  } else {
    context.beginPath();
    context.arc(x - faceRadius * 0.35, y - faceRadius * 0.22, faceRadius * 0.095, 0, Math.PI * 2);
    context.arc(x + faceRadius * 0.35, y - faceRadius * 0.22, faceRadius * 0.095, 0, Math.PI * 2);
    context.fill();
  }

  context.lineWidth = 5;
  context.strokeStyle = '#111';
  context.beginPath();
  if (dead) {
    context.arc(x, y + faceRadius * 0.42, faceRadius * 0.35, Math.PI * 1.08, Math.PI * 1.92);
  } else if (risky) {
    context.arc(x, y + faceRadius * 0.34, faceRadius * 0.16, 0, Math.PI * 2);
  } else {
    context.arc(x, y + faceRadius * 0.03, faceRadius * 0.42, 0.18 * Math.PI, 0.82 * Math.PI);
  }
  context.stroke();
}
