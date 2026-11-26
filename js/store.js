// Spendly — PostgreSQL API Data Store (Authenticated with Firebase Auth ID Tokens)

import { auth, getAuthToken, updateProfile } from './firebase.js';
import { sortExpensesNewestFirst } from './utils.js';

const profileListeners = new Set();
const expenseListeners = new Set();

const CACHE_KEY_EXPENSES = 'spendly_cached_expenses';
const CACHE_KEY_PROFILE = 'spendly_cached_profile';

export function getCachedExpenses() {
  try {
    const raw = localStorage.getItem(CACHE_KEY_EXPENSES);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function setCachedExpenses(items) {
  try {
    localStorage.setItem(CACHE_KEY_EXPENSES, JSON.stringify(items || []));
  } catch {}
}

export function getCachedProfile() {
  try {
    const raw = localStorage.getItem(CACHE_KEY_PROFILE);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setCachedProfile(prof) {
  try {
    localStorage.setItem(CACHE_KEY_PROFILE, JSON.stringify(prof || null));
  } catch {}
}

const syncChannel = typeof BroadcastChannel !== 'undefined'
  ? new BroadcastChannel('spendly_pg_sync')
  : null;

async function apiRequest(path, options = {}) {
  const token = await getAuthToken();
  let res;
  try {
    res = await fetch(path, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...(options.headers || {})
      }
    });
  } catch {
    throw new Error('Cannot reach Spendly API server. Please check your connection and try again.');
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data;
}

async function notifyExpenseListeners(onError) {
  if (expenseListeners.size === 0) return;
  try {
    const items = await apiRequest('/api/expenses');
    const sorted = sortExpensesNewestFirst(items);
    setCachedExpenses(sorted);
    expenseListeners.forEach((cb) => cb(sorted));
  } catch (err) {
    if (onError) onError(err);
  }
}

async function notifyProfileListeners(onError) {
  if (profileListeners.size === 0) return;
  try {
    const profile = await apiRequest('/api/profile');
    setCachedProfile(profile);
    profileListeners.forEach((cb) => cb(profile));
  } catch (err) {
    if (onError) onError(err);
  }
}

if (syncChannel) {
  syncChannel.onmessage = (event) => {
    if (event.data === 'expenses') notifyExpenseListeners();
    if (event.data === 'profile') notifyProfileListeners();
  };
}

function broadcastChange(kind) {
  if (kind === 'expenses') notifyExpenseListeners();
  if (kind === 'profile') notifyProfileListeners();
  try {
    syncChannel?.postMessage(kind);
  } catch {
    // Ignore channel errors
  }
}

export async function ensureUserDocument(user, fallbackName) {
  if (!user) return null;
  try {
    const prof = await apiRequest('/api/users/sync', {
      method: 'POST',
      body: JSON.stringify({
        name: fallbackName || user.displayName || user.email?.split('@')[0] || 'Spendly User'
      })
    });
    setCachedProfile(prof);
    return prof;
  } catch (err) {
    return getCachedProfile();
  }
}

export function subscribeUserProfile(_uid, onData, onError) {
  profileListeners.add(onData);

  // 1. Immediately emit cached profile (0ms delay)
  const cached = getCachedProfile();
  if (cached) {
    onData(cached);
  }

  // 2. Fetch fresh profile in background
  apiRequest('/api/profile')
    .then((prof) => {
      setCachedProfile(prof);
      onData(prof);
    })
    .catch((err) => {
      if (!cached) onError?.(err);
    });

  return () => profileListeners.delete(onData);
}

export function subscribeExpenses(_uid, onData, onError) {
  expenseListeners.add(onData);

  // 1. Immediately emit cached expenses (0ms delay! No waiting, no empty screen!)
  const cached = getCachedExpenses();
  if (cached && cached.length > 0) {
    onData(cached);
  }

  // 2. Fetch fresh expenses in background
  apiRequest('/api/expenses')
    .then((items) => {
      const sorted = sortExpensesNewestFirst(items);
      setCachedExpenses(sorted);
      onData(sorted);
    })
    .catch((err) => {
      if (!cached || cached.length === 0) {
        onError?.(err);
      }
    });

  const onFocus = () => {
    if (document.visibilityState === 'visible') {
      notifyExpenseListeners(onError);
    }
  };
  window.addEventListener('focus', onFocus);
  document.addEventListener('visibilitychange', onFocus);

  return () => {
    expenseListeners.delete(onData);
    window.removeEventListener('focus', onFocus);
    document.removeEventListener('visibilitychange', onFocus);
  };
}

export async function getExpenseById(_uid, expenseId) {
  const cached = getCachedExpenses().find((e) => String(e.id) === String(expenseId));
  if (cached) return cached;
  return apiRequest(`/api/expenses/${encodeURIComponent(expenseId)}`);
}

export async function createExpense(_uid, payload) {
  const created = await apiRequest('/api/expenses', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
  // Immediately update local cache so every page sees it with 0ms delay!
  const current = getCachedExpenses();
  const updated = sortExpensesNewestFirst([created, ...current.filter((e) => String(e.id) !== String(created.id))]);
  setCachedExpenses(updated);
  broadcastChange('expenses');
  return created;
}

export async function updateExpense(_uid, expenseId, payload) {
  const updated = await apiRequest(`/api/expenses/${encodeURIComponent(expenseId)}`, {
    method: 'PUT',
    body: JSON.stringify(payload)
  });
  const current = getCachedExpenses();
  const updatedList = sortExpensesNewestFirst(
    current.map((e) => (String(e.id) === String(expenseId) ? updated : e))
  );
  setCachedExpenses(updatedList);
  broadcastChange('expenses');
  return updated;
}

export async function removeExpense(_uid, expenseId) {
  const res = await apiRequest(`/api/expenses/${encodeURIComponent(expenseId)}`, {
    method: 'DELETE'
  });
  const current = getCachedExpenses();
  const updatedList = current.filter((e) => String(e.id) !== String(expenseId));
  setCachedExpenses(updatedList);
  broadcastChange('expenses');
  return res;
}

export async function saveBudgets(_uid, budgets) {
  const saved = await apiRequest('/api/budgets', {
    method: 'PUT',
    body: JSON.stringify({
      daily: Math.max(0, Math.round((Number(budgets.daily) || 0) * 100) / 100),
      weekly: Math.max(0, Math.round((Number(budgets.weekly) || 0) * 100) / 100),
      monthly: Math.max(0, Math.round((Number(budgets.monthly) || 0) * 100) / 100)
    })
  });
  const cachedProf = getCachedProfile() || {};
  cachedProf.budgets = saved;
  setCachedProfile(cachedProf);
  broadcastChange('profile');
  return saved;
}

export async function updateUserProfileName(_uid, newName) {
  const trimmed = newName.trim();
  if (auth.currentUser) {
    await updateProfile(auth.currentUser, { displayName: trimmed });
  }
  const updated = await apiRequest('/api/profile', {
    method: 'PATCH',
    body: JSON.stringify({ name: trimmed })
  });
  const cachedProf = getCachedProfile() || {};
  cachedProf.name = trimmed;
  setCachedProfile(cachedProf);
  broadcastChange('profile');
  return updated;
}
