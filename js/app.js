import { Device, DeviceError, compareVersions } from './device.js';
import { ICONS } from './icons.js';
import {
  ACTIONS, APPS, BUILTIN_SOURCES, CLOCK_STYLES, DEFAULTS, DEFAULT_ACCENTS, FONT_SIZES, KEY_NAMES, LAYOUTS, LAYOUTS_KEYBOARD,
  MEDIA, MODIFIERS, PALETTE, SCREEN, SHORTCUTS, SYSTEMS, TIMEZONES, WIDGETS, comboLabel, cellArea, cellAt, demoConfig, grid, itemAt, itemStyle,
  keyNameFromEvent, newAction, newButton, newPage, newWidget, pageStyle, setScreen, validate, accentOf,
} from './model.js';
import { THEMES, drawWallpaper } from './themes.js';
import { renderPage } from './preview.js';

// ------- State -------

const state = {
  config: demoConfig(),
  page: 0,
  selected: -1,
  tab: 'page',
  dirty: false,
  images: new Map(), // path -> { bytes, url, pending }
  files: [], // files on the card: [{ p, s }]
  info: null,
  hello: null,
  latest: null, // firmware published with the editor: { version, size, md5 }
  updating: false,
};
const device = new Device();
const $ = (id) => document.getElementById(id);

// ------- Small helpers -------

function toast(message, error = false) {
  const t = $('toast');
  t.textContent = message;
  t.className = error ? 'toast error' : 'toast';
  t.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (t.hidden = true), error ? 6000 : 3500);
}

function errorMessage(e) {
  if (e instanceof DeviceError) {
    const known = {
      code: 'Code de la carte requis ou incorrect.',
      space: "Plus assez de place sur la carte (supprime des images dans l'onglet Carte).",
      notfound: 'Fichier introuvable sur la carte.',
      disconnected: 'La carte a été déconnectée.',
      open: "La carte n'a pas pu créer un fichier : l'enregistrement est arrêté, la carte garde sa configuration précédente.",
    };
    return known[e.code] || e.message;
  }
  if (e?.name === 'NotFoundError') return 'Aucune carte choisie.';
  return e?.message || String(e);
}

function slug(text) {
  return (
    String(text)
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/\.[a-z0-9]+$/, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 32) || 'image'
  );
}

// The card refuses file names over 27 characters (32 with the ".part" used while uploading):
// 20 for the name leaves room for "-99" and ".png"
function uniquePath(dir, name) {
  let base = `${dir}/${slug(name).slice(0, 20).replace(/-$/, '')}`;
  let path = `${base}.png`;
  for (let i = 2; state.images.has(path) || state.files.some((f) => f.p === path); i++) path = `${base}-${i}.png`;
  return path;
}

function curPage() {
  return state.config.pages[state.page];
}

function curItem() {
  return curPage()?.items?.[state.selected];
}

function clone(o) {
  return JSON.parse(JSON.stringify(o));
}

// The configuration as written to the card: editor-only keys removed
function cleanConfig() {
  const c = clone(state.config);
  for (const p of c.pages) for (const it of p.items || []) delete it.previewOn;
  for (const s of Object.values(c.sources || {})) delete s.sample;
  return c;
}

function assetsMap() {
  const m = new Map();
  for (const [p, img] of state.images) m.set(p, img.url);
  return m;
}

function addImage(path, bytes, pending) {
  const old = state.images.get(path);
  if (old) URL.revokeObjectURL(old.url);
  const url = URL.createObjectURL(new Blob([bytes], { type: 'image/png' }));
  state.images.set(path, { bytes, url, pending });
}

// Resizes an image file to a PNG of w x h ("cover" crops, "contain" keeps it whole)
async function processImage(file, w, h, mode) {
  const bmp = await createImageBitmap(file);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  const scale = mode === 'cover' ? Math.max(w / bmp.width, h / bmp.height) : Math.min(w / bmp.width, h / bmp.height);
  const dw = bmp.width * scale, dh = bmp.height * scale;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bmp, (w - dw) / 2, (h - dh) / 2, dw, dh);
  const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'));
  return new Uint8Array(await blob.arrayBuffer());
}

function changed({ pages = false, inspector = false } = {}) {
  state.dirty = true;
  renderStage();
  renderProblems();
  updateButtons();
  if (pages) renderPages();
  if (inspector) renderInspector();
}

// ------- Rendering -------

function renderAll() {
  renderPages();
  renderStage();
  renderInspector();
  renderProblems();
  updateButtons();
}

function updateButtons() {
  $('btnSave').disabled = !device.connected;
  $('btnShot').disabled = !device.connected;
  $('btnConnect').textContent = device.connected ? 'Déconnecter' : 'Connecter la carte';
  const s = $('status');
  if (!device.connected) {
    s.className = 'status off';
    s.textContent = 'Carte non connectée';
  } else {
    s.className = 'status on';
    s.textContent = `Carte connectée${state.info?.version ? ` (v${state.info.version})` : ''}${updateAvailable() ? ' · mise à jour disponible' : ''}${state.dirty ? ' · modifications non enregistrées' : ''}`;
  }
  document.title = state.dirty ? 'TouchDeck *' : 'TouchDeck';
}

function renderPages() {
  const list = $('pageList');
  list.innerHTML = '';
  const start = state.config.device?.start_page;
  state.config.pages.forEach((p, i) => {
    const li = document.createElement('li');
    li.className = i === state.page ? 'active' : '';
    li.innerHTML = `<span class="name"></span>${(start ? p.id === start : i === 0) ? '<span class="start">départ</span>' : ''}`;
    li.querySelector('.name').textContent = p.name || p.id;
    li.onclick = () => selectPage(i);
    list.appendChild(li);
  });
}

function selectPage(i) {
  state.page = i;
  state.selected = -1;
  if (state.tab === 'item') state.tab = 'page';
  renderAll();
  if (device.connected) device.showPage(curPage().id).catch(() => {});
}

function stageScale() {
  return $('stage').parentElement.clientWidth / SCREEN.w;
}

function renderStage() {
  const stage = $('stage');
  stage.style.transform = `scale(${stageScale()})`;
  const nodes = renderPage(stage, state.config, curPage(), { assets: assetsMap(), selected: state.selected });

  stage.querySelectorAll('.td-cell').forEach((cell) => {
    const col = +cell.dataset.col, row = +cell.dataset.row;
    cell.onclick = () => (armedTile ? placeFromPalette(armedTile, col, row) : addAt(col, row));
    cell.ondragover = (e) => {
      e.preventDefault();
      cell.classList.add('drop');
    };
    cell.ondragleave = () => cell.classList.remove('drop');
    cell.ondrop = (e) => {
      e.preventDefault();
      placeFromPalette(e.dataTransfer.getData('text/touchdeck'), col, row);
    };
  });
  nodes.forEach((node, index) => {
    node.onpointerdown = (e) => startDrag(e, index, 'move');
    if (index === state.selected) {
      const h = document.createElement('div');
      h.className = 'resize-handle';
      h.onpointerdown = (e) => {
        e.stopPropagation();
        startDrag(e, index, 'resize');
      };
      node.appendChild(h);
    }
  });
}

// ------- Palette -------

let armedTile = null;

function renderPalette() {
  const box = $('palette');
  box.innerHTML = '';
  for (const entry of PALETTE) {
    const [id, labelText, cp] = entry;
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `tile${armedTile === id ? ' armed' : ''}`;
    b.draggable = true;
    b.innerHTML = `<span class="td-icon">${String.fromCodePoint(cp)}</span><span></span>`;
    b.lastChild.textContent = labelText;
    b.title = 'Glisse sur une case, ou clique puis clique sur une case';
    b.ondragstart = (e) => e.dataTransfer.setData('text/touchdeck', id);
    b.onclick = () => {
      armedTile = armedTile === id ? null : id;
      renderPalette();
    };
    box.appendChild(b);
  }
}

// Places a palette element at a cell, with its preferred size when it fits
function placeFromPalette(id, col, row) {
  const entry = PALETTE.find((p) => p[0] === id);
  if (!entry) return;
  const page = curPage();
  page.items ||= [];
  const [cw, ch] = entry[3];
  const g = grid(state.config, page);
  let size = null;
  for (const [w, h] of [[cw, ch], [cw, 1], [1, 1]]) {
    if (col + w <= g.cols && row + h <= g.rows && fits(page, -1, col, row, w, h)) {
      size = [w, h];
      break;
    }
  }
  if (!size) return toast('Cette case est déjà prise.', true);
  const item = { ...clone(entry[4]), col, row };
  if (size[0] > 1) item.colspan = size[0];
  if (size[1] > 1) item.rowspan = size[1];
  page.items.push(item);
  state.selected = page.items.length - 1;
  state.tab = 'item';
  armedTile = null;
  renderPalette();
  changed({ inspector: true });
}

function renderProblems() {
  const box = $('problems');
  box.innerHTML = '';
  for (const p of validate(state.config)) {
    const d = document.createElement('div');
    d.className = 'problem';
    d.textContent = p;
    box.appendChild(d);
  }
}

// ------- Stage interactions -------

async function addAt(col, row) {
  const choice = await dialogChoice('dlgAdd');
  if (choice !== 'button' && choice !== 'widget') return;
  const page = curPage();
  page.items ||= [];
  page.items.push(choice === 'button' ? newButton(col, row) : newWidget(col, row));
  state.selected = page.items.length - 1;
  state.tab = 'item';
  changed({ inspector: true });
  renderTabs();
}

function stagePoint(e) {
  const r = $('stage').getBoundingClientRect();
  const s = stageScale();
  return { x: (e.clientX - r.left) / s, y: (e.clientY - r.top) / s };
}

