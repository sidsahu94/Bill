// frontend/js/customers.js
// Elite Directory Controller

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

let customersCache = [];

document.addEventListener('DOMContentLoaded', initCustomers);

async function initCustomers() {
  bindElements();
  await loadCustomers();
}

function bindElements() {
  document.getElementById('customerForm')?.addEventListener('submit', saveCustomer);
  document.getElementById('resetFormBtn')?.addEventListener('click', resetForm);
  document.getElementById('customerSearch')?.addEventListener('input', onSearch);
  document.getElementById('exportCsvBtn')?.addEventListener('click', exportCSV);
  document.getElementById('importCsv')?.addEventListener('change', importCSVFile);
}

async function loadCustomers() {
  try {
    const res = await fetch('/api/customers', { headers: makeHeaders(false) });
    if (!res.ok) {
        if(res.status === 401) return window.location.replace('/pages/login.html');
        throw new Error('Load failed');
    }
    customersCache = await res.json();
    renderCustomers(customersCache);
  } catch (err) { 
    console.error(err); customersCache = []; 
    document.querySelector('#customersTable tbody').innerHTML = `<tr><td colspan="5" class="text-center" style="color: var(--error); padding: 40px;">Directory synchronization failed.</td></tr>`;
  }
}

function renderCustomers(list) {
  const tbody = document.querySelector('#customersTable tbody');
  if (!tbody) return;
  tbody.innerHTML = '';

  if(list.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" class="text-center text-muted-custom py-5">No entities registered in directory.</td></tr>`;
      return;
  }

  list.forEach(c => {
    tbody.insertAdjacentHTML('beforeend', `
      <tr>
        <td data-label="Entity Name" class="text-white fw-bold">${escapeHtml(c.name)}</td>
        <td data-label="Contact" style="color: var(--text-secondary);">${escapeHtml(c.contact || '—')}</td>
        <td data-label="Email" style="color: var(--text-secondary);">${escapeHtml(c.email || '—')}</td>
        <td data-label="GSTIN" style="color: var(--gold-metallic); font-family: monospace;">${escapeHtml(c.gstin || '—')}</td>
        <td data-label="Protocol" class="text-end">
          <div class="d-flex gap-2 justify-content-end justify-content-md-start">
            <button class="saas-btn saas-btn-secondary" style="padding: 6px 12px; font-size: 0.75rem;" onclick="editCustomer('${c.id}')">Configure</button>
            <button class="saas-btn" style="padding: 6px 12px; font-size: 0.75rem; background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.3); color: #fca5a5;" onclick="deleteCustomer('${c.id}')">Drop</button>
          </div>
        </td>
      </tr>
    `);
  });
}

function resetForm() {
  document.getElementById('customerId').value = '';
  document.getElementById('customerForm').reset();
}

function editCustomer(id) {
  const c = customersCache.find(x => String(x.id) === String(id));
  if (!c) return showToast('Entity not found', 'error');
  document.getElementById('customerId').value = c.id;
  document.getElementById('name').value = c.name;
  document.getElementById('email').value = c.email;
  document.getElementById('contact').value = c.contact;
  document.getElementById('address').value = c.address;
  document.getElementById('gstin').value = c.gstin;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function saveCustomer(e) {
  e.preventDefault();
  const id = document.getElementById('customerId').value;
  const payload = {
    name: document.getElementById('name').value.trim(),
    email: document.getElementById('email').value.trim(),
    contact: document.getElementById('contact').value.trim(),
    address: document.getElementById('address').value.trim(),
    gstin: document.getElementById('gstin').value.trim()
  };
  try {
    if (id) {
      const res = await fetch('/api/customers/' + id, { method: 'PUT', headers: makeHeaders(true), body: JSON.stringify(payload) });
      if (!res.ok) throw new Error('Update failed');
      showToast('Entity details updated.');
    } else {
      const res = await fetch('/api/customers', { method: 'POST', headers: makeHeaders(true), body: JSON.stringify(payload) });
      if (!res.ok) throw new Error('Create failed');
      showToast('Entity registered to directory.');
    }
    resetForm();
    await loadCustomers();
  } catch (err) { console.error(err); showToast('Operation failed', 'error'); }
}

async function deleteCustomer(id) {
  if (!confirm('Authorized to drop entity from directory?')) return;
  try {
    const res = await fetch('/api/customers/' + id, { method: 'DELETE', headers: makeHeaders(true) });
    if (!res.ok) throw new Error('Delete failed');
    showToast('Entity dropped.');
    await loadCustomers();
  } catch (err) { console.error(err); showToast('Failed to drop entity.', 'error'); }
}

function onSearch(e) {
  const q = e.target.value.toLowerCase();
  if (!q) return renderCustomers(customersCache);
  renderCustomers(customersCache.filter(c =>
    (c.name || '').toLowerCase().includes(q) ||
    (c.email || '').toLowerCase().includes(q) ||
    (c.contact || '').toLowerCase().includes(q)
  ));
}

function exportCSV() {
  if(customersCache.length === 0) return showToast('No data to export', 'error');
  const rows = [['name','email','contact','address','gstin']];
  customersCache.forEach(c => rows.push([c.name,c.email,c.contact,c.address,c.gstin]));
  const csv = rows.map(r => r.map(cell => `"${String(cell).replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob([csv],{type:'text/csv'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = `Directory_Export_${new Date().toISOString().slice(0,10)}.csv`; a.click();
  URL.revokeObjectURL(url);
}

function importCSVFile(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async (ev) => {
    const text = ev.target.result;
    const lines = text.split(/\r?\n/);
    const header = lines.shift().split(',').map(h => h.trim().toLowerCase());
    let created = 0;
    for (const line of lines) {
      if (!line.trim()) continue;
      const cells = line.split(',');
      const payload = {};
      header.forEach((h,i)=>payload[h]=cells[i] ? cells[i].trim().replace(/^"|"$/g,'') : '');
      try {
        const res = await fetch('/api/customers',{ method:'POST', headers: makeHeaders(true), body: JSON.stringify(payload) });
        if (res.ok) created++;
      } catch(err){console.error(err);}
    }
    showToast(`Injected ${created} entities to directory.`, 'success');
    document.getElementById('importCsv').value = '';
    await loadCustomers();
  };
  reader.readAsText(file);
}

function escapeHtml(s){ return String(s||'').replace(/[&<"'>]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));}