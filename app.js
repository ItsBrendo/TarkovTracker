const TRACKER_STORAGE_KEY = 'tarkov-field-log.tracker.v1';
const TRACKING_ENABLED = false;
const TRACKER_API_ENABLED = false;

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
const trackerApiForm = document.querySelector('#tracker-api-form');
const trackerApiTokenInput = document.querySelector('#tracker-api-token');
const trackerApiStatus = document.querySelector('#tracker-api-status');
const trackerApiBadge = document.querySelector('#tracker-api-badge');
const trackerApiDisconnect = document.querySelector('#tracker-api-disconnect');
const profileJsonInput = document.querySelector('#profile-json-input');
const profileUploadStatus = document.querySelector('#profile-upload-status');
const hubList = document.querySelector('#hub-list');
const hubCount = document.querySelector('#hub-count');
const viewTabs = [...document.querySelectorAll('.view-tab')];
const viewPanels = [...document.querySelectorAll('[data-view-panel]')];

let catalog = [];
let currentItem = null;
let catalogGeneratedAt = '';
let gameData = null;
let currentUser = null;
let jsonProfileLoaded = false;
let trackerData = readTrackerData();
let dailyState = { date: null, itemId: null, updatedAt: null };
let dailyPollTimer = null;

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

function countPlayerCounters(stats) {
  const result = { sessions: 0, survived: 0, kills: 0, deaths: 0, killedPmc: 0 };
  for (const item of Array.isArray(stats?.eft?.overAllCounters?.Items) ? stats.eft.overAllCounters.Items : []) {
    const key = Array.isArray(item.Key) ? item.Key : [];
    const value = Math.max(0, Number(item.Value) || 0);
    if (key[0] === 'Sessions') result.sessions = value;
    if (key[0] === 'Kills') result.kills = value;
    if (key[0] === 'Deaths') result.deaths = value;
    if (key[0] === 'KilledPmc') result.killedPmc = value;
    if (key[0] === 'ExitStatus' && key[1] === 'Survived') result.survived = value;
  }
  return result;
}

function summarizeQuests(value) {
  const quests = Array.isArray(value) ? value : [];
  const summary = { completed: 0, started: 0, failed: 0, available: 0, total: quests.length };
  for (const quest of quests) {
    const status = String(quest?.status || '').toLowerCase();
    if (status === 'success') summary.completed += 1;
    else if (status === 'fail' || status === 'failed') summary.failed += 1;
    else if (status === 'started') summary.started += 1;
    else if (status === 'availableforstart') summary.available += 1;
  }
  return summary;
}

function summarizeHealth(value) {
  return {
    energy: Number.isFinite(value?.Energy?.Current) ? Math.round(value.Energy.Current) : null,
    hydration: Number.isFinite(value?.Hydration?.Current) ? Math.round(value.Hydration.Current) : null
  };
}

function summarizeTraders(value) {
  const traders = value && typeof value === 'object' ? Object.values(value) : [];
  let unlocked = 0;
  let standingSum = 0;
  let standingCount = 0;
  for (const trader of traders) {
    if (trader?.unlocked) unlocked += 1;
    if (Number.isFinite(trader?.standing)) { standingSum += trader.standing; standingCount += 1; }
  }
  return { unlocked, averageStanding: standingCount ? Math.round((standingSum / standingCount) * 100) / 100 : null };
}

function countOf(value) {
  if (Array.isArray(value)) return value.length;
  if (value && typeof value === 'object') return Object.keys(value).length;
  return 0;
}

function summarizeHideout(value) {
  const areas = Array.isArray(value?.Areas) ? value.Areas : [];
  let maxLevel = 0;
  let totalLevels = 0;
  let built = 0;
  for (const area of areas) {
    const level = Math.max(0, Number(area?.level) || 0);
    if (level > 0) built += 1;
    if (level > maxLevel) maxLevel = level;
    totalLevels += level;
  }
  return { areasBuilt: built, maxLevel, totalLevels };
}

