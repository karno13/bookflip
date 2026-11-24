// Per-browser interface preferences. Stored in localStorage only (conveniences, not data).
const KEYS = {
  tradingMode: 'bookflip.tradingMode',
  theme: 'bookflip.theme',
  density: 'bookflip.density',
  catalogView: 'bookflip.catalogView',
};

function read(key) {
  try {
    return localStorage.getItem(key) || '';
  } catch {
    return '';
  }
}
function write(key, value) {
  try {
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  } catch {}
}

export function applyPreferences(root = document.documentElement, body = document.body) {
  body.classList.toggle('trading-mode', read(KEYS.tradingMode) === '1');
  const theme = read(KEYS.theme);
  if (theme) root.dataset.theme = theme;
  else delete root.dataset.theme;
  body.classList.toggle('density-compact', read(KEYS.density) === 'compact');
  body.dataset.catalogView = { series: 'labels' }[read(KEYS.catalogView)] || read(KEYS.catalogView) || 'list';
}

/** Wires the Settings → Interfejs controls and catalog view switch. */
export function installPreferences({ $, $$, onTradingChange, onCatalogViewChange }) {
  applyPreferences();
  const trading = $('#prefTradingMode');
  if (trading) {
    trading.checked = document.body.classList.contains('trading-mode');
    trading.addEventListener('change', () => {
      write(KEYS.tradingMode, trading.checked ? '1' : '');
      applyPreferences();
      onTradingChange?.(trading.checked);
    });
  }
  const theme = $('#prefTheme');
  if (theme) {
    theme.value = read(KEYS.theme);
    theme.addEventListener('change', () => {
      write(KEYS.theme, theme.value);
      applyPreferences();
    });
  }
  const density = $('#prefDensity');
  if (density) {
    density.value = read(KEYS.density);
    density.addEventListener('change', () => {
      write(KEYS.density, density.value);
      applyPreferences();
    });
  }
  const syncViewButtons = () =>
    $$('button[data-catalog-view]').forEach((button) =>
      button.setAttribute('aria-pressed', String(button.dataset.catalogView === document.body.dataset.catalogView)),
    );
  const setCatalogView = (view) => {
    write(KEYS.catalogView, ['grid', 'labels'].includes(view) ? view : '');
    applyPreferences();
    syncViewButtons();
  };
  // Only the buttons: <body> carries data-catalog-view too, and a listener on it redrew the catalogue
  // on every click anywhere (an open sub-label list on a cover closed at once).
  $$('button[data-catalog-view]').forEach((button) =>
    button.addEventListener('click', () => {
      setCatalogView(button.dataset.catalogView);
      onCatalogViewChange?.();
    }),
  );
  syncViewButtons();
  return { setCatalogView };
}
