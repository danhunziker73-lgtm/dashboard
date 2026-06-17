import { authenticatedFetch, CONFIG, LOCAL_API_URL } from './api.js';
import { loadDashboardData } from '../app.js';
import { Navidrome } from './navidrome.js';

let activeSonosIp = localStorage.getItem('active_sonos_ip') || '';

// Browser state
let isBrowserOpen = false;
let pathHistory = []; // Stack of { contentType, contentId, title, tab }
let currentBrowseResult = null;
let currentTitle = 'Mediathek';
let isLoading = false;
let activeTab = 'home'; // 'home' | 'playlists' | 'shuffle' | 'favorites' | 'genres' | 'search'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDuration(secs) {
  if (!secs) return '';
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// ─── Render helpers ───────────────────────────────────────────────────────────

/**
 * Renders the cover-art grid for album lists (home categories).
 */
function renderAlbumGrid(items) {
  if (!items || items.length === 0) {
    return `<div class="nd-empty">Keine Alben gefunden</div>`;
  }
  return `<div class="nd-album-grid">
    ${items.map(item => {
      const cover = item.coverArt ? Navidrome.getCoverArtUrl(item.coverArt, 120) : '';
      const coverHtml = cover
        ? `<img src="${cover}" alt="cover" loading="lazy">`
        : `<div class="nd-cover-placeholder"><i data-lucide="disc" style="width:24px;height:24px;color:rgba(255,255,255,0.2);"></i></div>`;
      return `
        <div class="nd-album-card" onclick="browseToMedia('${item.media_content_type}', '${item.media_content_id.replace(/'/g, "\\'")}', '${item.title.replace(/'/g, "\\'")}')">
          <div class="nd-album-cover">
            ${coverHtml}
            <div class="nd-album-play-overlay" onclick="event.stopPropagation(); playBrowserMedia('${item.media_content_type}', '${item.media_content_id.replace(/'/g, "\\'")}')">
              <i data-lucide="play" style="width:18px;height:18px;fill:white;"></i>
            </div>
          </div>
          <div class="nd-album-info">
            <div class="nd-album-title" title="${item.title}">${item.title}</div>
            <div class="nd-album-sub" title="${item.subtitle || item.artist || ''}">${item.subtitle || item.artist || ''}</div>
          </div>
        </div>
      `;
    }).join('')}
  </div>`;
}

/**
 * Renders a list of tracks with cover, duration.
 */
function renderTrackList(items) {
  if (!items || items.length === 0) {
    return `<div class="nd-empty">Keine Titel gefunden</div>`;
  }
  return `<div class="nd-track-list">
    ${items.map((item, idx) => {
      const cover = item.coverArt ? Navidrome.getCoverArtUrl(item.coverArt, 40) : '';
      const coverHtml = cover
        ? `<img src="${cover}" alt="" class="nd-track-cover" loading="lazy">`
        : `<div class="nd-track-cover nd-track-cover-placeholder"><i data-lucide="music" style="width:10px;height:10px;"></i></div>`;
      const dur = formatDuration(item.duration);
      const sub = item.artist || item.subtitle || '';
      return `
        <div class="nd-track-row" onclick="playBrowserMedia('${item.media_content_type}', '${item.media_content_id.replace(/'/g, "\\'")}')">
          ${coverHtml}
          <div class="nd-track-info">
            <div class="nd-track-title" title="${item.title}">${item.title}</div>
            ${sub ? `<div class="nd-track-sub">${sub}</div>` : ''}
          </div>
          ${dur ? `<div class="nd-track-dur">${dur}</div>` : ''}
          <div class="nd-track-play-btn">
            <i data-lucide="play" style="width:8px;height:8px;fill:currentColor;"></i>
          </div>
        </div>
      `;
    }).join('')}
  </div>`;
}

/**
 * Renders a simple list (artists, playlists, genres).
 */
