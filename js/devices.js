import { authenticatedFetch } from './api.js';
import { loadDashboardData } from '../app.js';

// Render Compact Lighting and Devices List (dynamically finds all lights)
export function renderCompactLights(states) {
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

    // Extract device details (temperature & power) if available
    let detailsHtml = '';
    if (entity.entity_id === 'light.dimmer') {
      const tempSensor = states.find(x => x.entity_id === 'sensor.shellydimmerg4_acebe6e8d378_temperatur');
      const powerSensor = states.find(x => x.entity_id === 'sensor.dimmer_leistung');
      const detailParts = [];
      if (tempSensor && tempSensor.state !== 'unknown' && tempSensor.state !== 'unavailable') {
        detailParts.push(`<span class="detail-pill"><i data-lucide="thermometer" style="width: 10px; height: 10px; display: inline-block; vertical-align: middle; margin-right: 2px;"></i>${parseFloat(tempSensor.state).toFixed(1)}°C</span>`);
      }
      if (powerSensor && powerSensor.state !== 'unknown' && powerSensor.state !== 'unavailable') {
        detailParts.push(`<span class="detail-pill"><i data-lucide="zap" style="width: 10px; height: 10px; display: inline-block; vertical-align: middle; margin-right: 2px;"></i>${parseFloat(powerSensor.state).toFixed(0)}W</span>`);
      }
      if (detailParts.length > 0) {
        detailsHtml = `<div class="device-details-pills">${detailParts.join('')}</div>`;
      }
    } else if (entity.entity_id === 'switch.brunnen') {
      const powerSensor = states.find(x => x.entity_id === 'sensor.brunnen_leistung');
      if (powerSensor && powerSensor.state !== 'unknown' && powerSensor.state !== 'unavailable') {
        detailsHtml = `<div class="device-details-pills"><span class="detail-pill"><i data-lucide="zap" style="width: 10px; height: 10px; display: inline-block; vertical-align: middle; margin-right: 2px;"></i>${parseFloat(powerSensor.state).toFixed(1)}W</span></div>`;
      }
    }

    return `
      <div class="compact-device-row ${isActive ? 'device-active' : ''}" 
           onclick="toggleHomeAssistantEntity('${entity.entity_id}', ${!isActive})">
        <div class="compact-device-left">
          <span class="status-dot"></span>
          <div class="device-name-container">
            <span class="device-name">${friendlyName}</span>
            ${detailsHtml}
          </div>
        </div>
        <i data-lucide="${icon}" style="width: 14px; height: 14px;"></i>
      </div>
    `;
  }).join('');
}

// Render Shutters (Storen) with progress position bars
export function renderShutterControls(states) {
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

// Global functions for toggling entities (attached to window so inline onclick handlers work)
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

// Render Access & Security Controls (Zutritt & Sicherheit)
export function renderAccessControls(states) {
  const container = document.getElementById('home-access-controls');
  const statusBadge = document.getElementById('access-status-badge');

  if (!container) return;

  // 1. Presence of Dan
  const personDan = states.find(x => x.entity_id === 'person.dan' || x.entity_id === 'device_tracker.dan_quatorze');
  const danBattery = states.find(x => x.entity_id === 'sensor.dan_quatorze_battery_level');
  
  let presenceText = 'Abwesend';
  let presenceClass = 'status-stopped';
  let presenceIcon = 'user-x';
  if (personDan) {
    const isHome = personDan.state === 'home' || personDan.state === 'online';
    presenceText = isHome ? 'Anwesend' : 'Abwesend';
    presenceClass = isHome ? 'status-running' : 'status-stopped';
    presenceIcon = isHome ? 'user-check' : 'user-x';
  }
  const batteryStr = danBattery && danBattery.state !== 'unknown' && danBattery.state !== 'unavailable' 
    ? ` (${danBattery.state}%)` 
    : '';

  // 2. NAS Security Status
  const nasSecSensor = states.find(x => x.entity_id === 'binary_sensor.nas_sicherheitsstatus');
  let securityText = 'Sicher';
  let securityClass = 'status-running';
  let securityIcon = 'shield';
  if (nasSecSensor) {
    const isOk = nasSecSensor.state === 'on' || nasSecSensor.state === 'safe' || nasSecSensor.state === 'ok';
    securityText = isOk ? 'Sicher' : 'Gefährdet';
    securityClass = isOk ? 'status-running' : 'status-offline';
    securityIcon = isOk ? 'shield' : 'shield-alert';
  }

  // 3. Venta Door Status
  const ventaDoorSensor = states.find(x => x.entity_id === 'binary_sensor.venta_ah902_tur_offen');
  let doorText = 'Geschlossen';
  let doorClass = 'status-running';
  let doorIcon = 'door-closed';
  if (ventaDoorSensor && ventaDoorSensor.state !== 'unavailable' && ventaDoorSensor.state !== 'unknown') {
    const isOpen = ventaDoorSensor.state === 'on' || ventaDoorSensor.state === 'open' || ventaDoorSensor.state === 'true';
    doorText = isOpen ? 'Offen' : 'Geschlossen';
    doorClass = isOpen ? 'status-offline' : 'status-running';
    doorIcon = isOpen ? 'door-open' : 'door-closed';
  }

  // Set overall status badge
  const isAllSecure = presenceText === 'Abwesend' && securityText === 'Sicher' && doorText === 'Geschlossen';
  if (statusBadge) {
    statusBadge.textContent = isAllSecure ? 'Sicher' : 'Aktivität';
    statusBadge.className = `badge ${isAllSecure ? 'text-online' : 'text-warning'}`;
  }

  container.innerHTML = `
    <!-- Presence Row -->
    <div class="compact-device-row device-static">
      <div class="compact-device-left">
        <span class="status-dot ${presenceClass}"></span>
        <div class="device-name-container">
          <span class="device-name">Anwesenheit Dan</span>
          <span style="font-size: 0.72rem; color: var(--text-secondary);">
            Status: ${presenceText}${batteryStr}
          </span>
        </div>
      </div>
      <i data-lucide="${presenceIcon}" style="width: 14px; height: 14px;"></i>
    </div>

    <!-- NAS Security Row -->
    <div class="compact-device-row device-static">
      <div class="compact-device-left">
        <span class="status-dot ${securityClass}"></span>
        <div class="device-name-container">
          <span class="device-name">NAS Sicherheit</span>
          <span style="font-size: 0.72rem; color: var(--text-secondary);">
            Status: ${securityText}
          </span>
        </div>
      </div>
      <i data-lucide="${securityIcon}" style="width: 14px; height: 14px;"></i>
    </div>

    <!-- Venta Door Row -->
    <div class="compact-device-row device-static">
      <div class="compact-device-left">
        <span class="status-dot ${doorClass}"></span>
        <div class="device-name-container">
          <span class="device-name">Venta Gerätetür</span>
          <span style="font-size: 0.72rem; color: var(--text-secondary);">
            Status: ${doorText}
          </span>
        </div>
      </div>
      <i data-lucide="${doorIcon}" style="width: 14px; height: 14px;"></i>
    </div>
  `;
}

