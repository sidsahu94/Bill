// frontend/js/settings.js

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
  initSettings();
});

async function initSettings() {
  bindEvents();
  await Promise.all([loadUserProfile(), loadBusinessSettings()]);
}

function bindEvents() {
  document.getElementById('profileForm')?.addEventListener('submit', handleProfileUpdate);
  document.getElementById('securityForm')?.addEventListener('submit', handlePasswordChange);
  document.getElementById('settingsForm')?.addEventListener('submit', saveBusinessSettings);
  document.getElementById('exportDbBtn')?.addEventListener('click', exportDatabase);
  document.getElementById('importDb')?.addEventListener('change', importDatabase);
}

// --- Identity Management ---
async function loadUserProfile() {
  try {
    const res = await fetch('/api/auth/me', { headers: makeHeaders() });
    if (!res.ok) throw new Error('Failed to load profile');
    const user = await res.json();
    
    document.getElementById('profileName').value = user.name || '';
    document.getElementById('profileEmail').value = user.email || '';
  } catch (err) {
    console.error(err);
  }
}

async function handleProfileUpdate(e) {
  e.preventDefault();
  const btn = document.getElementById('saveProfileBtn');
  const originalText = btn.textContent;
  btn.disabled = true;
  btn.innerHTML = `<div class="saas-spinner" style="border-top-color: #000; width: 14px; height: 14px;"></div> <span class="ms-2">Updating...</span>`;

  try {
    const name = document.getElementById('profileName').value.trim();
    const res = await fetch('/api/auth/profile', {
      method: 'PUT',
      headers: makeHeaders(true),
      body: JSON.stringify({ name })
    });
    
    const data = await res.json();
    if (!res.ok) throw new Error(data.message);
    
    localStorage.setItem('userName', name);
    window.dispatchEvent(new Event('authChanged')); 
    
    showToast('Identity updated successfully.', 'success');
  } catch (err) {
    showToast(`Update Failed: ${err.message}`, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = originalText;
  }
}

// --- Security / Key Management ---
async function handlePasswordChange(e) {
  e.preventDefault();
  const currentPassword = document.getElementById('currentPassword').value;
  const newPassword = document.getElementById('newPassword').value;
  const confirmPassword = document.getElementById('confirmPassword').value;

  if (newPassword !== confirmPassword) {
    return showToast('New cryptographic keys do not match.', 'error');
  }

  const btn = document.getElementById('updatePasswordBtn');
  const originalText = btn.textContent;
  btn.disabled = true;
  btn.innerHTML = `<div class="saas-spinner" style="border-top-color: #ef4444; width: 14px; height: 14px;"></div> <span class="ms-2">Rotating Key...</span>`;

  try {
    const res = await fetch('/api/auth/change-password', {
      method: 'PUT',
      headers: makeHeaders(true),
      body: JSON.stringify({ currentPassword, newPassword })
    });
    
    const data = await res.json();
    if (!res.ok) throw new Error(data.message);
    
    showToast('Security Key rotated. Re-authentication required.', 'success');
    
    setTimeout(() => {
      localStorage.removeItem('token');
      localStorage.removeItem('userName');
      window.location.replace('/pages/login.html');
    }, 2000);
    
  } catch (err) {
    showToast(err.message, 'error');
    btn.disabled = false;
    btn.textContent = originalText;
  }
}

// --- Corporate Entity Settings ---
async function loadBusinessSettings() {
  try {
    const res = await fetch('/api/settings');
    const data = await res.json();
    document.getElementById('businessName').value = data.name || '';
    document.getElementById('gstin').value = data.gstin || '';
    document.getElementById('address').value = data.address || '';
  } catch (err) {
    console.warn('No corporate settings found yet.');
  }
}

async function saveBusinessSettings(e) {
  e.preventDefault();
  const formData = new FormData();
  formData.append('name', document.getElementById('businessName').value.trim());
  formData.append('gstin', document.getElementById('gstin').value.trim());
  formData.append('address', document.getElementById('address').value.trim());

  const btn = e.target.querySelector('button[type="submit"]');
  const originalText = btn.textContent;
  btn.disabled = true;
  btn.innerHTML = `<div class="saas-spinner" style="border-top-color: #000; width: 14px; height: 14px;"></div> <span class="ms-2">Committing...</span>`;

  try {
    const res = await fetch('/api/settings', { method: 'POST', body: formData });
    if(res.ok) showToast('Corporate parameters committed to registry.', 'success');
    else throw new Error('Transaction failed');
  } catch(err) {
    console.error(err);
    showToast('Failed to save configuration.', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = originalText;
  }
}

// --- Data Continuity (Backup & Restore) ---
async function exportDatabase() {
  try {
    const res = await fetch('/api/settings/export');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); 
    a.href = url; 
    a.download = `Bill_Snapshot_${new Date().toISOString().slice(0,10)}.json`; 
    a.click();
    URL.revokeObjectURL(url);
    showToast('Snapshot downloaded securely.', 'success');
  } catch(err) {
    showToast('Export failed.', 'error');
  }
}

function importDatabase(e) {
  const file = e.target.files[0];
  if(!file) return;
  if(!confirm('AUTHORIZATION REQUIRED: This will permanently overwrite current system data. Proceed?')) {
    e.target.value = '';
    return;
  }
  
  const reader = new FileReader();
  reader.onload = async (ev) => {
    try {
      const json = JSON.parse(ev.target.result);
      const res = await fetch('/api/settings/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(json)
      });
      if(res.ok) {
        showToast('Snapshot restored. Rebooting interface...', 'success');
        setTimeout(() => location.reload(), 1500);
      } else {
        throw new Error('Server rejected snapshot');
      }
    } catch(err) {
      showToast('Import failed. Corrupt or invalid JSON.', 'error');
      e.target.value = '';
    }
  };
  reader.readAsText(file);
}