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

async function handleRequest(request) {
  const url = new URL(request.url);
  const targetUrl = 'https://api.tarkov.dev/graphql';

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
