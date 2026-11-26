// Spendly — UI Shell, Theme, Toasts, Confirm Dialog & Icon System

import { auth, signOut, isFirebaseConfigured } from './firebase.js';
import { escapeHtml, formatCurrency, formatDisplayDate, getCategoryMeta } from './utils.js';

const ICON_PATHS = {
  utensils: '<path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2v0a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"/>',
  car: '<path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><circle cx="17" cy="17" r="2"/>',
  bag: '<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/>',
  book: '<path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/>',
  film: '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M7 3v18"/><path d="M3 7.5h4"/><path d="M3 12h18"/><path d="M3 16.5h4"/><path d="M17 3v18"/><path d="M17 7.5h4"/><path d="M17 16.5h4"/>',
  phone: '<rect width="14" height="20" x="5" y="2" rx="2" ry="2"/><path d="M12 18h.01"/>',
  bolt: '<path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/>',
  heart: '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>',
  cart: '<circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/>',
  sparkles: '<path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/>',
  plane: '<path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/>',
  dots: '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>'
};

export function getCategoryIconSvg(iconName, size = 18) {
  const paths = ICON_PATHS[iconName] || ICON_PATHS.dots;
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
}

// ==========================================================================
// Theme Management
// ==========================================================================

export function getTheme() {
  return localStorage.getItem('spendly_theme') || 'light';
}

export function setTheme(theme) {
  const normalized = theme === 'dark' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', normalized);
  localStorage.setItem('spendly_theme', normalized);
  const metaTheme = document.querySelector('meta[name="theme-color"]');
  if (metaTheme) {
    metaTheme.setAttribute('content', normalized === 'dark' ? '#070E0A' : '#0C4228');
  }
  window.dispatchEvent(new CustomEvent('spendly:themechange', { detail: normalized }));
}

export function toggleTheme() {
  setTheme(getTheme() === 'dark' ? 'light' : 'dark');
}

export function initTheme() {
  setTheme(getTheme());
}

// ==========================================================================
// Toast Notifications
// ==========================================================================

function ensureToastContainer() {
  let container = document.getElementById('toastContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toastContainer';
    container.className = 'toast-container';
    container.setAttribute('aria-live', 'polite');
    document.body.appendChild(container);
  }
  return container;
}

const TOAST_ICONS = {
  success: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 6 9 17l-5-5"/></svg>',
  error: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/></svg>',
  warning: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>',
  info: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>'
};

