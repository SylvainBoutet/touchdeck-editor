// Draws a page as the deck shows it (480x320), with the firmware layout rules.
import { ICONS } from './icons.js';
import { SCREEN, DEFAULTS, accentOf, cellArea, grid, itemAt, itemStyle, pageStyle, nearestFont } from './model.js';

const DAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

const measureCtx = document.createElement('canvas').getContext('2d');

function textWidth(text, size) {
  measureCtx.font = `600 ${size}px Inter`;
  // LVGL draws without kerning: a little wider than the browser
  return measureCtx.measureText(text).width * 1.08;
}

function el(tag, cls, parent) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (parent) parent.appendChild(e);
  return e;
}

function rgba(hex, opacityPercent) {
  const m = /^#([0-9a-f]{6})$/i.exec(hex || '');
  const v = m ? parseInt(m[1], 16) : 0;
  return `rgba(${v >> 16}, ${(v >> 8) & 255}, ${v & 255}, ${(opacityPercent ?? 100) / 100})`;
}

// Values shown in the editor: real clock, source defaults, 42 otherwise
export function sampleValue(config, key) {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  switch (key) {
    case 'time': return `${pad(now.getHours())}:${pad(now.getMinutes())}`;
    case 'seconds': return pad(now.getSeconds());
    case 'date': return `${DAYS[now.getDay()]} ${now.getDate()} ${MONTHS[now.getMonth()]}`;
    case 'ip': return '192.168.1.27';
    case 'wifi_rssi': return '-58';
    case 'uptime': return '2h14';
  }
  const src = config.sources?.[key];
  if (src && src.sample !== undefined) return String(src.sample);
  return '42';
}

export function renderTemplate(config, tpl) {
  return String(tpl || '').replace(/\{([^}]+)\}/g, (_, k) => sampleValue(config, k));
}

function iconNode(icon, size, color, assets) {
  if (!icon) return null;
  if (icon.startsWith('sym:')) {
    const cp = ICONS[icon.slice(4)];
    if (!cp) return null;
    const s = document.createElement('span');
    s.className = 'td-icon';
    s.textContent = String.fromCodePoint(cp);
    s.style.fontSize = `${nearestFont(size)}px`;
    s.style.color = color;
    return s;
  }
  const img = document.createElement('img');
  img.className = 'td-img';
  img.src = assets.get(icon) || '';
  img.style.width = img.style.height = `${size}px`;
  return img;
}

function label(text, size, color, parent) {
  const l = el('div', 'td-label', parent);
  l.textContent = text;
  l.style.fontSize = `${size}px`;
  l.style.lineHeight = `${Math.round(size * 1.25)}px`;
  l.style.color = color;
  return l;
}

function arcPath(cx, cy, r, a0, a1) {
  const p = (a) => [cx + r * Math.cos((a * Math.PI) / 180), cy + r * Math.sin((a * Math.PI) / 180)];
  const [x0, y0] = p(a0);
  const [x1, y1] = p(a1);
  const large = (a1 - a0 + 360) % 360 > 180 ? 1 : 0;
  return `M ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1}`;
}

function thresholdColor(item, value, base) {
  let c = base;
  for (const t of item.thresholds || []) if (value >= (t.from ?? 0)) c = t.color;
  return c;
}

function numericValue(config, item) {
  const v = parseFloat(sampleValue(config, item.source || ''));
  return Number.isFinite(v) ? v : 0;
}

function valueText(config, item) {
  let text = sampleValue(config, item.source || '');
  const n = parseFloat(text);
  if (Number.isFinite(n) && item.decimals >= 0) text = n.toFixed(item.decimals);
  if (item.unit && Number.isFinite(n)) text += (item.unit.startsWith('%') || item.unit.startsWith('°') ? '' : ' ') + item.unit;
  return text;
}

