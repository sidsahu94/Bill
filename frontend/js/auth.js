// frontend/js/auth.js

function getToken() {
  return localStorage.getItem('token');
}

function makeHeaders(isJson = true) {
  const headers = {};
  if (isJson) headers['Content-Type'] = 'application/json';
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

/**
 * Global API Fetch Wrapper with SaaS-grade error handling and Auto-Logout.
 */
async function fetchAPI(url, options = {}) {
  try {
    const res = await fetch(url, options);
    
    // Attempt to parse JSON response safely
    let data;
    try {
      data = await res.json();
    } catch (e) {
      data = { message: 'Unexpected server response.' };
    }

    // Global 401 / Session Expiry Interceptor
    if (res.status === 401) {
      console.warn('[AUTH] Session expired or invalid. Forcing logout.');
      localStorage.removeItem('token');
      localStorage.removeItem('userName');
      
      // Dispatch event to update navbar instantly without reloading
      window.dispatchEvent(new Event('authChanged')); 

      // Prevent redirect loops if already on an auth page
      const path = window.location.pathname;
      if (!path.includes('/login.html') && !path.includes('/register.html') && !path.includes('/verify.html')) {
        // Pass a URL parameter to show a toast on the login page
        window.location.replace('/pages/login.html?expired=true');
      }
      throw new Error(data.message || 'Session Expired. Please login again.');
    }

    if (!res.ok) {
      // Create a rich error object containing the backend's specific error code
      const error = new Error(data.message || 'Server Error');
      error.code = data.error || 'UNKNOWN_ERROR';
      error.status = res.status;
      throw error;
    }

    return data;
  } catch (err) {
    console.error('[API Error]:', err.message);
    throw err;
  }
}