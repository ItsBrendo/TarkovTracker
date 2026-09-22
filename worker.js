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

      return new Response(text, {
        status: response.status,
        headers: jsonHeaders()
      });
    } catch (error) {
      return new Response(JSON.stringify({
        errors: [{ message: 'Unable to reach tarkov.dev from the worker.' }]
      }), {
        status: 502,
        headers: jsonHeaders()
      });
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

      return new Response(text, {
        status: response.status,
        headers: jsonHeaders()
      });
    } catch (error) {
      return new Response(JSON.stringify({
        errors: [{ message: 'Unable to reach tarkov.dev from the worker.' }]
      }), {
        status: 502,
        headers: jsonHeaders()
      });
    }
  }
}
