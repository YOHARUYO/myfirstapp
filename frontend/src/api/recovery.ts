import api from './client';
import type { RecoverableSession } from '../types';

export async function listRecoverable(): Promise<RecoverableSession[]> {
  const res = await api.get('/recovery');
  return res.data;
}
