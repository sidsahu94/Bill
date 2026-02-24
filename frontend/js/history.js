// frontend/js/history.js
// Elite Paginated Ledger Controller

function makeHeaders(json = true) {
  const token = localStorage.getItem('token');
  const headers = {};
  if (json) headers['Content-Type'] = 'application/json';
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

function showToast(message, type = 'success') {
  let container = document.getElementById('toastContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toastContainer';
    container.style.cssText = 'position: fixed; bottom: 24px; right: 24px; z-index: 1055; display: flex; flex-direction: column; gap: 12px;';
    document.body.appendChild(container);
  }
  const borderColor = type === 'success' ? 'var(--emerald-hwb)' : 'var(--error)';
  const icon = type === 'success' ? '✓' : '⚠️';
  const toastId = 'toast-' + Date.now();
  const toastHTML = `
    <div id="${toastId}" class="saas-card p-3 d-flex align-items-center gap-3" style="min-width: 300px; border-left: 4px solid ${borderColor}; padding: 16px !important; animation: slideUpFade 0.4s cubic-bezier(0.16, 1, 0.3, 1);">
      <div style="font-size: 1.2rem; color: ${borderColor};">${icon}</div>
      <div>
        <div class="fw-bold text-white" style="font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.05em;">${type === 'success' ? 'Confirmed' : 'Alert'}</div>
        <div style="color: var(--text-secondary); font-size: 0.9rem;">${message}</div>
      </div>
    </div>`;
  container.insertAdjacentHTML('beforeend', toastHTML);
  setTimeout(() => { const el = document.getElementById(toastId); if (el) { el.style.opacity = '0'; el.style.transform = 'translateX(20px)'; setTimeout(() => el.remove(), 300); } }, 4000);
}

// Pagination State
let currentPage = 1;
const limit = 50;
let hasMoreData = false;
let currentFilters = { search: '', date: '', payment: '' };
let billsCache = []; // Kept for local PDF generation

document.addEventListener('DOMContentLoaded', () => {
  setupFilterListeners();
  setupLoadMoreButton();
  fetchLedgerData(true); // Initial load (reset table)
});

function setupFilterListeners() {
  let debounceTimer;
  const triggerFilter = () => {
    currentPage = 1; // Reset to page 1 on new filter
    currentFilters = {
      search: document.getElementById('searchInvoice').value.trim(),
      date: document.getElementById('filterDate').value,
      payment: document.getElementById('filterPayment').value
    };
    fetchLedgerData(true);
  };

  // Debounce text search to prevent spamming the server
  document.getElementById('searchInvoice').addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(triggerFilter, 400);
  });

  document.getElementById('filterDate').addEventListener('change', triggerFilter);
  document.getElementById('filterPayment').addEventListener('change', triggerFilter);
}

function setupLoadMoreButton() {
  const container = document.querySelector('.saas-card.overflow-hidden');
  const btnHtml = `
    <div id="loadMoreContainer" class="p-4 text-center border-top" style="border-color: var(--border-glass) !important; display: none;">
      <button id="loadMoreBtn" class="saas-btn saas-btn-secondary px-5 py-2">Load Older Entries</button>
    </div>
  `;
  container.insertAdjacentHTML('beforeend', btnHtml);
  
  document.getElementById('loadMoreBtn').addEventListener('click', () => {
    currentPage++;
    fetchLedgerData(false); // Append data
  });
}

async function fetchLedgerData(resetTable = false) {
  const tbody = document.querySelector('#billsTable tbody');
  const loadMoreContainer = document.getElementById('loadMoreContainer');
  const loadMoreBtn = document.getElementById('loadMoreBtn');

  if (resetTable) {
    tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted-custom py-5"><div class="saas-spinner mx-auto mb-2"></div>Decrypting ledger data...</td></tr>`;
    billsCache = [];
  } else {
    loadMoreBtn.disabled = true;
    loadMoreBtn.innerHTML = `<div class="saas-spinner mx-auto" style="width: 14px; height: 14px; border-width: 2px;"></div>`;
  }

  try {
    // Construct Query Parameters
    const params = new URLSearchParams({
      page: currentPage,
      limit: limit,
      search: currentFilters.search,
      date: currentFilters.date,
      payment: currentFilters.payment
    });

    const res = await fetch(`/api/billing?${params.toString()}`, { headers: makeHeaders(false) });
    if (!res.ok) {
        if(res.status === 401) window.location.replace('/pages/login.html');
        throw new Error('Failed to load ledger');
    }
    
    const responseData = await res.json();
    const bills = responseData.data;
    hasMoreData = responseData.pagination.hasMore;

    if (resetTable) {
      billsCache = bills;
      tbody.innerHTML = '';
    } else {
      billsCache = [...billsCache, ...bills];
    }
    
    if (billsCache.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted-custom py-5">No transactions recorded matching your parameters.</td></tr>`;
      loadMoreContainer.style.display = 'none';
      return;
    }

    renderTableRows(bills, tbody);

    // Handle Pagination UI
    loadMoreContainer.style.display = hasMoreData ? 'block' : 'none';
    loadMoreBtn.disabled = false;
    loadMoreBtn.innerHTML = `Load Older Entries`;

  } catch (err) {
    console.error('loadBills error', err);
    if (resetTable) {
      tbody.innerHTML = `<tr><td colspan="6" class="text-center" style="color: var(--error); padding: 40px;">Ledger decryption failed. Check connection.</td></tr>`;
    }
  }
}

