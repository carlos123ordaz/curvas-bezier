import { useState, useRef, useEffect, useCallback } from 'react';
import * as Bz from '../../lib/math.js';
import { Icon } from './icons.jsx';
import { useHistory, useToast, NumberField, SectionTitle, PropRow, Switch, Tool, ZoomControls } from './ui.jsx';
import { CanvasStage, useViewport, fitToPoints, dot } from './canvas.jsx';

const EDITOR_COLORS = ["#2a6fdb", "#e0603a", "#e5484d", "#1f8a5b", "#8b62d6", "#14161b", "#767c88"];
const EDITOR_GRID = 20;
let _pid = 1;
const uid = () => "p" + (_pid++) + "_" + Math.random().toString(36).slice(2, 6);

function sampleDoc() {
  return {
    paths: [{
      id: uid(), name: "Trazo 1", color: "#2a6fdb", fill: false, fillColor: "#cfe0fb",
      width: 2.5, closed: false, visible: true,
      anchors: [
        { x: -230, y: 40, in: null, out: { x: -150, y: -90 }, sharp: false },
        { x: 0, y: 0, in: { x: -90, y: -55 }, out: { x: 90, y: 55 }, sharp: false },
        { x: 230, y: -40, in: { x: 150, y: 90 }, out: null, sharp: false },
      ],
    }],
  };
}

const downloadBlob = (name, blob) => {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 100);
};
const downloadText = (name, text, mime) => downloadBlob(name, new Blob([text], { type: mime || "text/plain" }));

function bbox(paths) {
  let mnx = Infinity, mny = Infinity, mxx = -Infinity, mxy = -Infinity;
  for (const p of paths) for (const a of p.anchors) {
    for (const q of [a, a.in, a.out]) {
      if (!q) continue;
      mnx = Math.min(mnx, q.x); mny = Math.min(mny, q.y);
      mxx = Math.max(mxx, q.x); mxy = Math.max(mxy, q.y);
    }
  }
  if (mnx === Infinity) return { x: 0, y: 0, w: 100, h: 100 };
  return { x: mnx, y: mny, w: mxx - mnx, h: mxy - mny };
}

