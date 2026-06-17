import { loadDashboardData } from '../app.js';

// Render Venta Humidifier Card (detailed 31-entity support)
export function renderVentaCard(states) {
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
    
    // Sanity check for malformed humidity sensor values (e.g. "-62.-1")
    if (idSuffix === '_feuchtigkeit' && (val.includes('-') || parseFloat(val) < 0)) {
      return '<span class="text-offline" style="font-weight: 600;" title="Gerätesensor liefert ungültige Werte">Sensorfehler</span>';
    }

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
