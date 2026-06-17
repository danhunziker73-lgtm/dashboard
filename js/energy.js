import { CONFIG } from './api.js';

// Render Energy & Consumption Card
export function renderEnergyCard(states) {
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
