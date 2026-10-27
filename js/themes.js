// Ready-made themes. Applying one replaces the theme block (grid excepted) and, for the
// seasonal ones, draws a wallpaper at the size of the card screen.

export const THEMES = {
  sombre: {
    name: 'Sombre',
    hint: "Noir, couleurs vives des capteurs, horloge jaune",
    theme: {
      background: '#000000',
      wallpaper_dim: 0,
      numbers: 'condensed',
      clock_color: '#F0E020',
      track_color: '#3A3A3A',
      accents: ['#C0E800', '#3040F0', '#E000C0', '#00F0F0', '#F0E020', '#E02020'],
      button: { color: '#161616', opacity: 100, radius: 12, text_color: '#FFFFFF', pressed_color: '#3A3A3A', border: { width: 0, color: '#FFFFFF' } },
      widget: { color: '#000000', opacity: 100, radius: 12 },
    },
  },
  halloween: {
    name: 'Halloween',
    hint: 'Nuit violette, lune, citrouilles et chauves-souris',
    wallpaper: 'halloween',
    theme: {
      background: '#12061F',
      wallpaper_dim: 25,
      numbers: 'condensed',
      clock_color: '#FF7A00',
      track_color: '#3A2A48',
      accents: ['#FF7A00', '#A040FF', '#7CFC00', '#FFB000', '#FF3B30', '#00E5FF'],
      button: { color: '#1A0F24', opacity: 80, radius: 14, text_color: '#FFF1E0', pressed_color: '#FF7A00', border: { width: 0, color: '#4A2A66' } },
      widget: { color: '#0B0612', opacity: 65, radius: 14 },
    },
  },
  noel: {
    name: 'Noël',
    hint: 'Nuit enneigée, sapins, rouge, vert et or',
    wallpaper: 'noel',
    theme: {
      background: '#04152A',
      wallpaper_dim: 20,
      numbers: 'condensed',
      clock_color: '#F2C14E',
      track_color: '#23394A',
      accents: ['#E5332A', '#1FA34A', '#F2C14E', '#5EC8F2', '#FFFFFF', '#C0E800'],
      button: { color: '#0E2233', opacity: 80, radius: 14, text_color: '#FFFFFF', pressed_color: '#E5332A', border: { width: 0, color: '#2E5470' } },
      widget: { color: '#06121C', opacity: 65, radius: 14 },
    },
  },
};

// Small deterministic random, so a wallpaper looks the same every time
function rng(seed) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

function bat(ctx, x, y, s) {
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.quadraticCurveTo(x - s * 0.5, y - s * 0.45, x - s, y - s * 0.1);
  ctx.quadraticCurveTo(x - s * 0.75, y + s * 0.05, x - s * 0.6, y + s * 0.25);
  ctx.quadraticCurveTo(x - s * 0.4, y + s * 0.05, x - s * 0.15, y + s * 0.2);
  ctx.lineTo(x, y + s * 0.08);
  ctx.lineTo(x + s * 0.15, y + s * 0.2);
  ctx.quadraticCurveTo(x + s * 0.4, y + s * 0.05, x + s * 0.6, y + s * 0.25);
  ctx.quadraticCurveTo(x + s * 0.75, y + s * 0.05, x + s, y - s * 0.1);
  ctx.quadraticCurveTo(x + s * 0.5, y - s * 0.45, x, y);
  ctx.fill();
}

