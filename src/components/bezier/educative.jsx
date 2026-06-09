import { useState, useRef, useEffect, useCallback } from 'react';
import * as Bz from '../../lib/math.js';
import { Icon } from './icons.jsx';
import { useHistory, NumberField, SectionTitle, PropRow, Switch, ZoomControls } from './ui.jsx';
import { CanvasStage, useViewport, fitToPoints, dot, strokePoly } from './canvas.jsx';

const EDU_BASE = 60;
const EDU_GRID = 1;

function EducativeMode({ tw, grid, setGrid, persistKey }) {
  const hist = useHistory({ points: [] });
  const points = hist.present.points;
  const [t, setT] = useState(0.42);
  const [playing, setPlaying] = useState(false);
  const [show, setShow] = useState({ poly: true, pts: true, cast: true, tan: false });
  const [hover, setHover] = useState(-1);
  const [drag, setDrag] = useState(-1);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [view, setView, zoomAt] = useViewport({ scale: EDU_BASE, ox: 0, oy: 0 });
  const fitted = useRef(false);
  const playDir = useRef(1);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(persistKey);
      if (raw) {
        const d = JSON.parse(raw);
        if (d.points) hist.reset({ points: d.points });
        if (typeof d.t === "number") setT(d.t);
        if (d.show) setShow(d.show);
      }
    } catch (e) {}
  }, []);

  useEffect(() => {
    const id = setTimeout(() => {
      try { localStorage.setItem(persistKey, JSON.stringify({ points, t, show })); } catch (e) {}
    }, 150);
    return () => clearTimeout(id);
  }, [points, t, show]);

  const onStageSize = useCallback((w, h) => { setSize({ w, h }); }, []);

  useEffect(() => {
    if (!fitted.current && size.w) {
      fitted.current = true;
      if (points.length >= 2) {
        const v = fitToPoints(points, size.w, size.h, 110, EDU_BASE * 1.3);
        if (v) setView(v);
      } else {
        setView({ scale: EDU_BASE, ox: size.w / 2, oy: size.h / 2 });
      }
    }
  }, [size]);

  useEffect(() => {
    if (!playing) return;
    let raf, last = performance.now();
    const tick = (now) => {
      const dt = (now - last) / 1000; last = now;
      setT((prev) => {
        let nx = prev + playDir.current * dt * (tw.speed || 0.4);
        if (nx >= 1) { nx = 1; playDir.current = -1; }
        else if (nx <= 0) { nx = 0; playDir.current = 1; }
        return nx;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, tw.speed]);

  const snap = (p) => grid.snap ? { x: Math.round(p.x / EDU_GRID) * EDU_GRID, y: Math.round(p.y / EDU_GRID) * EDU_GRID } : p;
  const hitPoint = (s) => {
    for (let i = points.length - 1; i >= 0; i--) {
      const sx = points[i].x * view.scale + view.ox, sy = points[i].y * view.scale + view.oy;
      if (Math.hypot(sx - s.x, sy - s.y) < 13) return i;
    }
    return -1;
  };

  const onDown = (w, e, s) => {
    const i = hitPoint(s);
    if (i >= 0) {
      hist.commit();
      setDrag(i);
    } else {
      hist.commit();
      const np = snap(w);
      hist.set((doc) => ({
        ...doc,
        points: [...doc.points, { x: Bz.round(np.x, 3), y: Bz.round(np.y, 3) }],
      }));
    }
  };
  const onMove = (w, e, s, dragging) => {
    if (drag >= 0) {
      const np = snap(w);
      hist.set((doc) => {
        const pts = doc.points.slice();
        pts[drag] = { x: Bz.round(np.x, 3), y: Bz.round(np.y, 3) };
        return { ...doc, points: pts };
      });
    } else {
      const i = hitPoint(s);
      if (i !== hover) setHover(i);
    }
  };
  const onUp = () => setDrag(-1);

  const editPoint = (i, axis, val) => {
    hist.commit();
    hist.set((doc) => {
      const pts = doc.points.slice();
      pts[i] = { ...pts[i], [axis]: val };
      return { ...doc, points: pts };
    });
  };
  const addPoint = () => {
    hist.commit();
    hist.set((doc) => {
      const pts = doc.points.slice();
      const a = pts[pts.length - 2], b = pts[pts.length - 1];
      pts.splice(pts.length - 1, 0, { x: Bz.round((a.x + b.x) / 2, 2), y: Bz.round((a.y + b.y) / 2, 2) });
      return { ...doc, points: pts };
    });
  };
  const removePoint = (i) => {
    if (points.length <= 2) return;
    hist.commit();
    hist.set((doc) => ({ ...doc, points: doc.points.filter((_, j) => j !== i) }));
  };
  const reset = () => { hist.commit(); hist.set({ points: [] }); };
  const fit = () => { const v = fitToPoints(points, size.w, size.h, 110, EDU_BASE * 1.3); if (v) setView(v); };

  useEffect(() => {
    const h = (e) => {
      if (e.target.tagName === "INPUT") return;
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key.toLowerCase() === "z") { e.preventDefault(); e.shiftKey ? hist.redo() : hist.undo(); }
      if (e.key === " ") { e.preventDefault(); setPlaying((p) => !p); }
      if (e.shiftKey && e.key === "1") fit();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [points, size]);

  const draw = useCallback((ctx, hp, css) => {
    onStageSize(hp.width, hp.height);
    const c = (n) => css.getPropertyValue(n).trim();
    const accent = c("--accent"), curve = c("--curve"), curveSoft = c("--curve-soft");
    const control = c("--control"), ctrlLine = c("--control-line"), point = c("--point");
    const panel = c("--panel"), ink = c("--ink");
    const S = points.map(hp.w2s);
    const cw = tw.curveWidth || 3, pr = (tw.pointSize || 6);

    if (points.length >= 2) {
      if (show.poly) strokePoly(ctx, S, ctrlLine, 1.5, [5, 5]);

      if (show.cast && t > 0 && t < 1) {
        const levels = Bz.deCasteljau(points, t);
        for (let L = 1; L < levels.length - 1; L++) {
          const sc = levels[L].map(hp.w2s);
          const fade = 0.32 + 0.4 * (L / levels.length);
          ctx.globalAlpha = fade;
          strokePoly(ctx, sc, accent, 1.4, []);
          for (const p of sc) dot(ctx, p.x, p.y, 3.2, accent, null);
          ctx.globalAlpha = 1;
        }
      }

      const N = 200;
      const all = [];
      for (let i = 0; i <= N; i++) all.push({ ...hp.w2s(Bz.bezierPoint(points, i / N)), tt: i / N });
      const trav = all.filter((p) => p.tt <= t);
      const rem = all.filter((p) => p.tt >= t);
      strokePoly(ctx, rem, curveSoft, cw + 1.5, []);
      strokePoly(ctx, trav, curve, cw + 1.5, []);
    }

    if (show.pts && points.length >= 1) {
      S.forEach((p, i) => {
        const end = i === 0 || i === S.length - 1;
        const r = (hover === i || drag === i) ? pr + 2.5 : pr;
        if (hover === i || drag === i) { dot(ctx, p.x, p.y, r + 5, end ? c("--accent-soft") : c("--curve-soft"), null); }
        dot(ctx, p.x, p.y, r, panel, end ? accent : control, 2.4);
        ctx.fillStyle = ink; ctx.font = "600 11px " + c("--font-mono");
        ctx.textAlign = "center"; ctx.textBaseline = "bottom";
        ctx.fillText("P" + i, p.x, p.y - r - 5);
      });
    }

    if (points.length >= 2) {
      const ct = Bz.bezierPoint(points, t);
      const cs = hp.w2s(ct);
      if (show.tan) {
        const d = Bz.bezierDerivative(points, t);
        const len = Math.hypot(d.x, d.y) || 1;
        const ux = d.x / len, uy = d.y / len, L = 1.6;
        const a = hp.w2s({ x: ct.x - ux * L, y: ct.y - uy * L });
        const b = hp.w2s({ x: ct.x + ux * L, y: ct.y + uy * L });
        strokePoly(ctx, [a, b], point, 1.6, [2, 4]);
      }
      ctx.save();
      ctx.strokeStyle = point; ctx.globalAlpha = 0.35; ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(cs.x, cs.y); ctx.lineTo(cs.x, hp.oy);
      ctx.moveTo(cs.x, cs.y); ctx.lineTo(hp.ox, cs.y);
      ctx.stroke(); ctx.restore();
      dot(ctx, cs.x, cs.y, pr + 1.5, point, panel, 2.6);
      dot(ctx, cs.x, cs.y, 2, panel, null);
    }
  }, [points, t, show, hover, drag, tw]);

  const ct = points.length >= 2 ? Bz.bezierPoint(points, t) : null;
  const cursorStyle = hover >= 0 ? "grab" : (drag >= 0 ? "grabbing" : "crosshair");

  return (
    <>
      <div className="panel left">
        <div className="panel-scroll">
          <div className="section">
            <SectionTitle right={<span className="tag">grado {points.length - 1}</span>}>
              Curva {points.length === 4 ? "cúbica" : ""}
            </SectionTitle>
            <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
              {points.map((p, i) => (
                <div className="ptrow" key={i}>
                  <span className={"ptbadge" + (i === 0 || i === points.length - 1 ? " p-end" : "")}>P{i}</span>
                  <NumberField axis="X" value={p.x} step={0.05} precision={2} onChange={(v) => editPoint(i, "x", Bz.round(v, 3))} />
                  <NumberField axis="Y" value={p.y} step={0.05} precision={2} onChange={(v) => editPoint(i, "y", Bz.round(v, 3))} />
                  <button className="ptdel" title="Eliminar" disabled={points.length <= 2} onClick={() => removePoint(i)}>
                    <Icon name="x" size={14} />
                  </button>
                </div>
              ))}
            </div>
            <div className="btn-row" style={{ marginTop: 12 }}>
              <button className="btn sm" onClick={addPoint} disabled={points.length >= 9}><Icon name="plus" size={15} />Añadir punto</button>
              <button className="btn sm" onClick={reset}><Icon name="reset" size={15} />Limpiar</button>
            </div>
          </div>

          <div className="section">
            <SectionTitle>Visualización</SectionTitle>
            <PropRow label="Puntos de control"><Switch on={show.pts} onChange={(v) => setShow((s) => ({ ...s, pts: v }))} /></PropRow>
            <PropRow label="Polígono de control"><Switch on={show.poly} onChange={(v) => setShow((s) => ({ ...s, poly: v }))} /></PropRow>
            <PropRow label="Construcción De Casteljau"><Switch on={show.cast} onChange={(v) => setShow((s) => ({ ...s, cast: v }))} /></PropRow>
            <PropRow label="Recta tangente"><Switch on={show.tan} onChange={(v) => setShow((s) => ({ ...s, tan: v }))} /></PropRow>
          </div>

          <div className="section">
            <SectionTitle>Retícula</SectionTitle>
            <PropRow label="Mostrar grid"><Switch on={grid.show} onChange={(v) => setGrid((g) => ({ ...g, show: v }))} /></PropRow>
            <PropRow label="Snap a retícula"><Switch on={grid.snap} onChange={(v) => setGrid((g) => ({ ...g, snap: v }))} /></PropRow>
          </div>
        </div>

        <div className="tparam">
          <div className="tparam-head">
            <span className="lbl">parámetro <b>t</b></span>
            <span className="tval">{t.toFixed(3)}</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button className="btn icon sm primary" title="Reproducir/Pausar" onClick={() => setPlaying((p) => !p)}>
              <Icon name={playing ? "pause" : "play"} size={15} />
            </button>
            <input
              className="range" type="range" min="0" max="1" step="0.001" value={t}
              style={{ "--fill": (t * 100).toFixed(1) + "%" }}
              onChange={(e) => { setPlaying(false); setT(parseFloat(e.target.value)); }}
            />
          </div>
          {ct && (
            <div className="coordreadout">
              <span className="k">C(</span><span style={{ color: "var(--accent)" }}>{t.toFixed(2)}</span><span className="k">) = (</span>
              <span className="vx">{ct.x.toFixed(2)}</span><span className="k">, </span><span className="vy">{ct.y.toFixed(2)}</span><span className="k">)</span>
            </div>
          )}
        </div>
      </div>

      <CanvasStage
        view={view} onView={setView} zoomAt={zoomAt} draw={draw}
        showGrid={grid.show} gridSize={EDU_GRID} cursor={cursorStyle}
        onWorldDown={onDown} onWorldMove={onMove} onWorldUp={onUp}
      >
        <div className="hud tl">
          <Icon name="vector" size={14} style={{ color: "var(--curve)" }} />
          {points.length >= 2
            ? <span>Bézier&nbsp;<b>n={points.length - 1}</b></span>
            : <span style={{ color: "var(--muted)" }}>sin curva</span>}
        </div>
        {points.length === 0 && (
          <div style={{
            position: "absolute", inset: 0, display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center", pointerEvents: "none",
            gap: 10,
          }}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" style={{ opacity: 0.18 }}>
              <path d="M3 19C3 9 21 15 21 5" stroke="var(--ink)" strokeWidth="2" strokeLinecap="round"/>
              <circle cx="3" cy="19" r="2.5" fill="var(--ink)"/>
              <circle cx="21" cy="5" r="2.5" fill="var(--ink)"/>
            </svg>
            <span style={{ fontSize: 13, color: "var(--faint)", fontFamily: "var(--font-ui)", textAlign: "center", lineHeight: 1.5 }}>
              Haz clic en el lienzo<br/>para añadir puntos de control
            </span>
          </div>
        )}
        <ZoomControls view={view} onView={setView} zoomAt={zoomAt} onFit={fit} base={EDU_BASE} />
      </CanvasStage>

      <div className="panel right">
        <div className="panel-scroll">
          <FormulaPanel points={points} t={t} ct={ct ?? { x: 0, y: 0 }} />
        </div>
      </div>
    </>
  );
}

function FormulaPanel({ points, t, ct }) {
  if (points.length < 2) {
    return (
      <div className="section">
        <div className="empty">
          Añade al menos<br /><b>2 puntos de control</b><br />para ver la fórmula.
        </div>
      </div>
    );
  }
  const n = points.length - 1;
  const weights = points.map((_, i) => Bz.bernstein(i, n, t));
  const isCubic = n === 3;
  return (
    <>
      <div className="section">
        <SectionTitle>Fórmula</SectionTitle>
        <div className="formula">
          {isCubic ? (
            <div>
              <span className="res">C(t)</span> = <span className="muted">(1−t)</span><sup>3</sup><span className="term">P₀</span><br />
              <span className="muted">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span>+ <span className="coef">3</span>t<span className="muted">(1−t)</span><sup>2</sup><span className="term">P₁</span><br />
              <span className="muted">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span>+ <span className="coef">3</span>t<sup>2</sup><span className="muted">(1−t)</span><span className="term">P₂</span><br />
              <span className="muted">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span>+ t<sup>3</sup><span className="term">P₃</span>
            </div>
          ) : (
            <div>
              <span className="res">C(t)</span> = <span className="muted">Σ</span><sub style={{ fontSize: ".8em" }}>i=0..{n}</sub>&nbsp;
              <span className="coef">C({n},i)</span>&nbsp;t<sup>i</sup><span className="muted">(1−t)</span><sup>{n}−i</sup>&nbsp;<span className="term">Pᵢ</span>
            </div>
          )}
        </div>
      </div>

      <div className="section">
        <SectionTitle right={<span className="tag">t = {t.toFixed(2)}</span>}>Pesos de Bernstein</SectionTitle>
        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          {weights.map((w, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 9 }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--muted)", width: 24 }}>P{i}</span>
              <div style={{ flex: 1, height: 6, background: "var(--active-bg)", borderRadius: 4, overflow: "hidden" }}>
                <div style={{ width: (w * 100).toFixed(1) + "%", height: "100%", background: "var(--curve)", borderRadius: 4 }} />
              </div>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 11.5, color: "var(--ink)", width: 46, textAlign: "right" }}>{w.toFixed(3)}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="section">
        <SectionTitle>Resultado</SectionTitle>
        <div className="coordreadout" style={{ marginTop: 0, fontSize: 13 }}>
          <div style={{ marginBottom: 6 }}>
            <span className="k">x = Σ wᵢ·xᵢ = </span><span className="vx">{ct.x.toFixed(3)}</span>
          </div>
          <div style={{ marginBottom: 10 }}>
            <span className="k">y = Σ wᵢ·yᵢ = </span><span className="vy">{ct.y.toFixed(3)}</span>
          </div>
          <div style={{ paddingTop: 9, borderTop: "1px solid var(--border)", fontSize: 14 }}>
            <span className="k">C({t.toFixed(2)}) = (</span>
            <span className="vx">{ct.x.toFixed(2)}</span><span className="k">, </span>
            <span className="vy">{ct.y.toFixed(2)}</span><span className="k">)</span>
          </div>
        </div>
      </div>
    </>
  );
}

export { EducativeMode };
