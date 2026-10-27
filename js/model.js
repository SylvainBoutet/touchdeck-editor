// Configuration model: same grid geometry and style inheritance as the firmware
// (src/ui/Ui.cpp, src/app/Config.cpp), so the preview matches the screen.

// Screen of the connected card (reported by HELLO), 480 x 320 until then
export const SCREEN = { w: 480, h: 320 };
export function setScreen(w, h) {
  if (w > 0 && h > 0) {
    SCREEN.w = w;
    SCREEN.h = h;
  }
}
export const FONT_SIZES = [14, 18, 24, 32, 48];

// Same fallbacks as the firmware (iCUE like dark theme)
export const DEFAULT_ACCENTS = ['#C0E800', '#3040F0', '#E000C0', '#00F0F0', '#F0E020', '#E02020'];
export const DEFAULTS = {
  background: '#000000',
  clock_color: '#F0E020',
  track_color: '#3A3A3A',
  widget: { color: '#000000', opacity: 100, radius: 12 },
  button: {
    color: '#161616',
    opacity: 100,
    radius: 12,
    text_color: '#FFFFFF',
    pressed_color: '#3A7BD5',
    icon_size: 40,
    label_size: 18,
    value_size: 14,
    layout: 'icon_top',
  },
  grid: { cols: 4, rows: 2, gap: 8, margin: 8 },
};

export const LAYOUTS = [
  ['icon_top', 'Icône au-dessus'],
  ['icon_left', 'Icône à gauche'],
  ['icon_only', 'Icône seule'],
  ['text_only', 'Texte seul'],
];

export const WIDGETS = [
  ['clock', 'Horloge'],
  ['gauge', 'Jauge'],
  ['dual', '2 capteurs'],
  ['chart', 'Courbe'],
  ['value', 'Grand chiffre'],
  ['bar', 'Barre'],
  ['media', 'Lecture en cours'],
  ['volume', 'Volume'],
  ['text', 'Texte avec valeurs'],
  ['image', 'Image'],
];

export const CLOCK_STYLES = [
  ['digital', 'Numérique'],
  ['seconds', 'Numérique avec secondes'],
  ['analog', 'À aiguilles'],
];

// Widgets taking accent colours in turn, as in the firmware
export const MEASURING = ['gauge', 'bar', 'chart', 'volume'];

export const ACTIONS = [
  ['shortcut', 'Raccourci tout fait'],
  ['keys', 'Raccourci clavier libre'],
  ['text', 'Taper un texte'],
  ['media', 'Touche multimédia'],
  ['page', 'Aller à une page'],
  ['delay', 'Pause'],
  ['brightness', 'Luminosité'],
  ['launch', 'Lancer une application'],
  ['http', 'Appeler une adresse web'],
  ['serial', 'Message au PC'],
];

export const MEDIA = [
  ['PLAY_PAUSE', 'Lecture / pause'],
  ['NEXT', 'Piste suivante'],
  ['PREVIOUS', 'Piste précédente'],
  ['STOP', 'Stop'],
  ['VOLUME_UP', 'Volume +'],
  ['VOLUME_DOWN', 'Volume -'],
  ['MUTE', 'Muet'],
];

// Names known by TouchDeck Stats (pc/touchdeck_stats.py, APPS of WindowsSystem and MacSystem)
export const APPS = [
  ['spotify', 'Spotify'],
  ['discord', 'Discord'],
  ['steam', 'Steam'],
  ['teams', 'Teams'],
  ['edge', 'Edge (Windows)'],
  ['xbox', 'Xbox (Windows)'],
  ['epic', 'Epic Games (Windows)'],
  ['settings', 'Paramètres (Windows)'],
  ['explorer', 'Explorateur de fichiers (Windows)'],
  ['calc', 'Calculatrice (Windows)'],
  ['notepad', 'Bloc-notes (Windows)'],
  ['chrome', 'Chrome (Mac)'],
  ['safari', 'Safari (Mac)'],
  ['firefox', 'Firefox (Mac)'],
  ['music', 'Musique (Mac)'],
  ['finder', 'Finder (Mac)'],
  ['terminal', 'Terminal (Mac)'],
  ['vlc', 'VLC (Mac)'],
];

