// Global Application State
let CONFIG = {
  apiUrl: localStorage.getItem('ha_worker_url') || '',
  apiKey: localStorage.getItem('ha_worker_key') || ''
};

let refreshIntervalId = null;

// Initialize Dashboard
function init() {
  setupEventListeners();
  
  if (!CONFIG.apiUrl || !CONFIG.apiKey) {
    showSetupBanner(true);
    updateConnectionStatus('unconfigured');
    // Set default placeholder/empty states
    renderEmptyStates();
  } else {
    showSetupBanner(false);
    startAutoRefresh();
  }
}

// Event Listeners for UI interaction
function setupEventListeners() {
  // Settings buttons
  const btnSettings = document.getElementById('btn-settings');
  const btnSetupNow = document.getElementById('btn-setup-now');
  const btnCloseSettings = document.getElementById('btn-close-settings');
  const settingsModal = document.getElementById('settings-modal');
  const settingsForm = document.getElementById('settings-form');
  const btnTestConnection = document.getElementById('btn-test-connection');
  const btnToggleKey = document.getElementById('btn-toggle-key-visibility');
  const inputApiKey = document.getElementById('input-api-key');

  btnSettings.addEventListener('click', () => openSettingsModal());
  btnSetupNow.addEventListener('click', () => openSettingsModal());
  btnCloseSettings.addEventListener('click', () => closeSettingsModal());
  
  // Close modal when clicking outside content
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
    
    localStorage.setItem('ha_worker_url', url);
    localStorage.setItem('ha_worker_key', key);
    
    CONFIG.apiUrl = url;
    CONFIG.apiKey = key;
    
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
  document.getElementById('settings-modal').classList.remove('hidden');
  hideTestResult();
  lucide.createIcons();
}

function closeSettingsModal() {
  document.getElementById('settings-modal').classList.add('hidden');
}