function normalizeUploadedProfile(profile) {
  if (!profile || typeof profile !== 'object' || Array.isArray(profile) || !profile.info?.nickname) return null;
  const list = (value, fields) => Array.isArray(value) ? value.slice(0, 100).map((entry) => Object.fromEntries(fields
    .filter((field) => typeof entry?.[field] === 'string' || Number.isFinite(entry?.[field]))
    .map((field) => [field, entry[field]]))) : [];
  const inventoryItems = (profile.Inventory || profile.inventory)?.items;
  const encyclopedia = profile.Encyclopedia || profile.encyclopedia;
  return {
    info: {
      nickname: String(profile.info.nickname).slice(0, 32), side: String(profile.info.side || '').slice(0, 16),
      level: Number.isFinite(profile.info.level) ? profile.info.level : null,
      experience: Number.isFinite(profile.info.experience) ? profile.info.experience : null,
      prestigeLevel: Number.isFinite(profile.info.prestigeLevel) ? profile.info.prestigeLevel : null,
      registrationDate: Number.isFinite(profile.info.registrationDate) ? profile.info.registrationDate : null
    },
    aid: Number.isFinite(profile.aid) ? profile.aid : null,
    pmcStats: countPlayerCounters(profile.pmcStats),
    scavStats: countPlayerCounters(profile.scavStats),
    skills: {
      Common: list(profile.skills?.Common, ['Id', 'Progress', 'PointsEarnedDuringSession']),
      Mastering: list(profile.skills?.Mastering, ['Id', 'Progress', 'Kills'])
    },
    achievements: profile.achievements && typeof profile.achievements === 'object' ? Object.keys(profile.achievements).length : 0,
    battlePassProgress: list(profile.battlePassProgress, ['battlePassId', 'completed', 'total']),
    seasonalRewards: {
      completed: Number.isFinite(profile.seasonalRewards?.completed) ? profile.seasonalRewards.completed : null,
      total: Number.isFinite(profile.seasonalRewards?.total) ? profile.seasonalRewards.total : null
    },
    Quests: summarizeQuests(profile.Quests || profile.quests),
    Hideout: summarizeHideout(profile.Hideout || profile.hideout),
    Inventory: { items: Array.isArray(inventoryItems) ? new Array(inventoryItems.length).fill(0) : [] },
    Encyclopedia: encyclopedia && typeof encyclopedia === 'object' && !Array.isArray(encyclopedia)
      ? Object.fromEntries(Object.keys(encyclopedia).map((key) => [key, true]))
      : undefined,
    Health: summarizeHealth(profile.Health || profile.health),
    TradersInfo: summarizeTraders(profile.TradersInfo || profile.traders),
    InsuredItems: new Array(countOf(profile.InsuredItems || profile.insuredItems)).fill(0),
    WishList: new Array(countOf(profile.WishList || profile.wishlist)).fill(0),
    Notes: new Array(countOf((profile.Notes || profile.notes)?.Notes || profile.Notes || profile.notes)).fill(0)
  };
}

function formatPlayerRatio(kills, deaths) {
  return (Number(kills) / Math.max(1, Number(deaths))).toFixed(2);
}