function EditorMode({ tw, grid, setGrid, persistKey }) {
  const hist = useHistory({ paths: [] });
  const doc = hist.present;
  const [tool, setTool] = useState("pen");
  const [sel, setSel] = useState({ pathId: doc.paths[0]?.id || null, ai: null });
  const [hover, setHover] = useState(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [view, setView, zoomAt] = useViewport({ scale: 1, ox: 0, oy: 0 });
  const [cursorWorld, setCursorWorld] = useState(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [toast, toastNode] = useToast();
  const fitted = useRef(false);
  const ix = useRef({ kind: null });
  const drawingRef = useRef(null);

  useEffect(() => {
    try { const raw = localStorage.getItem(persistKey); if (raw) { const d = JSON.parse(raw); if (d.paths) { hist.reset(d); setSel({ pathId: d.paths[0]?.id || null, ai: null }); } } } catch (e) {}
  }, []);
  useEffect(() => { const id = setTimeout(() => { try { localStorage.setItem(persistKey, JSON.stringify(doc)); } catch (e) {} }, 200); return () => clearTimeout(id); }, [doc]);

  useEffect(() => {
    if (!fitted.current && size.w) {
      fitted.current = true;
      const anchors = doc.paths.flatMap((p) => p.anchors);
      if (anchors.length) {
        const v = fitToPoints(anchors, size.w, size.h, 140, 2.2);
        if (v) setView(v);
      } else {
        setView({ scale: 1, ox: size.w / 2, oy: size.h / 2 });
      }
    }
  }, [size]);

  const snap = (p) => grid.snap ? { x: Math.round(p.x / EDITOR_GRID) * EDITOR_GRID, y: Math.round(p.y / EDITOR_GRID) * EDITOR_GRID } : { x: Bz.round(p.x, 1), y: Bz.round(p.y, 1) };
  const w2sV = (p) => ({ x: p.x * view.scale + view.ox, y: p.y * view.scale + view.oy });
  const activePath = () => doc.paths.find((p) => p.id === sel.pathId);

  const HIT = 8;
  function hitHandles(s) {
    const p = activePath();
    if (!p || (tool !== "select" && tool !== "node")) return null;
    for (let i = 0; i < p.anchors.length; i++) {
      const a = p.anchors[i];
      for (const which of ["out", "in"]) {
        if (!a[which]) continue;
        const sp = w2sV(a[which]);
        if (Math.hypot(sp.x - s.x, sp.y - s.y) < HIT) return { pathId: p.id, ai: i, which };
      }
    }
    return null;
  }
  function hitAnchor(s, pathsToCheck) {
    const list = pathsToCheck || (activePath() ? [activePath()] : doc.paths);
    for (const p of list) {
      if (!p.visible) continue;
      for (let i = 0; i < p.anchors.length; i++) {
        const sp = w2sV(p.anchors[i]);
        if (Math.hypot(sp.x - s.x, sp.y - s.y) < HIT + 1) return { pathId: p.id, ai: i };
      }
    }
    return null;
  }
  function hitPathBody(s) {
    for (const p of doc.paths) {
      if (!p.visible || p.anchors.length < 2) continue;
      const segs = p.closed ? p.anchors.length : p.anchors.length - 1;
      for (let i = 0; i < segs; i++) {
        const a = p.anchors[i], b = p.anchors[(i + 1) % p.anchors.length];
        const samp = Bz.segmentSample(a, b, 18).map(w2sV);
        for (let k = 0; k < samp.length - 1; k++) {
          if (distToSeg(s, samp[k], samp[k + 1]) < 6) return { pathId: p.id };
        }
      }
    }
    return null;
  }
  function distToSeg(p, a, b) {
    const dx = b.x - a.x, dy = b.y - a.y; const l2 = dx * dx + dy * dy;
    let t = l2 ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2 : 0;
    t = Bz.clamp(t, 0, 1);
    return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
  }

  const updatePath = (pathId, fn, record) => {
    if (record) hist.commit();
    hist.set((d) => ({ ...d, paths: d.paths.map((p) => p.id === pathId ? fn({ ...p, anchors: p.anchors.map((a) => ({ ...a, in: a.in && { ...a.in }, out: a.out && { ...a.out } })) }) : p) }));
  };

  const onDown = (w, e, s) => {
    setExportOpen(false);
    if (tool === "pen") return penDown(w, e, s);
    const h = hitHandles(s);
    if (h) { hist.commit(); ix.current = { kind: "handle", ...h, alt: e.altKey }; setSel({ pathId: h.pathId, ai: h.ai }); return; }
    const a = hitAnchor(s);
    if (a) {
      hist.commit();
      const p = doc.paths.find((x) => x.id === a.pathId);
      ix.current = { kind: "anchor", pathId: a.pathId, ai: a.ai, orig: { ...p.anchors[a.ai] }, start: w };
      setSel({ pathId: a.pathId, ai: a.ai });
      return;
    }
    const body = hitPathBody(s);
    if (body) { setSel({ pathId: body.pathId, ai: null }); return; }
    setSel({ pathId: null, ai: null });
  };

  function penDown(w, e, s) {
    let p = activePath();
    const np = snap(w);
    if (p && !p.closed && p.anchors.length >= 2) {
      const first = w2sV(p.anchors[0]);
      if (Math.hypot(first.x - s.x, first.y - s.y) < HIT + 2) {
        updatePath(p.id, (pp) => ({ ...pp, closed: true }), true);
        drawingRef.current = null;
        return;
      }
    }
    hist.commit();
    if (!p || p.closed || drawingRef.current !== p.id) {
      const id = uid();
      const path = { id, name: "Trazo " + (doc.paths.length + 1), color: tw.accent || "#2a6fdb", fill: false, fillColor: "#cfe0fb", width: 2.5, closed: false, visible: true, anchors: [{ x: np.x, y: np.y, in: null, out: null, sharp: true }] };
      hist.set((d) => ({ ...d, paths: [...d.paths, path] }));
      setSel({ pathId: id, ai: 0 });
      drawingRef.current = id;
      ix.current = { kind: "penDrag", pathId: id, ai: 0, anchor: np };
    } else {
      hist.set((d) => ({ ...d, paths: d.paths.map((pp) => pp.id === p.id ? { ...pp, anchors: [...pp.anchors, { x: np.x, y: np.y, in: null, out: null, sharp: true }] } : pp) }));
      const ai = p.anchors.length;
      setSel({ pathId: p.id, ai });
      ix.current = { kind: "penDrag", pathId: p.id, ai, anchor: np };
    }
  }

  const onMove = (w, e, s, dragging) => {
    setCursorWorld(w);
    const cur = ix.current;
    if (!dragging) {
      const h = hitHandles(s) || hitAnchor(s);
      setHover(h ? { ...h } : null);
      return;
    }
    if (cur.kind === "penDrag") {
      const np = snap(w);
      updatePath(cur.pathId, (pp) => {
        const anchors = pp.anchors.slice();
        const a = { ...anchors[cur.ai] };
        a.out = { x: np.x, y: np.y };
        a.in = { x: 2 * a.x - np.x, y: 2 * a.y - np.y };
        a.sharp = false;
        anchors[cur.ai] = a;
        return { ...pp, anchors };
      });
    } else if (cur.kind === "anchor") {
      const np = snap(w);
      const dx = np.x - snap(cur.start).x, dy = np.y - snap(cur.start).y;
      updatePath(cur.pathId, (pp) => {
        const anchors = pp.anchors.slice();
        const o = cur.orig;
        anchors[cur.ai] = {
          ...o, x: o.x + dx, y: o.y + dy,
          in: o.in ? { x: o.in.x + dx, y: o.in.y + dy } : null,
          out: o.out ? { x: o.out.x + dx, y: o.out.y + dy } : null,
        };
        return { ...pp, anchors };
      });
    } else if (cur.kind === "handle") {
      const np = snap(w);
      updatePath(cur.pathId, (pp) => {
        const anchors = pp.anchors.slice();
        const a = { ...anchors[cur.ai] };
        a[cur.which] = { x: np.x, y: np.y };
        if (!a.sharp && !cur.alt) {
          const opp = cur.which === "in" ? "out" : "in";
          if (a[opp]) a[opp] = { x: 2 * a.x - np.x, y: 2 * a.y - np.y };
        } else if (cur.alt) { a.sharp = true; }
        anchors[cur.ai] = a;
        return { ...pp, anchors };
      });
    }
  };
  const onUp = () => { ix.current = { kind: null }; };

  function toggleSharp(pathId, ai) {
    updatePath(pathId, (pp) => {
      const anchors = pp.anchors.slice();
      const a = { ...anchors[ai] };
      if (a.sharp || (!a.in && !a.out)) {
        const prev = anchors[(ai - 1 + anchors.length) % anchors.length];
        const next = anchors[(ai + 1) % anchors.length];
        const dirx = next.x - prev.x, diry = next.y - prev.y;
        const len = Math.hypot(dirx, diry) || 1;
        const ux = dirx / len, uy = diry / len, m = 60;
        a.in = { x: a.x - ux * m, y: a.y - uy * m };
        a.out = { x: a.x + ux * m, y: a.y + uy * m };
        a.sharp = false;
      } else {
        a.sharp = true; a.in = null; a.out = null;
      }
      anchors[ai] = a;
      return { ...pp, anchors };
    }, true);
  }

  const addPath = () => { setTool("pen"); drawingRef.current = null; setSel({ pathId: null, ai: null }); };
  const deletePath = (id) => { hist.commit(); hist.set((d) => ({ ...d, paths: d.paths.filter((p) => p.id !== id) })); if (sel.pathId === id) setSel({ pathId: null, ai: null }); };
  const dupPath = (id) => {
    hist.commit();
    hist.set((d) => {
      const src = d.paths.find((p) => p.id === id); if (!src) return d;
      const copy = JSON.parse(JSON.stringify(src)); copy.id = uid(); copy.name = src.name + " copia";
      copy.anchors = copy.anchors.map((a) => ({ ...a, x: a.x + 24, y: a.y + 24, in: a.in && { x: a.in.x + 24, y: a.in.y + 24 }, out: a.out && { x: a.out.x + 24, y: a.out.y + 24 } }));
      return { ...d, paths: [...d.paths, copy] };
    });
  };
  const toggleVis = (id) => updatePath(id, (p) => ({ ...p, visible: !p.visible }), true);
  const deleteAnchor = () => {
    if (sel.ai == null) return;
    updatePath(sel.pathId, (p) => ({ ...p, anchors: p.anchors.filter((_, i) => i !== sel.ai) }), true);
    setSel((s) => ({ ...s, ai: null }));
  };
  const clearAll = () => { hist.commit(); hist.set({ paths: [] }); setSel({ pathId: null, ai: null }); drawingRef.current = null; };
  const fit = () => { const pts = doc.paths.flatMap((p) => p.anchors); const v = fitToPoints(pts.length ? pts : [{ x: -100, y: -100 }, { x: 100, y: 100 }], size.w, size.h, 140, 2.2); if (v) setView(v); };

  useEffect(() => {
    const h = (e) => {
      if (e.target.tagName === "INPUT") return;
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key.toLowerCase() === "z") { e.preventDefault(); e.shiftKey ? hist.redo() : hist.undo(); return; }
      if (meta) return;
      const k = e.key.toLowerCase();
      if (k === "p") setTool("pen");
      if (k === "v") setTool("select");
      if (k === "a") setTool("node");
      if (k === "h") setTool("hand");
      if (k === "escape") { drawingRef.current = null; ix.current = { kind: null }; setSel((s) => ({ ...s, ai: null })); }
      if ((k === "backspace" || k === "delete")) {
        if (sel.ai != null) { e.preventDefault(); deleteAnchor(); }
        else if (sel.pathId) { e.preventDefault(); deletePath(sel.pathId); }
      }
      if (e.shiftKey && e.key === "1") fit();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [sel, doc, size]);

  const draw = useCallback((ctx, hp, css) => {
    setSize((s) => (s.w === hp.width && s.h === hp.height ? s : { w: hp.width, h: hp.height }));
    const c = (n) => css.getPropertyValue(n).trim();
    const handleCol = c("--handle"), accent = c("--accent"), panel = c("--panel"), ink = c("--ink");

    for (const p of doc.paths) {
      if (!p.visible || !p.anchors.length) continue;
      const path2d = new Path2D();
      const S = p.anchors.map(hp.w2s);
      path2d.moveTo(S[0].x, S[0].y);
      const segs = p.closed ? p.anchors.length : p.anchors.length - 1;
      for (let i = 0; i < segs; i++) {
        const a = p.anchors[i], b = p.anchors[(i + 1) % p.anchors.length];
        const c1 = hp.w2s(a.out || a), c2 = hp.w2s(b.in || b), bs = hp.w2s(b);
        path2d.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, bs.x, bs.y);
      }
      if (p.closed) path2d.closePath();
      if (p.fill && p.closed) { ctx.fillStyle = p.fillColor; ctx.globalAlpha = 0.55; ctx.fill(path2d); ctx.globalAlpha = 1; }
      ctx.strokeStyle = p.color; ctx.lineWidth = Math.max(1, p.width * Math.sqrt(hp.scale)); ctx.lineJoin = "round"; ctx.lineCap = "round";
      ctx.stroke(path2d);
    }

    if (tool === "pen" && cursorWorld) {
      const p = activePath();
      if (p && !p.closed && drawingRef.current === p.id && p.anchors.length) {
        const last = p.anchors[p.anchors.length - 1];
        const a = last.out || last;
        ctx.save(); ctx.strokeStyle = accent; ctx.globalAlpha = 0.5; ctx.lineWidth = 1.5; ctx.setLineDash([4, 4]);
        const c1 = hp.w2s(a), c2 = hp.w2s(cursorWorld), s0 = hp.w2s(last), s1 = hp.w2s(cursorWorld);
        ctx.beginPath(); ctx.moveTo(s0.x, s0.y);
        ctx.bezierCurveTo(c1.x, c1.y, s1.x, s1.y, s1.x, s1.y);
        ctx.stroke(); ctx.restore();
      }
    }

    const ap = activePath();
    if (ap && (tool === "select" || tool === "node" || (tool === "pen" && drawingRef.current === ap.id))) {
      ap.anchors.forEach((a, i) => {
        const sp = hp.w2s(a);
        for (const which of ["in", "out"]) {
          if (!a[which]) continue;
          const hs = hp.w2s(a[which]);
          ctx.strokeStyle = handleCol; ctx.lineWidth = 1.2; ctx.globalAlpha = 0.8;
          ctx.beginPath(); ctx.moveTo(sp.x, sp.y); ctx.lineTo(hs.x, hs.y); ctx.stroke();
          ctx.globalAlpha = 1;
          const hh = hover && hover.which === which && hover.ai === i;
          dot(ctx, hs.x, hs.y, hh ? 5 : 4, panel, handleCol, 1.6);
        }
        const selected = sel.ai === i && sel.pathId === ap.id;
        const r = 5;
        ctx.save();
        if (a.sharp) {
          ctx.fillStyle = selected ? accent : panel; ctx.strokeStyle = selected ? accent : ink;
          ctx.lineWidth = 1.8; ctx.beginPath();
          ctx.rect(sp.x - r, sp.y - r, r * 2, r * 2); ctx.fill(); ctx.stroke();
        } else {
          dot(ctx, sp.x, sp.y, r, selected ? accent : panel, selected ? accent : ink, 1.8);
        }
        ctx.restore();
        if (tool === "pen" && i === 0 && !ap.closed && ap.anchors.length >= 2) {
          dot(ctx, sp.x, sp.y, 8, null, accent, 1.5);
        }
      });
    }
  }, [doc, tool, sel, hover, cursorWorld, tw]);

  const doExportSVG = () => {
    const visible = doc.paths.filter((p) => p.visible && p.anchors.length);
    const bb = bbox(visible); const pad = 24;
    const W = Math.max(bb.w + pad * 2, 1), H = Math.max(bb.h + pad * 2, 1);
    let body = "";
    for (const p of visible) {
      const d = Bz.anchorsToSvgPath(p.anchors, p.closed);
      body += `  <path d="${d}" fill="${p.fill && p.closed ? p.fillColor : "none"}" stroke="${p.color}" stroke-width="${p.width}" stroke-linecap="round" stroke-linejoin="round"/>\n`;
    }
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${Bz.round(W)}" height="${Bz.round(H)}" viewBox="${Bz.round(bb.x - pad)} ${Bz.round(bb.y - pad)} ${Bz.round(W)} ${Bz.round(H)}">\n${body}</svg>\n`;
    downloadText("bezier.svg", svg, "image/svg+xml");
    setExportOpen(false); toast("SVG exportado");
  };
  const doExportPNG = () => {
    const visible = doc.paths.filter((p) => p.visible && p.anchors.length);
    const bb = bbox(visible); const pad = 32; const sc = 2;
    const W = Math.ceil((bb.w + pad * 2) * sc), H = Math.ceil((bb.h + pad * 2) * sc);
    const cv = document.createElement("canvas"); cv.width = Math.max(W, 2); cv.height = Math.max(H, 2);
    const ctx = cv.getContext("2d");
    const ox = (-bb.x + pad) * sc, oy = (-bb.y + pad) * sc;
    for (const p of visible) {
      const path2d = new Path2D();
      const tp = (q) => ({ x: q.x * sc + ox, y: q.y * sc + oy });
      const A = p.anchors; const s0 = tp(A[0]); path2d.moveTo(s0.x, s0.y);
      const segs = p.closed ? A.length : A.length - 1;
      for (let i = 0; i < segs; i++) {
        const a = A[i], b = A[(i + 1) % A.length];
        const c1 = tp(a.out || a), c2 = tp(b.in || b), bs = tp(b);
        path2d.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, bs.x, bs.y);
      }
      if (p.closed) path2d.closePath();
      if (p.fill && p.closed) { ctx.fillStyle = p.fillColor; ctx.globalAlpha = 0.55; ctx.fill(path2d); ctx.globalAlpha = 1; }
      ctx.strokeStyle = p.color; ctx.lineWidth = p.width * sc; ctx.lineJoin = "round"; ctx.lineCap = "round"; ctx.stroke(path2d);
    }
    cv.toBlob((b) => { downloadBlob("bezier.png", b); }, "image/png");
    setExportOpen(false); toast("PNG exportado");
  };
  const doExportJSON = () => { downloadText("bezier.json", JSON.stringify(doc, null, 2), "application/json"); setExportOpen(false); toast("JSON exportado"); };
  const doSave = () => { try { localStorage.setItem(persistKey, JSON.stringify(doc)); toast("Proyecto guardado"); } catch (e) {} };

  const ap = activePath();
  const selAnchor = ap && sel.ai != null ? ap.anchors[sel.ai] : null;
  const cursorStyle = tool === "hand" ? "grab" : (tool === "pen" ? "crosshair" : (hover ? "pointer" : "default"));

  return (
    <>
      <div className="rail">
        <Tool icon="cursor" kbd="V" active={tool === "select"} onClick={() => setTool("select")} title="Seleccionar (V)" />
        <Tool icon="pen" kbd="P" active={tool === "pen"} onClick={() => setTool("pen")} title="Pluma (P)" />
        <Tool icon="node" kbd="A" active={tool === "node"} onClick={() => setTool("node")} title="Editar nodos (A)" />
        <Tool icon="hand" kbd="H" active={tool === "hand"} onClick={() => setTool("hand")} title="Mover lienzo (H)" />
        <div className="sep" />
        <Tool icon="add_node" onClick={addPath} title="Nuevo trazo" />
      </div>

      <CanvasStage
        view={view} onView={setView} zoomAt={zoomAt} draw={draw}
        showGrid={grid.show} gridSize={grid.size} cursor={cursorStyle}
        forcePan={tool === "hand"}
        onWorldDown={onDown} onWorldMove={onMove} onWorldUp={onUp}
      >
        <div className="hud tl">
          <Icon name={tool === "pen" ? "pen" : tool === "hand" ? "hand" : "cursor"} size={13} style={{ color: "var(--accent)" }} />
          <span>{tool === "pen" ? "Pluma" : tool === "select" ? "Seleccionar" : tool === "node" ? "Nodos" : "Mano"}</span>
        </div>
        {cursorWorld && (
          <div className="hud bl">
            x <b>{Math.round(cursorWorld.x)}</b>&nbsp;&nbsp;y <b>{Math.round(cursorWorld.y)}</b>
          </div>
        )}
        <ZoomControls view={view} onView={setView} zoomAt={zoomAt} onFit={fit} base={1} stageSize={size} />
        {tool === "pen" && (
          <div className="hud" style={{ top: 12, left: "50%", transform: "translateX(-50%)", fontFamily: "var(--font-ui)" }}>
            <span className="hint" style={{ fontSize: 11.5 }}><span className="pen">Clic</span> punto · <span className="pen">Arrastra</span> curva · clic en P0 para cerrar</span>
          </div>
        )}
      </CanvasStage>

      <div className="panel right">
        <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "10px 12px", borderBottom: "1px solid var(--border)" }}>
          <div className="iconpair">
            <button className="btn icon sm" disabled={!hist.canUndo} onClick={hist.undo} title="Deshacer (⌘Z)"><Icon name="undo" size={15} /></button>
            <button className="btn icon sm" disabled={!hist.canRedo} onClick={hist.redo} title="Rehacer (⇧⌘Z)"><Icon name="redo" size={15} /></button>
          </div>
          <div className="spacer" style={{ flex: 1 }} />
          <div className="rel">
            <button className="btn sm primary" onClick={() => setExportOpen((o) => !o)}><Icon name="download" size={15} />Exportar<Icon name="chevron" size={13} /></button>
            {exportOpen && (
              <div className="menu">
                <button onClick={doExportSVG}><Icon name="vector" size={16} />SVG <span className="ext">curvas reales</span></button>
                <button onClick={doExportPNG}><Icon name="image" size={16} />PNG <span className="ext">imagen</span></button>
                <button onClick={doExportJSON}><Icon name="code" size={16} />JSON <span className="ext">editable</span></button>
                <div className="msep" />
                <button onClick={doSave}><Icon name="save" size={16} />Guardar proyecto</button>
              </div>
            )}
          </div>
        </div>

        <div className="panel-scroll">
          <div className="section">
            <SectionTitle right={<button className="btn icon sm ghost" onClick={addPath} title="Nuevo trazo"><Icon name="plus" size={16} /></button>}>
              Capas
            </SectionTitle>
            {doc.paths.length === 0 && <div className="empty">Sin trazos.<br />Usa la <b>Pluma (P)</b> para dibujar.</div>}
            <div>
              {doc.paths.slice().reverse().map((p) => (
                <div key={p.id} className={"layer" + (sel.pathId === p.id ? " sel" : "")} onClick={() => { setSel({ pathId: p.id, ai: null }); if (tool === "pen") setTool("select"); }}>
                  <span className="swatch" style={{ background: p.color }} />
                  <span className="lname">{p.name}</span>
                  <span className="meta">{p.anchors.length}n{p.closed ? "·●" : ""}</span>
                  <button className="vis" title="Visibilidad" onClick={(e) => { e.stopPropagation(); toggleVis(p.id); }}><Icon name={p.visible ? "eye" : "eyeoff"} size={15} /></button>
                </div>
              ))}
            </div>
          </div>

          {ap && (
            <div className="section">
              <SectionTitle right={
                <div style={{ display: "flex", gap: 4 }}>
                  <button className="btn icon sm ghost" title="Duplicar" onClick={() => dupPath(ap.id)}><Icon name="copy" size={15} /></button>
                  <button className="btn icon sm ghost" title="Eliminar trazo" onClick={() => deletePath(ap.id)}><Icon name="trash" size={15} /></button>
                </div>
              }>Trazo</SectionTitle>
              <div className="field" style={{ marginBottom: 12 }}>
                <label>Color de trazo</label>
                <div className="swatches">
                  {EDITOR_COLORS.map((col) => (
                    <button key={col} className={"sw" + (ap.color === col ? " on" : "")} style={{ background: col }} onClick={() => updatePath(ap.id, (p) => ({ ...p, color: col }), true)} />
                  ))}
                </div>
              </div>
              <PropRow label="Grosor">
                <input className="range" style={{ width: 120, "--fill": ((ap.width - 1) / 9 * 100) + "%" }} type="range" min="1" max="10" step="0.5" value={ap.width} onChange={(e) => updatePath(ap.id, (p) => ({ ...p, width: parseFloat(e.target.value) }), false)} />
              </PropRow>
              <PropRow label="Cerrar trazo"><Switch on={ap.closed} onChange={() => updatePath(ap.id, (p) => ({ ...p, closed: !p.closed }), true)} /></PropRow>
              <PropRow label="Relleno"><Switch on={ap.fill} onChange={() => updatePath(ap.id, (p) => ({ ...p, fill: !p.fill }), true)} /></PropRow>
              {ap.fill && (
                <div className="field" style={{ marginTop: 4 }}>
                  <div className="swatches">
                    {EDITOR_COLORS.map((col) => (
                      <button key={col} className={"sw" + (ap.fillColor === col ? " on" : "")} style={{ background: col }} onClick={() => updatePath(ap.id, (p) => ({ ...p, fillColor: col }), true)} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {selAnchor && (
            <div className="section">
              <SectionTitle right={<span className="tag">nodo {sel.ai}</span>}>Nodo seleccionado</SectionTitle>
              <div className="seg-inline" style={{ marginBottom: 12 }}>
                <button className={selAnchor.sharp ? "on" : ""} onClick={() => { if (!selAnchor.sharp) toggleSharp(ap.id, sel.ai); }}>Esquina</button>
                <button className={!selAnchor.sharp ? "on" : ""} onClick={() => { if (selAnchor.sharp) toggleSharp(ap.id, sel.ai); }}>Suave</button>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
                <NumberField axis="X" value={selAnchor.x} step={1} precision={0} onChange={(v) => updatePath(ap.id, (p) => { const an = p.anchors.slice(); const dx = v - an[sel.ai].x; const a = an[sel.ai]; an[sel.ai] = { ...a, x: v, in: a.in && { x: a.in.x + dx, y: a.in.y }, out: a.out && { x: a.out.x + dx, y: a.out.y } }; return { ...p, anchors: an }; }, true)} />
                <NumberField axis="Y" value={selAnchor.y} step={1} precision={0} onChange={(v) => updatePath(ap.id, (p) => { const an = p.anchors.slice(); const dy = v - an[sel.ai].y; const a = an[sel.ai]; an[sel.ai] = { ...a, y: v, in: a.in && { x: a.in.x, y: a.in.y + dy }, out: a.out && { x: a.out.x, y: a.out.y + dy } }; return { ...p, anchors: an }; }, true)} />
              </div>
              <button className="btn sm full" onClick={deleteAnchor}><Icon name="trash" size={15} />Eliminar nodo</button>
            </div>
          )}

          <div className="section">
            <SectionTitle>Lienzo</SectionTitle>
            <PropRow label="Mostrar grid"><Switch on={grid.show} onChange={(v) => setGrid((g) => ({ ...g, show: v }))} /></PropRow>
            <PropRow label="Snap a retícula"><Switch on={grid.snap} onChange={(v) => setGrid((g) => ({ ...g, snap: v }))} /></PropRow>
            <button className="btn sm full" style={{ marginTop: 10 }} onClick={clearAll}><Icon name="reset" size={15} />Vaciar lienzo</button>
          </div>
        </div>
      </div>
      {toastNode}
    </>
  );
}

export { EditorMode };
