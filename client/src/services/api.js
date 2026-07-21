const API_BASE = '/api';

const api = {
  async getPEStats(weights = {}) {
    const params = new URLSearchParams(weights);
    const queryString = params.toString();
    const url = `${API_BASE}/pe-stats${queryString ? '?' + queryString : ''}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error('Failed to fetch PE statistics');
    return response.json();
  },

  async getPEGantt() {
    const response = await fetch(`${API_BASE}/pe-gantt`);
    if (!response.ok) throw new Error('Failed to fetch PE Gantt data');
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
