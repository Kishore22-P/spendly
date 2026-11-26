// Spendly — Expense History Controller (Search, Filters, Sort & Pagination)

import { requireAuth } from './auth.js';
import { getCachedExpenses, removeExpense, subscribeExpenses } from './store.js';
import {
  confirmDialog,
  initAppShell,
  onDomReady,
  renderTransactionItem,
  showToast
} from './ui.js';
import {
  CATEGORIES,
  PAYMENT_METHODS,
  exportExpensesToCSV,
  formatCurrency,
  sortExpensesNewestFirst,
  sumExpenses
} from './utils.js';

const PAGE_SIZE = 15;
let currentUser = null;
let allExpenses = [];
let visibleLimit = PAGE_SIZE;

function populateFilterOptions() {
  const catEl = document.getElementById('filterCategory');
  if (catEl) {
    catEl.innerHTML =
      '<option value="">All Categories</option>' +
      CATEGORIES.map((c) => `<option value="${c.name}">${c.name}</option>`).join('');
  }

  const methodEl = document.getElementById('filterMethod');
  if (methodEl) {
    methodEl.innerHTML =
      '<option value="">All Methods</option>' +
      PAYMENT_METHODS.map((m) => `<option value="${m}">${m}</option>`).join('');
  }
}

function getFilteredExpenses() {
  const search = (document.getElementById('searchInput')?.value || '').trim().toLowerCase();
  const category = document.getElementById('filterCategory')?.value || '';
  const method = document.getElementById('filterMethod')?.value || '';
  const date = document.getElementById('filterDate')?.value || '';
  const sortOrder = document.getElementById('sortOrder')?.value || 'newest';

  let filtered = allExpenses.filter((e) => {
    if (search) {
      const titleMatch = (e.title || '').toLowerCase().includes(search);
      const notesMatch = (e.notes || '').toLowerCase().includes(search);
      if (!titleMatch && !notesMatch) return false;
    }
    if (category && e.category !== category) return false;
    if (method && e.paymentMethod !== method) return false;
    if (date && e.date !== date) return false;
    return true;
  });

  filtered = sortExpensesNewestFirst(filtered);
  if (sortOrder === 'oldest') {
    filtered.reverse();
  }
  return filtered;
}

function renderHistory() {
  const filtered = getFilteredExpenses();
  const totalAmount = sumExpenses(filtered);

  const summaryEl = document.getElementById('historySummaryText');
  if (summaryEl) {
    summaryEl.textContent = `${filtered.length} transaction${filtered.length === 1 ? '' : 's'} • Total ${formatCurrency(totalAmount)}`;
  }

  const listEl = document.getElementById('historyList');
  const loadMoreBtn = document.getElementById('loadMoreBtn');
  const paginationInfo = document.getElementById('paginationInfo');

  if (!listEl) return;

  if (filtered.length === 0) {
    listEl.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
        </div>
        <div class="empty-state-title">No matching transactions</div>
        <p class="empty-state-text">Try adjusting your filters or add a new expense.</p>
        <button type="button" class="btn btn-outline btn-sm" id="emptyClearFiltersBtn">Reset Filters</button>
      </div>
    `;
    document.getElementById('emptyClearFiltersBtn')?.addEventListener('click', resetFilters);
    loadMoreBtn?.classList.add('hidden');
    if (paginationInfo) paginationInfo.textContent = '';
    return;
  }

  const visibleItems = filtered.slice(0, visibleLimit);
  listEl.innerHTML = visibleItems.map((e) => renderTransactionItem(e, { showActions: true })).join('');

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

  const hasMore = filtered.length > visibleItems.length;
  loadMoreBtn?.classList.toggle('hidden', !hasMore);
  if (paginationInfo) {
    paginationInfo.textContent = `Showing ${visibleItems.length} of ${filtered.length} transactions`;
  }
}

function resetFilters() {
  const ids = ['searchInput', 'filterCategory', 'filterMethod', 'filterDate'];
  ids.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const sortEl = document.getElementById('sortOrder');
  if (sortEl) sortEl.value = 'newest';
  visibleLimit = PAGE_SIZE;
  renderHistory();
}

onDomReady(() => {
  initAppShell('history', 'Expense History');
  populateFilterOptions();

  ['searchInput', 'filterCategory', 'filterMethod', 'filterDate', 'sortOrder'].forEach((id) => {
    const el = document.getElementById(id);
    const evt = id === 'searchInput' ? 'input' : 'change';
    el?.addEventListener(evt, () => {
      visibleLimit = PAGE_SIZE;
      renderHistory();
    });
  });

  document.getElementById('clearFiltersBtn')?.addEventListener('click', resetFilters);

  document.getElementById('loadMoreBtn')?.addEventListener('click', () => {
    visibleLimit += PAGE_SIZE;
    renderHistory();
  });

  document.getElementById('exportHistoryCsvBtn')?.addEventListener('click', () => {
    const filtered = getFilteredExpenses();
    if (filtered.length === 0) {
      showToast('No transactions to export.', 'warning');
      return;
    }
    exportExpensesToCSV(filtered, 'spendly-expense-history.csv');
    showToast('Exported history to CSV!', 'success');
  });

  allExpenses = getCachedExpenses();
  if (allExpenses.length > 0) {
    renderHistory();
  }

  requireAuth(({ user }) => {
    currentUser = user;
    subscribeExpenses(
      user.uid,
      (expenses) => {
        allExpenses = expenses;
        renderHistory();
      },
      (err) => {
        showToast(err.message || 'Failed to load history', 'error');
        renderHistory();
      }
    );
  });
});
