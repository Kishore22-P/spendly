// Spendly — Monthly Expense Tracker, Comparison, CSV & PDF Export

import { requireAuth } from './auth.js';
import { getCachedExpenses, subscribeExpenses } from './store.js';
import { animateValue, initAppShell, onDomReady, showToast } from './ui.js';
import {
  calculateMonthlySummary,
  compareMonths,
  escapeHtml,
  exportExpensesToCSV,
  formatCurrency,
  formatDisplayDate,
  generateMonthlyPDFReport
} from './utils.js';

let currentUser = null;
let allExpenses = [];
const now = new Date();
let selectedYear = now.getFullYear();
let selectedMonth = now.getMonth();
let monthlyDailyChart = null;
let monthlyCatChart = null;

function populateSelectors() {
  const monthSelect = document.getElementById('monthSelect');
  const yearSelect = document.getElementById('yearSelect');

  if (monthSelect) {
    const months = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    monthSelect.innerHTML = months
      .map((name, idx) => `<option value="${idx}" ${idx === selectedMonth ? 'selected' : ''}>${name}</option>`)
      .join('');
    monthSelect.addEventListener('change', () => {
      selectedMonth = Number(monthSelect.value);
      renderMonthlyReport();
    });
  }

  if (yearSelect) {
    const years = [];
    for (let y = now.getFullYear(); y >= now.getFullYear() - 5; y--) {
      years.push(y);
    }
    yearSelect.innerHTML = years
      .map((y) => `<option value="${y}" ${y === selectedYear ? 'selected' : ''}>${y}</option>`)
      .join('');
    yearSelect.addEventListener('change', () => {
      selectedYear = Number(yearSelect.value);
      renderMonthlyReport();
    });
  }
}

