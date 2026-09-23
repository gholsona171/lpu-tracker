// Finger signature pad. Strokes are stored as arrays of [x, y] in a 400x160 box so they
// stay small in JSON and can be redrawn as SVG.
import { h } from './dom.js';

export const SIG_W = 400, SIG_H = 160;

export function signaturePad() {
  const canvas = h('canvas', { class: 'sigpad', width: SIG_W, height: SIG_H, 'aria-label': 'Signature area' });
  const ctx = canvas.getContext('2d');
  let strokes = [];
  let current = null;

  const pos = (ev) => {
    const r = canvas.getBoundingClientRect();
    return [Math.round(((ev.clientX - r.left) / r.width) * SIG_W), Math.round(((ev.clientY - r.top) / r.height) * SIG_H)];
  };
  function redraw() {
    ctx.clearRect(0, 0, SIG_W, SIG_H);
    ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#1d1a16';
    for (const s of strokes) {
      ctx.beginPath();
      s.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      if (s.length === 1) ctx.lineTo(s[0][0] + 0.5, s[0][1]);
      ctx.stroke();
    }
  }
  canvas.addEventListener('pointerdown', (ev) => { ev.preventDefault(); canvas.setPointerCapture(ev.pointerId); current = [pos(ev)]; strokes.push(current); redraw(); });
  canvas.addEventListener('pointermove', (ev) => { if (!current) return; ev.preventDefault(); current.push(pos(ev)); redraw(); });
  const end = () => { current = null; };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);

  const clearBtn = h('button', { type: 'button', class: 'small', onclick: () => { strokes = []; redraw(); } }, 'Clear');
  const el = h('div', { class: 'sig' }, canvas, h('div', { class: 'row' }, clearBtn, h('span', { class: 'hint' }, 'Sign with a finger to confirm you were paid.')));
  return { el, strokes: () => strokes.map((s) => s.slice()), clear: () => { strokes = []; redraw(); }, isEmpty: () => strokes.every((s) => s.length < 2) };
}

export function strokesToSvg(strokes) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${SIG_W} ${SIG_H}`);
  svg.setAttribute('class', 'sig-view');
  for (const s of strokes || []) {
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    p.setAttribute('points', s.map(([x, y]) => `${x},${y}`).join(' '));
    p.setAttribute('fill', 'none'); p.setAttribute('stroke', 'currentColor'); p.setAttribute('stroke-width', '2.5'); p.setAttribute('stroke-linecap', 'round');
    svg.append(p);
  }
  return svg;
}