function pumpkin(ctx, x, y, r) {
  ctx.fillStyle = '#E86A00';
  for (const dx of [-0.45, 0.45, 0]) {
    ctx.beginPath();
    ctx.ellipse(x + dx * r, y, r * (dx ? 0.62 : 0.7), r * 0.8, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#3B6B12';
  ctx.fillRect(x - r * 0.08, y - r * 1.05, r * 0.16, r * 0.3);
  // Carved face, lit from inside
  ctx.fillStyle = '#FFD23A';
  const tri = (cx, cy, s) => {
    ctx.beginPath();
    ctx.moveTo(cx - s, cy + s * 0.6);
    ctx.lineTo(cx + s, cy + s * 0.6);
    ctx.lineTo(cx, cy - s * 0.6);
    ctx.fill();
  };
  tri(x - r * 0.3, y - r * 0.15, r * 0.16);
  tri(x + r * 0.3, y - r * 0.15, r * 0.16);
  ctx.beginPath();
  ctx.moveTo(x - r * 0.45, y + r * 0.2);
  for (let i = 0; i <= 6; i++) ctx.lineTo(x - r * 0.45 + (i * r * 0.9) / 6, y + r * (i % 2 ? 0.3 : 0.42));
  ctx.lineTo(x + r * 0.45, y + r * 0.2);
  ctx.quadraticCurveTo(x, y + r * 0.62, x - r * 0.45, y + r * 0.2);
  ctx.fill();
}

function halloween(ctx, w, h) {
  const r = rng(31);
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, '#0A0314');
  sky.addColorStop(0.6, '#2A0B3D');
  sky.addColorStop(1, '#4A1450');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 60; i++) {
    ctx.fillStyle = `rgba(255,255,255,${0.3 + r() * 0.6})`;
    ctx.fillRect(r() * w, r() * h * 0.6, 1.2, 1.2);
  }
  const mx = w * 0.8, my = h * 0.24, mr = h * 0.16;
  const glow = ctx.createRadialGradient(mx, my, mr * 0.8, mx, my, mr * 2.6);
  glow.addColorStop(0, 'rgba(255,200,120,0.35)');
  glow.addColorStop(1, 'rgba(255,200,120,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#F6E7C1';
  ctx.beginPath();
  ctx.arc(mx, my, mr, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(200,170,120,0.35)';
  for (const [dx, dy, s] of [[-0.3, -0.2, 0.18], [0.25, 0.1, 0.12], [-0.05, 0.35, 0.1]]) {
    ctx.beginPath();
    ctx.arc(mx + dx * mr, my + dy * mr, s * mr, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#05010A';
  for (let i = 0; i < 7; i++) bat(ctx, w * (0.15 + r() * 0.7), h * (0.1 + r() * 0.35), h * (0.035 + r() * 0.03));
  ctx.beginPath();
  ctx.moveTo(0, h);
  ctx.lineTo(0, h * 0.84);
  ctx.quadraticCurveTo(w * 0.3, h * 0.74, w * 0.55, h * 0.86);
  ctx.quadraticCurveTo(w * 0.8, h * 0.78, w, h * 0.82);
  ctx.lineTo(w, h);
  ctx.fill();
  pumpkin(ctx, w * 0.1, h * 0.9, h * 0.07);
  pumpkin(ctx, w * 0.2, h * 0.93, h * 0.05);
  pumpkin(ctx, w * 0.9, h * 0.9, h * 0.06);
}

function tree(ctx, x, base, height) {
  const wdt = height * 0.55;
  ctx.fillStyle = '#4A2E1A';
  ctx.fillRect(x - height * 0.04, base - height * 0.12, height * 0.08, height * 0.12);
  for (let i = 0; i < 3; i++) {
    const top = base - height * (0.42 + i * 0.27);
    const bottom = base - height * (0.1 + i * 0.26);
    const half = (wdt / 2) * (1 - i * 0.25);
    ctx.fillStyle = '#0F5A30';
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x + half, bottom);
    ctx.lineTo(x - half, bottom);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath();
    ctx.moveTo(x - half, bottom);
    ctx.quadraticCurveTo(x, bottom - height * 0.06, x + half, bottom);
    ctx.quadraticCurveTo(x, bottom - height * 0.02, x - half, bottom);
    ctx.fill();
  }
}

function noel(ctx, w, h) {
  const r = rng(25);
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, '#020B1A');
  sky.addColorStop(0.7, '#0A2A3E');
  sky.addColorStop(1, '#123B4A');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);
  const glow = ctx.createRadialGradient(w * 0.82, h * 0.18, 0, w * 0.82, h * 0.18, h * 0.45);
  glow.addColorStop(0, 'rgba(242,193,78,0.35)');
  glow.addColorStop(1, 'rgba(242,193,78,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#F2C14E';
  ctx.beginPath();
  const sx = w * 0.82, sy = h * 0.18, so = h * 0.06, si = so * 0.42;
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rad = i % 2 ? si : so;
    ctx.lineTo(sx + Math.cos(a) * rad, sy + Math.sin(a) * rad);
  }
  ctx.fill();
  ctx.fillStyle = '#EAF6FF';
  ctx.beginPath();
  ctx.moveTo(0, h);
  ctx.lineTo(0, h * 0.86);
  ctx.quadraticCurveTo(w * 0.35, h * 0.78, w * 0.6, h * 0.88);
  ctx.quadraticCurveTo(w * 0.85, h * 0.82, w, h * 0.86);
  ctx.lineTo(w, h);
  ctx.fill();
  for (const [x, s] of [[0.07, 0.34], [0.16, 0.26], [0.9, 0.3], [0.97, 0.22]]) tree(ctx, w * x, h * 0.9, h * s);
  for (let i = 0; i < 140; i++) {
    const size = 0.6 + r() * 2.2;
    ctx.fillStyle = `rgba(255,255,255,${0.35 + r() * 0.6})`;
    ctx.beginPath();
    ctx.arc(r() * w, r() * h, size, 0, Math.PI * 2);
    ctx.fill();
  }
}

// PNG bytes of a seasonal wallpaper at w x h
export async function drawWallpaper(kind, w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ({ halloween, noel })[kind](ctx, w, h);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  return new Uint8Array(await blob.arrayBuffer());
}