function startDrag(e, index, mode) {
  e.preventDefault();
  const page = curPage();
  const item = page.items[index];
  const start = stagePoint(e);
  let moved = false;
  const node = e.currentTarget.closest('.td-item');

  if (state.selected !== index) {
    state.selected = index;
    state.tab = 'item';
    renderStage();
    renderInspector();
    renderTabs();
  }

  const onMove = (ev) => {
    const p = stagePoint(ev);
    if (!moved && Math.hypot(p.x - start.x, p.y - start.y) < 6) return;
    moved = true;
    const cell = cellAt(state.config, page, p.x, p.y);
    if (!cell) return;
    if (mode === 'move') {
      const a = cellArea(state.config, page, item);
      if (cell.col === a.col && cell.row === a.row) return;
      if (!fits(page, index, cell.col, cell.row, a.colspan, a.rowspan)) return;
      item.col = cell.col;
      item.row = cell.row;
    } else {
      const colspan = Math.max(1, cell.col - (item.col | 0) + 1);
      const rowspan = Math.max(1, cell.row - (item.row | 0) + 1);
      if (colspan === (item.colspan || 1) && rowspan === (item.rowspan || 1)) return;
      if (!fits(page, index, item.col | 0, item.row | 0, colspan, rowspan)) return;
      item.colspan = colspan;
      item.rowspan = rowspan;
    }
    changed();
    renderInspector();
  };
  const onUp = () => {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    node?.classList.remove('dragging');
  };
  node?.classList.add('dragging');
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
}

// True when the area is inside the grid and free of other items
function fits(page, index, col, row, colspan, rowspan) {
  const g = grid(state.config, page);
  if (col + colspan > g.cols || row + rowspan > g.rows) return false;
  for (let c = col; c < col + colspan; c++)
    for (let r = row; r < row + rowspan; r++) {
      const other = itemAt(state.config, page, c, r);
      if (other >= 0 && other !== index) return false;
    }
  return true;
}

// ------- Dialogs -------

function dialogChoice(id) {
  const d = $(id);
  return new Promise((resolve) => {
    d.onclose = () => resolve(d.returnValue);
    d.returnValue = '';
    d.showModal();
  });
}

const ICON_WORDS = {
  micro: 'microphone', son: 'volume', volume: 'volume', muet: 'mute', lecture: 'play', pause: 'pause',
  suivant: 'next', precedent: 'prev', maison: 'home', accueil: 'home', cadenas: 'lock', verrou: 'lock',
  dossier: 'folder', copier: 'copy', coller: 'paste', reglage: 'cog', parametre: 'cog', ecran: 'desktop',
  photo: 'camera', camera: 'camera', etoile: 'star', coeur: 'heart', horloge: 'clock', heure: 'clock',
  calendrier: 'calendar', ampoule: 'lightbulb', lumiere: 'lightbulb', musique: 'music', clavier: 'keyboard',
  stylo: 'pen', crayon: 'pen', poubelle: 'trash', meteo: 'cloud', temperature: 'thermometer', fusee: 'rocket',
  casque: 'headphones', jeu: 'gamepad', message: 'comment', mail: 'envelope', courriel: 'envelope',
  telephone: 'phone', feu: 'fire', eclair: 'bolt', outil: 'wrench', lune: 'moon', soleil: 'sun',
};

function openIconPicker(uploadSize) {
  const d = $('dlgIcon');
  const gridEl = $('iconGrid');
  const search = $('iconSearch');
  return new Promise((resolve) => {
    let result;
    const draw = () => {
      let q = slug(search.value).replace(/-/g, '_');
      for (const [fr, en] of Object.entries(ICON_WORDS)) if (q && fr.startsWith(q)) q = en;
      gridEl.innerHTML = '';
      for (const [name, cp] of Object.entries(ICONS)) {
        if (q && !name.includes(q)) continue;
        const b = document.createElement('button');
        b.type = 'button';
        b.innerHTML = `<span class="td-icon">${String.fromCodePoint(cp)}</span><small>${name}</small>`;
        b.onclick = () => {
          result = `sym:${name}`;
          d.close('picked');
        };
        gridEl.appendChild(b);
      }
    };
    search.value = '';
    search.oninput = draw;
    $('iconUpload').value = '';
    $('iconUpload').onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const path = uniquePath('/icons', file.name);
      addImage(path, await processImage(file, uploadSize, uploadSize, 'contain'), true);
      result = path;
      d.close('picked');
    };
    d.onclose = () => resolve(d.returnValue === 'picked' ? result : d.returnValue === 'none' ? '' : undefined);
    draw();
    d.showModal();
    search.focus();
  });
}

function askPin(wrong = false) {
  const d = $('dlgPin');
  $('pinInput').value = '';
  $('pinError').hidden = !wrong;
  return new Promise((resolve) => {
    d.onclose = () => resolve(d.returnValue === 'ok' ? $('pinInput').value : null);
    d.showModal();
    $('pinInput').focus();
  });
}

// ------- Form helpers -------

function h4(parent, text) {
  const h = document.createElement('h4');
  h.textContent = text;
  parent.appendChild(h);
  return h;
}

function note(parent, text) {
  const p = document.createElement('p');
  p.className = 'note';
  p.textContent = text;
  parent.appendChild(p);
  return p;
}

function field(parent, labelText, control, stack = false) {
  const f = document.createElement('div');
  f.className = stack ? 'field stack' : 'field';
  if (labelText !== null) {
    const l = document.createElement('label');
    l.textContent = labelText;
    f.appendChild(l);
  }
  f.appendChild(control);
  parent.appendChild(f);
  return f;
}

function input(type, value, onInput, attrs = {}) {
  const i = document.createElement(type === 'textarea' ? 'textarea' : 'input');
  if (type !== 'textarea') i.type = type;
  i.value = value ?? '';
  Object.assign(i, attrs);
  i.addEventListener('input', () => onInput(type === 'number' ? (i.value === '' ? undefined : Number(i.value)) : i.value));
  return i;
}

function select(options, value, onChange) {
  const s = document.createElement('select');
  for (const [v, l] of options) {
    const o = document.createElement('option');
    o.value = v;
    o.textContent = l;
    s.appendChild(o);
  }
  s.value = value ?? '';
  s.addEventListener('change', () => onChange(s.value));
  return s;
}

function checkbox(text, checked, onChange) {
  const l = document.createElement('label');
  l.className = 'inherit';
  const c = document.createElement('input');
  c.type = 'checkbox';
  c.checked = !!checked;
  c.addEventListener('change', () => onChange(c.checked));
  l.append(c, document.createTextNode(text));
  return l;
}

function range(min, max, value, onInput, suffix = '') {
  const w = document.createElement('div');
  w.className = 'inline';
  const r = input('range', value, (v) => {
    out.textContent = `${v}${suffix}`;
    onInput(Number(v));
  }, { min, max });
  const out = document.createElement('output');
  out.textContent = `${value}${suffix}`;
  w.append(r, out);
  return w;
}

function inline(...nodes) {
  const w = document.createElement('div');
  w.className = 'inline';
  w.append(...nodes);
  return w;
}

function button(text, onClick, cls = 'small') {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = cls;
  b.textContent = text;
  b.onclick = onClick;
  return b;
}

// A style key that can be left to its inherited value ("par défaut")
function styleField(parent, labelText, owner, key, inherited, make) {
  const own = owner[key] !== undefined;
  const control = make(own ? owner[key] : inherited, (v) => {
    owner[key] = v;
    changed();
  });
  if (!own) control.querySelectorAll?.('input,select').forEach((i) => (i.disabled = true));
  if (!own && control.matches?.('input,select')) control.disabled = true;
  const toggle = checkbox('défaut', !own, (isDefault) => {
    if (isDefault) delete owner[key];
    else owner[key] = inherited;
    changed({ inspector: true });
  });
  return field(parent, labelText, inline(control, toggle));
}

function colorControl(value, set) {
  return input('color', value || '#FFFFFF', (v) => set(v.toUpperCase()));
}

// ------- Inspector -------

function renderTabs() {
  document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === state.tab));
}

function renderInspector() {
  renderTabs();
  const body = $('inspector');
  body.innerHTML = '';
  ({ item: inspectItem, page: inspectPage, theme: inspectTheme, data: inspectData, device: inspectDevice })[state.tab](body);
}

function iconField(parent, labelText, owner, key, size) {
  const preview = document.createElement('span');
  preview.className = 'icon-preview';
  const value = owner[key] || '';
  if (value.startsWith('sym:')) preview.textContent = String.fromCodePoint(ICONS[value.slice(4)] || 0x3f);
  else if (value) {
    const img = document.createElement('img');
    img.src = state.images.get(value)?.url || '';
    preview.appendChild(img);
  }
  const b = button(value ? 'Changer' : 'Choisir', async () => {
    const picked = await openIconPicker(size);
    if (picked === undefined) return;
    if (picked) owner[key] = picked;
    else delete owner[key];
    changed({ inspector: true });
  });
  field(parent, labelText, inline(preview, b));
}

function positionFields(body, page, item) {
  h4(body, 'Position');
  const g = grid(state.config, page);
  const a = cellArea(state.config, page, item);
  const set = (k, v, max) => {
    const n = Math.max(1, Math.min(max, v | 0));
    const next = { col: a.col, row: a.row, colspan: a.colspan, rowspan: a.rowspan, [k]: k === 'col' || k === 'row' ? n - 1 : n };
    if (!fits(page, state.selected, next.col, next.row, next.colspan, next.rowspan)) {
      toast("Cette place est déjà prise ou sort de la grille.", true);
      renderInspector();
      return;
    }
    Object.assign(item, next);
    changed();
  };
  field(body, 'Colonne / ligne', inline(
    input('number', a.col + 1, (v) => set('col', v, g.cols), { min: 1, max: g.cols }),
    input('number', a.row + 1, (v) => set('row', v, g.rows), { min: 1, max: g.rows })));
  field(body, 'Largeur / hauteur', inline(
    input('number', a.colspan, (v) => set('colspan', v, g.cols), { min: 1, max: g.cols, title: 'en cases' }),
    input('number', a.rowspan, (v) => set('rowspan', v, g.rows), { min: 1, max: g.rows, title: 'en cases' })));
}