function renderButton(box, config, page, item, area, assets) {
  const on = !!item.toggle && !!item.previewOn;
  const st = (k) => itemStyle(config, page, item, k, on);
  const color = st('text_color');
  const layout = st('layout');
  box.classList.add('td-button', layout === 'icon_left' ? 'row' : 'col');

  if (layout !== 'text_only') {
    const ic = iconNode(st('icon'), st('icon_size'), color, assets);
    if (ic) box.appendChild(ic);
  }
  const text = layout === 'icon_only' ? '' : st('label') || '';
  if (text) {
    let size = nearestFont(st('label_size'));
    if (textWidth(text, size) > area.w - 12 && size !== 14) size = 14;
    label(text, size, color, box).classList.add('ellipsis');
  }
  if (item.value) {
    const v = label(renderTemplate(config, item.value), nearestFont(st('value_size')), color, box);
    v.style.opacity = 0.8;
  }
}

function number(text, size, color, parent, numbers) {
  const l = label(text, size, color, parent);
  if (numbers !== 'inter') l.classList.add('td-num');
  l.style.lineHeight = `${Math.round(size * 1.05)}px`;
  return l;
}

function dim(node) {
  node.style.opacity = 0.7;
  return node;
}

function gaugeSvg(d, frac, track, color) {
  const w = Math.max(6, Math.floor(d / 10));
  const r = d / 2 - w / 2;
  return `<svg width="${d}" height="${d}" viewBox="0 0 ${d} ${d}">
    <path d="${arcPath(d / 2, d / 2, r, 135, 45)}" stroke="${track}" stroke-width="${w}" fill="none" stroke-linecap="round"/>
    ${frac > 0 ? `<path d="${arcPath(d / 2, d / 2, r, 135, 135 + 270 * Math.min(frac, 0.999))}" stroke="${color}" stroke-width="${w}" fill="none" stroke-linecap="round"/>` : ''}
  </svg>`;
}

function gauge(parent, config, item, d, n, ctx) {
  const k = (base) => (n === 0 ? base : `${base}2`);
  const min = item[k('min')] ?? 0, max = item[k('max')] ?? 100;
  const src = { ...item, source: item[k('source')], decimals: item[k('decimals')], unit: '' };
  const v = numericValue(config, src);
  const g = el('div', 'td-gauge', parent);
  g.style.width = g.style.height = `${d}px`;
  g.innerHTML = gaugeSvg(d, (v - min) / (max - min || 1), ctx.track, thresholdColor(item, v, ctx.accent(n)));
  const unit = label(item[k('unit')] || '', d >= 110 ? 18 : 14, ctx.color, g);
  unit.classList.add('td-abs');
  unit.style.top = `${d / 2 - d * 0.22 - 9}px`;
  const val = number(valueText(config, src), d >= 120 ? 48 : d >= 80 ? 32 : 24, ctx.color, g, ctx.numbers);
  val.classList.add('td-abs');
  val.style.top = `${d / 2 + d * 0.04 - (d >= 120 ? 26 : d >= 80 ? 17 : 13)}px`;
  if (item[k('title')]) {
    const t = dim(label(item[k('title')], 14, ctx.color, g));
    t.classList.add('td-abs');
    t.style.bottom = '0';
  }
  return g;
}

