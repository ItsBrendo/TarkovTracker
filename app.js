const TRACKER_STORAGE_KEY = 'tarkov-field-log.tracker.v1';
const DAILY_STORAGE_KEY = 'tarkov-field-log.selection.v1';

// Add exact Tarkov.dev item names here to restrict the daily selection.
const ITEM_NAMES = [];

const itemRegion = document.querySelector('#item-region');
const trackerRegion = document.querySelector('#tracker-region');
const statusStrip = document.querySelector('#app-status');
const statusText = document.querySelector('#status-text');
const rerollButton = document.querySelector('#reroll-button');
const resetButton = document.querySelector('#reset-button');
const todayDate = document.querySelector('#today-date');
const logoutButton = document.querySelector('#logout-button');
const signedInAs = document.querySelector('#signed-in-as');
const menuButton = document.querySelector('#menu-button');
const menuPanel = document.querySelector('#user-menu-panel');
const motionToggle = document.querySelector('#motion-toggle');
const viewTabs = [...document.querySelectorAll('.view-tab')];
const viewPanels = [...document.querySelectorAll('[data-view-panel]')];

let catalog = [];
let currentItem = null;
let catalogGeneratedAt = '';
let trackerData = readTrackerData();

const TRACKED_STATS = [
  { key: 'found', label: 'Times found' },
  { key: 'kills', label: 'Kills' },
  { key: 'deaths', label: 'Deaths' },
  { key: 'survived', label: 'Raids survived' }
];

todayDate.textContent = new Intl.DateTimeFormat(undefined, {
  weekday: 'short', month: 'short', day: '2-digit', year: 'numeric', timeZone: 'UTC'
}).format(new Date()).toUpperCase();

function readTrackerData() {
  try {
    const stored = JSON.parse(localStorage.getItem(TRACKER_STORAGE_KEY) || '{}');
    return stored && typeof stored === 'object' && !Array.isArray(stored) ? stored : {};
  } catch {
    return {};
  }
}

function saveTrackerData() {
  try {
    localStorage.setItem(TRACKER_STORAGE_KEY, JSON.stringify(trackerData));
  } catch {
    setStatus('Counts are only available until this page is closed because local storage is unavailable.', 'error');
  }
}

function setStatus(message, state = 'ready') {
  statusText.textContent = message;
  statusStrip.dataset.state = state;
}

function setView(viewName, focusTab = false) {
  for (const panel of viewPanels) panel.hidden = panel.dataset.viewPanel !== viewName;
  for (const tab of viewTabs) {
    const selected = tab.dataset.viewTarget === viewName;
    tab.setAttribute('aria-selected', String(selected));
    tab.tabIndex = selected ? 0 : -1;
    if (selected && focusTab) tab.focus();
  }
  menuPanel.hidden = true;
  menuButton.setAttribute('aria-expanded', 'false');
}

function renderProfileItem(item) {
  const content = document.querySelector('#profile-item-content');
  const imageUrl = item.imageLink || item.iconLink;
  const name = getDisplayName(item);
  const category = Array.isArray(item.types) && item.types.length ? item.types[0] : 'Tarkov item';
  const dimensions = item.width && item.height ? `${item.width} × ${item.height} CELLS` : 'SIZE NOT LISTED';
  content.innerHTML = `
    <div class="profile-item-art">${imageUrl ? `<img src="${escapeHtml(imageUrl)}" alt="" loading="lazy" />` : '<span aria-hidden="true">?</span>'}</div>
    <div class="profile-item-copy"><span class="profile-item-category">${escapeHtml(category)}</span><strong>${escapeHtml(name)}</strong><span>${escapeHtml(dimensions)}</span><span>${formatPrice(item.basePrice)}</span></div>`;
  document.querySelector('#profile-item-size').textContent = dimensions;
}