function renderListItems(items) {
  if (!items || items.length === 0) {
    return `<div class="nd-empty">Keine Einträge gefunden</div>`;
  }
  return `<div class="nd-list">
    ${items.map(item => {
      const isPlayable = item.can_play;
      const cover = item.coverArt ? Navidrome.getCoverArtUrl(item.coverArt, 40) : '';
      const coverHtml = cover
        ? `<img src="${cover}" alt="" class="nd-list-cover" loading="lazy">`
        : `<div class="nd-list-cover nd-list-cover-placeholder"></div>`;

      const playBtn = isPlayable
        ? `<button class="nd-list-play-btn" onclick="event.stopPropagation(); playBrowserMedia('${item.media_content_type}', '${item.media_content_id.replace(/'/g, "\\'")}')">
             <i data-lucide="play" style="width:9px;height:9px;fill:currentColor;"></i>
           </button>`
        : `<i data-lucide="chevron-right" style="width:12px;height:12px;color:rgba(255,255,255,0.2);flex-shrink:0;"></i>`;

      return `
        <div class="nd-list-item" onclick="browseToMedia('${item.media_content_type}', '${item.media_content_id.replace(/'/g, "\\'")}', '${item.title.replace(/'/g, "\\'")}')">
          ${coverHtml}
          <div class="nd-list-info">
            <div class="nd-list-title" title="${item.title}">${item.title}</div>
            ${item.subtitle ? `<div class="nd-list-sub">${item.subtitle}</div>` : ''}
          </div>
          ${playBtn}
        </div>
      `;
    }).join('')}
  </div>`;
}

/**
 * Renders search results grouped by type.
 */
function renderSearchResults(items) {
  if (!items || items.length === 0) {
    return `<div class="nd-empty">Keine Ergebnisse gefunden</div>`;
  }
  const groups = {};
  items.forEach(item => {
    const g = item._group || 'Sonstiges';
    if (!groups[g]) groups[g] = [];
    groups[g].push(item);
  });

  return Object.entries(groups).map(([group, groupItems]) => `
    <div class="nd-search-group">
      <div class="nd-search-group-label">${group}</div>
      ${group === 'Titel' ? renderTrackList(groupItems) : renderListItems(groupItems)}
    </div>
  `).join('');
}

/**
 * Renders the home tab with category cards.
 */
function renderHomeTab() {
  return `
    <div class="nd-home-grid">
      <div class="nd-category-card nd-cat-new" onclick="browseToCategory('newest')">
        <div class="nd-cat-icon"><i data-lucide="sparkles"></i></div>
        <div class="nd-cat-label">Neu hinzugefügt</div>
      </div>
      <div class="nd-category-card nd-cat-recent" onclick="browseToCategory('recent')">
        <div class="nd-cat-icon"><i data-lucide="clock"></i></div>
        <div class="nd-cat-label">Zuletzt gehört</div>
      </div>
      <div class="nd-category-card nd-cat-frequent" onclick="browseToCategory('frequent')">
        <div class="nd-cat-icon"><i data-lucide="trending-up"></i></div>
        <div class="nd-cat-label">Meistgespielt</div>
      </div>
      <div class="nd-category-card nd-cat-random" onclick="browseToCategory('random')">
        <div class="nd-cat-icon"><i data-lucide="shuffle"></i></div>
        <div class="nd-cat-label">Zufallsmix</div>
      </div>
      <div class="nd-category-card nd-cat-artists" onclick="switchTab('artists')">
        <div class="nd-cat-icon"><i data-lucide="mic-2"></i></div>
        <div class="nd-cat-label">Künstler</div>
      </div>
      <div class="nd-category-card nd-cat-genres" onclick="switchTab('genres')">
        <div class="nd-cat-icon"><i data-lucide="tag"></i></div>
        <div class="nd-cat-label">Genres</div>
      </div>
    </div>
  `;
}

/**
 * Determines what to render for the current browse state.
 */