function renderWidget(box, config, page, item, area, assets) {
  const color = itemStyle(config, page, item, 'text_color');
  const type = item.widget || 'text';
  box.classList.add('td-widget', `w-${type}`);
  const title = item.title || '';
  const ctx = {
    color,
    track: pageStyle(config, page, 'track_color') || DEFAULTS.track_color,
    numbers: config.theme?.numbers || 'condensed',
    accent: (n) => accentOf(config, page, item, n),
  };
  const { w, h } = area;

  if (type === 'text') {
    const l = label(renderTemplate(config, item.text), nearestFont(item.size || 18), color, box);
    l.style.whiteSpace = 'pre-wrap';
    l.style.textAlign = item.align || 'center';
    l.style.width = '100%';
  } else if (type === 'value') {
    if (title) dim(label(title, 14, color, box));
    const row = el('div', 'td-row-end', box);
    const size = item.size || (h >= 140 && w >= 160 ? 80 : h >= 100 ? 64 : h >= 70 ? 48 : 32);
    number(valueText(config, { ...item, unit: '' }), size, thresholdColor(item, numericValue(config, item), color), row, ctx.numbers);
    if (item.unit) dim(label(item.unit, size >= 48 ? 24 : 18, color, row)).style.paddingBottom = `${size / 8}px`;
  } else if (type === 'gauge') {
    gauge(box, config, item, Math.min(w, h) - 16, 0, ctx);
  } else if (type === 'dual') {
    box.classList.add('td-dual');
    const d = Math.min(w / 2 - 8, h - 16);
    gauge(box, config, item, d, 0, ctx);
    gauge(box, config, item, d, 1, ctx);
  } else if (type === 'bar') {
    const row = el('div', 'td-bar-head', box);
    dim(label(title, 14, color, row));
    number(valueText(config, item), h >= 90 ? 32 : 24, color, row, ctx.numbers);
    const min = item.min ?? 0, max = item.max ?? 100;
    const v = numericValue(config, item);
    const bar = el('div', 'td-bar', box);
    bar.style.height = `${Math.max(8, Math.min(Math.floor(h / 6), 18))}px`;
    bar.style.background = ctx.track;
    const fill = el('div', 'td-bar-fill', bar);
    fill.style.width = `${Math.max(0, Math.min(100, ((v - min) / (max - min || 1)) * 100))}%`;
    fill.style.background = thresholdColor(item, v, ctx.accent(0));
  } else if (type === 'chart') {
    const cw = w - 16, ch = h - 16;
    const n = item.points || 30;
    const ys = Array.from({ length: n }, (_, i) => ch - (0.45 + 0.3 * Math.sin(i / 3) + 0.1 * Math.sin(i * 1.7)) * ch);
    const pts = ys.map((y, i) => `${(i / (n - 1)) * cw},${y}`).join(' ');
    const c = el('div', 'td-chart td-abs-fill', box);
    const accent = ctx.accent(0);
    const gid = `g${Math.random().toString(36).slice(2, 8)}`;
    c.innerHTML = `<svg width="${cw}" height="${ch}"><defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${accent}" stop-opacity="${item.fill === false ? 0 : 0.75}"/><stop offset="1" stop-color="${accent}" stop-opacity="0"/></linearGradient></defs>
      <polygon points="0,${ch} ${pts} ${cw},${ch}" fill="url(#${gid})"/>
      <polyline points="${pts}" fill="none" stroke="${accent}" stroke-width="2"/></svg>`;
    if (title) {
      const chip = label(title, 14, color, box);
      chip.classList.add('td-chip');
      chip.style.background = `${accent}66`;
    }
    const row = el('div', 'td-row-end td-bottom-left', box);
    const size = h >= 140 ? 64 : h >= 90 ? 48 : 32;
    number(valueText(config, { ...item, unit: '' }), size, color, row, ctx.numbers);
    if (item.unit) dim(label(item.unit, 18, color, row)).style.paddingBottom = `${size / 8}px`;
  } else if (type === 'clock') {
    const clockColor = item.clock_color || config.theme?.clock_color || DEFAULTS.clock_color;
    const style = item.style || 'digital';
    if (style === 'analog') {
      const d = Math.min(w, h) - 16;
      const now = new Date();
      const hand = (angle, len, width, col) => {
        const a = ((angle - 90) * Math.PI) / 180;
        return `<line x1="${d / 2}" y1="${d / 2}" x2="${d / 2 + Math.cos(a) * len}" y2="${d / 2 + Math.sin(a) * len}" stroke="${col}" stroke-width="${width}" stroke-linecap="round"/>`;
      };
      const ticks = Array.from({ length: 60 }, (_, i) => {
        const a = ((i * 6 - 90) * Math.PI) / 180, major = i % 5 === 0;
        const r1 = d / 2 - (major ? d / 12 : 3);
        return `<line x1="${d / 2 + Math.cos(a) * r1}" y1="${d / 2 + Math.sin(a) * r1}" x2="${d / 2 + Math.cos(a) * (d / 2)}" y2="${d / 2 + Math.sin(a) * (d / 2)}" stroke="${major ? color : ctx.track}" stroke-width="${major ? 3 : 1}"/>`;
      }).join('');
      const r = d / 2;
      const c = el('div', '', box);
      c.innerHTML = `<svg width="${d}" height="${d}">${ticks}
        ${hand((now.getHours() % 12) * 30 + now.getMinutes() / 2, r * 0.5, Math.max(4, d / 30), color)}
        ${hand(now.getMinutes() * 6, r * 0.75, Math.max(3, d / 45), color)}
        ${hand(now.getSeconds() * 6, r * 0.85, 2, clockColor)}</svg>`;
    } else {
      const row = el('div', 'td-row-start', box);
      const size = item.size || (h >= 130 && w >= 200 ? 80 : h >= 90 ? 64 : 48);
      number(sampleValue(config, 'time'), size, clockColor, row, ctx.numbers);
      if (style === 'seconds') {
        const sec = number(sampleValue(config, 'seconds'), size >= 64 ? 32 : 24, clockColor, row, ctx.numbers);
        sec.style.opacity = 0.7;
        sec.style.paddingTop = `${size / 6}px`;
      }
      if (item.show_date !== false) dim(label(sampleValue(config, 'date'), h >= 120 ? 18 : 14, color, box));
    }
  } else if (type === 'media') {
    box.classList.add('td-media');
    const wide = w >= (h * 17) / 10 && h >= 90;
    if (wide) {
      const cover = el('div', 'td-cover', box);
      const cs = h - 16;
      Object.assign(cover.style, { width: `${cs}px`, height: `${cs}px`, background: ctx.track });
      const note = el('span', 'td-icon', cover);
      note.textContent = String.fromCodePoint(0xf001);
      note.style.fontSize = `${cs >= 90 ? 48 : 32}px`;
      note.style.color = color;
      note.style.opacity = 0.7;
    }
    const info = el('div', 'td-media-info', box);
    // Neutral placeholder: the real song comes from the computer program
    let texts = info;
    if (!wide) {
      const head = el('div', 'td-media-head', info);
      const cs = h >= 110 ? Math.min(52, Math.floor(h / 3)) : 0;
      if (cs) {
        const cover = el('div', 'td-cover', head);
        Object.assign(cover.style, { width: `${cs}px`, height: `${cs}px`, background: ctx.track, borderRadius: '6px' });
        const note = el('span', 'td-icon', cover);
        note.textContent = String.fromCodePoint(0xf001);
        Object.assign(note.style, { fontSize: '24px', color, opacity: 0.7 });
      }
      texts = el('div', 'td-media-texts', head);
    }
    label('Titre du morceau', h >= 120 ? 18 : 14, color, texts).classList.add('ellipsis');
    dim(label('Artiste', 14, color, texts)).classList.add('ellipsis');
    if (h >= 110) {
      const bar = el('div', 'td-bar', info);
      Object.assign(bar.style, { height: '4px', background: ctx.track });
      const fill = el('div', 'td-bar-fill', bar);
      Object.assign(fill.style, { width: '70%', background: '#9a9a9a' });
      const times = el('div', 'td-bar-head', info);
      dim(label('0:00', 14, color, times));
      dim(label('3:00', 14, color, times));
    }
    const controls = el('div', 'td-controls', info);
    const size = h >= 120 ? 24 : 18;
    for (const [cp, ring] of [[0xf048, false], [0xf04b, true], [0xf051, false]]) {
      const b = el('span', ring ? 'td-icon td-ring' : 'td-icon', controls);
      b.textContent = String.fromCodePoint(cp);
      b.style.fontSize = `${size}px`;
      b.style.color = color;
      if (ring) Object.assign(b.style, { width: `${size * 2}px`, height: `${size * 2}px`, borderColor: color });
    }
  } else if (type === 'volume') {
    const vertical = h > (w * 13) / 10;
    box.classList.add(vertical ? 'td-vol-v' : 'td-vol-h');
    const icon = el('span', 'td-icon', box);
    icon.textContent = String.fromCodePoint(0xf028);
    icon.style.fontSize = `${vertical ? 24 : 32}px`;
    icon.style.color = color;
    const track = el('div', 'td-slider', box);
    track.style.background = ctx.track;
    const fill = el('div', 'td-slider-fill', track);
    fill.style.background = ctx.accent(0);
    const knob = el('div', 'td-knob', track);
    knob.style.background = color;
    const v = Number(sampleValue(config, item.source || 'volume')) || 35;
    if (vertical) {
      Object.assign(track.style, { width: `${Math.max(10, w / 6)}px`, height: `${h - 100}px` });
      fill.style.height = `${v}%`;
      knob.style.bottom = `calc(${v}% - 10px)`;
    } else {
      Object.assign(track.style, { width: `${w - 120}px`, height: `${Math.max(10, h / 6)}px` });
      fill.style.width = `${v}%`;
      knob.style.left = `calc(${v}% - 10px)`;
    }
    number(String(Math.round(v)), vertical ? 24 : 32, color, box, ctx.numbers);
  } else if (type === 'image') {
    const img = el('img', 'td-widget-img', box);
    img.src = assets.get(item.src) || '';
  }
}