function renderMonthlyCharts(summary) {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const tickColor = isDark ? '#A3BBB0' : '#4C6458';
  const gridColor = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(12,66,40,0.07)';
  const tooltipBg = isDark ? '#15281E' : '#0C2117';

  const dailyCanvas = document.getElementById('monthlyDailyChart');
  const dailyEmpty = document.getElementById('monthlyDailyEmpty');
  const hasDaily = summary.total > 0;
  if (dailyCanvas && window.Chart) {
    dailyCanvas.classList.toggle('hidden', !hasDaily);
    dailyEmpty?.classList.toggle('hidden', hasDaily);
    if (monthlyDailyChart) {
      monthlyDailyChart.destroy();
      monthlyDailyChart = null;
    }
    if (hasDaily) {
      const ctx = dailyCanvas.getContext('2d');
      const barColor = ctx.createLinearGradient(0, 0, 0, dailyCanvas.height || 280);
      if (isDark) {
        barColor.addColorStop(0, '#4ADE80');
        barColor.addColorStop(1, 'rgba(22, 163, 74, 0.35)');
      } else {
        barColor.addColorStop(0, '#16A34A');
        barColor.addColorStop(1, '#0C4228');
      }
      monthlyDailyChart = new window.Chart(dailyCanvas, {
        type: 'bar',
        data: {
          labels: summary.dailyTotals.map((d) => String(d.day)),
          datasets: [
            {
              label: 'Daily Spend',
              data: summary.dailyTotals.map((d) => d.total),
              backgroundColor: barColor,
              hoverBackgroundColor: isDark ? '#4ADE80' : '#22C55E',
              borderRadius: 6,
              borderSkipped: false
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: tooltipBg,
              padding: 10,
              cornerRadius: 10,
              displayColors: false,
              callbacks: {
                title: (items) => `Day ${items[0].label}`,
                label: (ctx) => ` ${formatCurrency(ctx.parsed.y)}`
              }
            }
          },
          scales: {
            x: { grid: { display: false }, border: { display: false }, ticks: { color: tickColor, font: { size: 10 } } },
            y: {
              beginAtZero: true,
              border: { display: false, dash: [4, 4] },
              grid: { color: gridColor },
              ticks: { color: tickColor, font: { size: 11 }, callback: (v) => formatCurrency(v) }
            }
          }
        }
      });
    }
  }

  const catCanvas = document.getElementById('monthlyCategoryChart');
  const catEmpty = document.getElementById('monthlyCatEmpty');
  if (catCanvas && window.Chart) {
    const hasCats = summary.categoryBreakdown.length > 0;
    catCanvas.classList.toggle('hidden', !hasCats);
    catEmpty?.classList.toggle('hidden', hasCats);
    if (monthlyCatChart) {
      monthlyCatChart.destroy();
      monthlyCatChart = null;
    }
    if (hasCats) {
      monthlyCatChart = new window.Chart(catCanvas, {
        type: 'doughnut',
        data: {
          labels: summary.categoryBreakdown.map((c) => c.category),
          datasets: [
            {
              data: summary.categoryBreakdown.map((c) => c.amount),
              backgroundColor: summary.categoryBreakdown.map((c) => c.meta.color),
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
    }
  }
}

function renderMonthlyReport() {
  const summary = calculateMonthlySummary(allExpenses, selectedYear, selectedMonth);
  const comp = compareMonths(allExpenses, selectedYear, selectedMonth);

  animateValue(document.getElementById('monthlyTotalValue'), summary.total);
  animateValue(document.getElementById('monthlyTxCountValue'), summary.count, (v) => String(Math.round(v)));
  animateValue(document.getElementById('monthlyAvgValue'), summary.averageDaily);

  const topCatEl = document.getElementById('monthlyTopCategoryValue');
  const topCatMeta = document.getElementById('monthlyTopCategoryMeta');
  if (summary.highestCategory) {
    if (topCatEl) topCatEl.textContent = summary.highestCategory.category;
    if (topCatMeta) topCatMeta.textContent = `${formatCurrency(summary.highestCategory.amount)} (${summary.highestCategory.percentage}%)`;
  } else {
    if (topCatEl) topCatEl.textContent = '—';
    if (topCatMeta) topCatMeta.textContent = 'No spending this month';
  }

  const highDayEl = document.getElementById('monthlyHighestDayValue');
  if (highDayEl) {
    highDayEl.textContent = summary.highestDay
      ? `${formatDisplayDate(summary.highestDay.dateStr, { day: 'numeric', month: 'short' })} — ${formatCurrency(summary.highestDay.total)}`
      : 'No spending recorded';
  }

  // Month Comparison
  document.getElementById('compCurrentMonthValue').textContent = formatCurrency(comp.currentTotal);
  document.getElementById('compPreviousMonthValue').textContent = formatCurrency(comp.previousTotal);
  document.getElementById('compPreviousMonthLabel').textContent = comp.previousLabel;

  const badgeEl = document.getElementById('compChangeBadge');
  if (badgeEl) {
    if (comp.direction === 'up') {
      badgeEl.className = 'badge badge-danger';
      badgeEl.textContent = `+${comp.percentChange}% vs last month (+${formatCurrency(comp.diff)})`;
    } else if (comp.direction === 'down') {
      badgeEl.className = 'badge badge-success';
      badgeEl.textContent = `${comp.percentChange}% vs last month (${formatCurrency(Math.abs(comp.diff))} saved)`;
    } else {
      badgeEl.className = 'badge badge-neutral';
      badgeEl.textContent = 'No change vs last month';
    }
  }

  renderMonthlyCharts(summary);

  // Category breakdown list
  const catListEl = document.getElementById('monthlyCategoryList');
  if (catListEl) {
    if (summary.categoryBreakdown.length === 0) {
      catListEl.innerHTML = '<p class="card-subtitle">No expenses recorded for this month.</p>';
    } else {
      catListEl.innerHTML = summary.categoryBreakdown
        .map(
          (c) => `
          <div class="cat-row">
            <div class="cat-row-top">
              <span class="cat-row-label">
                <span class="cat-dot" style="background-color: ${c.meta.color};"></span>
                <span>${escapeHtml(c.category)}</span>
                <span class="badge badge-neutral">${c.count}</span>
              </span>
              <span class="tabular-nums" style="font-weight: 700;">${formatCurrency(c.amount)} (${c.percentage}%)</span>
            </div>
            <div class="progress-track">
              <div class="progress-fill" style="width: ${Math.min(c.percentage, 100)}%; background-color: ${c.meta.color};"></div>
            </div>
          </div>
        `
        )
        .join('');
    }
  }
}

onDomReady(() => {
  initAppShell('monthly', 'Monthly Report');
  populateSelectors();

  document.getElementById('exportCsvBtn')?.addEventListener('click', () => {
    const summary = calculateMonthlySummary(allExpenses, selectedYear, selectedMonth);
    if (summary.items.length === 0) {
      showToast('No expenses in the selected month to export.', 'warning');
      return;
    }
    const fileMonth = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}`;
    exportExpensesToCSV(summary.items, `spendly-expenses-${fileMonth}.csv`);
    showToast('Monthly expenses exported to CSV!', 'success');
  });

  document.getElementById('exportPdfBtn')?.addEventListener('click', async () => {
    const summary = calculateMonthlySummary(allExpenses, selectedYear, selectedMonth);
    if (summary.items.length === 0) {
      showToast('No expenses in the selected month to export.', 'warning');
      return;
    }
    const comparison = compareMonths(allExpenses, selectedYear, selectedMonth);
    const downloaded = await generateMonthlyPDFReport({
      summary,
      comparison,
      year: selectedYear,
      monthIndex: selectedMonth,
      userName: currentUser?.displayName || currentUser?.email
    });
    if (downloaded) {
      showToast('PDF report downloaded!', 'success');
    }
  });

  window.addEventListener('spendly:themechange', () => renderMonthlyReport());

  allExpenses = getCachedExpenses();
  if (allExpenses.length > 0) {
    renderMonthlyReport();
  }

  requireAuth(({ user }) => {
    currentUser = user;
    subscribeExpenses(
      user.uid,
      (expenses) => {
        allExpenses = expenses;
        renderMonthlyReport();
      },
      (err) => showToast(err.message || 'Failed to load monthly data', 'error')
    );
  });
});
