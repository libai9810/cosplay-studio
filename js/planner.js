/* ================================================================
   Planner — Timeline Calendar + Detailed Plan Management
   ================================================================ */

const Planner = {
  plans: [],
  viewDate: new Date(),
  selectedDate: null,
  _drafts: {},  // { dateStr: { title, plan: { shootDate, location, ... } } }
  _isFormOpen: false,
  _formAbort: null,  // AbortController to clean up form event listeners

  async init() {
    // Restore drafts from localStorage
    try {
      this._drafts = JSON.parse(localStorage.getItem('planner_drafts') || '{}');
    } catch (e) { this._drafts = {}; }
    // Navigation
    document.getElementById('prev-month').addEventListener('click', () => {
      this.viewDate.setMonth(this.viewDate.getMonth() - 1);
      this.renderCalendar();
      this.renderTimeline();
    });
    document.getElementById('next-month').addEventListener('click', () => {
      this.viewDate.setMonth(this.viewDate.getMonth() + 1);
      this.renderCalendar();
      this.renderTimeline();
    });

    // Load plans
    this.plans = await DB.getAll(DB.STORES.plans);
    this.renderTimeline();
    this.renderCalendar();
    this.updateStats();
  },

  // ==================== Timeline Sidebar ====================
  renderTimeline() {
    const el = document.getElementById('planner-timeline');
    el.innerHTML = '';

    // Build a map of year-month -> plan count
    const planMap = {};
    for (const p of this.plans) {
      const d = new Date(p.date);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      if (!planMap[key]) planMap[key] = 0;
      planMap[key]++;
    }

    const curYear = this.viewDate.getFullYear();
    const curMonth = this.viewDate.getMonth();

    // Show current year ± a few years
    const years = [];
    const minY = Math.min(curYear - 1, ...this.plans.map(p => new Date(p.date).getFullYear()).filter(y => !isNaN(y)), curYear - 1);
    const maxY = Math.max(curYear + 1, ...this.plans.map(p => new Date(p.date).getFullYear()).filter(y => !isNaN(y)), curYear + 1);

    for (let y = maxY; y >= minY; y--) {
      years.push(y);
    }

    for (const year of years) {
      const yearDiv = document.createElement('div');
      yearDiv.className = 'timeline-year';
      yearDiv.innerHTML = `<div class="timeline-year-label">${year}</div>`;

      for (let m = 0; m < 12; m++) {
        const key = `${year}-${m}`;
        const count = planMap[key] || 0;
        const monthDiv = document.createElement('div');
        monthDiv.className = 'timeline-month' + (year === curYear && m === curMonth ? ' active' : '');
        monthDiv.innerHTML = `
          <span class="timeline-month-dot ${count > 0 ? 'has-plans' : 'no-plans'}"></span>
          <span>${['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'][m]}</span>
          ${count > 0 ? `<span class="timeline-month-count">${count}</span>` : ''}
        `;
        monthDiv.addEventListener('click', () => {
          this.viewDate = new Date(year, m, 1);
          this.renderCalendar();
          this.renderTimeline();
        });
        yearDiv.appendChild(monthDiv);
      }
      el.appendChild(yearDiv);
    }
  },

  // ==================== Calendar Grid ====================
  renderCalendar() {
    const grid = document.getElementById('calendar-grid');
    const label = document.getElementById('planner-month-label');
    const year = this.viewDate.getFullYear();
    const month = this.viewDate.getMonth();
    label.textContent = `${['JANUARY','FEBRUARY','MARCH','APRIL','MAY','JUNE','JULY','AUGUST','SEPTEMBER','OCTOBER','NOVEMBER','DECEMBER'][month]} ${year}`;

    grid.innerHTML = '';

    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const today = new Date();
    const isToday = (d) => d === today.getDate() && month === today.getMonth() && year === today.getFullYear();

    // Build plan lookup: dateStr -> plan
    const planLookup = {};
    for (const p of this.plans) {
      const d = new Date(p.date);
      if (d.getFullYear() === year && d.getMonth() === month) {
        planLookup[d.getDate()] = p;
      }
    }

    // Empty cells before first day
    for (let i = 0; i < firstDay; i++) {
      const cell = document.createElement('div');
      cell.className = 'cal-day empty';
      grid.appendChild(cell);
    }

    // Day cells
    for (let d = 1; d <= daysInMonth; d++) {
      const cell = document.createElement('div');
      const plan = planLookup[d];
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

      let classes = 'cal-day';
      if (isToday(d)) classes += ' today';
      if (plan) classes += ' has-plan';
      if (this.selectedDate === dateStr) classes += ' selected';
      cell.className = classes;

      let inner = `<div class="cal-day-num">${d}</div>`;
      if (plan) {
        inner += `<div class="cal-day-plan-tag">${this._escapeHtml(plan.title || 'Untitled')}</div>`;
        inner += `<div class="cal-day-status ${plan.completed ? 'completed' : 'pending'}"></div>`;
      }
      cell.innerHTML = inner;

      cell.addEventListener('click', () => {
        this.selectDate(dateStr);
      });
      grid.appendChild(cell);
    }

    this.updateStats();
  },

  // ==================== Draft Management ====================
  /**
   * Read current form field values and store as draft.
   * Called before switching dates or closing the form.
   */
  _saveDraft(dateStr) {
    if (!dateStr) return;
    const form = document.getElementById('planner-detail-content');
    const titleEl = form.querySelector('#pf-title');
    // Only save if the form is actually open
    if (!titleEl) return;

    const costumes = [];
    form.querySelectorAll('#costume-list .costume-block').forEach(block => {
      costumes.push({
        role: block.querySelector('.c-role')?.value?.trim() || '',
        name: block.querySelector('.c-name')?.value?.trim() || '',
        contact: block.querySelector('.c-contact')?.value?.trim() || '',
        deliveryDate: block.querySelector('.c-delivery')?.value || '',
        price: block.querySelector('.c-price')?.value || ''
      });
    });

    const draft = {
      title: titleEl.value?.trim() || '',
      plan: {
        shootDate: form.querySelector('#pf-shootdate')?.value || '',
        location: form.querySelector('#pf-location')?.value?.trim() || '',
        proposal: form.querySelector('#pf-proposal')?.value?.trim() || '',
        costumes,
        makeup: {
          contact: form.querySelector('#pf-makeup-contact')?.value?.trim() || '',
          location: form.querySelector('#pf-makeup-location')?.value?.trim() || '',
          price: form.querySelector('#pf-makeup-price')?.value || ''
        },
        studio: {
          name: form.querySelector('#pf-studio-name')?.value?.trim() || '',
          contact: form.querySelector('#pf-studio-contact')?.value?.trim() || '',
          location: form.querySelector('#pf-studio-location')?.value?.trim() || '',
          price: form.querySelector('#pf-studio-price')?.value || ''
        },
        photographer: {
          contact: form.querySelector('#pf-photo-contact')?.value?.trim() || '',
          price: form.querySelector('#pf-photo-price')?.value || ''
        },
        publishDate: form.querySelector('#pf-publishdate')?.value || '',
        bgm: form.querySelector('#pf-bgm')?.value?.trim() || '',
        caption: form.querySelector('#pf-caption')?.value?.trim() || '',
        otherCost: form.querySelector('#pf-othercost')?.value || ''
      }
    };
    this._drafts[dateStr] = draft;
    try { localStorage.setItem('planner_drafts', JSON.stringify(this._drafts)); } catch (e) {}
  },

  _clearDraft(dateStr) {
    delete this._drafts[dateStr];
    try { localStorage.setItem('planner_drafts', JSON.stringify(this._drafts)); } catch (e) {}
  },

  _persistDrafts() {
    try { localStorage.setItem('planner_drafts', JSON.stringify(this._drafts)); } catch (e) {}
  },

  // ==================== Select Date / Show Detail ====================
  selectDate(dateStr) {
    // Auto-save current form draft before switching
    if (this._isFormOpen && this.selectedDate) {
      this._saveDraft(this.selectedDate);
    }

    this.selectedDate = dateStr;
    this.renderCalendar();

    const plan = this.plans.find(p => {
      const d = new Date(p.date);
      const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      return ds === dateStr;
    });

    if (plan) {
      this._showPlanDetail(plan);
    } else {
      this._showPlanForm(dateStr, null);
    }
  },

  _showPlanDetail(plan) {
    // Clean up form listeners when switching to detail view
    if (this._formAbort) this._formAbort.abort();
    this._formAbort = null;
    this._isFormOpen = false;
    const el = document.getElementById('planner-detail-content');
    const empty = document.getElementById('planner-detail-empty');
    empty.style.display = 'none';
    el.style.display = 'block';

    const pl = plan.plan || {};

    // Calculate total price
    let total = 0;
    const priceItems = [];
    if (pl.costumes) {
      for (const c of pl.costumes) {
        if (c.price) { total += parseFloat(c.price) || 0; priceItems.push({ label: `${c.role || 'Costume'} · ${c.name || ''}`, price: c.price }); }
      }
    }
    if (pl.makeup && pl.makeup.price) { total += parseFloat(pl.makeup.price) || 0; priceItems.push({ label: 'Makeup Artist', price: pl.makeup.price }); }
    if (pl.studio && pl.studio.price) { total += parseFloat(pl.studio.price) || 0; priceItems.push({ label: 'Studio', price: pl.studio.price }); }
    if (pl.photographer && pl.photographer.price) { total += parseFloat(pl.photographer.price) || 0; priceItems.push({ label: 'Photographer', price: pl.photographer.price }); }
    if (pl.otherCost) { total += parseFloat(pl.otherCost) || 0; priceItems.push({ label: 'Other', price: pl.otherCost }); }

    const dateLabel = new Date(plan.date).toLocaleDateString('en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });

    let html = `
      <div class="detail-date-header">${dateLabel}</div>
      <span class="detail-status-badge ${plan.completed ? 'completed' : 'pending'}">${plan.completed ? 'COMPLETED' : 'PENDING'}</span>
    `;

    // Basic info
    html += `<div class="detail-section">
      <div class="detail-section-title">SHOOT INFO</div>
      ${this._detailField('Title', plan.title)}
      ${this._detailField('Shooting Date', pl.shootDate)}
      ${this._detailField('Location', pl.location)}
      ${this._detailField('Proposal / Brief', pl.proposal)}
    </div>`;

    // Costume / wig / prop / tailor team
    if (pl.costumes && pl.costumes.length > 0) {
      html += `<div class="detail-section">
        <div class="detail-section-title">COSTUME TEAM</div>`;
      for (const c of pl.costumes) {
        html += `<div style="margin-bottom:10px;padding-bottom:8px;border-bottom:1px solid var(--c-border);">
          ${this._detailField('Role', c.role)}
          ${this._detailField('Name', c.name)}
          ${this._detailField('Contact', c.contact)}
          ${this._detailField('Delivery Date', c.deliveryDate)}
          ${this._detailField('Price', c.price, 'price')}
        </div>`;
      }
      html += `</div>`;
    }

    // Makeup
    if (pl.makeup && (pl.makeup.contact || pl.makeup.location || pl.makeup.price)) {
      html += `<div class="detail-section">
        <div class="detail-section-title">MAKEUP ARTIST</div>
        ${this._detailField('Contact', pl.makeup.contact)}
        ${this._detailField('Location', pl.makeup.location)}
        ${this._detailField('Price', pl.makeup.price, 'price')}
      </div>`;
    }

    // Studio
    if (pl.studio && (pl.studio.name || pl.studio.contact || pl.studio.location || pl.studio.price)) {
      html += `<div class="detail-section">
        <div class="detail-section-title">STUDIO</div>
        ${this._detailField('Name', pl.studio.name)}
        ${this._detailField('Contact', pl.studio.contact)}
        ${this._detailField('Location', pl.studio.location)}
        ${this._detailField('Price', pl.studio.price, 'price')}
      </div>`;
    }

    // Photographer
    if (pl.photographer && (pl.photographer.contact || pl.photographer.price)) {
      html += `<div class="detail-section">
        <div class="detail-section-title">PHOTOGRAPHER</div>
        ${this._detailField('Contact', pl.photographer.contact)}
        ${this._detailField('Price', pl.photographer.price, 'price')}
      </div>`;
    }

    // Publish info
    if (pl.publishDate || pl.bgm || pl.caption) {
      html += `<div class="detail-section">
        <div class="detail-section-title">PUBLICATION</div>
        ${this._detailField('Publish Date', pl.publishDate)}
        ${this._detailField('BGM', pl.bgm)}
        ${this._detailField('Caption / Copy', pl.caption)}
      </div>`;
    }

    // Other cost
    if (pl.otherCost) {
      html += `<div class="detail-section">
        <div class="detail-section-title">OTHER COSTS</div>
        ${this._detailField('Amount', pl.otherCost, 'price')}
      </div>`;
    }

    // Price breakdown & total
    html += `<div class="detail-section detail-total">
      <div class="detail-section-title">COST BREAKDOWN</div>`;
    for (const item of priceItems) {
      html += `<div class="detail-field" style="flex-direction:row;justify-content:space-between;">
        <span class="detail-field-value" style="font-size:12px;color:var(--c-text-2);">${this._escapeHtml(item.label)}</span>
        <span class="detail-field-value price">¥${this._escapeHtml(item.price)}</span>
      </div>`;
    }
    html += `<div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--c-border);">
      <span class="detail-field-label">TOTAL ESTIMATED COST</span>
      <div class="detail-total-amount">¥${total.toFixed(2)}</div>
    </div>`;
    html += `</div>`;

    // Actions
    html += `<div class="detail-actions">
      <button class="panel-btn" id="plan-edit-btn">EDIT</button>
      <button class="panel-btn" id="plan-toggle-btn">${plan.completed ? 'MARK PENDING' : 'MARK DONE'}</button>
      <button class="panel-btn panel-btn-danger" id="plan-del-btn">DELETE</button>
    </div>`;

    el.innerHTML = html;

    document.getElementById('plan-edit-btn').addEventListener('click', () => {
      this._showPlanForm(this.selectedDate, plan);
    });
    document.getElementById('plan-toggle-btn').addEventListener('click', async () => {
      plan.completed = !plan.completed;
      await DB.put(DB.STORES.plans, plan);
      this.renderCalendar();
      this.renderTimeline();
      this._showPlanDetail(plan);
      this.updateStats();
      App.toast(plan.completed ? 'Marked as completed' : 'Marked as pending');
    });
    document.getElementById('plan-del-btn').addEventListener('click', async () => {
      await DB.del(DB.STORES.plans, plan.id);
      this._clearDraft(this.selectedDate);
      this.plans = this.plans.filter(p => p.id !== plan.id);
      this.renderCalendar();
      this.renderTimeline();
      this.updateStats();
      this._showEmpty();
      App.toast('Plan deleted');
    });
  },

  _detailField(label, value, cssClass = '') {
    if (!value) return '';
    return `<div class="detail-field">
      <span class="detail-field-label">${label}</span>
      <span class="detail-field-value ${cssClass}">${this._escapeHtml(String(value))}</span>
    </div>`;
  },

  // ==================== Plan Form ====================
  _showPlanForm(dateStr, existingPlan) {
    const el = document.getElementById('planner-detail-content');
    const empty = document.getElementById('planner-detail-empty');
    empty.style.display = 'none';
    el.style.display = 'block';
    // Abort previous form event listeners to prevent accumulation
    if (this._formAbort) this._formAbort.abort();
    this._formAbort = new AbortController();
    this._isFormOpen = true;

    // Merge priority:
    //   NEW plan: draft > empty
    //   EDIT plan: existingPlan (draft ignored — user expects to see current plan data when clicking EDIT)
    //   Rationale: drafts protect unsaved new-plan input across date switches,
    //   but when editing an existing plan the user expects to see the saved data.
    const p = existingPlan || this._drafts[dateStr] || {};
    const pl = p.plan || {};
    const costumes = pl.costumes || [];

    const dateLabel = new Date(dateStr).toLocaleDateString('en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });

    let costumeHtml = '';
    if (costumes.length === 0) costumes.push({ role: '', name: '', contact: '', deliveryDate: '', price: '' });
    costumes.forEach((c, i) => {
      costumeHtml += `<div class="costume-block" data-idx="${i}" style="margin-bottom:12px;padding:10px;background:var(--c-bg);border-radius:4px;border:1px solid var(--c-border);">
        <div class="plan-form-grid2" style="margin-bottom:6px;">
          <div class="plan-form-field"><label>Role (${i + 1})</label><input type="text" class="c-role" value="${this._escapeAttr(c.role)}" placeholder="Wig / Prop / Tailor"></div>
          <div class="plan-form-field"><label>Name</label><input type="text" class="c-name" value="${this._escapeAttr(c.name)}"></div>
        </div>
        <div class="plan-form-grid2" style="margin-bottom:6px;">
          <div class="plan-form-field"><label>Contact</label><input type="text" class="c-contact" value="${this._escapeAttr(c.contact)}"></div>
          <div class="plan-form-field"><label>Delivery Date</label><input type="date" class="c-delivery" value="${this._escapeAttr(c.deliveryDate)}"></div>
        </div>
        <div class="plan-form-field"><label>Price (¥)</label><input type="number" class="c-price" value="${this._escapeAttr(c.price)}" placeholder="0"></div>
        ${costumes.length > 1 ? `<button class="panel-btn panel-btn-danger small costume-remove" style="margin-top:4px;">REMOVE</button>` : ''}
      </div>`;
    });

    el.innerHTML = `
      <div class="detail-date-header">${existingPlan ? 'EDIT PLAN' : 'NEW PLAN'}</div>
      <div style="font-size:12px;color:var(--c-text-3);margin-bottom:16px;">${dateLabel}</div>

      <div class="plan-form-field">
        <label>Plan Title</label>
        <input type="text" id="pf-title" value="${this._escapeAttr(p.title)}" placeholder="e.g. Raiden Shogun Summer Shoot">
      </div>

      <div class="detail-section">
        <div class="detail-section-title">SHOOT INFO</div>
        <div class="plan-form-grid2">
          <div class="plan-form-field"><label>Shooting Date</label><input type="date" id="pf-shootdate" value="${this._escapeAttr(pl.shootDate)}"></div>
          <div class="plan-form-field"><label>Location</label><input type="text" id="pf-location" value="${this._escapeAttr(pl.location)}"></div>
        </div>
        <div class="plan-form-field"><label>Proposal / Brief</label><textarea id="pf-proposal" rows="3">${this._escapeHtml(pl.proposal)}</textarea></div>
      </div>

      <div class="detail-section">
        <div class="detail-section-title">COSTUME TEAM (Wig / Props / Tailor)</div>
        <div id="costume-list">${costumeHtml}</div>
        <button class="panel-btn small" id="add-costume-btn" style="width:100%;margin-top:6px;">+ ADD MEMBER</button>
      </div>

      <div class="detail-section">
        <div class="detail-section-title">MAKEUP ARTIST</div>
        <div class="plan-form-grid2">
          <div class="plan-form-field"><label>Contact</label><input type="text" id="pf-makeup-contact" value="${this._escapeAttr(pl.makeup?.contact)}"></div>
          <div class="plan-form-field"><label>Location</label><input type="text" id="pf-makeup-location" value="${this._escapeAttr(pl.makeup?.location)}"></div>
        </div>
        <div class="plan-form-field"><label>Price (¥)</label><input type="number" id="pf-makeup-price" value="${this._escapeAttr(pl.makeup?.price)}" placeholder="0"></div>
      </div>

      <div class="detail-section">
        <div class="detail-section-title">STUDIO</div>
        <div class="plan-form-field"><label>Name</label><input type="text" id="pf-studio-name" value="${this._escapeAttr(pl.studio?.name)}"></div>
        <div class="plan-form-grid2">
          <div class="plan-form-field"><label>Contact</label><input type="text" id="pf-studio-contact" value="${this._escapeAttr(pl.studio?.contact)}"></div>
          <div class="plan-form-field"><label>Location</label><input type="text" id="pf-studio-location" value="${this._escapeAttr(pl.studio?.location)}"></div>
        </div>
        <div class="plan-form-field"><label>Price (¥)</label><input type="number" id="pf-studio-price" value="${this._escapeAttr(pl.studio?.price)}" placeholder="0"></div>
      </div>

      <div class="detail-section">
        <div class="detail-section-title">PHOTOGRAPHER</div>
        <div class="plan-form-field"><label>Contact</label><input type="text" id="pf-photo-contact" value="${this._escapeAttr(pl.photographer?.contact)}"></div>
        <div class="plan-form-field"><label>Price (¥)</label><input type="number" id="pf-photo-price" value="${this._escapeAttr(pl.photographer?.price)}" placeholder="0"></div>
      </div>

      <div class="detail-section">
        <div class="detail-section-title">PUBLICATION</div>
        <div class="plan-form-field"><label>Publish Date</label><input type="date" id="pf-publishdate" value="${this._escapeAttr(pl.publishDate)}"></div>
        <div class="plan-form-field"><label>BGM</label><input type="text" id="pf-bgm" value="${this._escapeAttr(pl.bgm)}" placeholder="Song title / link"></div>
        <div class="plan-form-field"><label>Caption / Copy</label><textarea id="pf-caption" rows="3">${this._escapeHtml(pl.caption)}</textarea></div>
      </div>

      <div class="detail-section">
        <div class="detail-section-title">OTHER COSTS (¥)</div>
        <div class="plan-form-field"><label>Additional Budget</label><input type="number" id="pf-othercost" value="${this._escapeAttr(pl.otherCost)}" placeholder="0"></div>
      </div>

      <div class="detail-actions">
        <button class="panel-btn" id="pf-cancel">CANCEL</button>
        <button class="panel-btn panel-btn-primary" id="pf-save">${existingPlan ? 'UPDATE' : 'CREATE'}</button>
      </div>
    `;

    // Auto-save draft on every input change (real-time)
    el.addEventListener('input', () => {
      this._saveDraft(dateStr);
    }, { signal: this._formAbort.signal });

    // Add costume member
    document.getElementById('add-costume-btn').addEventListener('click', () => {
      const list = document.getElementById('costume-list');
      const idx = list.children.length;
      const block = document.createElement('div');
      block.className = 'costume-block';
      block.setAttribute('data-idx', idx);
      block.style.cssText = 'margin-bottom:12px;padding:10px;background:var(--c-bg);border-radius:4px;border:1px solid var(--c-border);';
      block.innerHTML = `
        <div class="plan-form-grid2" style="margin-bottom:6px;">
          <div class="plan-form-field"><label>Role (${idx + 1})</label><input type="text" class="c-role" placeholder="Wig / Prop / Tailor"></div>
          <div class="plan-form-field"><label>Name</label><input type="text" class="c-name"></div>
        </div>
        <div class="plan-form-grid2" style="margin-bottom:6px;">
          <div class="plan-form-field"><label>Contact</label><input type="text" class="c-contact"></div>
          <div class="plan-form-field"><label>Delivery Date</label><input type="date" class="c-delivery"></div>
        </div>
        <div class="plan-form-field"><label>Price (¥)</label><input type="number" class="c-price" placeholder="0"></div>
        <button class="panel-btn panel-btn-danger small costume-remove" style="margin-top:4px;">REMOVE</button>
      `;
      list.appendChild(block);
      this._bindCostumeRemove(list);
    });
    this._bindCostumeRemove(document.getElementById('costume-list'));

    // Cancel
    document.getElementById('pf-cancel').addEventListener('click', () => {
      // Save draft before leaving the form
      this._saveDraft(dateStr);
      this._isFormOpen = false;
      if (existingPlan) {
        this._showPlanDetail(existingPlan);
      } else {
        this._showEmpty();
      }
    });

    // Save
    document.getElementById('pf-save').addEventListener('click', async () => {
      await this._savePlan(dateStr, existingPlan);
    });
  },

  _bindCostumeRemove(list) {
    list.querySelectorAll('.costume-remove').forEach(btn => {
      btn.onclick = () => {
        btn.closest('.costume-block').remove();
      };
    });
  },

  async _savePlan(dateStr, existingPlan) {
    // Gather costume team
    const costumes = [];
    document.querySelectorAll('#costume-list .costume-block').forEach(block => {
      costumes.push({
        role: block.querySelector('.c-role').value.trim(),
        name: block.querySelector('.c-name').value.trim(),
        contact: block.querySelector('.c-contact').value.trim(),
        deliveryDate: block.querySelector('.c-delivery').value,
        price: block.querySelector('.c-price').value
      });
    });

    let total = 0;
    costumes.forEach(c => { if (c.price) total += parseFloat(c.price) || 0; });
    const mkPrice = document.getElementById('pf-makeup-price').value;
    const stPrice = document.getElementById('pf-studio-price').value;
    const phPrice = document.getElementById('pf-photo-price').value;
    const otherCost = document.getElementById('pf-othercost').value;
    if (mkPrice) total += parseFloat(mkPrice) || 0;
    if (stPrice) total += parseFloat(stPrice) || 0;
    if (phPrice) total += parseFloat(phPrice) || 0;
    if (otherCost) total += parseFloat(otherCost) || 0;

    const planData = {
      id: existingPlan ? existingPlan.id : DB.uid(),
      date: dateStr,
      title: document.getElementById('pf-title').value.trim(),
      completed: existingPlan ? existingPlan.completed : false,
      createdAt: existingPlan ? existingPlan.createdAt : Date.now(),
      totalCost: total,
      plan: {
        shootDate: document.getElementById('pf-shootdate').value,
        location: document.getElementById('pf-location').value.trim(),
        proposal: document.getElementById('pf-proposal').value.trim(),
        costumes: costumes,
        makeup: {
          contact: document.getElementById('pf-makeup-contact').value.trim(),
          location: document.getElementById('pf-makeup-location').value.trim(),
          price: mkPrice
        },
        studio: {
          name: document.getElementById('pf-studio-name').value.trim(),
          contact: document.getElementById('pf-studio-contact').value.trim(),
          location: document.getElementById('pf-studio-location').value.trim(),
          price: stPrice
        },
        photographer: {
          contact: document.getElementById('pf-photo-contact').value.trim(),
          price: phPrice
        },
        publishDate: document.getElementById('pf-publishdate').value,
        bgm: document.getElementById('pf-bgm').value.trim(),
        caption: document.getElementById('pf-caption').value.trim(),
        otherCost: otherCost
      }
    };

    await DB.put(DB.STORES.plans, planData);

    // Clear draft for this date (no longer needed)
    this._clearDraft(dateStr);
    if (this._formAbort) this._formAbort.abort();
    this._formAbort = null;
    this._isFormOpen = false;

    // Update local cache
    const idx = this.plans.findIndex(p => p.id === planData.id);
    if (idx >= 0) this.plans[idx] = planData;
    else this.plans.push(planData);

    this.renderCalendar();
    this.renderTimeline();
    this.updateStats();
    this._showPlanDetail(planData);
    App.toast(existingPlan ? 'Plan updated' : 'Plan created');
  },

  _showEmpty() {
    // Save draft if form was open
    if (this._isFormOpen && this.selectedDate) {
      this._saveDraft(this.selectedDate);
    }
    if (this._formAbort) this._formAbort.abort();
    this._formAbort = null;
    this._isFormOpen = false;
    document.getElementById('planner-detail-content').style.display = 'none';
    document.getElementById('planner-detail-empty').style.display = 'flex';
    this.selectedDate = null;
    this.renderCalendar();
  },

  // ==================== Stats ====================
  updateStats() {
    const total = this.plans.length;
    const done = this.plans.filter(p => p.completed).length;
    const pending = total - done;
    let cost = 0;
    for (const p of this.plans) {
      if (p.plan) {
        (p.plan.costumes || []).forEach(c => { cost += parseFloat(c.price) || 0; });
        if (p.plan.makeup) cost += parseFloat(p.plan.makeup.price) || 0;
        if (p.plan.studio) cost += parseFloat(p.plan.studio.price) || 0;
        if (p.plan.photographer) cost += parseFloat(p.plan.photographer.price) || 0;
        if (p.plan.otherCost) cost += parseFloat(p.plan.otherCost) || 0;
      }
    }

    document.getElementById('stat-total').textContent = total;
    document.getElementById('stat-done').textContent = done;
    document.getElementById('stat-pending').textContent = pending;
    document.getElementById('stat-cost').textContent = '¥' + cost.toFixed(0);
  },

  // ==================== Helpers ====================
  _escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  },
  _escapeAttr(str) {
    if (!str) return '';
    return String(str).replace(/"/g, '&quot;').replace(/</g, '&lt;');
  }
};