function showSetupBanner(show) {
  const banner = document.getElementById('setup-banner');
  if (show) {
    banner.classList.remove('hidden');
  } else {
    banner.classList.add('hidden');
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

// Connection Status Pill Helper
function updateConnectionStatus(state, customText) {
  const statusPill = document.getElementById('connection-status');
  const statusText = statusPill.querySelector('.status-text');
  
  statusPill.className = `status-pill state-${state}`;
  
  if (state === 'connected') {
    statusText.textContent = customText || 'Verbunden';
  } else if (state === 'connecting') {
    statusText.textContent = customText || 'Verbinde...';
  } else if (state === 'unconfigured') {
    statusText.textContent = 'Konfiguration fehlt';
  } else {
    statusText.textContent = customText || 'Fehler';
  }
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
  updateConnectionStatus('connecting');
  
  let haSuccess = false;
  let pveSuccess = false;
  let haErrorMsg = '';
  let pveErrorMsg = '';
  let states = [];

  // 1. Fetch Home Assistant States
  try {
    states = await authenticatedFetch('/states');
    renderHomeAssistant(states);
    haSuccess = true;
  } catch (err) {
    console.error('HA Fetch Error:', err);
    haErrorMsg = err.message;
    renderHAError(err.message);
  }

  // 2. Fetch Proxmox Container List
  try {
    const containers = await authenticatedFetch('/proxmox/containers');
    renderProxmoxContainers(containers);
    pveSuccess = true;
  } catch (err) {
    console.error('Proxmox Fetch Error (trying Home Assistant fallback):', err);
    pveErrorMsg = err.message;
    if (haSuccess && states.length > 0) {
      renderHAContainers(states);
      pveSuccess = true; // Fallback succeeded!
    } else {
      renderProxmoxError(err.message);
    }
  }

  // Update Status Pill based on results
  if (haSuccess && pveSuccess) {
    updateConnectionStatus('connected', 'Aktiv');
  } else if (haSuccess) {
    updateConnectionStatus('connecting', 'HA online, PVE Fehler');
  } else if (pveSuccess) {
    updateConnectionStatus('connecting', 'PVE online, HA Fehler');
  } else {
    const isAuthError = haErrorMsg === 'Unauthorized' || pveErrorMsg === 'Unauthorized';
    updateConnectionStatus('error', isAuthError ? 'Unautorisiert' : 'Verbindungsfehler');
  }
  
  lucide.createIcons();
}

// Render dynamic Home Assistant Controls
function renderHomeAssistant(states) {
  // 1. User Presence
  const danPerson = states.find(x => x.entity_id === 'person.dan');
  const presenceEl = document.getElementById('user-presence');
  if (presenceEl) {
    if (danPerson) {
      const state = danPerson.state; // 'home', 'not_home', etc.
      presenceEl.className = `presence-pill state-${state}`;
      const textEl = presenceEl.querySelector('.presence-text');
      const iconEl = presenceEl.querySelector('i');
      
      if (state === 'home') {
        textEl.textContent = 'Dan: Anwesend';
        if (iconEl) iconEl.setAttribute('data-lucide', 'home');
      } else if (state === 'not_home') {
        textEl.textContent = 'Dan: Abwesend';
        if (iconEl) iconEl.setAttribute('data-lucide', 'user');
      } else {
        textEl.textContent = `Dan: ${state}`;
        if (iconEl) iconEl.setAttribute('data-lucide', 'user-cog');
      }
    } else {
      presenceEl.className = 'presence-pill state-unknown';
      presenceEl.querySelector('.presence-text').textContent = 'Dan: Unbekannt';
    }
  }

  // 2. Lights & Switch Section
  const lightsContainer = document.getElementById('home-lights-controls');
  
  // Specific lights & switches from the entities:
  const targetLightsSwitches = [
    'light.dimmer',
    'light.philips_ltw013',
    'light.philips_ltw013_2',
    'switch.brunnen'
  ];
  const lightsSwitches = states.filter(x => targetLightsSwitches.includes(x.entity_id));

  // Sort: lights/switches in the exact order of targetLightsSwitches
  lightsSwitches.sort((a, b) => targetLightsSwitches.indexOf(a.entity_id) - targetLightsSwitches.indexOf(b.entity_id));

  // Update counts
  const lightsOn = states.filter(x => x.entity_id.startsWith('light.') && x.state === 'on').length;
  const switchesOn = states.filter(x => x.entity_id.startsWith('switch.') && x.state === 'on').length;
  
  document.getElementById('lights-on-count').textContent = lightsOn;
  document.getElementById('switches-on-count').textContent = switchesOn;

  if (lightsSwitches.length === 0) {
    lightsContainer.innerHTML = `
      <div class="loading-spinner-container">
        <i data-lucide="info" style="width: 28px; height: 28px;"></i>
        <span>Keine Beleuchtung gefunden</span>
      </div>
    `;
  } else {
    lightsContainer.innerHTML = lightsSwitches.map(entity => {
      const friendlyName = entity.attributes.friendly_name || entity.entity_id;
      const isChecked = entity.state === 'on';
      const domain = entity.entity_id.split('.')[0];
      const isLight = domain === 'light';
      const iconName = isLight ? 'lightbulb' : 'zap';
      const iconClass = isChecked ? 'text-warning' : 'text-secondary';

      return `
        <div class="item" data-entity-id="${entity.entity_id}">
          <div style="display: flex; align-items: center; gap: 12px;">
            <i data-lucide="${iconName}" class="${iconClass}" style="width: 20px; height: 20px;"></i>
            <div class="item-info">
              <span class="item-title">${friendlyName}</span>
              <span class="item-desc font-mono">${entity.entity_id}</span>
            </div>
          </div>
          
          <label class="switch">
            <input type="checkbox" 
                   ${isChecked ? 'checked' : ''} 
                   onchange="toggleHomeAssistantEntity('${entity.entity_id}', this.checked)">
            <span class="slider"></span>
          </label>
        </div>
      `;
    }).join('');
  }

  // 3. Storen (Covers) Section
  const storenContainer = document.getElementById('home-storen-controls');
  const targetCovers = [
    'cover.wohnzimmer_store',
    'cover.schlafzimmer_store_mit_fensterture',
    'cover.shelly2pmg4_acebe6e202a8'
  ];
  const covers = states.filter(x => targetCovers.includes(x.entity_id));
  covers.sort((a, b) => targetCovers.indexOf(a.entity_id) - targetCovers.indexOf(b.entity_id));

  // Counts
  const coversOpen = covers.filter(x => x.state === 'open').length;
  const coversClosed = covers.filter(x => x.state === 'closed').length;
  document.getElementById('covers-open-count').textContent = coversOpen;
  document.getElementById('covers-closed-count').textContent = coversClosed;

  if (covers.length === 0) {
    storenContainer.innerHTML = `
      <div class="loading-spinner-container">
        <i data-lucide="info" style="width: 28px; height: 28px;"></i>
        <span>Keine Storen gefunden</span>
      </div>
    `;
  } else {
    storenContainer.innerHTML = covers.map(entity => {
      const friendlyName = entity.attributes.friendly_name || entity.entity_id;
      const state = entity.state; // 'open', 'closed', 'opening', 'closing'
      let stateDesc = 'Unbekannt';
      let stateColor = 'var(--text-secondary)';
      if (state === 'open') { stateDesc = 'Geöffnet'; stateColor = 'var(--color-online)'; }
      else if (state === 'closed') { stateDesc = 'Geschlossen'; stateColor = 'var(--color-offline)'; }
      else if (state === 'opening') { stateDesc = 'Öffnet...'; stateColor = 'var(--color-warning)'; }
      else if (state === 'closing') { stateDesc = 'Schliesst...'; stateColor = 'var(--color-warning)'; }

      return `
        <div class="item" data-entity-id="${entity.entity_id}">
          <div style="display: flex; align-items: center; gap: 12px;">
            <i data-lucide="blinds" style="width: 20px; height: 20px; color: ${stateColor};"></i>
            <div class="item-info">
              <span class="item-title">${friendlyName}</span>
              <span class="item-desc font-mono" style="color: ${stateColor}">${stateDesc}</span>
            </div>
          </div>
          
          <div class="cover-controls">
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
      `;
    }).join('');
  }

  // 4. Proxmox Server Section
  // Note: spelling is "promox" in user's entities!
  const pveCpuSensor = states.find(x => x.entity_id === 'sensor.galerie_promox_server_cpu_auslastung');
  const pveMemSensor = states.find(x => x.entity_id === 'sensor.galerie_promox_server_arbeitsspeicher_auslastung_2');
  const pveTempSensor = states.find(x => x.entity_id === 'sensor.galerie_promox_composite_temperatur');
  const pveUptimeSensor = states.find(x => x.entity_id === 'sensor.galerie_promox_server_betriebszeit');
  const pveBackupTimeSensor = states.find(x => x.entity_id === 'sensor.galerie_promox_server_letztes_backup');
  const pveBackupDurationSensor = states.find(x => x.entity_id === 'sensor.galerie_promox_server_backup_dauer');
  const pveStatusSensor = states.find(x => x.entity_id === 'sensor.galerie_promox_server_status' || x.entity_id === 'binary_sensor.galerie_promox_server_status');

  if (pveCpuSensor) {
    const val = parseFloat(pveCpuSensor.state) || 0;
    document.getElementById('pve-cpu-val').textContent = `${val.toFixed(1)} %`;
    document.getElementById('pve-cpu-bar').style.width = `${val}%`;
  }
  
  if (pveMemSensor) {
    const val = parseFloat(pveMemSensor.state) || 0;
    document.getElementById('pve-mem-val').textContent = `${val.toFixed(1)} %`;
    document.getElementById('pve-mem-bar').style.width = `${val}%`;
  }

  if (pveTempSensor) {
    const val = parseFloat(pveTempSensor.state) || 0;
    document.getElementById('pve-temp').textContent = `${val.toFixed(0)} °C`;
  }

  if (pveUptimeSensor) {
    // uptime in hours
    const hours = parseFloat(pveUptimeSensor.state);
    if (!isNaN(hours)) {
      document.getElementById('pve-uptime').textContent = formatSecondsUptime(hours * 3600);
    }
  }

  if (pveBackupTimeSensor) {
    const backupDate = new Date(pveBackupTimeSensor.state);
    if (!isNaN(backupDate.getTime())) {
      const formattedDate = backupDate.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }) + ' ' + backupDate.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
      document.getElementById('pve-backup-time').textContent = formattedDate;
    } else {
      document.getElementById('pve-backup-time').textContent = pveBackupTimeSensor.state;
    }
  }

  if (pveBackupDurationSensor) {
    const minutes = parseFloat(pveBackupDurationSensor.state);
    if (!isNaN(minutes)) {
      document.getElementById('pve-backup-duration').textContent = `Dauer: ${minutes.toFixed(1)} min`;
    }
  }

  if (pveStatusSensor) {
    const statusText = pveStatusSensor.state;
    const isOnline = statusText === 'online' || statusText === 'on';
    const statusEl = document.getElementById('pve-node-status');
    statusEl.textContent = isOnline ? 'Online' : 'Offline';
    statusEl.className = `status-text ${isOnline ? 'text-online' : 'text-offline'}`;
  }

  // 5. Synology NAS Section
  const nasCpuSensor = states.find(x => x.entity_id === 'sensor.nas_cpu_auslastung_gesamt');
  const nasVol1Sensor = states.find(x => x.entity_id === 'sensor.storage_synology_ausgabe_speicherauslastung_in_prozent');
  const nasVol2Sensor = states.find(x => x.entity_id === 'sensor.storage_synology_backup_speicherauslastung_in_prozent');
  const nasTempSensor = states.find(x => x.entity_id === 'sensor.nas_temperatur');

  // Average hard drive temperature
  const driveTemps = states.filter(x => x.entity_id.startsWith('sensor.nas_drive_') && x.entity_id.endsWith('_temperatur'));
  let avgHddTemp = 0;
  let driveCount = 0;
  driveTemps.forEach(d => {
    const tempVal = parseFloat(d.state);
    if (!isNaN(tempVal)) {
      avgHddTemp += tempVal;
      driveCount++;
    }
  });
  if (driveCount > 0) {
    avgHddTemp = avgHddTemp / driveCount;
  }

  if (nasCpuSensor) {
    const val = parseFloat(nasCpuSensor.state) || 0;
    document.getElementById('nas-cpu-val').textContent = `${val.toFixed(1)} %`;
    document.getElementById('nas-cpu-bar').style.width = `${val}%`;
  }
  if (nasVol1Sensor) {
    const val = parseFloat(nasVol1Sensor.state) || 0;
    document.getElementById('nas-vol1-val').textContent = `${val.toFixed(1)} %`;
    document.getElementById('nas-vol1-bar').style.width = `${val}%`;
  }
  if (nasVol2Sensor) {
    const val = parseFloat(nasVol2Sensor.state) || 0;
    document.getElementById('nas-vol2-val').textContent = `${val.toFixed(1)} %`;
    document.getElementById('nas-vol2-bar').style.width = `${val}%`;
  }
  if (nasTempSensor) {
    const val = parseFloat(nasTempSensor.state) || 0;
    document.getElementById('nas-temp').textContent = `${val.toFixed(0)} °C`;
  }
  if (driveCount > 0) {
    document.getElementById('nas-hdd-temp').textContent = `${avgHddTemp.toFixed(1)} °C`;
  }
}