export function showToast(message, type = 'info', duration = 3400) {
  const container = ensureToastContainer();
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <span class="toast-icon">${TOAST_ICONS[type] || TOAST_ICONS.info}</span>
    <span class="toast-message">${escapeHtml(message)}</span>
    <button type="button" class="toast-close" aria-label="Dismiss">&times;</button>
  `;
  const remove = () => {
    toast.classList.add('toast-leaving');
    setTimeout(() => toast.remove(), 200);
  };
  toast.querySelector('.toast-close').addEventListener('click', remove);
  container.appendChild(toast);
  if (duration > 0) setTimeout(remove, duration);
}

// ==========================================================================
// Confirmation Modal
// ==========================================================================

export function confirmDialog({ title = 'Confirm Action', message = 'Are you sure?', confirmText = 'Confirm', danger = true }) {
  return new Promise((resolve) => {
    let backdrop = document.getElementById('spendlyConfirmModal');
    if (!backdrop) {
      backdrop = document.createElement('div');
      backdrop.id = 'spendlyConfirmModal';
      backdrop.className = 'modal-backdrop';
      backdrop.innerHTML = `
        <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="confirmTitle">
          <div class="modal-icon" id="confirmIcon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
          </div>
          <h3 class="modal-title" id="confirmTitle"></h3>
          <p class="modal-body" id="confirmMessage"></p>
          <div class="modal-actions">
            <button type="button" class="btn btn-outline btn-sm" id="confirmCancelBtn">Cancel</button>
            <button type="button" class="btn btn-sm" id="confirmAcceptBtn"></button>
          </div>
        </div>
      `;
      document.body.appendChild(backdrop);
    }

    backdrop.querySelector('#confirmTitle').textContent = title;
    backdrop.querySelector('#confirmMessage').textContent = message;
    const acceptBtn = backdrop.querySelector('#confirmAcceptBtn');
    acceptBtn.textContent = confirmText;
    acceptBtn.className = `btn btn-sm ${danger ? 'btn-danger' : 'btn-primary'}`;
    backdrop.querySelector('#confirmIcon').style.display = danger ? 'flex' : 'none';
    backdrop.classList.add('is-open');

    const cleanup = (result) => {
      backdrop.classList.remove('is-open');
      acceptBtn.onclick = null;
      backdrop.querySelector('#confirmCancelBtn').onclick = null;
      backdrop.onclick = null;
      resolve(result);
    };

    acceptBtn.onclick = () => cleanup(true);
    backdrop.querySelector('#confirmCancelBtn').onclick = () => cleanup(false);
    backdrop.onclick = (e) => {
      if (e.target === backdrop) cleanup(false);
    };
  });
}

// ==========================================================================
// Animated Statistics
// ==========================================================================

export function animateValue(element, target, formatter = (v) => formatCurrency(v)) {
  if (!element) return;
  const start = Number(element.dataset.currentValue || 0);
  const end = Number(target) || 0;
  element.dataset.currentValue = String(end);

  if (Math.abs(end - start) < 0.01) {
    element.textContent = formatter(end);
    return;
  }

  const duration = 420;
  const startTime = performance.now();
  function tick(now) {
    const progress = Math.min((now - startTime) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    const current = start + (end - start) * eased;
    element.textContent = formatter(current);
    if (progress < 1) requestAnimationFrame(tick);
    else element.textContent = formatter(end);
  }
  requestAnimationFrame(tick);
}

// ==========================================================================
// Shared Transaction Item Renderer
// ==========================================================================

export function renderTransactionItem(expense, { showActions = false } = {}) {
  const meta = getCategoryMeta(expense.category);
  const actionsHtml = showActions
    ? `
      <div class="tx-actions">
        <a href="add-expense.html?id=${encodeURIComponent(expense.id)}" class="btn-icon btn-ghost" title="Edit expense" aria-label="Edit ${escapeHtml(expense.title)}">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
        </a>
        <button type="button" class="btn-icon btn-ghost delete-expense-btn" data-id="${escapeHtml(expense.id)}" data-title="${escapeHtml(expense.title)}" title="Delete expense" aria-label="Delete ${escapeHtml(expense.title)}">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color: var(--danger);"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
        </button>
      </div>
    `
    : '';

  return `
    <div class="tx-item" data-expense-id="${escapeHtml(expense.id)}">
      <div class="tx-cat-icon" style="background-color: ${meta.bg}; color: ${meta.color};">
        ${getCategoryIconSvg(meta.icon, 20)}
      </div>
      <div class="tx-info">
        <div class="tx-title">${escapeHtml(expense.title)}</div>
        <div class="tx-meta">
          <span>${escapeHtml(expense.category)}</span>
          <span>&bull;</span>
          <span>${formatDisplayDate(expense.date)}</span>
          ${expense.paymentMethod ? `<span>&bull;</span><span>${escapeHtml(expense.paymentMethod)}</span>` : ''}
        </div>
      </div>
      <div class="tx-right">
        <div class="tx-amount tabular-nums">${formatCurrency(expense.amount)}</div>
        ${actionsHtml}
      </div>
    </div>
  `;
}

// ==========================================================================
// App Shell Navigation & PWA Registration
// ==========================================================================

const NAV_ITEMS = [
  { key: 'dashboard', label: 'Dashboard', href: 'dashboard.html', icon: '<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>' },
  { key: 'add', label: 'Add Expense', href: 'add-expense.html', icon: '<circle cx="12" cy="12" r="10"/><path d="M8 12h8"/><path d="M12 8v8"/>' },
  { key: 'daily', label: 'Daily Report', href: 'daily-report.html', icon: '<rect width="18" height="18" x="3" y="4" rx="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/>' },
  { key: 'weekly', label: 'Weekly Report', href: 'weekly-report.html', icon: '<line x1="18" x2="18" y1="20" y2="10"/><line x1="12" x2="12" y1="20" y2="4"/><line x1="6" x2="6" y1="20" y2="14"/>' },
  { key: 'monthly', label: 'Monthly Report', href: 'monthly-report.html', icon: '<path d="M21.21 15.89A10 10 0 1 1 8 2.83"/><path d="M22 12A10 10 0 0 0 12 2v10z"/>' },
  { key: 'history', label: 'Expense History', href: 'history.html', icon: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/>' },
  { key: 'budget', label: 'Budgets', href: 'budget.html', icon: '<path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/>' },
  { key: 'profile', label: 'Profile & Settings', href: 'profile.html', icon: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>' }
];

function navSvg(path) {
  return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
}

let deferredInstallPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  window.dispatchEvent(new CustomEvent('spendly:installready'));
});

export function canInstallPwa() {
  return Boolean(deferredInstallPrompt);
}

export async function promptInstallPwa() {
  if (!deferredInstallPrompt) return false;
  deferredInstallPrompt.prompt();
  const { outcome } = await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  return outcome === 'accepted';
}

export function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./service-worker.js').catch(() => {});
  }
}

function getThemeIconSvg(theme) {
  if (theme === 'dark') {
    return '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>';
  }
  return '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>';
}

export function initAppShell(activeKey, pageTitle) {
  initTheme();
  registerServiceWorker();

  const sidebar = document.getElementById('appSidebar');
  if (sidebar) {
    sidebar.innerHTML = `
      <a href="dashboard.html" class="sidebar-brand">
        <span class="sidebar-brand-icon">
          <img src="./assets/images/logo-icon.png" alt="Spendly" style="width: 30px; height: 30px; object-fit: contain;">
        </span>
        <span class="sidebar-brand-text">
          <span class="sidebar-brand-name">Spendly</span>
          <span class="sidebar-brand-tag">Control Your Spending</span>
        </span>
      </a>
      <nav class="sidebar-nav" aria-label="Main navigation">
        ${NAV_ITEMS.slice(0, 2).map((item) => `
          <a href="${item.href}" class="nav-item ${activeKey === item.key ? 'active' : ''}">
            ${navSvg(item.icon)}
            <span>${item.label}</span>
          </a>
        `).join('')}
        <div class="sidebar-section-label">Analytics</div>
        ${NAV_ITEMS.slice(2, 5).map((item) => `
          <a href="${item.href}" class="nav-item ${activeKey === item.key ? 'active' : ''}">
            ${navSvg(item.icon)}
            <span>${item.label}</span>
          </a>
        `).join('')}
        <div class="sidebar-section-label">Manage</div>
        ${NAV_ITEMS.slice(5).map((item) => `
          <a href="${item.href}" class="nav-item ${activeKey === item.key ? 'active' : ''}">
            ${navSvg(item.icon)}
            <span>${item.label}</span>
          </a>
        `).join('')}
      </nav>
      <div class="sidebar-footer">
        <div class="sidebar-user">
          <div class="user-avatar" id="sidebarUserAvatar">S</div>
          <div class="sidebar-user-info">
            <div class="sidebar-user-name" id="sidebarUserName">Loading...</div>
            <div class="sidebar-user-email" id="sidebarUserEmail"></div>
          </div>
        </div>
        <div class="sidebar-footer-actions">
          <button type="button" class="sidebar-theme-btn" id="sidebarThemeToggleBtn" title="Toggle theme" aria-label="Toggle dark mode">
            ${getThemeIconSvg(getTheme())}
          </button>
          <button type="button" class="btn btn-outline btn-sm btn-logout" id="sidebarLogoutBtn">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/></svg>
            Logout
          </button>
        </div>
      </div>
    `;
    sidebar.querySelector('#sidebarLogoutBtn').addEventListener('click', handleLogout);
    const sidebarThemeBtn = sidebar.querySelector('#sidebarThemeToggleBtn');
    sidebarThemeBtn.addEventListener('click', toggleTheme);
    window.addEventListener('spendly:themechange', (e) => {
      sidebarThemeBtn.innerHTML = getThemeIconSvg(e.detail);
    });
  }

  const topbar = document.getElementById('appTopbar');
  if (topbar) {
    topbar.innerHTML = `
      <div class="mobile-topbar-left">
        <a href="dashboard.html" class="sidebar-brand-icon" style="width: 34px; height: 34px; border-radius: 10px;" aria-label="Spendly Home">
          <img src="./assets/images/logo-icon.png" alt="Spendly" style="width: 24px; height: 24px; object-fit: contain;">
        </a>
        <span class="mobile-topbar-title">${escapeHtml(pageTitle)}</span>
      </div>
      <div class="mobile-topbar-actions">
        <a href="budget.html" class="btn-icon btn-ghost" title="Budgets" aria-label="Budgets">
          ${navSvg(NAV_ITEMS[6].icon)}
        </a>
        <button type="button" class="btn-icon btn-ghost" id="mobileThemeToggleBtn" title="Toggle theme" aria-label="Toggle dark mode">
          ${getThemeIconSvg(getTheme())}
        </button>
      </div>
    `;
    const mobileThemeBtn = topbar.querySelector('#mobileThemeToggleBtn');
    mobileThemeBtn.addEventListener('click', toggleTheme);
    window.addEventListener('spendly:themechange', (e) => {
      mobileThemeBtn.innerHTML = getThemeIconSvg(e.detail);
    });
  }

  const bottomNav = document.getElementById('appBottomNav');
  if (bottomNav) {
    const isReport = ['daily', 'weekly', 'monthly', 'budget'].includes(activeKey);
    bottomNav.innerHTML = `
      <a href="dashboard.html" class="bottom-nav-item ${activeKey === 'dashboard' ? 'active' : ''}">
        ${navSvg(NAV_ITEMS[0].icon)}
        <span>Home</span>
      </a>
      <a href="add-expense.html" class="bottom-nav-add ${activeKey === 'add' ? 'active' : ''}" aria-label="Add Expense">
        <span class="bottom-nav-add-circle">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 5v14"/><path d="M5 12h14"/></svg>
        </span>
        <span>Add</span>
      </a>
      <a href="daily-report.html" class="bottom-nav-item ${isReport ? 'active' : ''}">
        ${navSvg(NAV_ITEMS[3].icon)}
        <span>Reports</span>
      </a>
      <a href="history.html" class="bottom-nav-item ${activeKey === 'history' ? 'active' : ''}">
        ${navSvg(NAV_ITEMS[5].icon)}
        <span>History</span>
      </a>
      <a href="profile.html" class="bottom-nav-item ${activeKey === 'profile' ? 'active' : ''}">
        ${navSvg(NAV_ITEMS[7].icon)}
        <span>Profile</span>
      </a>
    `;
  }

  if (!isFirebaseConfigured()) {
    const mainContent = document.querySelector('.main-content');
    if (mainContent && !document.getElementById('firebaseConfigBanner')) {
      const banner = document.createElement('div');
      banner.id = 'firebaseConfigBanner';
      banner.className = 'firebase-setup-banner';
      banner.innerHTML = `
        <div>
          <strong>Firebase Configuration Required:</strong> Add your Firebase Web App credentials in
          <code>js/firebase.js</code> to enable Authentication and Firestore sync.
        </div>
      `;
      mainContent.prepend(banner);
    }
  }
}

export function updateShellUser(user, profileName) {
  const displayName = profileName || user?.displayName || user?.email?.split('@')[0] || 'Spendly User';
  const initials = displayName.trim().slice(0, 2).toUpperCase();
  const avatarEl = document.getElementById('sidebarUserAvatar');
  const nameEl = document.getElementById('sidebarUserName');
  const emailEl = document.getElementById('sidebarUserEmail');
  if (avatarEl) avatarEl.textContent = initials;
  if (nameEl) nameEl.textContent = displayName;
  if (emailEl) emailEl.textContent = user?.email || '';
}

export function onDomReady(fn) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', fn);
  } else {
    fn();
  }
}

export async function handleLogout() {
  try {
    await signOut(auth);
    try {
      sessionStorage.setItem('spendly_skip_login_splash', '1');
    } catch {}
    window.location.replace('login.html');
  } catch (err) {
    showToast(err.message || 'Could not sign out', 'error');
  }
}
