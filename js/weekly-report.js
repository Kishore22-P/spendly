// Spendly — Weekly Expense Tracker Controller (Monday to Sunday)

import { requireAuth } from './auth.js';
import { getCachedExpenses, subscribeExpenses } from './store.js';
import { animateValue, initAppShell, onDomReady, showToast } from './ui.js';
import {
  calculateWeeklySummary,
  formatCurrency,
  formatDisplayDate,
  getMondayOfWeek
} from './utils.js';

let allExpenses = [];
let weekOffset = 0;
let weeklyChart = null;

function getReferenceDate() {
  const now = new Date();
  const monday = getMondayOfWeek(now);
  monday.setDate(monday.getDate() + weekOffset * 7);
  return monday;
}

function renderWeeklyChart(dailyTotals) {
  const canvas = document.getElementById('weeklyBarChart');
  const emptyEl = document.getElementById('weeklyChartEmpty');
  if (!canvas || !window.Chart) return;

  const hasData = dailyTotals.some((d) => d.total > 0);
  canvas.classList.toggle('hidden', !hasData);
  emptyEl?.classList.toggle('hidden', hasData);

  if (weeklyChart) {
    weeklyChart.destroy();
    weeklyChart = null;
  }
  if (!hasData) return;

  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const tickColor = isDark ? '#A3BBB0' : '#4C6458';
  const gridColor = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(12,66,40,0.07)';
  const tooltipBg = isDark ? '#15281E' : '#0C2117';
  const ctx = canvas.getContext('2d');
  const barColor = ctx.createLinearGradient(0, 0, 0, canvas.height || 280);
  if (isDark) {
    barColor.addColorStop(0, '#4ADE80');
    barColor.addColorStop(1, 'rgba(22, 163, 74, 0.35)');
  } else {
    barColor.addColorStop(0, '#16A34A');
    barColor.addColorStop(1, '#0C4228');
  }

  weeklyChart = new window.Chart(canvas, {
    type: 'bar',
    data: {
      labels: dailyTotals.map((d) => `${d.dayName} (${d.label})`),
      datasets: [
        {
          label: 'Daily Spending',
          data: dailyTotals.map((d) => d.total),
          backgroundColor: barColor,
          hoverBackgroundColor: isDark ? '#4ADE80' : '#22C55E',
          borderRadius: 10,
          borderSkipped: false,
          maxBarThickness: 40
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
            label: (ctx) => ` ${formatCurrency(ctx.parsed.y)}`
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          border: { display: false },
          ticks: { color: tickColor, font: { size: 11, weight: '600' } }
        },
        y: {
          beginAtZero: true,
          border: { display: false, dash: [4, 4] },
          grid: { color: gridColor },
          ticks: {
            color: tickColor,
            font: { size: 11 },
            callback: (v) => formatCurrency(v)
          }
        }
      }
    }
  });
}

function renderWeeklyReport() {
  const refDate = getReferenceDate();
  const summary = calculateWeeklySummary(allExpenses, refDate);

  const rangeEl = document.getElementById('weekRangeLabel');
  if (rangeEl) {
    const tag = weekOffset === 0 ? 'Current Week' : weekOffset === -1 ? 'Last Week' : '';
    const rangeText = `${formatDisplayDate(summary.startStr, { day: 'numeric', month: 'short' })} – ${formatDisplayDate(summary.endStr, { day: 'numeric', month: 'short', year: 'numeric' })}`;
    rangeEl.textContent = tag ? `${tag} (${rangeText})` : rangeText;
  }

  const nextBtn = document.getElementById('nextWeekBtn');
  if (nextBtn) nextBtn.disabled = weekOffset >= 0;

  animateValue(document.getElementById('weeklyTotalValue'), summary.total);
  animateValue(document.getElementById('weeklyAvgValue'), summary.averageDaily);
  animateValue(document.getElementById('weeklyTxCountValue'), summary.count, (v) => String(Math.round(v)));

  const highEl = document.getElementById('weeklyHighestDayValue');
  const highMeta = document.getElementById('weeklyHighestDayMeta');
  if (summary.highestDay) {
    if (highEl) highEl.textContent = summary.highestDay.dayName;
    if (highMeta) highMeta.textContent = `${formatCurrency(summary.highestDay.total)} on ${formatDisplayDate(summary.highestDay.dateStr, { day: 'numeric', month: 'short' })}`;
  } else {
    if (highEl) highEl.textContent = '—';
    if (highMeta) highMeta.textContent = 'No spending this week';
  }

  renderWeeklyChart(summary.dailyTotals);

  const breakdownEl = document.getElementById('weeklyDayBreakdown');
  if (breakdownEl) {
    const maxVal = Math.max(...summary.dailyTotals.map((d) => d.total), 1);
    breakdownEl.innerHTML = summary.dailyTotals
      .map((d) => {
        const pct = d.total > 0 ? Math.round((d.total / maxVal) * 100) : 0;
        return `
          <div class="cat-row">
            <div class="cat-row-top">
              <span class="cat-row-label">
                <span>${d.dayName}, ${d.label}</span>
                <span class="badge badge-neutral">${d.count} tx</span>
              </span>
              <span class="tabular-nums" style="font-weight: 700;">${formatCurrency(d.total)}</span>
            </div>
            <div class="progress-track">
              <div class="progress-fill" style="width: ${pct}%;"></div>
            </div>
          </div>
        `;
      })
      .join('');
  }
}

onDomReady(() => {
  initAppShell('weekly', 'Weekly Report');

  document.getElementById('prevWeekBtn')?.addEventListener('click', () => {
    weekOffset -= 1;
    renderWeeklyReport();
  });
  document.getElementById('currentWeekBtn')?.addEventListener('click', () => {
    weekOffset = 0;
    renderWeeklyReport();
  });
  document.getElementById('nextWeekBtn')?.addEventListener('click', () => {
    if (weekOffset < 0) {
      weekOffset += 1;
      renderWeeklyReport();
    }
  });

  window.addEventListener('spendly:themechange', () => renderWeeklyReport());

  allExpenses = getCachedExpenses();
  if (allExpenses.length > 0) {
    renderWeeklyReport();
  }

  requireAuth(({ user }) => {
    subscribeExpenses(
      user.uid,
      (expenses) => {
        allExpenses = expenses;
        renderWeeklyReport();
      },
      (err) => showToast(err.message || 'Failed to load weekly expenses', 'error')
    );
  });
});
