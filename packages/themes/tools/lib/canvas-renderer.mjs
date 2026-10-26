/* global document, Image, Path2D, DOMMatrix */
// A small board renderer for previews, on an HTML canvas.
//
// It runs inside headless Chromium (`page.evaluate(drawScene, scene)`), so it
// must not use anything from outside the function. It draws only what the
// manifest says: Canvas 2D has the same building blocks as Skia (paths,
// image patterns, gradients, blur, blend modes), so this is a fair test of
// the manifest data for the real Skia renderer.
//
// `scene` holds the resolved theme, one layout, image data URLs, and the
// checker positions that `src/geometry.ts` computed from the layout.

export async function drawScene(scene) {
  const { theme, layout, images, dpr, margin, debug } = scene;
  const bw = layout.referenceSize.width;
  const bh = layout.referenceSize.height;
  const W = bw + 2 * margin;
  const H = bh + 2 * margin;

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  canvas.style.width = `${W}px`;
  canvas.style.height = `${H}px`;
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  const loaded = {};
  await Promise.all(
    Object.entries(images).map(async ([key, src]) => {
      const img = new Image();
      img.src = src;
      await img.decode();
      loaded[key] = img;
    }),
  );

  // Normalized board coordinates -> canvas points.
  const X = (x) => margin + x * bw;
  const Y = (y) => margin + y * bh;
  const BLEND = {
    srcOver: 'source-over',
    multiply: 'multiply',
    softLight: 'soft-light',
    screen: 'screen',
    overlay: 'overlay',
  };

  const rgba = (hex, a) => {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  };
  // A radial gradient in a box (x, y, w, h), like SVG objectBoundingBox.
  const radial = (g, x, y, w, h) => {
    const cx = x + g.cx * w;
    const cy = y + g.cy * h;
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, g.rx * w);
    for (const s of g.stops) grad.addColorStop(s.offset, rgba(s.color, s.opacity));
    return { grad, cx, cy, sy: (g.ry * h) / (g.rx * w) };
  };
  const fillRadial = (g, x, y, w, h, path) => {
    const { grad, cx, cy, sy } = radial(g, x, y, w, h);
    ctx.save();
    ctx.clip(path);
    ctx.translate(cx, cy);
    ctx.scale(1, sy);
    ctx.translate(-cx, -cy);
    ctx.fillStyle = grad;
    ctx.fillRect(x - w, y - h / sy, 3 * w, (3 * h) / sy);
    ctx.restore();
  };
  const linear = (g, x, y, w, h) => {
    const grad = ctx.createLinearGradient(x + g.x1 * w, y + g.y1 * h, x + g.x2 * w, y + g.y2 * h);
    for (const s of g.stops) grad.addColorStop(s.offset, rgba(s.color, s.opacity));
    return grad;
  };
  const circle = (cx, cy, r) => {
    const p = new Path2D();
    p.arc(cx, cy, Math.max(r, 0.01), 0, Math.PI * 2);
    return p;
  };
  const roundRect = (x, y, w, h, r) => {
    const p = new Path2D();
    p.roundRect(x, y, w, h, r);
    return p;
  };
  const strokeCircle = (cx, cy, r, color, opacity, width, dash) => {
    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    if (dash) ctx.setLineDash(dash);
    ctx.stroke(circle(cx, cy, r));
    ctx.restore();
  };
  const dropShadow = (path, s, unit) => {
    ctx.save();
    ctx.filter = `blur(${s.blur * unit}px)`;
    ctx.globalAlpha = s.opacity;
    ctx.translate(s.dx * unit, s.dy * unit);
    ctx.fillStyle = s.color;
    ctx.fill(path);
    ctx.restore();
  };

  // 1. Table: the app background.
  const bg = ctx.createRadialGradient(W / 2, H * 0.42, 0, W / 2, H * 0.42, H * 0.8);
  bg.addColorStop(0, theme.palette['ui.bg']);
  bg.addColorStop(1, theme.palette['ui.bg.outer']);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // 2. Board shadow and image layers under the points.
  dropShadow(roundRect(X(0), Y(0), bw, bh, 5), layout.shadow, bw);
  const drawLayers = (z) => {
    for (const l of layout.layers.filter((q) => q.z === z)) {
      ctx.save();
      ctx.globalCompositeOperation = BLEND[l.blend];
      ctx.drawImage(loaded[l.image], X(0), Y(0), bw, bh);
      ctx.restore();
    }
  };
  drawLayers('underPoints');

  // 3. Points: vector triangles filled with a tiled wood texture.
  const ps = layout.pointShape;
  for (const p of scene.points) {
    const style = theme.points[p.tone];
    const path = new Path2D();
    p.triangle.forEach((v, i) => (i ? path.lineTo(X(v.x), Y(v.y)) : path.moveTo(X(v.x), Y(v.y))));
    path.closePath();
    ctx.fillStyle = style.fill;
    ctx.fill(path);
    const tile = loaded[style.texture];
    const pattern = ctx.createPattern(tile, 'repeat');
    const k = (ps.tileSize * bw) / tile.naturalWidth;
    pattern.setTransform(new DOMMatrix().translate(X(0), Y(0)).rotate(ps.tileRotation).scale(k, k));
    ctx.fillStyle = pattern;
    ctx.fill(path);
    ctx.save();
    ctx.globalAlpha = ps.seam.opacity;
    ctx.strokeStyle = ps.seam.color;
    ctx.lineWidth = ps.seam.width * bw;
    ctx.lineJoin = 'miter';
    ctx.stroke(path);
    ctx.restore();
  }

  // 4. Image layers over the points (wear, inner shadow).
  drawLayers('overPoints');

  // 5. Checkers.
  const R = layout.checker.radius * bw;
  const groove = (cx, cy, r, g) => {
    strokeCircle(cx, cy, g.radius * r, g.color, g.opacity, g.width * r);
    strokeCircle(
      cx + g.light.dx * r,
      cy + g.light.dy * r,
      g.radius * r,
      '#FFFFFF',
      g.light.opacity,
      g.light.width * r,
    );
  };
  const drawChecker = (cx, cy, s) => {
    const r = R;
    const body = circle(cx, cy, r);
    dropShadow(body, theme.checkers.shadow, r);
    ctx.fillStyle = s.fill;
    ctx.fill(body);
    fillRadial(s.highlight, cx - r, cy - r, 2 * r, 2 * r, body);
    if (s.dish) {
      const dr = s.dish.radius * r;
      fillRadial(s.dish.gradient, cx - dr, cy - dr, 2 * dr, 2 * dr, circle(cx, cy, dr));
      groove(cx, cy, r, s.dish.groove);
    }
    for (const g of s.grooves) groove(cx, cy, r, g);
    ctx.save();
    ctx.globalAlpha = s.bevel.opacity;
    ctx.strokeStyle = linear(s.bevel.gradient, cx - r, cy - r, 2 * r, 2 * r);
    ctx.lineWidth = s.bevel.width * r;
    ctx.stroke(circle(cx, cy, r - s.bevel.inset * r));
    ctx.restore();
    if (s.ring) strokeCircle(cx, cy, r - s.ring.inset * r, s.ring.color, 1, s.ring.width * r);
    strokeCircle(cx, cy, r - s.rim.inset * r, s.rim.color, 1, s.rim.width * r);
  };
  const drawBadge = (cx, cy, n) => {
    const b = theme.checkers.badge;
    const p = circle(cx, cy, b.radius * R);
    ctx.fillStyle = b.fill;
    ctx.fill(p);
    strokeCircle(cx, cy, b.radius * R, b.border, 1, b.borderWidth * R);
    ctx.fillStyle = b.text;
    ctx.font = `700 ${b.fontSize * R}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(n), cx, cy + 0.04 * R);
  };
  for (const c of scene.checkers) {
    drawChecker(X(c.x), Y(c.y), theme.checkers[c.color]);
    if (c.badge) drawBadge(X(c.x), Y(c.y), c.badge);
  }

  // 6. Borne-off checkers in the trays, seen from the edge.
  for (const t of scene.trays) {
    const s = theme.checkers[t.color];
    const x = X(t.rect.x);
    const y = Y(t.rect.y);
    const w = t.rect.w * bw;
    const h = t.rect.h * bh;
    const p = roundRect(x, y, w, h, Math.min(w, h) * 0.35);
    dropShadow(p, theme.checkers.shadow, R * 0.5);
    ctx.fillStyle = s.fill;
    ctx.fill(p);
    ctx.save();
    ctx.clip(p);
    ctx.fillStyle = linear(s.bevel.gradient, x, y, w, h);
    ctx.globalAlpha = 0.35 * s.bevel.opacity;
    ctx.fillRect(x, y, w, h);
    ctx.restore();
    ctx.strokeStyle = (s.ring ?? s.rim).color;
    ctx.lineWidth = s.rim.width * R;
    ctx.stroke(p);
  }

  // 7. Highlights: the selected checker and the legal targets.
  const hl = theme.highlights;
  for (const h of scene.highlights) {
    const cx = X(h.x);
    const cy = Y(h.y);
    if (h.kind === 'select') {
      const s = hl.select;
      strokeCircle(cx, cy, s.radius * R, s.halo.color, s.halo.opacity, s.halo.width * R);
      strokeCircle(cx, cy, s.radius * R, s.color, 1, s.width * R);
    } else {
      const t = hl.target;
      ctx.save();
      ctx.globalAlpha = t.fillOpacity;
      ctx.fillStyle = t.color;
      ctx.fill(circle(cx, cy, t.radius * R));
      ctx.restore();
      strokeCircle(cx, cy, t.radius * R, t.halo.color, t.halo.opacity, t.halo.width * R);
      strokeCircle(cx, cy, t.radius * R, t.color, 1, t.width * R, [t.dash[0] * R, t.dash[1] * R]);
    }
  }

  // 8. Dice.
  // prettier-ignore
  const PIPS = {
    1: [[0, 0]],
    2: [[-1, -1], [1, 1]],
    3: [[-1, -1], [0, 0], [1, 1]],
    4: [[-1, -1], [1, -1], [-1, 1], [1, 1]],
    5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]],
    6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]],
  };
  const D = theme.dice;
  const size = layout.dice.size * bw;
  scene.dice.forEach((d, i) => {
    ctx.save();
    ctx.translate(X(d.x), Y(d.y));
    ctx.rotate((layout.dice.tilt[i % 2] * Math.PI) / 180);
    const h = size / 2;
    const body = roundRect(-h, -h, size, size, D.cornerRadius * size);
    dropShadow(body, D.shadow, size);
    ctx.fillStyle = D.side;
    ctx.fill(body);
    const i0 = D.faceInset * size;
    const fw = size - 2.5 * i0;
    const face = roundRect(-h + i0, -h + i0 * 0.7, fw, fw, D.cornerRadius * size * 0.85);
    ctx.fillStyle = D.face;
    ctx.fill(face);
    ctx.save();
    ctx.globalAlpha = D.highlightOpacity;
    fillRadial(D.highlight, -h + i0, -h + i0 * 0.7, fw, fw, face);
    ctx.restore();
    ctx.strokeStyle = D.edge;
    ctx.lineWidth = D.edgeWidth * size;
    ctx.stroke(roundRect(-h + 0.5, -h + 0.5, size - 1, size - 1, D.cornerRadius * size));
    const fc = -h + i0 + fw / 2;
    const fcy = -h + i0 * 0.7 + fw / 2;
    for (const [u, v] of PIPS[d.value]) {
      ctx.fillStyle = d.value === 1 ? D.acePip : D.pip;
      ctx.fill(
        circle(fc + u * D.pipSpacing * size, fcy + v * D.pipSpacing * size, D.pipRadius * size),
      );
    }
    ctx.restore();
  });

  // 9. Light over everything (the lamp).
  if (layout.overlay) {
    ctx.save();
    ctx.globalCompositeOperation = BLEND[layout.overlay.blend];
    fillRadial(layout.overlay.gradient, X(0), Y(0), bw, bh, roundRect(X(0), Y(0), bw, bh, 5));
    ctx.restore();
  }

  // Debug: outline every layout rect.
  if (debug) {
    const box = (r, color) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = 0.8;
      ctx.strokeRect(X(r.x), Y(r.y), r.w * bw, r.h * bh);
    };
    for (const p of layout.points) {
      box(p.rect, '#00E5FF');
      ctx.fillStyle = '#00E5FF';
      ctx.font = '700 10px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(String(p.index), X(p.rect.x + p.rect.w / 2), Y(p.rect.y + p.rect.h / 2) + 4);
    }
    box(layout.bar.player.rect, '#FF4081');
    box(layout.bar.opponent.rect, '#FF9100');
    box(layout.trays.player.rect, '#FF4081');
    box(layout.trays.opponent.rect, '#FF9100');
    box(layout.diceArea, '#76FF03');
  }
  return { width: W, height: H };
}
