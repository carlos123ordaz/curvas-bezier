import { useState, useEffect } from 'react';
import { Icon } from './icons.jsx';
import { useTweaks, TweaksPanel, TweakSection, TweakSlider, TweakColor } from './tweaks-panel.jsx';
import { EducativeMode } from './educative.jsx';
import { EditorMode } from './editor.jsx';

const TWEAK_DEFAULTS = {
  "accent": "#e0603a",
  "curveWidth": 3,
  "pointSize": 6,
  "speed": 0.4,
};

function App() {
  const [tw, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [mode, setMode] = useState(() => (typeof localStorage !== 'undefined' ? localStorage.getItem("bz.mode") : null) || "edu");
  const [theme, setTheme] = useState(() => (typeof localStorage !== 'undefined' ? localStorage.getItem("bz.theme") : null) || "light");
  const [grid, setGrid] = useState({ show: true, snap: false });

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("bz.theme", theme);
  }, [theme]);

  useEffect(() => { localStorage.setItem("bz.mode", mode); }, [mode]);

  useEffect(() => {
    const r = document.documentElement.style;
    r.setProperty("--accent", tw.accent);
    r.setProperty("--accent-soft", `color-mix(in srgb, ${tw.accent} 16%, var(--panel))`);
    r.setProperty("--accent-line", `color-mix(in srgb, ${tw.accent} 45%, var(--panel))`);
  }, [tw.accent]);

  const twFull = { ...tw };

  return (
    <div className="app">
      <div className="topbar">
        <div className="brand">
          <span className="glyph">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <path d="M3 19C3 9 21 15 21 5" stroke="var(--accent)" strokeWidth="2.2" strokeLinecap="round" />
              <circle cx="3" cy="19" r="2.4" fill="var(--curve)" />
              <circle cx="21" cy="5" r="2.4" fill="var(--curve)" />
              <circle cx="12" cy="12.2" r="2" fill="var(--point)" />
            </svg>
          </span>
          BezierApp <span className="ver">v1.0</span>
        </div>

        <div className="vsep" />

        <div className="segmented">
          <button className={mode === "edu" ? "on" : ""} onClick={() => setMode("edu")}>
            <Icon name="target" size={15} />Educativo
          </button>
          <button className={mode === "editor" ? "on" : ""} onClick={() => setMode("editor")}>
            <Icon name="vector" size={15} />Editor
          </button>
        </div>

        <div className="spacer" />

        <span className="hint" style={{ fontSize: 11.5, marginRight: 4 }}>
          {mode === "edu"
            ? "Arrastra los puntos · barra espaciadora = play"
            : "P pluma · V seleccionar · A nodos · ⌘Z deshacer"}
        </span>

        <button className="btn icon" title="Tema claro/oscuro" onClick={() => setTheme((t) => (t === "light" ? "dark" : "light"))}>
          <Icon name={theme === "light" ? "moon" : "sun"} size={17} />
        </button>
      </div>

      <div className="body">
        {mode === "edu"
          ? <EducativeMode tw={twFull} grid={grid} setGrid={setGrid} persistKey="bzapp.edu" />
          : <EditorMode tw={twFull} grid={grid} setGrid={setGrid} persistKey="bzapp.editor" />}
      </div>

      <TweaksPanel>
        <TweakSection label="Estilo de curva" />
        <TweakColor label="Color de acento" value={tw.accent}
          options={["#e0603a", "#2a6fdb", "#1f8a5b", "#8b62d6", "#e5484d"]}
          onChange={(v) => setTweak("accent", v)} />
        <TweakSlider label="Grosor de curva" value={tw.curveWidth} min={1.5} max={7} step={0.5} unit="px"
          onChange={(v) => setTweak("curveWidth", v)} />
        <TweakSlider label="Tamaño de punto" value={tw.pointSize} min={4} max={11} step={1} unit="px"
          onChange={(v) => setTweak("pointSize", v)} />
        <TweakSection label="Animación" />
        <TweakSlider label="Velocidad (Educativo)" value={tw.speed} min={0.1} max={1.2} step={0.05} unit="×"
          onChange={(v) => setTweak("speed", v)} />
      </TweaksPanel>
    </div>
  );
}

export default App;
