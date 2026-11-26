// Spendly — Authentication Guard, Login, Register, Forgot Password & Google Auth

import {
  auth,
  googleProvider,
  isFirebaseConfigured,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  sendPasswordResetEmail,
  updateProfile
} from './firebase.js';
import { ensureUserDocument, getCachedProfile, setCachedProfile } from './store.js';
import { initTheme, registerServiceWorker, showToast, updateShellUser } from './ui.js';

function mapAuthError(err) {
  const code = err?.code || '';
  switch (code) {
    case 'auth/invalid-email':
      return 'Please enter a valid email address.';
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'Incorrect email or password. Please try again.';
    case 'auth/email-already-in-use':
      return 'An account with this email already exists.';
    case 'auth/weak-password':
      return 'Password must be at least 6 characters long.';
    case 'auth/popup-closed-by-user':
      return 'Google sign-in was cancelled.';
    case 'auth/popup-blocked':
      return 'Pop-up was blocked by your browser. Redirecting to Google Sign-In...';
    case 'auth/unauthorized-domain':
      return 'This domain is not authorized in Firebase. Add it under Authentication -> Settings -> Authorized domains.';
    case 'auth/operation-not-allowed':
      return 'Google Sign-In is not enabled yet. Enable it in Firebase Console -> Authentication -> Sign-in method.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Please wait a moment and try again.';
    case 'auth/network-request-failed':
      return 'Network error. Please check your internet connection.';
    case 'auth/api-key-not-valid.-please-pass-a-valid-api-key.':
    case 'auth/invalid-api-key':
      return 'Firebase is not configured yet. Add your Firebase Web App credentials in js/firebase.js.';
    default:
      return err?.message || 'Authentication failed. Please try again.';
  }
}

export function requireAuth(onAuthenticated) {
  let authenticatedCalled = false;

  const triggerAuth = (user, profile) => {
    if (authenticatedCalled) return;
    authenticatedCalled = true;
    updateShellUser(user, profile?.name);
    onAuthenticated({ user, profile });
  };

  // If Firebase user is already known in memory, trigger instantly (0ms delay)
  if (auth.currentUser) {
    const cachedProfile = getCachedProfile();
    triggerAuth(auth.currentUser, cachedProfile);
  }

  return onAuthStateChanged(auth, async (user) => {
    if (!user) {
      try {
        localStorage.removeItem('spendly_cached_expenses');
        localStorage.removeItem('spendly_cached_profile');
      } catch { }
      window.location.replace('login.html');
      return;
    }

    const cachedProfile = getCachedProfile();
    triggerAuth(user, cachedProfile);

    // Sync in background without blocking the UI
    try {
      const profile = await ensureUserDocument(user);
      if (profile) {
        setCachedProfile(profile);
        updateShellUser(user, profile.name);
      }
    } catch {
      // background sync silently ignores or handles on next retry
    }
  });
}

function redirectIfAuthenticated() {
  onAuthStateChanged(auth, (user) => {
    if (user) {
      window.location.replace('dashboard.html');
    }
  });
}

function setupPasswordToggles() {
  document.querySelectorAll('[data-toggle-password]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const targetId = btn.getAttribute('data-toggle-password');
      const input = document.getElementById(targetId);
      if (!input) return;
      const isPassword = input.type === 'password';
      input.type = isPassword ? 'text' : 'password';
      btn.setAttribute('aria-label', isPassword ? 'Hide password' : 'Show password');
      btn.innerHTML = isPassword
        ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>'
        : '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>';
    });
  });
}

function setStatusAlert(container, message, type = 'danger') {
  if (!container) return;
  if (!message) {
    container.innerHTML = '';
    container.classList.add('hidden');
    return;
  }
  container.classList.remove('hidden');
  container.innerHTML = `<div class="alert alert-${type}">${message}</div>`;
}

