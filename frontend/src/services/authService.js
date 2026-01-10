import api from './api';

export const authService = {
  // Регистрация
  register: async (email, password, nickname) => {
    const response = await api.post('/register', {
      email,
      password,
      nickname,
    });
    return response.data;
  },

  // Логин
  login: async (email, password) => {
    const response = await api.post('/login', {
      email,
      password,
    });

    if (response.data.success) {
      const { access_token, refresh_token } = response.data.data;
      localStorage.setItem('access_token', access_token);
      localStorage.setItem('refresh_token', refresh_token);
    }

    return response.data;
  },

  // Логаут
  logout: () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
  },

  // Получить текущего пользователя
  getCurrentUser: async () => {
    const response = await api.get('/auth/me');
    return response.data.data;
  },

  // Проверка авторизации
  isAuthenticated: () => {
    return !!localStorage.getItem('access_token');
  },
};