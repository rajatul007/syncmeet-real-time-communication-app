/**
 * SyncMeet Authentication Module
 */

import { apiRequest, setToken, setCurrentUser, getCurrentUser, clearAuth, showToast } from './api.js';

export function requireAuth() {
  const token = localStorage.getItem('syncmeet_token');
  const user = getCurrentUser();
  if (!token || !user) {
    clearAuth();
    window.location.href = `/login?redirect=${encodeURIComponent(window.location.pathname)}`;
    return null;
  }
  return user;
}

export function redirectIfAuthenticated() {
  const token = localStorage.getItem('syncmeet_token');
  const user = getCurrentUser();
  if (token && user) {
    const params = new URLSearchParams(window.location.search);
    const redirect = params.get('redirect') || '/dashboard';
    window.location.href = redirect;
  }
}

export async function loginUser(email, password) {
  try {
    const res = await apiRequest('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });
    if (res.success && res.token) {
      setToken(res.token);
      setCurrentUser(res.user);
      return res.user;
    }
    throw new Error(res.message || 'Login failed');
  } catch (err) {
    throw err;
  }
}

export async function registerUser(name, email, password, confirmPassword) {
  try {
    const res = await apiRequest('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name, email, password, confirmPassword })
    });
    if (res.success && res.token) {
      setToken(res.token);
      setCurrentUser(res.user);
      return res.user;
    }
    throw new Error(res.message || 'Registration failed');
  } catch (err) {
    throw err;
  }
}

export async function logoutUser() {
  try {
    await apiRequest('/auth/logout', { method: 'POST' }).catch(() => {});
  } finally {
    clearAuth();
    window.location.href = '/login';
  }
}

export async function updateUserProfile(data) {
  const res = await apiRequest('/auth/profile', {
    method: 'PUT',
    body: JSON.stringify(data)
  });
  if (res.success && res.user) {
    setCurrentUser(res.user);
    return res.user;
  }
  throw new Error(res.message || 'Failed to update profile');
}