function renderTableRows(data, tbody) {
  data.forEach(bill => {
    const tr = document.createElement('tr');
    
    let customerName = 'Standard Walk-in';
    if (bill.customer_id && bill.customer && bill.customer.name) {
        customerName = bill.customer.name;
    }

    const totalStr = `₹${(bill.totalAmount || 0).toFixed(2)}`;
    const dateStr = new Date(bill.date).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' });

    tr.innerHTML = `
      <td data-label="Document ID"><span class="fw-bold" style="color: var(--gold-metallic); font-family: monospace;">${bill.invoiceNumber}</span></td>
      <td data-label="Entity" class="text-white fw-bold">${escapeHtml(customerName)}</td>
      <td data-label="Timestamp" style="color: var(--text-secondary);">${dateStr}</td>
      <td data-label="Channel"><span style="background: rgba(255,255,255,0.05); border: 1px solid var(--border-glass); padding: 4px 10px; border-radius: 6px; font-size: 0.75rem; color: var(--text-secondary); letter-spacing: 0.05em; text-transform: uppercase;">${escapeHtml(bill.paymentMethod || 'N/A')}</span></td>
      <td data-label="Settlement (₹)" class="fw-bold" style="color: var(--emerald-hwb); font-size: 1.1rem;">${totalStr}</td>
      <td data-label="Actions" class="text-end">
        <div class="d-flex gap-2 justify-content-end justify-content-md-start">
          <button class="saas-btn saas-btn-secondary viewBtn" style="padding: 6px 12px; font-size: 0.75rem;">Generate PDF</button>
          <button class="saas-btn deleteBtn" style="padding: 6px 12px; font-size: 0.75rem; background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.3); color: #fca5a5;">Void</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);

    tr.querySelector('.viewBtn').addEventListener('click', () => {
        if(typeof window.generateProfessionalPDF === 'function') {
            window.generateProfessionalPDF(bill, 'print');
        } else {
            showToast('Document Engine offline.', 'error');
        }
    });
    
    tr.querySelector('.deleteBtn').addEventListener('click', () => deleteBill(bill.id, bill.invoiceNumber, tr));
  });
}

async function deleteBill(id, invNum, trElement) {
  if (!confirm(`Authorized to void document ${invNum}? This will reverse asset allocation.`)) return;
  
  const btn = trElement.querySelector('.deleteBtn');
  const originalText = btn.innerText;
  btn.disabled = true;
  btn.innerText = 'Voiding...';

  try {
    const res = await fetch(`/api/billing/${id}`, { method: 'DELETE', headers: makeHeaders(true) });
    if (!res.ok) throw new Error('Void failed');
    
    showToast(`Document ${invNum} voided successfully.`);
    trElement.style.opacity = '0.5';
    trElement.style.pointerEvents = 'none';
    
    // Smooth remove
    setTimeout(() => {
      trElement.remove();
      // Remove from cache
      billsCache = billsCache.filter(b => String(b.id) !== String(id));
      
      // If table is now empty, refresh
      if (document.querySelectorAll('#billsTable tbody tr').length === 0) {
        fetchLedgerData(true);
      }
    }, 500);

  } catch (err) {
    console.error('deleteBill error', err);
    showToast('Failed to void document. System lock active.', 'error');
    btn.disabled = false;
    btn.innerText = originalText;
  }
}

function escapeHtml(unsafe) { 
  return String(unsafe || '').replace(/[&<"'>]/g, function(m) { 
    return ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'}[m]);
  });
}