// Global functions for toggling entities (called from inline onchange handlers)
window.toggleHomeAssistantEntity = async function(entityId, isChecked) {
  const domain = entityId.split('.')[0];
  const service = isChecked ? 'turn_on' : 'turn_off';
  
  // Optimistic UI updates
  const itemEl = document.querySelector(`.item[data-entity-id="${entityId}"]`);
  if (itemEl) {
    const icon = itemEl.querySelector('i[data-lucide]');
    if (icon) {
      icon.className = isChecked ? 'text-warning' : 'text-secondary';
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
    if (itemEl) {
      const checkbox = itemEl.querySelector('input[type="checkbox"]');
      if (checkbox) checkbox.checked = !isChecked;
      const icon = itemEl.querySelector('i[data-lucide]');
      if (icon) icon.className = !isChecked ? 'text-warning' : 'text-secondary';
    }
  }
};

window.toggleHomeAssistantCover = async function(entityId, serviceName, buttonEl) {
  // Disable all buttons in this cover's row during the call
  const rowEl = buttonEl.closest('.cover-controls');
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

// Fallback: Render containers using Home Assistant sensors
function renderHAContainers(states) {
  const containerList = document.getElementById('lxc-containers-list');
  const countBadge = document.getElementById('lxc-count-badge');
  
  const containerKeys = [
    'homepage',
    'stirling_pdf',
    'immich',
    'qbittorrent',
    'home_assistant',
    'sicherung',
    'emby',
    'lidarr',
    'sabnzbd',
    'prowlarr',
    'radarr',
    'jellyfin',
    'sonarr'
  ];

  // Discover actual container sensors present in HA
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
    containerList.innerHTML = `
      <div class="loading-spinner-container" style="grid-column: 1/-1;">
        <i data-lucide="info" style="width: 28px; height: 28px;"></i>
        <span>Keine LXC Container über Home Assistant gefunden</span>
      </div>
    `;
    return;
  }

  containerList.innerHTML = activeContainers.map(({ key, statusSensor }) => {
    const state = statusSensor.state; // 'running', 'stopped', etc.
    const isRunning = state === 'running';
    
    // CPU Sensor
    const cpuSensor = states.find(x => x.entity_id === `sensor.${key}_cpu_auslastung`);
    const cpuVal = cpuSensor ? parseFloat(cpuSensor.state) : 0;

    // RAM Sensors
    const memSensor = states.find(x => x.entity_id === `sensor.${key}_arbeitsspeicher_auslastung`);
    const maxMemSensor = states.find(x => x.entity_id === `sensor.${key}_maximale_arbeitsspeicher_auslastung`);
    const memPctSensor = states.find(x => x.entity_id === `sensor.${key}_arbeitsspeicher_auslastung_2`);
    
    let memMB = '--';
    let maxMemMB = '--';
    let memPct = '0';
    
    if (memSensor && maxMemSensor) {
      // States are in GB in Synology/HA sensors (e.g. 0.22 GB)
      memMB = (parseFloat(memSensor.state) * 1024).toFixed(0);
      maxMemMB = (parseFloat(maxMemSensor.state) * 1024).toFixed(0);
    }
    if (memPctSensor) {
      memPct = parseFloat(memPctSensor.state).toFixed(1);
    }

    // Uptime Sensor
    const uptimeSensor = states.find(x => x.entity_id === `sensor.${key}_betriebszeit`);
    // Betriebszeit is in hours
    const uptimeStr = isRunning && uptimeSensor ? formatSecondsUptime(parseFloat(uptimeSensor.state) * 3600) : 'Offline';

    const friendlyName = formatContainerName(key);
    const statusClass = isRunning ? 'text-online' : 'text-offline';
    const actionText = isRunning ? 'Stoppen' : 'Starten';
    const actionVal = isRunning ? 'stop' : 'start';
    const actionIcon = isRunning ? 'square' : 'play';
    const actionButtonClass = isRunning ? 'btn-secondary' : 'btn-primary';

    return `
      <div class="container-card" data-container-key="${key}">
        <div class="container-card-header">
          <div class="container-meta">
            <span class="container-name">${friendlyName}</span>
            <span class="container-vmid" style="font-size: 0.7rem;">HA Sensor</span>
          </div>
          <span class="status-text ${statusClass}" style="font-size: 0.8rem; font-weight: 600; display: flex; align-items: center; gap: 4px;">
            <span class="status-dot" style="background-color: ${isRunning ? 'var(--color-online)' : 'var(--color-offline)'}; width: 6px; height: 6px;"></span>
            ${state.toUpperCase()}
          </span>
        </div>

        <div class="container-stats">
          <div class="container-stat-row">
            <span>CPU:</span>
            <span>${isRunning ? `${cpuVal.toFixed(1)} %` : '--'}</span>
          </div>
          <div class="container-stat-row">
            <span>RAM:</span>
            <span>${isRunning ? `${memMB} MB / ${maxMemMB} MB (${memPct}%)` : '--'}</span>
          </div>
          <div class="container-stat-row">
            <span>Uptime:</span>
            <span>${uptimeStr}</span>
          </div>
        </div>

        <div class="container-card-actions">
          <button class="btn btn-sm ${actionButtonClass}" 
                  onclick="triggerHAContainerAction('${key}', '${actionVal}', this)">
            <i data-lucide="${actionIcon}" style="width: 12px; height: 12px;"></i>
            ${actionText}
          </button>
        </div>
      </div>
    `;
  }).join('');
}

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

window.triggerHAContainerAction = async function(key, action, buttonEl) {
  buttonEl.disabled = true;
  const originalHtml = buttonEl.innerHTML;
  
  // Show spinner inside action button
  buttonEl.innerHTML = `<div class="spinner" style="width: 12px; height: 12px; border-width: 2px;"></div> Verarbeite...`;

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
    
    // Refresh container status after latency
    setTimeout(loadDashboardData, 3000);
  } catch (err) {
    console.error('HA Container Action Error:', err);
    alert(`Aktion fehlgeschlagen: ${err.message}`);
    buttonEl.disabled = false;
    buttonEl.innerHTML = originalHtml;
  }
};