export const BUILTIN_SOURCES = [
  ['time', 'Heure'],
  ['date', 'Date'],
  ['seconds', 'Secondes'],
  ['ip', 'Adresse IP'],
  ['wifi_rssi', 'Signal Wi-Fi'],
  ['uptime', 'Allumé depuis'],
];

export const LAYOUTS_KEYBOARD = [
  ['fr', 'Français AZERTY'],
  ['us', 'Anglais QWERTY (US)'],
];

export const SYSTEMS = [
  ['auto', 'Automatique (annoncé par TouchDeck Stats, sinon Windows)'],
  ['windows', 'Windows'],
  ['mac', 'Mac'],
];

// Same table as the firmware (src/app/Actions.cpp): [name, label, Windows keys, Mac keys]
export const SHORTCUTS = [
  ['copy', 'Copier', 'CTRL+C', 'GUI+C'],
  ['paste', 'Coller', 'CTRL+V', 'GUI+V'],
  ['cut', 'Couper', 'CTRL+X', 'GUI+X'],
  ['undo', 'Annuler', 'CTRL+Z', 'GUI+Z'],
  ['redo', 'Rétablir', 'CTRL+Y', 'GUI+SHIFT+Z'],
  ['select_all', 'Tout sélectionner', 'CTRL+A', 'GUI+A'],
  ['save', 'Enregistrer', 'CTRL+S', 'GUI+S'],
  ['find', 'Rechercher dans la page', 'CTRL+F', 'GUI+F'],
  ['print', 'Imprimer', 'CTRL+P', 'GUI+P'],
  ['new_window', 'Nouvelle fenêtre', 'CTRL+N', 'GUI+N'],
  ['new_tab', 'Nouvel onglet', 'CTRL+T', 'GUI+T'],
  ['close_tab', "Fermer l'onglet", 'CTRL+W', 'GUI+W'],
  ['reopen_tab', "Rouvrir l'onglet fermé", 'CTRL+SHIFT+T', 'GUI+SHIFT+T'],
  ['refresh', 'Actualiser', 'F5', 'GUI+R'],
  ['quit_app', "Quitter l'application", 'ALT+F4', 'GUI+Q'],
  ['switch_app', "Changer d'application", 'ALT+TAB', 'GUI+TAB'],
  ['screenshot', "Capture d'une zone", 'GUI+SHIFT+S', 'GUI+SHIFT+4'],
  ['screenshot_full', "Capture de l'écran", 'PRINTSCREEN', 'GUI+SHIFT+3'],
  ['lock', 'Verrouiller la session', 'GUI+L', 'CTRL+GUI+Q'],
  ['desktop', 'Afficher le bureau', 'GUI+D', 'F11'],
  ['search', 'Recherche (Windows, Spotlight)', 'GUI+S', 'GUI+SPACE'],
  ['emoji', 'Emojis', 'GUI+.', 'CTRL+GUI+SPACE'],
  ['task_manager', 'Gestionnaire des tâches / Forcer à quitter', 'CTRL+SHIFT+ESC', 'GUI+ALT+ESC'],
  ['files', 'Explorateur / Finder', 'GUI+E', 'GUI+ALT+SPACE'],
  ['settings', 'Paramètres', 'GUI+I', 'GUI+,'],
  ['zoom_in', 'Zoom +', 'CTRL+=', 'GUI+='],
  ['zoom_out', 'Zoom -', 'CTRL+-', 'GUI+-'],
  ['mic_mute', 'Couper le micro (Teams)', 'CTRL+SHIFT+M', 'GUI+SHIFT+M'],
];

// "GUI+SHIFT+4" shown for each system
export function comboLabel(combo, mac) {
  const names = mac
    ? { GUI: '⌘ Cmd', ALT: '⌥ Option', CTRL: '⌃ Ctrl', SHIFT: '⇧ Maj', SPACE: 'Espace', ESC: 'Échap' }
    : { GUI: 'Win', ALT: 'Alt', CTRL: 'Ctrl', SHIFT: 'Maj', SPACE: 'Espace', ESC: 'Échap', PRINTSCREEN: 'Impr. écran' };
  return combo.split(/\+(?!$)/).map((k) => names[k] || k).join(' + ');
}

