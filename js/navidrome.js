import { CONFIG, getServerLanIp } from './api.js';

/**
 * Encodes cleartext password to Subsonic-compatible hex string format.
 */
function encodePassword(password) {
  let hex = '';
  for (let i = 0; i < password.length; i++) {
    hex += password.charCodeAt(i).toString(16);
  }
  return 'enc:' + hex;
}

/**
 * Builds the base query parameters required for every Subsonic API request.
 */
function getAuthParams() {
  const encPass = encodePassword(CONFIG.navidromePass || '');
  return {
    u: CONFIG.navidromeUser || '',
    p: encPass,
    v: '1.16.1',
    c: 'antigravity-dashboard',
    f: 'json'
  };
}

/**
 * Performs a fetch request to the Navidrome subsonic API.
 */
async function apiRequest(endpoint, params = {}) {
  if (!CONFIG.navidromeUrl) {
    throw new Error('Navidrome URL ist nicht konfiguriert.');
  }

  const url = new URL(`${CONFIG.navidromeUrl}/rest/${endpoint}`);
  const allParams = { ...getAuthParams(), ...params };

  Object.keys(allParams).forEach(key => url.searchParams.append(key, allParams[key]));

  try {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const data = await res.json();
    const subRes = data['subsonic-response'];
    if (subRes && subRes.status === 'failed') {
      const errorMsg = subRes.error ? subRes.error.message : 'Unbekannter API-Fehler';
      throw new Error(errorMsg);
    }
    return subRes;
  } catch (err) {
    console.error(`Navidrome API Fehler (${endpoint}):`, err);
    throw err;
  }
}

