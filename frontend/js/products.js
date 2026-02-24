// frontend/js/products.js
// Elite Assets Controller with Adaptive Mobile Layouts & Premium UX

let productsCache = [];

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

document.addEventListener('DOMContentLoaded', () => {
  init();
});

async function init() {
  bindElements();
  await loadProducts();
}

function bindElements() {
  document.getElementById('productForm')?.addEventListener('submit', handleSaveProduct);
  document.getElementById('resetFormBtn')?.addEventListener('click', resetForm);
  document.getElementById('productSearch')?.addEventListener('input', onSearch);
  document.getElementById('exportCsvBtn')?.addEventListener('click', exportCSV);
  document.getElementById('exportPdfBtn')?.addEventListener('click', exportPDF);
  document.getElementById('importCsv')?.addEventListener('change', importCSVFile);
}

// --- Data Fetching ---
async function loadProducts() {
  try {
    const res = await fetch('/api/products', { headers: makeHeaders(false) });
    if (!res.ok) {
      if(res.status === 401) { window.location = '/pages/login.html'; return; }
      throw new Error('Failed to load products');
    }
    productsCache = await res.json();
    renderProducts(productsCache);
    updateLowStockCount();
  } catch (err) { 
    console.error('Failed to load products', err); 
    productsCache = [];
    document.querySelector('#productsTable tbody').innerHTML = `<tr><td colspan="6" class="text-center" style="color: var(--error); padding: 40px;">Failed to synchronize asset registry.</td></tr>`;
  }
}

function renderProducts(list) {
  const tbody = document.querySelector('#productsTable tbody');
  if (!tbody) return;
  tbody.innerHTML = '';
  
  if(list.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted-custom py-5">No assets registered. Add one above.</td></tr>`;
      return;
  }

  list.forEach(p => {
    const isLowStock = p.stock <= (Number(p.lowStockThreshold ?? 10));
    const lowClass = isLowStock ? 'table-danger' : '';
    
    // Luxury Badge for low stock
    const stockBadge = isLowStock 
      ? `<span style="background: rgba(239, 68, 68, 0.1); color: #fca5a5; border: 1px solid rgba(239, 68, 68, 0.3); padding: 4px 8px; border-radius: 6px; font-size: 0.75rem; font-weight: bold;">${p.stock} (Critical)</span>` 
      : `<span style="color: var(--text-primary); font-weight: 500;">${p.stock}</span>`;

    tbody.insertAdjacentHTML('beforeend', `
      <tr class="${lowClass}">
        <td data-label="SKU" class="fw-bold" style="color: var(--text-secondary);">${escapeHtml(p.sku||'')}</td>
        <td data-label="Name" class="text-white fw-bold">${escapeHtml(p.name||'')}</td>
        <td data-label="Price (₹)" style="color: var(--gold-metallic); font-weight: 600;">₹${Number(p.price||0).toFixed(2)}</td>
        <td data-label="Stock">${stockBadge}</td>
        <td data-label="GST %" style="color: var(--text-secondary);">${Number(p.gst||0).toFixed(2)}%</td>
        <td data-label="Protocol" class="text-end">
          <div class="d-flex gap-2 justify-content-end justify-content-md-start">
            <button class="saas-btn saas-btn-secondary" style="padding: 6px 12px; font-size: 0.75rem;" onclick="editProduct('${p.id}')">Configure</button>
            <button class="saas-btn" style="padding: 6px 12px; font-size: 0.75rem; background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.3); color: #fca5a5;" onclick="deleteProduct('${p.id}')">Drop</button>
          </div>
        </td>
      </tr>
    `);
  });
}

