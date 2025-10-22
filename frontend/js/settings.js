document.addEventListener('DOMContentLoaded', initSettings);

function initSettings(){
  bindEvents();
  loadSettings();
}

function bindEvents(){
  document.getElementById('settingsForm').addEventListener('submit', saveSettings);
  document.getElementById('themeSelect').addEventListener('change', changeTheme);
  document.getElementById('exportDbBtn').addEventListener('click', exportDatabase);
  document.getElementById('importDb').addEventListener('change', importDatabase);
  document.getElementById('multiUserToggle').addEventListener('change', toggleMultiUser);
}

// --------------- Load & Save Settings ---------------
async function loadSettings(){
  const res = await fetch('/api/settings');
  const data = await res.json();
  document.getElementById('businessName').value = data.name || '';
  document.getElementById('gstin').value = data.gstin || '';
  document.getElementById('address').value = data.address || '';
  document.getElementById('themeSelect').value = data.theme || 'light';
  document.getElementById('multiUserToggle').checked = data.multiUser || false;
  applyTheme(data.theme);
}

async function saveSettings(e){
  e.preventDefault();
  const formData = new FormData();
  formData.append('name', document.getElementById('businessName').value.trim());
  formData.append('gstin', document.getElementById('gstin').value.trim());
  formData.append('address', document.getElementById('address').value.trim());
  formData.append('theme', document.getElementById('themeSelect').value);
  formData.append('multiUser', document.getElementById('multiUserToggle').checked);
  const logoFile = document.getElementById('logo').files[0];
  if(logoFile) formData.append('logo', logoFile);

  try{
    const res = await fetch('/api/settings',{method:'POST',body:formData});
    alert('Settings saved!');
  }catch(err){console.error(err);}
}

// --------------- Theme ---------------
function changeTheme(){
  applyTheme(this.value);
}

function applyTheme(theme){
  if(theme==='dark'){
    document.body.classList.add('bg-dark','text-white');
  }else{
    document.body.classList.remove('bg-dark','text-white');
  }
}

// --------------- Database Export/Import ---------------
async function exportDatabase(){
  try{
    const res = await fetch('/api/settings/export');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href=url; a.download='database_backup.json'; a.click();
    URL.revokeObjectURL(url);
  }catch(err){console.error(err);}
}

function importDatabase(e){
  const file = e.target.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = async (ev)=>{
    try{
      const json = JSON.parse(ev.target.result);
      await fetch('/api/settings/import',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(json)});
      alert('Database imported!');
      location.reload();
    }catch(err){console.error(err);}
  };
  reader.readAsText(file);
}

// --------------- Multi-User Toggle ---------------
async function toggleMultiUser(e){
  try{
    await fetch('/api/settings/multiuser',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({multiUser:e.target.checked})});
  }catch(err){console.error(err);}
}

