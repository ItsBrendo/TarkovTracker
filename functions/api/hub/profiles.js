import { errorResponse, jsonResponse, readJson, sameOrigin } from '../../_lib/auth.js';
import { sendDiscordMessage } from '../../_lib/discord.js';

function numberOrNull(value, integer = false) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return integer ? Math.trunc(number) : number;
}

function safeText(value, maximum = 80) {
  return typeof value === 'string' ? value.trim().slice(0, maximum) : '';
}

function safeList(value, fields) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 100).map((entry) => {
    const result = {};
    for (const field of fields) {
      if (typeof entry?.[field] === 'string') result[field] = safeText(entry[field], 80);
      else if (Number.isFinite(entry?.[field])) result[field] = Number(entry[field]);
    }
    return result;
  });
}

function questSummary(value) {
  if (value && typeof value === 'object' && !Array.isArray(value) && (Number.isFinite(value.completed) || Number.isFinite(value.total))) {
    return {
      completed: numberOrNull(value.completed, true) || 0,
      started: numberOrNull(value.started, true) || 0,
      failed: numberOrNull(value.failed, true) || 0,
      available: numberOrNull(value.available, true) || 0,
      total: numberOrNull(value.total, true) || 0
    };
  }
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

function healthSummary(value) {
  if (value && typeof value === 'object' && !Array.isArray(value) && (Number.isFinite(value.energy) || Number.isFinite(value.hydration))) {
    return { energy: numberOrNull(value.energy, true), hydration: numberOrNull(value.hydration, true) };
  }
  return {
    energy: numberOrNull(value?.Energy?.Current, true),
    hydration: numberOrNull(value?.Hydration?.Current, true)
  };
}

function tradersSummary(value) {
  if (value && typeof value === 'object' && !Array.isArray(value) && (Number.isFinite(value.unlocked) || Number.isFinite(value.averageStanding))) {
    return { unlocked: numberOrNull(value.unlocked, true) || 0, averageStanding: numberOrNull(value.averageStanding) };
  }
  const traders = value && typeof value === 'object' && !Array.isArray(value) ? Object.values(value) : [];
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

function hideoutSummary(value) {
  if (value && typeof value === 'object' && !Array.isArray(value) && !Array.isArray(value.Areas)) {
    return {
      areasBuilt: numberOrNull(value.areasBuilt, true) || 0,
      maxLevel: numberOrNull(value.maxLevel, true) || 0,
      totalLevels: numberOrNull(value.totalLevels, true) || 0
    };
  }
  const areas = Array.isArray(value?.Areas) ? value.Areas : [];
  let maxLevel = 0;
  let totalLevels = 0;
  let built = 0;
  for (const area of areas) {
    const level = numberOrNull(area?.level, true) || 0;
    if (level > 0) built += 1;
    if (level > maxLevel) maxLevel = level;
    totalLevels += level;
  }
  return { areasBuilt: built, maxLevel, totalLevels };
}

function inventorySummary(value) {
  const items = Array.isArray(value?.items) ? value.items : [];
  return { itemCount: items.length };
}

function encyclopediaCount(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? Object.keys(value).length : 0;
}

function counterSet(stats) {
  const values = { Sessions: 0, ExitStatus: 0, Kills: 0, Deaths: 0, KilledPmc: 0, LongestWinStreak: 0 };
  if (stats && Number.isFinite(stats.sessions)) {
    return {
      Sessions: numberOrNull(stats.sessions, true) || 0,
      ExitStatus: numberOrNull(stats.survived, true) || 0,
      Kills: numberOrNull(stats.kills, true) || 0,
      Deaths: numberOrNull(stats.deaths, true) || 0,
      KilledPmc: numberOrNull(stats.killedPmc, true) || 0,
      LongestWinStreak: 0
    };
  }
  for (const item of Array.isArray(stats?.eft?.overAllCounters?.Items) ? stats.eft.overAllCounters.Items : []) {
    const key = Array.isArray(item.Key) ? item.Key : [];
    const value = numberOrNull(item.Value, true) || 0;
    if (key[0] === 'Sessions' && key[1]) values.Sessions = value;
    if (key[0] === 'Kills') values.Kills = value;
    if (key[0] === 'Deaths') values.Deaths = value;
    if (key[0] === 'KilledPmc') values.KilledPmc = value;
    if (key[0] === 'LongestWinStreak') values.LongestWinStreak = value;
    if (key[0] === 'ExitStatus' && key[1] === 'Survived') values.ExitStatus = value;
  }
  return values;
}

function normalizeProfile(body) {
  const profile = body?.profile;
  if (!profile || typeof profile !== 'object' || Array.isArray(profile)) return null;
  const info = profile.info || {};
  const pmc = counterSet(profile.pmcStats || profile.pmc);
  const scav = counterSet(profile.scavStats || profile.scav);
  const skills = safeList(profile.skills?.Common, ['Id', 'Progress', 'PointsEarnedDuringSession']);
  const mastering = safeList(profile.skills?.Mastering, ['Id', 'Progress', 'Kills']);
  const battlePass = safeList(profile.battlePassProgress, ['battlePassId', 'completed', 'total']);
  const rewards = profile.seasonalRewards || {};
  const displayName = safeText(info.nickname, 32);
  if (!displayName) return null;
  const quests = questSummary(profile.Quests || profile.quests);
  const hideout = hideoutSummary(profile.Hideout || profile.hideout);
  const inventory = inventorySummary(profile.Inventory || profile.inventory);
  const health = healthSummary(profile.Health || profile.health);
  const traders = tradersSummary(profile.TradersInfo || profile.traders);
  const insuredItemsCount = countOf(profile.InsuredItems || profile.insuredItems);
  const wishlistCount = countOf(profile.WishList || profile.wishlist);
  const notesCount = countOf((profile.Notes || profile.notes)?.Notes || profile.Notes || profile.notes);
  return {
    displayName,
    accountId: numberOrNull(profile.aid, true),
    side: safeText(info.side, 16),
    level: numberOrNull(info.level, true),
    experience: numberOrNull(info.experience, true),
    prestigeLevel: numberOrNull(info.prestigeLevel, true),
    registrationDate: numberOrNull(info.registrationDate, true),
    pmc, scav, skills, mastering,
    achievementsCount: profile.achievements && typeof profile.achievements === 'object' ? Object.keys(profile.achievements).length : 0,
    battlePass,
    seasonalRewards: { completed: numberOrNull(rewards.completed, true), total: numberOrNull(rewards.total, true) },
    quests, hideout, inventory, health, traders, insuredItemsCount, wishlistCount, notesCount,
    encyclopediaCount: encyclopediaCount(profile.Encyclopedia || profile.encyclopedia)
  };
}

function publicProfile(row) {
  return {
    userId: row.user_id, displayName: row.display_name, accountId: row.account_id, side: row.side,
    level: row.level, experience: row.experience, prestigeLevel: row.prestige_level, registrationDate: row.registration_date,
    pmc: { sessions: row.pmc_sessions, survived: row.pmc_survived, kills: row.pmc_kills, deaths: row.pmc_deaths, killedPmc: row.pmc_killed_pmc },
    scav: { sessions: row.scav_sessions, survived: row.scav_survived, kills: row.scav_kills, deaths: row.scav_deaths, killedPmc: row.scav_killed_pmc },
    skills: JSON.parse(row.skills_json), mastering: JSON.parse(row.mastering_json), achievementsCount: row.achievements_count,
    battlePass: JSON.parse(row.battle_pass_json), seasonalRewards: { completed: row.seasonal_rewards_completed, total: row.seasonal_rewards_total },
    quests: { completed: row.quests_completed, started: row.quests_started, failed: row.quests_failed, available: row.quests_available, total: row.quests_total },
    hideout: { areasBuilt: row.hideout_areas_built, maxLevel: row.hideout_max_level, totalLevels: row.hideout_total_levels },
    inventoryItemCount: row.inventory_item_count, encyclopediaCount: row.encyclopedia_count,
    health: { energy: row.health_energy, hydration: row.health_hydration },
    traders: { unlocked: row.traders_unlocked, averageStanding: row.traders_avg_standing },
    insuredItemsCount: row.insured_items_count, wishlistCount: row.wishlist_count, notesCount: row.notes_count,
    uploadedAt: row.uploaded_at
  };
}

export async function onRequestGet(context) {
  if (!context.data.user?.id) return errorResponse('Authentication required.', 401);
  try {
    const { results } = await context.env.DB.prepare('SELECT * FROM player_profiles ORDER BY display_name COLLATE NOCASE').all();
    return jsonResponse({ profiles: (results || []).map(publicProfile) });
  } catch { return errorResponse('Could not load the player hub.', 503); }
}

export async function onRequestPut(context) {
  if (!context.data.user?.id) return errorResponse('Authentication required.', 401);
  if (!sameOrigin(context.request)) return errorResponse('Request origin could not be verified.', 403);
  const normalized = normalizeProfile(await readJson(context.request));
  if (!normalized) return errorResponse('The uploaded file is not a supported TarkovTracker player export.');
  const now = Math.floor(Date.now() / 1000);
  try {
    const previous = await context.env.DB.prepare('SELECT uploaded_at FROM player_profiles WHERE user_id = ?1').bind(context.data.user.id).first();
    await context.env.DB.prepare(`
      INSERT INTO player_profiles (user_id, display_name, account_id, side, level, experience, prestige_level, registration_date, pmc_sessions, pmc_survived, pmc_kills, pmc_deaths, pmc_killed_pmc, scav_sessions, scav_survived, scav_kills, scav_deaths, scav_killed_pmc, skills_json, mastering_json, achievements_count, battle_pass_json, seasonal_rewards_completed, seasonal_rewards_total, quests_completed, quests_started, quests_failed, quests_available, quests_total, hideout_areas_built, hideout_max_level, hideout_total_levels, inventory_item_count, encyclopedia_count, health_energy, health_hydration, traders_unlocked, traders_avg_standing, insured_items_count, wishlist_count, notes_count, last_reminder_at, uploaded_at, updated_at)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22, ?23, ?24, ?25, ?26, ?27, ?28, ?29, ?30, ?31, ?32, ?33, ?34, ?35, ?36, ?37, ?38, ?39, ?40, ?41, NULL, ?42, ?42)
      ON CONFLICT(user_id) DO UPDATE SET display_name = excluded.display_name, account_id = excluded.account_id, side = excluded.side, level = excluded.level, experience = excluded.experience, prestige_level = excluded.prestige_level, registration_date = excluded.registration_date, pmc_sessions = excluded.pmc_sessions, pmc_survived = excluded.pmc_survived, pmc_kills = excluded.pmc_kills, pmc_deaths = excluded.pmc_deaths, pmc_killed_pmc = excluded.pmc_killed_pmc, scav_sessions = excluded.scav_sessions, scav_survived = excluded.scav_survived, scav_kills = excluded.scav_kills, scav_deaths = excluded.scav_deaths, scav_killed_pmc = excluded.scav_killed_pmc, skills_json = excluded.skills_json, mastering_json = excluded.mastering_json, achievements_count = excluded.achievements_count, battle_pass_json = excluded.battle_pass_json, seasonal_rewards_completed = excluded.seasonal_rewards_completed, seasonal_rewards_total = excluded.seasonal_rewards_total, quests_completed = excluded.quests_completed, quests_started = excluded.quests_started, quests_failed = excluded.quests_failed, quests_available = excluded.quests_available, quests_total = excluded.quests_total, hideout_areas_built = excluded.hideout_areas_built, hideout_max_level = excluded.hideout_max_level, hideout_total_levels = excluded.hideout_total_levels, inventory_item_count = excluded.inventory_item_count, encyclopedia_count = excluded.encyclopedia_count, health_energy = excluded.health_energy, health_hydration = excluded.health_hydration, traders_unlocked = excluded.traders_unlocked, traders_avg_standing = excluded.traders_avg_standing, insured_items_count = excluded.insured_items_count, wishlist_count = excluded.wishlist_count, notes_count = excluded.notes_count, last_reminder_at = NULL, uploaded_at = excluded.uploaded_at, updated_at = excluded.updated_at
    `).bind(
      context.data.user.id, normalized.displayName, normalized.accountId, normalized.side, normalized.level, normalized.experience, normalized.prestigeLevel, normalized.registrationDate,
      normalized.pmc.Sessions, normalized.pmc.ExitStatus, normalized.pmc.Kills, normalized.pmc.Deaths, normalized.pmc.KilledPmc,
      normalized.scav.Sessions, normalized.scav.ExitStatus, normalized.scav.Kills, normalized.scav.Deaths, normalized.scav.KilledPmc,
      JSON.stringify(normalized.skills), JSON.stringify(normalized.mastering), normalized.achievementsCount, JSON.stringify(normalized.battlePass), normalized.seasonalRewards.completed, normalized.seasonalRewards.total,
      normalized.quests.completed, normalized.quests.started, normalized.quests.failed, normalized.quests.available, normalized.quests.total,
      normalized.hideout.areasBuilt, normalized.hideout.maxLevel, normalized.hideout.totalLevels,
      normalized.inventory.itemCount, normalized.encyclopediaCount,
      normalized.health.energy, normalized.health.hydration, normalized.traders.unlocked, normalized.traders.averageStanding,
      normalized.insuredItemsCount, normalized.wishlistCount, normalized.notesCount, now
    ).run();
    const hoursSincePrevious = previous?.uploaded_at ? Math.round((now - previous.uploaded_at) / 3600) : null;
    const notice = hoursSincePrevious == null
      ? `🆕 **${normalized.displayName}** uploaded their first field report.`
      : `📤 **${normalized.displayName}** updated their field report (${hoursSincePrevious}h since last upload).`;
    context.waitUntil(sendDiscordMessage(context.env.DISCORD_WEBHOOK_URL, notice));
    return jsonResponse({ profile: { ...normalized, uploadedAt: now } });
  } catch { return errorResponse('Could not save the uploaded player profile.', 503); }
}