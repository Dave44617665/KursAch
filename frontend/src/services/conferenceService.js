import api from './api';

export const conferenceService = {
  // Получить все конференции
  getConferences: async (status = '') => {
    const params = status ? { status } : {};
    const response = await api.get('/conferences', { params });
    return response.data.data;
  },

  // Получить конференцию по ID
  getConference: async (id) => {
    const response = await api.get(`/conferences/${id}`);
    return response.data.data;
  },

  // Создать конференцию
  createConference: async (title, startTime) => {
    const response = await api.post('/conferences', {
      title,
      start_time: startTime,
    });
    return response.data.data;
  },

  // Обновить конференцию
  updateConference: async (id, data) => {
    const response = await api.put(`/conferences/${id}`, data);
    return response.data.data;
  },

  // Удалить конференцию
  deleteConference: async (id) => {
    const response = await api.delete(`/conferences/${id}`);
    return response.data;
  },

  // Начать конференцию
  startConference: async (id) => {
    const response = await api.post(`/conferences/${id}/start`);
    return response.data.data;
  },

  // Завершить конференцию
  endConference: async (id) => {
    const response = await api.post(`/conferences/${id}/end`);
    return response.data.data;
  },

  // Присоединиться к конференции
  joinConference: async (id) => {
    const response = await api.post(`/conferences/${id}/join`);
    return response.data.data;
  },

  // Получить участников
  getParticipants: async (conferenceId) => {
    const response = await api.get(`/conferences/${conferenceId}/participants`);
    return response.data.data;
  },

  // Покинуть конференцию
  leaveConference: async (conferenceId) => {
    const response = await api.post(`/conferences/${conferenceId}/leave`);
    return response.data;
  },

  joinByReadableId: async (readableId) => {
    const response = await api.post(`/conferences/join/${readableId}`);
    return response.data.data;
  },
};