// Render dynamic Proxmox containers
function renderProxmoxContainers(containers) {
  const containerList = document.getElementById('lxc-containers-list');
  const countBadge = document.getElementById('lxc-count-badge');
  
  countBadge.textContent = containers.length;

  if (containers.length === 0) {
    containerList.innerHTML = `
      <div class="loading-spinner-container" style="grid-column: 1/-1;">
        <i data-lucide="info" style="width: 28px; height: 28px;"></i>
        <span>Keine LXC Container auf diesem Node gefunden</span>
      </div>
    `;
    return;
  }

  // Update Proxmox Host stats if not already updated by HA sensors
  // Calculate average CPU and Memory across LXC containers as approximation if needed
  const pveNodeStatus = document.getElementById('pve-node-status');
  pveNodeStatus.textContent = 'Online';
  pveNodeStatus.className = 'status-text text-online';

  let runningCount = 0;
  let totalCpu = 0;
  let totalMem = 0;
  let totalMaxMem = 0;

  containerList.innerHTML = containers.map(lxc => {
    const isRunning = lxc.status === 'running';
    const cpuVal = (lxc.cpu * 100).toFixed(1);
    
    // Memory conversions
    const memMB = (lxc.mem / 1024 / 1024).toFixed(0);
    const maxMemMB = (lxc.maxmem / 1024 / 1024).toFixed(0);
    const memPct = ((lxc.mem / lxc.maxmem) * 100).toFixed(1);

    if (isRunning) {
      runningCount++;
      totalCpu += lxc.cpu;
      totalMem += lxc.mem;
      totalMaxMem += lxc.maxmem;
    }

    const uptimeStr = isRunning ? formatSecondsUptime(lxc.uptime) : 'Offline';
    const statusClass = isRunning ? 'text-online' : 'text-offline';
    const actionText = isRunning ? 'Stoppen' : 'Starten';
    const actionVal = isRunning ? 'stop' : 'start';
    const actionIcon = isRunning ? 'square' : 'play';
    const actionButtonClass = isRunning ? 'btn-secondary' : 'btn-primary';

    return `
      <div class="container-card" data-vmid="${lxc.vmid}">
        <div class="container-card-header">
          <div class="container-meta">
            <span class="container-name">${lxc.name}</span>
            <span class="container-vmid">VMID ${lxc.vmid}</span>
          </div>
          <span class="status-text ${statusClass}" style="font-size: 0.8rem; font-weight: 600; display: flex; align-items: center; gap: 4px;">
            <span class="status-dot" style="background-color: ${isRunning ? 'var(--color-online)' : 'var(--color-offline)'}; width: 6px; height: 6px;"></span>
            ${lxc.status.toUpperCase()}
          </span>
        </div>

        <div class="container-stats">
          <div class="container-stat-row">
            <span>CPU:</span>
            <span>${isRunning ? `${cpuVal} %` : '--'}</span>
          </div>
          <div class="container-stat-row">
            <span>RAM:</span>
            <span>${isRunning ? `${memMB} MB / ${maxMemMB} MB (${memPct}%)` : '--'}</span>
          </div>
          <div class="container-stat-row">
            <span>Uptime:</span>
            <span>${uptimeStr}</span>
          </div>
        </div>

        <div class="container-card-actions">
          <button class="btn btn-sm ${actionButtonClass}" 
                  onclick="triggerContainerAction(${lxc.vmid}, '${actionVal}', this)">
            <i data-lucide="${actionIcon}" style="width: 12px; height: 12px;"></i>
            ${actionText}
          </button>
        </div>
      </div>
    `;
  }).join('');

  // Fallback host status calculation (if Home Assistant didn't provide node gauges)
  const cpuValText = document.getElementById('pve-cpu-val').textContent;
  if (cpuValText === '-- %' && containers.length > 0) {
    // Estimate Node statistics
    const avgCpu = Math.min((totalCpu * 100), 100);
    const avgMem = totalMaxMem > 0 ? (totalMem / totalMaxMem) * 100 : 0;
    
    document.getElementById('pve-cpu-val').textContent = `${avgCpu.toFixed(1)} %`;
    document.getElementById('pve-cpu-bar').style.width = `${avgCpu}%`;
    
    document.getElementById('pve-mem-val').textContent = `${avgMem.toFixed(1)} %`;
    document.getElementById('pve-mem-bar').style.width = `${avgMem}%`;
    
    document.getElementById('pve-uptime').textContent = `${runningCount} aktiv / ${containers.length}`;
  }
}

