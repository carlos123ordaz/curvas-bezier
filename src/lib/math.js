const _fact = [1, 1, 2, 6, 24, 120, 720, 5040, 40320, 362880, 3628800];
function fact(n) {
  if (n < _fact.length) return _fact[n];
  let r = _fact[_fact.length - 1];
  for (let i = _fact.length; i <= n; i++) r *= i;
  return r;
}
function binom(n, k) { return fact(n) / (fact(k) * fact(n - k)); }

function bernstein(i, n, t) {
  return binom(n, i) * Math.pow(t, i) * Math.pow(1 - t, n - i);
}

function bezierPoint(pts, t) {
  const n = pts.length - 1;
  let x = 0, y = 0;
  for (let i = 0; i <= n; i++) {
    const b = bernstein(i, n, t);
    x += b * pts[i].x;
    y += b * pts[i].y;
  }
  return { x, y };
}

function bezierDerivative(pts, t) {
  const n = pts.length - 1;
  if (n < 1) return { x: 0, y: 0 };
  let x = 0, y = 0;
  for (let i = 0; i <= n - 1; i++) {
    const b = bernstein(i, n - 1, t);
    x += b * n * (pts[i + 1].x - pts[i].x);
    y += b * n * (pts[i + 1].y - pts[i].y);
  }
  return { x, y };
}

function deCasteljau(pts, t) {
  const levels = [pts.map((p) => ({ x: p.x, y: p.y }))];
  let cur = levels[0];
  while (cur.length > 1) {
    const next = [];
    for (let i = 0; i < cur.length - 1; i++) {
      next.push({
        x: cur[i].x * (1 - t) + cur[i + 1].x * t,
        y: cur[i].y * (1 - t) + cur[i + 1].y * t,
      });
    }
    levels.push(next);
    cur = next;
  }
  return levels;
}

function sampleBezier(pts, steps) {
  const out = [];
  for (let i = 0; i <= steps; i++) out.push(bezierPoint(pts, i / steps));
  return out;
}

function bezierLength(pts, steps) {
  steps = steps || 64;
  let len = 0;
  let prev = bezierPoint(pts, 0);
  for (let i = 1; i <= steps; i++) {
    const p = bezierPoint(pts, i / steps);
    len += Math.hypot(p.x - prev.x, p.y - prev.y);
    prev = p;
  }
  return len;
}

function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function lerp(a, b, t) { return a + (b - a) * t; }
function round(v, d) { const m = Math.pow(10, d == null ? 2 : d); return Math.round(v * m) / m; }

function anchorsToSvgPath(anchors, closed) {
  if (!anchors.length) return "";
  const f = (n) => round(n, 2);
  let d = `M ${f(anchors[0].x)} ${f(anchors[0].y)}`;
  const segCount = closed ? anchors.length : anchors.length - 1;
  for (let i = 0; i < segCount; i++) {
    const a = anchors[i];
    const b = anchors[(i + 1) % anchors.length];
    const c1 = a.out || a;
    const c2 = b.in || b;
    const hasCurve = a.out || b.in;
    if (hasCurve) {
      d += ` C ${f(c1.x)} ${f(c1.y)}, ${f(c2.x)} ${f(c2.y)}, ${f(b.x)} ${f(b.y)}`;
    } else {
      d += ` L ${f(b.x)} ${f(b.y)}`;
    }
  }
  if (closed) d += " Z";
  return d;
}

function cubicToAnchors(p) {
  return [
    { x: p[0].x, y: p[0].y, in: null, out: { x: p[1].x, y: p[1].y } },
    { x: p[3].x, y: p[3].y, in: { x: p[2].x, y: p[2].y }, out: null },
  ];
}

function segmentSample(a, b, steps) {
  const c1 = a.out || a;
  const c2 = b.in || b;
  return sampleBezier([
    { x: a.x, y: a.y }, { x: c1.x, y: c1.y },
    { x: c2.x, y: c2.y }, { x: b.x, y: b.y },
  ], steps || 24);
}

export {
  fact, binom, bernstein,
  bezierPoint, bezierDerivative, deCasteljau,
  sampleBezier, bezierLength,
  dist, clamp, lerp, round,
  anchorsToSvgPath, cubicToAnchors, segmentSample,
};
