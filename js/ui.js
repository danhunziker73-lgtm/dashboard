import { CONFIG, updateConfig } from './api.js';
import { startAutoRefresh } from '../app.js';

export function setupEventListeners() {
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
    const navUrl = document.getElementById('input-navidrome-url').value.trim().replace(/\/$/, '');
    const navUser = document.getElementById('input-navidrome-user').value.trim();
    const navPass = document.getElementById('input-navidrome-pass').value.trim();
    
    updateConfig(url, key, rate, navUrl, navUser, navPass);
    
    closeSettingsModal();
    showSetupBanner(false);
    startAutoRefresh();
  });

  // Test Connection Action
  btnTestConnection.addEventListener('click', async () => {
    const url = document.getElementById('input-api-url').value.trim().replace(/\/$/, '');
    const key = document.getElementById('input-api-key').value.trim();
    const navUrl = document.getElementById('input-navidrome-url').value.trim().replace(/\/$/, '');
    const navUser = document.getElementById('input-navidrome-user').value.trim();
    const navPass = document.getElementById('input-navidrome-pass').value.trim();
    
    if (!url && !key && !navUrl) {
      showTestResult('Bitte Verbindungsdaten zum Testen eingeben.', 'error');
      return;
    }

    btnTestConnection.disabled = true;
    showTestResult('Verbindung wird getestet...', 'warning');

    let results = [];
    let hasError = false;

    // 1. Test Home Assistant
    if (url || key) {
      if (!url || !key) {
        results.push('✗ HA: URL und API-Schlüssel sind erforderlich.');
        hasError = true;
      } else {
        try {
          const res = await fetch(`${url}/states`, {
            headers: {
              'Authorization': `Bearer ${key}`,
              'Content-Type': 'application/json'
            }
          });
          if (res.ok) {
            results.push('✓ Home Assistant: OK');
          } else if (res.status === 401) {
            results.push('✗ Home Assistant: Unautorisiert (Falscher Schlüssel)');
            hasError = true;
          } else {
            results.push(`✗ Home Assistant: Fehler (HTTP ${res.status})`);
            hasError = true;
          }
        } catch (err) {
          results.push(`✗ Home Assistant: Verbindung fehlgeschlagen (${err.message})`);
          hasError = true;
        }
      }
    }

    // 2. Test Navidrome
    if (navUrl) {
      try {
        let hex = '';
        for (let i = 0; i < navPass.length; i++) {
          hex += navPass.charCodeAt(i).toString(16);
        }
        const encPass = 'enc:' + hex;
        
        const testUrl = `${navUrl}/rest/ping.view?u=${encodeURIComponent(navUser)}&p=${encPass}&v=1.16.1&c=antigravity-dashboard&f=json`;
        const res = await fetch(testUrl);
        if (res.ok) {
          const data = await res.json();
          const subRes = data['subsonic-response'];
          if (subRes && subRes.status === 'ok') {
            results.push('✓ Navidrome: OK');
          } else {
            const errorMsg = (subRes && subRes.error) ? subRes.error.message : 'Unbekannter Fehler';
            results.push(`✗ Navidrome: API-Fehler (${errorMsg})`);
            hasError = true;
          }
        } else {
          results.push(`✗ Navidrome: HTTP ${res.status}`);
          hasError = true;
        }
      } catch (err) {
        results.push(`✗ Navidrome: Verbindung fehlgeschlagen (${err.message})`);
        hasError = true;
      }
    }

    showTestResult(results.join(' | '), hasError ? 'error' : 'success');
    btnTestConnection.disabled = false;
  });
}

export function openSettingsModal() {
  document.getElementById('input-api-url').value = CONFIG.apiUrl;
  document.getElementById('input-api-key').value = CONFIG.apiKey;
  document.getElementById('input-energy-rate').value = CONFIG.energyRate;
  document.getElementById('input-navidrome-url').value = CONFIG.navidromeUrl || '';
  document.getElementById('input-navidrome-user').value = CONFIG.navidromeUser || '';
  document.getElementById('input-navidrome-pass').value = CONFIG.navidromePass || '';
  document.getElementById('settings-modal').classList.remove('hidden');
  hideTestResult();
  lucide.createIcons();
}

export function closeSettingsModal() {
  document.getElementById('settings-modal').classList.add('hidden');
}

export function showSetupBanner(show) {
  const banner = document.getElementById('setup-banner');
  if (banner) {
    if (show) {
      banner.classList.remove('hidden');
    } else {
      banner.classList.add('hidden');
    }
  }
}

export function showTestResult(message, type) {
  const resultDiv = document.getElementById('test-result');
  resultDiv.className = `test-result-msg msg-${type}`;
  resultDiv.textContent = message;
  resultDiv.classList.remove('hidden');
}

export function hideTestResult() {
  document.getElementById('test-result').classList.add('hidden');
}

export function renderEmptyStates() {
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