function appearanceFields(body, page, item) {
  h4(body, 'Apparence');
  const inh = (k) => (page.button?.[k] ?? state.config.theme?.button?.[k] ?? DEFAULTS.button[k]);
  if (item.type === 'widget') {
    field(body, 'Fond', checkbox('afficher le fond de la zone', item.card !== false, (v) => {
      if (v) delete item.card;
      else item.card = false;
      changed();
    }));
  }
  styleField(body, 'Couleur', item, 'color', inh('color'), colorControl);
  styleField(body, 'Opacité', item, 'opacity', inh('opacity'), (v, set) => range(0, 100, v, set, ' %'));
  styleField(body, 'Texte', item, 'text_color', inh('text_color'), colorControl);
  styleField(body, 'Arrondi', item, 'radius', inh('radius'), (v, set) => range(0, 40, v, set, ' px'));
}

function inspectItem(body) {
  const page = curPage();
  const item = curItem();
  if (!item) {
    body.innerHTML = '<p class="empty">Clique sur un élément de l\'écran pour le modifier, ou sur une case vide pour en ajouter un.</p>';
    return;
  }
  const head = document.createElement('div');
  head.className = 'row-buttons';
  head.style.marginTop = '0';
  head.append(
    button('Dupliquer', () => {
      const copy = clone(item);
      const g = grid(state.config, page);
      for (let r = 0; r < g.rows; r++)
        for (let c = 0; c < g.cols; c++)
          if (!copy.placed && fits(page, -1, c, r, 1, 1)) {
            Object.assign(copy, { col: c, row: r, colspan: 1, rowspan: 1, placed: true });
          }
      if (!copy.placed) return toast("Plus de case libre sur cette page.", true);
      delete copy.placed;
      page.items.push(copy);
      state.selected = page.items.length - 1;
      changed({ inspector: true });
    }),
    button('Supprimer', () => {
      page.items.splice(state.selected, 1);
      state.selected = -1;
      changed({ inspector: true });
    }, 'small danger'));
  body.appendChild(head);

  if (item.type === 'widget') inspectWidget(body, page, item);
  else inspectButton(body, page, item);
  positionFields(body, page, item);
  appearanceFields(body, page, item);
}

function inspectButton(body, page, item) {
  h4(body, 'Bouton');
  field(body, 'Libellé', input('text', item.label, (v) => {
    item.label = v;
    changed();
  }));
  iconField(body, 'Icône', item, 'icon', itemStyle(state.config, page, item, 'icon_size'));
  field(body, 'Disposition', select(LAYOUTS, itemStyle(state.config, page, item, 'layout'), (v) => {
    item.layout = v;
    changed();
  }));
  field(body, 'Taille icône', range(16, 96, itemStyle(state.config, page, item, 'icon_size'), (v) => {
    item.icon_size = v;
    changed();
  }, ' px'));
  field(body, 'Taille texte', select(FONT_SIZES.map((s) => [s, `${s} px`]), itemStyle(state.config, page, item, 'label_size'), (v) => {
    item.label_size = Number(v);
    changed();
  }));
  field(body, 'Info dessous', input('text', item.value, (v) => {
    if (v) item.value = v;
    else delete item.value;
    changed();
  }, { placeholder: 'ex. {cpu} %' }));
  note(body, 'Info dessous : texte avec des valeurs entre accolades ({time}, {cpu}...), voir l\'onglet Données.');

  h4(body, 'Au toucher');
  actionsEditor(body, item, 'actions');

  h4(body, 'Deux états');
  field(body, null, checkbox('bouton à deux états (allumé / éteint)', item.toggle, (v) => {
    if (v) {
      item.toggle = true;
      item.on ||= { color: '#E5484D', opacity: 85 };
    } else {
      delete item.toggle;
      delete item.on;
      delete item.actions_off;
      delete item.previewOn;
    }
    changed({ inspector: true });
  }));
  if (item.toggle) {
    item.on ||= {};
    field(body, 'Aperçu', checkbox("voir l'état allumé", item.previewOn, (v) => {
      item.previewOn = v;
      changed();
    }));
    field(body, 'Libellé allumé', input('text', item.on.label, (v) => {
      if (v) item.on.label = v;
      else delete item.on.label;
      changed();
    }, { placeholder: item.label || '' }));
    iconField(body, 'Icône allumé', item.on, 'icon', itemStyle(state.config, page, item, 'icon_size'));
    field(body, 'Couleur allumé', inline(colorControl(item.on.color || '#E5484D', (v) => {
      item.on.color = v;
      changed();
    })));
    field(body, 'Opacité allumé', range(0, 100, item.on.opacity ?? 85, (v) => {
      item.on.opacity = v;
      changed();
    }, ' %'));
    note(body, 'En passant à éteint : les mêmes actions, sauf si tu en définis ci-dessous.');
    actionsEditor(body, item, 'actions_off');
  }

  h4(body, 'Appui long');
  actionsEditor(body, item, 'long_press');
}

function sourceOptions() {
  return [
    ...BUILTIN_SOURCES.map(([k, l]) => [k, `${l} (${k})`]),
    ...Object.keys(state.config.sources || {}).map((k) => [k, `${k} (envoyée par le PC)`]),
  ];
}

function inspectWidget(body, page, item) {
  h4(body, "Zone d'info");
  field(body, 'Type', select(WIDGETS, item.widget || 'text', (v) => {
    item.widget = v;
    if (v === 'text' && !item.text) item.text = '{time}';
    if (['value', 'gauge', 'bar', 'chart', 'dual'].includes(v) && !item.source) item.source = Object.keys(state.config.sources || {})[0] || 'wifi_rssi';
    if (v === 'dual' && !item.source2) item.source2 = Object.keys(state.config.sources || {})[1] || item.source;
    if (v === 'volume' && !item.source) item.source = 'volume';
    if (v === 'clock' && !item.style) item.style = 'seconds';
    changed({ inspector: true });
  }));
  const w = item.widget || 'text';
  const set = (k) => (v) => {
    if (v === '' || v === undefined) delete item[k];
    else item[k] = v;
    changed();
  };

  if (w === 'text') {
    field(body, 'Texte', input('textarea', item.text, set('text')), true);
    note(body, 'Valeurs entre accolades : {time}, {date}, {ip}, ou une donnée envoyée par le PC comme {cpu}.');
    field(body, 'Taille', select(FONT_SIZES.map((s) => [s, `${s} px`]), item.size || 18, (v) => set('size')(Number(v))));
    field(body, 'Alignement', select([['center', 'Centré'], ['left', 'À gauche'], ['right', 'À droite']], item.align || 'center', set('align')));
  }
  if (['value', 'gauge', 'bar', 'chart', 'dual'].includes(w)) {
    if (w === 'dual') h4(body, 'Capteur de gauche');
    field(body, 'Titre', input('text', item.title, set('title')));
    field(body, 'Donnée', select(sourceOptions(), item.source, set('source')));
    field(body, 'Unité', input('text', item.unit, set('unit'), { placeholder: '%, °C, Mo/s...' }));
    if (w !== 'value') {
      field(body, 'Min / max', inline(input('number', item.min ?? 0, set('min')), input('number', item.max ?? 100, set('max'))));
    }
    field(body, 'Décimales', input('number', item.decimals, set('decimals'), { min: 0, max: 3, placeholder: 'telles quelles' }));
    if (w !== 'value') accentField(body, page, item, 'bar_color', 0);
    if (w === 'chart') {
      field(body, 'Remplissage', checkbox('dégradé sous la courbe', item.fill !== false, (v) => {
        if (v) delete item.fill;
        else item.fill = false;
        changed();
      }));
      field(body, 'Points', input('number', item.points ?? 30, set('points'), { min: 2, max: 200 }));
      field(body, 'Un point toutes les', inline(input('number', item.every_s ?? 2, set('every_s'), { min: 1 }), document.createTextNode('s')));
    } else {
      thresholdsEditor(body, item);
    }
  }
  if (w === 'dual') {
    h4(body, 'Capteur de droite');
    field(body, 'Titre', input('text', item.title2, set('title2')));
    field(body, 'Donnée', select(sourceOptions(), item.source2, set('source2')));
    field(body, 'Unité', input('text', item.unit2, set('unit2'), { placeholder: '%, °C, Mo/s...' }));
    field(body, 'Min / max', inline(input('number', item.min2 ?? 0, set('min2')), input('number', item.max2 ?? 100, set('max2'))));
    field(body, 'Décimales', input('number', item.decimals2, set('decimals2'), { min: 0, max: 3, placeholder: 'telles quelles' }));
    accentField(body, page, item, 'bar_color2', 1);
  }
  if (w === 'media') {
    note(body, 'Les boutons précédent / lecture / suivant marchent tout de suite (touches multimédia). Le titre, l\'artiste, la progression et la pochette viennent du programme TouchDeck Stats sur le PC.');
  }
  if (w === 'volume') {
    field(body, 'Donnée', select(sourceOptions(), item.source || 'volume', set('source')));
    accentField(body, page, item, 'bar_color', 0);
    note(body, 'Avec le programme TouchDeck Stats, le curseur règle le volume exact du PC et suit ses changements. Sans lui, il envoie des touches volume + / -. Toucher l\'icône coupe le son.');
  }
  if (w === 'value') {
    field(body, 'Taille', select([['', 'automatique'], ...FONT_SIZES.map((s) => [s, `${s} px`])], item.size || '', (v) => set('size')(v ? Number(v) : '')));
  }
  if (w === 'clock') {
    field(body, 'Style', select(CLOCK_STYLES, item.style || 'digital', (v) => {
      item.style = v;
      changed({ inspector: true });
    }));
    styleField(body, 'Couleur', item, 'clock_color', state.config.theme?.clock_color || DEFAULTS.clock_color, colorControl);
    field(body, 'Date', checkbox('afficher la date dessous', item.show_date !== false, (v) => {
      if (v) delete item.show_date;
      else item.show_date = false;
      changed();
    }));
  }
  if (w === 'image') {
    const up = document.createElement('input');
    up.type = 'file';
    up.accept = 'image/*';
    up.onchange = async () => {
      const file = up.files[0];
      if (!file) return;
      const a = cellArea(state.config, page, item);
      const path = uniquePath('/img', file.name);
      addImage(path, await processImage(file, a.w - 16, a.h - 16, 'contain'), true);
      item.src = path;
      changed();
    };
    field(body, 'Image', up);
  }
  h4(body, 'Au toucher (optionnel)');
  actionsEditor(body, item, 'actions');
}