// Global action handler for starting/stopping Proxmox containers
window.triggerContainerAction = async function(vmid, action, buttonEl) {
  buttonEl.disabled = true;
  const originalHtml = buttonEl.innerHTML;
  
  // Show spinner inside action button
  buttonEl.innerHTML = `<div class="spinner" style="width: 12px; height: 12px; border-width: 2px;"></div> Verarbeite...`;

  try {
    await authenticatedFetch('/proxmox/action', {
      method: 'POST',
      body: JSON.stringify({
        vmid: vmid,
        action: action
      })
    });
    
    // Refresh container status after a short Proxmox latency
    setTimeout(loadDashboardData, 3000);
  } catch (err) {
    console.error('Proxmox Action Error:', err);
    alert(`Aktion fehlgeschlagen: ${err.message}`);
    buttonEl.disabled = false;
    buttonEl.innerHTML = originalHtml;
  }
};

// Error rendering functions
function renderHAError(message) {
  const lightsContainer = document.getElementById('home-lights-controls');
  const storenContainer = document.getElementById('home-storen-controls');
  
  const errorHtml = `
    <div class="item" style="border-color: rgba(244, 63, 94, 0.2); background: rgba(244, 63, 94, 0.05); color: var(--color-offline); width: 100%;">
      <div style="display: flex; align-items: center; gap: 12px;">
        <i data-lucide="alert-triangle" style="width: 20px; height: 20px;"></i>
        <div class="item-info">
          <span class="item-title" style="font-weight: 600;">Home Assistant Ladefehler</span>
          <span class="item-desc" style="color: var(--color-offline);">${message}</span>
        </div>
      </div>
    </div>
  `;
  if (lightsContainer) lightsContainer.innerHTML = errorHtml;
  if (storenContainer) storenContainer.innerHTML = errorHtml;
  lucide.createIcons();
}