export const Navidrome = {
  isConfigured() {
    return !!(CONFIG.navidromeUrl && CONFIG.navidromeUser);
  },

  /**
   * Generates a proxied stream URL via the local Python server.
   * Sonos needs to reach this URL -- using localhost proxy guarantees
   * proper audio MIME type and avoids UPnP 714 errors.
   */
  getStreamUrl(songId) {
    if (!CONFIG.navidromeUrl) return '';
    // Build the direct Navidrome URL first
    const directUrl = new URL(`${CONFIG.navidromeUrl}/rest/stream.view`);
    const params = { ...getAuthParams(), id: songId };
    // Remove f=json for stream URL (it's the audio format param in stream context)
    delete params.f;
    Object.keys(params).forEach(key => directUrl.searchParams.append(key, params[key]));
    // Wrap in local proxy so Sonos gets correct audio headers
    const serverIp = getServerLanIp();
    return `http://${serverIp}:8000/api/audio/stream/track.mp3?url=${encodeURIComponent(directUrl.toString())}`;
  },

  /**
   * Direct stream URL without proxy (for browser playback).
   */
  getDirectStreamUrl(songId) {
    if (!CONFIG.navidromeUrl) return '';
    const url = new URL(`${CONFIG.navidromeUrl}/rest/stream.view`);
    const params = { ...getAuthParams(), id: songId };
    delete params.f;
    Object.keys(params).forEach(key => url.searchParams.append(key, params[key]));
    return url.toString();
  },

  /**
   * Generates a direct cover art URL for a given cover ID.
   */
  getCoverArtUrl(coverId, size = 300) {
    if (!coverId || !CONFIG.navidromeUrl) return '';
    const url = new URL(`${CONFIG.navidromeUrl}/rest/getCoverArt.view`);
    const params = { ...getAuthParams(), id: coverId, size };
    Object.keys(params).forEach(key => url.searchParams.append(key, params[key]));
    return url.toString();
  },

  /**
   * Fetches all artists in the library.
   */
  async getArtists() {
    const data = await apiRequest('getArtists.view');
    const artists = [];
    if (data.artists && data.artists.index) {
      data.artists.index.forEach(idx => {
        if (idx.artist) {
          idx.artist.forEach(art => {
            artists.push({
              id: art.id,
              title: art.name,
              subtitle: art.albumCount ? `${art.albumCount} Alben` : '',
              coverArt: art.coverArt,
              media_content_id: `artist:${art.id}`,
              media_content_type: 'artist',
              item_id: `artist:${art.id}`,
              item_class: 'object.container.person.musicArtist',
              can_expand: true,
              can_play: false
            });
          });
        }
      });
    }
    return artists;
  },

  /**
   * Fetches all albums of an artist.
   */
  async getArtistAlbums(artistId) {
    const data = await apiRequest('getArtist.view', { id: artistId });
    const albums = [];
    if (data.artist && data.artist.album) {
      data.artist.album.forEach(alb => {
        albums.push({
          id: alb.id,
          title: alb.name,
          subtitle: alb.year ? `${alb.year}` : '',
          artist: alb.artist,
          media_content_id: `album:${alb.id}`,
          media_content_type: 'album',
          item_id: `album:${alb.id}`,
          item_class: 'object.container.album.musicAlbum',
          can_expand: true,
          can_play: true,
          coverArt: alb.coverArt
        });
      });
    }
    return albums;
  },

  /**
   * Fetches all tracks of an album.
   */
  async getAlbumTracks(albumId) {
    const data = await apiRequest('getAlbum.view', { id: albumId });
    const tracks = [];
    if (data.album && data.album.song) {
      data.album.song.forEach(song => {
        tracks.push({
          id: song.id,
          title: song.title,
          artist: song.artist,
          album: song.album,
          duration: song.duration,
          track: song.track,
          coverArt: song.coverArt,
          uri: this.getStreamUrl(song.id),
          media_content_id: `track:${song.id}`,
          media_content_type: 'track',
          item_id: `track:${song.id}`,
          item_class: 'object.item.audioItem.musicTrack',
          can_expand: false,
          can_play: true
        });
      });
    }
    return tracks;
  },

  /**
   * Fetches a list of albums by type: newest, frequent, recent, random, starred
   */
  async getAlbumList(type = 'newest', size = 20) {
    const data = await apiRequest('getAlbumList2.view', { type, size });
    const albums = [];
    if (data.albumList2 && data.albumList2.album) {
      data.albumList2.album.forEach(alb => {
        albums.push({
          id: alb.id,
          title: alb.name,
          artist: alb.artist,
          year: alb.year,
          subtitle: alb.artist || '',
          coverArt: alb.coverArt,
          media_content_id: `album:${alb.id}`,
          media_content_type: 'album',
          item_id: `album:${alb.id}`,
          item_class: 'object.container.album.musicAlbum',
          can_expand: true,
          can_play: true
        });
      });
    }
    return albums;
  },

  /**
   * Fetches all playlists.
   */
  async getPlaylists() {
    const data = await apiRequest('getPlaylists.view');
    const playlists = [];
    if (data.playlists && data.playlists.playlist) {
      data.playlists.playlist.forEach(pl => {
        playlists.push({
          id: pl.id,
          title: pl.name,
          comment: pl.comment || '',
          songCount: pl.songCount || 0,
          duration: pl.duration || 0,
          coverArt: pl.coverArt,
          subtitle: `${pl.songCount || 0} Titel`,
          media_content_id: `playlist:${pl.id}`,
          media_content_type: 'playlist',
          item_id: `playlist:${pl.id}`,
          item_class: 'object.container.playlistContainer',
          can_expand: true,
          can_play: true
        });
      });
    }
    return playlists;
  },

  /**
   * Fetches tracks of a specific playlist.
   */
  async getPlaylistTracks(playlistId) {
    const data = await apiRequest('getPlaylist.view', { id: playlistId });
    const tracks = [];
    if (data.playlist && data.playlist.entry) {
      data.playlist.entry.forEach(song => {
        tracks.push({
          id: song.id,
          title: song.title,
          artist: song.artist,
          album: song.album,
          duration: song.duration,
          track: song.track,
          coverArt: song.coverArt,
          uri: this.getStreamUrl(song.id),
          media_content_id: `track:${song.id}`,
          media_content_type: 'track',
          item_id: `track:${song.id}`,
          item_class: 'object.item.audioItem.musicTrack',
          can_expand: false,
          can_play: true
        });
      });
    }
    return tracks;
  },

  /**
   * Fetches starred (favorite) items.
   */
  async getStarred() {
    const data = await apiRequest('getStarred2.view');
    const items = [];
    const starred = data.starred2 || {};

    if (starred.artist) {
      starred.artist.forEach(art => {
        items.push({
          id: art.id,
          title: art.name,
          subtitle: 'Künstler',
          coverArt: art.coverArt,
          media_content_id: `artist:${art.id}`,
          media_content_type: 'artist',
          item_id: `artist:${art.id}`,
          item_class: 'object.container.person.musicArtist',
          can_expand: true,
          can_play: false
        });
      });
    }
    if (starred.album) {
      starred.album.forEach(alb => {
        items.push({
          id: alb.id,
          title: alb.name,
          artist: alb.artist,
          subtitle: `Album · ${alb.artist || ''}`,
          coverArt: alb.coverArt,
          media_content_id: `album:${alb.id}`,
          media_content_type: 'album',
          item_id: `album:${alb.id}`,
          item_class: 'object.container.album.musicAlbum',
          can_expand: true,
          can_play: true
        });
      });
    }
    if (starred.song) {
      starred.song.forEach(song => {
        items.push({
          id: song.id,
          title: song.title,
          artist: song.artist,
          subtitle: `${song.artist} · ${song.album || ''}`,
          coverArt: song.coverArt,
          duration: song.duration,
          uri: this.getStreamUrl(song.id),
          media_content_id: `track:${song.id}`,
          media_content_type: 'track',
          item_id: `track:${song.id}`,
          item_class: 'object.item.audioItem.musicTrack',
          can_expand: false,
          can_play: true
        });
      });
    }
    return items;
  },

  /**
   * Fetches genres.
   */
  async getGenres() {
    const data = await apiRequest('getGenres.view');
    const genres = [];
    if (data.genres && data.genres.genre) {
      data.genres.genre
        .filter(g => g.albumCount > 0)
        .sort((a, b) => b.albumCount - a.albumCount)
        .forEach(g => {
          genres.push({
            id: g.value,
            title: g.value,
            subtitle: `${g.albumCount} Alben`,
            media_content_id: `genre:${encodeURIComponent(g.value)}`,
            media_content_type: 'genre',
            item_id: `genre:${encodeURIComponent(g.value)}`,
            item_class: 'object.container.genre.musicGenre',
            can_expand: true,
            can_play: false
          });
        });
    }
    return genres;
  },

  /**
   * Fetches albums for a specific genre.
   */
  async getAlbumsByGenre(genre, size = 30) {
    const data = await apiRequest('getAlbumList2.view', { type: 'byGenre', genre, size });
    const albums = [];
    if (data.albumList2 && data.albumList2.album) {
      data.albumList2.album.forEach(alb => {
        albums.push({
          id: alb.id,
          title: alb.name,
          artist: alb.artist,
          subtitle: alb.artist || '',
          year: alb.year,
          coverArt: alb.coverArt,
          media_content_id: `album:${alb.id}`,
          media_content_type: 'album',
          item_id: `album:${alb.id}`,
          item_class: 'object.container.album.musicAlbum',
          can_expand: true,
          can_play: true
        });
      });
    }
    return albums;
  },

  /**
   * Performs a query to search across artists, albums, and tracks.
   */
  async search(query) {
    const data = await apiRequest('search3.view', { query: query, artistCount: 5, albumCount: 8, songCount: 20 });
    const results = [];
    const searchRes = data.searchResult3 || {};

    if (searchRes.artist) {
      searchRes.artist.forEach(art => {
        results.push({
          title: art.name,
          subtitle: 'Künstler',
          coverArt: art.coverArt,
          media_content_id: `artist:${art.id}`,
          media_content_type: 'artist',
          item_id: `artist:${art.id}`,
          item_class: 'object.container.person.musicArtist',
          can_expand: true,
          can_play: false,
          _group: 'Künstler'
        });
      });
    }

    if (searchRes.album) {
      searchRes.album.forEach(alb => {
        results.push({
          title: alb.name,
          subtitle: alb.artist,
          coverArt: alb.coverArt,
          media_content_id: `album:${alb.id}`,
          media_content_type: 'album',
          item_id: `album:${alb.id}`,
          item_class: 'object.container.album.musicAlbum',
          can_expand: true,
          can_play: true,
          _group: 'Alben'
        });
      });
    }

    if (searchRes.song) {
      searchRes.song.forEach(song => {
        results.push({
          title: song.title,
          artist: song.artist,
          album: song.album,
          duration: song.duration,
          subtitle: `${song.artist} · ${song.album || ''}`,
          coverArt: song.coverArt,
          media_content_id: `track:${song.id}`,
          media_content_type: 'track',
          item_id: `track:${song.id}`,
          item_class: 'object.item.audioItem.musicTrack',
          can_expand: false,
          can_play: true,
          uri: this.getStreamUrl(song.id),
          _group: 'Titel'
        });
      });
    }

    return results;
  }
};
