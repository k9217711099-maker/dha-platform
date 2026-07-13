// Базовый URL backend D H&A. Телефон ходит на Mac по локальной сети,
// поэтому здесь IP Mac в сети (НЕ localhost). Поменяйте, если IP изменится:
//   узнать: ipconfig getifaddr en0
export const API_BASE = 'http://172.30.11.127:3001/api';
