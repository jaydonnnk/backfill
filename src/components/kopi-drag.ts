"use client";

import { useLayoutEffect, useRef, type KeyboardEvent, type PointerEvent } from 'react';
import { safeKopiPosition, type Point } from './kopi-position';

export function useKopiDrag(visible: boolean) {
  const ref = useRef<HTMLElement>(null);
  const preferred = useRef<Point | null>(null);
  const dragging = useRef<Point | null>(null);
  const reposition = useRef(() => {});
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    function place() {
      if (!element) return;
      const size = element.getBoundingClientRect();
      const controls = [...document.querySelectorAll('button,a,input,select,textarea,summary,[role="button"]')]
        .filter(control => !element.contains(control))
        .map(control => control.getBoundingClientRect());
      const position = safeKopiPosition(preferred.current ?? { x: innerWidth - size.width - 24, y: innerHeight - size.height - 12 }, size, { width: innerWidth, height: innerHeight }, controls);
      element.style.visibility = position ? 'visible' : 'hidden';
      if (position) {
        element.style.left = `${position.x}px`;
        element.style.top = `${position.y}px`;
        element.style.right = 'auto';
        element.style.bottom = 'auto';
      }
    }
    reposition.current = place;
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    const resize = new ResizeObserver(place);
    resize.observe(element);
    const changes = new MutationObserver(place);
    const content = document.getElementById('content');
    if (content) changes.observe(content, { childList: true, subtree: true, attributes: true });
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
      resize.disconnect();
      changes.disconnect();
    };
  }, [visible]);
  function onPointerDown(event: PointerEvent<HTMLButtonElement>) {
    if (event.button !== 0 || !ref.current) return;
    const bounds = ref.current.getBoundingClientRect();
    dragging.current = { x: event.clientX - bounds.x, y: event.clientY - bounds.y };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function onPointerMove(event: PointerEvent<HTMLButtonElement>) {
    if (!dragging.current) return;
    preferred.current = { x: event.clientX - dragging.current.x, y: event.clientY - dragging.current.y };
    reposition.current();
  }
  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    const deltas: Record<string, Point> = { ArrowLeft: { x: -24, y: 0 }, ArrowRight: { x: 24, y: 0 }, ArrowUp: { x: 0, y: -24 }, ArrowDown: { x: 0, y: 24 } };
    const delta = deltas[event.key];
    if (!delta || !ref.current) return;
    event.preventDefault();
    const bounds = ref.current.getBoundingClientRect();
    preferred.current = { x: bounds.x + delta.x, y: bounds.y + delta.y };
    reposition.current();
  }
  return { ref, handle: { onPointerDown, onPointerMove, onPointerUp: () => { dragging.current = null; }, onPointerCancel: () => { dragging.current = null; }, onKeyDown } };
}