function renderBrowseContent() {
  if (isLoading) {
    return `<div class="nd-loading"><div class="spinner" style="width:16px;height:16px;border-width:2px;"></div><span>Lade…</span></div>`;
  }

  // If we have items to show (drilled into something)
  if (currentBrowseResult) {
    const items = currentBrowseResult.children || [];
    const firstItem = items[0];

    if (!firstItem) {
      return `<div class="nd-empty">Keine Einträge gefunden</div>`;
    }

    // Track list
    if (firstItem.item_class && firstItem.item_class.includes('audioItem')) {
      return renderTrackList(items);
    }
    // Album grid
    if (firstItem.item_class && firstItem.item_class.includes('album')) {
      return renderAlbumGrid(items);
    }
    // Search results (have _group)
    if (firstItem._group !== undefined) {
      return renderSearchResults(items);
    }
    // Default: list
    return renderListItems(items);
  }

  // Tab home views
  if (activeTab === 'home') return renderHomeTab();
  return `<div class="nd-loading"><div class="spinner" style="width:16px;height:16px;border-width:2px;"></div></div>`;
}

/**
 * Renders the entire browser panel HTML.
 */
function renderBrowserPanel() {
  const tabs = Navidrome.isConfigured() ? [
    { id: 'home',      icon: 'home',       label: 'Home' },
    { id: 'playlists', icon: 'list-music', label: 'Playlists' },
    { id: 'favorites', icon: 'heart',      label: 'Favoriten' },
    { id: 'search',    icon: 'search',     label: 'Suche' },
  ] : [];

  const tabBar = tabs.length ? `
    <div class="nd-tab-bar">
      ${tabs.map(t => `
        <button class="nd-tab-btn ${activeTab === t.id ? 'active' : ''}" onclick="switchTab('${t.id}')">
          <i data-lucide="${t.icon}" style="width:11px;height:11px;"></i>
          ${t.label}
        </button>
      `).join('')}
    </div>
  ` : '';

  const searchBar = (activeTab === 'search') ? `
    <div class="nd-search-bar">
      <div class="nd-search-input-wrap">
        <i data-lucide="search" style="width:13px;height:13px;color:rgba(255,255,255,0.3);"></i>
        <input type="text" id="sonos-search-input" placeholder="Künstler, Album oder Titel…" 
               onkeydown="if(event.key==='Enter') searchNavidrome(this.value)">
      </div>
      <button class="nd-search-btn" onclick="searchNavidrome(document.getElementById('sonos-search-input').value)">
        Suchen
      </button>
    </div>
  ` : '';

  const showBack = pathHistory.length > 0;
  const header = (showBack || currentBrowseResult) ? `
    <div class="nd-browser-header">
      ${showBack ? `
        <button class="nd-back-btn" onclick="navigateSonosBrowserBack()">
          <i data-lucide="chevron-left" style="width:13px;height:13px;"></i>
        </button>
      ` : '<div style="width:22px;"></div>'}
      <span class="nd-browser-title">${currentTitle}</span>
      <div id="nd-browser-loading" class="spinner ${isLoading ? '' : 'hidden'}" style="width:10px;height:10px;border-width:1.5px;border-color:rgba(255,255,255,0.4) transparent transparent transparent;"></div>
    </div>
  ` : '';

  return `
    <div class="sonos-browser-panel" id="sonos-browser-panel">
      ${tabBar}
      ${searchBar}
      ${header}
      <div class="nd-browser-content" id="nd-browser-content">
        ${renderBrowseContent()}
      </div>
    </div>
  `;
}

function updateBrowserUI() {
  const panel = document.getElementById('sonos-browser-panel');
  if (!panel) return;

  // Update content area only if panel exists
  const contentEl = document.getElementById('nd-browser-content');
  const loadingEl = document.getElementById('nd-browser-loading');

  if (loadingEl) {
    if (isLoading) loadingEl.classList.remove('hidden');
    else loadingEl.classList.add('hidden');
  }

  if (contentEl) {
    contentEl.innerHTML = renderBrowseContent();
    lucide.createIcons();
  }
}

// ─── Data fetchers ─────────────────────────────────────────────────────────────