function renderProxmoxError(message) {
  const containerList = document.getElementById('lxc-containers-list');
  containerList.innerHTML = `
    <div class="item" style="border-color: rgba(244, 63, 94, 0.2); background: rgba(244, 63, 94, 0.05); color: var(--color-offline); grid-column: 1/-1;">
      <div style="display: flex; align-items: center; gap: 12px;">
        <i data-lucide="alert-triangle" style="width: 20px; height: 20px;"></i>
        <div class="item-info">
          <span class="item-title" style="font-weight: 600;">Proxmox LXC Ladefehler</span>
          <span class="item-desc" style="color: var(--color-offline);">${message}</span>
        </div>
      </div>
    </div>
  `;
  
  const pveNodeStatus = document.getElementById('pve-node-status');
  if (pveNodeStatus) {
    pveNodeStatus.textContent = 'Fehler';
    pveNodeStatus.className = 'status-text text-offline';
  }
  
  lucide.createIcons();
}

function renderEmptyStates() {
  const lightsContainer = document.getElementById('home-lights-controls');
  const storenContainer = document.getElementById('home-storen-controls');
  
  const emptyHtml = `
    <div class="loading-spinner-container">
      <i data-lucide="settings" style="width: 32px; height: 32px; animation: spin 4s infinite linear;"></i>
      <span>Zugangsdaten erforderlich</span>
    </div>
  `;

  if (lightsContainer) lightsContainer.innerHTML = emptyHtml;
  if (storenContainer) storenContainer.innerHTML = emptyHtml;

  const containerList = document.getElementById('lxc-containers-list');
  if (containerList) containerList.innerHTML = emptyHtml;
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

// Start Application on Load
window.addEventListener('DOMContentLoaded', init);
