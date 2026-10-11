/* ================================================================
   App Core — Navigation, Background, Music, Toast
   ================================================================ */

const App = {
  currentPage: 'showcase',
  bgImage: null,
  bgImageKey: null,
  bgOpacity: 20,
  bgBlur: 8,
  musicList: [],
  musicCurrentIdx: -1,
  musicPlaying: false,

  async init() {
    await DB.open();

    // ---- Navigation ----
    document.querySelectorAll('.nav-link').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        this.navigate(link.dataset.page);
      });
    });

    // ---- Background Panel ----
    this._initBgPanel();

    // ---- Music Panel ----
    this._initMusicPanel();

    // ---- Close panels on outside click ----
    document.addEventListener('click', (e) => {
      if (!e.target.closest('#bg-panel') && !e.target.closest('#bg-toggle-btn')) {
        document.getElementById('bg-panel').classList.remove('show');
        document.getElementById('bg-toggle-btn').classList.remove('active');
      }
      if (!e.target.closest('#music-panel') && !e.target.closest('#music-toggle-btn')) {
        document.getElementById('music-panel').classList.remove('show');
        document.getElementById('music-toggle-btn').classList.remove('active');
      }
    });

    // ---- Restore saved settings ----
    const savedBg = await DB.getMeta('bgImage');
    if (savedBg && savedBg.url) {
      this.bgImage = DB.blobToURL(savedBg.url); // Convert R2 URL → proxy URL (CORS-safe)
      this.bgImageKey = savedBg.key || null;
      this.bgOpacity = savedBg.opacity ?? 20;
      this.bgBlur = savedBg.blur ?? 8;
      this._applyBg();
    }
    const savedMusic = await DB.getMeta('musicList');
    if (savedMusic && Array.isArray(savedMusic) && savedMusic.length > 0) {
      this.musicList = savedMusic;
    }
    this._renderMusicList();

    // ---- Init feature modules (try-catch prevents cascade failures) ----
    const modules = [
      ['Showcase', Showcase], ['Editor', Editor], ['Gallery', Gallery],
      ['Planner', Planner]
    ];
    for (const [name, mod] of modules) {
      if (typeof mod !== 'undefined') {
        try { await mod.init(); }
        catch (err) { console.error(`[${name}] init failed:`, err); }
      }
    }
    if (typeof Auth !== 'undefined') {
      try { await Auth.init(); }
      catch (err) { console.error('[Auth] init failed:', err); }
    }

    this._initContact();

    // ---- Mobile navigation ----
    this._initMobileNav();

    // ---- Apply permissions ----
    this._applyPermissions();

    this.toast('Welcome to Cosplay Studio');
  },

  navigate(page) {
    // Handle gallery category music on page leave / return
    if (this.currentPage === 'gallery' && page !== 'gallery') {
      if (typeof Gallery !== 'undefined') Gallery._pauseForPageLeave();
    }
    if (page === 'gallery' && this.currentPage !== 'gallery') {
      if (typeof Gallery !== 'undefined') Gallery._resumeForPageReturn();
    }

    // Block owner-only pages for visitors
    const ownerOnly = ['editor', 'planner'];
    if (ownerOnly.includes(page) && !Auth.isOwner) {
      this.toast('Login required to access this page');
      Auth._showLoginModal();
      return;
    }

    this.currentPage = page;
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
    document.getElementById('page-' + page).classList.add('active');
    document.querySelectorAll(`.nav-link[data-page="${page}"]`).forEach(l => l.classList.add('active'));

    // Close mobile drawer
    document.getElementById('mobile-drawer').classList.remove('open');
    document.getElementById('mobile-drawer-overlay').classList.remove('show');

    // Trigger resize after page change (canvas, masonry, etc.)
    setTimeout(() => window.dispatchEvent(new Event('resize')), 100);
  },

  // ==================== Permissions ====================
  _applyPermissions() {
    // owner-only nav links visibility
    document.querySelectorAll('.nav-link.owner-only').forEach(link => {
      link.style.display = Auth.isOwner ? '' : 'none';
    });
    // owner-only elements (upload buttons, edit buttons, etc.)
    document.querySelectorAll('.owner-only').forEach(el => {
      el.style.display = Auth.isOwner ? '' : 'none';
    });
    // If visitor is on an owner-only page, redirect to showcase
    if (!Auth.isOwner && ['editor', 'planner'].includes(this.currentPage)) {
      this.navigate('showcase');
    }
    // Re-render stories to show/hide edit buttons
    if (typeof Stories !== 'undefined' && Stories && Stories.stories) {
      Stories.render();
    }
    // Re-render showcase to show/hide delete buttons
    if (typeof Showcase !== 'undefined' && Showcase.photos) {
      Showcase.render();
    }
    // Re-render gallery to show/hide delete buttons
    if (typeof Gallery !== 'undefined' && Gallery.photos) {
      Gallery.renderGrid();
      // Re-render category music list to update delete buttons
      if (Gallery._inCategoryMode) Gallery._updateMusicBarUI();
    }
  },

  // ==================== Mobile Navigation ====================
  _initMobileNav() {
    const drawer = document.getElementById('mobile-drawer');
    const overlay = document.getElementById('mobile-drawer-overlay');
    const menuBtn = document.getElementById('mobile-menu-btn');

    // Build drawer content
    this._buildMobileDrawer();

    menuBtn.addEventListener('click', () => {
      this._buildMobileDrawer();
      drawer.classList.add('open');
      overlay.classList.add('show');
    });
    overlay.addEventListener('click', () => {
      drawer.classList.remove('open');
      overlay.classList.remove('show');
    });
  },

  _buildMobileDrawer() {
    const drawer = document.getElementById('mobile-drawer');
    const links = document.querySelectorAll('#top-nav .nav-link');
    let html = '';
    links.forEach(link => {
      const page = link.dataset.page;
      const isOwnerOnly = link.classList.contains('owner-only');
      if (isOwnerOnly && !Auth.isOwner) return;
      html += `<a href="#" class="nav-link${page === this.currentPage ? ' active' : ''}" data-page="${page}">${link.textContent}</a>`;
    });
    drawer.innerHTML = html;
    drawer.querySelectorAll('.nav-link').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        this.navigate(link.dataset.page);
      });
    });
  },

  // ==================== Background ====================
  _initBgPanel() {
    const btn = document.getElementById('bg-toggle-btn');
    const panel = document.getElementById('bg-panel');

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      panel.classList.toggle('show');
      btn.classList.toggle('active');
      document.getElementById('music-panel').classList.remove('show');
      document.getElementById('music-toggle-btn').classList.remove('active');
    });

    document.getElementById('bg-upload-btn').addEventListener('click', () => {
      document.getElementById('bg-file-input').click();
    });

    document.getElementById('bg-file-input').addEventListener('change', async (e) => {
      if (typeof Auth !== 'undefined' && !Auth.isOwner) { e.target.value = ''; return; }
      const file = e.target.files[0];
      if (!file) return;
      e.target.value = '';
      this.toast('Uploading background...');
      try {
        // Delete previous background from R2
        if (this.bgImageKey) {
          await DB.deleteFile(this.bgImageKey).catch(() => {});
        }
        const { url, key } = await DB.uploadFile(file, file.name);
        this.bgImage = url;
        this.bgImageKey = key;
        this._applyBg();
        await DB.setMeta('bgImage', { url, key, opacity: this.bgOpacity, blur: this.bgBlur });
        this.toast('Background updated');
      } catch (err) {
        console.error('[App] Background upload failed:', err);
        this.toast('Background upload failed');
      }
    });

    const opacitySlider = document.getElementById('bg-opacity');
    opacitySlider.addEventListener('input', (e) => {
      this.bgOpacity = parseInt(e.target.value);
      document.getElementById('bg-opacity-val').textContent = this.bgOpacity + '%';
      this._applyBg();
      clearTimeout(this._bgDebounce);
      this._bgDebounce = setTimeout(async () => {
        await DB.setMeta('bgImage', { url: this.bgImage, key: this.bgImageKey, opacity: this.bgOpacity, blur: this.bgBlur });
      }, 500);
    });

    const blurSlider = document.getElementById('bg-blur');
    blurSlider.addEventListener('input', (e) => {
      this.bgBlur = parseInt(e.target.value);
      document.getElementById('bg-blur-val').textContent = this.bgBlur + 'px';
      this._applyBg();
      clearTimeout(this._bgDebounce);
      this._bgDebounce = setTimeout(async () => {
        await DB.setMeta('bgImage', { url: this.bgImage, key: this.bgImageKey, opacity: this.bgOpacity, blur: this.bgBlur });
      }, 500);
    });

    document.getElementById('bg-clear-btn').addEventListener('click', async () => {
      if (typeof Auth !== 'undefined' && !Auth.isOwner) return;
      if (this.bgImageKey) {
        await DB.deleteFile(this.bgImageKey).catch(() => {});
      }
      this.bgImage = null;
      this.bgImageKey = null;
      this._applyBg();
      await DB.setMeta('bgImage', { url: null, key: null, opacity: 20, blur: 8 });
      this.toast('Background cleared');
    });
  },

  _applyBg() {
    const layer = document.getElementById('bg-layer');
    if (this.bgImage) {
      // Quote the URL — filenames may contain ( ) or non-ASCII chars that break
      // CSS url() parsing when unquoted.
      const safeUrl = String(this.bgImage).replace(/"/g, '%22');
      layer.style.backgroundImage = `url("${safeUrl}")`;
      layer.style.backgroundSize = 'cover';
      layer.style.backgroundPosition = 'center';
      layer.style.opacity = this.bgOpacity / 100;
      layer.style.filter = `blur(${this.bgBlur}px)`;
      layer.style.transform = `scale(${this.bgBlur > 0 ? 1.1 : 1})`;
    } else {
      layer.style.backgroundImage = '';
      layer.style.opacity = 1;
      layer.style.filter = 'none';
    }
  },

  // ==================== Music (Playlist) ====================
  _initMusicPanel() {
    const btn = document.getElementById('music-toggle-btn');
    const panel = document.getElementById('music-panel');
    const audio = document.getElementById('bgm-audio');

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      panel.classList.toggle('show');
      btn.classList.toggle('active');
      document.getElementById('bg-panel').classList.remove('show');
      document.getElementById('bg-toggle-btn').classList.remove('active');
    });

    document.getElementById('music-upload-btn').addEventListener('click', () => {
      document.getElementById('music-file-input').click();
    });

    // Multi-file upload
    document.getElementById('music-file-input').addEventListener('change', async (e) => {
      if (typeof Auth !== 'undefined' && !Auth.isOwner) { e.target.value = ''; return; }
      const files = Array.from(e.target.files);
      if (files.length === 0) return;
      e.target.value = '';
      this.toast(`Uploading ${files.length} track(s)...`);
      let count = 0;
      for (const file of files) {
        try {
          const { url, key } = await DB.uploadFile(file, file.name);
          this.musicList.push({ url, key, name: file.name });
          count++;
        } catch (err) {
          console.error('[App] Music upload failed:', file.name, err);
        }
      }
      if (count > 0) {
        await this._saveMusicList();
        this._renderMusicList();
        this.toast(`${count} track(s) added`);
      } else {
        this.toast('Upload failed');
      }
    });

    const volSlider = document.getElementById('music-volume');
    volSlider.addEventListener('input', (e) => {
      const vol = parseInt(e.target.value);
      document.getElementById('music-volume-val').textContent = vol + '%';
      audio.volume = vol / 100;
    });

    document.getElementById('music-clear-btn').addEventListener('click', async () => {
      if (typeof Auth !== 'undefined' && !Auth.isOwner) return;
      if (this.musicList.length === 0) return;
      this._stopMusic();
      // Delete all files from R2
      for (const track of this.musicList) {
        if (track.key) { await DB.deleteFile(track.key).catch(() => {}); }
      }
      this.musicList = [];
      this.musicCurrentIdx = -1;
      await DB.setMeta('musicList', []);
      this._renderMusicList();
      this.toast('All music cleared');
    });

    // Auto-advance to next track when current ends
    audio.addEventListener('ended', () => {
      this._nextTrack();
    });
  },

  async _saveMusicList() {
    try { await DB.setMeta('musicList', this.musicList); }
    catch (e) { console.error('[App] Failed to save music list:', e); }
  },

  _renderMusicList() {
    const list = document.getElementById('music-list');
    list.innerHTML = '';
    if (this.musicList.length === 0) {
      list.innerHTML = '<div style="color:var(--c-text-4);font-size:12px;padding:8px;">No music uploaded</div>';
      return;
    }
    const isOwner = typeof Auth !== 'undefined' && Auth.isOwner;
    this.musicList.forEach((track, i) => {
      const isCurrent = i === this.musicCurrentIdx && this.musicPlaying;
      const item = document.createElement('div');
      item.className = 'music-item' + (i === this.musicCurrentIdx ? ' playing' : '');
      item.innerHTML = `
        <span class="music-item-idx">${i + 1}</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
        <span class="music-item-name">${track.name}</span>
        <span class="music-status">${isCurrent ? '❚❚' : '▶'}</span>
        ${isOwner ? '<button class="music-del-btn" data-idx="' + i + '" title="Remove">✕</button>' : ''}
      `;
      // Click on item (not delete button) = play this track
      item.addEventListener('click', (e) => {
        if (e.target.classList.contains('music-del-btn')) return;
        if (i === this.musicCurrentIdx && this.musicPlaying) {
          this._stopMusic();
        } else {
          this._playTrack(i);
        }
      });
      list.appendChild(item);
    });
    // Bind delete buttons
    if (isOwner) {
      list.querySelectorAll('.music-del-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const idx = parseInt(btn.dataset.idx);
          await this._deleteTrack(idx);
        });
      });
    }
  },

  _playTrack(idx) {
    // If gallery category music is playing, pause it (user chose to play global)
    if (typeof Gallery !== 'undefined' && Gallery.categoryMusicPlaying) {
      const ga = document.getElementById('gallery-bgm-audio');
      if (ga) ga.pause();
      Gallery.categoryMusicPlaying = false;
      Gallery._updateMusicBarUI();
    }
    if (idx < 0 || idx >= this.musicList.length) return;
    const track = this.musicList[idx];
    const audio = document.getElementById('bgm-audio');
    audio.src = DB.blobToURL(track.url);
    audio.volume = parseInt(document.getElementById('music-volume').value) / 100;
    audio.play().catch(() => {});
    this.musicCurrentIdx = idx;
    this.musicPlaying = true;
    document.getElementById('music-toggle-btn').classList.add('active');
    this._renderMusicList();
  },

  _nextTrack() {
    if (this.musicList.length === 0) return;
    // Loop: after last track, go back to first
    const next = (this.musicCurrentIdx + 1) % this.musicList.length;
    this._playTrack(next);
  },

  _toggleMusic() {
    if (this.musicList.length === 0) return;
    if (this.musicPlaying) {
      this._stopMusic();
    } else {
      // Resume or start from current/beginning
      const idx = this.musicCurrentIdx >= 0 ? this.musicCurrentIdx : 0;
      this._playTrack(idx);
    }
    this._renderMusicList();
  },

  _stopMusic() {
    const audio = document.getElementById('bgm-audio');
    audio.pause();
    this.musicPlaying = false;
    document.getElementById('music-toggle-btn').classList.remove('active');
    this._renderMusicList();
  },

  async _deleteTrack(idx) {
    if (idx < 0 || idx >= this.musicList.length) return;
    const track = this.musicList[idx];
    // Delete from R2
    if (track.key) { await DB.deleteFile(track.key).catch(() => {}); }
    // If deleting current track, stop first
    const wasCurrent = idx === this.musicCurrentIdx;
    if (wasCurrent) this._stopMusic();
    // Remove from list
    this.musicList.splice(idx, 1);
    // Adjust current index
    if (this.musicCurrentIdx > idx) {
      this.musicCurrentIdx--;
    } else if (this.musicCurrentIdx === idx) {
      this.musicCurrentIdx = -1;
    }
    await this._saveMusicList();
    this._renderMusicList();
    this.toast('Track removed');
  },

  // ==================== Contact copy ====================
  _initContact() {
    const el = document.getElementById('contact-qq-copy');
    const hint = document.getElementById('contact-copy-hint');
    if (!el) return;
    const card = el.closest('.contact-card');
    card.addEventListener('click', async () => {
      const text = el.textContent.trim();
      try {
        await navigator.clipboard.writeText(text);
      } catch (e) {
        const ta = document.createElement('textarea');
        ta.value = text; document.body.appendChild(ta); ta.select();
        document.execCommand('copy'); ta.remove();
      }
      if (hint) { hint.textContent = '已复制 ✓'; setTimeout(() => hint.textContent = '点击复制', 1600); }
    });
  },

  // ==================== Toast ====================
  toast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => t.classList.remove('show'), 2500);
  },

  // ==================== Confirm Dialog ====================
  /**
   * Show a custom confirmation modal. Returns a Promise<boolean>.
   * @param {string} message - The question to display
   * @param {object} opts - { confirmText, cancelText, danger }
   */
  confirm(message, opts = {}) {
    return new Promise((resolve) => {
      const modal = document.getElementById('app-confirm-modal');
      const msgEl = document.getElementById('app-confirm-message');
      const okBtn = document.getElementById('app-confirm-ok');
      const cancelBtn = document.getElementById('app-confirm-cancel');

      msgEl.textContent = message;
      okBtn.textContent = opts.confirmText || 'CONFIRM';
      cancelBtn.textContent = opts.cancelText || 'CANCEL';
      okBtn.classList.toggle('panel-btn-danger', !!opts.danger);
      okBtn.classList.toggle('panel-btn-primary', !opts.danger);

      modal.style.display = 'flex';

      const cleanup = (result) => {
        modal.style.display = 'none';
        okBtn.onclick = null;
        cancelBtn.onclick = null;
        modal.onclick = null;
        resolve(result);
      };

      okBtn.onclick = () => cleanup(true);
      cancelBtn.onclick = () => cleanup(false);
      modal.onclick = (e) => { if (e.target === modal) cleanup(false); };
    });
  },

  // ==================== Image Compression ====================
  /**
   * Compress an image File to a smaller JPEG Blob via Canvas.
   * @param {File|Blob} file - Source image
   * @param {number} maxDim - Max width/height in pixels (default 1920)
   * @param {number} quality - JPEG quality 0-1 (default 0.85)
   * @returns {Promise<{blob: Blob, width: number, height: number}>}
   */
  async compressImage(file, maxDim = 1920, quality = 0.85) {
    // Load image
    const img = new Image();
    const objURL = URL.createObjectURL(file);
    try {
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = objURL;
      });
    } finally {
      URL.revokeObjectURL(objURL);
    }

    // Calculate target dimensions (never upscale)
    let w = img.naturalWidth, h = img.naturalHeight;
    if (w > maxDim || h > maxDim) {
      if (w >= h) {
        h = Math.round(h * maxDim / w);
        w = maxDim;
      } else {
        w = Math.round(w * maxDim / h);
        h = maxDim;
      }
    }

    // Draw to canvas
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, w, h);

    // Export as JPEG blob
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
    return { blob, width: w, height: h };
  },

  // ==================== File → Blob helper ====================
  fileToBlob(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(new Blob([reader.result], { type: file.type }));
      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    });
  },

  blobToDataURL(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }
};

// Boot
document.addEventListener('DOMContentLoaded', () => App.init());
