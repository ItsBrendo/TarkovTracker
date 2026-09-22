window.TarkovTracker = {
  API_URL: 'https://api.tarkov.dev/graphql',
  PROXY_URL: 'https://tarkovtracker.brendob99.workers.dev',
  fallbackItems: [
    { name: 'P90', basePrice: 126000, avg24hPrice: 128500, lastLowPrice: 125000 },
    { name: 'Roubles', basePrice: 100, avg24hPrice: 100, lastLowPrice: 100 },
    { name: 'Salewa', basePrice: 1100, avg24hPrice: 1180, lastLowPrice: 1080 },
    { name: 'Gold Skull', basePrice: 28500, avg24hPrice: 29200, lastLowPrice: 27600 },
    { name: 'Can of Dr Pepper', basePrice: 3200, avg24hPrice: 3400, lastLowPrice: 3100 },
    { name: 'M4A1', basePrice: 229000, avg24hPrice: 236500, lastLowPrice: 221000 },
    { name: 'AK-74M', basePrice: 212500, avg24hPrice: 218000, lastLowPrice: 204000 },
    { name: 'Intel', basePrice: 12850, avg24hPrice: 13500, lastLowPrice: 12000 },
    { name: 'Battery', basePrice: 7800, avg24hPrice: 8200, lastLowPrice: 7600 },
    { name: 'Ammo Case', basePrice: 14200, avg24hPrice: 14950, lastLowPrice: 13800 }
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

    const response = await fetch(this.PROXY_URL || this.API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({ query })
    });

    if (!response.ok) {
      const fallbackCode = [403, 429, 502, 503].includes(response.status);
      if (fallbackCode) {
        return this.fallbackItems;
      }
      throw new Error(`API request failed with status ${response.status}`);
    }

    const payload = await response.json();
    if (payload.errors && payload.errors.length) {
      const firstErrorMessage = payload.errors[0].message || 'Unknown GraphQL error';
      if (/unavailable|blocked|security service|cloudflare|forbidden/i.test(firstErrorMessage)) {
        return this.fallbackItems;
      }
      throw new Error(firstErrorMessage);
    }

    return payload.data?.items || this.fallbackItems;
  }
};