async function fetchBrowseMedia(contentType = '', contentId = '', title = '') {
  isLoading = true;
  currentTitle = title || 'Mediathek';
  updateBrowserUI();

  try {
    let children = [];

    if (!Navidrome.isConfigured()) {
      // Fallback: Sonos local browse
      let endpoint = `${LOCAL_API_URL}/api/sonos/browse?ip=${activeSonosIp}`;
      if (contentId) endpoint += `&item_id=${encodeURIComponent(contentId)}`;
      const data = await (await fetch(endpoint)).json();
      children = data.children || [];
    } else {
      // Navidrome mode: dispatch by contentId prefix
      if (contentId.startsWith('artist:')) {
        children = await Navidrome.getArtistAlbums(contentId.split(':')[1]);
        currentTitle = title;
      } else if (contentId.startsWith('album:')) {
        children = await Navidrome.getAlbumTracks(contentId.split(':')[1]);
        currentTitle = title;
      } else if (contentId.startsWith('playlist:')) {
        children = await Navidrome.getPlaylistTracks(contentId.split(':')[1]);
        currentTitle = title;
      } else if (contentId.startsWith('genre:')) {
        const genre = decodeURIComponent(contentId.split(':')[1]);
        children = await Navidrome.getAlbumsByGenre(genre);
        currentTitle = title || genre;
      } else if (contentId.startsWith('category:')) {
        const cat = contentId.split(':')[1];
        const labelMap = { newest: 'Neu hinzugefügt', recent: 'Zuletzt gehört', frequent: 'Meistgespielt', random: 'Zufallsmix' };
        children = await Navidrome.getAlbumList(cat, 24);
        currentTitle = labelMap[cat] || title;
      }
    }

    currentBrowseResult = { children };
  } catch (err) {
    console.error('Sonos/Navidrome Browse Error:', err);
    currentBrowseResult = { children: [] };
  } finally {
    isLoading = false;
    updateBrowserUI();
  }
}

async function loadTab(tab) {
  activeTab = tab;
  pathHistory = [];
  currentBrowseResult = null;
  isLoading = true;
  currentTitle = { home: 'Home', playlists: 'Playlists', favorites: 'Favoriten', search: 'Suche', artists: 'Künstler', genres: 'Genres' }[tab] || tab;

  // Rebuild the panel to show new tab selection and search bar
  rebuildBrowserPanel();

  try {
    if (tab === 'home') {
      // Home just shows category cards — no fetch needed
      isLoading = false;
      currentBrowseResult = null;
    } else if (tab === 'playlists') {
      const items = await Navidrome.getPlaylists();
      currentBrowseResult = { children: items };
    } else if (tab === 'favorites') {
      const items = await Navidrome.getStarred();
      currentBrowseResult = { children: items };
    } else if (tab === 'artists') {
      const items = await Navidrome.getArtists();
      currentBrowseResult = { children: items };
    } else if (tab === 'genres') {
      const items = await Navidrome.getGenres();
      currentBrowseResult = { children: items };
    } else if (tab === 'search') {
      isLoading = false;
      currentBrowseResult = null;
    }
  } catch (err) {
    console.error('Tab load error:', err);
    currentBrowseResult = { children: [] };
  } finally {
    isLoading = false;
    updateBrowserUI();
  }
}

function rebuildBrowserPanel() {
  const section = document.getElementById('sonos-browser-section');
  if (!section) return;
  const panelContainer = section.querySelector('.sonos-browser-panel-wrap');
  if (!panelContainer) return;
  panelContainer.innerHTML = renderBrowserPanel();
  lucide.createIcons();
}

// ─── Render Sonos Card ─────────────────────────────────────────────────────────

