import { useState, useRef, useEffect, useCallback } from 'react';
import * as Bz from '../../lib/math.js';

const ZMIN = 0.15, ZMAX = 12;

function dot(ctx, x, y, r, fill, stroke, sw) {
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = sw || 2; ctx.stroke(); }
}

function strokePoly(ctx, pts, color, width, dash) {
  if (pts.length < 2) return;
  ctx.save();
  ctx.strokeStyle = color; ctx.lineWidth = width;
  ctx.lineJoin = "round"; ctx.lineCap = "round";
  ctx.setLineDash(dash || []);
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.stroke();
  ctx.restore();
}

function makeHelpers(view, width, height) {
  const { scale, ox, oy } = view;
  return {
    scale, ox, oy, width, height,
    w2s: (p) => ({ x: p.x * scale + ox, y: p.y * scale + oy }),
    s2w: (p) => ({ x: (p.x - ox) / scale, y: (p.y - oy) / scale }),
  };
}

function useViewport(initial) {
  const [view, setView] = useState(initial || { scale: 1, ox: 0, oy: 0 });
  const zoomAt = useCallback((factor, sx, sy) => {
    setView((v) => {
      const ns = Bz.clamp(v.scale * factor, ZMIN, ZMAX);
      const k = ns / v.scale;
      return { scale: ns, ox: sx - (sx - v.ox) * k, oy: sy - (sy - v.oy) * k };
    });
  }, []);
  return [view, setView, zoomAt];
}

function drawGrid(ctx, view, W, H, gridSize) {
  const css = getComputedStyle(document.documentElement);
  const minor = css.getPropertyValue("--grid-minor").trim();
  const major = css.getPropertyValue("--grid-major").trim();
  const axis = css.getPropertyValue("--grid-axis").trim();
  const { scale, ox, oy } = view;

  let g = gridSize;
  let px = g * scale;
  while (px < 7) { g *= 5; px = g * scale; }

  const x0 = -ox / scale, x1 = (W - ox) / scale;
  const y0 = -oy / scale, y1 = (H - oy) / scale;
  const startX = Math.floor(x0 / g) * g, startY = Math.floor(y0 / g) * g;

  ctx.lineWidth = 1;
  ctx.strokeStyle = minor;
  ctx.beginPath();
  for (let x = startX; x <= x1; x += g) {
    const sx = Math.round(x * scale + ox) + 0.5;
    ctx.moveTo(sx, 0); ctx.lineTo(sx, H);
  }
  for (let y = startY; y <= y1; y += g) {
    const sy = Math.round(y * scale + oy) + 0.5;
    ctx.moveTo(0, sy); ctx.lineTo(W, sy);
  }
  ctx.stroke();

  ctx.strokeStyle = major;
  ctx.beginPath();
  const gm = g * 5;
  const smX = Math.floor(x0 / gm) * gm, smY = Math.floor(y0 / gm) * gm;
  for (let x = smX; x <= x1; x += gm) {
    const sx = Math.round(x * scale + ox) + 0.5;
    ctx.moveTo(sx, 0); ctx.lineTo(sx, H);
  }
  for (let y = smY; y <= y1; y += gm) {
    const sy = Math.round(y * scale + oy) + 0.5;
    ctx.moveTo(0, sy); ctx.lineTo(W, sy);
  }
  ctx.stroke();

  ctx.strokeStyle = axis;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  const ax = Math.round(ox) + 0.5, ay = Math.round(oy) + 0.5;
  if (ay > 0 && ay < H) { ctx.moveTo(0, ay); ctx.lineTo(W, ay); }
  if (ax > 0 && ax < W) { ctx.moveTo(ax, 0); ctx.lineTo(ax, H); }
  ctx.stroke();
}

function fitToPoints(points, W, H, pad, maxScale) {
  if (!points.length || !W || !H) return null;
  let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
  for (const p of points) {
    minx = Math.min(minx, p.x); miny = Math.min(miny, p.y);
    maxx = Math.max(maxx, p.x); maxy = Math.max(maxy, p.y);
  }
  pad = pad == null ? 80 : pad;
  const bw = Math.max(maxx - minx, 1), bh = Math.max(maxy - miny, 1);
  let scale = Math.min((W - pad * 2) / bw, (H - pad * 2) / bh);
  scale = Bz.clamp(scale, ZMIN, maxScale || ZMAX);
  const cx = (minx + maxx) / 2, cy = (miny + maxy) / 2;
  return { scale, ox: W / 2 - cx * scale, oy: H / 2 - cy * scale };
}