function renderHub(profiles) {
  hubCount.textContent = `${profiles.length} FILE${profiles.length === 1 ? '' : 'S'}`;
  if (!profiles.length) {
    hubList.innerHTML = '<p class="tracker-empty">No player exports uploaded yet.</p>';
    return;
  }
  hubList.innerHTML = profiles.map((profile) => {
    const pmc = profile.pmc || {};
    const scav = profile.scav || {};
    const uploaded = profile.uploadedAt ? new Date(profile.uploadedAt * 1000).toLocaleString() : 'Unknown';
    const detail = `
      <div class="hub-detail-grid">
        <div><span>PMC K/D</span><strong>${formatPlayerRatio(pmc.kills, pmc.deaths)}</strong></div>
        <div><span>PMC survival</span><strong>${Math.round((pmc.survived / Math.max(1, pmc.sessions)) * 100)}%</strong></div>
        <div><span>Scav K/D</span><strong>${formatPlayerRatio(scav.kills, scav.deaths)}</strong></div>
        <div><span>Scav survival</span><strong>${Math.round((scav.survived / Math.max(1, scav.sessions)) * 100)}%</strong></div>
      </div>
      <div class="hub-detail-lines"><span>PMC: ${pmc.kills || 0} kills / ${pmc.deaths || 0} deaths / ${pmc.killedPmc || 0} PMC kills</span><span>Scav: ${scav.kills || 0} kills / ${scav.deaths || 0} deaths / ${scav.killedPmc || 0} PMC kills</span><span>${profile.skills?.length || 0} skills / ${profile.mastering?.length || 0} mastery records / ${profile.achievementsCount || 0} achievements</span><span>${profile.quests?.completed || 0}/${profile.quests?.total || 0} quests complete (${profile.quests?.available || 0} available) / ${profile.hideout?.areasBuilt || 0} hideout areas (lv ${profile.hideout?.totalLevels || 0}) / ${profile.inventoryItemCount || 0} stash items / ${profile.encyclopediaCount || 0} items identified</span><span>${profile.traders?.unlocked || 0} traders unlocked (avg standing ${profile.traders?.averageStanding ?? '—'}) / ${profile.insuredItemsCount || 0} insured items / ${profile.wishlistCount || 0} wishlist / ${profile.notesCount || 0} notes / Energy ${profile.health?.energy ?? '—'} / Hydration ${profile.health?.hydration ?? '—'}</span></div>`;
    const level = profile.level == null ? '' : `LVL ${profile.level} / `;
    return `<details class="hub-player"><summary><span class="hub-player-avatar">${escapeHtml(profile.displayName.slice(0, 2).toUpperCase())}</span><span class="hub-player-main"><strong>${escapeHtml(profile.displayName)}</strong><small>${level}${escapeHtml(profile.side || 'Unknown side')} / ${profile.experience == null ? 'XP unknown' : `${formatNumber(profile.experience)} XP`}</small></span><span class="hub-player-meta"><b>${pmc.kills || 0}</b> PMC kills<small>Uploaded ${escapeHtml(uploaded)}</small></span></summary>${detail}</details>`;
  }).join('');
}

function renderOwnOperatorProfile(profile) {
  jsonProfileLoaded = true;
  document.querySelector('#stat-level').textContent = profile.level == null ? '—' : formatNumber(profile.level);
  document.querySelector('#stat-quests').textContent = formatNumber(profile.quests?.completed || 0);
  document.querySelector('#stat-objectives').textContent = formatNumber(profile.quests?.started || 0);
  document.querySelector('#stat-modules').textContent = formatNumber(profile.hideout?.areasBuilt || 0);
  document.querySelector('#stat-hideout-parts').textContent = formatNumber(profile.hideout?.totalLevels || 0);
  document.querySelector('#stat-faction').textContent = profile.side || '—';
  document.querySelector('#stat-edition').textContent = '—';
  document.querySelector('#stat-mode').textContent = 'JSON IMPORT';
  if (currentUser) document.querySelector('#profile-name').textContent = currentUser.username;
  document.querySelector('#record-data-source').textContent = `Uploaded player JSON // ${new Date(profile.uploadedAt * 1000).toLocaleString()}`;

  const detailTargets = {
    'json-quests-available': profile.quests?.available,
    'json-quests-failed': profile.quests?.failed,
    'json-stash-items': profile.inventoryItemCount,
    'json-encyclopedia': profile.encyclopediaCount,
    'json-energy': profile.health?.energy,
    'json-hydration': profile.health?.hydration,
    'json-traders-unlocked': profile.traders?.unlocked,
    'json-traders-standing': profile.traders?.averageStanding,
    'json-insured-items': profile.insuredItemsCount,
    'json-wishlist': profile.wishlistCount,
    'json-notes': profile.notesCount,
    'json-achievements': profile.achievementsCount,
    'json-prestige': profile.prestigeLevel
  };
  for (const [id, value] of Object.entries(detailTargets)) {
    const target = document.querySelector(`#${id}`);
    if (target) target.textContent = value == null ? '—' : formatNumber(value);
  }
}