export function renderSonosCard(sonosDevices) {
  const container = document.getElementById('sonos-card-body');
  if (!container) return;

  if (!sonosDevices || sonosDevices.length === 0) {
    container.innerHTML = `
      <div class="loading-spinner-container">
        <i data-lucide="music" style="width: 24px; height: 24px; color: var(--text-secondary);"></i>
        <span>Keine Sonos-Geräte im Netzwerk gefunden</span>
      </div>
    `;
    return;
  }

  let activeDevice = sonosDevices.find(x => x.ip === activeSonosIp);
  if (!activeDevice) {
    activeDevice = sonosDevices[0];
    activeSonosIp = activeDevice.ip;
    localStorage.setItem('active_sonos_ip', activeSonosIp);
  }

  const state = activeDevice.state;
  const isPlaying = state === 'playing';
  const isPaused = state === 'paused';
  const isOffline = state === 'offline';
  const title = activeDevice.track.title || 'Keine Wiedergabe';
  const artist = activeDevice.track.artist || 'Bereit zum Abspielen';
  const volume = activeDevice.volume;
  const isMuted = activeDevice.mute;
  const entityPicture = activeDevice.track.album_art;

  let imgHtml = '';
  if (entityPicture) {
    imgHtml = `<img src="${entityPicture}" alt="Album Art" class="sonos-album-art" style="object-fit: cover;">`;
  } else {
    imgHtml = `
      <div class="sonos-album-art-placeholder ${isPlaying ? 'pulse-music' : ''}">
        <i data-lucide="music" style="width: 40px; height: 40px; color: #8b5cf6;"></i>
      </div>
    `;
  }

  let statusText = 'Standby';
  let statusClass = 'state-offline';
  if (isPlaying) { statusText = 'Spielt'; statusClass = 'state-connected'; }
  else if (isPaused) { statusText = 'Pausiert'; statusClass = 'state-warning'; }
  else if (isOffline) { statusText = 'Offline'; statusClass = 'state-error'; }

  const browserSection = Navidrome.isConfigured() ? `
    <div class="sonos-browser-section" id="sonos-browser-section" style="border-top: 1px solid rgba(255,255,255,0.05); margin-top: 4px; padding-top: 8px;">
      <button class="sonos-browser-toggle-btn" onclick="toggleSonosBrowser()">
        <i data-lucide="${isBrowserOpen ? 'x' : 'library'}" style="width: 12px; height: 12px; margin-right: 4px;"></i>
        ${isBrowserOpen ? 'Mediathek schließen' : 'Navidrome Mediathek öffnen'}
      </button>
      ${isBrowserOpen ? `<div class="sonos-browser-panel-wrap">${renderBrowserPanel()}</div>` : ''}
    </div>
  ` : `
    <div class="sonos-browser-section" id="sonos-browser-section" style="border-top: 1px solid rgba(255,255,255,0.05); margin-top: 4px; padding-top: 8px;">
      <button class="sonos-browser-toggle-btn" onclick="toggleSonosBrowser()">
        <i data-lucide="${isBrowserOpen ? 'x' : 'folder-open'}" style="width: 12px; height: 12px; margin-right: 4px;"></i>
        ${isBrowserOpen ? 'Bibliothek schließen' : 'Musikbibliothek & Favoriten'}
      </button>
      ${isBrowserOpen ? `
        <div class="sonos-browser-panel-wrap">
          <div class="sonos-browser-panel" id="sonos-browser-panel">
            <div class="nd-browser-header">
              <button class="nd-back-btn ${pathHistory.length === 0 ? 'hidden' : ''}" onclick="navigateSonosBrowserBack()">
                <i data-lucide="chevron-left" style="width:13px;height:13px;"></i>
              </button>
              <span class="nd-browser-title">${currentTitle}</span>
              <div id="nd-browser-loading" class="spinner hidden" style="width:10px;height:10px;border-width:1.5px;"></div>
            </div>
            <div class="nd-browser-content" id="nd-browser-content">
              ${renderBrowseContent()}
            </div>
          </div>
        </div>
      ` : ''}
    </div>
  `;

  container.innerHTML = `
    <div class="sonos-wrapper">
      <!-- Device Tabs -->
      <div class="sonos-tabs">
        ${sonosDevices.map(device => {
          const isSelected = device.ip === activeSonosIp;
          const statusSuffix = device.state === 'playing' ? ' 🎵' : '';
          return `
            <button class="sonos-tab-btn ${isSelected ? 'active' : ''}" 
                    onclick="selectSonosDevice('${device.ip}')">
              ${device.name}${statusSuffix}
            </button>
          `;
        }).join('')}
      </div>

      <!-- Player -->
      <div class="sonos-player-layout">
        <div class="sonos-art-container">
          ${imgHtml}
          <span class="indicator-pill ${statusClass} sonos-status-pill">
            <span class="status-dot"></span> ${statusText}
          </span>
        </div>

        <div class="sonos-info-controls">
          <div class="sonos-track-info">
            <div class="sonos-title" title="${title}">${title}</div>
            <div class="sonos-artist" title="${artist}">${artist}</div>
          </div>

          <div class="sonos-controls-row">
            <button class="btn-icon-sm btn-prev" onclick="controlSonos('previous')" title="Vorheriger Titel" ${isOffline ? 'disabled' : ''}>
              <i data-lucide="skip-back"></i>
            </button>
            <button class="btn-icon-md btn-play-pause ${isPlaying ? 'active-playing' : ''}" 
                    onclick="controlSonos('${isPlaying ? 'pause' : 'play'}')" 
                    title="${isPlaying ? 'Pause' : 'Abspielen'}" ${isOffline ? 'disabled' : ''}>
              <i data-lucide="${isPlaying ? 'pause' : 'play'}"></i>
            </button>
            <button class="btn-icon-sm btn-next" onclick="controlSonos('next')" title="Nächster Titel" ${isOffline ? 'disabled' : ''}>
              <i data-lucide="skip-forward"></i>
            </button>
          </div>

          <div class="sonos-volume-row">
            <button class="btn-icon-sm btn-mute ${isMuted ? 'text-offline' : ''}" 
                    onclick="controlSonos('mute', ${!isMuted})" 
                    title="${isMuted ? 'Mute aus' : 'Stumm'}" ${isOffline ? 'disabled' : ''}>
              <i data-lucide="${isMuted || volume === 0 ? 'volume-x' : (volume < 50 ? 'volume-1' : 'volume-2')}"></i>
            </button>
            <input type="range" class="sonos-volume-slider" min="0" max="100" value="${volume}" 
                   onchange="setSonosVolume(this.value)" 
                   oninput="this.nextElementSibling.textContent = this.value + '%'"
                   ${isOffline ? 'disabled' : ''}>
            <span class="sonos-vol-text font-mono">${volume}%</span>
          </div>
        </div>
      </div>

      ${browserSection}
    </div>
  `;
}

