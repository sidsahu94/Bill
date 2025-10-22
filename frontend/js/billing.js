// frontend/js/billing.js
// Billing UI + API calls (includes Authorization header for protected endpoints)

let productsCache = [];
let customersCache = [];
let invoiceItems = [];
let currentInvoiceNumber = '';

function makeHeaders(json = true) {
  const token = localStorage.getItem('token');
  const headers = {};
  if (json) headers['Content-Type'] = 'application/json';
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

document.addEventListener('DOMContentLoaded', initBilling);

async function initBilling() {
  await loadProducts();
  await loadCustomers();
  generateInvoiceNumber();
  bindEvents();
  renderInvoiceTable();
}

async function loadProducts() {
  try {
    const res = await fetch('/api/products', { headers: makeHeaders(false) });
    if (!res.ok) throw new Error('Failed to load products');
    productsCache = await res.json();
  } catch (err) {
    console.error('loadProducts error', err);
    productsCache = [];
  }
}

async function loadCustomers() {
  try {
    const res = await fetch('/api/customers', { headers: makeHeaders(false) });
    if (!res.ok) throw new Error('Failed to load customers');
    customersCache = await res.json();
    const customerSelect = document.getElementById('customerSelect');
    if (!customerSelect) return;
    customerSelect.innerHTML = '<option value="">Select Customer</option>';
    customersCache.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = c.name || c.email || (`Customer ${c.id}`);
      customerSelect.appendChild(opt);
    });

    customerSelect.addEventListener('change', e => {
      const selected = customersCache.find(c => String(c.id) === String(e.target.value));
      if (selected) {
        document.getElementById('customerGST').value = selected.gstin || '';
        document.getElementById('customerAddress').value = selected.address || '';
      } else {
        document.getElementById('customerGST').value = '';
        document.getElementById('customerAddress').value = '';
      }
    });
  } catch (err) {
    console.error('loadCustomers error', err);
    customersCache = [];
  }
}

function bindEvents() {
  const el = id => document.getElementById(id);
  el('addProductBtn')?.addEventListener('click', addProduct);
  el('discount')?.addEventListener('input', renderInvoiceTable);
  el('saveInvoiceBtn')?.addEventListener('click', saveInvoice);
  el('printInvoiceBtn')?.addEventListener('click', printInvoice);
  el('downloadPdfBtn')?.addEventListener('click', downloadPdf);
  el('shareBtn')?.addEventListener('click', shareInvoice);
}

function generateInvoiceNumber() {
  const timestamp = Date.now();
  currentInvoiceNumber = 'INV-' + timestamp.toString();
  const el = document.getElementById('invoiceNumber');
  if (el) el.value = currentInvoiceNumber;
}

function addProduct() {
  invoiceItems.push({ productId: '', name: '', price: 0, stock: 0, gst: 0, qty: 1 });
  renderInvoiceTable();
}

function renderInvoiceTable() {
  const tbody = document.querySelector('#invoiceTable tbody');
  if (!tbody) return;
  tbody.innerHTML = '';

  invoiceItems.forEach((item, idx) => {
    const tr = document.createElement('tr');

    const productSelect = document.createElement('select');
    productSelect.classList.add('form-select', 'form-select-sm');
    productSelect.innerHTML = '<option value="">Select Product</option>';
    productsCache.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = `${p.sku || ''} / ${p.name || ''}`;
      if (String(p.id) === String(item.productId)) opt.selected = true;
      productSelect.appendChild(opt);
    });
    productSelect.addEventListener('change', e => {
      const selected = productsCache.find(p => String(p.id) === String(e.target.value));
      if (selected) {
        invoiceItems[idx].productId = selected.id;
        invoiceItems[idx].name = selected.name;
        invoiceItems[idx].price = Number(selected.price) || 0;
        invoiceItems[idx].stock = Number(selected.stock) || 0;
        invoiceItems[idx].gst = Number(selected.gst) || 0;
      } else {
        invoiceItems[idx] = { productId: '', name: '', price: 0, stock: 0, gst: 0, qty: 1 };
      }
      renderInvoiceTable();
    });

    const priceTd = document.createElement('td'); priceTd.textContent = (item.price || 0).toFixed(2);
    const stockTd = document.createElement('td'); stockTd.textContent = item.stock || 0;
    const gstTd = document.createElement('td'); gstTd.textContent = item.gst || 0;

    const qtyInput = document.createElement('input');
    qtyInput.type = 'number'; qtyInput.min = 1; qtyInput.value = item.qty || 1;
    qtyInput.classList.add('form-control', 'form-control-sm');
    qtyInput.addEventListener('input', e => {
      invoiceItems[idx].qty = parseInt(e.target.value) || 1;
      renderInvoiceTable();
    });

    const subtotal = (item.price || 0) * (item.qty || 0);
    const subtotalTd = document.createElement('td'); subtotalTd.textContent = subtotal.toFixed(2);

    const totalWithGst = subtotal + (subtotal * (item.gst || 0) / 100);
    const totalTd = document.createElement('td'); totalTd.textContent = totalWithGst.toFixed(2);

    const actionBtn = document.createElement('button');
    actionBtn.classList.add('btn', 'btn-sm', 'btn-danger');
    actionBtn.textContent = '❌';
    actionBtn.addEventListener('click', () => { invoiceItems.splice(idx, 1); renderInvoiceTable(); });

    tr.appendChild(createTdWithContent(productSelect));
    tr.appendChild(priceTd);
    tr.appendChild(stockTd);
    tr.appendChild(gstTd);
    tr.appendChild(createTdWithContent(qtyInput));
    tr.appendChild(subtotalTd);
    tr.appendChild(totalTd);
    tr.appendChild(createTdWithContent(actionBtn));

    tbody.appendChild(tr);
  });

  let total = 0;
  invoiceItems.forEach(i => total += (i.price || 0) * (i.qty || 0) * (1 + (i.gst || 0) / 100));
  const discount = parseFloat(document.getElementById('discount')?.value) || 0;
  if (discount > 0) total = total - discount;
  const totalEl = document.getElementById('totalAmount');
  if (totalEl) totalEl.value = Number(total || 0).toFixed(2);
}

