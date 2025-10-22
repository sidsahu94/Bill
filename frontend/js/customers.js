// frontend/js/customers.js
// Customers page with Authorization headers

function makeHeaders(json = true) {
  const token = localStorage.getItem('token');
  const headers = {};
  if (json) headers['Content-Type'] = 'application/json';
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
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
  document.getElementById('downloadJsonBtn')?.addEventListener('click', downloadJSONBackup);
  document.getElementById('importCsv')?.addEventListener('change', importCSVFile);
}

async function loadCustomers() {
  try {
    const res = await fetch('/api/customers', { headers: makeHeaders(false) });
    if (!res.ok) throw new Error('Load failed');
    customersCache = await res.json();
    renderCustomers(customersCache);
  } catch (err) { console.error(err); customersCache = []; }
}

function renderCustomers(list) {
  const tbody = document.querySelector('#customersTable tbody');
  if (!tbody) return;
  tbody.innerHTML = '';
  list.forEach(c => {
    tbody.insertAdjacentHTML('beforeend', `
      <tr>
        <td>${escapeHtml(c.name)}</td>
        <td>${escapeHtml(c.email)}</td>
        <td>${escapeHtml(c.contact)}</td>
        <td>${escapeHtml(c.address)}</td>
        <td>${escapeHtml(c.gstin)}</td>
        <td>
          <button class="btn btn-sm btn-outline-primary" onclick="editCustomer('${c.id}')">Edit</button>
          <button class="btn btn-sm btn-outline-danger" onclick="deleteCustomer('${c.id}')">Delete</button>
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
  if (!c) return alert('Customer not found');
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
      showToast('Customer updated');
    } else {
      const res = await fetch('/api/customers', { method: 'POST', headers: makeHeaders(true), body: JSON.stringify(payload) });
      if (!res.ok) throw new Error('Create failed');
      showToast('Customer added');
    }
    resetForm();
    await loadCustomers();
  } catch (err) { console.error(err); alert('Save failed'); }
}

async function deleteCustomer(id) {
  if (!confirm('Delete customer?')) return;
  try {
    const res = await fetch('/api/customers/' + id, { method: 'DELETE', headers: makeHeaders(true) });
    if (!res.ok) throw new Error('Delete failed');
    showToast('Customer deleted');
    await loadCustomers();
  } catch (err) { console.error(err); alert('Delete failed'); }
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
  const rows = [['name','email','contact','address','gstin']];
  customersCache.forEach(c => rows.push([c.name,c.email,c.contact,c.address,c.gstin]));
  const csv = rows.map(r => r.map(cell => `"${String(cell).replace(/"/g,'""')}"`).join(',')).join('\n');
  downloadFile(csv,'customers.csv','text/csv');
}

function downloadJSONBackup() {
  const blob = new Blob([JSON.stringify(customersCache,null,2)],{type:'application/json'});
  downloadFile(blob,'customers_backup.json');
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
    showToast(`Imported ${created} rows`);
    document.getElementById('importCsv').value = '';
    await loadCustomers();
  };
  reader.readAsText(file);
}

function downloadFile(content, filename, type) {
  const blob = content instanceof Blob ? content : new Blob([content],{type:type||'text/plain'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function escapeHtml(s){ return String(s||'').replace(/[&<"'>]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));}

function showToast(msg){
  const el=document.createElement('div');
  el.className='position-fixed bottom-0 end-0 m-3 p-2 bg-success text-white rounded';
  el.style.zIndex=9999; el.innerText=msg;
  document.body.appendChild(el);
  setTimeout(()=>el.remove(),2000);
}