export const TIMEZONES = ['Europe/Paris', 'Europe/Brussels', 'Europe/Zurich', 'Europe/Luxembourg', 'Europe/London', 'America/Montreal', 'UTC'];

export const MODIFIERS = ['CTRL', 'SHIFT', 'ALT', 'ALTGR', 'GUI'];
export const KEY_NAMES = [
  'ENTER', 'ESC', 'TAB', 'SPACE', 'BACKSPACE', 'DELETE', 'INSERT', 'HOME', 'END', 'PAGEUP', 'PAGEDOWN',
  'UP', 'DOWN', 'LEFT', 'RIGHT', 'PRINTSCREEN', 'PAUSE', 'CAPSLOCK', 'MENU',
  ...Array.from({ length: 24 }, (_, i) => `F${i + 1}`),
  ...Array.from({ length: 10 }, (_, i) => `NUM_${i}`),
  'NUM_PLUS', 'NUM_MINUS', 'NUM_MULTIPLY', 'NUM_DIVIDE', 'NUM_ENTER', 'NUM_DOT',
];

// Browser key codes to firmware key names, for recording a shortcut
const CODE_NAMES = {
  ControlLeft: 'CTRL', ControlRight: 'RCTRL', ShiftLeft: 'SHIFT', ShiftRight: 'RSHIFT',
  AltLeft: 'ALT', AltRight: 'ALTGR', MetaLeft: 'GUI', MetaRight: 'RGUI', OSLeft: 'GUI', OSRight: 'RGUI',
  Enter: 'ENTER', Escape: 'ESC', Tab: 'TAB', Space: 'SPACE', Backspace: 'BACKSPACE', Delete: 'DELETE',
  Insert: 'INSERT', Home: 'HOME', End: 'END', PageUp: 'PAGEUP', PageDown: 'PAGEDOWN',
  ArrowUp: 'UP', ArrowDown: 'DOWN', ArrowLeft: 'LEFT', ArrowRight: 'RIGHT', PrintScreen: 'PRINTSCREEN',
  Pause: 'PAUSE', CapsLock: 'CAPSLOCK', ContextMenu: 'MENU', NumpadAdd: 'NUM_PLUS',
  NumpadSubtract: 'NUM_MINUS', NumpadMultiply: 'NUM_MULTIPLY', NumpadDivide: 'NUM_DIVIDE',
  NumpadEnter: 'NUM_ENTER', NumpadDecimal: 'NUM_DOT',
};

export function keyNameFromEvent(e) {
  if (CODE_NAMES[e.code]) return CODE_NAMES[e.code];
  if (/^F\d+$/.test(e.code)) return e.code;
  if (/^Numpad\d$/.test(e.code)) return `NUM_${e.code.slice(6)}`;
  if (e.key && e.key.length === 1) return e.key.toUpperCase();
  return null;
}

export function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

export function grid(config, page) {
  const g = { ...DEFAULTS.grid, ...(config.theme?.grid || {}), ...(page.grid || {}) };
  g.cols = clamp(g.cols | 0, 1, 8);
  g.rows = clamp(g.rows | 0, 1, 6);
  return g;
}

export function cellArea(config, page, item) {
  const g = grid(config, page);
  const col = clamp(item.col | 0, 0, g.cols - 1);
  const row = clamp(item.row | 0, 0, g.rows - 1);
  const colspan = clamp(item.colspan || 1, 1, g.cols - col);
  const rowspan = clamp(item.rowspan || 1, 1, g.rows - row);
  const cellW = (SCREEN.w - 2 * g.margin - (g.cols - 1) * g.gap) / g.cols;
  const cellH = (SCREEN.h - 2 * g.margin - (g.rows - 1) * g.gap) / g.rows;
  const x1 = g.margin + Math.trunc(col * (cellW + g.gap));
  const y1 = g.margin + Math.trunc(row * (cellH + g.gap));
  const x2 = g.margin + Math.trunc((col + colspan) * (cellW + g.gap) - g.gap) - 1;
  const y2 = g.margin + Math.trunc((row + rowspan) * (cellH + g.gap) - g.gap) - 1;
  return { x: x1, y: y1, w: x2 - x1 + 1, h: y2 - y1 + 1, col, row, colspan, rowspan };
}

