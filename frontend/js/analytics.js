// frontend/js/analytics.js

function makeHeaders(json = true) {
  const token = localStorage.getItem('token');
  const headers = {};
  if (json) headers['Content-Type'] = 'application/json';
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

document.addEventListener('DOMContentLoaded', () => {
  // Apply luxury dark mode defaults to Chart.js
  Chart.defaults.font.family = "'Plus Jakarta Sans', system-ui, sans-serif";
  Chart.defaults.color = '#94A3B8'; 
  Chart.defaults.scale.grid.color = 'rgba(255, 255, 255, 0.05)';
  
  initAnalytics();
});

async function initAnalytics() {
  try {
    const res = await fetch('/api/analytics', { headers: makeHeaders(false) });
    if (!res.ok) {
      if (res.status === 401) return window.location.replace('/pages/login.html');
      throw new Error('Analytics failed to load');
    }

    const data = await res.json();

    // Populate Top KPIs safely
    const elRev = document.getElementById('totalRevenue');
    const elBills = document.getElementById('totalBills');
    const elAvg = document.getElementById('avgSale');

    if(elRev) elRev.textContent = `₹${(data.totalRevenue || 0).toLocaleString('en-IN')}`;
    if(elBills) elBills.textContent = (data.totalBills || 0).toLocaleString();
    if(elAvg) elAvg.textContent = `₹${(data.avgSale || 0).toLocaleString('en-IN', {maximumFractionDigits: 2})}`;

    // Render Luxury Charts
    renderRevenueChart('revenueChart', data.revenueByMonth.labels || [], data.revenueByMonth.values || []);
    renderBarChart('topProductsChart', data.topProducts.labels || [], data.topProducts.values || []);
    renderDoughnutChart('paymentModeChart', data.paymentModes.labels || [], data.paymentModes.values || []);

  } catch (err) {
    console.error('Analytics load error:', err);
  }
}

// --- Luxury Data Visualizations ---

function renderRevenueChart(canvasId, labels, dataPoints) {
  const el = document.getElementById(canvasId); if(!el) return;
  const ctx = el.getContext('2d');
  
  const gradient = ctx.createLinearGradient(0, 0, 0, 400);
  gradient.addColorStop(0, 'rgba(212, 175, 55, 0.5)'); // Gold
  gradient.addColorStop(1, 'rgba(212, 175, 55, 0.0)');

  new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        label: 'Volume (₹)',
        data: dataPoints,
        borderColor: '#D4AF37', 
        backgroundColor: gradient,
        borderWidth: 3,
        pointBackgroundColor: '#030712',
        pointBorderColor: '#D4AF37',
        pointBorderWidth: 2,
        pointRadius: 4,
        pointHoverRadius: 6,
        fill: true,
        tension: 0.4 
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(15, 23, 42, 0.9)',
          titleFont: { size: 12 }, bodyFont: { size: 14, weight: 'bold' },
          padding: 16, displayColors: false, borderColor: 'rgba(212, 175, 55, 0.3)', borderWidth: 1,
          callbacks: { label: function(context) { return '₹ ' + context.parsed.y.toLocaleString('en-IN'); } }
        }
      },
      scales: {
        x: { grid: { display: false } },
        y: { beginAtZero: true, border: { display: false }, ticks: { callback: function(value) { return '₹' + (value/1000 >= 1 ? value/1000 + 'k' : value); } } }
      }
    }
  });
}

function renderBarChart(canvasId, labels, dataPoints) {
  const el = document.getElementById(canvasId); if(!el) return;
  const ctx = el.getContext('2d');
  new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: 'Units Moved',
        data: dataPoints,
        backgroundColor: 'hwb(182 2% 32%)', // Teal accent
        borderRadius: 4, barThickness: 'flex', maxBarThickness: 32
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { x: { grid: { display: false } }, y: { border: { display: false }, beginAtZero: true } }
    }
  });
}

function renderDoughnutChart(canvasId, labels, dataPoints) {
  const el = document.getElementById(canvasId); if(!el) return;
  const ctx = el.getContext('2d');
  new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: labels,
      datasets: [{
        data: dataPoints,
        backgroundColor: ['#D4AF37', 'hwb(182 2% 32%)', '#5C001E', 'hwb(155 2% 32%)', '#0F172A'],
        borderWidth: 2, borderColor: '#030712', hoverOffset: 6
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false, cutout: '80%',
      plugins: { legend: { position: 'bottom', labels: { color: '#94A3B8', usePointStyle: true, padding: 24 } } }
    }
  });
}