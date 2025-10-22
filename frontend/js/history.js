// frontend/js/history.js
// History page: GET/DELETE use Authorization header

function makeHeaders(json = true) {
  const token = localStorage.getItem('token');
  const headers = {};
  if (json) headers['Content-Type'] = 'application/json';
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

let billsCache = [];

document.addEventListener('DOMContentLoaded', loadBills);

async function loadBills() {
  try {
    const res = await fetch('/api/billing', { headers: makeHeaders(false) });
    if (!res.ok) throw new Error('Failed to load bills');
    billsCache = await res.json();
    renderTable(billsCache);

    document.getElementById('searchInvoice')?.addEventListener('input', filterBills);
    document.getElementById('filterDate')?.addEventListener('change', filterBills);
    document.getElementById('filterPayment')?.addEventListener('change', filterBills);
  } catch (err) {
    console.error('loadBills error', err);
    billsCache = [];
  }
}

function renderTable(data) {
  const tbody = document.querySelector('#billsTable tbody');
  if (!tbody) return;
  tbody.innerHTML = '';
  data.forEach(bill => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${bill.invoiceNumber}</td>
      <td>${bill.customer?.name || 'N/A'}</td>
      <td>${new Date(bill.date).toLocaleDateString()}</td>
      <td>${bill.paymentMethod || ''}</td>
      <td>₹${(bill.totalAmount || bill.total || 0).toFixed(2)}</td>
      <td>
        <button class="btn btn-sm btn-primary viewBtn">View</button>
        <button class="btn btn-sm btn-danger deleteBtn">Delete</button>
      </td>
    `;
    tbody.appendChild(tr);

    tr.querySelector('.viewBtn')?.addEventListener('click', () => viewBill(bill));
    tr.querySelector('.deleteBtn')?.addEventListener('click', () => deleteBill(bill.id));
  });
}

function filterBills() {
  const keyword = (document.getElementById('searchInvoice')?.value || '').toLowerCase();
  const date = document.getElementById('filterDate')?.value;
  const payment = document.getElementById('filterPayment')?.value;

  const filtered = billsCache.filter(b => {
    const matchesKeyword = (b.invoiceNumber || '').toLowerCase().includes(keyword) ||
      ((b.customer?.name || '').toLowerCase().includes(keyword));
    const matchesDate = date ? new Date(b.date).toISOString().slice(0, 10) === date : true;
    const matchesPayment = payment ? b.paymentMethod === payment : true;
    return matchesKeyword && matchesDate && matchesPayment;
  });
  renderTable(filtered);
}

function viewBill(bill) {
  try {
    const doc = new jspdf.jsPDF();
    doc.setFontSize(16);
    doc.text(`Invoice: ${bill.invoiceNumber}`, 10, 20);
    doc.setFontSize(12);
    doc.text(`Customer: ${bill.customer?.name || ''}`, 10, 30);
    doc.text(`Date: ${new Date(bill.date).toLocaleDateString()}`, 10, 40);
    doc.text(`Payment: ${bill.paymentMethod || ''}`, 10, 50);
    doc.text(`Total: ₹${(bill.totalAmount || bill.total || 0).toFixed(2)}`, 10, 60);
    doc.save(`${bill.invoiceNumber}.pdf`);
  } catch (err) {
    console.error('viewBill error', err);
  }
}

async function deleteBill(id) {
  if (!confirm('Delete this bill?')) return;
  try {
    const res = await fetch(`/api/billing/${id}`, { method: 'DELETE', headers: makeHeaders(true) });
    if (!res.ok) throw new Error('Delete failed');
    billsCache = billsCache.filter(b => String(b.id) !== String(id));
    renderTable(billsCache);
  } catch (err) {
    console.error('deleteBill error', err);
    alert('Delete failed');
  }
}
