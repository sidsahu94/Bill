// frontend/js/billing.js

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

document.addEventListener('DOMContentLoaded', async () => {
  renderSkeleton();
  await Promise.all([loadProducts(), loadCustomers()]);
  generateInvoiceNumber();
  bindEvents();
  
  // Initialize with one empty row
  if(invoiceItems.length === 0) addProduct();
});

function renderSkeleton() {
  const tbody = document.getElementById('invoiceTbody');
  if (!tbody) return;
  tbody.innerHTML = `
    <tr>
      <td data-label="Product"><div class="skeleton skeleton-text"></div></td>
      <td data-label="Price"><div class="skeleton skeleton-text"></div></td>
      <td data-label="GST %"><div class="skeleton skeleton-text"></div></td>
      <td data-label="Qty"><div class="skeleton skeleton-text"></div></td>
      <td data-label="Subtotal"><div class="skeleton skeleton-text"></div></td>
      <td data-label="Total"><div class="skeleton skeleton-text"></div></td>
      <td data-label="Action"><div class="skeleton skeleton-btn"></div></td>
    </tr>
  `;
}

async function loadProducts() {
  try {
    const res = await fetch('/api/products', { headers: makeHeaders(false) });
    if (!res.ok) throw new Error('Failed to load products');
    productsCache = await res.json();
  } catch (err) { 
    console.error(err);
    productsCache = []; 
  }
}

async function loadCustomers() {
  try {
    const res = await fetch('/api/customers', { headers: makeHeaders(false) });
    if (!res.ok) throw new Error('Failed to load customers');
    customersCache = await res.json();
    
    const select = document.getElementById('customerSelect');
    if (!select) return;
    
    select.innerHTML = '<option value="">Walk-in / General Customer</option>';
    customersCache.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = `${c.name} (${c.contact || c.email || 'N/A'})`;
      select.appendChild(opt);
    });

    select.addEventListener('change', e => {
      const selected = customersCache.find(c => String(c.id) === String(e.target.value));
      document.getElementById('customerGST').value = selected?.gstin || '';
      document.getElementById('customerAddress').value = selected?.address || '';
    });
  } catch (err) { 
    console.error(err);
    customersCache = []; 
  }
}

function bindEvents() {
  document.getElementById('addProductBtn')?.addEventListener('click', addProduct);
  document.getElementById('discount')?.addEventListener('input', renderInvoiceTable);
  document.getElementById('discountType')?.addEventListener('change', renderInvoiceTable);
  document.getElementById('saveInvoiceBtn')?.addEventListener('click', saveInvoice);
  
  // PDF Engine Hook
  document.getElementById('printInvoiceBtn')?.addEventListener('click', async () => {
    if (invoiceItems.length === 0 || !invoiceItems[0].productId) return alert('Invoice is empty.');
    const data = getCompiledInvoiceData();
    if (window.generateProfessionalPDF) {
      await window.generateProfessionalPDF(data, 'print');
    } else {
      alert('PDF Engine is still loading or missing. Please ensure pdfEngine.js is linked.');
    }
  });
}

function generateInvoiceNumber() {
  const timestamp = Date.now().toString().slice(-6);
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  currentInvoiceNumber = `INV-${dateStr}-${timestamp}`;
  const display = document.getElementById('invoiceNumberDisplay');
  if (display) display.textContent = currentInvoiceNumber;
}

function addProduct() {
  invoiceItems.push({ productId: '', name: '', price: 0, stock: 0, gst: 0, qty: 1 });
  renderInvoiceTable();
}

