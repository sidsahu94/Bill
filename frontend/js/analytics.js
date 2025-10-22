// frontend/js/analytics.js
let revenueChart = null;
let topProductsChart = null;
let paymentModeChart = null;

function makeHeaders(json = true) {
  const token = localStorage.getItem('token');
  const headers = {};
  if (json) headers['Content-Type'] = 'application/json';
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

async function initAnalytics() {
  try {
    const res = await fetch('/api/analytics', { headers: makeHeaders(false) });
    if (!res.ok) {
      if (res.status === 401) { alert('Please login to view analytics'); window.location='/pages/login.html'; }
      throw new Error('Analytics API error');
    }
    const data = await res.json();

    const totalRevenueEl = document.getElementById('totalRevenue');
    const totalBillsEl = document.getElementById('totalBills');
    const avgSaleEl = document.getElementById('avgSale');

    if (totalRevenueEl) totalRevenueEl.innerText = `₹${(data.totalRevenue || 0).toFixed(2)}`;
    if (totalBillsEl) totalBillsEl.innerText = (data.totalBills || 0);
    if (avgSaleEl) avgSaleEl.innerText = `₹${(data.avgSale || 0).toFixed(2)}`;

    renderLineChart('revenueChart', (data.revenueByMonth?.labels)||[], (data.revenueByMonth?.values)||[]);
    renderBarChart('topProductsChart', (data.topProducts?.labels)||[], (data.topProducts?.values)||[]);
    renderPieChart('paymentModeChart', (data.paymentModes?.labels)||[], (data.paymentModes?.values)||[]);

    const insights = [];
    if ((data.totalRevenue || 0) > 50000) insights.push('🚀 Revenue crossed ₹50k!');
    if ((data.topProducts?.labels || [])[0]) insights.push(`🔥 Top: ${data.topProducts.labels[0]} (${data.topProducts.values[0]} units)`);
    const insightsContainer = document.getElementById('aiInsights') || document.querySelector('.container');
    if (insightsContainer) {
      const div = document.createElement('div');
      div.className = 'alert alert-info mt-3';
      div.innerHTML = insights.join('<br>') || 'No notable insights yet';
      const prev = document.querySelector('#analytics-insights'); if (prev) prev.remove();
      div.id = 'analytics-insights';
      insightsContainer.appendChild(div);
    }
  } catch (err) {
    console.error('initAnalytics error', err);
  }
}

// Chart helpers (same as earlier)
function renderLineChart(canvasId, labels, data) {
  const el = document.getElementById(canvasId); if (!el) return;
  if (revenueChart) revenueChart.destroy();
  const ctx = el.getContext('2d');
  revenueChart = new Chart(ctx, { type: 'line', data: { labels, datasets: [{ label: 'Revenue', data, fill: true, tension: 0.3 }] }, options: { responsive: true, plugins: { legend: { display: false } } } });
}
function renderBarChart(canvasId, labels, data) {
  const el = document.getElementById(canvasId); if (!el) return;
  if (topProductsChart) topProductsChart.destroy();
  const ctx = el.getContext('2d');
  topProductsChart = new Chart(ctx, { type: 'bar', data: { labels, datasets: [{ label: 'Qty Sold', data }] }, options: { responsive: true, plugins: { legend: { display: false } } } });
}
function renderPieChart(canvasId, labels, data) {
  const el = document.getElementById(canvasId); if (!el) return;
  if (paymentModeChart) paymentModeChart.destroy();
  const ctx = el.getContext('2d');
  paymentModeChart = new Chart(ctx, { type: 'pie', data: { labels, datasets: [{ data }] }, options: { responsive: true } });
}

document.addEventListener('DOMContentLoaded', () => {
  if (document.getElementById('revenueChart') || document.getElementById('topProductsChart') || document.getElementById('paymentModeChart')) {
    initAnalytics();
  }
});
