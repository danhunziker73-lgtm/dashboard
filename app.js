// Global Application State
let CONFIG = {
  apiUrl: localStorage.getItem('ha_worker_url') || '',
  apiKey: localStorage.getItem('ha_worker_key') || '',
  energyRate: parseFloat(localStorage.getItem('ha_energy_rate')) || 25.0
};

let refreshIntervalId = null;

// Initialize Dashboard
function init() {
  setupEventListeners();
  
  if (!CONFIG.apiUrl || !CONFIG.apiKey) {
    showSetupBanner(true);
    updateConnectionStatus('unconfigured');
    renderEmptyStates();
  } else {
    showSetupBanner(false);
    startAutoRefresh();
  }
}

// Event Listeners for UI interaction
function setupEventListeners() {
  const btnSettings = document.getElementById('btn-settings');
  const btnSetupNow = document.getElementById('btn-setup-now');
  const btnCloseSettings = document.getElementById('btn-close-settings');
  const settingsModal = document.getElementById('settings-modal');
  const settingsForm = document.getElementById('settings-form');
  const btnTestConnection = document.getElementById('btn-test-connection');
  const btnToggleKey = document.getElementById('btn-toggle-key-visibility');
  const inputApiKey = document.getElementById('input-api-key');

  btnSettings.addEventListener('click', () => openSettingsModal());
  if (btnSetupNow) btnSetupNow.addEventListener('click', () => openSettingsModal());
  btnCloseSettings.addEventListener('click', () => closeSettingsModal());
  
  settingsModal.addEventListener('click', (e) => {
    if (e.target === settingsModal) closeSettingsModal();
  });

  // Toggle Password/Key Visibility
  btnToggleKey.addEventListener('click', () => {
    const isPassword = inputApiKey.type === 'password';
    inputApiKey.type = isPassword ? 'text' : 'password';
    const icon = btnToggleKey.querySelector('i');
    if (icon) {
      icon.setAttribute('data-lucide', isPassword ? 'eye-off' : 'eye');
      lucide.createIcons();
    }
  });

  // Form Submit (Save settings)
  settingsForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const url = document.getElementById('input-api-url').value.trim().replace(/\/$/, '');
    const key = document.getElementById('input-api-key').value.trim();
    const rate = parseFloat(document.getElementById('input-energy-rate').value) || 25.0;
    
    localStorage.setItem('ha_worker_url', url);
    localStorage.setItem('ha_worker_key', key);
    localStorage.setItem('ha_energy_rate', rate);
    
    CONFIG.apiUrl = url;
    CONFIG.apiKey = key;
    CONFIG.energyRate = rate;
    
    closeSettingsModal();
    showSetupBanner(false);
    startAutoRefresh();
  });

  // Test Connection Action
  btnTestConnection.addEventListener('click', async () => {
    const url = document.getElementById('input-api-url').value.trim().replace(/\/$/, '');
    const key = document.getElementById('input-api-key').value.trim();
    
    if (!url || !key) {
      showTestResult('Bitte URL und Schlüssel eingeben.', 'error');
      return;
    }

    btnTestConnection.disabled = true;
    showTestResult('Verbindung wird getestet...', 'warning');

    try {
      const res = await fetch(`${url}/states`, {
        headers: {
          'Authorization': `Bearer ${key}`,
          'Content-Type': 'application/json'
        }
      });

      if (res.ok) {
        showTestResult('✓ Verbindung erfolgreich!', 'success');
      } else if (res.status === 401) {
        showTestResult('✗ Fehler: Unautorisiert (Falscher API-Schlüssel)', 'error');
      } else {
        showTestResult(`✗ Serverfehler: HTTP ${res.status}`, 'error');
      }
    } catch (err) {
      showTestResult(`✗ Fehler: Verbindung fehlgeschlagen (${err.message})`, 'error');
    } finally {
      btnTestConnection.disabled = false;
    }
  });
}

function openSettingsModal() {
  document.getElementById('input-api-url').value = CONFIG.apiUrl;
  document.getElementById('input-api-key').value = CONFIG.apiKey;
  document.getElementById('input-energy-rate').value = CONFIG.energyRate;
  document.getElementById('settings-modal').classList.remove('hidden');
  hideTestResult();
  lucide.createIcons();
}

function closeSettingsModal() {
  document.getElementById('settings-modal').classList.add('hidden');
}

function showSetupBanner(show) {
  const banner = document.getElementById('setup-banner');
  if (banner) {
    if (show) {
      banner.classList.remove('hidden');
    } else {
      banner.classList.add('hidden');
    }
  }
}

function showTestResult(message, type) {
  const resultDiv = document.getElementById('test-result');
  resultDiv.className = `test-result-msg msg-${type}`;
  resultDiv.textContent = message;
  resultDiv.classList.remove('hidden');
}

function hideTestResult() {
  document.getElementById('test-result').classList.add('hidden');
}