async function loadHub() {
  try {
    const response = await fetch('/api/hub/profiles', { headers: { Accept: 'application/json' }, cache: 'no-store' });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'Could not load the player hub.');
    const profiles = result.profiles || [];
    renderHub(profiles);
    const ownProfile = profiles.find((profile) => profile.userId === currentUser?.id);
    if (ownProfile) renderOwnOperatorProfile(ownProfile);
  } catch (error) {
    hubList.innerHTML = `<p class="tracker-empty">${escapeHtml(error.message)}</p>`;
  }
}

let hubPollTimer = null;
function startHubPolling() {
  if (hubPollTimer) return;
  hubPollTimer = setInterval(loadHub, 20000);
}

function renderProfile() {
  const apiTotals = {
    items: gameData?.items ?? catalog.length,
    itemCategories: gameData?.itemCategories,
    handbookCategories: gameData?.handbookCategories,
    armorMaterials: gameData?.armorMaterials,
    specialItems: gameData?.specialItems,
    tasks: gameData?.tasks,
    maps: gameData?.maps,
    traders: gameData?.traders,
    hideout: gameData?.hideoutAreas,
    crafts: gameData?.crafts,
    barters: gameData?.barters,
    levels: gameData?.playerLevels,
    skills: gameData?.skills,
    mastery: gameData?.masteryGroups,
    fleaLevel: gameData?.fleaMarketUnlock
  };
  const apiTargets = {
    items: '#catalog-count', itemCategories: '#api-item-categories', handbookCategories: '#api-handbook-categories',
    armorMaterials: '#api-armor-materials', specialItems: '#api-special-items', tasks: '#api-tasks', maps: '#api-maps',
    traders: '#api-traders', hideout: '#api-hideout', crafts: '#api-crafts', barters: '#api-barters',
    levels: '#api-levels', skills: '#api-skills', mastery: '#api-mastery', fleaLevel: '#api-flea-level'
  };
  for (const [key, target] of Object.entries(apiTargets)) {
    const value = apiTotals[key];
    document.querySelector(target).textContent = value == null ? '—' : formatNumber(value);
  }
  const snapshotDate = gameData?.generatedAt || catalogGeneratedAt;
  document.querySelector('#catalog-snapshot').textContent = snapshotDate
    ? new Date(snapshotDate).toLocaleString()
    : 'Snapshot date unavailable';
  document.querySelector('#catalog-state').textContent = gameData ? 'FULL' : 'ITEMS';
}

function setTrackerApiStatus(message, state = '') {
  trackerApiStatus.textContent = message;
  trackerApiStatus.dataset.state = state;
}

function setProgressPlaceholders() {
  if (jsonProfileLoaded) return;
  for (const id of ['stat-level', 'stat-quests', 'stat-objectives', 'stat-modules', 'stat-hideout-parts', 'stat-faction', 'stat-edition', 'stat-mode']) {
    document.querySelector(`#${id}`).textContent = '—';
  }
  document.querySelector('#record-data-source').textContent = 'Awaiting Tracker API connection';
  if (currentUser) document.querySelector('#profile-name').textContent = currentUser.username;
}