function setButtonLoading(btn, loading, idleText) {
  if (!btn) return;
  btn.disabled = loading;
  btn.innerHTML = loading ? '<span class="spinner"></span> Please wait...' : idleText;
}

async function handleGoogleSignIn(statusEl, btn) {
  const original = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Connecting Google...';
  setStatusAlert(statusEl, '');
  try {
    // Call signInWithPopup immediately inside click handler to preserve user gesture
    const cred = await signInWithPopup(auth, googleProvider);
    await ensureUserDocument(cred.user);
    showToast('Signed in with Google!', 'success');
    window.location.replace('dashboard.html');
  } catch (err) {
    if (err?.code === 'auth/popup-blocked') {
      try {
        await signInWithRedirect(auth, googleProvider);
        return;
      } catch (redirectErr) {
        const msg = mapAuthError(redirectErr);
        setStatusAlert(statusEl, msg, 'danger');
        showToast(msg, 'error');
      }
    } else {
      const msg = mapAuthError(err);
      setStatusAlert(statusEl, msg, 'danger');
      showToast(msg, 'error');
    }
    btn.disabled = false;
    btn.innerHTML = original;
  }
}

async function handleGoogleRedirectResult(statusEl) {
  try {
    const cred = await getRedirectResult(auth);
    if (cred?.user) {
      await ensureUserDocument(cred.user);
      window.location.replace('dashboard.html');
    }
  } catch (err) {
    const msg = mapAuthError(err);
    setStatusAlert(statusEl, msg, 'danger');
    showToast(msg, 'error');
  }
}