// Colour of a measuring widget: its own, or the theme accent it gets in turn
function accentField(body, page, item, key, n) {
  const inherited = accentOf(state.config, page, { ...item, [key]: undefined }, n);
  styleField(body, 'Couleur', item, key, inherited, colorControl);
}

function thresholdsEditor(body, item) {
  const box = document.createElement('div');
  field(body, 'Couleurs', box, false);
  const list = item.thresholds || [];
  list.forEach((t, i) => {
    box.appendChild(inline(
      document.createTextNode('à partir de'),
      input('number', t.from, (v) => {
        t.from = v ?? 0;
        changed();
      }),
      colorControl(t.color, (v) => {
        t.color = v;
        changed();
      }),
      button('✕', () => {
        list.splice(i, 1);
        if (!list.length) delete item.thresholds;
        changed({ inspector: true });
      }, 'small icon-only')));
  });
  box.appendChild(button('+ Seuil de couleur', () => {
    item.thresholds = [...list, { from: list.length ? (list[list.length - 1].from || 0) + 10 : 70, color: list.length ? '#E5484D' : '#F5A623' }];
    changed({ inspector: true });
  }));
}

// ------- Actions -------

function actionsEditor(parent, owner, key) {
  const box = document.createElement('div');
  parent.appendChild(box);
  const list = owner[key] || [];
  const update = (inspector = false) => {
    if (list.length) owner[key] = list;
    else delete owner[key];
    changed({ inspector });
  };

  list.forEach((action, i) => {
    const card = document.createElement('div');
    card.className = 'list-item';
    const head = document.createElement('div');
    head.className = 'head';
    head.append(
      select(ACTIONS, action.type, (t) => {
        list[i] = newAction(t);
        update(true);
      }),
      button('↑', () => {
        if (i > 0) [list[i - 1], list[i]] = [list[i], list[i - 1]];
        update(true);
      }, 'small icon-only'),
      button('↓', () => {
        if (i < list.length - 1) [list[i + 1], list[i]] = [list[i], list[i + 1]];
        update(true);
      }, 'small icon-only'),
      button('✕', () => {
        list.splice(i, 1);
        update(true);
      }, 'small icon-only danger'));
    card.appendChild(head);
    actionFields(card, action, () => update());
    box.appendChild(card);
  });
  box.appendChild(button('+ Ajouter une action', () => {
    list.push(newAction('keys'));
    update(true);
  }));
}

// Launch actions switched to a free name, before anything is typed
const otherApps = new WeakSet();

function actionFields(card, a, done) {
  const set = (k) => (v) => {
    a[k] = v;
    done();
  };
  switch (a.type) {
    case 'shortcut': {
      field(card, 'Raccourci', select(SHORTCUTS.map(([n, l]) => [n, l]), a.name, (v) => {
        a.name = v;
        done();
        renderInspector();
      }));
      const sc = SHORTCUTS.find((x) => x[0] === a.name);
      if (sc) note(card, `Windows : ${comboLabel(sc[2], false)} · Mac : ${comboLabel(sc[3], true)}`);
      break;
    }
    case 'keys':
      keysEditor(card, a, 'keys', done);
      field(card, null, checkbox('sur Mac, un autre raccourci', !!a.keys_mac, (v) => {
        if (v) a.keys_mac = (a.keys || []).map((k) => (k === 'CTRL' ? 'GUI' : k));
        else delete a.keys_mac;
        done();
        renderInspector();
      }), true);
      if (a.keys_mac) {
        note(card, 'Sur Mac :');
        keysEditor(card, a, 'keys_mac', done);
      }
      break;
    case 'text':
      field(card, null, input('textarea', a.text, set('text'), { placeholder: 'Texte à taper (Entrée = nouvelle ligne)' }), true);
      break;
    case 'media':
      field(card, 'Touche', select(MEDIA, a.key, set('key')));
      break;
    case 'page':
      field(card, 'Page', select([['back', '← page précédente'], ...state.config.pages.map((p) => [p.id, p.name || p.id])], a.page, set('page')));
      break;
    case 'delay':
      field(card, 'Durée', inline(input('number', a.ms, (v) => set('ms')(v ?? 0), { min: 0, max: 10000 }), document.createTextNode('ms')));
      break;
    case 'brightness':
      field(card, 'Valeur', input('text', a.value, set('value'), { placeholder: '+10, -10 ou 80' }));
      break;
    case 'launch': {
      const known = APPS.some(([n]) => n === a.app);
      const other = !known && (a.app || otherApps.has(a));
      field(card, 'Application', select([['', 'Choisir...'], ...APPS, ['_other', 'Autre...']], other ? '_other' : a.app, (v) => {
        if (v === '_other') otherApps.add(a);
        else otherApps.delete(a);
        a.app = v === '_other' ? '' : v;
        done();
        renderInspector();
      }));
      if (other) {
        field(card, 'Nom ou adresse', input('text', a.app, set('app'), { placeholder: 'chrome, obs64, steam://rungameid/730...' }));
        note(card, 'Windows : nom du programme, chemin complet ou adresse (steam:, spotify:...). Mac : nom de l\'application.');
      }
      note(card, 'Ouvert par TouchDeck Stats, qui doit tourner sur le PC.');
      break;
    }
    case 'http':
      field(card, 'Méthode', select([['GET', 'GET'], ['POST', 'POST'], ['PUT', 'PUT']], a.method, set('method')));
      field(card, 'Adresse', input('text', a.url, set('url')));
      if (a.method !== 'GET') field(card, 'Contenu', input('textarea', a.body, set('body')), true);
      note(card, 'Nécessite le Wi-Fi sur la carte.');
      break;
    case 'serial':
      field(card, 'Message', input('text', a.data, set('data')));
      note(card, 'Envoyé au PC sous la forme "ACTION <message>", pour le programme côté PC.');
      break;
  }
}

function keysEditor(card, a, key, done) {
  a[key] ||= [];
  const keys = a[key];
  const chips = document.createElement('div');
  chips.className = 'chips';
  const draw = () => {
    chips.innerHTML = '';
    keys.forEach((k, i) => {
      const c = document.createElement('span');
      c.className = 'chip';
      c.textContent = k;
      c.appendChild(button('✕', () => {
        keys.splice(i, 1);
        done();
        draw();
      }, ''));
      chips.appendChild(c);
    });
    const add = select([['', '+ touche'], ...MODIFIERS.map((m) => [m, m]), ...KEY_NAMES.map((k) => [k, k])], '', (v) => {
      if (v) keys.push(v);
      done();
      draw();
    });
    add.className = 'chip-add';
    const letter = input('text', '', () => {}, { placeholder: 'lettre', maxLength: 1, className: 'chip-add' });
    letter.addEventListener('change', () => {
      if (letter.value) keys.push(letter.value.toUpperCase());
      done();
      draw();
    });
    chips.append(add, letter);
  };
  draw();
  const rec = button('Enregistrer au clavier', () => recordShortcut(rec, (keys) => {
    a[key] = keys.length ? keys : a[key];
    done();
    draw();
  }));
  field(card, null, chips, true);
  field(card, null, inline(rec), true);
  note(card, 'Les raccourcis réservés par le navigateur ou Windows (Ctrl+W, touche Windows seule...) s\'ajoutent avec "+ touche".');
}

function recordShortcut(btn, onDone) {
  const mods = new Set();
  btn.classList.add('recording');
  btn.textContent = 'Appuie sur le raccourci...';
  const order = ['CTRL', 'RCTRL', 'SHIFT', 'RSHIFT', 'ALT', 'ALTGR', 'GUI', 'RGUI'];
  const finish = (keys) => {
    window.removeEventListener('keydown', onKey, true);
    window.removeEventListener('keyup', onKeyUp, true);
    btn.classList.remove('recording');
    btn.textContent = 'Enregistrer au clavier';
    if (keys?.length) onDone(keys);
  };
  const sorted = () => [...mods].sort((x, y) => order.indexOf(x) - order.indexOf(y));
  const onKey = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const name = keyNameFromEvent(e);
    if (!name) return;
    if (order.includes(name)) {
      // AltGr arrives as Ctrl + AltGr on Windows
      if (name === 'ALTGR') mods.delete('CTRL');
      mods.add(name);
      return;
    }
    finish([...sorted(), name]);
  };
  const onKeyUp = (e) => {
    e.preventDefault();
    if (mods.size && !e.ctrlKey && !e.shiftKey && !e.altKey && !e.metaKey) finish(sorted());
  };
  window.addEventListener('keydown', onKey, true);
  window.addEventListener('keyup', onKeyUp, true);
  setTimeout(() => btn.classList.contains('recording') && finish(null), 8000);
}

// Values sent by pc/touchdeck_stats.py
const PC_SOURCES = [
  ['cpu', 'Processeur, %'],
  ['ram', 'Mémoire utilisée, %'],
  ['ram_used', 'Mémoire utilisée, Go'],
  ['ram_total', 'Mémoire installée, Go'],
  ['disk', 'Disque système utilisé, %'],
  ['net_down', 'Réception réseau, Ko/s'],
  ['net_up', 'Envoi réseau, Ko/s'],
  ['battery', 'Batterie, % (portable)'],
  ['app', 'Application au premier plan'],
];

// ------- Page, theme, data, device tabs -------

