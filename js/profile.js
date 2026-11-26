// Spendly — Profile & Settings Controller

import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword
} from './firebase.js';
import { requireAuth } from './auth.js';
import { subscribeUserProfile, updateUserProfileName } from './store.js';
import {
  canInstallPwa,
  getTheme,
  handleLogout,
  initAppShell,
  onDomReady,
  promptInstallPwa,
  setTheme,
  showToast,
  updateShellUser
} from './ui.js';
import {
  CURRENCIES,
  getCurrencyPreference,
  setCurrencyPreference
} from './utils.js';

let currentUser = null;

function formatCreationDate(user, profile) {
  const rawDate = profile?.createdAt?.toDate
    ? profile.createdAt.toDate()
    : profile?.createdAt || user?.metadata?.creationTime;
  if (rawDate) {
    const parsed = new Date(rawDate);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      });
    }
  }
  return '—';
}

function renderProfileHeader(user, profile) {
  const name = profile?.name || user.displayName || user.email?.split('@')[0] || 'Spendly User';
  document.getElementById('profileAvatar').textContent = name.trim().slice(0, 2).toUpperCase();
  document.getElementById('profileDisplayName').textContent = name;
  document.getElementById('profileEmail').textContent = user.email || '';
  document.getElementById('profileCreatedAt').textContent = `Member since ${formatCreationDate(user, profile)}`;

  const nameInput = document.getElementById('profileNameInput');
  if (nameInput && document.activeElement !== nameInput) {
    nameInput.value = name;
  }
}

onDomReady(() => {
  initAppShell('profile', 'Profile & Settings');

  // Dark Mode toggle
  const darkToggle = document.getElementById('darkModeToggle');
  if (darkToggle) {
    darkToggle.checked = getTheme() === 'dark';
    darkToggle.addEventListener('change', () => {
      setTheme(darkToggle.checked ? 'dark' : 'light');
      showToast(`${darkToggle.checked ? 'Dark' : 'Light'} mode enabled`, 'info');
    });
    window.addEventListener('spendly:themechange', (e) => {
      darkToggle.checked = e.detail === 'dark';
    });
  }

  // Currency selector
  const currencySelect = document.getElementById('currencySelect');
  if (currencySelect) {
    currencySelect.innerHTML = Object.values(CURRENCIES)
      .map((c) => `<option value="${c.code}">${c.label}</option>`)
      .join('');
    currencySelect.value = getCurrencyPreference();
    currencySelect.addEventListener('change', () => {
      setCurrencyPreference(currencySelect.value);
      showToast(`Currency display updated to ${currencySelect.value}`, 'success');
    });
  }

  // PWA Install button
  const installRow = document.getElementById('pwaInstallRow');
  const installBtn = document.getElementById('installPwaBtn');
  if (canInstallPwa()) installRow?.classList.remove('hidden');
  window.addEventListener('spendly:installready', () => installRow?.classList.remove('hidden'));
  installBtn?.addEventListener('click', async () => {
    const accepted = await promptInstallPwa();
    if (accepted) {
      showToast('Spendly installed to your home screen!', 'success');
      installRow?.classList.add('hidden');
    }
  });

  // Update Name form
  const nameForm = document.getElementById('profileNameForm');
  const saveNameBtn = document.getElementById('saveNameBtn');
  nameForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!currentUser) return;
    const newName = document.getElementById('profileNameInput').value.trim();
    if (!newName) {
      showToast('Name cannot be empty.', 'error');
      return;
    }
    const orig = saveNameBtn.textContent;
    saveNameBtn.disabled = true;
    saveNameBtn.innerHTML = '<span class="spinner"></span> Saving...';
    try {
      await updateUserProfileName(currentUser.uid, newName);
      updateShellUser(currentUser, newName);
      showToast('Profile name updated!', 'success');
    } catch (err) {
      showToast(err.message || 'Could not update name', 'error');
    } finally {
      saveNameBtn.disabled = false;
      saveNameBtn.textContent = orig;
    }
  });

  // Change Password form
  const pwForm = document.getElementById('changePasswordForm');
  const changePwBtn = document.getElementById('changePasswordBtn');
  pwForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!currentUser) return;

    const currentPw = document.getElementById('currentPasswordInput').value;
    const newPw = document.getElementById('newPasswordInput').value;
    const confirmPw = document.getElementById('confirmNewPasswordInput').value;

    if (!currentPw || newPw.length < 6) {
      showToast('Enter your current password and a new password (min 6 chars).', 'error');
      return;
    }
    if (newPw !== confirmPw) {
      showToast('New passwords do not match.', 'error');
      return;
    }

    const orig = changePwBtn.textContent;
    changePwBtn.disabled = true;
    changePwBtn.innerHTML = '<span class="spinner"></span> Updating...';
    try {
      const credential = EmailAuthProvider.credential(currentUser.email, currentPw);
      await reauthenticateWithCredential(currentUser, credential);
      await updatePassword(currentUser, newPw);
      pwForm.reset();
      showToast('Password updated successfully!', 'success');
    } catch (err) {
      const msg =
        err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential'
          ? 'Current password is incorrect.'
          : err.message || 'Could not update password';
      showToast(msg, 'error');
    } finally {
      changePwBtn.disabled = false;
      changePwBtn.textContent = orig;
    }
  });

  // Logout
  document.getElementById('profileLogoutBtn')?.addEventListener('click', handleLogout);

  requireAuth(({ user, profile }) => {
    currentUser = user;
    renderProfileHeader(user, profile);

    const hasPasswordProvider = user.providerData?.some((p) => p.providerId === 'password');
    const pwCard = document.getElementById('passwordCard');
    const googlePwNote = document.getElementById('googlePasswordNotice');
    if (!hasPasswordProvider) {
      pwForm?.classList.add('hidden');
      googlePwNote?.classList.remove('hidden');
    } else if (pwCard) {
      pwForm?.classList.remove('hidden');
      googlePwNote?.classList.add('hidden');
    }

    subscribeUserProfile(user.uid, (prof) => {
      if (prof) {
        renderProfileHeader(user, prof);
        updateShellUser(user, prof.name);
      }
    });
  });
});
