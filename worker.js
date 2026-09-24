const FALLBACK_ITEMS = [
  { name: 'P90', basePrice: 126000, avg24hPrice: 128500, lastLowPrice: 125000 },
  { name: 'Roubles', basePrice: 100, avg24hPrice: 100, lastLowPrice: 100 },
  { name: 'Salewa', basePrice: 1100, avg24hPrice: 1180, lastLowPrice: 1080 },
  { name: 'Gold Skull', basePrice: 28500, avg24hPrice: 29200, lastLowPrice: 27600 },
  { name: 'M4A1', basePrice: 229000, avg24hPrice: 236500, lastLowPrice: 221000 },
  { name: 'AK-74M', basePrice: 212500, avg24hPrice: 218000, lastLowPrice: 204000 },
  { name: 'Intel', basePrice: 12850, avg24hPrice: 13500, lastLowPrice: 12000 },
  { name: 'Battery', basePrice: 7800, avg24hPrice: 8200, lastLowPrice: 7600 },
  { name: 'Ammo Case', basePrice: 14200, avg24hPrice: 14950, lastLowPrice: 13800 },
  { name: 'Shturman', basePrice: 42500, avg24hPrice: 44200, lastLowPrice: 40600 }
];

addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request));
});

const FRIEND_PLAYER_SAMPLE = {
  aid: 1192376,
  info: {
    nickname: 'KillaFromKmart',
    side: 'Usec',
    experience: 4324835,
    memberCategory: 2,
    selectedMemberCategory: 2,
    prestigeLevel: 0
  },
  pmcStats: {
    eft: {
      totalInGameTime: 10783099,
      overAllCounters: {
        Items: [
          { Key: ['Sessions', 'Pmc'], Value: 192 },
          { Key: ['ExitStatus', 'Survived', 'Pmc'], Value: 119 },
          { Key: ['Kills'], Value: 1487 },
          { Key: ['Deaths'], Value: 51 }
        ]
      }
    }
  },
  scavStats: {
    eft: {
      totalInGameTime: 10783099,
      overAllCounters: {
        Items: [
          { Key: ['Sessions', 'Scav'], Value: 12 },
          { Key: ['Kills'], Value: 19 },
          { Key: ['Deaths'], Value: 4 }
        ]
      }
    }
  },
  battlePassProgress: [{ battlePassId: '6a27da69f3610ccfe5e71ab5', completed: 19, total: 53 }],
  updated: 1790167991492
};

function jsonHeaders() {
  return {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With'
  };
}

function fallbackResponse(message = 'The live Tarkov API is unavailable right now.') {
  return new Response(JSON.stringify({
    data: { items: FALLBACK_ITEMS },
    fallback: true,
    error: message
  }), {
    status: 200,
    headers: jsonHeaders()
  });
}

