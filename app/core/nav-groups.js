// Navigation model: seven groups (sidebar and phone bar), each with sub-views shown as tabs above the
// content. Pure data and helpers, no DOM, so it is unit-tested. A tab is a view (a #view-* section) and,
// for groups that split one section into parts, a pane inside it (Okazje: deals, bundles, targets,
// market, sniper all live in #view-deals). Labels of tabs are the ones the app always had.
//
// A group id equals the id of its first view where that exists (catalog, scanner, deals, today,
// hunter, settings), so the sidebar buttons keep their data-view attributes.
// Kolejka keeps its own tab bar (queue.js: review / sets / two catalogue checks); here it only
// lists the views it owns.
export const NAV_GROUPS = [
  { id: 'today', label: 'Dziś', tabs: [{ id: 'today', view: 'today', label: 'Dziś' }] },
  {
    id: 'deals',
    label: 'Okazje',
    tabs: [
      { id: 'deals', view: 'deals', pane: 'deals', label: 'Okazje', hint: 'Oferty wyraźnie poniżej wyceny wydania' },
      { id: 'bundles', view: 'deals', pane: 'bundles', label: 'Paczki', hint: 'Sprzedawcy z kilkoma interesującymi książkami' },
      { id: 'targets', view: 'deals', pane: 'targets', label: 'Kupuję do', hint: 'Moje ceny docelowe' },
      { id: 'market', view: 'deals', pane: 'market', label: 'Indeks rynku', hint: 'Szansa sprzedaży w 30 dni dla każdego wydania' },
      { id: 'sniper', view: 'deals', pane: 'sniper', label: 'Snajper', hint: 'Automatyczny skan najnowszych ogłoszeń' },
    ],
  },
  {
    id: 'hunter',
    label: 'Łowca',
    tabs: [
      { id: 'hunter', view: 'hunter', label: 'Łowca', hint: 'Sprawdź książkę po ISBN lub tytule w terenie' },
      { id: 'stock', view: 'stock', label: 'Zapas', hint: 'Kupione, wystawione, sprzedane — stany i daty' },
    ],
  },
  {
    id: 'queue',
    label: 'Kolejka',
    ownBar: true,
    tabs: [
      { id: 'review', view: 'review', label: 'Weryfikacja' },
      { id: 'sets', view: 'sets', label: 'Zestawy' },
      { id: 'checks', view: 'checks', label: 'Podejrzane i duplikaty' },
    ],
  },
  {
    id: 'catalog',
    label: 'Książki',
    tabs: [
      { id: 'catalog', view: 'catalog', label: 'Książki', hint: 'Dzieła, wydania i serie' },
      { id: 'offers', view: 'offers', label: 'Oferty', hint: 'Wszystkie zebrane ogłoszenia' },
    ],
  },
  {
    id: 'scanner',
    label: 'Skan',
    tabs: [
      { id: 'scanner', view: 'scanner', label: 'Źródła', hint: 'Stan źródeł i nowy skan' },
      { id: 'phrases', view: 'phrases', label: 'Frazy', hint: 'Co przynosi fraza skanu' },
    ],
  },
  { id: 'settings', label: 'Ustawienia', tabs: [{ id: 'settings', view: 'settings', label: 'Ustawienia' }] },
];

/** Groups on the phone's bottom bar; the rest sit under "Więcej". */
export const MOBILE_PRIMARY = ['today', 'deals', 'hunter', 'queue'];
export const MOBILE_MORE = ['catalog', 'scanner', 'settings'];

/** Every view (section id without "view-") exactly once, in navigation order. */
export const NAV_VIEWS = [...new Set(NAV_GROUPS.flatMap((group) => group.tabs.map((tab) => tab.view)))];

const KEY = 'bookflip.navLast.';

export function groupById(id) {
  return NAV_GROUPS.find((group) => group.id === id) ?? null;
}

/** The group a view belongs to (id), or null for an unknown name. */
export function groupOf(view) {
  return NAV_GROUPS.find((group) => group.tabs.some((tab) => tab.view === view))?.id ?? null;
}

export function tabsOf(groupId) {
  return groupById(groupId)?.tabs ?? [];
}

export function tabById(tabId) {
  for (const group of NAV_GROUPS) {
    const tab = group.tabs.find((item) => item.id === tabId);
    if (tab) return tab;
  }
  return null;
}

function read(storage, groupId) {
  try {
    return storage?.getItem(KEY + groupId) ?? null;
  } catch {
    return null;
  }
}

/** The tab a group opens: the last one used (when still valid), else its first. */
export function defaultTab(groupId, storage = null) {
  const tabs = tabsOf(groupId);
  const last = read(storage, groupId);
  return tabs.find((tab) => tab.id === last) ?? tabs[0] ?? null;
}

/** Remembers the tab used last in its group; storage may be missing or refuse (private mode, quota). */
export function rememberTab(tabId, storage = null) {
  const tab = tabById(tabId);
  const group = tab && groupOf(tab.view);
  if (!group) return false;
  try {
    storage?.setItem(KEY + group, tab.id);
    return Boolean(storage);
  } catch {
    return false;
  }
}

/** The tab of a view with its pane: the remembered pane for a multi-pane view, else the view's own tab. */
export function tabForView(view, storage = null) {
  const group = groupOf(view);
  const tabs = tabsOf(group).filter((tab) => tab.view === view);
  const last = read(storage, group);
  return tabs.find((tab) => tab.id === last) ?? tabs[0] ?? null;
}
