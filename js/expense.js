// Spendly — Add & Edit Expense Controller

import { requireAuth } from './auth.js';
import { createExpense, getExpenseById, removeExpense, updateExpense } from './store.js';
import { confirmDialog, initAppShell, onDomReady, showToast } from './ui.js';
import { CATEGORIES, PAYMENT_METHODS, toLocalDateStr } from './utils.js';

let currentUser = null;
let editingId = null;

function populateSelects() {
  const catSelect = document.getElementById('expenseCategory');
  const methodSelect = document.getElementById('expenseMethod');

  if (catSelect) {
    catSelect.innerHTML =
      '<option value="" disabled selected>Select a category</option>' +
      CATEGORIES.map((c) => `<option value="${c.name}">${c.name}</option>`).join('');
  }

  if (methodSelect) {
    methodSelect.innerHTML =
      '<option value="" disabled selected>Select payment method</option>' +
      PAYMENT_METHODS.map((m) => `<option value="${m}">${m}</option>`).join('');
  }
}

function validateForm() {
  const titleEl = document.getElementById('expenseTitle');
  const amountEl = document.getElementById('expenseAmount');
  const categoryEl = document.getElementById('expenseCategory');
  const dateEl = document.getElementById('expenseDate');
  const methodEl = document.getElementById('expenseMethod');
  const notesEl = document.getElementById('expenseNotes');

  const errors = [];
  const title = titleEl.value.trim();
  const amount = Number(amountEl.value);
  const category = categoryEl.value;
  const date = dateEl.value;
  const paymentMethod = methodEl.value;
  const notes = notesEl.value.trim();

  if (!title) errors.push('Please enter an expense title.');
  if (!Number.isFinite(amount) || amount <= 0) errors.push('Amount must be greater than zero.');
  if (!category) errors.push('Please choose a category.');
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) errors.push('Please select a valid date.');
  if (!paymentMethod) errors.push('Please select a payment method.');

  if (errors.length > 0) {
    showToast(errors[0], 'error');
    return null;
  }

  return { title, amount, category, date, paymentMethod, notes };
}

onDomReady(() => {
  const params = new URLSearchParams(window.location.search);
  editingId = params.get('id');

  initAppShell('add', editingId ? 'Edit Expense' : 'Add Expense');
  populateSelects();

  const dateEl = document.getElementById('expenseDate');
  if (dateEl && !editingId) {
    dateEl.value = toLocalDateStr();
  }

  const form = document.getElementById('expenseForm');
  const submitBtn = document.getElementById('saveExpenseBtn');
  const saveAnotherBtn = document.getElementById('saveAnotherBtn');
  const deleteBtn = document.getElementById('deleteExpenseBtn');
  const formHeading = document.getElementById('expenseFormHeading');
  const formSubheading = document.getElementById('expenseFormSubheading');

  if (editingId) {
    if (formHeading) formHeading.textContent = 'Edit Expense';
    if (formSubheading) formSubheading.textContent = 'Update the details of this expense record.';
    if (submitBtn) submitBtn.textContent = 'Update Expense';
    saveAnotherBtn?.classList.add('hidden');
    deleteBtn?.classList.remove('hidden');
  }

  let addAnother = false;
  saveAnotherBtn?.addEventListener('click', () => {
    addAnother = true;
    form?.requestSubmit();
  });

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!currentUser) return;

    const payload = validateForm();
    if (!payload) {
      addAnother = false;
      return;
    }

    const originalText = submitBtn.textContent;
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="spinner"></span> Saving...';
    if (saveAnotherBtn) saveAnotherBtn.disabled = true;

    try {
      if (editingId) {
        await updateExpense(currentUser.uid, editingId, payload);
        showToast('Expense updated successfully!', 'success');
        window.location.href = 'history.html';
      } else {
        await createExpense(currentUser.uid, payload);
        showToast('Expense added successfully!', 'success');
        if (addAnother) {
          form.reset();
          if (dateEl) dateEl.value = toLocalDateStr();
          document.getElementById('expenseTitle')?.focus();
          addAnother = false;
        } else {
          window.location.href = 'dashboard.html';
        }
      }
    } catch (err) {
      showToast(err.message || 'Could not save expense', 'error');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = originalText;
      if (saveAnotherBtn) saveAnotherBtn.disabled = false;
    }
  });

  deleteBtn?.addEventListener('click', async () => {
    if (!currentUser || !editingId) return;
    const confirmed = await confirmDialog({
      title: 'Delete Expense',
      message: 'Are you sure you want to permanently delete this expense?',
      confirmText: 'Delete',
      danger: true
    });
    if (!confirmed) return;

    try {
      await removeExpense(currentUser.uid, editingId);
      showToast('Expense deleted.', 'success');
      window.location.href = 'history.html';
    } catch (err) {
      showToast(err.message || 'Failed to delete expense', 'error');
    }
  });

  requireAuth(async ({ user }) => {
    currentUser = user;
    if (editingId) {
      try {
        const existing = await getExpenseById(user.uid, editingId);
        if (!existing) {
          showToast('Expense record not found.', 'error');
          window.location.replace('history.html');
          return;
        }
        document.getElementById('expenseTitle').value = existing.title || '';
        document.getElementById('expenseAmount').value = existing.amount ?? '';
        document.getElementById('expenseCategory').value = existing.category || 'Other';
        document.getElementById('expenseDate').value = existing.date || toLocalDateStr();
        document.getElementById('expenseMethod').value = existing.paymentMethod || 'Other';
        document.getElementById('expenseNotes').value = existing.notes || '';
      } catch (err) {
        showToast(err.message || 'Failed to load expense', 'error');
      }
    }
  });
});