function initAuthBackgroundAnimation() {
  if (!document.body.classList.contains('auth-page')) return;

  // 60fps canvas animation: flowing financial wave curves + rising ₹ particles
  let canvas = document.getElementById('authBgCanvas');
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.id = 'authBgCanvas';
    canvas.className = 'auth-bg-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    document.body.prepend(canvas);
  }

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  let width = 0;
  let height = 0;
  let dpr = 1;
  const pointer = { x: -9999, y: -9999, active: false };

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  resize();
  window.addEventListener('resize', resize);

  window.addEventListener('mousemove', (e) => {
    pointer.x = e.clientX;
    pointer.y = e.clientY;
    pointer.active = true;
  });

  const particles = Array.from({ length: 28 }, (_, i) => ({
    x: Math.random() * (window.innerWidth || 1280),
    y: Math.random() * (window.innerHeight || 720),
    r: 2.2 + Math.random() * 3.2,
    vy: 0.35 + Math.random() * 0.55,
    vx: (Math.random() - 0.5) * 0.35,
    phase: Math.random() * Math.PI * 2,
    isRupee: i % 3 === 0,
    isGold: i % 4 === 0,
    alpha: 0.28 + Math.random() * 0.42
  }));

  function drawWave(t, yBase, amp, freq, speed, color, fillAlpha) {
    ctx.beginPath();
    ctx.moveTo(0, height);
    for (let x = 0; x <= width + 24; x += 24) {
      const y =
        yBase +
        Math.sin(x * freq + t * speed) * amp +
        Math.cos(x * freq * 0.55 - t * speed * 0.7) * (amp * 0.45);
      ctx.lineTo(x, y);
    }
    ctx.lineTo(width, height);
    ctx.closePath();
    const grad = ctx.createLinearGradient(0, yBase - amp, 0, height);
    grad.addColorStop(0, fillAlpha);
    grad.addColorStop(1, 'transparent');
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.beginPath();
    for (let x = 0; x <= width + 16; x += 16) {
      const y =
        yBase +
        Math.sin(x * freq + t * speed) * amp +
        Math.cos(x * freq * 0.55 - t * speed * 0.7) * (amp * 0.45);
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.6;
    ctx.stroke();

    // Glowing tracer node gliding along the wave
    const nodeX = ((t * 95 * speed) % (width + 120)) - 60;
    const nodeY =
      yBase +
      Math.sin(nodeX * freq + t * speed) * amp +
      Math.cos(nodeX * freq * 0.55 - t * speed * 0.7) * (amp * 0.45);
    const nodeGlow = ctx.createRadialGradient(nodeX, nodeY, 0, nodeX, nodeY, 16);
    nodeGlow.addColorStop(0, color);
    nodeGlow.addColorStop(1, 'transparent');
    ctx.fillStyle = nodeGlow;
    ctx.beginPath();
    ctx.arc(nodeX, nodeY, 16, 0, Math.PI * 2);
    ctx.fill();
  }

  let rafId = 0;
  function frame(now) {
    const t = now * 0.001;
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';

    ctx.clearRect(0, 0, width, height);

    // Soft mouse spotlight in empty space
    if (pointer.active) {
      const spot = ctx.createRadialGradient(pointer.x, pointer.y, 0, pointer.x, pointer.y, 200);
      spot.addColorStop(0, isDark ? 'rgba(34, 197, 94, 0.14)' : 'rgba(22, 163, 74, 0.09)');
      spot.addColorStop(1, 'transparent');
      ctx.fillStyle = spot;
      ctx.fillRect(0, 0, width, height);
    }

    // Flowing emerald & gold financial wave curves
    drawWave(
      t,
      height * 0.76,
      28,
      0.0045,
      1.1,
      isDark ? 'rgba(52, 211, 153, 0.34)' : 'rgba(22, 163, 74, 0.24)',
      isDark ? 'rgba(34, 197, 94, 0.08)' : 'rgba(22, 163, 74, 0.06)'
    );
    drawWave(
      t,
      height * 0.83,
      22,
      0.0058,
      0.8,
      isDark ? 'rgba(251, 191, 36, 0.26)' : 'rgba(245, 158, 11, 0.2)',
      isDark ? 'rgba(251, 191, 36, 0.05)' : 'rgba(245, 158, 11, 0.04)'
    );

    // Rising glowing particles & subtle ₹ marks
    for (const p of particles) {
      p.y -= p.vy;
      p.x += p.vx + Math.sin(t * 1.4 + p.phase) * 0.25;

      if (p.y < -30) {
        p.y = height + 30;
        p.x = Math.random() * width;
      }
      if (p.x < -30) p.x = width + 30;
      if (p.x > width + 30) p.x = -30;

      const pulse = 0.72 + 0.28 * Math.sin(t * 2 + p.phase);
      const a = p.alpha * pulse;
      const rgb = p.isGold ? '251, 191, 36' : isDark ? '52, 211, 153' : '22, 163, 74';

      if (p.isRupee) {
        ctx.font = `700 ${Math.round(13 + p.r * 1.4)}px "Plus Jakarta Sans", sans-serif`;
        ctx.fillStyle = `rgba(${rgb}, ${a})`;
        ctx.fillText('₹', p.x, p.y);
      } else {
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 3.2);
        g.addColorStop(0, `rgba(${rgb}, ${a})`);
        g.addColorStop(1, 'transparent');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * 3.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    rafId = requestAnimationFrame(frame);
  }

  rafId = requestAnimationFrame(frame);
  window.addEventListener('beforeunload', () => cancelAnimationFrame(rafId));
}

function initAuthPages() {
  initTheme();
  registerServiceWorker();
  setupPasswordToggles();

  const authPage = document.body.dataset.authPage;
  if (!authPage) return;

  initAuthBackgroundAnimation();

  document.querySelectorAll('a[href="login.html"]').forEach((link) => {
    link.addEventListener('click', () => {
      try {
        sessionStorage.setItem('spendly_skip_login_splash', '1');
      } catch { }
    });
  });

  if (!isFirebaseConfigured()) {
    const banner = document.getElementById('firebaseConfigBanner');
    if (banner) banner.classList.remove('hidden');
  }

  redirectIfAuthenticated();

  const statusEl = document.getElementById('authStatus');
  handleGoogleRedirectResult(statusEl);

  // 1. Login Page
  if (authPage === 'login') {
    const form = document.getElementById('loginForm');
    const submitBtn = document.getElementById('loginSubmitBtn');
    const googleBtn = document.getElementById('googleSignInBtn');

    if (googleBtn) {
      googleBtn.addEventListener('click', () => handleGoogleSignIn(statusEl, googleBtn));
    }

    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('loginEmail').value.trim();
      const password = document.getElementById('loginPassword').value;
      const remember = document.getElementById('rememberMe').checked;

      if (!email || !password) {
        setStatusAlert(statusEl, 'Please enter both email and password.');
        return;
      }

      setStatusAlert(statusEl, '');
      setButtonLoading(submitBtn, true, 'Sign In');
      try {
        await setPersistence(auth, remember ? browserLocalPersistence : browserSessionPersistence);
        const cred = await signInWithEmailAndPassword(auth, email, password);
        await ensureUserDocument(cred.user);
        showToast('Welcome back to Spendly!', 'success');
        window.location.replace('dashboard.html');
      } catch (err) {
        const msg = mapAuthError(err);
        setStatusAlert(statusEl, msg, 'danger');
        showToast(msg, 'error');
        setButtonLoading(submitBtn, false, 'Sign In');
      }
    });
  }

  // 2. Register Page
  if (authPage === 'register') {
    const form = document.getElementById('registerForm');
    const submitBtn = document.getElementById('registerSubmitBtn');
    const googleBtn = document.getElementById('googleSignInBtn');

    if (googleBtn) {
      googleBtn.addEventListener('click', () => handleGoogleSignIn(statusEl, googleBtn));
    }

    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('regName').value.trim();
      const email = document.getElementById('regEmail').value.trim();
      const password = document.getElementById('regPassword').value;
      const confirm = document.getElementById('regConfirmPassword').value;

      if (!name) {
        setStatusAlert(statusEl, 'Please enter your full name.');
        return;
      }
      if (!email) {
        setStatusAlert(statusEl, 'Please enter a valid email address.');
        return;
      }
      if (password.length < 6) {
        setStatusAlert(statusEl, 'Password must be at least 6 characters.');
        return;
      }
      if (password !== confirm) {
        setStatusAlert(statusEl, 'Passwords do not match.');
        return;
      }

      setStatusAlert(statusEl, '');
      setButtonLoading(submitBtn, true, 'Create Account');
      try {
        await setPersistence(auth, browserLocalPersistence);
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        await updateProfile(cred.user, { displayName: name });
        await ensureUserDocument(cred.user, name);
        showToast('Account created successfully!', 'success');
        window.location.replace('dashboard.html');
      } catch (err) {
        const msg = mapAuthError(err);
        setStatusAlert(statusEl, msg, 'danger');
        showToast(msg, 'error');
        setButtonLoading(submitBtn, false, 'Create Account');
      }
    });
  }

  // 3. Forgot Password Page
  if (authPage === 'forgot') {
    const form = document.getElementById('forgotForm');
    const submitBtn = document.getElementById('forgotSubmitBtn');

    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('forgotEmail').value.trim();
      if (!email) {
        setStatusAlert(statusEl, 'Please enter your registered email address.');
        return;
      }
      setStatusAlert(statusEl, '');
      setButtonLoading(submitBtn, true, 'Send Reset Link');
      try {
        await sendPasswordResetEmail(auth, email);
        setStatusAlert(
          statusEl,
          'Password reset email sent! Check your inbox and spam folder.',
          'success'
        );
        showToast('Password reset link sent!', 'success');
        form.reset();
      } catch (err) {
        const msg = mapAuthError(err);
        setStatusAlert(statusEl, msg, 'danger');
        showToast(msg, 'error');
      } finally {
        setButtonLoading(submitBtn, false, 'Send Reset Link');
      }
    });
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initAuthPages);
} else {
  initAuthPages();
}
