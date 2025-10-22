// frontend/js/products.js
// Products page — all protected requests include Authorization header

function makeHeaders(json = true) {
  const token = localStorage.getItem('token');
  const headers = {};
  if (json) headers['Content-Type'] = 'application/json';
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

document.addEventListener('DOMContentLoaded', () => { init(); });

let productsCache = [];

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
  document.getElementById('downloadJsonBtn')?.addEventListener('click', downloadJSONBackup);
  document.getElementById('importCsv')?.addEventListener('change', importCSVFile);
}

async function loadProducts() {
  try {
    const res = await fetch('/api/products', { headers: makeHeaders(false) });
    if (!res.ok) throw new Error('Failed to load products');
    productsCache = await res.json();
    renderProducts(productsCache);
    updateLowStockCount();
  } catch (err) { console.error('Failed to load products', err); productsCache = []; }
}

function renderProducts(list) {
  const tbody = document.querySelector('#productsTable tbody');
  if (!tbody) return;
  tbody.innerHTML = '';
  list.forEach(p => {
    const lowClass = (p.stock <= (Number(p.lowStockThreshold ?? 10))) ? 'table-danger' : '';
    tbody.insertAdjacentHTML('beforeend', `
      <tr class="${lowClass}">
        <td>${escapeHtml(p.sku||'')}</td>
        <td>${escapeHtml(p.name||'')}</td>
        <td>${Number(p.price||0).toFixed(2)}</td>
        <td>${Number(p.stock||0)}</td>
        <td>${Number(p.gst||0).toFixed(2)}</td>
        <td>
          <button class="btn btn-sm btn-outline-primary" onclick="editProduct('${p.id}')">Edit</button>
          <button class="btn btn-sm btn-outline-danger" onclick="deleteProduct('${p.id}')">Delete</button>
        </td>
      </tr>
    `);
  });
}

async function handleSaveProduct(e) {
  e.preventDefault();
  const id = document.getElementById('productId').value;
  const name = document.getElementById('name').value.trim();
  const sku = document.getElementById('sku').value.trim();
  const price = parseFloat(document.getElementById('price').value) || 0;
  const stock = parseInt(document.getElementById('stock').value) || 0;
  const gst = parseFloat(document.getElementById('gst').value) || 0;
  const lowStockThreshold = parseInt(document.getElementById('lowStockThreshold').value) || 10;

  if (!id && productsCache.some(p => p.sku && p.sku.toLowerCase() === sku.toLowerCase())) {
    alert('SKU already exists. Choose a different SKU.');
    return;
  }

  const payload = { name, sku, price, stock, gst, lowStockThreshold };

  try {
    if (id) {
      const res = await fetch('/api/products/' + id, { method: 'PUT', headers: makeHeaders(true), body: JSON.stringify(payload) });
      if (!res.ok) throw new Error('Update failed');
      showToast('Product updated');
    } else {
      const res = await fetch('/api/products', { method: 'POST', headers: makeHeaders(true), body: JSON.stringify(payload) });
      if (!res.ok) throw new Error('Create failed');
      showToast('Product added');
    }
    resetForm();
    await loadProducts();
  } catch (err) {
    console.error(err);
    alert('Failed to save product');
  }
}

function resetForm() {
  document.getElementById('productId').value = '';
  document.getElementById('productForm').reset();
  document.getElementById('gst').value = 18;
  document.getElementById('lowStockThreshold').value = 10;
}

function editProduct(id) {
  const p = productsCache.find(x => String(x.id) === String(id));
  if (!p) return alert('Product not found');
  document.getElementById('productId').value = p.id;
  document.getElementById('name').value = p.name;
  document.getElementById('sku').value = p.sku;
  document.getElementById('price').value = p.price;
  document.getElementById('stock').value = p.stock;
  document.getElementById('gst').value = p.gst;
  document.getElementById('lowStockThreshold').value = p.lowStockThreshold ?? 10;
  window.scrollTo({top:0, behavior:'smooth'});
}

async function deleteProduct(id) {
  if (!confirm('Delete product?')) return;
  try {
    const res = await fetch('/api/products/' + id, { method: 'DELETE', headers: makeHeaders(true) });
    if (!res.ok) throw new Error('Delete failed');
    showToast('Product deleted');
    await loadProducts();
  } catch (err) {
    console.error(err);
    alert('Delete failed');
  }
}