// ─── Global window actions ─────────────────────────────────────────────────────

window.selectSonosDevice = function(ip) {
  activeSonosIp = ip;
  localStorage.setItem('active_sonos_ip', ip);
  pathHistory = [];
  currentBrowseResult = null;
  currentTitle = 'Mediathek';
  loadDashboardData();
};

window.toggleSonosBrowser = async function() {
  isBrowserOpen = !isBrowserOpen;
  if (isBrowserOpen) {
    // Reset to home tab
    activeTab = 'home';
    pathHistory = [];
    currentBrowseResult = null;
    currentTitle = 'Home';
  }
  loadDashboardData(); // Re-render card
};

window.switchTab = async function(tab) {
  await loadTab(tab);
};

window.browseToCategory = async function(categoryType) {
  const labelMap = { newest: 'Neu hinzugefügt', recent: 'Zuletzt gehört', frequent: 'Meistgespielt', random: 'Zufallsmix' };
  pathHistory.push({ contentType: '', contentId: '', title: currentTitle, tab: activeTab });
  await fetchBrowseMedia('category', `category:${categoryType}`, labelMap[categoryType] || categoryType);
};

window.browseToMedia = async function(contentType, contentId, title) {
  pathHistory.push({ contentType: '', contentId: '', title: currentTitle, tab: activeTab });
  await fetchBrowseMedia(contentType, contentId, title);
};

