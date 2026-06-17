import { formatContainerName } from './utils.js';

export function updateHeaderStatus(states, haSuccess, pveSuccess) {
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