function CanvasStage({ view, onView, zoomAt, draw, showGrid, gridSize, cursor,
                       onWorldDown, onWorldMove, onWorldUp, panEnabled = true, forcePan = false, children }) {
  const wrapRef = useRef(null);
  const canRef = useRef(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const stateRef = useRef({ panning: false, space: false, last: null, dragging: false });

  useEffect(() => {
    const el = wrapRef.current;
    const ro = new ResizeObserver(() => {
      setSize({ w: el.clientWidth, h: el.clientHeight });
    });
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const dn = (e) => {
      if (e.code === "Space" && !e.repeat && document.activeElement.tagName !== "INPUT") {
        stateRef.current.space = true;
        if (canRef.current) canRef.current.style.cursor = "grab";
      }
    };
    const up = (e) => {
      if (e.code === "Space") {
        stateRef.current.space = false;
        if (canRef.current && !stateRef.current.panning) canRef.current.style.cursor = cursor || "default";
      }
    };
    window.addEventListener("keydown", dn);
    window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", dn); window.removeEventListener("keyup", up); };
  }, [cursor]);

  useEffect(() => {
    const el = canRef.current;
    if (!el) return;
    const onWheel = (e) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
      if (e.ctrlKey || e.metaKey) {
        const factor = Math.exp(-e.deltaY * 0.0125);
        zoomAt(factor, sx, sy);
      } else {
        onView((v) => ({ ...v, ox: v.ox - e.deltaX, oy: v.oy - e.deltaY }));
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomAt, onView]);

  useEffect(() => {
    const can = canRef.current;
    if (!can || !size.w) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (can.width !== size.w * dpr || can.height !== size.h * dpr) {
      can.width = size.w * dpr; can.height = size.h * dpr;
    }
    const ctx = can.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const css = getComputedStyle(document.documentElement);
    ctx.clearRect(0, 0, size.w, size.h);
    ctx.fillStyle = css.getPropertyValue("--canvas-bg").trim();
    ctx.fillRect(0, 0, size.w, size.h);
    if (showGrid) drawGrid(ctx, view, size.w, size.h, gridSize);
    const helpers = makeHelpers(view, size.w, size.h);
    draw(ctx, helpers, css);
  }, [view, size, draw, showGrid, gridSize]);

  const getScreen = (e) => {
    const rect = canRef.current.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const onPointerDown = (e) => {
    const st = stateRef.current;
    const s = getScreen(e);
    if (panEnabled && (forcePan || e.button === 1 || st.space)) {
      st.panning = true; st.last = { x: e.clientX, y: e.clientY };
      canRef.current.setPointerCapture(e.pointerId);
      canRef.current.style.cursor = "grabbing";
      e.preventDefault();
      return;
    }
    if (e.button !== 0) return;
    st.dragging = true;
    canRef.current.setPointerCapture(e.pointerId);
    const w = makeHelpers(view, size.w, size.h).s2w(s);
    onWorldDown && onWorldDown(w, e, s);
  };
  const onPointerMove = (e) => {
    const st = stateRef.current;
    const s = getScreen(e);
    if (st.panning) {
      const dx = e.clientX - st.last.x, dy = e.clientY - st.last.y;
      st.last = { x: e.clientX, y: e.clientY };
      onView((v) => ({ ...v, ox: v.ox + dx, oy: v.oy + dy }));
      return;
    }
    const w = makeHelpers(view, size.w, size.h).s2w(s);
    onWorldMove && onWorldMove(w, e, s, st.dragging);
  };
  const endPointer = (e) => {
    const st = stateRef.current;
    if (st.panning) {
      st.panning = false;
      canRef.current.style.cursor = st.space ? "grab" : (cursor || "default");
    }
    if (st.dragging) {
      st.dragging = false;
      const s = getScreen(e);
      const w = makeHelpers(view, size.w, size.h).s2w(s);
      onWorldUp && onWorldUp(w, e, s);
    }
  };

  return (
    <div className="stage" ref={wrapRef}>
      <canvas
        ref={canRef}
        style={{ cursor: cursor || "default", width: size.w, height: size.h }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPointer}
        onPointerCancel={endPointer}
        onContextMenu={(e) => e.preventDefault()}
      />
      <div className="stage-overlay">{children}</div>
    </div>
  );
}

export { CanvasStage, useViewport, makeHelpers, drawGrid, fitToPoints, dot, strokePoly, ZMIN, ZMAX };
