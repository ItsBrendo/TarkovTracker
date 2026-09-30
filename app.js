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

// Keep ambient effects isolated from tracker interactions and honor reduced motion.
function initializeAmbientScene() {
  const canvas = document.querySelector('.ambient-particles');
  const context = canvas?.getContext('2d');
  const scene = document.querySelector('.ambient-scene');
  if (!canvas || !context || !scene) return;

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const pointer = { x: 0, y: 0, targetX: 0, targetY: 0 };
  let particles = [];
  let width = 0;
  let height = 0;
  let frame = 0;

  function resize() {
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = Math.round(width * pixelRatio);
    canvas.height = Math.round(height * pixelRatio);
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    const count = width < 600 ? 24 : 44;
    particles = Array.from({ length: count }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      radius: Math.random() * 1.15 + 0.35,
      speed: Math.random() * 0.14 + 0.045,
      phase: Math.random() * Math.PI * 2
    }));
    if (reducedMotion.matches) draw(0, true);
  }

  function draw(time, still = false) {
    context.clearRect(0, 0, width, height);
    for (const particle of particles) {
      const shimmer = 0.2 + (Math.sin(time * 0.0007 + particle.phase) + 1) * 0.16;
      context.beginPath();
      context.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
      context.fillStyle = `rgba(198, 219, 214, ${still ? 0.28 : shimmer})`;
      context.fill();
      if (!still) {
        particle.y -= particle.speed;
        if (particle.y < -3) {
          particle.y = height + 3;
          particle.x = Math.random() * width;
        }
      }
    }
  }

  function animate(time) {
    pointer.x += (pointer.targetX - pointer.x) * 0.045;
    pointer.y += (pointer.targetY - pointer.y) * 0.045;
    scene.style.setProperty('--parallax-x', `${pointer.x.toFixed(2)}px`);
    scene.style.setProperty('--parallax-y', `${pointer.y.toFixed(2)}px`);
    draw(time);
    frame = window.requestAnimationFrame(animate);
  }

  window.addEventListener('pointermove', (event) => {
    if (reducedMotion.matches || event.pointerType === 'touch') return;
    pointer.targetX = ((0.5 - event.clientX / width) * 14);
    pointer.targetY = ((0.5 - event.clientY / height) * 10);
  }, { passive: true });
  window.addEventListener('resize', resize, { passive: true });
  reducedMotion.addEventListener('change', () => {
    window.cancelAnimationFrame(frame);
    if (reducedMotion.matches) {
      pointer.targetX = 0;
      pointer.targetY = 0;
      scene.style.setProperty('--parallax-x', '0px');
      scene.style.setProperty('--parallax-y', '0px');
      draw(0, true);
    } else {
      frame = window.requestAnimationFrame(animate);
    }
  });
  resize();
  if (!reducedMotion.matches) frame = window.requestAnimationFrame(animate);
}

initializeAmbientScene();

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
      <p>${escapeHtml(detail)} The catalog snapshot is generated by the GitHub Pages workflow.</p>
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
});

resetButton.addEventListener('click', () => {
  if (!currentItem) return;
  if (!window.confirm(`Reset all counts for ${getDisplayName(currentItem)}?`)) return;
  delete trackerData[currentItem.id];
  saveTrackerData();
  renderTracker();
});

loadCatalog();