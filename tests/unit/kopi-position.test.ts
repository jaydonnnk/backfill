import { describe, expect, it } from 'vitest';
import { safeKopiPosition } from '@/components/kopi-position';

describe('Kopi placement avoids controls', () => {
  it('retains a free drag position', () => {
    expect(safeKopiPosition({ x: 50, y: 60 }, { width: 100, height: 80 }, { width: 375, height: 800 }, [])).toEqual({ x: 50, y: 60 });
  });
  it('clamps the whole companion inside the viewport', () => {
    expect(safeKopiPosition({ x: 999, y: -50 }, { width: 100, height: 80 }, { width: 375, height: 800 }, [])).toEqual({ x: 267, y: 8 });
  });
  it('clamps the opposite edges too', () => {
    expect(safeKopiPosition({ x: -50, y: 999 }, { width: 100, height: 80 }, { width: 375, height: 800 }, [])).toEqual({ x: 8, y: 712 });
  });
  it.each([{ x: 8, y: 300 }, { x: 250, y: 300 }, { x: 150, y: 100 }, { x: 150, y: 500 }])('retains a non-overlapping position %j', position => {
    expect(safeKopiPosition(position, { width: 100, height: 80 }, { width: 375, height: 800 }, [{ x: 150, y: 300, width: 50, height: 20 }])).toEqual(position);
  });
  it('moves away from a button even when only its edge overlaps', () => {
    const position = safeKopiPosition({ x: 50, y: 60 }, { width: 100, height: 80 }, { width: 375, height: 800 }, [{ x: 149, y: 60, width: 50, height: 20 }]);
    expect(position).not.toBeNull();
    expect(position).not.toEqual({ x: 50, y: 60 });
    expect(position!.x + 100 <= 149 || position!.x >= 199 || position!.y + 80 <= 60 || position!.y >= 80).toBe(true);
  });
  it('temporarily hides when the viewport has no free space', () => {
    expect(safeKopiPosition({ x: 8, y: 8 }, { width: 100, height: 80 }, { width: 375, height: 800 }, [{ x: 0, y: 0, width: 375, height: 800 }])).toBeNull();
    expect(safeKopiPosition({ x: 8, y: 8 }, { width: 400, height: 80 }, { width: 375, height: 800 }, [])).toBeNull();
    expect(safeKopiPosition({ x: 8, y: 8 }, { width: 100, height: 900 }, { width: 375, height: 800 }, [])).toBeNull();
  });
});
