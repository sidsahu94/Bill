// frontend/js/auth.js
export function getToken() {
  return localStorage.getItem('token');
}

export function makeHeaders(isJson = true) {
  const headers = {};
  if (isJson) headers['Content-Type'] = 'application/json';
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

export async function fetchAPI(url, options = {}) {
  try {
    const res = await fetch(url, options);
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Error');
    return data;
  } catch (err) {
    console.error('API Error:', err.message);
    alert(err.message);
    throw err;
  }
}