function renderInvoiceTable() {
  const tbody = document.getElementById('invoiceTbody');
  if (!tbody) return;
  tbody.innerHTML = '';

  let grandTotal = 0;

  invoiceItems.forEach((item, idx) => {
    const tr = document.createElement('tr');

    // Product Select
    const productSelect = document.createElement('select');
    productSelect.className = 'form-select form-select-sm';
    productSelect.innerHTML = '<option value="">Search product...</option>';
    
    productsCache.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = `${p.name} [Stock: ${p.stock}]`;
      if (String(p.id) === String(item.productId)) opt.selected = true;
      if (p.stock <= 0 && String(p.id) !== String(item.productId)) opt.disabled = true;
      productSelect.appendChild(opt);
    });

    productSelect.addEventListener('change', e => {
      const selected = productsCache.find(p => String(p.id) === String(e.target.value));
      if (selected) {
        invoiceItems[idx] = { 
          ...invoiceItems[idx], 
          productId: selected.id, 
          name: selected.name, 
          price: Number(selected.price), 
          stock: Number(selected.stock), 
          gst: Number(selected.gst) 
        };
      } else {
        invoiceItems[idx] = { productId: '', name: '', price: 0, stock: 0, gst: 0, qty: 1 };
      }
      renderInvoiceTable();
    });

    // Calculations (Strict financial precision logic)
    const subtotal = item.price * item.qty;
    const gstAmount = subtotal * (item.gst / 100);
    const totalWithGst = subtotal + gstAmount;
    grandTotal += totalWithGst;

    // Quantity Input with Stock Bounds Protection
    const qtyInput = document.createElement('input');
    qtyInput.type = 'number'; 
    qtyInput.min = 1; 
    qtyInput.max = item.stock || 999;
    qtyInput.value = item.qty;
    qtyInput.className = 'form-control form-control-sm text-center';
    
    qtyInput.addEventListener('input', e => {
      let val = parseInt(e.target.value) || 1;
      if (item.stock > 0 && val > item.stock) {
        val = item.stock; 
        alert(`Only ${item.stock} units available in stock.`);
      }
      invoiceItems[idx].qty = val;
      renderInvoiceTable();
    });

    // Delete Button
    const delBtn = document.createElement('button');
    delBtn.className = 'btn btn-sm btn-outline-danger w-100';
    delBtn.textContent = 'Remove';
    delBtn.onclick = () => { invoiceItems.splice(idx, 1); renderInvoiceTable(); };

    // Append cells using the mobile-responsive helper
    tr.appendChild(createCell(productSelect, 'Product'));
    tr.appendChild(createCell(`₹${item.price.toFixed(2)}`, 'Price'));
    tr.appendChild(createCell(`${item.gst}%`, 'GST %'));
    tr.appendChild(createCell(qtyInput, 'Qty'));
    tr.appendChild(createCell(`₹${subtotal.toFixed(2)}`, 'Subtotal'));
    tr.appendChild(createCell(`₹${totalWithGst.toFixed(2)}`, 'Total', 'fw-bold text-primary'));
    tr.appendChild(createCell(delBtn, 'Action'));

    tbody.appendChild(tr);
  });

  // Calculate Strict Discount based on explicit type
  const discountInput = parseFloat(document.getElementById('discount')?.value) || 0;
  const discountType = document.getElementById('discountType')?.value || 'flat';

  if (discountInput > 0) {
    if (discountType === 'percentage') {
      if (discountInput > 100) {
         alert('Percentage discount cannot exceed 100%');
         document.getElementById('discount').value = 100;
         grandTotal = 0;
      } else {
         grandTotal = grandTotal - (grandTotal * (discountInput / 100));
      }
    } else { // flat
      if (discountInput > grandTotal) {
         alert('Flat discount cannot exceed the total bill amount.');
         document.getElementById('discount').value = grandTotal.toFixed(2);
         grandTotal = 0;
      } else {
         grandTotal = grandTotal - discountInput;
      }
    }
  }

  // Update Display
  grandTotal = Math.max(0, grandTotal);
  if (document.getElementById('totalAmount')) {
    document.getElementById('totalAmount').value = grandTotal;
  }
  if (document.getElementById('totalAmountDisplay')) {
    document.getElementById('totalAmountDisplay').textContent = `₹${grandTotal.toFixed(2)}`;
  }
}

// Helper to inject data-label for mobile card views
function createCell(content, label, customClass = '') {
  const td = document.createElement('td');
  td.setAttribute('data-label', label);
  if(customClass) td.className = customClass;
  if (content instanceof HTMLElement) {
    td.appendChild(content);
  } else {
    td.textContent = content;
  }
  return td;
}

// Gathers current UI state into an object identical to what the DB returns
// so the PDF engine can process it accurately before saving.
function getCompiledInvoiceData() {
  const custId = document.getElementById('customerSelect')?.value;
  const customer = customersCache.find(c => String(c.id) === String(custId)) || null;
  
  return {
    invoiceNumber: currentInvoiceNumber,
    date: new Date().toISOString(),
    customer: customer,
    paymentMethod: document.getElementById('paymentMethod')?.value || 'Cash',
    discount: parseFloat(document.getElementById('discount')?.value) || 0,
    totalAmount: parseFloat(document.getElementById('totalAmount')?.value) || 0,
    items: invoiceItems 
  };
}

async function saveInvoice() {
  const btn = document.getElementById('saveInvoiceBtn');
  if (invoiceItems.length === 0 || !invoiceItems[0].productId) {
    return alert('Please add valid products to the invoice.');
  }
  
  // Optimistic UX feedback
  btn.disabled = true;
  btn.innerHTML = `<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Processing...`;

  const payload = {
    invoiceNumber: currentInvoiceNumber,
    customerId: document.getElementById('customerSelect').value || null,
    discount: parseFloat(document.getElementById('discount').value) || 0,
    discountType: document.getElementById('discountType').value || 'flat',
    paymentMethod: document.getElementById('paymentMethod').value || 'Cash',
    date: new Date().toISOString(),
    items: invoiceItems.map(i => ({ productId: i.productId, qty: i.qty })) // Send only ID and Qty to prevent price manipulation
  };

  try {
    const res = await fetch('/api/billing/create', { 
      method: 'POST', 
      headers: makeHeaders(true), 
      body: JSON.stringify(payload) 
    });
    const data = await res.json();
    
    if (!res.ok) throw new Error(data.message || 'Transaction Failed');
    
    alert('Invoice saved successfully! Stock has been updated.');
    
    // Reset Engine
    invoiceItems = [];
    document.getElementById('discount').value = '';
    generateInvoiceNumber();
    await loadProducts(); // Refresh stock immediately
    addProduct();
    
  } catch (err) {
    alert(`Error: ${err.message}`);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Confirm & Save';
  }
}