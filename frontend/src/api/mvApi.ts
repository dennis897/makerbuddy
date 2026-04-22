import { getAuthToken } from './client';

const BASE = '/api/mv';

function authHeaders(): Record<string, string> {
  const token = getAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      ...authHeaders(),
      ...(options.headers as Record<string, string> | undefined),
    },
  });
  if (res.status === 401) {
    window.location.href = '/login';
    throw new Error('Unauthorized');
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { detail?: string }).detail || `Request failed: ${res.status}`);
  }
  if (res.status === 204) return null as T;
  return res.json() as Promise<T>;
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface MvTag {
  id: string;
  name: string;
  color: string;
}

export interface MvProject {
  id: string;
  name: string;
  description: string;
  machine_type: string;
  parent_id: string | null;
  owner_id: number;
  created_at: string;
  file_count: number;
}

export interface MvFile {
  id: string;
  original_filename: string;
  file_type: string;
  file_size: number;
  description: string;
  uploaded_at: string;
  owner_id: number;
  project_id: string | null;
  tags: MvTag[];
}

// ── Files ─────────────────────────────────────────────────────────────────────

export const getFiles = (params: { tag?: string; search?: string; project?: string } = {}) => {
  const qs = new URLSearchParams();
  if (params.tag) qs.append('tag', params.tag);
  if (params.search) qs.append('search', params.search);
  if (params.project !== undefined) qs.append('project', params.project);
  const query = qs.toString();
  return request<MvFile[]>(`/files/${query ? '?' + query : ''}`);
};

export const uploadFile = (
  file: File,
  description: string,
  tagIds: string[],
  projectId: string,
) => {
  const form = new FormData();
  form.append('file', file);
  form.append('description', description || '');
  form.append('tag_ids', tagIds.join(','));
  form.append('project_id', projectId || '');
  return request<MvFile>('/files/', { method: 'POST', body: form });
};

export const importFromUrl = (
  url: string,
  description: string,
  tagIds: string[],
  projectId: string,
) => {
  const form = new FormData();
  form.append('url', url);
  form.append('description', description || '');
  form.append('tag_ids', tagIds.join(','));
  form.append('project_id', projectId || '');
  return request<MvFile>('/files/import-url', { method: 'POST', body: form });
};

export const updateFile = (id: string, data: { description?: string; tag_ids?: string[]; project_id?: string | null }) =>
  request<MvFile>(`/files/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });

export const deleteFile = (id: string) =>
  request<null>(`/files/${id}`, { method: 'DELETE' });

export const getFileDownloadUrl = (id: string) => {
  const token = getAuthToken();
  return `${BASE}/files/${id}/download?token=${token}`;
};

export const getFilePreviewGeometryUrl = (id: string) => {
  const token = getAuthToken();
  return `${BASE}/files/${id}/preview-geometry?token=${token}`;
};

export const getSignedUrl = async (id: string) => {
  const data = await request<{ signed_url: string }>(`/files/${id}/signed-url`, { method: 'POST' });
  const downloadUrl = `${window.location.origin}${data.signed_url}`;
  return `orcaslicer://open?file=${encodeURIComponent(downloadUrl)}`;
};

export const getBambuStudioUrl = async (id: string) => {
  const data = await request<{ signed_url: string }>(`/files/${id}/signed-url`, { method: 'POST' });
  const downloadUrl = `${window.location.origin}${data.signed_url}`;
  return `bambustudio://open?file=${encodeURIComponent(downloadUrl)}`;
};

// ── Projects ──────────────────────────────────────────────────────────────────

export const getProjects = () => request<MvProject[]>('/projects/');

export const createProject = (data: { name: string; machine_type: string; parent_id: string | null }) =>
  request<MvProject>('/projects/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });

export const deleteProject = (id: string) =>
  request<null>(`/projects/${id}`, { method: 'DELETE' });

// ── Tags ──────────────────────────────────────────────────────────────────────

export const getTags = () => request<MvTag[]>('/tags/');

export const createTag = (name: string, color: string) =>
  request<MvTag>('/tags/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, color }),
  });

export const deleteTag = (id: string) =>
  request<null>(`/tags/${id}`, { method: 'DELETE' });
