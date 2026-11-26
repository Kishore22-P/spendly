// Spendly — Dashboard Real-Time Controller & Chart.js Overview

import { requireAuth } from './auth.js';
import {
  getCachedExpenses,
  getCachedProfile,
  subscribeExpenses,
  subscribeUserProfile
} from './store.js';
import {
  animateValue,
  initAppShell,
  onDomReady,
  renderTransactionItem,
  showToast,
  updateShellUser
} from './ui.js';
import {
  calculateBudgetMetrics,
  calculateDailySummary,
  calculateMonthlySummary,
  calculateWeeklySummary,
  formatCurrency,
  formatFullDate,
  getGreeting,
  getMondayOfWeek,
  groupByCategory,
  sumExpenses,
  toLocalDateStr
} from './utils.js';

let allExpenses = [];
let userProfile = null;
let currentPeriod = 'daily';
let overviewChart = null;
let categoryChart = null;

function getChartColors(canvas) {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  let barFill = isDark ? '#34D399' : '#16A34A';
  if (canvas) {
    const ctx = canvas.getContext('2d');
    const grad = ctx.createLinearGradient(0, 0, 0, canvas.height || 280);
    if (isDark) {
      grad.addColorStop(0, '#4ADE80');
      grad.addColorStop(1, 'rgba(22, 163, 74, 0.35)');
    } else {
      grad.addColorStop(0, '#16A34A');
      grad.addColorStop(1, '#0C4228');
    }
    barFill = grad;
  }
  return {
    text: isDark ? '#A3BBB0' : '#4C6458',
    grid: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(12,66,40,0.07)',
    tooltipBg: isDark ? '#15281E' : '#0C2117',
    bar: barFill,
    barHover: isDark ? '#4ADE80' : '#22C55E'
  };
}

function buildPeriodSeries(period) {
  const now = new Date();

  if (period === 'daily') {
    // Last 7 days ending today
    const labels = [];
    const values = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      const dStr = toLocalDateStr(d);
      const dayItems = allExpenses.filter((e) => e.date === dStr);
      labels.push(d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric' }));
      values.push(sumExpenses(dayItems));
    }
    return { labels, values, label: 'Daily Spending' };
  }

  if (period === 'weekly') {
    // Last 6 weeks (Monday to Sunday)
    const labels = [];
    const values = [];
    const currentMon = getMondayOfWeek(now);
    for (let i = 5; i >= 0; i--) {
      const mon = new Date(currentMon.getFullYear(), currentMon.getMonth(), currentMon.getDate() - i * 7);
      const summary = calculateWeeklySummary(allExpenses, mon);
      labels.push(mon.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }));
      values.push(summary.total);
    }
    return { labels, values, label: 'Weekly Spending' };
  }

  // Monthly: last 6 months
  const labels = [];
  const values = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const summary = calculateMonthlySummary(allExpenses, d.getFullYear(), d.getMonth());
    labels.push(d.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' }));
    values.push(summary.total);
  }
  return { labels, values, label: 'Monthly Spending' };
}

function renderOverviewChart() {
  const canvas = document.getElementById('spendingOverviewChart');
  const emptyEl = document.getElementById('overviewChartEmpty');
  if (!canvas || !window.Chart) return;

  const series = buildPeriodSeries(currentPeriod);
  const hasAnyData = series.values.some((v) => v > 0);
  if (emptyEl) emptyEl.classList.toggle('hidden', hasAnyData);
  canvas.classList.toggle('hidden', !hasAnyData);

  if (overviewChart) {
    overviewChart.destroy();
    overviewChart = null;
  }
  if (!hasAnyData) return;

  const colors = getChartColors(canvas);
  overviewChart = new window.Chart(canvas, {
    type: 'bar',
    data: {
      labels: series.labels,
      datasets: [
        {
          label: series.label,
          data: series.values,
          backgroundColor: colors.bar,
          hoverBackgroundColor: colors.barHover,
          borderRadius: 10,
          borderSkipped: false,
          maxBarThickness: 38
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 450 },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: colors.tooltipBg,
          padding: 10,
          cornerRadius: 10,
          displayColors: false,
          callbacks: {
            label: (ctx) => ` ${formatCurrency(ctx.parsed.y)}`
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          border: { display: false },
          ticks: { color: colors.text, font: { size: 11, weight: '600' } }
        },
        y: {
          beginAtZero: true,
          border: { display: false, dash: [4, 4] },
          grid: { color: colors.grid },
          ticks: {
            color: colors.text,
            font: { size: 11 },
            callback: (val) => formatCurrency(val)
          }
        }
      }
    }
  });
}

