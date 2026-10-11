/* ================================================================
   Editor — Photo Editing Canvas & Tools
   Features: Adjust · Filters · Cutout · Stickers · Draw · Crop
   ================================================================ */

const Editor = {
  canvas: null,
  ctx: null,
  drawCanvas: null,       // offscreen for brush strokes
  drawCtx: null,
  workingCanvas: null,    // offscreen: image data (post-cutout)
  workingCtx: null,
  originalImage: null,    // HTMLImageElement
  imgW: 0,
  imgH: 0,

  // Adjustments
  adjustments: {
    brightness: 100,
    contrast: 100,
    saturation: 100,
    hue: 0,
    blur: 0,
    sepia: 0,
    grayscale: 0,
    invert: 0,
    opacity: 100,
    temperature: 0,
    vignette: 0,
    sharpen: 0
  },

  activeFilter: 'none',
  stickers: [],
  currentTool: null,
  isDrawing: false,
  drawColor: '#9d4edd',
  drawSize: 5,
  eraserMode: false,

  history: [],
  historyIdx: -1,
  maxHistory: 20,

  // Filter presets
  FILTER_PRESETS: {
    none: { brightness: 100, contrast: 100, saturation: 100, hue: 0, sepia: 0, grayscale: 0, blur: 0, invert: 0 },
    vintage: { brightness: 110, contrast: 90, saturation: 80, hue: 15, sepia: 40, grayscale: 0, blur: 0, invert: 0 },
    cool: { brightness: 100, contrast: 110, saturation: 90, hue: 200, sepia: 0, grayscale: 0, blur: 0, invert: 0 },
    warm: { brightness: 105, contrast: 105, saturation: 110, hue: 20, sepia: 20, grayscale: 0, blur: 0, invert: 0 },
    mono: { brightness: 100, contrast: 120, saturation: 0, hue: 0, sepia: 0, grayscale: 100, blur: 0, invert: 0 },
    noir: { brightness: 95, contrast: 140, saturation: 0, hue: 0, sepia: 0, grayscale: 100, blur: 0, invert: 0 },
    dream: { brightness: 110, contrast: 85, saturation: 120, hue: 350, sepia: 10, grayscale: 0, blur: 1, invert: 0 },
    punch: { brightness: 105, contrast: 130, saturation: 150, hue: 0, sepia: 0, grayscale: 0, blur: 0, invert: 0 },
    cyber: { brightness: 95, contrast: 130, saturation: 140, hue: 270, sepia: 0, grayscale: 0, blur: 0, invert: 0 },
    fade: { brightness: 115, contrast: 80, saturation: 70, hue: 0, sepia: 15, grayscale: 0, blur: 0, invert: 0 },
    invert: { brightness: 100, contrast: 100, saturation: 100, hue: 180, sepia: 0, grayscale: 0, blur: 0, invert: 100 }
  },

  // Sticker packs
  STICKERS: [
    '✨','💫','⭐','🌟','💎','🔥','❤️','💜','🖤','💎','🌹','🦋','🌙','☀️','⚡','🎭',
    '👑','💄','👗','👁️','💋','🎀','🌸','🌺','🍃','❄️','🌈','💜','🖤','🔮','🃏','🎮'
  ],

  COLORS: ['#ffffff', '#000000', '#9d4edd', '#b975ff', '#ff006e', '#ffbe0b', '#3a86ff', '#4ade80', '#fb5607', '#ff006e'],

  init() {
    this.canvas = document.getElementById('editor-canvas');
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    this.drawCanvas = document.createElement('canvas');
    this.drawCtx = this.drawCanvas.getContext('2d');
    this.workingCanvas = document.createElement('canvas');
    this.workingCtx = this.workingCanvas.getContext('2d');

    // Open image
    document.getElementById('editor-open-btn').addEventListener('click', () => {
      document.getElementById('editor-upload').click();
    });
    document.getElementById('editor-empty-btn').addEventListener('click', () => {
      document.getElementById('editor-upload').click();
    });
    document.getElementById('editor-upload').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) this.openImage(file);
      e.target.value = '';
    });

    // Tool buttons
    document.querySelectorAll('.tool-btn[data-tool]').forEach(btn => {
      btn.addEventListener('click', () => this.selectTool(btn.dataset.tool));
    });

    // Undo / Redo / Reset
    document.getElementById('undo-btn').addEventListener('click', () => this.undo());
    document.getElementById('redo-btn').addEventListener('click', () => this.redo());
    document.getElementById('reset-btn').addEventListener('click', () => this.resetAll());

    // Download
    document.getElementById('download-btn').addEventListener('click', () => this.showDownloadModal());
    document.getElementById('dl-cancel').addEventListener('click', () => {
      document.getElementById('download-modal').classList.remove('show');
    });
    document.getElementById('dl-confirm').addEventListener('click', () => this.doDownload());

    // Setup draw on canvas
    this._setupDrawEvents();

    // Sticker drag
    this._setupStickerEvents();
  },

  // ==================== Open Image ====================
  openImage(file) {
    if (!file.type.startsWith('image/')) return;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      this.originalImage = img;
      this.imgW = img.width;
      this.imgH = img.height;
      // Limit canvas size for performance
      const maxDim = 2400;
      let w = this.imgW, h = this.imgH;
      if (w > maxDim || h > maxDim) {
        const ratio = Math.min(maxDim / w, maxDim / h);
        w = Math.round(w * ratio);
        h = Math.round(h * ratio);
      }
      this.canvas.width = w;
      this.canvas.height = h;
      this.workingCanvas.width = w;
      this.workingCanvas.height = h;
      this.drawCanvas.width = w;
      this.drawCanvas.height = h;

      this.workingCtx.drawImage(img, 0, 0, w, h);
      this.drawCtx.clearRect(0, 0, w, h);

      this.resetAdjustments();
      this.activeFilter = 'none';
      this.stickers = [];
      this.stickerIdCounter = 0;
      this.history = [];
      this.historyIdx = -1;
      this.saveState();

      this.canvas.style.display = 'block';
      document.getElementById('editor-empty').style.display = 'none';
      this.render();
      App.toast('Image loaded');
      URL.revokeObjectURL(url);
    };
    img.src = url;
  },

  // ==================== Render ====================
  render() {
    if (!this.originalImage) return;
    const w = this.canvas.width, h = this.canvas.height;
    const ctx = this.ctx;

    ctx.clearRect(0, 0, w, h);

    // Apply filter from adjustments + active filter preset
    const filterStr = this._buildFilterString();
    ctx.filter = filterStr;
    ctx.drawImage(this.workingCanvas, 0, 0, w, h);
    ctx.filter = 'none';

    // Temperature (warm/cool shift)
    if (this.adjustments.temperature !== 0) {
      this._applyTemperature();
    }

    // Vignette
    if (this.adjustments.vignette > 0) {
      this._applyVignette();
    }

    // Sharpen
    if (this.adjustments.sharpen > 0) {
      this._applySharpen();
    }

    // Draw brush layer
    ctx.drawImage(this.drawCanvas, 0, 0, w, h);

    // Draw stickers
    for (const s of this.stickers) {
      this._drawSticker(ctx, s);
    }
  },

  _buildFilterString() {
    const a = this.adjustments;
    const preset = this.FILTER_PRESETS[this.activeFilter] || this.FILTER_PRESETS.none;
    const b = preset.brightness * a.brightness / 100;
    const c = preset.contrast * a.contrast / 100;
    const s = preset.saturation * a.saturation / 100;
    const hue = a.hue + preset.hue;
    const sep = Math.max(a.sepia, preset.sepia);
    const gray = Math.max(a.grayscale, preset.grayscale);
    const blur = Math.max(a.blur, preset.blur);
    const inv = Math.max(a.invert, preset.invert);

    return `brightness(${b}%) contrast(${c}%) saturate(${s}%) hue-rotate(${hue}deg) sepia(${sep}%) grayscale(${gray}%) blur(${blur}px) invert(${inv}%) opacity(${a.opacity}%)`;
  },

  _applyTemperature() {
    const ctx = this.ctx;
    const t = this.adjustments.temperature;
    const w = this.canvas.width, h = this.canvas.height;
    const imgData = ctx.getImageData(0, 0, w, h);
    const d = imgData.data;
    const warm = t > 0;
    const amount = Math.abs(t) / 100;
    for (let i = 0; i < d.length; i += 4) {
      if (warm) {
        d[i] = Math.min(255, d[i] + amount * 30);       // R
        d[i + 2] = Math.max(0, d[i + 2] - amount * 30); // B
      } else {
        d[i] = Math.max(0, d[i] - amount * 30);
        d[i + 2] = Math.min(255, d[i + 2] + amount * 30);
      }
    }
    ctx.putImageData(imgData, 0, 0);
  },

  _applyVignette() {
    const ctx = this.ctx;
    const w = this.canvas.width, h = this.canvas.height;
    const v = this.adjustments.vignette / 100;
    const grd = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.75);
    grd.addColorStop(0, 'rgba(0,0,0,0)');
    grd.addColorStop(1, `rgba(0,0,0,${v})`);
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, w, h);
  },

  _applySharpen() {
    const ctx = this.ctx;
    const w = this.canvas.width, h = this.canvas.height;
    const amount = this.adjustments.sharpen / 100;
    const src = ctx.getImageData(0, 0, w, h);
    const dst = ctx.createImageData(w, h);
    const s = src.data, d = dst.data;
    const center = 1 + 4 * amount;
    const side = -amount;
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const idx = (y * w + x) * 4;
        for (let c = 0; c < 3; c++) {
          const val = s[idx + c] * center
            + s[idx - 4 + c] * side
            + s[idx + 4 + c] * side
            + s[idx - w * 4 + c] * side
            + s[idx + w * 4 + c] * side;
          d[idx + c] = Math.max(0, Math.min(255, val));
        }
        d[idx + 3] = s[idx + 3];
      }
    }
    // Copy edges
    for (let i = 0; i < w; i++) {
      [0, (h - 1) * w * 4].forEach(off => {
        const idx = i * 4 + off;
        for (let c = 0; c < 4; c++) d[idx + c] = s[idx + c];
      });
    }
    ctx.putImageData(dst, 0, 0);
  },

  // ==================== Tool Selection ====================
  selectTool(tool) {
    this.currentTool = tool;
    document.querySelectorAll('.tool-btn[data-tool]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tool === tool);
    });
    const panel = document.getElementById('editor-panel');
    panel.classList.add('show');
    const content = document.getElementById('editor-panel-content');

    switch (tool) {
      case 'adjust': this._renderAdjustPanel(content); break;
      case 'filters': this._renderFiltersPanel(content); break;
      case 'cutout': this._renderCutoutPanel(content); break;
      case 'stickers': this._renderStickersPanel(content); break;
      case 'draw': this._renderDrawPanel(content); break;
      case 'crop': this._renderCropPanel(content); break;
    }
  },

  // ==================== Adjust Panel ====================
  _renderAdjustPanel(el) {
    const items = [
      ['brightness', 'Brightness', 0, 200, '%'],
      ['contrast', 'Contrast', 0, 200, '%'],
      ['saturation', 'Saturation', 0, 200, '%'],
      ['hue', 'Hue Rotate', 0, 360, '°'],
      ['blur', 'Blur', 0, 20, 'px'],
      ['temperature', 'Temperature', -100, 100, ''],
      ['vignette', 'Vignette', 0, 100, '%'],
      ['sharpen', 'Sharpen', 0, 100, '%'],
      ['sepia', 'Sepia', 0, 100, '%'],
      ['grayscale', 'Grayscale', 0, 100, '%'],
      ['invert', 'Invert', 0, 100, '%'],
      ['opacity', 'Opacity', 0, 100, '%']
    ];

    el.innerHTML = '<div class="tool-group"><div class="tool-group-title">ADJUSTMENTS</div></div>';
    const group = el.querySelector('.tool-group');

    items.forEach(([key, label, min, max, unit]) => {
      const row = document.createElement('div');
      row.className = 'adjust-row';
      row.innerHTML = `
        <label>${label} <span id="val-${key}">${this.adjustments[key]}${unit}</span></label>
        <input type="range" min="${min}" max="${max}" value="${this.adjustments[key]}" data-key="${key}" data-unit="${unit}">
      `;
      group.appendChild(row);
    });

    // Reset button
    const resetDiv = document.createElement('div');
    resetDiv.style.padding = '10px 0';
    resetDiv.innerHTML = '<button class="panel-btn" style="width:100%;" id="reset-adjust">RESET ALL</button>';
    group.appendChild(resetDiv);
    document.getElementById('reset-adjust').addEventListener('click', () => {
      this.resetAdjustments();
      this.render();
      this._renderAdjustPanel(el);
      this.saveState();
    });

    group.querySelectorAll('input[type="range"]').forEach(input => {
      input.addEventListener('input', (e) => {
        const key = e.target.dataset.key;
        const unit = e.target.dataset.unit;
        this.adjustments[key] = parseFloat(e.target.value);
        document.getElementById('val-' + key).textContent = this.adjustments[key] + unit;
        this.render();
      });
      input.addEventListener('change', () => this.saveState());
    });
  },

  resetAdjustments() {
    this.adjustments = {
      brightness: 100, contrast: 100, saturation: 100, hue: 0,
      blur: 0, sepia: 0, grayscale: 0, invert: 0, opacity: 100,
      temperature: 0, vignette: 0, sharpen: 0
    };
  },

  // ==================== Filters Panel ====================
  _renderFiltersPanel(el) {
    el.innerHTML = '<div class="tool-group"><div class="tool-group-title">PRESET FILTERS</div><div class="filter-grid" id="filter-grid"></div></div>';
    const grid = document.getElementById('filter-grid');

    // Create a thumbnail from current image
    const thumbCanvas = document.createElement('canvas');
    thumbCanvas.width = 120;
    thumbCanvas.height = 80;
    const thumbCtx = thumbCanvas.getContext('2d');
    if (this.originalImage) {
      thumbCtx.drawImage(this.workingCanvas, 0, 0, 120, 80);
    }
    const thumbURL = thumbCanvas.toDataURL();

    Object.keys(this.FILTER_PRESETS).forEach(name => {
      const preset = this.FILTER_PRESETS[name];
      const filterStr = `brightness(${preset.brightness}%) contrast(${preset.contrast}%) saturate(${preset.saturation}%) hue-rotate(${preset.hue}deg) sepia(${preset.sepia}%) grayscale(${preset.grayscale}%) blur(${preset.blur}px) invert(${preset.invert}%)`;

      const item = document.createElement('div');
      item.className = 'filter-item' + (name === this.activeFilter ? ' active' : '');
      item.innerHTML = `
        <div class="filter-thumb" style="background-image:url(${thumbURL}); filter:${filterStr};"></div>
        <div class="filter-name">${name.toUpperCase()}</div>
      `;
      item.addEventListener('click', () => {
        this.activeFilter = name;
        this.render();
        grid.querySelectorAll('.filter-item').forEach(i => i.classList.remove('active'));
        item.classList.add('active');
        this.saveState();
      });
      grid.appendChild(item);
    });
  },

  // ==================== Cutout Panel ====================
  _renderCutoutPanel(el) {
    el.innerHTML = `
      <div class="tool-group">
        <div class="tool-group-title">BACKGROUND REMOVAL</div>
        <p class="cutout-info">
          Click on the image to remove a color region (magic wand).<br>
          Adjust tolerance to control how much gets removed.
        </p>
        <div class="adjust-row">
          <label>Tolerance <span id="cutout-tol-val">30</span></label>
          <input type="range" id="cutout-tolerance" min="5" max="100" value="30">
        </div>
        <div class="adjust-row">
          <label>Feather (edge softness) <span id="cutout-feather-val">1</span></label>
          <input type="range" id="cutout-feather" min="0" max="10" value="1">
        </div>
        <button class="panel-btn" style="width:100%;margin-top:8px;" id="cutout-mode-btn">
          ENABLE MAGIC WAND
        </button>
        <button class="panel-btn" style="width:100%;margin-top:8px;" id="cutout-restore-btn">
          RESTORE ORIGINAL
        </button>
        <button class="panel-btn" style="width:100%;margin-top:8px;" id="cutout-erase-all-btn">
          ERASE BACKGROUND (corners)
        </button>
      </div>
    `;

    this.wandTolerance = 30;
    this.wandFeather = 1;
    this.wandMode = false;

    const tolInput = document.getElementById('cutout-tolerance');
    tolInput.addEventListener('input', (e) => {
      this.wandTolerance = parseInt(e.target.value);
      document.getElementById('cutout-tol-val').textContent = this.wandTolerance;
    });
    const featherInput = document.getElementById('cutout-feather');
    featherInput.addEventListener('input', (e) => {
      this.wandFeather = parseInt(e.target.value);
      document.getElementById('cutout-feather-val').textContent = this.wandFeather;
    });

    const modeBtn = document.getElementById('cutout-mode-btn');
    modeBtn.addEventListener('click', () => {
      this.wandMode = !this.wandMode;
      modeBtn.textContent = this.wandMode ? 'DISABLE MAGIC WAND' : 'ENABLE MAGIC WAND';
      modeBtn.classList.toggle('panel-btn-primary', this.wandMode);
      this.canvas.style.cursor = this.wandMode ? 'crosshair' : 'default';
    });

    document.getElementById('cutout-restore-btn').addEventListener('click', () => {
      if (!this.originalImage) return;
      this.workingCtx.clearRect(0, 0, this.workingCanvas.width, this.workingCanvas.height);
      this.workingCtx.drawImage(this.originalImage, 0, 0, this.workingCanvas.width, this.workingCanvas.height);
      this.render();
      this.saveState();
      App.toast('Image restored');
    });

    document.getElementById('cutout-erase-all-btn').addEventListener('click', () => {
      this._eraseCorners();
      this.render();
      this.saveState();
      App.toast('Background corners erased');
    });
  },

  _eraseCorners() {
    const w = this.workingCanvas.width;
    const h = this.workingCanvas.height;
    // Sample 4 corners and remove similar colors
    const ctx = this.workingCtx;
    const corners = [[0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1]];
    const imgData = ctx.getImageData(0, 0, w, h);
    const d = imgData.data;
    const tol = 60;

    for (const [cx, cy] of corners) {
      const idx = (cy * w + cx) * 4;
      const tr = d[idx], tg = d[idx + 1], tb = d[idx + 2];
      // Flood fill from corner
      this._floodErase(d, w, h, cx, cy, tr, tg, tb, tol);
    }

    ctx.putImageData(imgData, 0, 0);
  },

  _floodErase(d, w, h, sx, sy, tr, tg, tb, tol) {
    const stack = [[sx, sy]];
    const visited = new Uint8Array(w * h);
    while (stack.length > 0) {
      const [x, y] = stack.pop();
      if (x < 0 || x >= w || y < 0 || y >= h) continue;
      const pos = y * w + x;
      if (visited[pos]) continue;
      const idx = pos * 4;
      const dr = d[idx] - tr, dg = d[idx + 1] - tg, db = d[idx + 2] - tb;
      const dist = Math.sqrt(dr * dr + dg * dg + db * db);
      if (dist > tol) continue;
      visited[pos] = 1;
      d[idx + 3] = 0; // Make transparent
      stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
    }
  },

  _magicWandAt(x, y) {
    const w = this.workingCanvas.width;
    const h = this.workingCanvas.height;
    // Scale from display coords to canvas coords
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = w / rect.width;
    const scaleY = h / rect.height;
    const cx = Math.floor(x * scaleX);
    const cy = Math.floor(y * scaleY);

    const imgData = this.workingCtx.getImageData(0, 0, w, h);
    const d = imgData.data;
    const idx = (cy * w + cx) * 4;
    const tr = d[idx], tg = d[idx + 1], tb = d[idx + 2];

    this._floodErase(d, w, h, cx, cy, tr, tg, tb, this.wandTolerance || 30);

    // Feather edges
    if (this.wandFeather > 0) {
      this._featherAlpha(d, w, h, this.wandFeather);
    }

    this.workingCtx.putImageData(imgData, 0, 0);
    this.render();
    this.saveState();
  },

  _featherAlpha(d, w, h, radius) {
    // Simple feather: reduce alpha of pixels near transparent/non-transparent boundary
    const copy = new Uint8ClampedArray(d);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = (y * w + x) * 4;
        if (d[idx + 3] === 0) continue;
        // Check neighbors
        let neighborTransparent = false;
        for (let dy = -radius; dy <= radius && !neighborTransparent; dy++) {
          for (let dx = -radius; dx <= radius; dx++) {
            const nx = x + dx, ny = y + dy;
            if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
            const nidx = (ny * w + nx) * 4;
            if (copy[nidx + 3] === 0) { neighborTransparent = true; break; }
          }
        }
        if (neighborTransparent) {
          d[idx + 3] = Math.max(0, d[idx + 3] * 0.5);
        }
      }
    }
  },

  // ==================== Stickers Panel ====================
  _renderStickersPanel(el) {
    el.innerHTML = `
      <div class="tool-group">
        <div class="tool-group-title">ADD STICKER</div>
        <div class="sticker-grid" id="sticker-grid"></div>
      </div>
      <div class="tool-group">
        <div class="tool-group-title">ADD TEXT</div>
        <input type="text" id="sticker-text-input" placeholder="Type text..." style="margin-bottom:8px;">
        <button class="panel-btn" style="width:100%;" id="sticker-text-add">ADD TEXT LAYER</button>
      </div>
      <div class="tool-group">
        <div class="tool-group-title">LAYER CONTROL</div>
        <p class="cutout-info">Click sticker on canvas to select. Drag to move. Use +/- to resize.</p>
        <button class="panel-btn panel-btn-danger" style="width:100%;" id="sticker-del-all">CLEAR ALL STICKERS</button>
      </div>
    `;

    const grid = document.getElementById('sticker-grid');
    this.STICKERS.forEach(emoji => {
      const item = document.createElement('div');
      item.className = 'sticker-item';
      item.textContent = emoji;
      item.addEventListener('click', () => this._addSticker(emoji));
      grid.appendChild(item);
    });

    document.getElementById('sticker-text-add').addEventListener('click', () => {
      const txt = document.getElementById('sticker-text-input').value.trim();
      if (txt) this._addSticker(txt, true);
    });
    document.getElementById('sticker-del-all').addEventListener('click', () => {
      this.stickers = [];
      this.selectedSticker = null;
      this.render();
      this.saveState();
    });
  },

  _addSticker(content, isText = false) {
    const w = this.canvas.width, h = this.canvas.height;
    const sticker = {
      id: ++this.stickerIdCounter,
      type: isText ? 'text' : 'emoji',
      content: content,
      x: w / 2,
      y: h / 2,
      size: isText ? 48 : 64,
      rotation: 0,
      color: '#ffffff',
      isText: isText
    };
    this.stickers.push(sticker);
    this.selectedSticker = sticker;
    this.render();
    this.saveState();
  },

  _drawSticker(ctx, s) {
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(s.rotation * Math.PI / 180);
    ctx.font = `${s.size}px Inter, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (s.isText) {
      ctx.fillStyle = s.color;
      ctx.fillText(s.content, 0, 0);
    } else {
      ctx.fillText(s.content, 0, 0);
    }
    // Selection box
    if (this.selectedSticker && this.selectedSticker.id === s.id) {
      const metrics = ctx.measureText(s.content);
      const bw = Math.max(metrics.width, s.size) / 1.5;
      const bh = s.size / 1.2;
      ctx.strokeStyle = '#9d4edd';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(-bw, -bh, bw * 2, bh * 2);
      ctx.setLineDash([]);
    }
    ctx.restore();
  },

  _setupStickerEvents() {
    let dragSticker = null;
    let dragOffsetX = 0, dragOffsetY = 0;

    this.canvas.addEventListener('mousedown', (e) => {
      if (this.currentTool !== 'stickers' || !this.originalImage) return;
      const pos = this._getCanvasPos(e);
      // Check if clicking on a sticker (reverse order for topmost)
      for (let i = this.stickers.length - 1; i >= 0; i--) {
        const s = this.stickers[i];
        const dx = pos.x - s.x, dy = pos.y - s.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < s.size * 0.8) {
          dragSticker = s;
          this.selectedSticker = s;
          dragOffsetX = dx;
          dragOffsetY = dy;
          this.render();
          return;
        }
      }
      this.selectedSticker = null;
      this.render();
    });

    this.canvas.addEventListener('mousemove', (e) => {
      if (!dragSticker) return;
      const pos = this._getCanvasPos(e);
      dragSticker.x = pos.x - dragOffsetX;
      dragSticker.y = pos.y - dragOffsetY;
      this.render();
    });

    this.canvas.addEventListener('mouseup', () => {
      if (dragSticker) {
        this.saveState();
        dragSticker = null;
      }
    });

    // Keyboard for selected sticker
    document.addEventListener('keydown', (e) => {
      if (!this.selectedSticker || this.currentTool !== 'stickers') return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        this.stickers = this.stickers.filter(s => s.id !== this.selectedSticker.id);
        this.selectedSticker = null;
        this.render();
        this.saveState();
      } else if (e.key === '+' || e.key === '=') {
        this.selectedSticker.size += 8;
        this.render();
      } else if (e.key === '-' || e.key === '_') {
        this.selectedSticker.size = Math.max(8, this.selectedSticker.size - 8);
        this.render();
      } else if (e.key === 'r' || e.key === 'R') {
        this.selectedSticker.rotation = (this.selectedSticker.rotation + 15) % 360;
        this.render();
      }
    });
  },

  // ==================== Draw Panel ====================
  _renderDrawPanel(el) {
    el.innerHTML = `
      <div class="tool-group">
        <div class="tool-group-title">BRUSH COLOR</div>
        <div class="color-palette" id="color-palette"></div>
        <input type="color" id="custom-color" value="#9d4edd" style="width:100%;height:32px;background:transparent;border:1px solid var(--c-border);border-radius:4px;cursor:pointer;">
      </div>
      <div class="tool-group">
        <div class="tool-group-title">BRUSH SIZE</div>
        <div class="adjust-row">
          <label>Size <span id="brush-size-val">5</span></label>
          <input type="range" id="brush-size" min="1" max="100" value="5">
        </div>
        <div class="adjust-row">
          <label>Opacity <span id="brush-opacity-val">100%</span></label>
          <input type="range" id="brush-opacity" min="5" max="100" value="100">
        </div>
      </div>
      <div class="tool-group">
        <button class="panel-btn" style="width:100%;margin-bottom:8px;" id="draw-eraser">TOGGLE ERASER</button>
        <button class="panel-btn panel-btn-danger" style="width:100%;" id="draw-clear">CLEAR DRAWING</button>
      </div>
    `;

    const palette = document.getElementById('color-palette');
    this.COLORS.forEach(c => {
      const sw = document.createElement('div');
      sw.className = 'color-swatch' + (c === this.drawColor ? ' selected' : '');
      sw.style.background = c;
      sw.addEventListener('click', () => {
        this.drawColor = c;
        this.eraserMode = false;
        palette.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('selected'));
        sw.classList.add('selected');
        document.getElementById('custom-color').value = c;
      });
      palette.appendChild(sw);
    });

    document.getElementById('custom-color').addEventListener('input', (e) => {
      this.drawColor = e.target.value;
      this.eraserMode = false;
      palette.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('selected'));
    });

    document.getElementById('brush-size').addEventListener('input', (e) => {
      this.drawSize = parseInt(e.target.value);
      document.getElementById('brush-size-val').textContent = this.drawSize;
    });

    document.getElementById('brush-opacity').addEventListener('input', (e) => {
      this.brushOpacity = parseInt(e.target.value) / 100;
      document.getElementById('brush-opacity-val').textContent = e.target.value + '%';
    });

    document.getElementById('draw-eraser').addEventListener('click', () => {
      this.eraserMode = !this.eraserMode;
      const btn = document.getElementById('draw-eraser');
      btn.textContent = this.eraserMode ? 'SWITCH TO BRUSH' : 'TOGGLE ERASER';
      btn.classList.toggle('panel-btn-primary', this.eraserMode);
    });

    document.getElementById('draw-clear').addEventListener('click', () => {
      this.drawCtx.clearRect(0, 0, this.drawCanvas.width, this.drawCanvas.height);
      this.render();
      this.saveState();
    });
  },

  _setupDrawEvents() {
    let lastX = 0, lastY = 0;

    const startDraw = (e) => {
      if (this.currentTool !== 'draw' || !this.originalImage) return;
      this.isDrawing = true;
      const pos = this._getCanvasPos(e);
      lastX = pos.x;
      lastY = pos.y;
    };

    const moveDraw = (e) => {
      if (!this.isDrawing) return;
      const pos = this._getCanvasPos(e);
      const ctx = this.drawCtx;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.lineWidth = this.drawSize * (this.drawCanvas.width / this.canvas.getBoundingClientRect().width);

      if (this.eraserMode) {
        ctx.globalCompositeOperation = 'destination-out';
        ctx.strokeStyle = 'rgba(0,0,0,1)';
      } else {
        ctx.globalCompositeOperation = 'source-over';
        const hex = this.drawColor;
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        ctx.strokeStyle = `rgba(${r},${g},${b},${this.brushOpacity || 1})`;
      }

      ctx.beginPath();
      ctx.moveTo(lastX, lastY);
      ctx.lineTo(pos.x, pos.y);
      ctx.stroke();

      lastX = pos.x;
      lastY = pos.y;
      this.render();
    };

    const endDraw = () => {
      if (this.isDrawing) {
        this.isDrawing = false;
        this.saveState();
      }
    };

    this.canvas.addEventListener('mousedown', startDraw);
    this.canvas.addEventListener('mousemove', moveDraw);
    this.canvas.addEventListener('mouseup', endDraw);
    this.canvas.addEventListener('mouseleave', endDraw);

    // Touch
    this.canvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
      const t = e.touches[0];
      startDraw({ clientX: t.clientX, clientY: t.clientY });
    });
    this.canvas.addEventListener('touchmove', (e) => {
      e.preventDefault();
      const t = e.touches[0];
      moveDraw({ clientX: t.clientX, clientY: t.clientY });
    });
    this.canvas.addEventListener('touchend', endDraw);
  },

  _getCanvasPos(e) {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY
    };
  },

  // Hook for magic wand clicks (registered on canvas)
  _setupWandClicks() {
    this.canvas.addEventListener('mousedown', (e) => {
      if (this.wandMode && this.currentTool === 'cutout') {
        const pos = this._getCanvasPos(e);
        this._magicWandAt(pos.x, pos.y);
      }
    });
  },

  // ==================== Crop Panel ====================
  _renderCropPanel(el) {
    el.innerHTML = `
      <div class="tool-group">
        <div class="tool-group-title">RESIZE IMAGE</div>
        <div class="adjust-row">
          <label>Width <span id="crop-w-val">${this.canvas.width}</span></label>
          <input type="range" id="crop-width" min="100" max="${this.canvas.width}" value="${this.canvas.width}">
        </div>
        <div class="adjust-row">
          <label>Height <span id="crop-h-val">${this.canvas.height}</span></label>
          <input type="range" id="crop-height" min="100" max="${this.canvas.height}" value="${this.canvas.height}">
        </div>
        <button class="panel-btn" style="width:100%;margin-top:8px;" id="crop-apply">APPLY RESIZE</button>
      </div>
      <div class="tool-group">
        <div class="tool-group-title">ASPECT RATIO CROP</div>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;">
          <button class="panel-btn small" data-ratio="1:1">1:1</button>
          <button class="panel-btn small" data-ratio="4:3">4:3</button>
          <button class="panel-btn small" data-ratio="3:4">3:4</button>
          <button class="panel-btn small" data-ratio="16:9">16:9</button>
          <button class="panel-btn small" data-ratio="9:16">9:16</button>
          <button class="panel-btn small" data-ratio="3:2">3:2</button>
        </div>
        <button class="panel-btn panel-btn-primary" style="width:100%;margin-top:8px;" id="crop-ratio-apply">CROP CENTER</button>
      </div>
    `;

    const wInput = document.getElementById('crop-width');
    const hInput = document.getElementById('crop-height');
    wInput.addEventListener('input', (e) => {
      document.getElementById('crop-w-val').textContent = e.target.value;
    });
    hInput.addEventListener('input', (e) => {
      document.getElementById('crop-h-val').textContent = e.target.value;
    });

    document.getElementById('crop-apply').addEventListener('click', () => {
      const nw = parseInt(wInput.value);
      const nh = parseInt(hInput.value);
      this._resizeImage(nw, nh);
    });

    let selectedRatio = null;
    el.querySelectorAll('button[data-ratio]').forEach(btn => {
      btn.addEventListener('click', () => {
        selectedRatio = btn.dataset.ratio;
        el.querySelectorAll('button[data-ratio]').forEach(b => b.classList.remove('panel-btn-primary'));
        btn.classList.add('panel-btn-primary');
      });
    });

    document.getElementById('crop-ratio-apply').addEventListener('click', () => {
      if (!selectedRatio) {
        App.toast('Select an aspect ratio first');
        return;
      }
      const [rw, rh] = selectedRatio.split(':').map(Number);
      this._cropCenter(rw, rh);
    });
  },

  _resizeImage(nw, nh) {
    const tmp = document.createElement('canvas');
    tmp.width = nw;
    tmp.height = nh;
    const tctx = tmp.getContext('2d');
    tctx.drawImage(this.workingCanvas, 0, 0, nw, nh);

    this.workingCanvas.width = nw;
    this.workingCanvas.height = nh;
    this.workingCtx.clearRect(0, 0, nw, nh);
    this.workingCtx.drawImage(tmp, 0, 0);

    // Scale drawing canvas
    const dt = document.createElement('canvas');
    dt.width = nw; dt.height = nh;
    dt.getContext('2d').drawImage(this.drawCanvas, 0, 0, nw, nh);
    this.drawCanvas.width = nw;
    this.drawCanvas.height = nh;
    this.drawCtx.clearRect(0, 0, nw, nh);
    this.drawCtx.drawImage(dt, 0, 0);

    this.canvas.width = nw;
    this.canvas.height = nh;

    // Scale stickers
    const sx = nw / (this.canvas._lastW || nw);
    const sy = nh / (this.canvas._lastH || nh);

    this.render();
    this.saveState();
    App.toast('Image resized');
  },

  _cropCenter(rw, rh) {
    const cw = this.workingCanvas.width;
    const ch = this.workingCanvas.height;
    const curRatio = cw / ch;
    const targetRatio = rw / rh;

    let nw, nh, sx, sy;
    if (curRatio > targetRatio) {
      nh = ch;
      nw = Math.round(ch * targetRatio);
      sx = Math.round((cw - nw) / 2);
      sy = 0;
    } else {
      nw = cw;
      nh = Math.round(cw / targetRatio);
      sx = 0;
      sy = Math.round((ch - nh) / 2);
    }

    const tmp = document.createElement('canvas');
    tmp.width = nw; tmp.height = nh;
    const tctx = tmp.getContext('2d');
    tctx.drawImage(this.workingCanvas, sx, sy, nw, nh, 0, 0, nw, nh);

    this.workingCanvas.width = nw;
    this.workingCanvas.height = nh;
    this.workingCtx.clearRect(0, 0, nw, nh);
    this.workingCtx.drawImage(tmp, 0, 0);

    // Crop drawing canvas too
    const dt = document.createElement('canvas');
    dt.width = nw; dt.height = nh;
    dt.getContext('2d').drawImage(this.drawCanvas, sx, sy, nw, nh, 0, 0, nw, nh);
    this.drawCanvas.width = nw;
    this.drawCanvas.height = nh;
    this.drawCtx.clearRect(0, 0, nw, nh);
    this.drawCtx.drawImage(dt, 0, 0);

    this.canvas.width = nw;
    this.canvas.height = nh;

    // Adjust sticker positions
    this.stickers.forEach(s => {
      s.x = Math.max(0, Math.min(nw, s.x - sx));
      s.y = Math.max(0, Math.min(nh, s.y - sy));
    });

    this.render();
    this.saveState();
    App.toast('Cropped to ' + rw + ':' + rh);
  },

  // ==================== Undo / Redo ====================
  saveState() {
    if (!this.originalImage) return;
    // Truncate redo stack
    this.history = this.history.slice(0, this.historyIdx + 1);

    const snap = {
      working: this.workingCtx.getImageData(0, 0, this.workingCanvas.width, this.workingCanvas.height),
      draw: this.drawCtx.getImageData(0, 0, this.drawCanvas.width, this.drawCanvas.height),
      adjustments: { ...this.adjustments },
      activeFilter: this.activeFilter,
      stickers: this.stickers.map(s => ({ ...s })),
      cw: this.workingCanvas.width,
      ch: this.workingCanvas.height
    };
    this.history.push(snap);
    if (this.history.length > this.maxHistory) this.history.shift();
    this.historyIdx = this.history.length - 1;
  },

  undo() {
    if (this.historyIdx <= 0) {
      App.toast('Nothing to undo');
      return;
    }
    this.historyIdx--;
    this._restoreState(this.history[this.historyIdx]);
    App.toast('Undo');
  },

  redo() {
    if (this.historyIdx >= this.history.length - 1) {
      App.toast('Nothing to redo');
      return;
    }
    this.historyIdx++;
    this._restoreState(this.history[this.historyIdx]);
    App.toast('Redo');
  },

  _restoreState(snap) {
    if (snap.cw !== this.workingCanvas.width || snap.ch !== this.workingCanvas.height) {
      this.workingCanvas.width = snap.cw;
      this.workingCanvas.height = snap.ch;
      this.drawCanvas.width = snap.cw;
      this.drawCanvas.height = snap.ch;
      this.canvas.width = snap.cw;
      this.canvas.height = snap.ch;
    }
    this.workingCtx.putImageData(snap.working, 0, 0);
    this.drawCtx.putImageData(snap.draw, 0, 0);
    this.adjustments = { ...snap.adjustments };
    this.activeFilter = snap.activeFilter;
    this.stickers = snap.stickers.map(s => ({ ...s }));
    this.render();
  },

  resetAll() {
    if (!this.originalImage) return;
    this.workingCtx.clearRect(0, 0, this.workingCanvas.width, this.workingCanvas.height);
    this.workingCtx.drawImage(this.originalImage, 0, 0, this.workingCanvas.width, this.workingCanvas.height);
    this.drawCtx.clearRect(0, 0, this.drawCanvas.width, this.drawCanvas.height);
    this.resetAdjustments();
    this.activeFilter = 'none';
    this.stickers = [];
    this.selectedSticker = null;
    this.render();
    this.saveState();
    App.toast('Reset to original');
  },

  // ==================== Download ====================
  showDownloadModal() {
    if (!this.originalImage) {
      App.toast('No image to download');
      return;
    }
    document.getElementById('download-modal').classList.add('show');
  },

  doDownload() {
    const format = document.getElementById('dl-format').value;
    const quality = parseFloat(document.getElementById('dl-quality').value);
    const scale = parseFloat(document.getElementById('dl-scale').value);

    const w = this.canvas.width * scale;
    const h = this.canvas.height * scale;
    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = w;
    exportCanvas.height = h;
    const ectx = exportCanvas.getContext('2d');

    // For JPEG, fill black background
    if (format === 'jpeg') {
      ectx.fillStyle = '#000000';
      ectx.fillRect(0, 0, w, h);
    }

    // Render final image to export canvas
    ectx.filter = this._buildFilterString();
    ectx.drawImage(this.workingCanvas, 0, 0, w, h);
    ectx.filter = 'none';

    // Temperature (simplified — just apply as color overlay)
    if (this.adjustments.temperature !== 0) {
      const t = this.adjustments.temperature / 100;
      const imgData = ectx.getImageData(0, 0, w, h);
      const d = imgData.data;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3] === 0) continue;
        if (t > 0) {
          d[i] = Math.min(255, d[i] + t * 30);
          d[i + 2] = Math.max(0, d[i + 2] - t * 30);
        } else {
          d[i] = Math.max(0, d[i] - Math.abs(t) * 30);
          d[i + 2] = Math.min(255, d[i + 2] + Math.abs(t) * 30);
        }
      }
      ectx.putImageData(imgData, 0, 0);
    }

    // Vignette
    if (this.adjustments.vignette > 0) {
      const v = this.adjustments.vignette / 100;
      const grd = ectx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.75);
      grd.addColorStop(0, 'rgba(0,0,0,0)');
      grd.addColorStop(1, `rgba(0,0,0,${v})`);
      ectx.fillStyle = grd;
      ectx.fillRect(0, 0, w, h);
    }

    // Draw layer
    ectx.drawImage(this.drawCanvas, 0, 0, w, h);

    // Stickers
    for (const s of this.stickers) {
      ectx.save();
      ectx.translate(s.x * scale, s.y * scale);
      ectx.rotate(s.rotation * Math.PI / 180);
      ectx.font = `${s.size * scale}px Inter, sans-serif`;
      ectx.textAlign = 'center';
      ectx.textBaseline = 'middle';
      if (s.isText) {
        ectx.fillStyle = s.color;
      }
      ectx.fillText(s.content, 0, 0);
      ectx.restore();
    }

    const mime = format === 'png' ? 'image/png' : format === 'jpeg' ? 'image/jpeg' : 'image/webp';
    const ext = format;
    const dataURL = exportCanvas.toDataURL(mime, quality);

    const a = document.createElement('a');
    a.href = dataURL;
    a.download = `cosplay-edit-${Date.now()}.${ext}`;
    a.click();

    document.getElementById('download-modal').classList.remove('show');
    App.toast('Image downloaded');
  }
};

// Initialize wand clicks after init
const _origInit = Editor.init.bind(Editor);
Editor.init = function () {
  _origInit();
  this._setupWandClicks();
};
