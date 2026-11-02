export type Point = { x: number; y: number };
type Size = { width: number; height: number };
type Rect = Point & Size;

export function safeKopiPosition(preferred: Point, size: Size, viewport: Size, controls: Rect[]): Point | null {
  const right = viewport.width - size.width - 8;
  const bottom = viewport.height - size.height - 8;
  if (right < 8 || bottom < 8) return null;
  const clamped = { x: Math.max(8, Math.min(right, preferred.x)), y: Math.max(8, Math.min(bottom, preferred.y)) };
  const candidates = [clamped];
  for (let y = bottom; y >= 8; y -= 32) candidates.push({ x: right, y }, { x: 8, y });
  candidates.push({ x: right, y: 8 }, { x: 8, y: 8 });
  return candidates.find(p => !controls.some(c => p.x < c.x + c.width && p.x + size.width > c.x && p.y < c.y + c.height && p.y + size.height > c.y)) ?? null;
}
