const API_BASE = '/api';

const api = {
  async getHealth() {
    const response = await fetch(`${API_BASE}/health`);
    if (!response.ok) throw new Error('Failed to fetch health status');
    return response.json();
  },

  async getDocuments() {
    const response = await fetch(`${API_BASE}/documents`);
    if (!response.ok) throw new Error('Failed to fetch documents');
    return response.json();
  },

  async getSheets() {
    const response = await fetch(`${API_BASE}/sheets`);
    if (!response.ok) throw new Error('Failed to fetch sheets');
    return response.json();
  },

  async getWikis() {
    const response = await fetch(`${API_BASE}/wikis`);
    if (!response.ok) throw new Error('Failed to fetch wikis');
    return response.json();
  },

  async getBitables() {
    const response = await fetch(`${API_BASE}/bitables`);
    if (!response.ok) throw new Error('Failed to fetch bitables');
    return response.json();
  },

  async getPEStats(weights = {}) {
    const params = new URLSearchParams(weights);
    const queryString = params.toString();
    const url = `${API_BASE}/pe-stats${queryString ? '?' + queryString : ''}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error('Failed to fetch PE statistics');
    return response.json();
  },

  async getDocument(id) {
    const response = await fetch(`${API_BASE}/documents/${id}`);
    if (!response.ok) throw new Error('Failed to fetch document');
    return response.json();
  },

  async getSheet(id) {
    const response = await fetch(`${API_BASE}/sheets/${id}`);
    if (!response.ok) throw new Error('Failed to fetch sheet');
    return response.json();
  },

  async triggerSync() {
    const response = await fetch(`${API_BASE}/sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    });
    if (!response.ok) throw new Error('Failed to trigger sync');
    return response.json();
  }
};

export default api;