function wallpaperField(body, owner, allowInherit) {
  const current = owner.wallpaper;
  const box = document.createElement('div');
  box.className = 'inline';
  const up = document.createElement('input');
  up.type = 'file';
  up.accept = 'image/*';
  up.hidden = true;
  up.onchange = async () => {
    const file = up.files[0];
    if (!file) return;
    const path = uniquePath('/img', file.name);
    addImage(path, await processImage(file, SCREEN.w, SCREEN.h, 'cover'), true);
    owner.wallpaper = path;
    changed({ inspector: true });
  };
  const options = [
    ...(allowInherit ? [['__inherit', 'comme le thème']] : []),
    ['', 'aucun'],
    ...[...state.images.keys()].filter((p) => p.startsWith('/img/')).map((p) => [p, p.slice(5)]),
  ];
  const sel = select(options, current === undefined && allowInherit ? '__inherit' : current || '', (v) => {
    if (v === '__inherit') delete owner.wallpaper;
    else owner.wallpaper = v;
    changed();
  });
  box.append(sel, button('Image du PC', () => up.click()), up);
  field(body, "Fond d'écran", box);
  note(body, "L'image est recadrée à 480 x 320 automatiquement.");
}

function gridFields(body, owner, inherited) {
  owner.grid ||= {};
  const g = owner.grid;
  const set = (k, lo, hi) => (v) => {
    if (v === undefined) delete g[k];
    else g[k] = Math.max(lo, Math.min(hi, v));
    if (!Object.keys(g).length) delete owner.grid;
    changed();
  };
  field(body, 'Colonnes / lignes', inline(
    input('number', g.cols, set('cols', 1, 8), { min: 1, max: 8, placeholder: inherited.cols }),
    input('number', g.rows, set('rows', 1, 6), { min: 1, max: 6, placeholder: inherited.rows })));
  field(body, 'Espace / marge', inline(
    input('number', g.gap, set('gap', 0, 40), { min: 0, max: 40, placeholder: inherited.gap }),
    input('number', g.margin, set('margin', 0, 40), { min: 0, max: 40, placeholder: inherited.margin })));
  if (!Object.keys(g).length) delete owner.grid;
}

function renamePage(page, newId) {
  const old = page.id;
  if (!newId || newId === old) return;
  page.id = newId;
  for (const p of state.config.pages)
    for (const it of p.items || [])
      for (const list of [it.actions, it.long_press, it.actions_off]) for (const a of list || []) if (a.type === 'page' && a.page === old) a.page = newId;
  if (state.config.device?.start_page === old) state.config.device.start_page = newId;
}

function inspectPage(body) {
  const page = curPage();
  h4(body, 'Page');
  field(body, 'Nom', input('text', page.name, (v) => {
    page.name = v;
    changed({ pages: true });
  }));
  field(body, 'Identifiant', input('text', page.id, (v) => {
    renamePage(page, slug(v).replace(/-/g, '_'));
    changed({ pages: true });
  }, { title: 'Utilisé par les boutons "Aller à une page"' }));
  const isStart = (state.config.device?.start_page || state.config.pages[0].id) === page.id;
  field(body, 'Démarrage', checkbox('page affichée au démarrage', isStart, (v) => {
    state.config.device ||= {};
    if (v) state.config.device.start_page = page.id;
    else delete state.config.device.start_page;
    changed({ pages: true });
  }));

  h4(body, 'Grille');
  const themeGrid = { ...DEFAULTS.grid, ...(state.config.theme?.grid || {}) };
  gridFields(body, page, themeGrid);
  note(body, 'Vide : comme le thème. Les éléments qui sortent de la grille sont signalés sous l\'écran.');

  h4(body, 'Fond');
  wallpaperField(body, page, true);
  styleField(body, 'Couleur de fond', page, 'background', pageStyle(state.config, { }, 'background'), colorControl);
  styleField(body, 'Assombrir', page, 'wallpaper_dim', state.config.theme?.wallpaper_dim ?? 0, (v, set) => range(0, 90, v, set, ' %'));
  field(body, 'Glisser', select([['', 'comme le thème'], ['true', 'oui, changer de page en glissant'], ['false', 'non']],
    page.swipe === undefined ? '' : String(page.swipe), (v) => {
      if (v === '') delete page.swipe;
      else page.swipe = v === 'true';
      changed();
    }));

  h4(body, 'Organiser');
  const row = document.createElement('div');
  row.className = 'row-buttons';
  row.style.justifyContent = 'flex-start';
  const pages = state.config.pages;
  row.append(
    button('↑ Monter', () => {
      if (state.page === 0) return;
      [pages[state.page - 1], pages[state.page]] = [pages[state.page], pages[state.page - 1]];
      state.page--;
      changed({ pages: true, inspector: true });
    }),
    button('↓ Descendre', () => {
      if (state.page >= pages.length - 1) return;
      [pages[state.page + 1], pages[state.page]] = [pages[state.page], pages[state.page + 1]];
      state.page++;
      changed({ pages: true, inspector: true });
    }),
    button('Dupliquer', () => {
      const copy = clone(page);
      const fresh = newPage(state.config);
      copy.id = fresh.id;
      copy.name = `${page.name || page.id} (copie)`;
      pages.splice(state.page + 1, 0, copy);
      state.page++;
      changed({ pages: true, inspector: true });
    }),
    button('Supprimer', () => {
      if (pages.length === 1) return toast('Il faut garder au moins une page.', true);
      if (!confirm(`Supprimer la page "${page.name || page.id}" ?`)) return;
      pages.splice(state.page, 1);
      state.page = Math.max(0, state.page - 1);
      state.selected = -1;
      changed({ pages: true, inspector: true });
    }, 'small danger'));
  body.appendChild(row);
}

// ------- My themes -------
// config.my_themes: the user's themes in cycle order, full theme blocks with id, name,
// in_cycle and, for the seasonal ones, wallpaper_kind (wallpaper drawn again when missing).
// config.theme is the active one; config.themes, what the card goes through with a vertical
// swipe, is built on save from the themes in the cycle.

function newThemeId() {
  return `t${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`;
}

function myThemes() {
  const c = state.config;
  if (Array.isArray(c.my_themes) && c.my_themes.length) return c.my_themes;
  // Earlier model: the three presets (cycle from theme_cycle) and a custom active theme
  const cycle = c.theme_cycle || Object.keys(THEMES);
  const theme = c.theme || {};
  const list = [];
  if (!theme.preset || !THEMES[theme.preset]) {
    list.push({ ...clone(theme), id: theme.id || newThemeId(), name: theme.name || 'Personnalisé', in_cycle: true });
  }
  for (const [key, p] of Object.entries(THEMES)) {
    const base = theme.preset === key ? clone(theme) : { ...clone(p.theme), ...(p.wallpaper ? { wallpaper: `/img/${p.wallpaper}.png` } : {}) };
    list.push({ ...base, id: base.id || newThemeId(), name: p.name, preset: key, wallpaper_kind: p.wallpaper, in_cycle: cycle.includes(key) });
  }
  c.my_themes = list;
  delete c.theme_cycle;
  const active = list.find((t) => (theme.preset ? t.preset === theme.preset : !t.preset)) || list[0];
  c.theme = { ...clone(theme), id: active.id, name: active.name };
  return list;
}

function activeEntry() {
  return myThemes().find((t) => t.id === state.config.theme?.id) || null;
}

// Changes made on the active theme go back into its entry
function syncActive() {
  const entry = activeEntry();
  if (!entry) return;
  const keep = { id: entry.id, name: entry.name, in_cycle: entry.in_cycle, wallpaper_kind: entry.wallpaper_kind };
  for (const k of Object.keys(entry)) delete entry[k];
  Object.assign(entry, clone(state.config.theme), keep);
}

async function ensureWallpaper(theme, kind) {
  if (!kind) return;
  const path = theme.wallpaper || `/img/${kind}.png`;
  theme.wallpaper = path;
  if (!state.images.has(path) && !state.files.some((f) => f.p === path)) {
    addImage(path, await drawWallpaper(kind, SCREEN.w, SCREEN.h), true);
  }
}

async function activateTheme(entry) {
  syncActive();
  const current = state.config.theme || {};
  const next = clone(entry);
  delete next.in_cycle;
  delete next.wallpaper_kind;
  next.grid = current.grid; // the page layout stays
  next.swipe = current.swipe;
  await ensureWallpaper(next, entry.wallpaper_kind);
  state.config.theme = next;
  // Pages and items keep their own colours; this asks for a reset when they have some
  const custom = state.config.pages.some((p) => p.background || p.wallpaper !== undefined || (p.items || []).some((it) => it.color || it.text_color || it.bar_color));
  if (custom && confirm('Certaines pages ou éléments ont leurs propres couleurs. Les remettre aux couleurs du thème ?')) {
    for (const p of state.config.pages) {
      delete p.background;
      delete p.wallpaper;
      delete p.wallpaper_dim;
      for (const it of p.items || []) for (const k of ['color', 'opacity', 'text_color', 'bar_color', 'bar_color2', 'radius', 'clock_color']) delete it[k];
    }
  }
  changed({ inspector: true });
}

function uniqueThemeName(base) {
  const names = new Set(myThemes().map((t) => t.name));
  if (!names.has(base)) return base;
  for (let n = 2; ; n++) if (!names.has(`${base} ${n}`)) return `${base} ${n}`;
}

async function createTheme(from) {
  syncActive();
  const list = myThemes();
  let entry;
  if (from === 'current') {
    entry = { ...clone(state.config.theme), wallpaper_kind: activeEntry()?.wallpaper_kind, name: uniqueThemeName(`${state.config.theme.name || 'Mon thème'} (copie)`) };
  } else {
    const p = THEMES[from];
    entry = { ...clone(p.theme), preset: from, wallpaper_kind: p.wallpaper, name: uniqueThemeName(`Mon thème ${p.name}`) };
  }
  entry.id = newThemeId();
  entry.in_cycle = true;
  list.push(entry);
  await activateTheme(entry);
  toast(`Thème "${entry.name}" créé : règle ses couleurs et son fond ci-dessous.`);
}

