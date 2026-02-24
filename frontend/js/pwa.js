// frontend/js/pwa.js

// Register Service Worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then(reg => console.log('Service Worker Registered for PWA', reg.scope))
      .catch(err => console.error('Service Worker Registration Failed', err));
  });
}

let deferredPrompt;

// Capture the install event
window.addEventListener('beforeinstallprompt', (e) => {
  // Prevent the mini-infobar from appearing on mobile automatically
  e.preventDefault();
  // Stash the event so it can be triggered later.
  deferredPrompt = e;
  
  // Reveal all buttons with the 'pwa-install-btn' class
  const installBtns = document.querySelectorAll('.pwa-install-btn');
  installBtns.forEach(btn => {
    btn.style.display = 'inline-flex'; // Un-hide
  });
  console.log('PWA Install Trigger Ready.');
});

// Handle the install button click
document.addEventListener('click', async (e) => {
  const btn = e.target.closest('.pwa-install-btn');
  if (btn) {
    if (!deferredPrompt) return;
    
    // Show the native browser install prompt
    deferredPrompt.prompt();
    
    // Wait for the user to respond
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      console.log('User accepted the A2HS prompt');
    }
    
    // We've used the prompt, and can't use it again, throw it away
    deferredPrompt = null;
    
    // Hide the buttons
    const installBtns = document.querySelectorAll('.pwa-install-btn');
    installBtns.forEach(b => b.style.display = 'none');
  }
});

// Detect when installation succeeds
window.addEventListener('appinstalled', () => {
  console.log('PWA was successfully installed');
  const installBtns = document.querySelectorAll('.pwa-install-btn');
  installBtns.forEach(btn => btn.style.display = 'none');
});