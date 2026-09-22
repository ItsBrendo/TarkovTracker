addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
  const url = new URL(request.url);
  const targetUrl = 'https://api.tarkov.dev/graphql';

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization'
      }
    });
  }

  const incoming = new Request(targetUrl, {
    method: request.method,
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: request.method === 'POST' ? await request.text() : undefined
  });

  const response = await fetch(incoming);
  const text = await response.text();

  return new Response(text, {
    status: response.status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    }
  });
}
