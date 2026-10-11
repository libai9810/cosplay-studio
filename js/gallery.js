/* ================================================================
   Gallery — Bookmark Categories + Masonry Layout
   ================================================================ */

const Gallery = {
  categories: [],   // [{id, name, ip, character}]
  photos: [],       // [{id, categoryId, blob, name, ts, width, height}]
  currentCategory: null, // null = all

  // Lightbox state
  _lbPhotos: [],
  _lbIdx: 0,
  _lbTouchX: 0,

  // Category music state
  categoryMusic: [],
  categoryMusicIdx: -1,
  categoryMusicPlaying: false,
  _globalWasPlaying: false,
  _inCategoryMode: false,

  async init() {
    // Upload
    document.getElementById('gallery-upload-btn').addEventListener('click', () => {
      if (this.categories.length === 0) {
        App.toast('Create a category first');
        this.showAddCategory();
        return;
      }
      document.getElementById('gallery-upload').click();
    });
    document.getElementById('gallery-upload').addEventListener('change', async (e) => {
      await this.handleUpload(e.target.files);
      e.target.value = '';
    });

    // Add category
    document.getElementById('add-category-btn').addEventListener('click', () => {
      this.showAddCategory();
    });

    // Delete category
    document.getElementById('gallery-delete-cat-btn').addEventListener('click', () => {
      this.deleteCategory();
    });

    // Lightbox
    document.getElementById('lightbox-close').addEventListener('click', () => {
      document.getElementById('lightbox').classList.remove('show');
    });
    document.getElementById('lightbox').addEventListener('click', (e) => {
      if (e.target.id === 'lightbox') {
        document.getElementById('lightbox').classList.remove('show');
      }
    });

    // Lightbox navigation: prev / next buttons
    document.getElementById('lightbox-prev').addEventListener('click', (e) => {
      e.stopPropagation();
      this._lbPrev();
    });
    document.getElementById('lightbox-next').addEventListener('click', (e) => {
      e.stopPropagation();
      this._lbNext();
    });

    // Keyboard: ← / → to navigate, Esc to close
    document.addEventListener('keydown', (e) => {
      const lb = document.getElementById('lightbox');
      if (!lb.classList.contains('show')) return;
      if (e.key === 'ArrowLeft') { e.preventDefault(); this._lbPrev(); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); this._lbNext(); }
      else if (e.key === 'Escape') { lb.classList.remove('show'); }
    });

    // Touch swipe: swipe left → next, swipe right → prev
    const lbEl = document.getElementById('lightbox');
    lbEl.addEventListener('touchstart', (e) => {
      this._lbTouchX = e.touches[0].clientX;
    }, { passive: true });
    lbEl.addEventListener('touchend', (e) => {
      const dx = e.changedTouches[0].clientX - this._lbTouchX;
      if (Math.abs(dx) > 50) {
        if (dx > 0) this._lbPrev(); else this._lbNext();
      }
    }, { passive: true });

    // Load data
    this.categories = (await DB.getMeta('galleryCategories')) || [];
    this.photos = await DB.getAll(DB.STORES.gallery);

    // Default category (only persist to DB if owner — visitors can't write)
    if (this.categories.length === 0) {
      this.categories = [
        { id: 'all', name: 'ALL PHOTOS', ip: '', character: '' }
      ];
      if (typeof Auth !== 'undefined' && Auth.isOwner) {
        try { await DB.setMeta('galleryCategories', this.categories); } catch (e) {}
      }
    }
    this.currentCategory = 'all';

    this.renderTabs();
    this.renderGrid();

    // Init category music bar
    this._initCategoryMusic();
  },

  // ==================== Categories ====================
  showAddCategory() {
    if (typeof Auth !== 'undefined' && !Auth.isOwner) return;
    // Create modal
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay show';
    overlay.innerHTML = `
      <div class="modal-box" style="width:380px;">
        <div class="modal-header">NEW CATEGORY</div>
        <div class="modal-body">
          <div style="margin-bottom:12px;">
            <label style="font-size:11px;color:var(--c-text-3);text-transform:uppercase;letter-spacing:1px;">IP / Franchise Name</label>
            <input type="text" id="cat-ip" placeholder="e.g. Genshin Impact" style="margin-top:6px;">
          </div>
          <div>
            <label style="font-size:11px;color:var(--c-text-3);text-transform:uppercase;letter-spacing:1px;">Character Name</label>
            <input type="text" id="cat-char" placeholder="e.g. Raiden Shogun" style="margin-top:6px;">
          </div>
        </div>
        <div class="modal-footer">
          <button class="panel-btn" id="cat-cancel">CANCEL</button>
          <button class="panel-btn panel-btn-primary" id="cat-confirm">CREATE</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    overlay.querySelector('#cat-cancel').addEventListener('click', () => overlay.remove());
    overlay.querySelector('#cat-confirm').addEventListener('click', async () => {
      const ip = overlay.querySelector('#cat-ip').value.trim();
      const char = overlay.querySelector('#cat-char').value.trim();
      if (!ip && !char) {
        App.toast('Enter at least IP or character name');
        return;
      }
      const name = [ip, char].filter(Boolean).join(' · ');
      const cat = { id: DB.uid(), name, ip, character: char };
      this.categories.push(cat);
      await DB.setMeta('galleryCategories', this.categories);
      overlay.remove();
      this.currentCategory = cat.id;
      this.renderTabs();
      this.renderGrid();
      this._enterCategoryMode(cat.id);
      // Show delete button for new category (owner only)
      const delBtn = document.getElementById('gallery-delete-cat-btn');
      if (delBtn) {
        delBtn.style.display = (typeof Auth !== 'undefined' && Auth.isOwner) ? '' : 'none';
      }
      App.toast('Category created');
    });
  },

  async deleteCategory() {
    if (typeof Auth !== 'undefined' && !Auth.isOwner) return;
    if (!this.currentCategory || this.currentCategory === 'all') {
      App.toast('Cannot delete ALL PHOTOS');
      return;
    }
    const cat = this.categories.find(c => c.id === this.currentCategory);
    if (!cat) return;

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay show';
    overlay.innerHTML = `
      <div class="modal-box" style="width:380px;">
        <div class="modal-header">DELETE CATEGORY</div>
        <div class="modal-body">
          <p style="color:var(--c-text-2);font-size:13px;">Delete "<strong>${cat.name}</strong>" and all its photos? This cannot be undone.</p>
        </div>
        <div class="modal-footer">
          <button class="panel-btn" id="del-cancel">CANCEL</button>
          <button class="panel-btn panel-btn-danger" id="del-confirm" style="border-color:var(--c-danger);color:#f88;">DELETE</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    overlay.querySelector('#del-cancel').addEventListener('click', () => overlay.remove());
    overlay.querySelector('#del-confirm').addEventListener('click', async () => {
      // Exit category music mode first
      this._exitCategoryMode();
      // Delete photos (both display + thumbnail from R2)
      const catPhotos = this.photos.filter(p => p.categoryId === this.currentCategory);
      for (const p of catPhotos) {
        if (p.fileKey) { try { await DB.deleteFile(p.fileKey); } catch (e) {} }
        if (p.thumbKey) { try { await DB.deleteFile(p.thumbKey); } catch (e) {} }
        await DB.del(DB.STORES.gallery, p.id);
      }
      // Clean up category music from R2
      const catMusic = (await DB.getMeta('galleryMusic_' + this.currentCategory)) || [];
      for (const track of catMusic) {
        if (track.key) { await DB.deleteFile(track.key).catch(() => {}); }
      }
      await DB.setMeta('galleryMusic_' + this.currentCategory, []);
      this.photos = this.photos.filter(p => p.categoryId !== this.currentCategory);
      this.categories = this.categories.filter(c => c.id !== this.currentCategory);
      await DB.setMeta('galleryCategories', this.categories);
      overlay.remove();
      this.currentCategory = 'all';
      this.renderTabs();
      this.renderGrid();
      App.toast('Category deleted');
    });
  },

  renderTabs() {
    const tabsEl = document.getElementById('gallery-tabs');
    tabsEl.innerHTML = '';

    this.categories.forEach(cat => {
      const tab = document.createElement('div');
      tab.className = 'gallery-tab' + (this.currentCategory === cat.id ? ' active' : '');
      const count = cat.id === 'all'
        ? this.photos.length
        : this.photos.filter(p => p.categoryId === cat.id).length;
      tab.innerHTML = `
        <span class="gallery-tab-tab-icon">🔖</span>
        <span class="gallery-tab-name">${cat.name}</span>
        <span class="gallery-tab-count">${count}</span>
      `;
      tab.addEventListener('click', () => {
        const prevCat = this.currentCategory;
        this.currentCategory = cat.id;
        this.renderTabs();
        this.renderGrid();
        // Category music: enter specific category or exit to ALL
        if (cat.id === 'all') {
          if (prevCat !== 'all') this._exitCategoryMode();
        } else {
          if (prevCat !== cat.id) this._enterCategoryMode(cat.id);
        }
        // Show/hide delete button (owner only)
        const delBtn = document.getElementById('gallery-delete-cat-btn');
        if (delBtn) {
          delBtn.style.display =
            (cat.id !== 'all' && typeof Auth !== 'undefined' && Auth.isOwner) ? '' : 'none';
        }
      });
      tabsEl.appendChild(tab);
    });
  },

  // ==================== Upload ====================
  async handleUpload(files) {
    if (typeof Auth !== 'undefined' && !Auth.isOwner) return;
    if (!this.currentCategory || this.currentCategory === 'all') {
      App.toast('Select a specific category first');
      return;
    }
    let count = 0;
    for (const file of files) {
      if (!file.type.startsWith('image/')) continue;
      try {
        App.toast(`Processing "${file.name}"...`);
        // Compress to display version (max 1920px, quality 85)
        const display = await App.compressImage(file, 1920, 0.85);
        // Generate thumbnail (max 2600px, quality 90 — ~4.5MP, retina-crisp)
        const thumb = await App.compressImage(file, 2600, 0.90);

        // Upload both versions
        const displayName = file.name.replace(/\.[^.]+$/, '') + '.jpg';
        const thumbName = 'thumb_' + displayName;
        const uploadedDisp = await DB.uploadFile(display.blob, displayName);
        const uploadedThumb = await DB.uploadFile(thumb.blob, thumbName);

        await DB.put(DB.STORES.gallery, {
          id: DB.uid(),
          categoryId: this.currentCategory,
          blob: uploadedDisp.url,
          fileKey: uploadedDisp.key,
          thumb: uploadedThumb.url,
          thumbKey: uploadedThumb.key,
          name: file.name,
          ts: Date.now(),
          width: display.width,
          height: display.height
        });
        count++;
      } catch (err) {
        App.toast(`Failed to upload "${file.name}"`);
        console.error(err);
      }
    }
    if (count > 0) {
      this.photos = await DB.getAll(DB.STORES.gallery);
      this.renderTabs();
      this.renderGrid();
      App.toast(`${count} photo(s) added`);
    }
  },

  // ==================== Render Grid ====================
  renderGrid() {
    const grid = document.getElementById('masonry-grid');
    const title = document.getElementById('gallery-title');

    const cat = this.categories.find(c => c.id === (this.currentCategory || 'all'))
    title.textContent = cat ? cat.name.toUpperCase() : 'ALL PHOTOS';

    let photos = this.photos;
    if (this.currentCategory && this.currentCategory !== 'all') {
      photos = photos.filter(p => p.categoryId === this.currentCategory);
    }
    photos.sort((a, b) => b.ts - a.ts);

    if (photos.length === 0) {
      grid.style.columnCount = '';
      grid.innerHTML = `
        <div class="gallery-empty">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
          <p>NO PHOTOS YET</p>
          <p class="hint-text">${this.currentCategory === 'all' ? 'Create a category and upload cosplay photos.' : 'Upload photos to this category.'}</p>
        </div>
      `;
      return;
    }

    grid.style.columnCount = '';

    grid.innerHTML = '';
    photos.forEach((photo, idx) => {
      // Use thumbnail for grid (fallback to full image for old uploads)
      const thumbUrl = photo.thumb ? DB.blobToURL(photo.thumb) : DB.blobToURL(photo.blob);
      const item = document.createElement('div');
      item.className = 'masonry-item';
      item.innerHTML = `
        <img src="${thumbUrl}" alt="${photo.name || ''}" loading="lazy">
        <button class="masonry-del owner-only" data-id="${photo.id}" title="Delete">✕</button>
        <div class="masonry-overlay">
          <span class="masonry-overlay-name">${photo.name || ''}</span>
        </div>
      `;
      item.addEventListener('click', (e) => {
        if (e.target.classList.contains('masonry-del')) return;
        this._openLightbox(idx, photos);
      });
      grid.appendChild(item);
    });

    // Bind delete
    grid.querySelectorAll('.masonry-del').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (typeof Auth !== 'undefined' && !Auth.isOwner) return;
        const id = btn.dataset.id;
        const photo = this.photos.find(p => p.id === id);
        if (photo) {
          if (photo.fileKey) { try { await DB.deleteFile(photo.fileKey); } catch (e) {} }
          if (photo.thumbKey) { try { await DB.deleteFile(photo.thumbKey); } catch (e) {} }
        }
        await DB.del(DB.STORES.gallery, id);
        this.photos = this.photos.filter(p => p.id !== id);
        this.renderTabs();
        this.renderGrid();
        App.toast('Photo deleted');
      });
    });
  },

  // ==================== Lightbox (swipeable) ====================
  _openLightbox(idx, photos) {
    this._lbPhotos = photos;
    this._lbIdx = idx;
    this._showLbImage();
    document.getElementById('lightbox').classList.add('show');
  },

  _showLbImage() {
    const photo = this._lbPhotos[this._lbIdx];
    if (!photo) return;
    const img = document.getElementById('lightbox-img');
    img.src = DB.blobToURL(photo.blob);
    const cat = this.categories.find(c => c.id === photo.categoryId);
    const total = this._lbPhotos.length;
    document.getElementById('lightbox-info').textContent =
      `${this._lbIdx + 1}/${total} · ${cat ? cat.name : 'Unknown'} · ${photo.name || ''} · ${photo.width || ''}×${photo.height || ''}`;
  },

  _lbNext() {
    if (this._lbPhotos.length === 0) return;
    this._lbIdx = (this._lbIdx + 1) % this._lbPhotos.length;
    this._showLbImage();
  },

  _lbPrev() {
    if (this._lbPhotos.length === 0) return;
    this._lbIdx = (this._lbIdx - 1 + this._lbPhotos.length) % this._lbPhotos.length;
    this._showLbImage();
  },

  // ==================== Category Music ====================
  _initCategoryMusic() {
    const audio = document.getElementById('gallery-bgm-audio');

    // Play / Pause
    document.getElementById('gallery-music-play').addEventListener('click', () => {
      this._toggleCategoryMusic();
    });

    // Volume
    document.getElementById('gallery-music-volume').addEventListener('input', (e) => {
      const vol = parseInt(e.target.value);
      audio.volume = vol / 100;
    });

    // Playlist toggle
    document.getElementById('gallery-music-toggle').addEventListener('click', () => {
      const wrap = document.getElementById('gallery-music-list-wrap');
      wrap.style.display = wrap.style.display === 'none' ? 'block' : 'none';
    });

    // Upload (owner only)
    document.getElementById('gallery-music-upload').addEventListener('click', () => {
      if (typeof Auth !== 'undefined' && !Auth.isOwner) return;
      document.getElementById('gallery-music-input').click();
    });
    document.getElementById('gallery-music-input').addEventListener('change', async (e) => {
      if (typeof Auth !== 'undefined' && !Auth.isOwner) { e.target.value = ''; return; }
      const files = Array.from(e.target.files);
      if (files.length === 0) return;
      e.target.value = '';
      await this._uploadCategoryMusic(files);
    });

    // Clear all (owner only)
    document.getElementById('gallery-music-clear').addEventListener('click', async () => {
      if (typeof Auth !== 'undefined' && !Auth.isOwner) return;
      await this._clearCategoryMusic();
    });

    // Auto-advance when track ends
    audio.addEventListener('ended', () => {
      this._nextCategoryTrack();
    });

    // Music icon: toggle floating panel
    document.getElementById('gallery-music-icon').addEventListener('click', (e) => {
      e.stopPropagation();
      this._toggleMusicPanel();
    });

    // Click outside panel to close
    document.addEventListener('click', (e) => {
      const bar = document.getElementById('gallery-music-bar');
      const icon = document.getElementById('gallery-music-icon');
      if (bar.classList.contains('show') &&
          !bar.contains(e.target) &&
          !icon.contains(e.target)) {
        bar.classList.remove('show');
        icon.classList.remove('active');
      }
    });
  },

  async _enterCategoryMode(catId) {
    this._inCategoryMode = true;
    // Pause global BGM, remember its state
    this._globalWasPlaying = (typeof App !== 'undefined' && App.musicPlaying);
    if (this._globalWasPlaying) App._stopMusic();

    // Load this category's music
    await this._loadCategoryMusic(catId);

    // Show the music icon (panel stays hidden until user clicks it)
    this._showMusicBar();

    // Auto-play if music exists
    if (this.categoryMusic.length > 0) {
      this._playCategoryTrack(0);
    } else {
      this.categoryMusicIdx = -1;
      this.categoryMusicPlaying = false;
      this._updateMusicBarUI();
    }
  },

  _exitCategoryMode() {
    if (!this._inCategoryMode) return;
    this._inCategoryMode = false;
    this._stopCategoryMusic();
    this._hideMusicBar();
    // Resume global BGM if it was playing before
    if (this._globalWasPlaying && typeof App !== 'undefined' && App.musicList.length > 0) {
      const idx = App.musicCurrentIdx >= 0 ? App.musicCurrentIdx : 0;
      App._playTrack(idx);
    }
    this._globalWasPlaying = false;
  },

  // Called by App.navigate() when leaving Gallery page
  _pauseForPageLeave() {
    if (!this._inCategoryMode) return;
    const audio = document.getElementById('gallery-bgm-audio');
    if (!audio.paused) audio.pause();
    // Resume global if it was playing
    if (this._globalWasPlaying && typeof App !== 'undefined' && App.musicList.length > 0) {
      const idx = App.musicCurrentIdx >= 0 ? App.musicCurrentIdx : 0;
      App._playTrack(idx);
    }
  },

  // Called by App.navigate() when returning to Gallery page
  _resumeForPageReturn() {
    if (!this._inCategoryMode) return;
    // Pause global again
    if (typeof App !== 'undefined' && App.musicPlaying) {
      this._globalWasPlaying = true;
      App._stopMusic();
    }
    // Resume category music if it was playing
    if (this.categoryMusic.length > 0 && this.categoryMusicPlaying) {
      const audio = document.getElementById('gallery-bgm-audio');
      audio.play().catch(() => {
        // Autoplay blocked (not a user gesture) — show paused state
        this.categoryMusicPlaying = false;
        this._updateMusicBarUI();
      });
    }
  },

  async _loadCategoryMusic(catId) {
    try {
      this.categoryMusic = (await DB.getMeta('galleryMusic_' + catId)) || [];
    } catch (e) {
      this.categoryMusic = [];
    }
    this.categoryMusicIdx = -1;
    this.categoryMusicPlaying = false;
  },

  async _saveCategoryMusic() {
    if (!this.currentCategory || this.currentCategory === 'all') return;
    try {
      await DB.setMeta('galleryMusic_' + this.currentCategory, this.categoryMusic);
    } catch (e) {
      console.error('[Gallery] Failed to save category music:', e);
    }
  },

  _playCategoryTrack(idx) {
    if (idx < 0 || idx >= this.categoryMusic.length) return;
    const track = this.categoryMusic[idx];
    const audio = document.getElementById('gallery-bgm-audio');
    audio.src = DB.blobToURL(track.url);
    audio.volume = parseInt(document.getElementById('gallery-music-volume').value) / 100;
    this.categoryMusicIdx = idx;
    this.categoryMusicPlaying = true; // Optimistic
    this._updateMusicBarUI();
    audio.play().catch(() => {
      // Autoplay blocked — revert to paused state
      this.categoryMusicPlaying = false;
      this._updateMusicBarUI();
    });
  },

  _nextCategoryTrack() {
    if (this.categoryMusic.length === 0) return;
    const next = (this.categoryMusicIdx + 1) % this.categoryMusic.length;
    this._playCategoryTrack(next);
  },

  _toggleCategoryMusic() {
    if (this.categoryMusic.length === 0) {
      App.toast('No music for this category');
      return;
    }
    if (this.categoryMusicPlaying) {
      const audio = document.getElementById('gallery-bgm-audio');
      audio.pause();
      this.categoryMusicPlaying = false;
      this._updateMusicBarUI();
    } else {
      const audio = document.getElementById('gallery-bgm-audio');
      if (audio.src) {
        this.categoryMusicPlaying = true; // Optimistic
        this._updateMusicBarUI();
        audio.play().catch(() => {
          this.categoryMusicPlaying = false; // Revert if blocked
          this._updateMusicBarUI();
        });
      } else {
        this._playCategoryTrack(this.categoryMusicIdx >= 0 ? this.categoryMusicIdx : 0);
      }
    }
  },

  _stopCategoryMusic() {
    const audio = document.getElementById('gallery-bgm-audio');
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
    this.categoryMusicPlaying = false;
  },

  _showMusicBar() {
    // Show the music icon button (floating panel stays hidden until clicked)
    document.getElementById('gallery-music-icon').style.display = '';
  },

  _hideMusicBar() {
    const icon = document.getElementById('gallery-music-icon');
    const bar = document.getElementById('gallery-music-bar');
    icon.style.display = 'none';
    icon.classList.remove('active');
    bar.classList.remove('show');
    document.getElementById('gallery-music-list-wrap').style.display = 'none';
  },

  _toggleMusicPanel() {
    const icon = document.getElementById('gallery-music-icon');
    const bar = document.getElementById('gallery-music-bar');
    bar.classList.toggle('show');
    icon.classList.toggle('active', bar.classList.contains('show'));
    // When opening for owner, auto-expand playlist so upload button is visible
    if (bar.classList.contains('show') && typeof Auth !== 'undefined' && Auth.isOwner) {
      document.getElementById('gallery-music-list-wrap').style.display = 'block';
    }
  },

  _updateMusicBarUI() {
    const playBtn = document.getElementById('gallery-music-play');
    const iconPlay = playBtn.querySelector('.gm-icon-play');
    const iconPause = playBtn.querySelector('.gm-icon-pause');
    const nameEl = document.getElementById('gallery-music-track-name');
    const posEl = document.getElementById('gallery-music-track-pos');
    const countEl = document.getElementById('gallery-music-count');

    if (this.categoryMusicPlaying) {
      iconPlay.style.display = 'none';
      iconPause.style.display = '';
    } else {
      iconPlay.style.display = '';
      iconPause.style.display = 'none';
    }

    if (this.categoryMusic.length === 0) {
      nameEl.textContent = 'No music for this category';
      posEl.textContent = '';
    } else {
      const track = this.categoryMusic[this.categoryMusicIdx] || this.categoryMusic[0];
      nameEl.textContent = track.name;
      posEl.textContent = `${(this.categoryMusicIdx >= 0 ? this.categoryMusicIdx : 0) + 1} / ${this.categoryMusic.length}`;
    }
    countEl.textContent = this.categoryMusic.length;
    // Sync music icon playing indicator
    const mIcon = document.getElementById('gallery-music-icon');
    if (mIcon) mIcon.classList.toggle('is-playing', this.categoryMusicPlaying);
    this._renderCategoryMusicList();
  },

  _renderCategoryMusicList() {
    const list = document.getElementById('gallery-music-list');
    list.innerHTML = '';
    if (this.categoryMusic.length === 0) {
      list.innerHTML = '<div style="color:var(--c-text-4);font-size:11px;padding:8px;">No music uploaded for this category</div>';
      return;
    }
    const isOwner = typeof Auth !== 'undefined' && Auth.isOwner;
    this.categoryMusic.forEach((track, i) => {
      const isCurrent = i === this.categoryMusicIdx && this.categoryMusicPlaying;
      const item = document.createElement('div');
      item.className = 'music-item' + (i === this.categoryMusicIdx ? ' playing' : '');
      item.innerHTML = `
        <span class="music-item-idx">${i + 1}</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
        <span class="music-item-name">${track.name}</span>
        <span class="music-status">${isCurrent ? '❚❚' : '▶'}</span>
        ${isOwner ? '<button class="music-del-btn" data-idx="' + i + '" title="Remove">✕</button>' : ''}
      `;
      item.addEventListener('click', (e) => {
        if (e.target.classList.contains('music-del-btn')) return;
        if (i === this.categoryMusicIdx && this.categoryMusicPlaying) {
          this._toggleCategoryMusic();
        } else {
          this._playCategoryTrack(i);
        }
      });
      list.appendChild(item);
    });
    if (isOwner) {
      list.querySelectorAll('.music-del-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          await this._deleteCategoryTrack(parseInt(btn.dataset.idx));
        });
      });
    }
  },

  async _uploadCategoryMusic(files) {
    if (typeof Auth !== 'undefined' && !Auth.isOwner) return;
    if (!this.currentCategory || this.currentCategory === 'all') return;
    App.toast(`Uploading ${files.length} track(s)...`);
    let count = 0;
    for (const file of files) {
      try {
        const { url, key } = await DB.uploadFile(file, file.name);
        this.categoryMusic.push({ url, key, name: file.name });
        count++;
      } catch (err) {
        console.error('[Gallery] Category music upload failed:', file.name, err);
      }
    }
    if (count > 0) {
      await this._saveCategoryMusic();
      // Auto-play starting from first newly uploaded track
      if (!this.categoryMusicPlaying && this.categoryMusic.length > 0) {
        const startIdx = this.categoryMusic.length - count;
        this._playCategoryTrack(startIdx >= 0 ? startIdx : 0);
      } else {
        this._updateMusicBarUI();
      }
      App.toast(`${count} track(s) added to category`);
    } else {
      App.toast('Upload failed');
    }
  },

  async _deleteCategoryTrack(idx) {
    if (typeof Auth !== 'undefined' && !Auth.isOwner) return;
    if (idx < 0 || idx >= this.categoryMusic.length) return;
    const track = this.categoryMusic[idx];
    if (track.key) { await DB.deleteFile(track.key).catch(() => {}); }
    const wasCurrent = idx === this.categoryMusicIdx;
    if (wasCurrent) this._stopCategoryMusic();
    this.categoryMusic.splice(idx, 1);
    if (this.categoryMusicIdx > idx) {
      this.categoryMusicIdx--;
    } else if (this.categoryMusicIdx === idx) {
      this.categoryMusicIdx = -1;
    }
    await this._saveCategoryMusic();
    // If we stopped and there are still tracks, resume from next
    if (wasCurrent && this.categoryMusic.length > 0) {
      const nextIdx = Math.min(idx, this.categoryMusic.length - 1);
      this._playCategoryTrack(nextIdx);
    } else {
      this._updateMusicBarUI();
    }
    App.toast('Track removed');
  },

  async _clearCategoryMusic() {
    if (typeof Auth !== 'undefined' && !Auth.isOwner) return;
    if (this.categoryMusic.length === 0) return;
    this._stopCategoryMusic();
    for (const track of this.categoryMusic) {
      if (track.key) { await DB.deleteFile(track.key).catch(() => {}); }
    }
    this.categoryMusic = [];
    await this._saveCategoryMusic();
    this._updateMusicBarUI();
    App.toast('All category music cleared');
  }
};