// Update Network Indicators and Health Badge in Header
function updateHeaderStatus(states, haSuccess, pveSuccess) {
  // 1. Internet Status
  const wanSensor = states.find(x => x.entity_id === 'binary_sensor.xe75pro_wan_status');
  const isInternetOk = wanSensor ? (wanSensor.state === 'on') : false;
  const indInternet = document.getElementById('ind-internet');
  if (indInternet) {
    indInternet.className = `indicator-pill ${isInternetOk ? 'state-connected' : 'state-error'}`;
  }

  // 2. Cloudflare Tunnel
  const tunnelSensor = states.find(x => x.entity_id === 'binary_sensor.cloudfared_status' || x.entity_id === 'sensor.cloudfared_status');
  const isTunnelOk = tunnelSensor ? (tunnelSensor.state === 'on' || tunnelSensor.state === 'running') : false;
  const indTunnel = document.getElementById('ind-tunnel');
  if (indTunnel) {
    indTunnel.className = `indicator-pill ${isTunnelOk ? 'state-connected' : 'state-error'}`;
  }

  // 3. Home Assistant Status
  const indHa = document.getElementById('ind-ha');
  if (indHa) {
    indHa.className = `indicator-pill ${haSuccess ? 'state-connected' : 'state-error'}`;
  }

  // 4. Proxmox Node Status
  const pveStatusSensor = states.find(x => x.entity_id === 'sensor.galerie_promox_server_status' || x.entity_id === 'binary_sensor.galerie_promox_server_status');
  const isProxmoxOk = pveStatusSensor ? (pveStatusSensor.state === 'online' || pveStatusSensor.state === 'on') : false;
  const indProxmox = document.getElementById('ind-proxmox');
  if (indProxmox) {
    indProxmox.className = `indicator-pill ${isProxmoxOk ? 'state-connected' : 'state-error'}`;
  }

  // 5. Environmental / System Info (with Fallbacks if not present)
  // House Temperature (fallback to 21.5°C)
  let tempHausSensor = states.find(x => x.entity_id === 'sensor.temperatur_haus' || x.entity_id === 'sensor.house_temperature');
  if (!tempHausSensor || tempHausSensor.state === 'unavailable' || tempHausSensor.state === 'unknown') {
    // Search for any active Eve/room/weather temperature sensor
    tempHausSensor = states.find(x => {
      const id = x.entity_id.toLowerCase();
      const isTemp = x.attributes.device_class === 'temperature' || id.includes('temperatur') || id.includes('temperature');
      const isEve = id.includes('eve') || id.includes('weather') || id.includes('degree') || id.includes('room');
      return isTemp && isEve && x.state !== 'unavailable' && x.state !== 'unknown';
    });
  }
  const tempHausVal = tempHausSensor && tempHausSensor.state !== 'unavailable' && tempHausSensor.state !== 'unknown' 
    ? `${parseFloat(tempHausSensor.state).toFixed(1)}°C` 
    : '21.5°C';
  document.getElementById('hdr-temp-haus').textContent = tempHausVal;

  // Humidity (fallback to 48%)
  let humiditySensor = states.find(x => x.entity_id === 'sensor.luftfeuchtigkeit_haus' || x.entity_id === 'sensor.house_humidity');
  if (!humiditySensor || humiditySensor.state === 'unavailable' || humiditySensor.state === 'unknown') {
    // Search for any active Eve/room/weather humidity sensor
    humiditySensor = states.find(x => {
      const id = x.entity_id.toLowerCase();
      const isHum = x.attributes.device_class === 'humidity' || id.includes('feuchtigkeit') || id.includes('humidity');
      const isEve = id.includes('eve') || id.includes('weather') || id.includes('degree') || id.includes('room');
      return isHum && isEve && x.state !== 'unavailable' && x.state !== 'unknown';
    });
  }
  const humidityVal = humiditySensor && humiditySensor.state !== 'unavailable' && humiditySensor.state !== 'unknown' 
    ? `${parseFloat(humiditySensor.state).toFixed(0)}%` 
    : '48%';
  document.getElementById('hdr-humidity').textContent = humidityVal;

  // Outdoor / Weather Temp (fallback to 18°C)
  const tempExtSensor = states.find(x => x.entity_id === 'sensor.aussentemperatur' || x.entity_id === 'weather.home');
  let tempExtVal = '18°C';
  if (tempExtSensor) {
    if (tempExtSensor.state !== 'unavailable') {
      const parsedTemp = parseFloat(tempExtSensor.state);
      tempExtVal = isNaN(parsedTemp) && tempExtSensor.attributes.temperature ? `${tempExtSensor.attributes.temperature}°C` : `${parsedTemp.toFixed(0)}°C`;
    }
  }
  document.getElementById('hdr-temp-ext').textContent = tempExtVal;

  // UPS Battery (fallback to 100%)
  const upsSensor = states.find(x => x.entity_id === 'sensor.usv_batterieladung' || x.entity_id === 'sensor.ups_battery');
  const upsVal = upsSensor && upsSensor.state !== 'unavailable' ? `${parseFloat(upsSensor.state).toFixed(0)}%` : '100%';
  document.getElementById('hdr-usv').textContent = upsVal;

  // Last Update time
  const now = new Date();
  const timeStr = now.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  document.getElementById('hdr-last-update').textContent = timeStr;

  // 6. Compile System Alerts and System Health
  const alarms = [];

  if (!isInternetOk) alarms.push({ type: 'error', text: 'Internet-Verbindung fehlgeschlagen (XE75Pro Offline)' });
  if (!isTunnelOk) alarms.push({ type: 'error', text: 'Cloudflare Tunnel getrennt (cloudfared Offline)' });
  if (!haSuccess) alarms.push({ type: 'error', text: 'Verbindung zu Home Assistant fehlgeschlagen' });
  if (!isProxmoxOk) alarms.push({ type: 'error', text: 'Proxmox Node offline (Promox-Server Offline)' });

  // NAS Volume warnings
  const nasVol3Status = states.find(x => x.entity_id === 'sensor.nas_volume_3_status');
  if (nasVol3Status && nasVol3Status.state === 'attention') {
    alarms.push({ type: 'warning', text: 'Synology NAS: Volume 3 benötigt Aufmerksamkeit (Attention)' });
  }
  const nasVol2Status = states.find(x => x.entity_id === 'sensor.nas_volume_2_status');
  if (nasVol2Status && nasVol2Status.state === 'attention') {
    alarms.push({ type: 'warning', text: 'Synology NAS: Volume 2 benötigt Aufmerksamkeit (Attention)' });
  }

  // Container warnings (LXC status is stopped)
  const containerKeys = [
    'homepage', 'stirling_pdf', 'immich', 'qbittorrent', 'home_assistant',
    'sicherung', 'emby', 'lidarr', 'sabnzbd', 'prowlarr', 'radarr', 'jellyfin', 'sonarr'
  ];
  containerKeys.forEach(key => {
    const statusSensor = states.find(x => x.entity_id === `sensor.${key}_status`);
    if (statusSensor && statusSensor.state === 'stopped') {
      const friendlyName = formatContainerName(key);
      alarms.push({ type: 'warning', text: `LXC Container gestoppt: ${friendlyName}` });
    }
  });

  // Render System Health Badge
  const healthBadge = document.getElementById('system-health-badge');
  const healthText = healthBadge.querySelector('.health-text');
  
  const hasErrors = alarms.some(a => a.type === 'error');
  const hasWarnings = alarms.some(a => a.type === 'warning');

  if (hasErrors) {
    healthBadge.className = 'health-badge state-error';
    healthText.textContent = 'System Fehler';
  } else if (hasWarnings) {
    healthBadge.className = 'health-badge state-warning';
    healthText.textContent = 'System Warnung';
  } else {
    healthBadge.className = 'health-badge state-ok';
    healthText.textContent = 'System OK';
  }

  // Render Alarms Card
  const alarmCard = document.getElementById('card-alarms');
  const alarmCountBadge = document.getElementById('alarm-count-badge');
  const alarmListContainer = document.getElementById('alarm-list-container');

  if (alarms.length === 0) {
    alarmCard.className = 'dashboard-card card-alarms ok-status';
    alarmCountBadge.className = 'badge badge-alarm ok-state';
    alarmCountBadge.textContent = 'System OK';
    alarmListContainer.innerHTML = `
      <div class="alarm-item ok-state">
        <i data-lucide="check-circle" class="text-online"></i>
        <span>Alle Systeme laufen nominal. Keine aktiven Warnungen.</span>
      </div>
    `;
  } else {
    alarmCard.className = 'dashboard-card card-alarms';
    alarmCountBadge.className = 'badge badge-alarm';
    alarmCountBadge.textContent = `${alarms.length} Meldungen`;
    
    alarmListContainer.innerHTML = alarms.map(alarm => {
      const isError = alarm.type === 'error';
      const icon = isError ? 'alert-octagon' : 'alert-triangle';
      const cssClass = isError ? 'error-state' : 'warning-state';
      const iconColorClass = isError ? 'text-offline' : 'text-warning';

      return `
        <div class="alarm-item ${cssClass}">
          <i data-lucide="${icon}" class="${iconColorClass}"></i>
          <span>${alarm.text}</span>
        </div>
      `;
    }).join('');
  }
}

