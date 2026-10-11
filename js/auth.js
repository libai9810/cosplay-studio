/* ================================================================
   Auth — Owner Login & Permission System
   Owner credentials stored (hashed) in IndexedDB meta.
   Default:  username = admin, password = Libai#2026
   Visitors can browse Showcase / Gallery / Stories without login.
   ================================================================ */

const Auth = {
  // Simple hash (client-side gate, not real crypto security)
  _hash(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) {
      h = ((h << 5) - h) + str.charCodeAt(i);
      h |= 0;
    }
    return 'h' + Math.abs(h).toString(36);
  },

  isOwner: false,
  _storedUserHash: null,
  _storedPwHash: null,

  async init() {
    // Default credential hashes (hardcoded — Worker uses these for auth)
    const DEFAULT_USER_HASH = this._hash('admin');
    const DEFAULT_PW_HASH = this._hash('Libai#2026');

    // Try to retrieve changed credentials from cloud; fall back to defaults
    this._storedUserHash = (await DB.getMeta('ownerUser')) || DEFAULT_USER_HASH;
    this._storedPwHash = (await DB.getMeta('ownerPassword')) || DEFAULT_PW_HASH;

    // Check session
    const session = sessionStorage.getItem('cosplay_owner');
    const sessionToken = sessionStorage.getItem('cosplay_token');
    if (session === '1') {
      this.isOwner = true;
      // Restore cloud auth token for R2 write operations
      if (sessionToken && typeof DB !== 'undefined' && DB.restoreAuthToken) {
        DB.restoreAuthToken(sessionToken);
      }
      document.body.classList.add('is-owner');
      this._updateUI();
    } else {
      this._showVisitorBanner();
    }

    // Bind auth button
    const authBtn = document.getElementById('auth-btn');
    if (authBtn) {
      authBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (this.isOwner) {
          this._logout();
        } else {
          this._showLoginModal();
        }
      });
    }

    // Modal controls
    const cancelBtn = document.getElementById('auth-cancel');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => this._closeLoginModal());
    }
    const loginBtn = document.getElementById('auth-login');
    if (loginBtn) {
      loginBtn.addEventListener('click', () => this._doLogin());
    }
    const pwInput = document.getElementById('auth-password');
    if (pwInput) {
      pwInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') this._doLogin();
      });
    }
    const userInput = document.getElementById('auth-username');
    if (userInput) {
      userInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') document.getElementById('auth-password').focus();
      });
    }
    const modal = document.getElementById('auth-modal');
    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target.id === 'auth-modal') this._closeLoginModal();
      });
    }

    // Change password link
    this._initChangePassword();
  },

  _showLoginModal() {
    const modal = document.getElementById('auth-modal');
    if (!modal) return;
    modal.classList.add('show');
    setTimeout(() => {
      const userInput = document.getElementById('auth-username');
      if (userInput) userInput.focus();
    }, 100);
  },

  _closeLoginModal() {
    const modal = document.getElementById('auth-modal');
    if (modal) modal.classList.remove('show');
    const errEl = document.getElementById('auth-error');
    if (errEl) errEl.style.display = 'none';
    const pwInput = document.getElementById('auth-password');
    if (pwInput) pwInput.value = '';
    const userInput = document.getElementById('auth-username');
    if (userInput) userInput.value = '';
  },

  _doLogin() {
    const userInput = document.getElementById('auth-username');
    const pwInput = document.getElementById('auth-password');
    if (!userInput || !pwInput) return;

    const user = userInput.value.trim();
    const pw = pwInput.value;
    const userHash = this._hash(user);
    const pwHash = this._hash(pw);

    if (userHash === this._storedUserHash && pwHash === this._storedPwHash) {
      // Set cloud auth token for R2 write operations.
      // Always uses default credentials — the Worker validates against these.
      if (typeof DB !== 'undefined' && DB.setAuthToken) {
        const token = DB.setAuthToken('admin', 'Libai#2026');
        sessionStorage.setItem('cosplay_token', token);
      }
      this.isOwner = true;
      sessionStorage.setItem('cosplay_owner', '1');
      document.body.classList.add('is-owner');
      this._closeLoginModal();
      this._updateUI();
      this._hideVisitorBanner();
      App.toast('Welcome back, owner');
      App._applyPermissions();
    } else {
      const errEl = document.getElementById('auth-error');
      if (errEl) errEl.style.display = 'block';
      pwInput.value = '';
      pwInput.focus();
    }
  },

  _logout() {
    this.isOwner = false;
    sessionStorage.removeItem('cosplay_owner');
    sessionStorage.removeItem('cosplay_token');
    // Clear cloud auth token so visitor session has no write access
    if (typeof DB !== 'undefined' && DB.clearAuthToken) {
      DB.clearAuthToken();
    }
    document.body.classList.remove('is-owner');
    this._updateUI();
    this._showVisitorBanner();
    App._applyPermissions();
    App.navigate('showcase');
    App.toast('Logged out');
  },

  _updateUI() {
    const btn = document.getElementById('auth-btn');
    const label = document.getElementById('auth-label');
    if (!btn || !label) return;
    if (this.isOwner) {
      btn.classList.add('is-owner');
      label.textContent = 'LOGOUT';
    } else {
      btn.classList.remove('is-owner');
      label.textContent = 'LOGIN';
    }
  },

  _showVisitorBanner() {
    let banner = document.querySelector('.visitor-banner');
    if (!banner) {
      banner = document.createElement('div');
      banner.className = 'visitor-banner';
      banner.innerHTML = '<span class="visitor-banner-dot"></span> VISITOR MODE · READ ONLY';
      document.body.appendChild(banner);
    }
    banner.classList.add('show');
  },

  _hideVisitorBanner() {
    const banner = document.querySelector('.visitor-banner');
    if (banner) banner.classList.remove('show');
  },

  _initChangePassword() {
    // Click logo 5 times to trigger credential change (owner only)
    let pressCount = 0;
    let pressTimer = null;
    const logo = document.querySelector('.nav-logo');
    if (!logo) return;
    logo.addEventListener('click', () => {
      if (!this.isOwner) return;
      pressCount++;
      clearTimeout(pressTimer);
      pressTimer = setTimeout(() => { pressCount = 0; }, 2000);
      if (pressCount >= 5) {
        pressCount = 0;
        this._showChangePasswordModal();
      }
    });
  },

  _showChangePasswordModal() {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay show';
    overlay.innerHTML = `
      <div class="modal-box" style="width:380px;">
        <div class="modal-header">CHANGE CREDENTIALS</div>
        <div class="modal-body" style="padding:24px;">
          <div style="margin-bottom:12px;">
            <label style="font-size:11px;color:var(--c-text-3);text-transform:uppercase;letter-spacing:1px;">Username</label>
            <input type="text" id="cred-user" style="margin-top:6px;" placeholder="New username">
          </div>
          <div style="margin-bottom:12px;">
            <label style="font-size:11px;color:var(--c-text-3);text-transform:uppercase;letter-spacing:1px;">New Password</label>
            <input type="password" id="cred-pw" style="margin-top:6px;" placeholder="New password">
          </div>
          <div>
            <label style="font-size:11px;color:var(--c-text-3);text-transform:uppercase;letter-spacing:1px;">Confirm</label>
            <input type="password" id="cred-confirm" style="margin-top:6px;" placeholder="Confirm password">
          </div>
          <p id="cred-error" style="color:var(--c-danger);font-size:12px;margin-top:8px;display:none;"></p>
        </div>
        <div class="modal-footer">
          <button class="panel-btn" id="cred-cancel">CANCEL</button>
          <button class="panel-btn panel-btn-primary" id="cred-save">SAVE</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    overlay.querySelector('#cred-cancel').addEventListener('click', () => overlay.remove());
    overlay.querySelector('#cred-save').addEventListener('click', async () => {
      const user = overlay.querySelector('#cred-user').value.trim();
      const pw = overlay.querySelector('#cred-pw').value;
      const cf = overlay.querySelector('#cred-confirm').value;
      const err = overlay.querySelector('#cred-error');
      if (!user) { err.textContent = 'Username cannot be empty'; err.style.display = 'block'; return; }
      if (!pw) { err.textContent = 'Password cannot be empty'; err.style.display = 'block'; return; }
      if (pw !== cf) { err.textContent = 'Passwords do not match'; err.style.display = 'block'; return; }
      const userHash = this._hash(user);
      const pwHash = this._hash(pw);
      await DB.setMeta('ownerUser', userHash);
      await DB.setMeta('ownerPassword', pwHash);
      this._storedUserHash = userHash;
      this._storedPwHash = pwHash;
      overlay.remove();
      App.toast('Credentials changed');
    });
  }
};