// Cell under a point of the screen, or null in a gap
export function cellAt(config, page, x, y) {
  const g = grid(config, page);
  for (let row = 0; row < g.rows; row++) {
    for (let col = 0; col < g.cols; col++) {
      const a = cellArea(config, page, { col, row });
      if (x >= a.x && x < a.x + a.w + g.gap && y >= a.y && y < a.y + a.h + g.gap) return { col, row };
    }
  }
  return null;
}

// Style of an item: item, then page.widget / theme.widget for widgets, page.button,
// theme.button, then the built-in default
export function itemStyle(config, page, item, key, on = false) {
  if (on && item.on && item.on[key] !== undefined) return item.on[key];
  if (item[key] !== undefined) return item[key];
  if (item.type === 'widget') {
    if (page.widget?.[key] !== undefined) return page.widget[key];
    if (config.theme?.widget?.[key] !== undefined) return config.theme.widget[key];
    if (DEFAULTS.widget[key] !== undefined && config.theme?.button?.[key] === undefined) return DEFAULTS.widget[key];
  }
  if (page.button?.[key] !== undefined) return page.button[key];
  if (config.theme?.button?.[key] !== undefined) return config.theme.button[key];
  return DEFAULTS.button[key];
}

export function pageStyle(config, page, key) {
  if (page[key] !== undefined && page[key] !== '') return page[key];
  if (config.theme?.[key] !== undefined) return config.theme[key];
  return DEFAULTS[key];
}

// Accent colour n of an item: own bar_color(2), else the theme accents in turn
export function accentOf(config, page, item, n = 0) {
  const own = n === 0 ? item.bar_color : item.bar_color2;
  if (own) return own;
  let rank = 0;
  for (const other of page.items || []) {
    if (other === item) break;
    if (other.type !== 'widget') continue;
    if (other.widget === 'dual') rank += 2;
    else if (MEASURING.includes(other.widget)) rank++;
  }
  const list = config.theme?.accents?.length ? config.theme.accents : DEFAULT_ACCENTS;
  return list[(rank + n) % list.length];
}

export function nearestFont(px) {
  let f = 14;
  for (const s of FONT_SIZES) if (px >= s) f = s;
  return f;
}

export function itemAt(config, page, col, row) {
  return (page.items || []).findIndex((it) => {
    const a = cellArea(config, page, it);
    return col >= a.col && col < a.col + a.colspan && row >= a.row && row < a.row + a.rowspan;
  });
}

export function newPage(config) {
  let n = (config.pages || []).length + 1;
  while (config.pages.some((p) => p.id === `page${n}`)) n++;
  return { id: `page${n}`, name: `Page ${n}`, items: [] };
}

export function newButton(col, row) {
  return { type: 'button', col, row, label: 'Bouton', icon: 'sym:star', actions: [] };
}

export function newWidget(col, row) {
  return { type: 'widget', widget: 'text', col, row, text: '{time}' };
}

