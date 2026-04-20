import api from './client';

export interface Contact {
  id: string;
  name: string;
  created_at: string;
}

export async function listParticipants(): Promise<Contact[]> {
  const res = await api.get('/contacts/participants');
  return res.data;
}

export async function addParticipant(name: string): Promise<Contact> {
  const res = await api.post('/contacts/participants', { name });
  return res.data;
}

export async function listLocations(): Promise<Contact[]> {
  const res = await api.get('/contacts/locations');
  return res.data;
}

export async function addLocation(name: string): Promise<Contact> {
  const res = await api.post('/contacts/locations', { name });
  return res.data;
}
