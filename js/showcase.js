/* ================================================================
   Showcase Logic — Carousel with auto-play & manual nav
   ================================================================ */

const Showcase = {
  photos: [],
  _order: [],  // Array of photo IDs in display order
  currentIdx: 0,
  autoTimer: null,
  autoInterval: 5000,
  track: null,
  dotsContainer: null,

  async init() {
    this.track = document.getElementById('carousel-track');
    this.dotsContainer = document.getElementById('carousel-dots');

    // Upload
    document.getElementById('showcase-upload-btn').addEventListener('click', () => {
      document.getElementById('showcase-upload').click();
    });
    document.getElementById('showcase-upload').addEventListener('change', async (e) => {
      await this.handleUpload(e.target.files);
      e.target.value = '';
    });

    // Arrows
    document.getElementById('carousel-prev').addEventListener('click', () => {
      this.goTo(this.currentIdx - 1);
      this.restartAuto();
    });
    document.getElementById('carousel-next').addEventListener('click', () => {
      this.goTo(this.currentIdx + 1);
      this.restartAuto();
    });

    // Touch / drag
    let startX = 0, isDragging = false;
    const wrap = document.querySelector('.carousel-wrap');
    wrap.addEventListener('mousedown', (e) => {
      startX = e.clientX;
      isDragging = true;
    });
    wrap.addEventListener('mouseup', (e) => {
      if (!isDragging) return;
      isDragging = false;
      const diff = e.clientX - startX;
      if (Math.abs(diff) > 50) {
        if (diff > 0) this.goTo(this.currentIdx - 1);
        else this.goTo(this.currentIdx + 1);
        this.restartAuto();
      }
    });
    wrap.addEventListener('touchstart', (e) => { startX = e.touches[0].clientX; }, { passive: true });
    wrap.addEventListener('touchend', (e) => {
      const diff = e.changedTouches[0].clientX - startX;
      if (Math.abs(diff) > 50) {
        if (diff > 0) this.goTo(this.currentIdx - 1);
        else this.goTo(this.currentIdx + 1);
        this.restartAuto();
      }
    });

    // Reorder button
    document.getElementById('showcase-reorder-btn').addEventListener('click', () => {
      this._showReorderModal();
    });
    document.getElementById('showcase-reorder-close').addEventListener('click', () => {
      this._hideReorderModal();
    });
    document.getElementById('reorder-cancel-btn').addEventListener('click', () => {
      this._hideReorderModal();
    });
    document.getElementById('reorder-save-btn').addEventListener('click', async () => {
      await this._saveOrderFromModal();
      this._hideReorderModal();
    });

    // Load saved photos
    await this.load();
  },

  async load() {
    this.photos = await DB.getAll(DB.STORES.showcase);
    // Load custom order from meta
    const savedOrder = await DB.getMeta('showcase_order');
    if (savedOrder && Array.isArray(savedOrder)) {
      this._order = savedOrder;
    } else {
      this._order = this.photos.slice().sort((a, b) => a.ts - b.ts).map(p => p.id);
    }
    // Sort photos by custom order, any new photos not in order list go to the end
    this._sortPhotosByOrder();
    this.render();
    this._updateReorderBtn();
  },

  _sortPhotosByOrder() {
    const orderMap = {};
    this._order.forEach((id, i) => { orderMap[id] = i; });
    this.photos.sort((a, b) => {
      const ai = orderMap[a.id] !== undefined ? orderMap[a.id] : Infinity;
      const bi = orderMap[b.id] !== undefined ? orderMap[b.id] : Infinity;
      if (ai === Infinity && bi === Infinity) return a.ts - b.ts; // Both new: fallback to ts
      return ai - bi;
    });
  },

  _updateReorderBtn() {
    const btn = document.getElementById('showcase-reorder-btn');
    if (btn) btn.style.display = this.photos.length > 1 ? '' : 'none';
  },

  async handleUpload(files) {
    if (typeof Auth !== 'undefined' && !Auth.isOwner) return;
    let count = 0;
    for (const file of files) {
      if (!file.type.startsWith('image/')) continue;
      try {
        App.toast(`Processing "${file.name}"...`);
        // Compress to display version (max 1920px, quality 85)
        const { blob, width, height } = await App.compressImage(file, 1920, 0.85);
        const fileName = file.name.replace(/\.[^.]+$/, '') + '.jpg';
        const uploaded = await DB.uploadFile(blob, fileName);
        await DB.put(DB.STORES.showcase, {
          id: DB.uid(),
          blob: uploaded.url,
          fileKey: uploaded.key,
          name: file.name,
          ts: Date.now()
        });
        count++;
      } catch (err) {
        App.toast(`Failed to upload "${file.name}"`);
        console.error(err);
      }
    }
    if (count > 0) {
      await this.load();
      App.toast(`${count} photo(s) added to showcase`);
    }
  },

  render() {
    const track = this.track;
    const dotsEl = this.dotsContainer;
    const countEl = document.getElementById('showcase-photo-count');
    countEl.textContent = this.photos.length;

    if (this.photos.length === 0) {
      track.innerHTML = `
        <div class="carousel-slide">
          <div class="slide-placeholder">
            <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
            <p>NO PHOTOS · UPLOAD TO BEGIN</p>
          </div>
        </div>`;
      dotsEl.innerHTML = '';
      return;
    }

    track.innerHTML = '';
    dotsEl.innerHTML = '';

    this.photos.forEach((photo, i) => {
      const slide = document.createElement('div');
      slide.className = 'carousel-slide';
      const url = DB.blobToURL(photo.blob);
      slide.innerHTML = `
        <img src="${url}" alt="${photo.name}" loading="lazy">
        <div class="slide-actions owner-only">
          <button class="slide-del-btn" data-idx="${i}" title="Remove">✕</button>
        </div>
      `;
      track.appendChild(slide);

      const dot = document.createElement('div');
      dot.className = 'carousel-dot' + (i === this.currentIdx ? ' active' : '');
      dot.addEventListener('click', () => {
        this.goTo(i);
        this.restartAuto();
      });
      dotsEl.appendChild(dot);
    });

    // Bind delete buttons
    track.querySelectorAll('.slide-del-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.deletePhoto(parseInt(btn.dataset.idx));
      });
    });

    if (this.currentIdx >= this.photos.length) {
      this.currentIdx = 0;
    }
    this.goTo(this.currentIdx);
    this.startAuto();
  },

  goTo(idx) {
    if (this.photos.length === 0) return;
    idx = ((idx % this.photos.length) + this.photos.length) % this.photos.length;
    this.currentIdx = idx;
    this.track.style.transform = `translateX(-${idx * 100}%)`;
    this.dotsContainer.querySelectorAll('.carousel-dot').forEach((d, i) => {
      d.classList.toggle('active', i === idx);
    });
  },

  startAuto() {
    this.stopAuto();
    if (this.photos.length > 1) {
      this.autoTimer = setInterval(() => {
        this.goTo(this.currentIdx + 1);
      }, this.autoInterval);
    }
  },

  stopAuto() {
    if (this.autoTimer) {
      clearInterval(this.autoTimer);
      this.autoTimer = null;
    }
  },

  restartAuto() {
    this.stopAuto();
    this.startAuto();
  },

  async deletePhoto(idx) {
    if (typeof Auth !== 'undefined' && !Auth.isOwner) return;
    const photo = this.photos[idx];
    if (!photo) return;
    // Delete file from R2 if we have the key
    if (photo.fileKey) {
      try { await DB.deleteFile(photo.fileKey); } catch (e) { console.error('R2 delete failed:', e); }
    }
    await DB.del(DB.STORES.showcase, photo.id);
    // Remove from order
    this._order = this._order.filter(id => id !== photo.id);
    await DB.setMeta('showcase_order', this._order);
    this.photos.splice(idx, 1);
    if (this.currentIdx >= this.photos.length) {
      this.currentIdx = Math.max(0, this.photos.length - 1);
    }
    this.render();
    this._updateReorderBtn();
    App.toast('Photo removed');
  },

  // ==================== Reorder Modal ====================
  _showReorderModal() {
    if (!Auth.isOwner) return;
    const modal = document.getElementById('showcase-reorder-modal');
    const grid = document.getElementById('reorder-grid');
    modal.style.display = 'flex';

    // Build draggable thumbnail grid
    grid.innerHTML = '';
    this.photos.forEach((photo, i) => {
      const item = document.createElement('div');
      item.className = 'reorder-item';
      item.draggable = true;
      item.dataset.idx = i;
      const url = DB.blobToURL(photo.blob);
      item.innerHTML = `
        <img src="${url}" alt="${this._escapeAttr(photo.name)}" loading="lazy">
        <div class="reorder-item-label">${i + 1}</div>
      `;
      // Drag events
      item.addEventListener('dragstart', (e) => this._onDragStart(e));
      item.addEventListener('dragover', (e) => this._onDragOver(e));
      item.addEventListener('dragenter', (e) => this._onDragEnter(e));
      item.addEventListener('dragleave', (e) => this._onDragLeave(e));
      item.addEventListener('drop', (e) => this._onDrop(e));
      item.addEventListener('dragend', (e) => this._onDragEnd(e));
      grid.appendChild(item);
    });
  },

  _hideReorderModal() {
    document.getElementById('showcase-reorder-modal').style.display = 'none';
  },

  _dragSrcIdx: null,

  _onDragStart(e) {
    this._dragSrcIdx = parseInt(e.currentTarget.dataset.idx);
    e.currentTarget.classList.add('reorder-dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', this._dragSrcIdx);
  },

  _onDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  },

  _onDragEnter(e) {
    e.preventDefault();
    e.currentTarget.classList.add('reorder-drag-over');
  },

  _onDragLeave(e) {
    e.currentTarget.classList.remove('reorder-drag-over');
  },

  _onDrop(e) {
    e.preventDefault();
    e.currentTarget.classList.remove('reorder-drag-over');
    const targetIdx = parseInt(e.currentTarget.dataset.idx);
    const srcIdx = this._dragSrcIdx;
    if (srcIdx === null || srcIdx === targetIdx) return;

    // Reorder the photos array
    const [moved] = this.photos.splice(srcIdx, 1);
    this.photos.splice(targetIdx, 0, moved);

    // Re-render the grid with new order
    this._showReorderModal(); // Rebuild grid with updated order
  },

  _onDragEnd(e) {
    e.currentTarget.classList.remove('reorder-dragging');
    // Clean up any lingering drag-over classes
    document.querySelectorAll('.reorder-drag-over').forEach(el => el.classList.remove('reorder-drag-over'));
    this._dragSrcIdx = null;
  },

  async _saveOrderFromModal() {
    // Build new order from current photos array order
    this._order = this.photos.map(p => p.id);
    await DB.setMeta('showcase_order', this._order);
    this.render();
    App.toast('Display order saved');
  },

  _escapeAttr(str) {
    if (!str) return '';
    return String(str).replace(/"/g, '&quot;').replace(/</g, '&lt;');
  }
};