function renderCategoryDoughnut(monthItems) {
  const canvas = document.getElementById('categoryDoughnutChart');
  const emptyEl = document.getElementById('categoryChartEmpty');
  const legendEl = document.getElementById('categoryDoughnutLegend');
  if (!canvas || !window.Chart) return;

  const breakdown = groupByCategory(monthItems);
  const hasData = breakdown.length > 0;
  if (emptyEl) emptyEl.classList.toggle('hidden', hasData);
  canvas.classList.toggle('hidden', !hasData);
  if (legendEl) legendEl.classList.toggle('hidden', !hasData);

  if (categoryChart) {
    categoryChart.destroy();
    categoryChart = null;
  }
  if (!hasData) return;

  categoryChart = new window.Chart(canvas, {
    type: 'doughnut',
    data: {
      labels: breakdown.map((b) => b.category),
      datasets: [
        {
          data: breakdown.map((b) => b.amount),
          backgroundColor: breakdown.map((b) => b.meta.color),
          borderWidth: 0,
          borderRadius: 5,
          spacing: 3,
          hoverOffset: 7
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '70%',
      animation: { duration: 450 },
      plugins: {
        legend: { display: false },
        tooltip: {
          padding: 10,
          cornerRadius: 10,
          callbacks: {
            label: (ctx) => ` ${ctx.label}: ${formatCurrency(ctx.parsed)}`
          }
        }
      }
    }
  });

  if (legendEl) {
    legendEl.innerHTML = breakdown
      .slice(0, 5)
      .map(
        (b) => `
        <div class="cat-row-top" style="font-size: 0.8125rem;">
          <span class="cat-row-label">
            <span class="cat-dot" style="background-color: ${b.meta.color};"></span>
            <span>${b.category}</span>
          </span>
          <span class="tabular-nums" style="font-weight: 700;">${formatCurrency(b.amount)} (${b.percentage}%)</span>
        </div>
      `
      )
      .join('');
  }
}

function renderBudgetAlertBanner(todayTotal, weekTotal, monthTotal) {
  const container = document.getElementById('dashboardBudgetAlert');
  if (!container) return;
  const budgets = userProfile?.budgets || {};
  const checks = [
    { label: 'Monthly', ...calculateBudgetMetrics(monthTotal, budgets.monthly) },
    { label: 'Weekly', ...calculateBudgetMetrics(weekTotal, budgets.weekly) },
    { label: 'Daily', ...calculateBudgetMetrics(todayTotal, budgets.daily) }
  ];

  const exceeded = checks.find((c) => c.status === 'exceeded');
  const warning = checks.find((c) => c.status === 'warning');
  const alertItem = exceeded || warning;

  if (!alertItem) {
    container.innerHTML = '';
    container.classList.add('hidden');
    return;
  }

  const isExceeded = alertItem.status === 'exceeded';
  container.classList.remove('hidden');
  container.innerHTML = `
    <div class="alert ${isExceeded ? 'alert-danger' : 'alert-warning'}" style="margin-bottom: 20px; justify-content: space-between; align-items: center;">
      <div>
        <strong>${isExceeded ? `${alertItem.label} Budget Exceeded!` : `${alertItem.label} Budget Alert (${alertItem.percent}%)`}:</strong>
        Spent ${formatCurrency(alertItem.spent)} of ${formatCurrency(alertItem.budget)}.
      </div>
      <a href="budget.html" class="btn btn-sm btn-outline">Manage Budgets</a>
    </div>
  `;
}

function renderDashboard() {
  const now = new Date();
  const todayStr = toLocalDateStr(now);
  const daily = calculateDailySummary(allExpenses, todayStr);
  const weekly = calculateWeeklySummary(allExpenses, now);
  const monthly = calculateMonthlySummary(allExpenses, now.getFullYear(), now.getMonth());

  // Remove skeletons
  document.getElementById('summarySkeleton')?.classList.add('hidden');
  document.getElementById('summaryCards')?.classList.remove('hidden');

  animateValue(document.getElementById('todaySpendingValue'), daily.total);
  animateValue(document.getElementById('weekSpendingValue'), weekly.total);
  animateValue(document.getElementById('monthSpendingValue'), monthly.total);
  animateValue(document.getElementById('totalTransactionsValue'), allExpenses.length, (v) => String(Math.round(v)));

  document.getElementById('todayCountMeta').textContent = `${daily.count} transaction${daily.count === 1 ? '' : 's'} today`;
  document.getElementById('weekCountMeta').textContent = `${weekly.count} this week (Mon–Sun)`;
  document.getElementById('monthCountMeta').textContent = `${monthly.count} this month`;
  document.getElementById('totalTxMeta').textContent = allExpenses.length
    ? `Latest: ${allExpenses[0].title}`
    : 'No expenses logged yet';

  renderBudgetAlertBanner(daily.total, weekly.total, monthly.total);
  renderOverviewChart();
  renderCategoryDoughnut(monthly.items);

  // Recent 5 transactions
  const recentContainer = document.getElementById('recentTransactionsList');
  if (recentContainer) {
    const recentFive = allExpenses.slice(0, 5);
    if (recentFive.length === 0) {
      recentContainer.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="5" width="20" height="14" rx="3"/><path d="M2 10h20"/></svg>
          </div>
          <div class="empty-state-title">No expenses recorded yet</div>
          <p class="empty-state-text">Start tracking your daily spending by adding your first expense.</p>
          <a href="add-expense.html" class="btn btn-primary btn-sm">+ Add Expense</a>
        </div>
      `;
    } else {
      recentContainer.innerHTML = recentFive.map((e) => renderTransactionItem(e)).join('');
    }
  }
}

onDomReady(() => {
  initAppShell('dashboard', 'Dashboard');

  const dateEl = document.getElementById('currentDateDisplay');
  if (dateEl) dateEl.textContent = formatFullDate(new Date());

  document.querySelectorAll('[data-chart-period]').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('[data-chart-period]').forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      currentPeriod = tab.getAttribute('data-chart-period');
      renderOverviewChart();
    });
  });

  window.addEventListener('spendly:themechange', () => {
    renderOverviewChart();
    const now = new Date();
    const monthly = calculateMonthlySummary(allExpenses, now.getFullYear(), now.getMonth());
    renderCategoryDoughnut(monthly.items);
  });

  // Render immediately from local cache so the dashboard never shows empty skeletons
  allExpenses = getCachedExpenses();
  userProfile = getCachedProfile();
  if (allExpenses.length > 0) {
    renderDashboard();
  }

  requireAuth(({ user, profile }) => {
    userProfile = profile;
    const displayName = profile?.name || user.displayName || user.email?.split('@')[0] || 'Friend';
    const welcomeEl = document.getElementById('welcomeHeading');
    if (welcomeEl) welcomeEl.textContent = `${getGreeting()}, ${displayName}!`;

    subscribeUserProfile(user.uid, (prof) => {
      if (prof) {
        userProfile = prof;
        updateShellUser(user, prof.name);
        if (welcomeEl) welcomeEl.textContent = `${getGreeting()}, ${prof.name || displayName}!`;
        renderDashboard();
      }
    });

    subscribeExpenses(
      user.uid,
      (expenses) => {
        allExpenses = expenses;
        renderDashboard();
      },
      (err) => {
        const msg = err.message || 'Failed to sync expenses';
        showToast(msg, 'error');
        renderDashboard();
        const alertContainer = document.getElementById('dashboardBudgetAlert');
        if (alertContainer) {
          alertContainer.classList.remove('hidden');
          alertContainer.innerHTML = `<div class="alert alert-danger" style="margin-bottom: 20px;"><div><strong>Database Connection Error:</strong> ${msg}</div></div>`;
        }
      }
    );
  });
});
