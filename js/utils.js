export function formatContainerName(key) {
  const mapping = {
    'homepage': 'Homepage',
    'stirling_pdf': 'Stirling PDF',
    'immich': 'Immich',
    'qbittorrent': 'qBittorrent',
    'home_assistant': 'Home Assistant',
    'sicherung': 'Sicherung',
    'emby': 'Emby',
    'lidarr': 'Lidarr',
    'sabnzbd': 'SABnzbd',
    'prowlarr': 'Prowlarr',
    'radarr': 'Radarr',
    'jellyfin': 'Jellyfin',
    'sonarr': 'Sonarr',
    'cloudfared': 'Cloudflared'
  };
  return mapping[key] || key;
}

export function formatSecondsUptime(secondsVal) {
  const seconds = parseInt(secondsVal);
  if (isNaN(seconds) || seconds <= 0) return '--';
  
  const d = Math.floor(seconds / (3600*24));
  const h = Math.floor(seconds % (3600*24) / 3600);
  const m = Math.floor(seconds % 3600 / 60);
  
  let result = [];
  if (d > 0) result.push(`${d}d`);
  if (h > 0) result.push(`${h}h`);
  if (m > 0 || result.length === 0) result.push(`${m}m`);
  
  return result.join(' ');
}