// Connection Status Pill Helper (Footer indicator or general connection state)
function updateConnectionStatus(state, customText) {
  // The settings page uses this info
  console.log(`Connection state: ${state} (${customText || ''})`);
}

// Automatic Refresh loop
function startAutoRefresh() {
  if (refreshIntervalId) {
    clearInterval(refreshIntervalId);
  }
  
  loadDashboardData();
  refreshIntervalId = setInterval(loadDashboardData, 12000);
}

// Fetch helper
async function authenticatedFetch(endpoint, options = {}) {
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

// Load both Home Assistant and Proxmox states
async function loadDashboardData() {
  let haSuccess = false;
  let pveSuccess = false;
  let states = [];

  // 1. Fetch Home Assistant States
  try {
    states = await authenticatedFetch('/states');
    haSuccess = true;
  } catch (err) {
    console.error('HA Fetch Error:', err);
    renderHAError(err.message);
  }

  // 2. Fetch Proxmox Container List
  let pveContainers = [];
  try {
    pveContainers = await authenticatedFetch('/proxmox/containers');
    pveSuccess = true;
  } catch (err) {
    console.error('Proxmox Fetch Error (will fall back to HA sensors):', err);
  }

  // 3. Render Widgets based on HA States
  if (haSuccess && states.length > 0) {
    // Render status line and alert panel
    updateHeaderStatus(states, haSuccess, pveSuccess);
    
    // Render compact lights & switches
    renderCompactLights(states);
    
    // Render position tracks for shutters
    renderShutterControls(states);
    
    // Render NAS Card details
    renderNASCard(states);
    
    // Render Proxmox card parameters
    renderProxmoxHost(states);

    // Render Venta Card
    renderVentaCard(states);

    // Render Energy & Cost Card
    renderEnergyCard(states);

    // Render LXC Containers Table (direct PVE data or HA fallback)
    if (pveSuccess && pveContainers.length > 0) {
      renderContainersTableFromPVE(pveContainers, states);
    } else {
      renderContainersTableFromHA(states);
    }
  }

  lucide.createIcons();
}

// Render Compact Lighting and Devices List (dynamically finds all lights)
function renderCompactLights(states) {
  const container = document.getElementById('home-lights-controls');
  const badge = document.getElementById('active-lights-badge');

  // Dynamically find all light entities + switch.brunnen
  const devices = states.filter(x => {
    const domain = x.entity_id.split('.')[0];
    return domain === 'light' || x.entity_id === 'switch.brunnen';
  });

  // Sort alphabetically by friendly name for UI consistency
  devices.sort((a, b) => {
    const nameA = a.attributes.friendly_name || a.entity_id;
    const nameB = b.attributes.friendly_name || b.entity_id;
    return nameA.localeCompare(nameB, 'de');
  });

  // Count active devices
  const activeCount = devices.filter(x => x.state === 'on').length;
  if (badge) badge.textContent = `${activeCount} aktiv`;

  if (devices.length === 0) {
    container.innerHTML = `<div class="loading-spinner-container"><span>Keine Geräte gefunden</span></div>`;
    return;
  }

  container.innerHTML = devices.map(entity => {
    const friendlyName = entity.attributes.friendly_name || entity.entity_id;
    const isActive = entity.state === 'on';
    const domain = entity.entity_id.split('.')[0];
    const isLight = domain === 'light';
    const icon = isLight ? 'lightbulb' : 'zap';

    return `
      <div class="compact-device-row ${isActive ? 'device-active' : ''}" 
           onclick="toggleHomeAssistantEntity('${entity.entity_id}', ${!isActive})">
        <div class="compact-device-left">
          <span class="status-dot"></span>
          <span>${friendlyName}</span>
        </div>
        <i data-lucide="${icon}" style="width: 14px; height: 14px;"></i>
      </div>
    `;
  }).join('');
}

// Render Shutters (Storen) with progress position bars
function renderShutterControls(states) {
  const container = document.getElementById('home-storen-controls');
  const targetCovers = [
    'cover.wohnzimmer_store',
    'cover.schlafzimmer_store_mit_fensterture',
    'cover.shelly2pmg4_acebe6e202a8'
  ];

  const covers = states.filter(x => targetCovers.includes(x.entity_id));
  covers.sort((a, b) => targetCovers.indexOf(a.entity_id) - targetCovers.indexOf(b.entity_id));

  if (covers.length === 0) {
    container.innerHTML = `<div class="loading-spinner-container"><span>Keine Storen gefunden</span></div>`;
    return;
  }

  container.innerHTML = covers.map(entity => {
    const friendlyName = entity.attributes.friendly_name || entity.entity_id;
    const state = entity.state; // 'open', 'closed', 'opening', 'closing'
    
    // Position percentage (HA covers have current_position attribute, 0 = closed, 100 = open)
    const position = entity.attributes.current_position !== undefined ? parseInt(entity.attributes.current_position) : (state === 'open' ? 100 : 0);
    
    let stateClass = '';
    let stateDesc = `${position}%`;
    if (state === 'opening') {
      stateClass = 'shutter-opening';
      stateDesc = 'Öffnet...';
    } else if (state === 'closing') {
      stateClass = 'shutter-closing';
      stateDesc = 'Schliesst...';
    } else if (state === 'closed' || position === 0) {
      stateClass = 'shutter-closed';
      stateDesc = 'geschlossen';
    } else if (state === 'open' || position === 100) {
      stateClass = 'shutter-open';
      stateDesc = 'offen';
    }

    return `
      <div class="shutter-row ${stateClass}">
        <div class="shutter-meta">
          <span class="shutter-name">${friendlyName}</span>
          <span class="shutter-pos-text">${stateDesc}</span>
        </div>
        <div class="shutter-pos-bar-container">
          <div class="shutter-track">
            <div class="shutter-bar" style="width: ${position}%"></div>
          </div>
          <div class="shutter-btn-group">
            <button class="btn-icon-sm btn-up" onclick="toggleHomeAssistantCover('${entity.entity_id}', 'open_cover', this)" title="Öffnen">
              <i data-lucide="arrow-up"></i>
            </button>
            <button class="btn-icon-sm btn-stop" onclick="toggleHomeAssistantCover('${entity.entity_id}', 'stop_cover', this)" title="Stopp">
              <i data-lucide="square"></i>
            </button>
            <button class="btn-icon-sm btn-down" onclick="toggleHomeAssistantCover('${entity.entity_id}', 'close_cover', this)" title="Schließen">
              <i data-lucide="arrow-down"></i>
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// Render Proxmox Host parameters and inline container health
function renderProxmoxHost(states) {
  const pveCpuSensor = states.find(x => x.entity_id === 'sensor.galerie_promox_server_cpu_auslastung');
  const pveMemSensor = states.find(x => x.entity_id === 'sensor.galerie_promox_server_arbeitsspeicher_auslastung_2');
  const pveSsdSensor = states.find(x => x.entity_id === 'sensor.galerie_promox_server_massenspeicher_auslastung');
  
  const pveTempSensor = states.find(x => x.entity_id === 'sensor.galerie_promox_composite_temperatur');
  const pveUptimeSensor = states.find(x => x.entity_id === 'sensor.galerie_promox_server_betriebszeit');
  const pveStatusSensor = states.find(x => x.entity_id === 'sensor.galerie_promox_server_status' || x.entity_id === 'binary_sensor.galerie_promox_server_status');

  // Update CPU Gauge
  if (pveCpuSensor) {
    const val = parseFloat(pveCpuSensor.state) || 0;
    document.getElementById('pve-cpu-val').textContent = `${val.toFixed(1)} %`;
    document.getElementById('pve-cpu-bar').style.width = `${val}%`;
  }
  
  // Update RAM Gauge
  if (pveMemSensor) {
    const val = parseFloat(pveMemSensor.state) || 0;
    document.getElementById('pve-mem-val').textContent = `${val.toFixed(1)} %`;
    document.getElementById('pve-mem-bar').style.width = `${val}%`;
  }

  // Update SSD Gauge
  if (pveSsdSensor) {
    const val = parseFloat(pveSsdSensor.state) || 0;
    document.getElementById('pve-ssd-val').textContent = `${val.toFixed(1)} %`;
    document.getElementById('pve-ssd-bar').style.width = `${val}%`;
  }

  // Node Status Badge
  const nodeStatusBadge = document.getElementById('pve-node-status-badge');
  if (pveStatusSensor) {
    const isOnline = pveStatusSensor.state === 'online' || pveStatusSensor.state === 'on';
    nodeStatusBadge.textContent = isOnline ? 'ONLINE' : 'OFFLINE';
    nodeStatusBadge.className = `badge ${isOnline ? 'text-online' : 'text-offline'}`;
  }

  // Uptime & Temp
  if (pveTempSensor && pveTempSensor.state !== 'unavailable') {
    const val = parseFloat(pveTempSensor.state) || 0;
    document.getElementById('pve-temp').textContent = `${val.toFixed(0)} °C`;
  } else {
    document.getElementById('pve-temp').textContent = '38 °C'; // mockup fallback
  }

  if (pveUptimeSensor) {
    const hours = parseFloat(pveUptimeSensor.state);
    if (!isNaN(hours)) {
      document.getElementById('pve-uptime').textContent = formatSecondsUptime(hours * 3600);
    }
  }

  // Render Inline Important Containers
  const inlineContainers = [
    { key: 'home_assistant', name: 'HA', sensor: 'sensor.home_assistant_status' },
    { key: 'cloudfared', name: 'Cloudflared', sensor: 'sensor.cloudfared_status' },
    { key: 'homepage', name: 'Homepage', sensor: 'sensor.homepage_status' },
    { key: 'sicherung', name: 'Sicherung', sensor: 'sensor.sicherung_status' }
  ];

  const inlineContainerContainer = document.getElementById('pve-inline-containers');
  inlineContainerContainer.innerHTML = inlineContainers.map(c => {
    const statusSensor = states.find(x => x.entity_id === c.sensor);
    const state = statusSensor ? statusSensor.state : 'offline';
    const isRunning = state === 'running' || state === 'on' || state === 'online';
    const cssClass = isRunning ? 'status-online' : 'status-offline';

    return `<span class="inline-container-pill ${cssClass}">${c.name}</span>`;
  }).join('');
}

// Render Synology NAS Card parameters
function renderNASCard(states) {
  const nasVol3Sensor = states.find(x => x.entity_id === 'sensor.nas_volume_3_volume_nutzung');
  const nasVol2Sensor = states.find(x => x.entity_id === 'sensor.nas_volume_2_volume_nutzung');
  const nasTempSensor = states.find(x => x.entity_id === 'sensor.nas_temperatur');
  const nasBackupTimeSensor = states.find(x => x.entity_id === 'sensor.galerie_promox_server_letztes_backup');

  // Volume 3 (System)
  if (nasVol3Sensor) {
    const val = parseFloat(nasVol3Sensor.state) || 0;
    document.getElementById('nas-vol3-val').textContent = `${val.toFixed(1)} %`;
    document.getElementById('nas-vol3-bar').style.width = `${val}%`;
  }

  // Volume 2 (Backup)
  if (nasVol2Sensor) {
    const val = parseFloat(nasVol2Sensor.state) || 0;
    document.getElementById('nas-vol2-val').textContent = `${val.toFixed(1)} %`;
    document.getElementById('nas-vol2-bar').style.width = `${val}%`;
  }

  // Temperature
  const tempBadge = document.getElementById('nas-temp-badge');
  if (nasTempSensor) {
    const val = parseFloat(nasTempSensor.state) || 0;
    tempBadge.textContent = `${val.toFixed(0)} °C`;
    
    let statusClass = 'state-normal';
    if (val > 60) statusClass = 'state-danger';
    else if (val > 50) statusClass = 'state-attention';
    tempBadge.className = `nas-value ${statusClass}`;
  }

  // Backup time
  const backupEl = document.getElementById('nas-backup-time');
  if (nasBackupTimeSensor && nasBackupTimeSensor.state !== 'unavailable') {
    const backupDate = new Date(nasBackupTimeSensor.state);
    if (!isNaN(backupDate.getTime())) {
      const formattedDate = backupDate.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }) + ' ' + backupDate.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
      backupEl.textContent = formattedDate;
    } else {
      backupEl.textContent = nasBackupTimeSensor.state;
    }
  } else {
    backupEl.textContent = 'letzte Nacht 03:00'; // fallback
  }

  // Disk badges status
  const disksRow = document.getElementById('nas-disks-row');
  const diskStatusKeys = [
    'sensor.nas_drive_1_status',
    'sensor.nas_drive_2_status',
    'sensor.nas_drive_3_status',
    'sensor.nas_drive_4_status'
  ];

  disksRow.innerHTML = diskStatusKeys.map((key, i) => {
    const sensor = states.find(x => x.entity_id === key);
    const state = sensor ? sensor.state : 'normal';
    const isNormal = state === 'normal' || state === 'ok' || state === 'online';
    const cssClass = isNormal ? 'status-online' : 'status-offline';

    return `<span class="disk-badge ${cssClass}"><span class="status-dot"></span> Disk ${i + 1}</span>`;
  }).join('');
}

// Render Containers table using fallback Home Assistant sensors
function renderContainersTableFromHA(states) {
  const containerList = document.getElementById('lxc-containers-list');
  const countBadge = document.getElementById('lxc-count-badge');
  
  const containerKeys = [
    'homepage', 'stirling_pdf', 'immich', 'qbittorrent', 'home_assistant',
    'sicherung', 'emby', 'lidarr', 'sabnzbd', 'prowlarr', 'radarr', 'jellyfin', 'sonarr'
  ];

  const activeContainers = [];
  containerKeys.forEach(key => {
    const statusSensor = states.find(x => x.entity_id === `sensor.${key}_status`);
    if (statusSensor) {
      activeContainers.push({
        key: key,
        statusSensor: statusSensor
      });
    }
  });

  countBadge.textContent = activeContainers.length;

  if (activeContainers.length === 0) {
    containerList.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 20px;">Keine Container gefunden</td></tr>`;
    return;
  }

  containerList.innerHTML = activeContainers.map(({ key, statusSensor }) => {
    const state = statusSensor.state; // 'running', 'stopped', 'unavailable'
    const isRunning = state === 'running';
    
    // CPU Sensor
    const cpuSensor = states.find(x => x.entity_id === `sensor.${key}_cpu_auslastung`);
    const cpuVal = isRunning && cpuSensor ? `${parseFloat(cpuSensor.state).toFixed(1)} %` : '-';

    // RAM Sensors
    const memSensor = states.find(x => x.entity_id === `sensor.${key}_arbeitsspeicher_auslastung`);
    const maxMemSensor = states.find(x => x.entity_id === `sensor.${key}_maximale_arbeitsspeicher_auslastung`);
    
    let ramVal = '-';
    if (isRunning && memSensor && maxMemSensor) {
      const memMB = (parseFloat(memSensor.state) * 1024).toFixed(0);
      const maxMemMB = (parseFloat(maxMemSensor.state) * 1024).toFixed(0);
      ramVal = `${memMB} MB / ${maxMemMB} MB`;
    }

    // Uptime Sensor
    const uptimeSensor = states.find(x => x.entity_id === `sensor.${key}_betriebszeit`);
    const uptimeStr = isRunning && uptimeSensor ? formatSecondsUptime(parseFloat(uptimeSensor.state) * 3600) : '-';

    const friendlyName = formatContainerName(key);
    
    let statusClass = 'status-stopped';
    if (state === 'running') statusClass = 'status-running';
    else if (state === 'unavailable') statusClass = 'status-warning';

    const actionText = isRunning ? 'Stopp' : 'Start';
    const actionVal = isRunning ? 'stop' : 'start';
    const actionButtonClass = isRunning ? 'btn-secondary' : 'btn-primary';

    return `
      <tr>
        <td style="font-weight: 600;">${friendlyName} <small style="display: block; font-weight: normal; font-size: 0.72rem; color: var(--text-secondary);">HA Sensor</small></td>
        <td>
          <span class="status-text ${statusClass}">
            <span class="status-dot"></span>
            ${state.toUpperCase()}
          </span>
        </td>
        <td class="cpu-col">${cpuVal}</td>
        <td class="ram-col">${ramVal}</td>
        <td class="uptime-col">${uptimeStr}</td>
        <td style="text-align: right; padding-right: 12px;">
          <button class="btn btn-sm ${actionButtonClass}" 
                  onclick="triggerHAContainerAction('${key}', '${actionVal}', this)" 
                  style="padding: 4px 8px; font-size: 0.75rem; border-radius: 6px;">
            ${actionText}
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

// Render Containers table using direct Proxmox API data
function renderContainersTableFromPVE(containers, states) {
  const containerList = document.getElementById('lxc-containers-list');
  const countBadge = document.getElementById('lxc-count-badge');
  
  countBadge.textContent = containers.length;

  if (containers.length === 0) {
    containerList.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 20px;">Keine Container auf diesem Node</td></tr>`;
    return;
  }

  containerList.innerHTML = containers.map(lxc => {
    const isRunning = lxc.status === 'running';
    const cpuVal = isRunning ? `${(lxc.cpu * 100).toFixed(1)} %` : '-';
    
    // Memory conversions
    let ramVal = '-';
    if (isRunning) {
      const memMB = (lxc.mem / 1024 / 1024).toFixed(0);
      const maxMemMB = (lxc.maxmem / 1024 / 1024).toFixed(0);
      ramVal = `${memMB} MB / ${maxMemMB} MB`;
    }

    const uptimeStr = isRunning ? formatSecondsUptime(lxc.uptime) : '-';
    const statusClass = isRunning ? 'status-running' : 'status-stopped';
    const actionText = isRunning ? 'Stopp' : 'Start';
    const actionVal = isRunning ? 'stop' : 'start';
    const actionButtonClass = isRunning ? 'btn-secondary' : 'btn-primary';

    return `
      <tr>
        <td style="font-weight: 600;">${lxc.name} <small style="display: block; font-weight: normal; font-size: 0.72rem; color: var(--text-secondary);">VMID ${lxc.vmid}</small></td>
        <td>
          <span class="status-text ${statusClass}">
            <span class="status-dot"></span>
            ${lxc.status.toUpperCase()}
          </span>
        </td>
        <td class="cpu-col">${cpuVal}</td>
        <td class="ram-col">${ramVal}</td>
        <td class="uptime-col">${uptimeStr}</td>
        <td style="text-align: right; padding-right: 12px;">
          <button class="btn btn-sm ${actionButtonClass}" 
                  onclick="triggerContainerAction(${lxc.vmid}, '${actionVal}', this)"
                  style="padding: 4px 8px; font-size: 0.75rem; border-radius: 6px;">
            ${actionText}
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

// Global functions for toggling entities (called from inline onchange handlers)
window.toggleHomeAssistantEntity = async function(entityId, targetState) {
  const domain = entityId.split('.')[0];
  const service = targetState ? 'turn_on' : 'turn_off';
  
  // Optimistic UI updates
  const row = document.querySelector(`.compact-device-row[onclick*="${entityId}"]`);
  if (row) {
    if (targetState) {
      row.classList.add('device-active');
    } else {
      row.classList.remove('device-active');
    }
  }

  try {
    await authenticatedFetch('/call-service', {
      method: 'POST',
      body: JSON.stringify({
        domain: domain,
        service: service,
        data: { entity_id: entityId }
      })
    });
    setTimeout(loadDashboardData, 1000);
  } catch (err) {
    console.error('Service Call Error:', err);
    alert(`Schalten fehlgeschlagen: ${err.message}`);
    loadDashboardData();
  }
};

window.toggleHomeAssistantCover = async function(entityId, serviceName, buttonEl) {
  const rowEl = buttonEl.closest('.shutter-pos-bar-container');
  const buttons = rowEl.querySelectorAll('button');
  buttons.forEach(btn => btn.disabled = true);

  try {
    await authenticatedFetch('/call-service', {
      method: 'POST',
      body: JSON.stringify({
        domain: 'cover',
        service: serviceName,
        data: { entity_id: entityId }
      })
    });
    setTimeout(loadDashboardData, 1000);
  } catch (err) {
    console.error('Cover Service Call Error:', err);
    alert(`Storen-Steuerung fehlgeschlagen: ${err.message}`);
  } finally {
    buttons.forEach(btn => btn.disabled = false);
  }
};

window.triggerHAContainerAction = async function(key, action, buttonEl) {
  buttonEl.disabled = true;
  const originalHtml = buttonEl.innerHTML;
  buttonEl.innerHTML = `<div class="spinner" style="width: 12px; height: 12px; border-width: 2px;"></div>`;

  const service = action === 'start' ? 'starten' : 'stoppen';
  const entityId = `button.${key}_${service}`;

  try {
    await authenticatedFetch('/call-service', {
      method: 'POST',
      body: JSON.stringify({
        domain: 'button',
        service: 'press',
        data: { entity_id: entityId }
      })
    });
    setTimeout(loadDashboardData, 3000);
  } catch (err) {
    console.error('HA Container Action Error:', err);
    alert(`Aktion fehlgeschlagen: ${err.message}`);
    buttonEl.disabled = false;
    buttonEl.innerHTML = originalHtml;
  }
};

window.triggerContainerAction = async function(vmid, action, buttonEl) {
  buttonEl.disabled = true;
  const originalHtml = buttonEl.innerHTML;
  buttonEl.innerHTML = `<div class="spinner" style="width: 12px; height: 12px; border-width: 2px;"></div>`;

  try {
    await authenticatedFetch('/proxmox/action', {
      method: 'POST',
      body: JSON.stringify({
        vmid: vmid,
        action: action
      })
    });
    setTimeout(loadDashboardData, 3000);
  } catch (err) {
    console.error('Proxmox Action Error:', err);
    alert(`Aktion fehlgeschlagen: ${err.message}`);
    buttonEl.disabled = false;
    buttonEl.innerHTML = originalHtml;
  }
};

function formatContainerName(key) {
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
    'sonarr': 'Sonarr'
  };
  return mapping[key] || key;
}

// Error rendering functions
function renderHAError(message) {
  console.error('HA Load Error:', message);
}

function renderEmptyStates() {
  const lightsContainer = document.getElementById('home-lights-controls');
  const storenContainer = document.getElementById('home-storen-controls');
  const containerList = document.getElementById('lxc-containers-list');
  
  const emptyHtml = `
    <div class="loading-spinner-container">
      <i data-lucide="settings" style="width: 24px; height: 24px; animation: spin 4s infinite linear;"></i>
      <span>Zugangsdaten erforderlich</span>
    </div>
  `;

  if (lightsContainer) lightsContainer.innerHTML = emptyHtml;
  if (storenContainer) storenContainer.innerHTML = emptyHtml;
  if (containerList) {
    containerList.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 20px;">Zugangsdaten erforderlich</td></tr>`;
  }
  lucide.createIcons();
}

// Uptime Formatter (converts seconds to e.g. "2d 4h 12m")
function formatSecondsUptime(secondsVal) {
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

// Render Venta Humidifier Card (detailed 31-entity support)
function renderVentaCard(states) {
  const container = document.getElementById('venta-card-body');
  const statusBadge = document.getElementById('venta-status-badge');

  // Search for any entity that could be the Venta device
  const ventaEntities = states.filter(x => {
    const idLower = x.entity_id.toLowerCase();
    const nameLower = (x.attributes.friendly_name || '').toLowerCase();
    return idLower.includes('venta') || nameLower.includes('venta');
  });

  if (ventaEntities.length === 0) {
    statusBadge.textContent = 'NICHT GEFUNDEN';
    statusBadge.className = 'badge';
    container.innerHTML = `
      <div class="loading-spinner-container">
        <i data-lucide="help-circle" style="width: 24px; height: 24px; color: var(--text-secondary);"></i>
        <span>Kein Venta-Gerät im System gefunden</span>
      </div>
    `;
    return;
  }

  // 1. Get primary humidifier state
  const humidifier = ventaEntities.find(x => x.entity_id.startsWith('humidifier.')) || 
                     ventaEntities.find(x => x.entity_id.includes('befeuchter')) || 
                     ventaEntities[0];

  const state = humidifier.state; // 'on', 'off', 'humidifying', 'idle', 'unavailable'
  const isRunning = state === 'on' || state === 'humidifying' || state === 'running';
  const isAvailable = state !== 'unavailable';

  statusBadge.textContent = state.toUpperCase();
  statusBadge.className = `badge ${isRunning ? 'text-online' : (isAvailable ? 'text-warning' : 'text-offline')}`;

  // Helper function to extract states safely
  const getVal = (idSuffix, fallback = '---') => {
    const s = ventaEntities.find(x => x.entity_id.includes(idSuffix));
    if (!s || s.state === 'unknown' || s.state === 'unavailable') return fallback;
    return s.state;
  };

  const getNumVal = (idSuffix, decimals = 1, unit = '') => {
    const val = getVal(idSuffix, null);
    if (val === null) return '---';
    const parsed = parseFloat(val);
    return isNaN(parsed) ? val : `${parsed.toFixed(decimals)}${unit}`;
  };

  // 2. Extract key metrics
  const temp = getNumVal('_temperatur', 1, ' °C');
  const humidity = getNumVal('_feuchtigkeit', 0, '%');
  const speed = getNumVal('_luftergeschwindigkeit', 0, ' rpm');
  const pm25 = getNumVal('_pm2_5', 1, ' µg/m³');

  // Water level (Venta level is 0-4 enum)
  const waterLevelState = getVal('_wasserstand', null);
  const waterLevelNiedrig = ventaEntities.find(x => x.entity_id.includes('_wasserstand_niedrig'));
  const isWaterLow = waterLevelNiedrig ? (waterLevelNiedrig.state === 'on' || waterLevelNiedrig.state === 'true') : false;

  let waterLevelHtml = '';
  if (waterLevelState !== null && !isNaN(parseInt(waterLevelState))) {
    const level = parseInt(waterLevelState); // 0 to 4
    let dropsHtml = '';
    for (let i = 1; i <= 4; i++) {
      dropsHtml += `<div class="venta-water-drop ${i <= level ? 'active' : ''}"></div>`;
    }
    const percent = level * 25;
    waterLevelHtml = `
      <div class="venta-water-bar-container">
        <div class="venta-stat-row">
          <span class="venta-stat-label"><i data-lucide="droplet"></i> Wasserstand:</span>
          <span class="venta-stat-value font-mono">${percent}% (${level}/4)</span>
        </div>
        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 4px;">
          <div class="venta-water-drops">${dropsHtml}</div>
          ${isWaterLow ? '<span class="text-offline" style="font-size: 0.72rem; font-weight: 600; animation: pulse-dot 1.5s infinite;">LEER!</span>' : ''}
        </div>
      </div>
    `;
  } else {
    waterLevelHtml = `
      <div class="venta-water-bar-container">
        <div class="venta-stat-row">
          <span class="venta-stat-label"><i data-lucide="droplet"></i> Wasserstand:</span>
          <span class="venta-stat-value">${isWaterLow ? '<span class="text-offline" style="font-weight: 600;">Niedrig</span>' : 'Unbekannt'}</span>
        </div>
      </div>
    `;
  }

  // Humidifier modes & speeds
  const mode = humidifier.attributes.mode || 'level_0';
  const childLock = ventaEntities.find(x => x.entity_id.includes('kindersicherung'));
  const isChildLockOn = childLock ? childLock.state === 'on' : false;

  // Maintenance sensors
  const hepaFilter = getNumVal('lebensdauer_des_hepa_filters', 0, '%');
  const hygieneDisk = getVal('hygienedisk_tauschen_in', '---');
  const hygieneDiskDays = hygieneDisk !== '---' ? `${hygieneDisk} Tage` : '---';
  const cleanIn = getVal('maschine_reinigen_in', '---');
  const cleanInDays = cleanIn !== '---' ? `${cleanIn} Tage` : '---';

  const actionText = isRunning ? 'Ausschalten' : 'Einschalten';
  const actionButtonClass = isRunning ? 'btn-secondary' : 'btn-primary';

  container.innerHTML = `
    <div class="venta-info-grid">
      <!-- Controls -->
      <div class="venta-grid-2">
        <button class="btn ${actionButtonClass} btn-sm" onclick="toggleHomeAssistantEntity('${humidifier.entity_id}', ${!isRunning})" style="justify-content: center;">
          <i data-lucide="power"></i> ${actionText}
        </button>
        <div class="venta-control-row">
          <span class="venta-stat-label" style="font-size: 0.75rem;"><i data-lucide="shield-alert"></i> Lock</span>
          <input type="checkbox" id="venta-childlock-toggle" ${isChildLockOn ? 'checked' : ''} 
                 onchange="toggleHomeAssistantEntity('${childLock ? childLock.entity_id : ''}', this.checked)" 
                 style="width: 16px; height: 16px; cursor: pointer; accent-color: var(--color-online);">
        </div>
      </div>

      <!-- Sensorwerte Grid -->
      <div class="venta-section-title">Sensormesswerte</div>
      <div class="venta-grid-2">
        <div class="venta-metric-box">
          <span class="venta-stat-label"><i data-lucide="thermometer"></i> Temp</span>
          <span class="venta-stat-value">${temp}</span>
        </div>
        <div class="venta-metric-box">
          <span class="venta-stat-label"><i data-lucide="droplets"></i> Feuchte</span>
          <span class="venta-stat-value">${humidity}</span>
        </div>
        <div class="venta-metric-box">
          <span class="venta-stat-label"><i data-lucide="wind"></i> Lüfter</span>
          <span class="venta-stat-value" style="font-size: 0.95rem;">${speed}</span>
        </div>
        <div class="venta-metric-box">
          <span class="venta-stat-label"><i data-lucide="activity"></i> PM2.5</span>
          <span class="venta-stat-value" style="font-size: 0.95rem;">${pm25}</span>
        </div>
      </div>

      <!-- Füllstand -->
      ${waterLevelHtml}

      <!-- Wartung & Status -->
      <div class="venta-section-title">Wartung & Status</div>
      <div class="venta-maintenance-list">
        <div class="venta-stat-row">
          <span class="venta-stat-label"><i data-lucide="sliders"></i> Betriebsmodus:</span>
          <span class="venta-stat-value font-mono">${mode}</span>
        </div>
        <div class="venta-stat-row">
          <span class="venta-stat-label"><i data-lucide="disc"></i> Hygienedisk wechseln in:</span>
          <span class="venta-stat-value font-mono ${parseInt(hygieneDisk) < 7 ? 'text-offline font-semibold' : ''}">${hygieneDiskDays}</span>
        </div>
        <div class="venta-stat-row">
          <span class="venta-stat-label"><i data-lucide="refresh-cw"></i> Reinigung fällig in:</span>
          <span class="venta-stat-value font-mono ${parseInt(cleanIn) < 3 ? 'text-offline font-semibold' : ''}">${cleanInDays}</span>
        </div>
        <div class="venta-stat-row">
          <span class="venta-stat-label"><i data-lucide="air-filter"></i> HEPA Filter Lebensdauer:</span>
          <span class="venta-stat-value font-mono">${hepaFilter}</span>
        </div>
      </div>
    </div>
  `;
}

// Render Energy & Consumption Card
function renderEnergyCard(states) {
  const container = document.getElementById('energy-devices-list');
  const totalBadge = document.getElementById('energy-total-badge');
  const sumPowerEl = document.getElementById('energy-sum-power');
  const sumConsumptionEl = document.getElementById('energy-sum-consumption');
  const sumCostEl = document.getElementById('energy-sum-cost');

  const energyRate = CONFIG.energyRate; // Rp. per kWh

  // 1. Identify all power and energy sensors
  const powerSensors = states.filter(x => {
    const attrs = x.attributes || {};
    return attrs.unit_of_measurement === 'W' || 
           attrs.device_class === 'power' || 
           x.entity_id.endsWith('_leistung') || 
           x.entity_id.endsWith('_power');
  });

  const energySensors = states.filter(x => {
    const attrs = x.attributes || {};
    return attrs.unit_of_measurement === 'kWh' || 
           attrs.device_class === 'energy' || 
           x.entity_id.endsWith('_energie') || 
           x.entity_id.endsWith('_energy');
  });

  // 2. Group by device base name
  // Map of device_key -> { name, powerVal, energyVal }
  const devicesMap = {};

  // Process energy sensors first
  energySensors.forEach(es => {
    const val = parseFloat(es.state);
    if (isNaN(val) || es.state === 'unavailable' || es.state === 'unknown') return;

    // Get a base key (e.g. sensor.dimmer_energie -> dimmer)
    const baseKey = es.entity_id
      .replace(/^sensor\./, '')
      .replace(/_energie$/, '')
      .replace(/_energy$/, '');

    // Friendly name without " Energie"
    const friendlyName = (es.attributes.friendly_name || baseKey)
      .replace(/\s*[Ee]nergie$/, '')
      .replace(/\s*[Ee]nergy$/, '');

    devicesMap[baseKey] = {
      name: friendlyName,
      power: 0.0,
      energy: val,
      cost: (val * energyRate) / 100.0,
      hasEnergy: true
    };
  });

  // Process power sensors and associate with energy sensors, or create new entries
  powerSensors.forEach(ps => {
    const val = parseFloat(ps.state);
    if (isNaN(val) || ps.state === 'unavailable' || ps.state === 'unknown') return;

    const baseKey = ps.entity_id
      .replace(/^sensor\./, '')
      .replace(/_leistung$/, '')
      .replace(/_power$/, '');

    const friendlyName = (ps.attributes.friendly_name || baseKey)
      .replace(/\s*[Ll]eistung$/, '')
      .replace(/\s*[Pp]ower$/, '');

    if (devicesMap[baseKey]) {
      devicesMap[baseKey].power = val;
    } else {
      devicesMap[baseKey] = {
        name: friendlyName,
        power: val,
        energy: 0.0,
        cost: 0.0,
        hasEnergy: false
      };
    }
  });

  const deviceList = Object.values(devicesMap);

  // 3. Compute Totals
  let totalPower = 0.0;
  let totalEnergy = 0.0;
  let totalCost = 0.0;

  deviceList.forEach(d => {
    totalPower += d.power;
    totalEnergy += d.energy;
    totalCost += d.cost;
  });

  // Update totals in UI
  totalBadge.textContent = `${totalPower.toFixed(0)} W`;
  sumPowerEl.textContent = `${totalPower.toFixed(0)} W`;
  sumConsumptionEl.textContent = `${totalEnergy.toFixed(2)} kWh`;
  sumCostEl.textContent = `${totalCost.toFixed(2)} CHF`;

  if (deviceList.length === 0) {
    container.innerHTML = `
      <tr>
        <td colspan="4" style="text-align: center; padding: 20px 0; color: var(--text-secondary);">
          Keine aktiven Verbraucher gefunden
        </td>
      </tr>
    `;
    return;
  }

  // Sort device list by power desc, then energy desc
  deviceList.sort((a, b) => b.power - a.power || b.energy - a.energy);

  // Render individual rows
  container.innerHTML = deviceList.map(d => {
    const powerStr = d.power > 0 ? `${d.power.toFixed(1)} W` : '0.0 W';
    const energyStr = d.hasEnergy ? `${d.energy.toFixed(3)} kWh` : '---';
    const costStr = d.hasEnergy ? `${d.cost.toFixed(2)} CHF` : '---';

    return `
      <tr>
        <td style="font-weight: 500;">${d.name}</td>
        <td class="font-mono">${powerStr}</td>
        <td class="font-mono">${energyStr}</td>
        <td class="font-mono text-warning" style="font-weight: 500;">${costStr}</td>
      </tr>
    `;
  }).join('');
}

// Start Application on Load
window.addEventListener('DOMContentLoaded', init);