async function prepareThemes() {
  const c = state.config;
  if (c.device?.theme_swipe === false) {
    delete c.themes;
    return;
  }
  syncActive();
  const entries = [];
  for (const t of myThemes()) {
    if (t.in_cycle === false) continue;
    const e = clone(t);
    delete e.in_cycle;
    delete e.wallpaper_kind;
    await ensureWallpaper(e, t.wallpaper_kind);
    entries.push(e);
  }
  if (entries.length > 1) c.themes = entries;
  else delete c.themes;
}

function themesList(body) {
  const list = myThemes();
  const active = activeEntry();
  list.forEach((t, i) => {
    const row = document.createElement('div');
    row.className = `list-item theme-row${t === active ? ' active' : ''}`;
    const head = document.createElement('div');
    head.className = 'head';
    const use = button(t === active ? 'Actif' : 'Activer', () => activateTheme(t), t === active ? 'small primary' : 'small');
    use.disabled = t === active;
    const name = input('text', t.name, () => {}, { title: 'Nom affiché sur la carte quand on change de thème' });
    name.addEventListener('change', () => {
      const v = name.value.trim();
      if (!v || list.some((o) => o !== t && o.name === v)) return renderInspector();
      t.name = v;
      if (t === active) state.config.theme.name = v;
      changed({ inspector: true });
    });
    head.append(use, name,
      button('↑', () => {
        if (i > 0) [list[i - 1], list[i]] = [list[i], list[i - 1]];
        changed({ inspector: true });
      }, 'small icon-only'),
      button('↓', () => {
        if (i < list.length - 1) [list[i + 1], list[i]] = [list[i], list[i + 1]];
        changed({ inspector: true });
      }, 'small icon-only'),
      button('⧉', () => {
        syncActive();
        const copy = { ...clone(t), id: newThemeId(), name: uniqueThemeName(`${t.name} (copie)`) };
        list.splice(i + 1, 0, copy);
        changed({ inspector: true });
      }, 'small icon-only'),
      button('✕', async () => {
        if (list.length === 1) return toast('Il faut garder au moins un thème.', true);
        if (!confirm(`Supprimer le thème "${t.name}" ?`)) return;
        list.splice(i, 1);
        if (t === active) await activateTheme(list[Math.max(0, i - 1)]);
        else changed({ inspector: true });
      }, 'small icon-only danger'));
    row.appendChild(head);
    row.appendChild(checkbox('dans le cycle', t.in_cycle !== false, (v) => {
      t.in_cycle = v;
      changed();
    }));
    body.appendChild(row);
  });
  const from = select([['sombre', 'à partir de Sombre'], ['halloween', "à partir d'Halloween"], ['noel', 'à partir de Noël'], ['current', 'copie du thème actif']], 'sombre', () => {});
  body.appendChild(inline(button('+ Nouveau thème', () => createTheme(from.value)), from));
}

function inspectTheme(body) {
  myThemes();
  const theme = (state.config.theme ||= {});
  theme.button ||= {};
  const b = theme.button;
  h4(body, 'Mes thèmes');
  themesList(body);
  const dev = (state.config.device ||= {});
  field(body, null, checkbox('sur la carte, glisser vers le bas ou le haut parcourt les thèmes du cycle', dev.theme_swipe !== false, (v) => {
    if (v) delete dev.theme_swipe;
    else dev.theme_swipe = false;
    changed();
  }), true);
  note(body, `Les réglages ci-dessous modifient le thème actif : "${theme.name || 'sans nom'}". La grille et les pages ne bougent pas.`);

  h4(body, 'Couleurs des capteurs');
  const accents = (theme.accents ||= [...DEFAULT_ACCENTS]);
  const sw = document.createElement('div');
  sw.className = 'swatches';
  accents.forEach((c, i) => sw.appendChild(colorControl(c, (v) => {
    accents[i] = v;
    changed();
  })));
  field(body, 'Dans l\'ordre', sw);
  field(body, 'Horloge', inline(colorControl(theme.clock_color || DEFAULTS.clock_color, (v) => {
    theme.clock_color = v;
    changed();
  })));
  field(body, 'Piste des jauges', inline(colorControl(theme.track_color || DEFAULTS.track_color, (v) => {
    theme.track_color = v;
    changed();
  })));
  field(body, 'Chiffres', select([['condensed', 'Étroits (comme iCUE)'], ['inter', 'Comme le texte']], theme.numbers || 'condensed', (v) => {
    theme.numbers = v;
    changed();
  }));

  h4(body, "Zones d'info (par défaut)");
  theme.widget ||= {};
  const wd = theme.widget;
  field(body, 'Fond', inline(colorControl(wd.color ?? DEFAULTS.widget.color, (v) => {
    wd.color = v;
    changed();
  })));
  field(body, 'Opacité', range(0, 100, wd.opacity ?? DEFAULTS.widget.opacity, (v) => {
    wd.opacity = v;
    changed();
  }, ' %'));

  h4(body, 'Fond (toutes les pages)');
  wallpaperField(body, theme, false);
  field(body, 'Couleur de fond', inline(colorControl(theme.background || DEFAULTS.background, (v) => {
    theme.background = v;
    changed();
  })));
  field(body, 'Assombrir', range(0, 90, theme.wallpaper_dim ?? 0, (v) => {
    theme.wallpaper_dim = v;
    changed();
  }, ' %'));
  field(body, 'Glisser', checkbox('changer de page en glissant le doigt', theme.swipe, (v) => {
    theme.swipe = v;
    changed();
  }));

  h4(body, 'Grille par défaut');
  const g = (theme.grid ||= {});
  const setG = (k, lo, hi) => (v) => {
    g[k] = Math.max(lo, Math.min(hi, v ?? DEFAULTS.grid[k]));
    changed();
  };
  field(body, 'Colonnes / lignes', inline(
    input('number', g.cols ?? DEFAULTS.grid.cols, setG('cols', 1, 8), { min: 1, max: 8 }),
    input('number', g.rows ?? DEFAULTS.grid.rows, setG('rows', 1, 6), { min: 1, max: 6 })));
  field(body, 'Espace / marge', inline(
    input('number', g.gap ?? DEFAULTS.grid.gap, setG('gap', 0, 40), { min: 0, max: 40 }),
    input('number', g.margin ?? DEFAULTS.grid.margin, setG('margin', 0, 40), { min: 0, max: 40 })));

  h4(body, 'Boutons et zones (par défaut)');
  const setB = (k) => (v) => {
    b[k] = v;
    changed();
  };
  field(body, 'Couleur', inline(colorControl(b.color ?? DEFAULTS.button.color, setB('color'))));
  field(body, 'Opacité', range(0, 100, b.opacity ?? DEFAULTS.button.opacity, setB('opacity'), ' %'));
  field(body, 'Texte', inline(colorControl(b.text_color ?? DEFAULTS.button.text_color, setB('text_color'))));
  field(body, 'Appui', inline(colorControl(b.pressed_color ?? DEFAULTS.button.pressed_color, setB('pressed_color'))));
  field(body, 'Arrondi', range(0, 40, b.radius ?? DEFAULTS.button.radius, setB('radius'), ' px'));
  b.border ||= { width: 0, color: '#FFFFFF' };
  field(body, 'Bordure', inline(
    input('number', b.border.width ?? 0, (v) => {
      b.border.width = Math.max(0, Math.min(6, v ?? 0));
      changed();
    }, { min: 0, max: 6 }),
    colorControl(b.border.color || '#FFFFFF', (v) => {
      b.border.color = v;
      changed();
    })));
  field(body, 'Taille icône', range(16, 96, b.icon_size ?? DEFAULTS.button.icon_size, setB('icon_size'), ' px'));
  field(body, 'Taille texte', select(FONT_SIZES.map((s) => [s, `${s} px`]), b.label_size ?? DEFAULTS.button.label_size, (v) => setB('label_size')(Number(v))));
}

function inspectData(body) {
  const sources = (state.config.sources ||= {});
  h4(body, 'Données envoyées par le PC');
  note(body, 'Valeurs que le PC envoie à la carte par le câble USB (CPU, RAM, température...). Elles s\'affichent dans les zones d\'info et les textes avec {nom}.');
  for (const [key, src] of Object.entries(sources)) {
    const card = document.createElement('div');
    card.className = 'list-item';
    const head = document.createElement('div');
    head.className = 'head';
    const name = input('text', key, () => {}, { title: 'Nom utilisé entre accolades' });
    name.addEventListener('change', () => {
      const n = slug(name.value).replace(/-/g, '_');
      if (!n || n === key || sources[n]) return renderInspector();
      sources[n] = src;
      delete sources[key];
      for (const p of state.config.pages) for (const it of p.items || []) if (it.source === key) it.source = n;
      changed({ inspector: true });
    });
    head.append(name, button('✕', () => {
      delete sources[key];
      changed({ inspector: true });
    }, 'small icon-only danger'));
    card.appendChild(head);
    field(card, 'Par défaut', input('text', src.default, (v) => {
      src.default = v;
      changed();
    }, { placeholder: '--' }));
    field(card, 'Grisée après', inline(input('number', src.stale_s, (v) => {
      if (v) src.stale_s = v;
      else delete src.stale_s;
      changed();
    }, { min: 0, placeholder: 'jamais' }), document.createTextNode('s sans nouvelle valeur')));
    const test = input('text', src.sample ?? '42', (v) => {
      src.sample = v;
      changed();
    });
    field(card, 'Essai', inline(test, button('Envoyer à la carte', () => {
      if (!device.connected) return toast("Connecte d'abord la carte.", true);
      device.set(key, test.value);
      toast(`${key} = ${test.value} envoyé à la carte.`);
    })));
    body.appendChild(card);
  }
  body.appendChild(button('+ Nouvelle donnée', () => {
    let n = 1;
    while (sources[`donnee${n}`]) n++;
    sources[`donnee${n}`] = { type: 'push', default: '--', stale_s: 10 };
    changed({ inspector: true });
  }));

  h4(body, 'Programme TouchDeck Stats (Windows)');
  note(body, "Un petit programme à lancer sur le PC envoie ses chiffres à la carte, par le même câble USB. Il se range près de l'horloge de Windows et peut démarrer avec Windows. L'éditeur reste utilisable pendant qu'il tourne.");
  const dl = document.createElement('a');
  dl.href = 'pc/TouchDeckStats.exe';
  dl.className = 'button small';
  dl.textContent = 'Télécharger TouchDeckStats.exe';
  dl.download = '';
  body.appendChild(inline(dl, button('Ajouter les données du PC', () => {
    for (const [key] of PC_SOURCES) sources[key] ||= { type: 'push', default: '--', stale_s: 10 };
    changed({ inspector: true });
    toast('Données du PC ajoutées : utilise-les dans les zones d\'info ({cpu}, {ram}...).');
  })));
  note(body, 'Windows peut avertir au premier lancement (programme non signé) : "Informations complémentaires" puis "Exécuter quand même".');
  const pcTable = document.createElement('table');
  pcTable.className = 'info-table';
  for (const [k, l] of PC_SOURCES) pcTable.insertRow().innerHTML = `<td>{${k}}</td><td>${l}</td>`;
  body.appendChild(pcTable);

  h4(body, 'Fournies par la carte');
  const t = document.createElement('table');
  t.className = 'info-table';
  for (const [k, l] of BUILTIN_SOURCES) t.insertRow().innerHTML = `<td>{${k}}</td><td>${l}</td>`;
  body.appendChild(t);
  note(body, "L'heure et la date demandent le Wi-Fi (onglet Carte).");
}

