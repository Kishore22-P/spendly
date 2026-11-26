// Spendly — Budget Management Controller

import { requireAuth } from './auth.js';
import {
  getCachedExpenses,
  getCachedProfile,
  saveBudgets,
  subscribeExpenses,
  subscribeUserProfile
} from './store.js';
import { initAppShell, onDomReady, showToast } from './ui.js';
import {
  calculateBudgetMetrics,
  calculateDailySummary,
  calculateMonthlySummary,
  calculateWeeklySummary,
  formatCurrency,
  toLocalDateStr
} from './utils.js';

let currentUser = null;
let allExpenses = [];
let currentBudgets = { daily: 0, weekly: 0, monthly: 0 };

function renderBudgetCard(prefix, label, metrics) {
  const badgeEl = document.getElementById(`${prefix}StatusBadge`);
  const totalEl = document.getElementById(`${prefix}BudgetTotal`);
  const spentEl = document.getElementById(`${prefix}BudgetSpent`);
  const remEl = document.getElementById(`${prefix}BudgetRemaining`);
  const barEl = document.getElementById(`${prefix}ProgressBar`);
  const pctEl = document.getElementById(`${prefix}PercentText`);
  const alertEl = document.getElementById(`${prefix}AlertBox`);

  if (totalEl) totalEl.textContent = metrics.budget > 0 ? formatCurrency(metrics.budget) : 'Not set';
  if (spentEl) spentEl.textContent = formatCurrency(metrics.spent);
  if (remEl) {
    remEl.textContent = metrics.budget > 0
      ? (metrics.remaining >= 0 ? formatCurrency(metrics.remaining) : `-${formatCurrency(Math.abs(metrics.remaining))}`)
      : '—';
  }
  if (pctEl) {
    pctEl.textContent = metrics.budget > 0 ? `${metrics.percent}% used` : 'Set a budget below';
  }

  if (barEl) {
    const width = metrics.budget > 0 ? Math.min(metrics.percent, 100) : 0;
    barEl.style.width = `${width}%`;
    barEl.classList.remove('is-warning', 'is-danger');
    if (metrics.status === 'warning') barEl.classList.add('is-warning');
    if (metrics.status === 'exceeded') barEl.classList.add('is-danger');
  }

  if (badgeEl) {
    if (metrics.status === 'unset') {
      badgeEl.className = 'badge badge-neutral';
      badgeEl.textContent = 'Not Set';
    } else if (metrics.status === 'exceeded') {
      badgeEl.className = 'badge badge-danger';
      badgeEl.textContent = 'Exceeded';
    } else if (metrics.status === 'warning') {
      badgeEl.className = 'badge badge-warning';
      badgeEl.textContent = 'Near Limit (80%+)';
    } else {
      badgeEl.className = 'badge badge-success';
      badgeEl.textContent = 'On Track';
    }
  }

  if (alertEl) {
    if (metrics.status === 'exceeded') {
      alertEl.className = 'alert alert-danger';
      alertEl.innerHTML = `<strong>Budget Exceeded:</strong> You have exceeded your ${label.toLowerCase()} budget by ${formatCurrency(Math.abs(metrics.remaining))}.`;
      alertEl.classList.remove('hidden');
    } else if (metrics.status === 'warning') {
      alertEl.className = 'alert alert-warning';
      alertEl.innerHTML = `<strong>Warning:</strong> You have used ${metrics.percent}% of your ${label.toLowerCase()} budget.`;
      alertEl.classList.remove('hidden');
    } else {
      alertEl.classList.add('hidden');
      alertEl.innerHTML = '';
    }
  }
}

function renderBudgets() {
  const now = new Date();
  const dailySpent = calculateDailySummary(allExpenses, toLocalDateStr(now)).total;
  const weeklySpent = calculateWeeklySummary(allExpenses, now).total;
  const monthlySpent = calculateMonthlySummary(allExpenses, now.getFullYear(), now.getMonth()).total;

  renderBudgetCard('daily', 'Daily', calculateBudgetMetrics(dailySpent, currentBudgets.daily));
  renderBudgetCard('weekly', 'Weekly', calculateBudgetMetrics(weeklySpent, currentBudgets.weekly));
  renderBudgetCard('monthly', 'Monthly', calculateBudgetMetrics(monthlySpent, currentBudgets.monthly));
}

function syncBudgetInputs() {
  const dInput = document.getElementById('dailyBudgetInput');
  const wInput = document.getElementById('weeklyBudgetInput');
  const mInput = document.getElementById('monthlyBudgetInput');
  if (dInput) dInput.value = currentBudgets.daily > 0 ? currentBudgets.daily : '';
  if (wInput) wInput.value = currentBudgets.weekly > 0 ? currentBudgets.weekly : '';
  if (mInput) mInput.value = currentBudgets.monthly > 0 ? currentBudgets.monthly : '';
}

onDomReady(() => {
  initAppShell('budget', 'Budget Management');

  const form = document.getElementById('budgetForm');
  const saveBtn = document.getElementById('saveBudgetsBtn');

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!currentUser) return;

    const daily = Number(document.getElementById('dailyBudgetInput').value) || 0;
    const weekly = Number(document.getElementById('weeklyBudgetInput').value) || 0;
    const monthly = Number(document.getElementById('monthlyBudgetInput').value) || 0;

    if (daily < 0 || weekly < 0 || monthly < 0) {
      showToast('Budgets cannot be negative.', 'error');
      return;
    }

    const orig = saveBtn.textContent;
    saveBtn.disabled = true;
    saveBtn.innerHTML = '<span class="spinner"></span> Saving...';

    try {
      await saveBudgets(currentUser.uid, { daily, weekly, monthly });
      showToast('Budgets saved successfully!', 'success');
    } catch (err) {
      showToast(err.message || 'Could not save budgets', 'error');
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = orig;
    }
  });

  // Immediately load cached values so budgets are never blank
  const initProf = getCachedProfile();
  if (initProf?.budgets) {
    currentBudgets = {
      daily: Number(initProf.budgets.daily) || 0,
      weekly: Number(initProf.budgets.weekly) || 0,
      monthly: Number(initProf.budgets.monthly) || 0
    };
    syncBudgetInputs();
  }
  allExpenses = getCachedExpenses();
  renderBudgets();

  requireAuth(({ user, profile }) => {
    currentUser = user;
    if (profile?.budgets) {
      currentBudgets = {
        daily: Number(profile.budgets.daily) || 0,
        weekly: Number(profile.budgets.weekly) || 0,
        monthly: Number(profile.budgets.monthly) || 0
      };
      syncBudgetInputs();
    }
    renderBudgets();

    subscribeUserProfile(user.uid, (prof) => {
      if (prof?.budgets) {
        currentBudgets = {
          daily: Number(prof.budgets.daily) || 0,
          weekly: Number(prof.budgets.weekly) || 0,
          monthly: Number(prof.budgets.monthly) || 0
        };
        syncBudgetInputs();
        renderBudgets();
      }
    });

    subscribeExpenses(
      user.uid,
      (expenses) => {
        allExpenses = expenses;
        renderBudgets();
      },
      (err) => showToast(err.message || 'Failed to sync expenses', 'error')
    );
  });
});