function renderTrackerProgress(result) {
  if (jsonProfileLoaded) { setTrackerApiStatus(`Progress synced ${new Date(result.fetchedAt * 1000).toLocaleString()}.`, 'connected'); return; }
  const profile = result.profile;
  const completed = (entries) => entries.filter((entry) => entry.complete).length;
  const objectives = completed(profile.taskObjectivesProgress || []);
  const modules = completed(profile.hideoutModulesProgress || []);
  const parts = completed(profile.hideoutPartsProgress || []);
  const modeName = { pvp: 'PVP', pve: 'PVE', seasonal: 'SEASONAL' }[result.gameMode] || result.gameMode.toUpperCase();

  document.querySelector('#profile-name').textContent = profile.displayName || currentUser.username;
  document.querySelector('#stat-level').textContent = profile.playerLevel == null ? '—' : formatNumber(profile.playerLevel);
  document.querySelector('#stat-quests').textContent = formatNumber(completed(profile.tasksProgress || []));
  document.querySelector('#stat-objectives').textContent = formatNumber(objectives);
  document.querySelector('#stat-modules').textContent = formatNumber(modules);
  document.querySelector('#stat-hideout-parts').textContent = formatNumber(parts);
  document.querySelector('#stat-faction').textContent = profile.pmcFaction || '—';
  document.querySelector('#stat-edition').textContent = profile.gameEdition == null ? '—' : formatNumber(profile.gameEdition);
  document.querySelector('#stat-mode').textContent = modeName;
  document.querySelector('#record-username').textContent = profile.displayName || currentUser.username;
  document.querySelector('#record-data-source').textContent = `TarkovTracker API // ${modeName}`;
  setTrackerApiStatus(`Progress synced ${new Date(result.fetchedAt * 1000).toLocaleString()}.`, 'connected');
}

async function loadTrackerProgress() {
  const response = await fetch('/api/profile/progress', {
    headers: { Accept: 'application/json' },
    cache: 'no-store'
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'Could not load TarkovTracker progress.');
  if (!result.connected || !result.profile) {
    setProgressPlaceholders();
    setTrackerApiStatus('Not connected. Add your TarkovTracker API token in Settings.');
    return;
  }
  renderTrackerProgress(result);
}

async function loadTrackerConnection() {
  try {
    const response = await fetch('/api/profile/token', { headers: { Accept: 'application/json' }, cache: 'no-store' });
    const connection = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(connection.error || 'Could not read token connection.');
    trackerApiBadge.textContent = connection.connected ? `${connection.gameMode.toUpperCase()} LINKED` : 'NOT LINKED';
    trackerApiDisconnect.hidden = !connection.connected;
    if (!connection.connected) {
      setProgressPlaceholders();
      setTrackerApiStatus(connection.setupRequired
        ? 'Site setup required: the owner must configure token encryption before connecting.'
        : 'Not connected. Add your TarkovTracker API token in Settings.');
      return;
    }
    setTrackerApiStatus('Fetching your saved TarkovTracker progress...');
    await loadTrackerProgress();
  } catch (error) {
    setProgressPlaceholders();
    setTrackerApiStatus(error.message, 'error');
  }
}

trackerApiForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!TRACKER_API_ENABLED) {
    setTrackerApiStatus('TarkovTracker API linking is coming soon.', '');
    return;
  }
  if (!trackerApiForm.reportValidity()) return;
  const submitButton = trackerApiForm.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  setTrackerApiStatus('Validating token and read permission...');
  try {
    const response = await fetch('/api/profile/token', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ token: trackerApiTokenInput.value.trim() })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'Could not connect the API token.');
    trackerApiTokenInput.value = '';
    trackerApiBadge.textContent = `${result.gameMode.toUpperCase()} LINKED`;
    trackerApiDisconnect.hidden = false;
    setTrackerApiStatus('Token encrypted and connected. Loading progress...', 'connected');
    await loadTrackerProgress();
  } catch (error) {
    setTrackerApiStatus(error instanceof TypeError ? 'Could not reach the local profile service.' : error.message, 'error');
  } finally {
    submitButton.disabled = false;
  }
});

