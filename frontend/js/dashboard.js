// frontend/js/dashboard.js

function makeHeaders(json = true) {
  const token = localStorage.getItem('token');
  const headers = {};
  if (json) headers['Content-Type'] = 'application/json';
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

// --- PREMIUM DARK TOAST NOTIFICATION ---
function showToast(message, type = 'success') {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const borderColor = type === 'success' ? 'var(--emerald-hwb)' : 'var(--error)';
  const icon = type === 'success' ? '✓' : '⚠️';
  const toastId = 'toast-' + Date.now();

  const toastHTML = `
    <div id="${toastId}" class="saas-card p-3 d-flex align-items-center gap-3" style="min-width: 300px; border-left: 4px solid ${borderColor}; padding: 16px !important; animation: slideUpFade 0.4s cubic-bezier(0.16, 1, 0.3, 1);">
      <div style="font-size: 1.2rem;">${icon}</div>
      <div>
        <div class="fw-bold text-white" style="font-size: 0.85rem; letter-spacing: 0.05em; text-transform: uppercase;">${type === 'success' ? 'Confirmed' : 'Alert'}</div>
        <div style="color: var(--text-secondary); font-size: 0.9rem;">${message}</div>
      </div>
    </div>
  `;
  
  container.insertAdjacentHTML('beforeend', toastHTML);
  setTimeout(() => {
    const el = document.getElementById(toastId);
    if (el) {
      el.style.opacity = '0';
      el.style.transform = 'translateX(20px)';
      setTimeout(() => el.remove(), 300);
    }
  }, 4000);
}

document.addEventListener('DOMContentLoaded', () => {
  initDashboard();
  document.getElementById('exportReportBtn').addEventListener('click', exportDashboardReport);
});

async function initDashboard() {
  // Elite Chart.js Global Config
  Chart.defaults.font.family = "'Plus Jakarta Sans', system-ui, sans-serif";
  Chart.defaults.color = '#94A3B8'; // text-secondary
  Chart.defaults.scale.grid.color = 'rgba(255, 255, 255, 0.05)';
  
  await loadAnalytics();
}

async function loadAnalytics() {
  try {
    const res = await fetch('/api/analytics', { headers: makeHeaders(false) });
    if (!res.ok) {
      if (res.status === 401) return window.location.replace('/pages/login.html');
      throw new Error('Analytics failed to load');
    }

    const data = await res.json();
    populateKPIs(data);
    populateSmartAlerts(data.smartAlerts);
    
    renderRevenueChart('revenueChart', data.revenueByMonth.labels, data.revenueByMonth.values);
    renderBarChart('topProductsChart', data.topProducts.labels, data.topProducts.values);
    renderDoughnutChart('paymentModeChart', data.paymentModes.labels, data.paymentModes.values);
  } catch (err) {
    document.getElementById('smartAlertsContainer').innerHTML = `
      <div class="saas-card p-3" style="border-left: 4px solid var(--error);">
        <span class="text-white fw-bold">System Error:</span> <span class="text-muted-custom">Failed to load Intelligence Engine.</span>
      </div>`;
  }
}

// ... (exportDashboardReport remains identical to previous version, just copy it over if needed, but the core logic is standard) ...
async function exportDashboardReport() {
  const btn = document.getElementById('exportReportBtn');
  const originalText = btn.innerHTML;
  btn.innerHTML = `<div class="saas-spinner" style="border-top-color: #000;"></div> <span class="ms-2">Extracting...</span>`;
  btn.disabled = true;

  try {
    const res = await fetch('/api/analytics/export', { headers: makeHeaders(false) });
    if (!res.ok) throw new Error('Failed to generate report');

    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Ledger_Export_${new Date().toISOString().slice(0,10)}.csv`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    a.remove();

    showToast('Ledger extracted securely.', 'success');
  } catch (err) {
    showToast('Extraction failed.', 'error');
  } finally {
    btn.innerHTML = originalText;
    btn.disabled = false;
  }
}

function populateKPIs(data) {
  // Animate numbers for premium feel
  document.getElementById('kpiRevenue').textContent = `₹${(data.currentMonthRevenue || 0).toLocaleString('en-IN')}`;
  document.getElementById('kpiAov').textContent = `₹${(data.avgSale || 0).toLocaleString('en-IN', {maximumFractionDigits: 2})}`;
  document.getElementById('kpiBills').textContent = (data.totalBills || 0).toLocaleString();
  document.getElementById('kpiLifetime').textContent = `₹${(data.totalRevenue || 0).toLocaleString('en-IN')}`;

  const growthEl = document.getElementById('kpiGrowth');
  const growth = parseFloat(data.growthPercent);
  if (growth > 0) {
    growthEl.innerHTML = `<span style="color: var(--emerald-hwb);">↑ ${growth}%</span> <span class="text-muted-custom fw-normal">vs last month</span>`;
  } else if (growth < 0) {
    growthEl.innerHTML = `<span style="color: var(--error);">↓ ${Math.abs(growth)}%</span> <span class="text-muted-custom fw-normal">vs last month</span>`;
  } else {
    growthEl.innerHTML = `<span class="text-muted-custom">Stable vs last month</span>`;
  }
}

function populateSmartAlerts(alerts) {
  const container = document.getElementById('smartAlertsContainer');
  container.innerHTML = '';
  
  if (!alerts || alerts.length === 0) {
    container.innerHTML = `
      <div class="saas-card p-3 d-flex align-items-center gap-3" style="padding: 16px 24px !important; border-left: 4px solid var(--emerald-hwb);">
        <span style="color: var(--emerald-hwb); font-size: 1.2rem;">●</span>
        <span class="text-white">All assets optimal. No critical anomalies detected.</span>
      </div>`;
    return;
  }

  alerts.forEach(alert => {
    let borderColor = 'var(--text-secondary)';
    if(alert.type === 'danger') borderColor = 'var(--error)';
    if(alert.type === 'warning') borderColor = 'var(--gold-metallic)';
    if(alert.type === 'info') borderColor = 'var(--teal-hwb)';

    const div = document.createElement('div');
    div.className = `saas-card p-3 mb-3 d-flex align-items-center gap-3`;
    div.style = `padding: 16px 24px !important; border-left: 4px solid ${borderColor};`;
    div.innerHTML = `<span style="color: ${borderColor}; font-size: 1.2rem;">●</span> <span class="text-white">${alert.message}</span>`;
    container.appendChild(div);
  });
}

// --- Luxury Data Visualizations ---

function renderRevenueChart(canvasId, labels, dataPoints) {
  const ctx = document.getElementById(canvasId).getContext('2d');
  
  // Gold Metallic Gradient
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
        borderColor: '#D4AF37', // Gold
        backgroundColor: gradient,
        borderWidth: 3,
        pointBackgroundColor: '#030712',
        pointBorderColor: '#D4AF37',
        pointBorderWidth: 2,
        pointRadius: 4,
        pointHoverRadius: 6,
        fill: true,
        tension: 0.4 // Smooth curve
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(15, 23, 42, 0.9)',
          titleFont: { size: 12, family: "'Plus Jakarta Sans'" },
          bodyFont: { size: 14, weight: 'bold' },
          padding: 16, displayColors: false,
          borderColor: 'rgba(212, 175, 55, 0.3)', borderWidth: 1,
          callbacks: { label: function(context) { return '₹ ' + context.parsed.y.toLocaleString('en-IN'); } }
        }
      },
      scales: {
        x: { grid: { display: false } },
        y: { 
          beginAtZero: true, border: { display: false }, 
          ticks: { callback: function(value) { return '₹' + (value/1000 >= 1 ? value/1000 + 'k' : value); }, padding: 10 }
        }
      }
    }
  });
}

function renderBarChart(canvasId, labels, dataPoints) {
  const ctx = document.getElementById(canvasId).getContext('2d');
  new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: 'Units Moved',
        data: dataPoints,
        backgroundColor: 'hwb(182 2% 32%)', // Teal accent
        borderRadius: 4,
        barThickness: 'flex', maxBarThickness: 32
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false } },
        y: { border: { display: false }, beginAtZero: true }
      }
    }
  });
}

function renderDoughnutChart(canvasId, labels, dataPoints) {
  const ctx = document.getElementById(canvasId).getContext('2d');
  new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: labels,
      datasets: [{
        data: dataPoints,
        // Wine Red, Gold, Teal, Emerald, Royal Blue
        backgroundColor: ['#D4AF37', 'hwb(182 2% 32%)', '#5C001E', 'hwb(155 2% 32%)', '#0F172A'],
        borderWidth: 2,
        borderColor: '#030712', // Match deep space bg to separate rings
        hoverOffset: 6
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false, cutout: '80%',
      plugins: { legend: { position: 'bottom', labels: { color: '#94A3B8', usePointStyle: true, padding: 24, font: {family: "'Plus Jakarta Sans'"} } } }
    }
  });
}