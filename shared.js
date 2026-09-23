window.TarkovTracker = {
  API_URL: 'https://api.tarkov.dev/graphql',
  REST_API_URL: 'https://json.tarkov.dev',
  PROXY_URL: 'https://tarkovtracker.brendob99.workers.dev',
  lastError: '',
  fallbackItems: [
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
  ],

  formatPrice(value) {
    if (value === null || value === undefined) return '—';
    return `${Number(value).toLocaleString()} ₽`;
  },

  matchesFilter(item, filterText) {
    if (!filterText) return true;
    const term = filterText.toLowerCase();
    return (item.name || '').toLowerCase().includes(term);
  },

  normalizeItems(items = []) {
    const invalidNames = new Set(['can of dr pepper']);

    return (Array.isArray(items) ? items : []).filter((item) => {
      if (!item || typeof item !== 'object') return false;
      const name = String(item.name || '').trim();
      if (!name) return false;
      if (invalidNames.has(name.toLowerCase())) return false;
      return true;
    });
  },

  async fetchSalewaCurrentPrice() {
    const salewaFallback = this.fallbackItems.find((item) => item.name && item.name.toLowerCase() === 'salewa') || null;

    try {
      const response = await fetch(`${this.REST_API_URL}/regular/items`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        this.lastError = `Salewa fetch failed with status ${response.status}`;
        return salewaFallback;
      }

      const items = await response.json();
      const itemMap = items?.data?.items && typeof items.data.items === 'object' ? Object.values(items.data.items) : [];
      const list = Array.isArray(items) ? items : Array.isArray(items?.data) ? items.data : Array.isArray(items?.items) ? items.items : itemMap;
      const salewa = list.find((item) => item && typeof item.name === 'string' && item.name.toLowerCase() === 'salewa');
      const salewaVariant = list.find((item) => item && typeof item.name === 'string' && item.name.toLowerCase().includes('salewa'));
      const matchedItem = salewa || salewaVariant;

      if (!matchedItem) {
        this.lastError = 'Salewa item was not found in the live API response.';
        return salewaFallback;
      }

      this.lastError = '';
      return matchedItem;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown fetch error';
      this.lastError = message;
      return salewaFallback;
    }
  },

  async fetchPlayerSummary(accountId, gameMode = 'pve', token = '') {
    const params = new URLSearchParams({ accountId, gameMode });
    if (token) params.set('token', token);

    const response = await fetch(`${this.PROXY_URL}/player?${params.toString()}`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      const message = payload?.error || `Player profile request failed with status ${response.status}`;
      this.lastError = message;
      return null;
    }

    const payload = await response.json();
    this.lastError = payload?.error || '';
    return payload?.data || payload || null;
  },

  async fetchLiveSamples() {
    const endpoints = [
      { label: 'items', url: `${this.REST_API_URL}/regular/items` },
      { label: 'maps', url: `${this.REST_API_URL}/regular/maps` },
      { label: 'tasks', url: `${this.REST_API_URL}/regular/tasks` }
    ];

    const results = [];

    for (const endpoint of endpoints) {
      try {
        const response = await fetch(endpoint.url, {
          method: 'GET',
          headers: { Accept: 'application/json' }
        });

        if (!response.ok) {
          results.push({ source: endpoint.label, error: `HTTP ${response.status}` });
          continue;
        }

        const payload = await response.json();
        const map = payload?.data && typeof payload.data === 'object' ? payload.data : {};
        const list = Array.isArray(payload) ? payload : Array.isArray(map[endpoint.label]) ? map[endpoint.label] : Object.values(map[endpoint.label] || {});

        const sample = list.slice(0, 5).map((entry) => ({
          name: entry?.name || entry?.title || entry?.normalizedName || 'Unnamed',
          basePrice: entry?.basePrice ?? entry?.avg24hPrice ?? entry?.lastLowPrice ?? null,
          source: endpoint.label
        }));

        results.push({ source: endpoint.label, items: sample, total: list.length || sample.length });
      } catch (error) {
        results.push({ source: endpoint.label, error: error instanceof Error ? error.message : 'Unknown fetch error' });
      }
    }

    return results;
  },

  async fetchItems() {
    const query = `
      query {
        items(limit: 10) {
          name
          basePrice
          avg24hPrice
          lastLowPrice
        }
      }
    `;

    try {
      const response = await fetch(this.PROXY_URL || this.API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({ query })
      });

      if (!response.ok) {
        const message = `API request failed with status ${response.status}`;
        this.lastError = message;
        return this.fallbackItems;
      }

      const payload = await response.json();
      const fallbackReason = payload?.fallback === true ? (payload.error || 'The live Tarkov API is unavailable.') : null;

      if (fallbackReason) {
        this.lastError = fallbackReason;
        return this.fallbackItems;
      }

      if (payload.errors && payload.errors.length) {
        const firstErrorMessage = payload.errors[0].message || 'Unknown GraphQL error';
        if (/unavailable|blocked|security service|cloudflare|forbidden/i.test(firstErrorMessage)) {
          this.lastError = 'The live Tarkov API is unavailable right now.';
          return this.fallbackItems;
        }
        this.lastError = firstErrorMessage;
        return this.fallbackItems;
      }

      const items = this.normalizeItems(payload.data?.items || this.fallbackItems);
      if (!items.length) {
        this.lastError = 'The live Tarkov API returned no valid items.';
        return this.fallbackItems;
      }

      this.lastError = '';
      return items;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown fetch error';
      this.lastError = message;
      return this.fallbackItems;
    }
  }
};