function extractPlayerPayload(text) {
  if (!text || typeof text !== 'string') return null;

  const patterns = [
    /\{\s*"aid"\s*:/,
    /\{\s*"info"\s*:\s*\{\s*"nickname"/
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;

    const start = text.indexOf(match[0]);
    if (start === -1) continue;

    let depth = 0;
    let inString = false;
    let escape = false;

    for (let i = start; i < text.length; i++) {
      const char = text[i];
      if (inString) {
        if (escape) escape = false;
        else if (char === '\\') escape = true;
        else if (char === '"') inString = false;
        continue;
      }

      if (char === '"') inString = true;
      else if (char === '{') depth++;
      else if (char === '}') {
        depth--;
        if (depth === 0) {
          const candidate = text.slice(start, i + 1);
          try {
            return JSON.parse(candidate);
          } catch (error) {
            return null;
          }
        }
      }
    }
  }

  return null;
}

function buildPlayerSummary(player) {
  const pmcCounters = {};
  const scavCounters = {};

  for (const item of player?.pmcStats?.eft?.overAllCounters?.Items || []) {
    const key = Array.isArray(item.Key) ? item.Key.join(':') : item.Key;
    pmcCounters[key] = item.Value;
  }

  for (const item of player?.scavStats?.eft?.overAllCounters?.Items || []) {
    const key = Array.isArray(item.Key) ? item.Key.join(':') : item.Key;
    scavCounters[key] = item.Value;
  }

  const battlePass = player?.battlePassProgress?.[0] || { completed: 0, total: 0 };

  return {
    aid: player?.aid || null,
    nickname: player?.info?.nickname || null,
    side: player?.info?.side || null,
    experience: player?.info?.experience ?? 0,
    pmcSessions: pmcCounters['Sessions:Pmc'] ?? 0,
    pmcKills: pmcCounters.Kills ?? 0,
    pmcDeaths: pmcCounters.Deaths ?? 0,
    pmcSurvived: pmcCounters['ExitStatus:Survived:Pmc'] ?? 0,
    scavSessions: scavCounters['Sessions:Scav'] ?? 0,
    scavKills: scavCounters.Kills ?? 0,
    scavDeaths: scavCounters.Deaths ?? 0,
    totalPlaytimeSeconds: player?.pmcStats?.eft?.totalInGameTime ?? 0,
    battlePassCompleted: battlePass.completed ?? 0,
    battlePassTotal: battlePass.total ?? 0,
    updated: player?.updated ?? null
  };
}

async function handlePlayerRequest(url) {
  const accountId = url.searchParams.get('accountId');
  const gameMode = url.searchParams.get('gameMode') || 'pve';
  const token = url.searchParams.get('token');

  if (!accountId || !token) {
    return new Response(JSON.stringify({
      ok: false,
      error: 'Missing accountId or token for private player proxy.',
      data: buildPlayerSummary(FRIEND_PLAYER_SAMPLE)
    }), {
      status: 400,
      headers: jsonHeaders()
    });
  }

  try {
    const playerUrl = `https://player.tarkov.dev/account/${accountId}?gameMode=${gameMode}&token=${encodeURIComponent(token)}`;
    const response = await fetch(playerUrl, {
      headers: {
        'Accept': 'text/html,application/json',
        'User-Agent': 'Mozilla/5.0'
      }
    });

    const text = await response.text();

    if (!response.ok) {
      return new Response(JSON.stringify({
        ok: false,
        error: `Private player fetch failed with status ${response.status}`,
        data: buildPlayerSummary(FRIEND_PLAYER_SAMPLE)
      }), {
        status: response.status,
        headers: jsonHeaders()
      });
    }

    const parsed = extractPlayerPayload(text) || FRIEND_PLAYER_SAMPLE;
    return new Response(JSON.stringify({
      ok: true,
      data: buildPlayerSummary(parsed)
    }), {
      status: 200,
      headers: jsonHeaders()
    });
  } catch (error) {
    return new Response(JSON.stringify({
      ok: false,
      error: 'Private player proxy could not fetch profile data.',
      data: buildPlayerSummary(FRIEND_PLAYER_SAMPLE)
    }), {
      status: 200,
      headers: jsonHeaders()
    });
  }
}

async function handlePlayerSearchRequest(url) {
  const nickname = url.searchParams.get('nickname');
  const gameMode = url.searchParams.get('gameMode') || 'regular';
  const token = url.searchParams.get('token');

  if (!nickname || !token) {
    return new Response(JSON.stringify({
      ok: false,
      error: 'Missing nickname or Turnstile token.'
    }), {
      status: 400,
      headers: jsonHeaders()
    });
  }

  try {
    const playerUrl = `https://player.tarkov.dev/name/${encodeURIComponent(nickname)}?gameMode=${encodeURIComponent(gameMode)}&token=${encodeURIComponent(token)}`;
    const response = await fetch(playerUrl, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0'
      }
    });
    const text = await response.text();

    return new Response(text, {
      status: response.status,
      headers: jsonHeaders()
    });
  } catch (error) {
    return new Response(JSON.stringify({
      ok: false,
      error: 'Player name search could not reach the Tarkov player service.'
    }), {
      status: 502,
      headers: jsonHeaders()
    });
  }
}

async function handleRequest(request) {
  const url = new URL(request.url);
  const targetUrl = 'https://api.tarkov.dev/graphql';

  if (url.pathname === '/player') {
    return handlePlayerRequest(url);
  }

  if (url.pathname === '/player/search') {
    return handlePlayerSearchRequest(url);
  }

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: jsonHeaders()
    });
  }

  if (request.method === 'GET') {
    const query = url.searchParams.get('query');
    if (query) {
      return fetchWithQuery(query);
    }

    return new Response(JSON.stringify({
      ok: true,
      message: 'Tarkov worker is online.',
      source: 'cloudflare-worker'
    }), {
      status: 200,
      headers: jsonHeaders()
    });
  }

  return fetchWithQueryBody(await request.text());

  async function fetchWithQueryBody(bodyText) {
    let payload = {};

    if (bodyText) {
      try {
        payload = JSON.parse(bodyText);
      } catch (error) {
        payload = { query: bodyText };
      }
    }

    if (!payload.query) {
      payload.query = `query { items(limit: 5) { name basePrice avg24hPrice lastLowPrice } }`;
    }

    try {
      const response = await fetch(targetUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0'
        },
        body: JSON.stringify(payload)
      });

      const text = await response.text();

      if (response.status === 403 || response.status === 429 || response.status >= 500) {
        return fallbackResponse('The live Tarkov API is unavailable right now.');
      }

      return new Response(text, {
        status: response.status,
        headers: jsonHeaders()
      });
    } catch (error) {
      return fallbackResponse('The live Tarkov API is unavailable right now.');
    }
  }

  async function fetchWithQuery(query) {
    try {
      const response = await fetch(targetUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0'
        },
        body: JSON.stringify({ query })
      });

      const text = await response.text();

      if (response.status === 403 || response.status === 429 || response.status >= 500) {
        return fallbackResponse('The live Tarkov API is unavailable right now.');
      }

      return new Response(text, {
        status: response.status,
        headers: jsonHeaders()
      });
    } catch (error) {
      return fallbackResponse('The live Tarkov API is unavailable right now.');
    }
  }
}