function inspectDevice(body) {
  const dev = (state.config.device ||= {});
  h4(body, 'Réglages');
  field(body, 'Nom', input('text', dev.name, (v) => {
    dev.name = v;
    changed();
  }, { placeholder: 'TouchDeck' }));
  field(body, 'Luminosité', range(5, 100, dev.brightness ?? 80, (v) => {
    dev.brightness = v;
    changed();
  }, ' %'));
  field(body, 'Système du PC', select(SYSTEMS, dev.os || 'auto', (v) => {
    if (v === 'auto') delete dev.os;
    else dev.os = v;
    changed();
  }));
  field(body, 'Clavier du PC', select(LAYOUTS_KEYBOARD, dev.keyboard_layout || 'fr', (v) => {
    dev.keyboard_layout = v;
    changed();
  }));
  note(body, "Le système choisit les bonnes touches des raccourcis tout faits (Ctrl sous Windows, Cmd sur Mac) et la variante de l'AZERTY, qui diffère entre Windows et Mac.");
  field(body, 'Fuseau horaire', select(TIMEZONES.map((z) => [z, z]), dev.timezone || 'Europe/Paris', (v) => {
    dev.timezone = v;
    changed();
  }));

  if (!device.connected) {
    h4(body, 'Carte');
    note(body, 'Connecte la carte pour régler son Wi-Fi, son code, voir ses fichiers et la mettre à jour.');
    rescueSection(body);
    return;
  }

  h4(body, 'Carte');
  const t = document.createElement('table');
  t.className = 'info-table';
  const i = state.info || {};
  const rows = [
    ['Version', i.version || '?'],
    ['Wi-Fi', i.wifi ? `${i.wifi} (${i.ip})` : 'non connecté'],
    ['Stockage', i.fs_total ? `${Math.round(i.fs_used / 1024)} Ko utilisés sur ${Math.round(i.fs_total / 1048576)} Mo` : '?'],
    ['Code', state.hello?.pin ? 'oui' : 'non'],
  ];
  for (const [k, v] of rows) {
    const r = t.insertRow();
    r.insertCell().textContent = k;
    r.insertCell().textContent = v;
  }
  body.appendChild(t);

  firmwareSection(body);

  h4(body, 'Wi-Fi');
  const ssid = input('text', i.wifi || '', () => {}, { placeholder: 'Nom du réseau' });
  const pw = input('password', '', () => {}, { placeholder: 'Mot de passe', autocomplete: 'new-password' });
  field(body, 'Réseau', ssid);
  field(body, 'Mot de passe', pw);
  body.appendChild(inline(button('Envoyer à la carte', async () => {
    try {
      await ensureAuth();
      await device.setWifi(ssid.value, pw.value);
      toast('Wi-Fi envoyé, la carte se connecte...');
      setTimeout(refreshInfo, 6000);
    } catch (e) {
      toast(errorMessage(e), true);
    }
  })));
  note(body, 'Le mot de passe reste sur la carte : il ne fait pas partie des sauvegardes.');

  h4(body, 'Code de la carte');
  note(body, 'Avec un code, personne ne peut modifier la carte depuis cette page sans le connaître.');
  const code = input('password', '', () => {}, { placeholder: state.hello?.pin ? 'Nouveau code' : 'Code à choisir', autocomplete: 'new-password' });
  field(body, 'Code', code);
  const btns = document.createElement('div');
  btns.className = 'row-buttons';
  btns.style.justifyContent = 'flex-start';
  btns.appendChild(button(state.hello?.pin ? 'Changer le code' : 'Protéger par ce code', async () => {
    if (code.value.length < 4) return toast('Le code doit faire au moins 4 caractères.', true);
    try {
      await ensureAuth();
      await device.setPin(code.value);
      state.hello = await device.hello();
      toast('Code enregistré sur la carte.');
      renderInspector();
    } catch (e) {
      toast(errorMessage(e), true);
    }
  }));
  if (state.hello?.pin)
    btns.appendChild(button('Retirer le code', async () => {
      try {
        await ensureAuth();
        await device.setPin('');
        state.hello = await device.hello();
        toast('La carte n\'est plus protégée.');
        renderInspector();
      } catch (e) {
        toast(errorMessage(e), true);
      }
    }, 'small danger'));
  body.appendChild(btns);

  h4(body, 'Fichiers sur la carte');
  const used = JSON.stringify(state.config);
  const files = document.createElement('div');
  files.className = 'files';
  for (const f of state.files) {
    if (f.p === '/config.json') continue;
    const row = document.createElement('div');
    row.className = 'file';
    row.innerHTML = `<span></span><small>${Math.ceil(f.s / 1024)} Ko${used.includes(`"${f.p}"`) ? '' : ' · inutilisé'}</small>`;
    row.querySelector('span').textContent = f.p;
    row.appendChild(button('✕', async () => {
      if (used.includes(`"${f.p}"`) && !confirm(`${f.p} est utilisé dans la configuration. Le supprimer quand même ?`)) return;
      try {
        await ensureAuth();
        await device.remove(f.p);
        state.files = await device.list();
        state.images.delete(f.p);
        renderInspector();
      } catch (e) {
        toast(errorMessage(e), true);
      }
    }, 'small icon-only danger'));
    files.appendChild(row);
  }
  body.appendChild(files);
  rescueSection(body);
}

function updateAvailable() {
  return device.connected && state.latest && compareVersions(state.latest.version, state.hello?.version) > 0;
}

function firmwareSection(body) {
  h4(body, 'Logiciel de la carte');
  const installed = state.hello?.version || '?';
  if (!state.latest) {
    note(body, `Version installée : ${installed}. Version publiée inconnue (page ouverte hors de son site).`);
    return;
  }
  const newer = updateAvailable();
  note(body, newer
    ? `Version ${state.latest.version} disponible (installée : ${installed}). La mise à jour garde les pages, images, Wi-Fi et code.`
    : `Version ${installed}, à jour.`);
  const b = button(newer ? `Mettre à jour en ${state.latest.version}` : 'Réinstaller cette version', updateFirmware, newer ? 'accent' : 'small');
  body.appendChild(inline(b));
}

async function updateFirmware() {
  if (state.dirty && !confirm("Des modifications ne sont pas enregistrées sur la carte. Elles seront gardées ici, mais la carte redémarre. Continuer ?")) return;
  const status = $('status');
  try {
    await ensureAuth();
    status.className = 'status busy';
    status.textContent = 'Téléchargement du logiciel...';
    const r = await fetch(`firmware/firmware.bin?v=${state.latest.md5}`);
    if (!r.ok) throw new Error('Logiciel introuvable sur le site.');
    const bytes = new Uint8Array(await r.arrayBuffer());
    if (bytes.length !== state.latest.size) throw new Error('Logiciel téléchargé incomplet, réessaie.');
    state.updating = true;
    await device.updateFirmware(bytes, state.latest.md5, (done, total) => {
      status.textContent = `Mise à jour de la carte : ${Math.round((done / total) * 100)} %`;
    });
    status.textContent = 'La carte redémarre...';
    state.hello = await device.reconnect();
    state.info = await device.info();
    toast(`Carte mise à jour en version ${state.hello.version}.`);
  } catch (e) {
    toast(errorMessage(e), true);
  }
  state.updating = false;
  renderAll();
}

function rescueSection(body) {
  h4(body, 'Dépannage : réinstallation complète');
  note(body, "Seulement si la carte ne démarre plus ou ne répond plus. Tout est effacé (pages, images, Wi-Fi, code) et la configuration de démonstration revient. Pense à exporter une sauvegarde avant, si possible.");
  const steps = document.createElement('ol');
  steps.className = 'note';
  for (const t of [
    'Débranche la carte de l\'éditeur (bouton Déconnecter).',
    'Maintiens le bouton BOOT de la carte, appuie brièvement sur RST, puis relâche BOOT.',
    'Clique sur "Réinstaller" et choisis "USB JTAG/serial debug unit".',
    'À la fin, appuie sur RST : la carte redémarre sur la démonstration.',
  ]) steps.appendChild(Object.assign(document.createElement('li'), { textContent: t }));
  body.appendChild(steps);
  if (!state.latest) {
    note(body, 'Disponible sur la page publiée uniquement.');
    return;
  }
  const holder = document.createElement('div');
  body.appendChild(holder);
  import('https://unpkg.com/esp-web-tools@10.4.0/dist/web/install-button.js?module')
    .then(() => {
      const install = document.createElement('esp-web-install-button');
      install.setAttribute('manifest', 'firmware/manifest-rescue.json');
      const b = button('Réinstaller', null, 'small danger');
      b.slot = 'activate';
      install.appendChild(b);
      holder.appendChild(install);
    })
    .catch(() => note(holder, "L'outil de réinstallation n'a pas pu être chargé (connexion internet ?)."));
}