trackerApiDisconnect.addEventListener('click', async () => {
  trackerApiDisconnect.disabled = true;
  try {
    const response = await fetch('/api/profile/token', { method: 'DELETE', headers: { Accept: 'application/json' } });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'Could not disconnect the API token.');
    trackerApiBadge.textContent = 'NOT LINKED';
    trackerApiDisconnect.hidden = true;
    setProgressPlaceholders();
    setTrackerApiStatus('Disconnected. The encrypted token and cached progress were deleted.');
  } catch (error) {
    setTrackerApiStatus(error.message, 'error');
  } finally {
    trackerApiDisconnect.disabled = false;
  }
});

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

function hashStringToInt(value) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
}

// Same formula on every browser, so an unmodified day picks the same item for the whole crew.
function deterministicDailyItem(items, dateKey) {
  return items[hashStringToInt(dateKey) % items.length];
}

async function fetchDailyState() {
  try {
    const response = await fetch('/api/daily/item', { headers: { Accept: 'application/json' }, cache: 'no-store' });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

// Resolves the crew-wide item: a manual reroll (stored server-side) wins, otherwise everyone
// falls back to the same date-seeded choice without needing a server write.
async function resolveDailyItem() {
  const today = getTodayKey();
  const server = await fetchDailyState();
  const item = (server?.date === today && catalog.some((entry) => entry.id === server.itemId))
    ? catalog.find((entry) => entry.id === server.itemId)
    : deterministicDailyItem(catalog, today);
  dailyState = { date: today, itemId: item.id, updatedAt: server?.updatedAt ?? dailyState.updatedAt };
  return item;
}

function startDailyItemPolling() {
  if (dailyPollTimer) return;
  dailyPollTimer = setInterval(async () => {
    if (!catalog.length) return;
    const item = await resolveDailyItem();
    if (item.id !== currentItem?.id) renderCurrentItem(item);
  }, 5000);
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

async function fetchGameData() {
  try {
    const response = await fetch('./game-data.json', {
      headers: { Accept: 'application/json' },
      cache: 'no-store'
    });
    if (!response.ok) return null;
    const payload = await response.json();
    return payload && typeof payload === 'object' ? payload : null;
  } catch {
    return null;
  }
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
        <button class="count-button" type="button" data-stat="${key}" data-delta="-1" aria-label="Decrease ${label}" ${!TRACKING_ENABLED || stats[key] === 0 ? 'disabled' : ''}>−</button>
        <span class="count-value" aria-live="polite">${stats[key]}</span>
        <button class="count-button" type="button" data-stat="${key}" data-delta="1" aria-label="Increase ${label}" ${!TRACKING_ENABLED ? 'disabled' : ''}>+</button>
      </div>
    </div>`).join('');
  resetButton.disabled = !TRACKING_ENABLED;
}

function renderCurrentItem(item) {
  currentItem = item;
  renderItem(item);
  renderTracker();
  renderProfile();
  rerollButton.disabled = catalog.length < 2;
  resetButton.disabled = !TRACKING_ENABLED;
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
    const [fetchedItems, fetchedGameData] = await Promise.all([fetchItems(), fetchGameData()]);
    const items = getSelectableItems(fetchedItems);
    gameData = fetchedGameData;
    if (!items.length) {
      throw new Error(ITEM_NAMES.length
        ? 'No catalog items match the names configured in ITEM_NAMES.'
        : 'The published catalog contains no selectable items.');
    }
    catalog = items;
    renderCurrentItem(await resolveDailyItem());
    startDailyItemPolling();
  } catch (error) {
    showLoadError(error instanceof Error ? error : new Error('An unexpected item feed error occurred.'));
  }
}

rerollButton.addEventListener('click', async () => {
  if (catalog.length < 2) return;
  const alternatives = catalog.filter((item) => item.id !== currentItem?.id);
  const item = alternatives[Math.floor(Math.random() * alternatives.length)];
  rerollButton.disabled = true;
  try {
    const response = await fetch('/api/daily/item', {
      method: 'PUT', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ itemId: item.id })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'Could not share the new item with the crew.');
    dailyState = { date: result.date, itemId: result.itemId, updatedAt: result.updatedAt };
    renderCurrentItem(item);
  } catch (error) {
    setStatus(error.message, 'error');
  } finally {
    rerollButton.disabled = catalog.length < 2;
  }
});

trackerRegion.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-stat]');
  if (!button || !currentItem) return;

  const { stat } = button.dataset;
  const delta = Number(button.dataset.delta);
  if (!TRACKING_ENABLED) return;
  const counts = getItemStats(currentItem);
  if (!Object.hasOwn(counts, stat) || !Number.isFinite(delta)) return;
  counts[stat] = Math.max(0, counts[stat] + delta);
  trackerData[currentItem.id] = counts;
  saveTrackerData();
  renderTracker();
  renderProfile();
});

resetButton.addEventListener('click', () => {
  if (!TRACKING_ENABLED || !currentItem) return;
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

profileJsonInput.addEventListener('change', async () => {
  const file = profileJsonInput.files?.[0];
  if (!file) return;
  profileUploadStatus.textContent = 'Reading and reducing export locally...';
  profileUploadStatus.dataset.state = '';
  try {
    const raw = await file.text();
    const normalized = normalizeUploadedProfile(JSON.parse(raw));
    if (!normalized) throw new Error('That file does not look like a Tarkov.dev player export.');
    const response = await fetch('/api/hub/profiles', {
      method: 'PUT', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ profile: normalized })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'Could not save the player summary.');
    profileUploadStatus.textContent = `Uploaded ${new Date(result.profile.uploadedAt * 1000).toLocaleString()}. Raw JSON was discarded.`;
    profileUploadStatus.dataset.state = 'connected';
    await loadHub();
  } catch (error) {
    profileUploadStatus.textContent = error instanceof SyntaxError ? 'The selected file is not valid JSON.' : error.message;
    profileUploadStatus.dataset.state = 'error';
  } finally {
    profileJsonInput.value = '';
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
    currentUser = user;
    signedInAs.textContent = user.username;
    document.querySelector('#menu-username').textContent = user.username.toUpperCase();
    document.querySelector('#profile-name').textContent = user.username;
    document.querySelector('#profile-username').textContent = `SIGNED IN AS ${user.username.toUpperCase()}`;
    document.querySelector('#profile-role').textContent = user.role === 'admin' ? 'ADMINISTRATOR // GOONS' : 'USEC TASK FORCE // GOONS';
    document.querySelector('#operator-avatar').textContent = user.username.slice(0, 2).toUpperCase();
    document.querySelector('#settings-username').textContent = user.username;
    document.querySelector('#settings-role-name').textContent = user.role === 'admin' ? 'Administrator' : 'Standard user';
    document.querySelector('#settings-role').textContent = user.role.toUpperCase();
    document.querySelector('#settings-role-badge').textContent = user.role.toUpperCase();
    document.querySelector('#record-username').textContent = user.username;
    document.querySelector('#record-role').textContent = user.role === 'admin' ? 'Administrator' : 'Standard user';
    document.querySelector('#record-created').textContent = user.created_at
      ? new Date(user.created_at * 1000).toLocaleDateString()
      : '—';
    document.querySelector('#admin-menu-button').hidden = user.role !== 'admin';
    await loadHub();
    loadTrackerConnection();
    loadCatalog();
    startHubPolling();
  } catch (error) {
    showLoadError(error instanceof Error ? error : new Error('The authentication service is unavailable.'));
    setStatus('AUTHENTICATION SERVICE UNAVAILABLE', 'error');
  }
}

startApp();