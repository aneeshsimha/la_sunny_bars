"use client";

import { useRef, useCallback, useEffect } from "react";
import { useUIStore } from "@/state/uiStore";

const SNAP_PEEK = 80; // px from bottom
const SNAP_HALF = "50vh";
const SNAP_FULL = "90dvh";

// Pixel values for snap points — computed once at runtime
function getSnapPx(): [number, number, number] {
  const vh = window.innerHeight;
  const dvh = window.visualViewport?.height ?? vh;
  return [
    vh - SNAP_PEEK,           // peek: sheet top = vh - 80px → translateY = vh - 80
    vh - vh * 0.5,            // half: sheet top = 50vh → translateY = 50vh
    dvh - dvh * 0.9,          // full: sheet top = 10dvh → translateY = 10dvh
  ];
}

type SheetSnap = "peek" | "half" | "full";
const SNAP_NAMES: SheetSnap[] = ["peek", "half", "full"];

interface BottomSheetProps {
  children: React.ReactNode;
}

export default function BottomSheet({ children }: BottomSheetProps) {
  const sheetSnap = useUIStore((s) => s.sheetSnap);
  const setSheetSnap = useUIStore((s) => s.setSheetSnap);

  const sheetRef = useRef<HTMLDivElement>(null);
  const dragState = useRef<{
    startY: number;
    startTranslateY: number;
    lastY: number;
    lastT: number;
    velocity: number;
  } | null>(null);
  const currentTranslateY = useRef<number | null>(null);

  // Compute translateY for a given snap name
  function snapToTranslate(snap: SheetSnap): number {
    const [peekY, halfY, fullY] = getSnapPx();
    if (snap === "peek") return peekY;
    if (snap === "half") return halfY;
    return fullY;
  }

  // Apply a translateY with transition
  function applySnap(snap: SheetSnap) {
    const el = sheetRef.current;
    if (!el) return;
    const y = snapToTranslate(snap);
    currentTranslateY.current = y;
    el.style.transition = "transform 0.3s cubic-bezier(0.32,0.72,0,1)";
    el.style.transform = `translateY(${y}px)`;
    // overflow only when full
    const content = el.querySelector<HTMLElement>("[data-sheet-content]");
    if (content) {
      content.style.overflowY = snap === "full" ? "auto" : "hidden";
    }
  }

  // Sync to store whenever sheetSnap changes
  useEffect(() => {
    applySnap(sheetSnap);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheetSnap]);

  // Also handle window resize
  useEffect(() => {
    const handleResize = () => applySnap(sheetSnap);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheetSnap]);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    const el = sheetRef.current;
    if (!el) return;
    const touch = e.touches[0];
    // Read current translateY from the element
    const matrix = new DOMMatrix(getComputedStyle(el).transform);
    const y = matrix.m42; // translateY
    currentTranslateY.current = y;
    el.style.transition = "none";
    dragState.current = {
      startY: touch.clientY,
      startTranslateY: y,
      lastY: touch.clientY,
      lastT: performance.now(),
      velocity: 0,
    };
  }, []);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    const el = sheetRef.current;
    if (!el || !dragState.current) return;
    const touch = e.touches[0];
    const dy = touch.clientY - dragState.current.startY;
    const now = performance.now();
    const dt = now - dragState.current.lastT;
    if (dt > 0) {
      dragState.current.velocity =
        (touch.clientY - dragState.current.lastY) / dt;
    }
    dragState.current.lastY = touch.clientY;
    dragState.current.lastT = now;

    const newY = dragState.current.startTranslateY + dy;
    const [, , fullY] = getSnapPx();
    // Clamp: don't go above full snap
    const clamped = Math.max(newY, fullY);
    currentTranslateY.current = clamped;
    el.style.transform = `translateY(${clamped}px)`;
  }, []);

  const onTouchEnd = useCallback(() => {
    const el = sheetRef.current;
    if (!el || !dragState.current) return;

    const velocity = dragState.current.velocity; // px/ms, positive = downward
    const currentY = currentTranslateY.current ?? snapToTranslate(sheetSnap);
    const [peekY, halfY, fullY] = getSnapPx();
    const snapYValues = [peekY, halfY, fullY];

    dragState.current = null;

    // Velocity-assisted snapping: if flicking fast, go to adjacent snap
    const VELOCITY_THRESHOLD = 0.5; // px/ms
    let targetSnap: SheetSnap;

    if (velocity > VELOCITY_THRESHOLD) {
      // Flicking down — go to next lower snap (larger Y = more closed)
      const currentIdx = SNAP_NAMES.indexOf(sheetSnap);
      const nextIdx = Math.min(currentIdx + 1, SNAP_NAMES.length - 1);
      targetSnap = SNAP_NAMES[nextIdx];
    } else if (velocity < -VELOCITY_THRESHOLD) {
      // Flicking up — go to next higher snap (smaller Y = more open)
      const currentIdx = SNAP_NAMES.indexOf(sheetSnap);
      const nextIdx = Math.max(currentIdx - 1, 0);
      targetSnap = SNAP_NAMES[nextIdx];
    } else {
      // Find closest snap by position
      let minDist = Infinity;
      let closestIdx = 0;
      snapYValues.forEach((snapY, i) => {
        const dist = Math.abs(currentY - snapY);
        if (dist < minDist) {
          minDist = dist;
          closestIdx = i;
        }
      });
      targetSnap = SNAP_NAMES[closestIdx];
    }

    setSheetSnap(targetSnap);
    // applySnap will fire via useEffect on sheetSnap change,
    // but sheetSnap may already equal targetSnap if user dragged back to same position.
    // Force apply directly to avoid no-op.
    applySnap(targetSnap);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheetSnap, setSheetSnap]);

  // On desktop (>768px), render nothing — sidebar is used instead
  if (typeof window !== "undefined" && window.innerWidth > 768) {
    return null;
  }

  return (
    <>
      <style>{`
        .bottom-sheet {
          --snap-peek: ${SNAP_PEEK}px;
          --snap-half: ${SNAP_HALF};
          --snap-full: ${SNAP_FULL};
          position: fixed;
          left: 0;
          right: 0;
          bottom: 0;
          height: 100dvh;
          background: var(--surface, #fff);
          border-radius: 16px 16px 0 0;
          box-shadow: 0 -2px 16px rgba(0,0,0,0.15);
          will-change: transform;
          z-index: 200;
          display: flex;
          flex-direction: column;
        }
        .bottom-sheet__handle-area {
          flex-shrink: 0;
          display: flex;
          justify-content: center;
          align-items: center;
          padding: 12px 0 8px;
          touch-action: none;
          cursor: grab;
        }
        .bottom-sheet__handle {
          width: 40px;
          height: 4px;
          border-radius: 2px;
          background: rgba(0,0,0,0.2);
        }
        .bottom-sheet__content {
          flex: 1;
          overflow-y: hidden;
          overscroll-behavior: contain;
        }
        @media (min-width: 769px) {
          .bottom-sheet {
            display: none;
          }
        }
      `}</style>
      <div
        ref={sheetRef}
        className="bottom-sheet"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        <div className="bottom-sheet__handle-area">
          <div className="bottom-sheet__handle" />
        </div>
        <div className="bottom-sheet__content" data-sheet-content="">
          {children}
        </div>
      </div>
    </>
  );
}
