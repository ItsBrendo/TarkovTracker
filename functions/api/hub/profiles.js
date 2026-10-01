import { errorResponse, jsonResponse, readJson, sameOrigin } from '../../_lib/auth.js';

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
  return {
    displayName,
    accountId: numberOrNull(profile.aid, true),
    side: safeText(info.side, 16),
    experience: numberOrNull(info.experience, true),
    prestigeLevel: numberOrNull(info.prestigeLevel, true),
    pmc, scav, skills, mastering,
    achievementsCount: profile.achievements && typeof profile.achievements === 'object' ? Object.keys(profile.achievements).length : 0,
    battlePass,
    seasonalRewards: { completed: numberOrNull(rewards.completed, true), total: numberOrNull(rewards.total, true) }
  };
}

function publicProfile(row) {
  return {
    userId: row.user_id, displayName: row.display_name, accountId: row.account_id, side: row.side,
    experience: row.experience, prestigeLevel: row.prestige_level,
    pmc: { sessions: row.pmc_sessions, survived: row.pmc_survived, kills: row.pmc_kills, deaths: row.pmc_deaths, killedPmc: row.pmc_killed_pmc },
    scav: { sessions: row.scav_sessions, survived: row.scav_survived, kills: row.scav_kills, deaths: row.scav_deaths, killedPmc: row.scav_killed_pmc },
    skills: JSON.parse(row.skills_json), mastering: JSON.parse(row.mastering_json), achievementsCount: row.achievements_count,
    battlePass: JSON.parse(row.battle_pass_json), seasonalRewards: { completed: row.seasonal_rewards_completed, total: row.seasonal_rewards_total }, uploadedAt: row.uploaded_at
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
    await context.env.DB.prepare(`
      INSERT INTO player_profiles (user_id, display_name, account_id, side, experience, prestige_level, pmc_sessions, pmc_survived, pmc_kills, pmc_deaths, pmc_killed_pmc, scav_sessions, scav_survived, scav_kills, scav_deaths, scav_killed_pmc, skills_json, mastering_json, achievements_count, battle_pass_json, seasonal_rewards_completed, seasonal_rewards_total, uploaded_at, updated_at)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22, ?23, ?23)
      ON CONFLICT(user_id) DO UPDATE SET display_name = excluded.display_name, account_id = excluded.account_id, side = excluded.side, experience = excluded.experience, prestige_level = excluded.prestige_level, pmc_sessions = excluded.pmc_sessions, pmc_survived = excluded.pmc_survived, pmc_kills = excluded.pmc_kills, pmc_deaths = excluded.pmc_deaths, pmc_killed_pmc = excluded.pmc_killed_pmc, scav_sessions = excluded.scav_sessions, scav_survived = excluded.scav_survived, scav_kills = excluded.scav_kills, scav_deaths = excluded.scav_deaths, scav_killed_pmc = excluded.scav_killed_pmc, skills_json = excluded.skills_json, mastering_json = excluded.mastering_json, achievements_count = excluded.achievements_count, battle_pass_json = excluded.battle_pass_json, seasonal_rewards_completed = excluded.seasonal_rewards_completed, seasonal_rewards_total = excluded.seasonal_rewards_total, uploaded_at = excluded.uploaded_at, updated_at = excluded.updated_at
    `).bind(
      context.data.user.id, normalized.displayName, normalized.accountId, normalized.side, normalized.experience, normalized.prestigeLevel,
      normalized.pmc.Sessions, normalized.pmc.ExitStatus, normalized.pmc.Kills, normalized.pmc.Deaths, normalized.pmc.KilledPmc,
      normalized.scav.Sessions, normalized.scav.ExitStatus, normalized.scav.Kills, normalized.scav.Deaths, normalized.scav.KilledPmc,
      JSON.stringify(normalized.skills), JSON.stringify(normalized.mastering), normalized.achievementsCount, JSON.stringify(normalized.battlePass), normalized.seasonalRewards.completed, normalized.seasonalRewards.total, now
    ).run();
    return jsonResponse({ profile: { ...normalized, uploadedAt: now } });
  } catch { return errorResponse('Could not save the uploaded player profile.', 503); }
}