function renderProfile() {
  const records = Object.entries(trackerData).map(([id, saved]) => ({
    id,
    found: Math.max(0, Number(saved?.found) || 0),
    kills: Math.max(0, Number(saved?.kills) || 0),
    deaths: Math.max(0, Number(saved?.deaths) || 0),
    survived: Math.max(0, Number(saved?.survived) || 0)
  }));
  const totals = records.reduce((sum, record) => {
    for (const key of ['found', 'kills', 'deaths', 'survived']) sum[key] += record[key];
    return sum;
  }, { found: 0, kills: 0, deaths: 0, survived: 0 });
  const tracked = records.filter((record) => record.found + record.kills + record.deaths + record.survived > 0);

  document.querySelector('#stat-items').textContent = formatNumber(tracked.length);
  document.querySelector('#stat-found').textContent = formatNumber(totals.found);
  document.querySelector('#stat-kills').textContent = formatNumber(totals.kills);
  document.querySelector('#stat-survived').textContent = formatNumber(totals.survived);

  const mostLogged = [...tracked].sort((left, right) =>
    (right.found + right.kills + right.deaths + right.survived)
      - (left.found + left.kills + left.deaths + left.survived))[0];
  const ledger = document.querySelector('#ledger-highlight');
  if (!mostLogged) {
    ledger.innerHTML = '<span>No tracked items yet.</span><small>Start with today\'s rotation to build your record.</small>';
  } else {
    const item = catalog.find((entry) => entry.id === mostLogged.id);
    ledger.innerHTML = `<strong>${escapeHtml(item ? getDisplayName(item) : mostLogged.id)}</strong><span>${formatNumber(mostLogged.found)} FOUND <i>/</i> ${formatNumber(mostLogged.kills)} KILLS <i>/</i> ${formatNumber(mostLogged.survived)} SURVIVED</span>`;
  }

  if (currentItem) renderProfileItem(currentItem);
  if (catalog.length) {
    const highestValue = catalog.reduce((best, item) => {
      const price = Number(item.basePrice);
      if (!Number.isFinite(price)) return best;
      return !best || price > Number(best.basePrice) ? item : best;
    }, null);
    document.querySelector('#catalog-count').textContent = formatNumber(catalog.length);
    document.querySelector('#catalog-top-item').textContent = highestValue ? getDisplayName(highestValue) : 'No value data';
    document.querySelector('#catalog-top-value').textContent = highestValue ? formatPrice(highestValue.basePrice) : '--';
  }
}

function normalizeName(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function getDisplayName(item) {
  const apiName = String(item.name || '').trim();
  if (apiName && apiName !== `${item.id} Name`) return apiName;

  return String(item.normalizedName || 'Tarkov item')
    .split(/[-_]+/)
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(' ');
}

function getSelectableItems(items) {
  const configuredNames = ITEM_NAMES.map(normalizeName).filter(Boolean);
  if (!configuredNames.length) return items;

  const allowedNames = new Set(configuredNames);
  return items.filter((item) => [item.name, item.shortName, item.normalizedName]
    .some((name) => allowedNames.has(normalizeName(name))));
}

function getTodayKey() {
  return new Date().toISOString().slice(0, 10);
}

function selectDailyItem(items) {
  const today = getTodayKey();
  try {
    const saved = JSON.parse(localStorage.getItem(DAILY_STORAGE_KEY) || '{}');
    if (saved.date === today && items.some((item) => item.id === saved.id)) {
      return items.find((item) => item.id === saved.id);
    }
  } catch {
    // A fresh random item is still usable when browser storage is unavailable.
  }

  const item = items[Math.floor(Math.random() * items.length)];
  saveDailySelection(item, today);
  return item;
}

function saveDailySelection(item, date = getTodayKey()) {
  try {
    localStorage.setItem(DAILY_STORAGE_KEY, JSON.stringify({ date, id: item.id }));
  } catch {
    // Selection remains available for the current page session.
  }
}

async function fetchItems() {
  const response = await fetch('./items.json', {
    headers: { Accept: 'application/json' },
    cache: 'no-store'
  });

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error(`The published item catalog returned an unreadable response (HTTP ${response.status}).`);
  }

  if (!response.ok) {
    throw new Error(`The published item catalog could not be loaded (HTTP ${response.status}).`);
  }
  if (!Array.isArray(payload.items)) {
    throw new Error('The published item catalog has an invalid format.');
  }

  catalogGeneratedAt = payload.generatedAt || '';
  return payload.items.filter((item) => item?.id && item?.name);
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
}

function formatNumber(value, maximumFractionDigits = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 'Not listed';
  return new Intl.NumberFormat(undefined, { maximumFractionDigits }).format(number);
}

function formatPrice(value) {
  return value == null ? 'Not listed' : `${formatNumber(value)} ₽`;
}