// Ready-made elements of the palette: [id, label, icon, size in cells, item]
export const PALETTE = [
  ['button', 'Bouton', 0xf0a6, [1, 1], { type: 'button', label: 'Bouton', icon: 'sym:star', actions: [] }],
  ['shortcut', 'Raccourci', 0xf11c, [1, 1], { type: 'button', label: 'Copier', icon: 'sym:copy', actions: [{ type: 'shortcut', name: 'copy' }] }],
  ['launch', 'Lancer une appli', 0xf135, [1, 1], { type: 'button', label: 'Spotify', icon: 'sym:spotify', actions: [{ type: 'launch', app: 'spotify' }] }],
  ['page', 'Aller à une page', 0xf0c9, [1, 1], { type: 'button', label: 'Retour', icon: 'sym:home', actions: [{ type: 'page', page: 'back' }] }],
  ['clock', 'Horloge', 0xf017, [2, 1], { type: 'widget', widget: 'clock', style: 'seconds' }],
  ['analog', 'Horloge à aiguilles', 0xf017, [1, 1], { type: 'widget', widget: 'clock', style: 'analog' }],
  ['gauge', 'Jauge', 0xf3fd, [1, 1], { type: 'widget', widget: 'gauge', title: 'CPU', source: 'cpu', unit: '%' }],
  ['dual', '2 capteurs', 0xf3fd, [2, 1], { type: 'widget', widget: 'dual', title: 'CPU', source: 'cpu', unit: '%', title2: 'RAM', source2: 'ram', unit2: '%' }],
  ['chart', 'Courbe', 0xf201, [2, 1], { type: 'widget', widget: 'chart', title: 'CPU', source: 'cpu', unit: '%', points: 40, every_s: 2 }],
  ['value', 'Grand chiffre', 0xf1ec, [2, 1], { type: 'widget', widget: 'value', title: 'Réception', source: 'net_down', unit: 'Ko/s' }],
  ['bar', 'Barre', 0xf080, [2, 1], { type: 'widget', widget: 'bar', title: 'RAM', source: 'ram', unit: '%' }],
  ['media', 'Lecture en cours', 0xf001, [2, 1], { type: 'widget', widget: 'media' }],
  ['volume', 'Volume', 0xf028, [2, 1], { type: 'widget', widget: 'volume', source: 'volume' }],
  ['text', 'Texte', 0xf031, [1, 1], { type: 'widget', widget: 'text', text: '{time}' }],
  ['image', 'Image', 0xf03e, [1, 1], { type: 'widget', widget: 'image' }],
];

export function newAction(type) {
  switch (type) {
    case 'keys': return { type, keys: ['CTRL', 'C'] };
    case 'shortcut': return { type, name: 'copy' };
    case 'text': return { type, text: '' };
    case 'media': return { type, key: 'PLAY_PAUSE' };
    case 'page': return { type, page: 'back' };
    case 'delay': return { type, ms: 200 };
    case 'brightness': return { type, value: '+10' };
    case 'http': return { type, method: 'GET', url: 'https://' };
    case 'launch': return { type, app: '' };
    case 'serial': return { type, data: '' };
    default: return { type };
  }
}

export function demoConfig() {
  return {
    version: 1,
    device: { name: 'TouchDeck', brightness: 80, keyboard_layout: 'fr', start_page: 'home', timezone: 'Europe/Paris' },
    theme: { background: '#0B1A2E', swipe: true, grid: { cols: 4, rows: 2, gap: 8, margin: 8 }, button: { color: '#FFFFFF', opacity: 14, radius: 16, border: { width: 1, color: '#3C4E66' } } },
    sources: {},
    pages: [{ id: 'home', name: 'Accueil', items: [] }],
  };
}

// Problems that would make the deck behave unexpectedly
export function validate(config) {
  const errors = [];
  const ids = new Set();
  const pages = config.pages || [];
  if (!pages.length) errors.push('Il faut au moins une page.');
  for (const p of pages) {
    if (!p.id) errors.push(`Une page n'a pas d'identifiant.`);
    else if (ids.has(p.id)) errors.push(`Deux pages s'appellent "${p.id}".`);
    ids.add(p.id);
  }
  for (const p of pages) {
    const taken = new Map();
    for (const it of p.items || []) {
      const a = cellArea(config, p, it);
      for (let c = a.col; c < a.col + a.colspan; c++)
        for (let r = a.row; r < a.row + a.rowspan; r++) {
          const k = `${c},${r}`;
          if (taken.has(k)) errors.push(`Page "${p.name || p.id}" : deux éléments se chevauchent (colonne ${c + 1}, ligne ${r + 1}).`);
          taken.set(k, it);
        }
      for (const list of [it.actions, it.long_press, it.actions_off])
        for (const a of list || [])
          if (a.type === 'page' && a.page !== 'back' && !ids.has(a.page))
            errors.push(`Page "${p.name || p.id}" : un bouton mène à la page "${a.page}", qui n'existe pas.`);
    }
  }
  return [...new Set(errors)];
}