window.navigateSonosBrowserBack = async function() {
  if (pathHistory.length === 0) return;
  const prev = pathHistory.pop();

  // If going back to the tab root
  if (!prev.contentId && !prev.contentType) {
    currentBrowseResult = null;
    currentTitle = prev.title;
    activeTab = prev.tab || activeTab;

    if (activeTab === 'home') {
      isLoading = false;
      rebuildBrowserPanel();
      updateBrowserUI();
    } else {
      await loadTab(activeTab);
    }
    return;
  }
  await fetchBrowseMedia(prev.contentType, prev.contentId, prev.title);
};

window.searchNavidrome = async function(query) {
  if (!query || !query.trim()) return;
  isLoading = true;
  currentTitle = `"${query.trim()}"`;
  pathHistory = [{ contentType: '', contentId: '', title: 'Suche', tab: 'search' }];
  updateBrowserUI();

  try {
    const results = await Navidrome.search(query.trim());
    currentBrowseResult = { children: results };
  } catch (err) {
    console.error('Navidrome Search Error:', err);
    currentBrowseResult = { children: [] };
  } finally {
    isLoading = false;
    updateBrowserUI();
  }
};

window.playBrowserMedia = async function(contentType, contentId) {
  if (!activeSonosIp) {
    alert('Kein Sonos-Gerät ausgewählt.');
    return;
  }

  isLoading = true;
  updateBrowserUI();

  try {
    if (contentId.startsWith('track:')) {
      const trackId = contentId.split(':')[1];
      const streamUrl = Navidrome.getStreamUrl(trackId);
      await fetch(`${LOCAL_API_URL}/api/sonos/control`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ip: activeSonosIp, action: 'play_uri', value: streamUrl })
      });
    } else if (contentId.startsWith('album:')) {
      const albumId = contentId.split(':')[1];
      const tracks = await Navidrome.getAlbumTracks(albumId);
      const urls = tracks.map(t => t.uri).filter(Boolean);
      await fetch(`${LOCAL_API_URL}/api/sonos/control`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ip: activeSonosIp, action: 'play_queue', urls })
      });
    } else if (contentId.startsWith('playlist:')) {
      const plId = contentId.split(':')[1];
      const tracks = await Navidrome.getPlaylistTracks(plId);
      const urls = tracks.map(t => t.uri).filter(Boolean);
      await fetch(`${LOCAL_API_URL}/api/sonos/control`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ip: activeSonosIp, action: 'play_queue', urls })
      });
    } else {
      // Fallback: local Sonos item
      const item = currentBrowseResult && currentBrowseResult.children
        ? currentBrowseResult.children.find(x => x.media_content_id === contentId)
        : null;
      if (item && item.uri) {
        await fetch(`${LOCAL_API_URL}/api/sonos/control`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ip: activeSonosIp, action: 'play_uri', value: item.uri })
        });
      }
    }
    setTimeout(loadDashboardData, 800);
  } catch (err) {
    console.error('Sonos Play Error:', err);
    alert(`Wiedergabe fehlgeschlagen: ${err.message}`);
  } finally {
    isLoading = false;
    updateBrowserUI();
  }
};

window.controlSonos = async function(action, value = null) {
  if (!activeSonosIp) return;
  try {
    await fetch(`${LOCAL_API_URL}/api/sonos/control`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ip: activeSonosIp, action: action, value: value })
    });
    setTimeout(loadDashboardData, 800);
  } catch (err) {
    console.error('Sonos Control Error:', err);
    alert(`Steuerung fehlgeschlagen: ${err.message}`);
  }
};

window.setSonosVolume = async function(volumeLevelPercent) {
  if (!activeSonosIp) return;
  try {
    await fetch(`${LOCAL_API_URL}/api/sonos/control`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ip: activeSonosIp, action: 'volume', value: volumeLevelPercent })
    });
    const label = document.querySelector('.sonos-vol-text');
    if (label) label.textContent = `${volumeLevelPercent}%`;
  } catch (err) {
    console.error('Sonos Volume Set Error:', err);
  }
};