function renderItem(item) {
  const itemName = getDisplayName(item);
  const shortName = item.shortName === `${item.id} ShortName` ? '' : item.shortName;
  const category = Array.isArray(item.types) && item.types.length ? item.types[0] : 'Tarkov item';
  const size = item.width && item.height ? `${item.width} × ${item.height}` : 'Not listed';
  const weight = item.weight == null ? 'Not listed' : `${formatNumber(item.weight, 2)} kg`;
  const imageUrl = item.imageLink || item.iconLink;
  const wikiLink = item.wikiLink && /^https:\/\//i.test(item.wikiLink)
    ? `<a href="${escapeHtml(item.wikiLink)}" target="_blank" rel="noreferrer">Open wiki ↗</a>`
    : 'Not listed';

  itemRegion.setAttribute('aria-busy', 'false');
  itemRegion.innerHTML = `
    <article class="item-card">
      <div class="item-art">
        ${imageUrl ? `<img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(itemName)}" loading="eager" />` : `<span class="item-art-fallback" aria-hidden="true">?</span>`}
        <span class="item-index">DAILY DROP / ${getTodayKey().replaceAll('-', '.')}</span>
      </div>
      <div class="item-details">
        <p class="item-category">${escapeHtml(category)}</p>
        <h2 class="item-name">${escapeHtml(itemName)}</h2>
        <p class="item-description">${escapeHtml(shortName || 'Tarkov item')}</p>
        <div class="item-facts">
          <div class="item-fact"><span class="item-fact-label">Base price</span><span class="item-fact-value">${formatPrice(item.basePrice)}</span></div>
          <div class="item-fact"><span class="item-fact-label">24h average</span><span class="item-fact-value">${formatPrice(item.avg24hPrice)}</span></div>
          <div class="item-fact"><span class="item-fact-label">Weight</span><span class="item-fact-value">${weight}</span></div>
          <div class="item-fact"><span class="item-fact-label">Size</span><span class="item-fact-value">${size}</span></div>
          <div class="item-fact"><span class="item-fact-label">Last low</span><span class="item-fact-value">${formatPrice(item.lastLowPrice)}</span></div>
          <div class="item-fact"><span class="item-fact-label">Reference</span><span class="item-fact-value">${wikiLink}</span></div>
        </div>
      </div>
    </article>`;

  const image = itemRegion.querySelector('.item-art img');
  if (image) {
    image.addEventListener('error', () => {
      image.replaceWith(Object.assign(document.createElement('span'), {
        className: 'item-art-fallback',
        textContent: '?',
        ariaHidden: 'true'
      }));
    }, { once: true });
  }
}

function getItemStats(item) {
  const saved = trackerData[item.id];
  return Object.fromEntries(TRACKED_STATS.map(({ key }) => [key, Math.max(0, Number(saved?.[key]) || 0)]));
}

function renderTracker() {
  if (!currentItem) {
    trackerRegion.innerHTML = '<p class="tracker-empty">Your counts for today\'s item will appear here.</p>';
    resetButton.disabled = true;
    return;
  }

  const stats = getItemStats(currentItem);
  trackerRegion.innerHTML = TRACKED_STATS.map(({ key, label }) => `
    <div class="tracker-row">
      <span class="tracker-label">${label}</span>
      <div class="tracker-controls" aria-label="${label}">
        <button class="count-button" type="button" data-stat="${key}" data-delta="-1" aria-label="Decrease ${label}" ${stats[key] === 0 ? 'disabled' : ''}>−</button>
        <span class="count-value" aria-live="polite">${stats[key]}</span>
        <button class="count-button" type="button" data-stat="${key}" data-delta="1" aria-label="Increase ${label}">+</button>
      </div>
    </div>`).join('');
  resetButton.disabled = false;
}

function renderCurrentItem(item) {
  currentItem = item;
  renderItem(item);
  renderTracker();
  renderProfile();
  rerollButton.disabled = catalog.length < 2;
  resetButton.disabled = false;
  const updated = catalogGeneratedAt ? ` / SNAPSHOT ${catalogGeneratedAt.slice(0, 10)}` : '';
  setStatus(`ITEM DATABASE READY / ${catalog.length.toLocaleString()} ITEMS AVAILABLE${updated}`);
}

function showLoadError(error) {
  const detail = error instanceof TypeError
    ? 'The browser could not reach the published item catalog. Check your connection and retry.'
    : error.message;
  itemRegion.setAttribute('aria-busy', 'false');
  itemRegion.innerHTML = `
    <div class="error-panel">
      <span class="error-symbol" aria-hidden="true">!</span>
      <h2>Item feed unavailable</h2>
      <p>${escapeHtml(detail)} The catalog snapshot is generated during deployment.</p>
      <button class="button" id="retry-button" type="button">Retry connection</button>
    </div>`;
  trackerRegion.innerHTML = '<p class="tracker-empty">Counts will be available when an item loads.</p>';
  rerollButton.disabled = true;
  resetButton.disabled = true;
  setStatus('LIVE ITEM DATA COULD NOT BE LOADED', 'error');
  document.querySelector('#retry-button').addEventListener('click', loadCatalog);
}

async function loadCatalog() {
  itemRegion.setAttribute('aria-busy', 'true');
  itemRegion.innerHTML = '<div class="loading-panel"><span class="loading-mark" aria-hidden="true"></span><p>SCANNING ITEM DATABASE</p></div>';
  setStatus('CONNECTING TO TARKOV.DEV...', 'loading');

  try {
    const items = getSelectableItems(await fetchItems());
    if (!items.length) {
      throw new Error(ITEM_NAMES.length
        ? 'No catalog items match the names configured in ITEM_NAMES.'
        : 'The published catalog contains no selectable items.');
    }
    catalog = items;
    renderCurrentItem(selectDailyItem(catalog));
  } catch (error) {
    showLoadError(error instanceof Error ? error : new Error('An unexpected item feed error occurred.'));
  }
}

rerollButton.addEventListener('click', () => {
  if (catalog.length < 2) return;
  const alternatives = catalog.filter((item) => item.id !== currentItem?.id);
  const item = alternatives[Math.floor(Math.random() * alternatives.length)];
  saveDailySelection(item);
  renderCurrentItem(item);
});

trackerRegion.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-stat]');
  if (!button || !currentItem) return;

  const { stat } = button.dataset;
  const delta = Number(button.dataset.delta);
  const counts = getItemStats(currentItem);
  if (!Object.hasOwn(counts, stat) || !Number.isFinite(delta)) return;
  counts[stat] = Math.max(0, counts[stat] + delta);
  trackerData[currentItem.id] = counts;
  saveTrackerData();
  renderTracker();
  renderProfile();
});

resetButton.addEventListener('click', () => {
  if (!currentItem) return;
  if (!window.confirm(`Reset all counts for ${getDisplayName(currentItem)}?`)) return;
  delete trackerData[currentItem.id];
  saveTrackerData();
  renderTracker();
  renderProfile();
});

document.addEventListener('click', (event) => {
  const viewButton = event.target.closest('[data-view-target]');
  if (viewButton) {
    setView(viewButton.dataset.viewTarget);
    return;
  }
  if (!event.target.closest('.user-menu')) {
    menuPanel.hidden = true;
    menuButton.setAttribute('aria-expanded', 'false');
  }
});

menuButton.addEventListener('click', () => {
  menuPanel.hidden = !menuPanel.hidden;
  menuButton.setAttribute('aria-expanded', String(!menuPanel.hidden));
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !menuPanel.hidden) {
    menuPanel.hidden = true;
    menuButton.setAttribute('aria-expanded', 'false');
    menuButton.focus();
  }
});

viewTabs.forEach((tab, index) => tab.addEventListener('keydown', (event) => {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault();
  const nextIndex = event.key === 'Home' ? 0
    : event.key === 'End' ? viewTabs.length - 1
      : (index + (event.key === 'ArrowRight' ? 1 : viewTabs.length - 1)) % viewTabs.length;
  setView(viewTabs[nextIndex].dataset.viewTarget, true);
}));

motionToggle.checked = localStorage.getItem('tarkov-field-log.reduce-motion.v1') === 'true';
motionToggle.addEventListener('change', () => {
  try {
    localStorage.setItem('tarkov-field-log.reduce-motion.v1', String(motionToggle.checked));
  } catch {
    setStatus('DISPLAY PREFERENCE COULD NOT BE SAVED', 'error');
  }
  document.dispatchEvent(new CustomEvent('field-log:motion-preference', { detail: motionToggle.checked }));
});

logoutButton.addEventListener('click', async () => {
  logoutButton.disabled = true;
  try {
    await fetch('/api/auth/logout', { method: 'POST', headers: { Accept: 'application/json' } });
  } finally {
    window.location.replace('/login.html');
  }
});

async function startApp() {
  try {
    const response = await fetch('/api/auth/session', { headers: { Accept: 'application/json' }, cache: 'no-store' });
    if (response.status === 401) {
      window.location.replace('/login.html');
      return;
    }
    if (!response.ok) throw new Error('The authentication service is unavailable.');
    const { user } = await response.json();
    signedInAs.textContent = user.username;
    document.querySelector('#menu-username').textContent = user.username.toUpperCase();
    document.querySelector('#profile-name').textContent = user.username;
    document.querySelector('#profile-username').textContent = `SIGNED IN AS ${user.username.toUpperCase()}`;
    document.querySelector('#profile-role').textContent = user.role === 'admin' ? 'ADMINISTRATOR // GOONS' : 'USEC TASK FORCE // GOONS';
    document.querySelector('#operator-avatar').textContent = user.username.slice(0, 2).toUpperCase();
    document.querySelector('#settings-username').textContent = user.username;
    document.querySelector('#settings-role-name').textContent = user.role === 'admin' ? 'Administrator' : 'Standard user';
    document.querySelector('#settings-role').textContent = user.role.toUpperCase();
    document.querySelector('#admin-menu-button').hidden = user.role !== 'admin';
    loadCatalog();
  } catch (error) {
    showLoadError(error instanceof Error ? error : new Error('The authentication service is unavailable.'));
    setStatus('AUTHENTICATION SERVICE UNAVAILABLE', 'error');
  }
}

startApp();