// Renders `page` into `stage` (a 480x320 element). Returns the item elements.
export function renderPage(stage, config, page, { assets = new Map(), selected = -1, showGrid = true } = {}) {
  stage.innerHTML = '';
  stage.style.background = pageStyle(config, page, 'background');

  const wallpaper = pageStyle(config, page, 'wallpaper');
  if (wallpaper && assets.get(wallpaper)) {
    const img = el('img', 'td-wallpaper', stage);
    img.src = assets.get(wallpaper);
    const dim = pageStyle(config, page, 'wallpaper_dim') || 0;
    if (dim > 0) el('div', 'td-shade', stage).style.background = `rgba(0,0,0,${dim / 100})`;
  }

  if (showGrid) {
    const g = grid(config, page);
    for (let row = 0; row < g.rows; row++)
      for (let col = 0; col < g.cols; col++) {
        // Only free cells: the outline would show through transparent items
        if (itemAt(config, page, col, row) >= 0) continue;
        const a = cellArea(config, page, { col, row });
        const cell = el('div', 'td-cell', stage);
        Object.assign(cell.style, { left: `${a.x}px`, top: `${a.y}px`, width: `${a.w}px`, height: `${a.h}px` });
        cell.dataset.col = col;
        cell.dataset.row = row;
      }
  }

  const nodes = [];
  (page.items || []).forEach((item, index) => {
    const a = cellArea(config, page, item);
    const box = el('div', 'td-item', stage);
    Object.assign(box.style, { left: `${a.x}px`, top: `${a.y}px`, width: `${a.w}px`, height: `${a.h}px` });
    box.dataset.index = index;

    const on = !!item.toggle && !!item.previewOn;
    const st = (k) => itemStyle(config, page, item, k, on);
    const card = item.type === 'widget' ? item.card !== false : true;
    if (card) {
      box.style.background = rgba(st('color'), st('opacity'));
      box.style.borderRadius = `${st('radius')}px`;
      const border = item.border || page.button?.border || config.theme?.button?.border || { width: 0 };
      if (border.width) box.style.border = `${border.width}px solid ${border.color || '#FFFFFF'}`;
    }
    if (item.type === 'widget') renderWidget(box, config, page, item, a, assets);
    else renderButton(box, config, page, item, a, assets);
    if (index === selected) box.classList.add('selected');
    nodes.push(box);
  });
  stage.style.width = `${SCREEN.w}px`;
  stage.style.height = `${SCREEN.h}px`;
  return nodes;
}
