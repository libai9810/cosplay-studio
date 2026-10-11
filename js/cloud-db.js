/* ================================================================
   Local DB — static, no backend
   Drop-in replacement for cloud-db.js (Cloudflare R2 + Worker).
   Reads data from ./data/*.json and media from ./media/.
   Write operations are kept in-memory + localStorage so the owner
   flow still works, but nothing is uploaded anywhere.
   ================================================================ */

const DB = (() => {
  // === In-memory cache of stores, lazily loaded from JSON ===
  const _cache = {};
  const LS_PREFIX = 'cosplay_static_';

  async function _loadStore(store) {
    if (_cache[store]) return _cache[store];
    try {
      const resp = await fetch(`data/${store}.json`);
      const json = await resp.json();
      _cache[store] = json.data || [];
    } catch (err) {
      _cache[store] = [];
    }
    return _cache[store];
  }

  async function open() {
    return Promise.resolve();
  }

  // === Meta (stored as data/<key>.json, same shape {data: ...}) ===
  async function getMeta(key) {
    // Prefer a localStorage override (owner edits made in-session)
    try {
      const ls = localStorage.getItem(LS_PREFIX + key);
      if (ls !== null) return JSON.parse(ls);
    } catch (e) {}
    try {
      const resp = await fetch(`data/${key}.json`);
      const json = await resp.json();
      return json.data;
    } catch (err) {
      return null;
    }
  }

  async function setMeta(key, value) {
    // Static host: persist to localStorage only (no server).
    try { localStorage.setItem(LS_PREFIX + key, JSON.stringify(value)); } catch (e) {}
    return key;
  }

  // === Store data (data/<store>.json) ===
  async function _getStoreArray(store) {
    return await _loadStore(store);
  }

  async function _setStoreArray(store, arr) {
    _cache[store] = arr;
    try { localStorage.setItem(LS_PREFIX + 'store_' + store, JSON.stringify(arr)); } catch (e) {}
  }

  // === Generic CRUD (IndexedDB-compatible interface) ===
  async function put(store, obj) {
    const arr = await _getStoreArray(store);
    const idx = arr.findIndex(item => item.id === obj.id);
    if (idx >= 0) arr[idx] = obj; else arr.push(obj);
    await _setStoreArray(store, arr);
    return obj.id;
  }

  async function get(store, id) {
    const arr = await _getStoreArray(store);
    return arr.find(item => item.id === id) || null;
  }

  async function getAll(store) {
    return await _getStoreArray(store);
  }

  async function del(store, id) {
    const arr = await _getStoreArray(store);
    await _setStoreArray(store, arr.filter(item => item.id !== id));
    return true;
  }

  async function clear(store) {
    await _setStoreArray(store, []);
    return true;
  }

  // === File "upload" — static host, no server. ===
  // We keep the object URL so the UI still previews the picked file.
  async function uploadFile(blob, filename) {
    const url = URL.createObjectURL(blob);
    return { url, key: 'local/' + (filename || 'unnamed') };
  }

  async function deleteFile(key) {
    return true;
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
  }

  // === Blob → URL helper ===
  const _urlCache = new Map();
  function blobToURL(blob) {
    if (!blob) return '';
    if (typeof blob === 'string') return blob; // already a local path / object URL
    const url = URL.createObjectURL(blob);
    _urlCache.set(url, true);
    return url;
  }

  return {
    STORES: { showcase: 'showcase', gallery: 'gallery', plans: 'plans', stories: 'stories', meta: 'meta' },
    open,
    put, get, getAll, del, clear,
    getMeta, setMeta,
    uid, blobToURL,
    uploadFile, deleteFile,
    setAuthToken: () => null,
    restoreAuthToken: () => null,
    clearAuthToken: () => null
  };
})();
