import { create } from 'zustand';
import api from '../utils/api';
import { connectSocket, disconnectSocket } from '../utils/socket';

const useAuthStore = create((set, get) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,

  initialize: async () => {
    const accessToken = localStorage.getItem('accessToken');
    if (!accessToken) {
      set({ isLoading: false });
      return;
    }

    try {
      const { data } = await api.get('/users/me');
      set({ user: data, isAuthenticated: true });
      connectSocket(accessToken);
    } catch {
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
    } finally {
      set({ isLoading: false });
    }
  },

  login: async (loginData) => {
    const { data } = await api.post('/auth/login', loginData);
    localStorage.setItem('accessToken', data.accessToken);
    localStorage.setItem('refreshToken', data.refreshToken);
    set({ user: data.user, isAuthenticated: true });
    connectSocket(data.accessToken);
    return data;
  },

  register: async (registerData) => {
    const { data } = await api.post('/auth/register', registerData);
    localStorage.setItem('accessToken', data.accessToken);
    localStorage.setItem('refreshToken', data.refreshToken);
    set({ user: data.user, isAuthenticated: true });
    connectSocket(data.accessToken);
    return data;
  },

  logout: async () => {
    try {
      const refreshToken = localStorage.getItem('refreshToken');
      await api.post('/auth/logout', { refreshToken });
    } catch {}
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    disconnectSocket();
    set({ user: null, isAuthenticated: false });
  },

  updateUser: (updates) => {
    set(state => ({ user: { ...state.user, ...updates } }));
  }
}));

export default useAuthStore;
