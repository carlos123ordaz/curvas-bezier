import { createElement as h } from 'react';

const ICONS = {
  cursor: "M5 3l14 6.5-6 1.7-1.7 6L5 3z",
  pen: ["M12 19l7-7-4-4-7 7-1 5z", "M13.5 7.5l3 3", "M5 19l3-1"],
  node: ["M5 5h0M19 19h0", "M7 7c6 0 4 10 10 10"],
  hand: "M8 11V5.5a1.5 1.5 0 013 0V11m0-1.5v-4a1.5 1.5 0 013 0V11m0-2a1.5 1.5 0 013 0v5a6 6 0 01-6 6h-1.2a5 5 0 01-3.8-1.8L6 16s-1.5-2-2.2-3c-.6-.9.4-2 1.4-1.5L8 13",
  grid: ["M4 9h16M4 15h16M9 4v16M15 4v16", "M4 4h16v16H4z"],
  magnet: ["M6 4v7a6 6 0 0012 0V4", "M6 4h4v7M14 4h4v7M6 11h4M14 11h4"],
  play: "M8 5v14l11-7z",
  pause: ["M9 5v14", "M15 5v14"],
  eye: ["M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z", "M12 15a3 3 0 100-6 3 3 0 000 6z"],
  eyeoff: ["M3 3l18 18", "M10.6 6.2A9.6 9.6 0 0112 6c6.5 0 10 6 10 6a16 16 0 01-3 3.6M6.3 6.3A16 16 0 002 12s3.5 7 10 7a9.4 9.4 0 004-.9", "M9.9 9.9a3 3 0 004.2 4.2"],
  plus: ["M12 5v14", "M5 12h14"],
  minus: "M5 12h14",
  trash: ["M4 7h16", "M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2", "M6 7l1 13a1 1 0 001 1h8a1 1 0 001-1l1-13"],
  undo: ["M9 7L4 12l5 5", "M4 12h11a5 5 0 010 10"],
  redo: ["M15 7l5 5-5 5", "M20 12H9a5 5 0 000 10"],
  download: ["M12 4v12", "M7 11l5 5 5-5", "M5 20h14"],
  save: ["M5 4h11l3 3v13H5z", "M8 4v5h7V4", "M8 14h8v6H8z"],
  sun: ["M12 8a4 4 0 100 8 4 4 0 000-8z", "M12 2v2M12 20v2M4 4l1.5 1.5M18.5 18.5L20 20M2 12h2M20 12h2M4 20l1.5-1.5M18.5 5.5L20 4"],
  moon: "M20 14.5A8 8 0 119.5 4a6.5 6.5 0 1010.5 10.5z",
  chevron: "M6 9l6 6 6-6",
  settings: ["M12 9a3 3 0 100 6 3 3 0 000-6z", "M19 12a7 7 0 00-.1-1.2l2-1.6-2-3.4-2.4 1a7 7 0 00-2-1.2L16 2H8l-.5 2.6a7 7 0 00-2 1.2l-2.4-1-2 3.4 2 1.6A7 7 0 003 12c0 .4 0 .8.1 1.2l-2 1.6 2 3.4 2.4-1c.6.5 1.3.9 2 1.2L8 22h8l.5-2.6c.7-.3 1.4-.7 2-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2z"],
  layers: ["M12 3l9 5-9 5-9-5 9-5z", "M3 13l9 5 9-5", "M3 17l9 5 9-5"],
  x: ["M6 6l12 12", "M18 6L6 18"],
  fit: ["M4 9V5a1 1 0 011-1h4M20 9V5a1 1 0 00-1-1h-4M4 15v4a1 1 0 001 1h4M20 15v4a1 1 0 01-1 1h-4"],
  code: ["M9 8l-4 4 4 4", "M15 8l4 4-4 4"],
  image: ["M4 5h16v14H4z", "M4 15l4-4 3 3 4-5 5 6", "M9 9a1.2 1.2 0 100-2.4A1.2 1.2 0 009 9z"],
  vector: ["M4 5h3v3H4zM17 5h3v3h-3zM4 16h3v3H4zM17 16h3v3h-3z", "M7 6.5h10M6.5 8v8M17.5 8v8M7 17.5h10"],
  link: ["M9 15l6-6", "M10 7l1-1a3.5 3.5 0 015 5l-1 1", "M14 17l-1 1a3.5 3.5 0 01-5-5l1-1"],
  unlink: ["M9 15l1.5-1.5M13.5 10.5L15 9", "M10 7l1-1a3.5 3.5 0 015 5l-1 1", "M14 17l-1 1a3.5 3.5 0 01-5-5l1-1", "M4 4l16 16"],
  dots: ["M5 12h0M12 12h0M19 12h0"],
  copy: ["M9 9h10v10H9z", "M5 15V5h10"],
  reset: ["M4 12a8 8 0 108-8 8 8 0 00-6.5 3.3", "M5 4v4h4"],
  flag: ["M6 21V4", "M6 4h11l-2 4 2 4H6"],
  target: ["M12 4v3M12 17v3M4 12h3M17 12h3", "M12 16a4 4 0 100-8 4 4 0 000 8z"],
  add_node: ["M12 4v8M8 12h8", "M6 19a2 2 0 100-4 2 2 0 000 4zM18 19a2 2 0 100-4 2 2 0 000 4z"],
  close_path: ["M7 17L17 7", "M5 7a2 2 0 100-4 2 2 0 000 4zM19 21a2 2 0 100-4 2 2 0 000 4z", "M5 5v0a8 8 0 0014 14"],
};

function Icon({ name, size = 18, fill = false, strokeWidth = 1.6, style }) {
  const d = ICONS[name];
  if (!d) return null;
  const parts = Array.isArray(d) ? d : [d];
  const filled = fill || name === "cursor" || name === "play" || name === "moon";
  return h("svg", {
    width: size, height: size, viewBox: "0 0 24 24",
    fill: filled ? "currentColor" : "none",
    stroke: filled && (name === "play" || name === "moon" || name === "cursor") ? "none" : "currentColor",
    strokeWidth, strokeLinecap: "round", strokeLinejoin: "round", style,
  }, parts.map((p, i) => h("path", { key: i, d: p })));
}

export { Icon, ICONS };
