import { useState, useRef, useEffect, useCallback } from 'react';
import * as Bz from '../../lib/math.js';
import { Icon } from './icons.jsx';

function NumberField({ axis, value, onChange, step = 1, precision = 1 }) {
  const [draft, setDraft] = useState(null);
  const dragRef = useRef(null);
  const display = draft != null ? draft : Bz.round(value, precision);

  const startDrag = (e) => {
    e.preventDefault();
    dragRef.current = { x: e.clientX, v: value };
    const move = (ev) => {
      const dx = ev.clientX - dragRef.current.x;
      onChange(dragRef.current.v + dx * step);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  return (
    <div className="num">
      <span className="axis" style={{ cursor: "ew-resize" }} onPointerDown={startDrag}>{axis}</span>
      <input
        type="text" inputMode="decimal" value={display}
        onChange={(e) => setDraft(e.target.value)}
        onFocus={(e) => e.target.select()}
        onBlur={() => {
          const n = parseFloat(draft);
          if (!isNaN(n)) onChange(n);
          setDraft(null);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.target.blur(); }
          if (e.key === "Escape") { setDraft(null); e.target.blur(); }
          if (e.key === "ArrowUp") { e.preventDefault(); onChange(value + (e.shiftKey ? 10 : 1)); }
          if (e.key === "ArrowDown") { e.preventDefault(); onChange(value - (e.shiftKey ? 10 : 1)); }
        }}
      />
    </div>
  );
}

function Switch({ on, onChange }) {
  return <button className={"switch" + (on ? " on" : "")} onClick={() => onChange(!on)} aria-pressed={on} />;
}

function SectionTitle({ children, right }) {
  return (
    <div className="section-head">
      <div className="section-title"><span className="dot" />{children}</div>
      {right}
    </div>
  );
}

function Tool({ icon, kbd, active, onClick, title }) {
  return (
    <button className={"tool" + (active ? " active" : "")} onClick={onClick} title={title}>
      <Icon name={icon} size={19} />
      {kbd && <span className="kbd">{kbd}</span>}
    </button>
  );
}

function PropRow({ label, children }) {
  return <div className="prop"><span className="label">{label}</span>{children}</div>;
}

function useToast() {
  const [msg, setMsg] = useState(null);
  const tRef = useRef(null);
  const show = useCallback((m) => {
    setMsg(m);
    clearTimeout(tRef.current);
    tRef.current = setTimeout(() => setMsg(null), 2000);
  }, []);
  const node = msg ? (
    <div className="toast"><Icon name="save" size={15} />{msg}</div>
  ) : null;
  return [show, node];
}

function useHistory(initial) {
  const [stacks, setStacks] = useState({ past: [], present: initial, future: [] });
  const clone = (v) => JSON.parse(JSON.stringify(v));
  const set = useCallback((next) => {
    setStacks((s) => ({ ...s, present: typeof next === "function" ? next(s.present) : next }));
  }, []);
  const commit = useCallback(() => {
    setStacks((s) => ({ past: [...s.past, clone(s.present)].slice(-80), present: s.present, future: [] }));
  }, []);
  const undo = useCallback(() => {
    setStacks((s) => {
      if (!s.past.length) return s;
      const past = s.past.slice(0, -1);
      const prev = s.past[s.past.length - 1];
      return { past, present: prev, future: [clone(s.present), ...s.future] };
    });
  }, []);
  const redo = useCallback(() => {
    setStacks((s) => {
      if (!s.future.length) return s;
      const next = s.future[0];
      return { past: [...s.past, clone(s.present)], present: next, future: s.future.slice(1) };
    });
  }, []);
  const reset = useCallback((val) => setStacks({ past: [], present: val, future: [] }), []);
  return {
    present: stacks.present, set, commit, undo, redo, reset,
    canUndo: stacks.past.length > 0, canRedo: stacks.future.length > 0,
  };
}

function ZoomControls({ view, onView, zoomAt, onFit, base = 1, stageSize }) {
  const pct = Math.round(view.scale / base * 100);
  const cx = stageSize ? stageSize.w / 2 : 0;
  const cy = stageSize ? stageSize.h / 2 : 0;
  return (
    <div className="hud br" style={{ padding: 3 }}>
      <div className="zoomctl">
        <button title="Alejar" onClick={() => zoomAt(1 / 1.25, cx, cy)}><Icon name="minus" size={15} /></button>
        <span className="val">{pct}%</span>
        <button title="Acercar" onClick={() => zoomAt(1.25, cx, cy)}><Icon name="plus" size={15} /></button>
        <button title="Ajustar (⇧1)" onClick={onFit}><Icon name="fit" size={15} /></button>
      </div>
    </div>
  );
}

export { NumberField, Switch, SectionTitle, Tool, PropRow, useToast, useHistory, ZoomControls };
