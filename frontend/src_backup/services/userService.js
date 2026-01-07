import api from './api';

export const userService = {
  // Получить профиль
  getProfile: async () => {
    const response = await api.get('/users/profile');
    return response.data.data;
  },

  // Обновить профиль
  updateProfile: async (data) => {
    const response = await api.put('/users/profile', data);
    return response.data.data;
  },

  // Изменить пароль
  changePassword: async (oldPassword, newPassword) => {
    const response = await api.patch('/users/password', {
      old_password: oldPassword,
      new_password: newPassword,
    });
    return response.data;
  },

  // Обновить аватар
  updateAvatar: async (avatarUrl) => {
    const response = await api.patch('/users/avatar', {
      avatar_url: avatarUrl,
    });
    return response.data.data;
  },
};