// --- CRUD Operations ---
async function handleSaveProduct(e) {
  e.preventDefault();
  
  const submitBtn = document.getElementById('saveProductBtn');
  const originalText = submitBtn.innerText;
  
  const id = document.getElementById('productId').value;
  const name = document.getElementById('name').value.trim();
  const sku = document.getElementById('sku').value.trim();
  const price = parseFloat(document.getElementById('price').value) || 0;
  const stock = parseInt(document.getElementById('stock').value) || 0;
  const gst = parseFloat(document.getElementById('gst').value) || 0;
  const lowStockThreshold = parseInt(document.getElementById('lowStockThreshold').value) || 10;

  if (!id && productsCache.some(p => p.sku && p.sku.toLowerCase() === sku.toLowerCase())) {
    showToast('SKU conflict detected. Identifier must be unique.', 'error');
    document.getElementById('sku').focus();
    return;
  }

  const payload = { name, sku, price, stock, gst, lowStockThreshold };

  try {
    submitBtn.disabled = true;
    submitBtn.innerHTML = `<div class="saas-spinner" style="border-top-color: #000; width: 14px; height: 14px;"></div> <span class="ms-2">Processing...</span>`;

    const url = id ? `/api/products/${id}` : '/api/products';
    const method = id ? 'PUT' : 'POST';

    const res = await fetch(url, { 
      method, 
      headers: makeHeaders(true), 
      body: JSON.stringify(payload) 
    });

    if (!res.ok) throw new Error('Transaction failed on server');
    
    showToast(id ? 'Asset parameters updated successfully' : 'Asset provisioned successfully');
    resetForm();
    await loadProducts();
  } catch (err) {
    console.error(err);
    showToast('Failed to update asset registry.', 'error');
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerText = originalText;
  }
}

function resetForm() {
  document.getElementById('productId').value = '';
  document.getElementById('productForm').reset();
  document.getElementById('gst').value = 18; 
  document.getElementById('lowStockThreshold').value = 10;
  document.getElementById('saveProductBtn').innerText = 'Commit to Registry';
}

