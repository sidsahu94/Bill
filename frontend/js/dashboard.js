// frontend/js/dashboard.js
function makeHeaders(json = true) {
  const token = localStorage.getItem('token');
  const headers = {};
  if (json) headers['Content-Type'] = 'application/json';
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

document.addEventListener('DOMContentLoaded', initDashboard);

async function initDashboard() {
  await loadAnalytics();

  window.addEventListener('invoicesUpdated', loadAnalytics);
}

async function loadAnalytics() {
  try {
    const [billsRes, productsRes, customersRes] = await Promise.all([
      fetch('/api/billing', { headers: makeHeaders(false) }),
      fetch('/api/products', { headers: makeHeaders(false) }),
      fetch('/api/customers', { headers: makeHeaders(false) })
    ]);

    if (!billsRes.ok || !productsRes.ok || !customersRes.ok) {
      if (billsRes.status === 401 || productsRes.status === 401 || customersRes.status === 401) {
        alert('Please login');
        window.location = '/pages/login.html';
        return;
      }
      throw new Error('Failed to fetch analytics data');
    }

    const [bills, products, customers] = await Promise.all([billsRes.json(), productsRes.json(), customersRes.json()]);

    document.getElementById('totalProducts').innerText = products.length;
    document.getElementById('totalCustomers').innerText = customers.length;
    const totalRevenue = bills.reduce((acc, b) => acc + (b.totalAmount || 0), 0);
    document.getElementById('totalRevenue').innerText = `₹${totalRevenue.toFixed(2)}`;
    document.getElementById('totalBills').innerText = bills.length;

    const revenueByMonth = {};
    bills.forEach(b => {
      const m = new Date(b.date).toLocaleString('default', { month: 'short', year: 'numeric' });
      revenueByMonth[m] = (revenueByMonth[m] || 0) + (b.totalAmount || 0);
    });
    renderLineChart('revenueChart', Object.keys(revenueByMonth), Object.values(revenueByMonth));

    const productCount = {};
    bills.forEach(b => b.items.forEach(i => {
      const prod = products.find(p => p.id == i.productId);
      const name = prod ? prod.name : 'Unknown';
      productCount[name] = (productCount[name] || 0) + i.qty;
    }));
    const topProducts = Object.entries(productCount).sort((a,b)=>b[1]-a[1]).slice(0,5);
    renderBarChart('topProductsChart', topProducts.map(t=>t[0]), topProducts.map(t=>t[1]));

    const paymentCount = {};
    bills.forEach(b => paymentCount[b.paymentMethod] = (paymentCount[b.paymentMethod] || 0) + 1);
    renderPieChart('paymentModeChart', Object.keys(paymentCount), Object.values(paymentCount));

    const insights = [];
    if (totalRevenue > 50000) insights.push('🚀 Revenue crossed ₹50k this month!');
    if (topProducts[0]) insights.push(`🔥 Top selling product: ${topProducts[0][0]} (${topProducts[0][1]} units)`);
    const insightsContainer = document.getElementById('aiInsights');
    insightsContainer.innerHTML = '';
    if (insights.length > 0) {
      const div = document.createElement('div');
      div.classList.add('alert','alert-info','p-3','shadow-sm');
      div.innerHTML = insights.join('<br>');
      insightsContainer.appendChild(div);
    }
  } catch (err) {
    console.error('Dashboard load error:', err);
  }
}

// Chart helpers (reuse from analytics.js or keep local)
function renderLineChart(id, labels, data){
  const ctx = document.getElementById(id)?.getContext('2d');
  if(!ctx) return;
  if(window[id+'_chart']) window[id+'_chart'].destroy();
  window[id+'_chart'] = new Chart(ctx,{
    type:'line',
    data:{ labels, datasets:[{label:'Revenue', data, borderColor:'blue', backgroundColor:'rgba(0,123,255,0.1)', fill:true, tension:0.3}] },
    options:{responsive:true, plugins:{legend:{display:false}}}
  });
}
function renderBarChart(id, labels, data){
  const ctx = document.getElementById(id)?.getContext('2d');
  if(!ctx) return;
  if(window[id+'_chart']) window[id+'_chart'].destroy();
  window[id+'_chart'] = new Chart(ctx,{ type:'bar', data:{ labels, datasets:[{label:'Qty Sold', data, backgroundColor:'orange'}] }, options:{responsive:true, plugins:{legend:{display:false}}} });
}
function renderPieChart(id, labels, data){
  const ctx = document.getElementById(id)?.getContext('2d');
  if(!ctx) return;
  if(window[id+'_chart']) window[id+'_chart'].destroy();
  window[id+'_chart'] = new Chart(ctx,{ type:'pie', data:{ labels, datasets:[{data, backgroundColor:['green','blue','orange','purple']}] }, options:{responsive:true} });
}