function createTdWithContent(content) {
  const td = document.createElement('td');
  if (content instanceof HTMLElement) td.appendChild(content);
  else td.textContent = content;
  return td;
}

async function saveInvoice() {
  if (invoiceItems.length === 0) return alert('Add products first');
  const invoiceData = {
    invoiceNumber: currentInvoiceNumber,
    customerId: document.getElementById('customerSelect')?.value || null,
    discount: parseFloat(document.getElementById('discount')?.value) || 0,
    paymentMethod: document.getElementById('paymentMethod')?.value || 'Cash',
    totalAmount: parseFloat(document.getElementById('totalAmount')?.value) || 0,
    items: invoiceItems.map(i => ({ productId: i.productId, qty: i.qty, price: i.price, gst: i.gst }))
  };

  try {
    const res = await fetch('/api/billing/create', {
      method: 'POST',
      headers: makeHeaders(true),
      body: JSON.stringify(invoiceData)
    });
    const body = await res.json().catch(()=>({message:'Unknown'}));
    if (!res.ok) return alert(body.message || 'Save failed');
    alert('Invoice saved!');
    window.dispatchEvent(new CustomEvent('invoicesUpdated', { detail: body }));
    generateInvoiceNumber();
    invoiceItems = [];
    renderInvoiceTable();
  } catch (err) {
    console.error('saveInvoice error', err);
    alert('Save failed');
  }
}

function printInvoice() {
  const win = window.open('', '_blank');
  if (!win) return alert('Popup blocked');
  const html = `
    <html><head><title>Invoice</title>
      <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css" rel="stylesheet">
    </head>
    <body class="p-4">
      <h3>Invoice: ${currentInvoiceNumber}</h3>
      ${document.getElementById('invoiceTable')?.outerHTML || ''}
      <p>Total: ₹${document.getElementById('totalAmount')?.value || '0.00'}</p>
    </body></html>`;
  win.document.write(html);
  win.document.close();
  win.print();
}

async function downloadPdf() {
  try {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    doc.text(`Invoice #${currentInvoiceNumber}`, 10, 10);
    let y = 20;
    invoiceItems.forEach(item => {
      doc.text(`${item.name} x ${item.qty} = ₹${(item.price * item.qty * (1 + (item.gst || 0) / 100)).toFixed(2)}`, 10, y);
      y += 7;
    });
    doc.text(`Total: ₹${document.getElementById('totalAmount')?.value || '0.00'}`, 10, y + 7);
    doc.save(`${currentInvoiceNumber}.pdf`);
  } catch (err) {
    console.error('downloadPdf error', err);
    alert('Failed to create PDF');
  }
}

function shareInvoice() {
  const text = `Invoice #${currentInvoiceNumber}\nTotal: ₹${document.getElementById('totalAmount')?.value || '0.00'}`;
  navigator.clipboard.writeText(text)
    .then(() => alert('Invoice details copied to clipboard'))
    .catch(err => console.error(err));
}
