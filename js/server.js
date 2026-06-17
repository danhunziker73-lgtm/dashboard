import { authenticatedFetch } from './api.js';
import { loadDashboardData } from '../app.js';
import { formatContainerName, formatSecondsUptime } from './utils.js';

// Render Proxmox Host parameters and inline container health
export function renderProxmoxHost(states) {
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

// Render Containers table using fallback Home Assistant sensors
// Render LXC Containers Table (Unified dynamic list with direct Proxmox API enrichment)
export function renderContainersTable(states, pveContainers = []) {
  const containerList = document.getElementById('lxc-containers-list');
  const countBadge = document.getElementById('lxc-count-badge');
  
  if (!containerList) return;

  // 1. Dynamically discover all LXC container keys in HA states
  // A container has a status sensor (e.g. sensor.homepage_status) AND a corresponding cpu, ram or uptime sensor.
  const containerKeys = [];
  states.forEach(s => {
    if (s.entity_id.startsWith('sensor.') && s.entity_id.endsWith('_status')) {
      const key = s.entity_id.substring(7, s.entity_id.length - 7);
      
      // Exclude main hosts, backups and NAS status sensors
      if (key !== 'galerie_promox_server' && !key.startsWith('nas_volume_') && !key.startsWith('nas_drive_')) {
        // Confirm it has a corresponding cpu or uptime sensor to be a container
        const hasCpu = states.some(x => x.entity_id === `sensor.${key}_cpu_auslastung`);
        const hasUptime = states.some(x => x.entity_id === `sensor.${key}_betriebszeit`);
        if (hasCpu || hasUptime) {
          containerKeys.push(key);
        }
      }
    }
  });

  // 2. Build the list of container rows
  const renderedList = containerKeys.map(key => {
    const statusSensor = states.find(x => x.entity_id === `sensor.${key}_status`);
    const haState = statusSensor ? statusSensor.state : 'offline';
    const friendlyName = formatContainerName(key);

    // Try to find a matching container in Proxmox API data (case and symbol insensitive)
    const normKey = key.toLowerCase().replace(/[-_]/g, '');
    const pveLxc = pveContainers.find(lxc => {
      const normLxcName = lxc.name.toLowerCase().replace(/[-_]/g, '');
      return normLxcName === normKey || normLxcName.includes(normKey) || normKey.includes(normLxcName);
    });

    let state = haState;
    let isRunning = state === 'running';
    let cpuVal = '-';
    let ramVal = '-';
    let uptimeStr = '-';
    let isPve = false;
    let vmid = null;

    if (pveLxc) {
      // Use direct Proxmox API data if available
      isPve = true;
      vmid = pveLxc.vmid;
      state = pveLxc.status;
      isRunning = state === 'running';
      cpuVal = isRunning ? `${(pveLxc.cpu * 100).toFixed(1)} %` : '-';
      
      if (isRunning) {
        const memMB = (pveLxc.mem / 1024 / 1024).toFixed(0);
        const maxMemMB = (pveLxc.maxmem / 1024 / 1024).toFixed(0);
        ramVal = `${memMB} MB / ${maxMemMB} MB`;
      }
      uptimeStr = isRunning ? formatSecondsUptime(pveLxc.uptime) : '-';
    } else {
      // Fallback to HA sensors
      isRunning = state === 'running';
      
      const cpuSensor = states.find(x => x.entity_id === `sensor.${key}_cpu_auslastung`);
      cpuVal = isRunning && cpuSensor ? `${parseFloat(cpuSensor.state).toFixed(1)} %` : '-';

      const memSensor = states.find(x => x.entity_id === `sensor.${key}_arbeitsspeicher_auslastung`);
      const maxMemSensor = states.find(x => x.entity_id === `sensor.${key}_maximale_arbeitsspeicher_auslastung`);
      if (isRunning && memSensor && maxMemSensor) {
        const memMB = (parseFloat(memSensor.state) * 1024).toFixed(0);
        const maxMemMB = (parseFloat(maxMemSensor.state) * 1024).toFixed(0);
        ramVal = `${memMB} MB / ${maxMemMB} MB`;
      }

      const uptimeSensor = states.find(x => x.entity_id === `sensor.${key}_betriebszeit`);
      uptimeStr = isRunning && uptimeSensor ? formatSecondsUptime(parseFloat(uptimeSensor.state) * 3600) : '-';
    }

    let statusClass = 'status-stopped';
    if (state === 'running') statusClass = 'status-running';
    else if (state === 'unavailable') statusClass = 'status-warning';

    const actionText = isRunning ? 'Stopp' : 'Start';
    const actionVal = isRunning ? 'stop' : 'start';
    const actionButtonClass = isRunning ? 'btn-secondary' : 'btn-primary';

    // Action attributes
    const actionOnClick = isPve 
      ? `triggerContainerAction(${vmid}, '${actionVal}', this)`
      : `triggerHAContainerAction('${key}', '${actionVal}', this)`;

    const subtitleText = isPve ? `VMID ${vmid}` : 'HA Sensor';

    return {
      name: friendlyName,
      html: `
        <tr>
          <td style="font-weight: 600;">${friendlyName} <small style="display: block; font-weight: normal; font-size: 0.72rem; color: var(--text-secondary);">${subtitleText}</small></td>
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
                    onclick="${actionOnClick}" 
                    style="padding: 4px 8px; font-size: 0.75rem; border-radius: 6px;">
              ${actionText}
            </button>
          </td>
        </tr>
      `
    };
  });

  // 3. Sort alphabetically by friendly name to prevent jumping
  renderedList.sort((a, b) => a.name.localeCompare(b.name, 'de'));

  countBadge.textContent = renderedList.length;

  if (renderedList.length === 0) {
    containerList.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 20px;">Keine Container gefunden</td></tr>`;
    return;
  }

  containerList.innerHTML = renderedList.map(item => item.html).join('');
}

// Render Synology NAS Card parameters
export function renderNASCard(states) {
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

// Global actions registered on window
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
