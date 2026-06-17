export let CONFIG = {
  apiUrl: localStorage.getItem('ha_worker_url') || '',
  apiKey: localStorage.getItem('ha_worker_key') || '',
  energyRate: parseFloat(localStorage.getItem('ha_energy_rate')) || 25.0,
  navidromeUrl: localStorage.getItem('navidrome_url') || '',
  navidromeUser: localStorage.getItem('navidrome_user') || '',
  navidromePass: localStorage.getItem('navidrome_pass') || ''
};

export const LOCAL_API_URL = window.location.port === '8000' ? '' : 'http://127.0.0.1:8000';

export function updateConfig(url, key, rate, navidromeUrl = '', navidromeUser = '', navidromePass = '') {
  CONFIG.apiUrl = url;
  CONFIG.apiKey = key;
  CONFIG.energyRate = rate;
  CONFIG.navidromeUrl = navidromeUrl;
  CONFIG.navidromeUser = navidromeUser;
  CONFIG.navidromePass = navidromePass;
  localStorage.setItem('ha_worker_url', url);
  localStorage.setItem('ha_worker_key', key);
  localStorage.setItem('ha_energy_rate', rate);
  localStorage.setItem('navidrome_url', navidromeUrl);
  localStorage.setItem('navidrome_user', navidromeUser);
  localStorage.setItem('navidrome_pass', navidromePass);
}

export async function authenticatedFetch(endpoint, options = {}) {
  if (!CONFIG.apiUrl || !CONFIG.apiKey) {
    throw new Error('Not configured');
  }
  
  const headers = {
    'Authorization': `Bearer ${CONFIG.apiKey}`,
    'Content-Type': 'application/json'
  };
  
  const fetchOptions = {
    method: options.method || 'GET',
    headers: headers
  };
  
  if (options.body) {
    fetchOptions.body = options.body;
  }
  
  const response = await fetch(`${CONFIG.apiUrl}${endpoint}`, fetchOptions);
  
  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('Unauthorized');
    }
    const errText = await response.text();
    throw new Error(errText || `HTTP ${response.status}`);
  }
  
  return await response.json();
}

export let SERVER_LAN_IP = '127.0.0.1';

export async function initServerLanIp() {
  try {
    const res = await fetch(`${LOCAL_API_URL}/api/sonos/server_ip`);
    if (res.ok) {
      const data = await res.json();
      SERVER_LAN_IP = data.server_ip;
      console.log('Detected server LAN IP:', SERVER_LAN_IP);
      return;
    }
  } catch (e) {
    console.warn('Could not fetch server LAN IP, using fallback:', e);
  }
  // Fallback to hostname if it's a real LAN IP/domain
  const host = window.location.hostname;
  if (host && host !== 'localhost' && host !== '127.0.0.1') {
    SERVER_LAN_IP = host;
  }
}

export function getServerLanIp() {
  return SERVER_LAN_IP;
}
