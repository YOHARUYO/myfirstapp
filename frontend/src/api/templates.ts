import api from './client';
import type { Template } from '../types';

export async function listTemplates(): Promise<Template[]> {
  const res = await api.get('/templates');
  return res.data;
}