// ------- Card -------

async function ensureAuth() {
  state.hello = await device.hello();
  let wrong = false;
  while (state.hello.pin && !state.hello.auth) {
    const code = await askPin(wrong);
    if (code === null) throw new DeviceError('code', 'Code de la carte requis.');
    try {
      await device.auth(code);
    } catch (e) {
      if (!(e instanceof DeviceError && e.code === 'code')) throw e;
      wrong = true;
    }
    state.hello = await device.hello();
  }
}

async function refreshInfo() {
  if (!device.connected) return;
  try {
    state.info = await device.info();
    updateButtons();
    if (state.tab === 'device') renderInspector();
  } catch (e) {
    /* next time */
  }
}

async function loadFromCard() {
  state.files = await device.list();
  state.info = await device.info();
  if (!state.files.some((f) => f.p === '/config.json')) {
    toast("La carte n'a pas encore de configuration : celle de l'éditeur sera envoyée à l'enregistrement.");
    return;
  }
  if (state.dirty && !confirm("Remplacer ce que tu as modifié ici par la configuration de la carte ?\n(Annuler garde tes modifications, à enregistrer sur la carte ensuite.)")) return;
  $('status').className = 'status busy';
  $('status').textContent = 'Lecture de la carte...';
  state.config = JSON.parse(await device.readText('/config.json'));
  for (const [p, img] of state.images) URL.revokeObjectURL(img.url);
  state.images.clear();
  for (const f of state.files) {
    if (!f.p.endsWith('.png')) continue;
    addImage(f.p, await device.readFile(f.p), false);
  }
  state.page = 0;
  state.selected = -1;
  state.dirty = false;
}

async function connect() {
  if (device.connected) {
    if (state.dirty && !confirm('Des modifications ne sont pas enregistrées sur la carte. Déconnecter quand même ?')) return;
    await device.disconnect();
    updateButtons();
    return;
  }
  try {
    state.hello = await device.connect();
    if (state.hello.app !== 'TouchDeck') throw new Error("Ce n'est pas une carte TouchDeck.");
    if (state.hello.screen) setScreen(state.hello.screen.w, state.hello.screen.h);
    updateButtons();
    await loadFromCard();
    renderAll();
    toast(updateAvailable() ? `Carte connectée. Mise à jour ${state.latest.version} disponible dans l'onglet Carte.` : 'Carte connectée.');
  } catch (e) {
    await device.disconnect();
    renderAll();
    toast(errorMessage(e), true);
  }
}

// The save button itself tells what is going on: progress, then the result for a few seconds
function saveButton(text, kind = '') {
  const btn = $('btnSave');
  clearTimeout(saveButton.timer);
  btn.textContent = text;
  btn.classList.toggle('saving', kind === 'busy');
  btn.classList.toggle('saved', kind === 'done');
  btn.classList.toggle('failed', kind === 'error');
  if (kind === 'done' || kind === 'error') {
    saveButton.timer = setTimeout(() => saveButton('Enregistrer sur la carte'), kind === 'done' ? 4000 : 8000);
  }
}

async function save() {
  const problems = validate(state.config);
  if (problems.length) return toast(`À corriger avant d'enregistrer : ${problems[0]}`, true);
  const status = $('status');
  try {
    await ensureAuth();
    $('btnSave').disabled = true;
    status.className = 'status busy';
    saveButton('Enregistrement... 0 %', 'busy');
    await prepareThemes();
    const config = new TextEncoder().encode(JSON.stringify(cleanConfig(), null, 2));
    const pending = [...state.images].filter(([, img]) => img.pending);
    // Progress over everything sent: the images first, then the configuration
    const total = pending.reduce((n, [, img]) => n + img.bytes.length, 0) + config.length;
    let sent = 0;
    const progress = (label) => (done) => {
      const percent = Math.min(99, Math.round(((sent + done) / total) * 100));
      saveButton(`Enregistrement... ${percent} %`, 'busy');
      status.textContent = label;
    };
    let n = 0;
    for (const [path, img] of pending) {
      n++;
      await device.writeFile(path, img.bytes, progress(`Envoi de l'image ${n}/${pending.length}`));
      sent += img.bytes.length;
      img.pending = false;
    }
    await device.writeFile('/config.json', config, progress('Envoi de la configuration...'));
    status.textContent = 'La carte recharge sa configuration...';
    await device.reload();
    state.files = await device.list();
    state.info = await device.info();
    state.dirty = false;
    saveButton('Enregistré sur la carte ✓', 'done');
    toast('Enregistré : la carte affiche la nouvelle configuration.');
  } catch (e) {
    saveButton("Échec de l'enregistrement", 'error');
    toast(errorMessage(e), true);
  }
  renderAll();
}

async function screenshot() {
  try {
    const shot = await device.screenshot();
    const canvas = $('shotCanvas');
    const ctx = canvas.getContext('2d');
    const out = ctx.createImageData(SCREEN.w, SCREEN.h);
    const px = new Uint16Array(shot.data.buffer, shot.data.byteOffset, shot.w * shot.h);
    for (let y = 0; y < SCREEN.h; y++)
      for (let x = 0; x < SCREEN.w; x++) {
        const c = px[x * shot.w + (shot.w - 1 - y)];
        const o = (y * SCREEN.w + x) * 4;
        out.data[o] = ((c >> 11) & 31) * 255 / 31;
        out.data[o + 1] = ((c >> 5) & 63) * 255 / 63;
        out.data[o + 2] = (c & 31) * 255 / 31;
        out.data[o + 3] = 255;
      }
    ctx.putImageData(out, 0, 0);
    $('dlgShot').showModal();
  } catch (e) {
    toast(errorMessage(e), true);
  }
}

// ------- Backup -------

function toBase64(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

function exportBackup() {
  const used = JSON.stringify(state.config);
  const files = {};
  for (const [p, img] of state.images) if (used.includes(`"${p}"`)) files[p] = toBase64(img.bytes);
  const backup = { format: 'touchdeck-backup', version: 1, config: cleanConfig(), files };
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(backup)], { type: 'application/json' }));
  const d = new Date();
  a.download = `touchdeck-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

async function importBackup(file) {
  try {
    const data = JSON.parse(await file.text());
    const config = data.format === 'touchdeck-backup' ? data.config : data;
    if (!Array.isArray(config.pages)) throw new Error("Ce fichier n'est pas une sauvegarde TouchDeck.");
    if (state.dirty && !confirm('Remplacer la configuration en cours par ce fichier ?')) return;
    state.config = config;
    for (const [p, b64] of Object.entries(data.files || {})) addImage(p, Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)), true);
    state.page = 0;
    state.selected = -1;
    state.dirty = true;
    renderAll();
    toast(device.connected ? 'Sauvegarde chargée : "Enregistrer sur la carte" pour l\'envoyer.' : 'Sauvegarde chargée.');
  } catch (e) {
    toast(errorMessage(e), true);
  }
}

// Demo shipped with the editor (data/ next to the page once published, ../data/ in the repository)
async function loadDemo() {
  for (const base of ['data/', '../data/']) {
    try {
      const r = await fetch(`${base}config.json`);
      if (!r.ok) continue;
      state.config = await r.json();
      const refs = new Set(JSON.stringify(state.config).match(/"\/(img|icons)\/[^"]+\.png"/g) || []);
      for (const ref of refs) {
        const path = ref.slice(1, -1);
        const img = await fetch(base + path.slice(1));
        if (img.ok) addImage(path, new Uint8Array(await img.arrayBuffer()), true);
      }
      return;
    } catch (e) {
      /* try the next location */
    }
  }
}

// ------- Start -------

async function init() {
  if (!Device.supported()) {
    $('unsupported').hidden = false;
    $('btnConnect').disabled = true;
  }
  device.onDisconnect = () => {
    if (state.updating) return; // expected: the card restarts on its new firmware
    toast('Carte déconnectée.', true);
    renderAll();
  };
  device.onLog = (line) => console.debug('[carte]', line);

  $('btnConnect').onclick = connect;
  $('btnSave').onclick = save;
  $('btnShot').onclick = screenshot;
  $('btnExport').onclick = exportBackup;
  $('btnImport').onclick = () => $('fileImport').click();
  $('fileImport').onchange = (e) => e.target.files[0] && importBackup(e.target.files[0]);
  $('btnAddPage').onclick = () => {
    state.config.pages.push(newPage(state.config));
    selectPage(state.config.pages.length - 1);
    changed({ pages: true });
  };
  document.querySelectorAll('#tabs button').forEach((b) => (b.onclick = () => {
    state.tab = b.dataset.tab;
    renderInspector();
  }));
  window.addEventListener('beforeunload', (e) => {
    if (state.dirty) e.preventDefault();
  });
  window.addEventListener('resize', renderStage);
  setInterval(() => {
    // Keeps the preview clock on time
    if (JSON.stringify(curPage()).includes('clock') || JSON.stringify(curPage()).includes('{time}')) renderStage();
  }, 30000);

  await document.fonts.load('600 18px Inter');
  await document.fonts.load('18px TDIcons');
  renderPalette();
  await loadDemo();
  try {
    const r = await fetch('firmware/version.json', { cache: 'no-store' });
    if (r.ok) state.latest = await r.json();
  } catch (e) {
    /* editor opened outside its site */
  }
  renderAll();
}

init();
