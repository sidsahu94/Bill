// frontend/js/history.js
// Elite Ledger Controller

function makeHeaders(json = true) {
  const token = localStorage.getItem('token');
  const headers = {};
  if (json) headers['Content-Type'] = 'application/json';
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

// Elite Toast Notification System
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

let billsCache = [];

document.addEventListener('DOMContentLoaded', loadBills);

async function loadBills() {
  try {
    const res = await fetch('/api/billing', { headers: makeHeaders(false) });
    if (!res.ok) {
        if(res.status === 401) window.location.replace('/pages/login.html');
        throw new Error('Failed to load ledger');
    }
    billsCache = await res.json();
    renderTable(billsCache);

    document.getElementById('searchInvoice').addEventListener('input', filterBills);
    document.getElementById('filterDate').addEventListener('change', filterBills);
    document.getElementById('filterPayment').addEventListener('change', filterBills);
  } catch (err) {
    console.error('loadBills error', err);
    document.querySelector('#billsTable tbody').innerHTML = `<tr><td colspan="6" class="text-center" style="color: var(--error); padding: 40px;">Ledger decryption failed. Check authorization.</td></tr>`;
  }
}

function renderTable(data) {
  const tbody = document.querySelector('#billsTable tbody');
  tbody.innerHTML = '';
  
  if(data.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted-custom py-5">No transactions recorded in ledger.</td></tr>`;
      return;
  }

  data.forEach(bill => {
    const tr = document.createElement('tr');
    
    let customerName = 'Standard Walk-in';
    if (bill.customer_id && bill.customer) {
        customerName = bill.customer.name;
    }

    const totalStr = `₹${(bill.totalAmount || 0).toFixed(2)}`;
    const dateStr = new Date(bill.date).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' });

    tr.innerHTML = `
      <td data-label="Document ID"><span class="fw-bold" style="color: var(--gold-metallic); font-family: monospace;">${bill.invoiceNumber}</span></td>
      <td data-label="Entity" class="text-white fw-bold">${customerName}</td>
      <td data-label="Timestamp" style="color: var(--text-secondary);">${dateStr}</td>
      <td data-label="Channel"><span style="background: rgba(255,255,255,0.05); border: 1px solid var(--border-glass); padding: 4px 10px; border-radius: 6px; font-size: 0.75rem; color: var(--text-secondary); letter-spacing: 0.05em; text-transform: uppercase;">${bill.paymentMethod || 'N/A'}</span></td>
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
    tr.querySelector('.deleteBtn').addEventListener('click', () => deleteBill(bill.id, bill.invoiceNumber));
  });
}

function filterBills() {
  const keyword = document.getElementById('searchInvoice').value.toLowerCase();
  const date = document.getElementById('filterDate').value;
  const payment = document.getElementById('filterPayment').value;

  const filtered = billsCache.filter(b => {
    const custName = b.customer ? b.customer.name.toLowerCase() : '';
    const matchesKeyword = (b.invoiceNumber || '').toLowerCase().includes(keyword) || custName.includes(keyword);
    const matchesDate = date ? new Date(b.date).toISOString().slice(0, 10) === date : true;
    const matchesPayment = payment ? b.paymentMethod === payment : true;
    return matchesKeyword && matchesDate && matchesPayment;
  });
  renderTable(filtered);
}

async function deleteBill(id, invNum) {
  if (!confirm(`Authorized to void document ${invNum}? This will reverse asset allocation.`)) return;
  try {
    const res = await fetch(`/api/billing/${id}`, { method: 'DELETE', headers: makeHeaders(true) });
    if (!res.ok) throw new Error('Void failed');
    billsCache = billsCache.filter(b => String(b.id) !== String(id));
    renderTable(billsCache);
    showToast(`Document ${invNum} voided successfully.`);
  } catch (err) {
    console.error('deleteBill error', err);
    showToast('Failed to void document.', 'error');
  }
}