function editProduct(id) {
  const p = productsCache.find(x => String(x.id) === String(id));
  if (!p) return showToast('Asset not found in cache', 'error');
  
  document.getElementById('productId').value = p.id;
  document.getElementById('name').value = p.name;
  document.getElementById('sku').value = p.sku;
  document.getElementById('price').value = p.price;
  document.getElementById('stock').value = p.stock;
  document.getElementById('gst').value = p.gst;
  document.getElementById('lowStockThreshold').value = p.lowStockThreshold ?? 10;
  
  document.getElementById('saveProductBtn').innerText = 'Update Parameters';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function deleteProduct(id) {
  if (!confirm('Authorized to drop asset from registry? This action is immutable.')) return;
  
  try {
    const res = await fetch(`/api/products/${id}`, { method: 'DELETE', headers: makeHeaders(true) });
    if (!res.ok) throw new Error('Drop failed');
    
    showToast('Asset dropped from registry.');
    productsCache = productsCache.filter(p => String(p.id) !== String(id));
    renderProducts(productsCache);
    updateLowStockCount();
  } catch (err) {
    console.error(err);
    showToast('Failed to drop asset. Integrity lock may be active.', 'error');
  }
}

function onSearch(e) {
  const q = e.target.value.trim().toLowerCase();
  if (!q) {
    renderProducts(productsCache);
    return;
  }
  const filtered = productsCache.filter(p => 
    (p.name || '').toLowerCase().includes(q) || 
    (p.sku || '').toLowerCase().includes(q)
  );
  renderProducts(filtered);
}

function updateLowStockCount() {
  const count = productsCache.reduce((acc, p) => acc + ((p.stock <= (Number(p.lowStockThreshold ?? 10))) ? 1 : 0), 0);
  const badge = document.getElementById('lowStockCount');
  if (badge) {
    badge.innerText = `${count} Critical Status`;
    if(count === 0) { 
      badge.style.background = 'rgba(16, 185, 129, 0.1)'; 
      badge.style.color = 'var(--emerald-hwb)'; 
      badge.style.borderColor = 'rgba(16, 185, 129, 0.3)'; 
    } else { 
      badge.style.background = 'rgba(239, 68, 68, 0.2)'; 
      badge.style.color = '#fca5a5'; 
      badge.style.borderColor = 'rgba(239, 68, 68, 0.4)'; 
    }
  }
}

// --- Import / Export Ecosystem ---
function exportCSV() {
  if(productsCache.length === 0) return showToast('No assets to export.', 'error');
  const rows = [['Name', 'SKU', 'Price', 'Stock', 'GST', 'LowStockThreshold']];
  productsCache.forEach(p => rows.push([p.name || '', p.sku || '', p.price || 0, p.stock || 0, p.gst || 0, p.lowStockThreshold || 10]));
  
  const csv = rows.map(r => r.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
  triggerDownload(new Blob([csv], { type: 'text/csv' }), `Asset_Registry_${new Date().toISOString().slice(0,10)}.csv`);
}

async function exportPDF() {
  try {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text('Asset Registry Snapshot', 14, 20);
    
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Generated on: ${new Date().toLocaleString()}`, 14, 28);
    
    let y = 40, lineHeight = 8;
    doc.setFontSize(11);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(0);
    doc.text('SKU        | Asset Name                     | Price   | Stock | Tax %', 14, y); 
    y += lineHeight;
    
    doc.setFont(undefined, 'normal');
    doc.setFontSize(10);
    for (let p of productsCache) {
      const shortName = (p.name || '').substring(0, 20).padEnd(20, ' ');
      const skuStr = (p.sku || '').substring(0, 10).padEnd(10, ' ');
      doc.text(`${skuStr} | ${shortName} | ${Number(p.price||0).toFixed(2).padStart(7,' ')} | ${String(p.stock||0).padStart(5,' ')} | ${p.gst||0}%`, 14, y);
      y += lineHeight;
      if (y > 275) { doc.addPage(); y = 20; }
    }
    doc.save(`Asset_Registry_${new Date().toISOString().slice(0,10)}.pdf`);
    showToast('PDF Document generated.', 'success');
  } catch (err) {
    console.error(err); 
    showToast('PDF Engine failure.', 'error');
  }
}

function importCSVFile(e) {
  const file = e.target.files[0];
  if (!file) return;
  
  const reader = new FileReader();
  reader.onload = async function(ev) {
    const text = ev.target.result;
    const rows = parseCSV(text);
    if(rows.length < 2) return showToast('Invalid or empty CSV configuration.', 'error');

    const header = rows.shift().map(h => h.toLowerCase().trim());
    let successCount = 0;

    for (const row of rows) {
      if (row.length < 2) continue;
      const obj = {};
      for (let i = 0; i < header.length; i++) obj[header[i]] = row[i];
      
      const payload = {
        name: (obj.name || '').trim(),
        sku: (obj.sku || '').trim(),
        price: parseFloat(obj.price || 0) || 0,
        stock: parseInt(obj.stock || 0) || 0,
        gst: parseFloat(obj.gst || 0) || 0,
        lowStockThreshold: parseInt(obj.lowstockthreshold || obj.lowStockThreshold || 10) || 10
      };
      
      if(!payload.sku || !payload.name) continue; 

      try {
        const res = await fetch('/api/products', { method: 'POST', headers: makeHeaders(true), body: JSON.stringify(payload) });
        if (res.ok) successCount++;
      } catch (err) { console.error('Import error', err); }
    }
    
    document.getElementById('importCsv').value = '';
    showToast(`${successCount} assets successfully injected.`, 'success');
    await loadProducts();
  };
  reader.readAsText(file);
}

function parseCSV(text) {
  const rows = []; const lines = text.split(/\r?\n/);
  for (let line of lines) {
    if (!line.trim()) continue;
    const cols = []; let cur = '', inQuote = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"' && line[i+1] === '"') { cur += '"'; i++; continue; }
      if (ch === '"') { inQuote = !inQuote; continue; }
      if (ch === ',' && !inQuote) { cols.push(cur); cur = ''; continue; }
      cur += ch;
    }
    cols.push(cur);
    rows.push(cols);
  }
  return rows;
}

function escapeHtml(unsafe) { 
  return String(unsafe || '').replace(/[&<"'>]/g, function(m) { 
    return ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'}[m]);
  });
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); 
  a.href = url; 
  a.download = filename; 
  a.click();
  URL.revokeObjectURL(url);
}