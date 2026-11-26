// Spendly — Daily Expense Tracker Controller

import { requireAuth } from './auth.js';
import { getCachedExpenses, removeExpense, subscribeExpenses } from './store.js';
import {
  animateValue,
  confirmDialog,
  initAppShell,
  onDomReady,
  renderTransactionItem,
  showToast
} from './ui.js';
import {
  calculateDailySummary,
  escapeHtml,
  formatCurrency,
  formatDisplayDate,
  parseLocalDate,
  toLocalDateStr
} from './utils.js';

let currentUser = null;
let allExpenses = [];
let selectedDateStr = toLocalDateStr();
let dailyCatChart = null;

function renderCategoryBreakdown(breakdown) {
  const listEl = document.getElementById('dailyCategoryList');
  const canvas = document.getElementById('dailyCategoryChart');
  const emptyChartEl = document.getElementById('dailyChartEmpty');

  if (listEl) {
    if (breakdown.length === 0) {
      listEl.innerHTML = '<p class="card-subtitle">No category spending for this date.</p>';
    } else {
      listEl.innerHTML = breakdown
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

  if (canvas && window.Chart) {
    const hasData = breakdown.length > 0;
    canvas.classList.toggle('hidden', !hasData);
    emptyChartEl?.classList.toggle('hidden', hasData);
    if (dailyCatChart) {
      dailyCatChart.destroy();
      dailyCatChart = null;
    }
    if (hasData) {
      dailyCatChart = new window.Chart(canvas, {
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

function renderDailyReport() {
  const summary = calculateDailySummary(allExpenses, selectedDateStr);
  const isToday = selectedDateStr === toLocalDateStr();

  const labelEl = document.getElementById('dailySelectedLabel');
  if (labelEl) {
    labelEl.textContent = isToday
      ? `Today (${formatDisplayDate(selectedDateStr)})`
      : formatDisplayDate(selectedDateStr, { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' });
  }

  animateValue(document.getElementById('dailyTotalValue'), summary.total);
  animateValue(document.getElementById('dailyTxCountValue'), summary.count, (v) => String(Math.round(v)));

  const highEl = document.getElementById('dailyHighestValue');
  const highMeta = document.getElementById('dailyHighestMeta');
  if (summary.highestExpense) {
    animateValue(highEl, summary.highestExpense.amount);
    if (highMeta) {
      highMeta.textContent = `${summary.highestExpense.title} (${summary.highestExpense.category})`;
    }
  } else {
    if (highEl) highEl.textContent = formatCurrency(0);
    if (highMeta) highMeta.textContent = 'No expenses on this date';
  }

  renderCategoryBreakdown(summary.categoryBreakdown);

  const listEl = document.getElementById('dailyExpensesList');
  if (listEl) {
    if (summary.items.length === 0) {
      listEl.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="18" height="18" x="3" y="4" rx="2"/><line x1="3" x2="21" y1="10" y2="10"/></svg>
          </div>
          <div class="empty-state-title">No expenses on ${formatDisplayDate(selectedDateStr)}</div>
          <p class="empty-state-text">Pick another date or add a new expense for this day.</p>
          <a href="add-expense.html" class="btn btn-primary btn-sm">+ Add Expense</a>
        </div>
      `;
    } else {
      listEl.innerHTML = summary.items.map((e) => renderTransactionItem(e, { showActions: true })).join('');
      listEl.querySelectorAll('.delete-expense-btn').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const ok = await confirmDialog({
            title: 'Delete Expense',
            message: `Delete "${btn.dataset.title}"? This action cannot be undone.`,
            confirmText: 'Delete',
            danger: true
          });
          if (!ok || !currentUser) return;
          try {
            await removeExpense(currentUser.uid, btn.dataset.id);
            showToast('Expense deleted.', 'success');
          } catch (err) {
            showToast(err.message || 'Could not delete expense', 'error');
          }
        });
      });
    }
  }
}

onDomReady(() => {
  initAppShell('daily', 'Daily Report');

  const picker = document.getElementById('dailyDatePicker');
  if (picker) {
    picker.value = selectedDateStr;
    picker.addEventListener('change', () => {
      if (picker.value) {
        selectedDateStr = picker.value;
        renderDailyReport();
      }
    });
  }

  const shiftDate = (days) => {
    const d = parseLocalDate(selectedDateStr);
    d.setDate(d.getDate() + days);
    selectedDateStr = toLocalDateStr(d);
    if (picker) picker.value = selectedDateStr;
    renderDailyReport();
  };

  document.getElementById('prevDayBtn')?.addEventListener('click', () => shiftDate(-1));
  document.getElementById('nextDayBtn')?.addEventListener('click', () => shiftDate(1));
  document.getElementById('todayBtn')?.addEventListener('click', () => {
    selectedDateStr = toLocalDateStr();
    if (picker) picker.value = selectedDateStr;
    renderDailyReport();
  });

  // Render immediately with cached data so screen is never blank or delayed
  allExpenses = getCachedExpenses();
  renderDailyReport();

  requireAuth(({ user }) => {
    currentUser = user;
    subscribeExpenses(
      user.uid,
      (expenses) => {
        allExpenses = expenses;
        renderDailyReport();
      },
      (err) => showToast(err.message || 'Failed to load expenses', 'error')
    );
  });
});