function onSearch(e) {
  const q = e.target.value.trim().toLowerCase();
  if (!q) return renderProducts(productsCache);
  const filtered = productsCache.filter(p => (p.name||'').toLowerCase().includes(q) || (p.sku||'').toLowerCase().includes(q));
  renderProducts(filtered);
}

function exportCSV(){
  const rows = [['name','sku','price','stock','gst','lowStockThreshold']];
  productsCache.forEach(p => rows.push([p.name||'', p.sku||'', p.price||0, p.stock||0, p.gst||0, p.lowStockThreshold||10]));
  const csv = rows.map(r => r.map(cell => `"${String(cell).replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], {type:'text/csv'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = `products_${new Date().toISOString().slice(0,10)}.csv`; a.click();
  URL.revokeObjectURL(url);
}

function downloadJSONBackup(){
  const blob = new Blob([JSON.stringify(productsCache, null, 2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = `products_backup_${new Date().toISOString().slice(0,10)}.json`; a.click();
  URL.revokeObjectURL(url);
}

async function exportPDF(){
  try{
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    doc.text('Products List', 14, 20);
    let y = 28, lineHeight = 7;
    doc.setFont(undefined, 'bold');
    doc.text('SKU  |  Name  |  Price  |  Stock  | GST%', 14, y); y+=lineHeight;
    doc.setFont(undefined, 'normal');
    for (let p of productsCache) {
      doc.text(`${p.sku}  |  ${p.name}  |  ${Number(p.price||0).toFixed(2)}  |  ${p.stock||0}  |  ${p.gst||0}`, 14, y);
      y += lineHeight;
      if (y > 275) { doc.addPage(); y = 20; }
    }
    doc.save(`products_${new Date().toISOString().slice(0,10)}.pdf`);
  }catch(err){console.error(err); alert('Export PDF failed');}
}

function importCSVFile(e){
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async function(ev) {
    const text = ev.target.result;
    const rows = parseCSV(text);
    const header = rows.shift().map(h => h.toLowerCase().trim());
    const created = [];
    for (const row of rows) {
      if (row.length < 2) continue;
      const obj = {};
      for (let i=0;i<header.length;i++) obj[header[i]] = row[i];
      const payload = {
        name: (obj.name||'').trim(),
        sku: (obj.sku||'').trim(),
        price: parseFloat(obj.price||0) || 0,
        stock: parseInt(obj.stock||0) || 0,
        gst: parseFloat(obj.gst||0) || 0,
        lowStockThreshold: parseInt(obj.lowstockthreshold||obj.lowStockThreshold||10) || 10
      };
      try {
        const res = await fetch('/api/products', { method:'POST', headers: makeHeaders(true), body: JSON.stringify(payload) });
        if (res.ok) created.push(payload);
      } catch (err) { console.error('Import error', err); }
    }
    alert(`Imported ${created.length} products`);
    document.getElementById('importCsv').value = '';
    await loadProducts();
  };
  reader.readAsText(file);
}

function parseCSV(text){
  const rows = []; const lines = text.split(/\r?\n/);
  for (let line of lines) {
    if (!line.trim()) continue;
    const cols = []; let cur = '', inQuote = false;
    for (let i=0;i<line.length;i++){
      const ch = line[i];
      if (ch === '"' && line[i+1] === '"') { cur += '"'; i++; continue; }
      if (ch === '"') { inQuote = !inQuote; continue; }
      if (ch === ',' && !inQuote) { cols.push(cur); cur=''; continue; }
      cur += ch;
    }
    cols.push(cur);
    rows.push(cols);
  }
  return rows;
}

function updateLowStockCount(){
  const count = productsCache.reduce((acc,p)=> acc + ((p.stock <= (Number(p.lowStockThreshold ?? 10))) ? 1:0), 0);
  document.getElementById('lowStockCount') && (document.getElementById('lowStockCount').innerText = `${count} low stock`);
}

function escapeHtml(unsafe){ return String(unsafe || '').replace(/[&<"'>]/g, function(m){ return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]);});}

function showToast(msg){ const el=document.createElement('div'); el.className='position-fixed bottom-0 end-0 m-3 p-2 bg-success text-white rounded'; el.style.zIndex=9999; el.innerText=msg; document.body.appendChild(el); setTimeout(()=>el.remove(),2000); }
