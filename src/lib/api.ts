'use client';
import type { ChatRequest, ChatResponse } from './agent/blocks';
import type { ComplexResult, OfferWithShop, Product } from './data/types';
import type { InquiryDTO, ShopOverride } from './inquiries/types';
import type { Place } from './geo/provider';

async function req<T>(url: string, init?: RequestInit & { timeoutMs?: number }): Promise<T> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), init?.timeoutMs ?? 45_000);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal, headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) } });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
    return body as T;
  } finally {
    clearTimeout(t);
  }
}

export const api = {
  chat: (body: ChatRequest) => req<ChatResponse>('/api/chat', { method: 'POST', body: JSON.stringify(body) }),
  offers: (productId: string) => req<{ product: Product; offers: OfferWithShop[] }>(`/api/products/${encodeURIComponent(productId)}/offers`),
  complex: (id: string, productId?: string) =>
    req<ComplexResult>(`/api/complex/${encodeURIComponent(id)}${productId ? `?productId=${encodeURIComponent(productId)}` : ''}`),
  geoSearch: (q: string) => req<{ places: Place[] }>(`/api/geo/search?q=${encodeURIComponent(q)}`),
  createInquiry: (b: { shopId: string; productId: string; question?: string | null; autoReply?: boolean }) =>
    req<{ inquiry: InquiryDTO }>('/api/inquiries', { method: 'POST', body: JSON.stringify(b) }),
  inquiries: (ids: string[]) => req<{ inquiries: InquiryDTO[] }>(`/api/inquiries?ids=${ids.map(encodeURIComponent).join(',')}`),
  overrides: (ids: string[]) => req<{ overrides: ShopOverride[] }>(`/api/overrides?ids=${ids.map(encodeURIComponent).join(',')}`),
  findHelp: (shopId: string, question: string) =>
    req<{ answer: string; source: string; landmarks: string[] }>('/api/find-help', { method: 'POST', body: JSON.stringify({ shopId, question }) }),
  askShop: (shopId: string, productId: string, question: string) =>
    req<{ answer: string | null; source: string | null }>('/api/ask-shop', { method: 'POST', body: JSON.stringify({ shopId, productId, question }) }),
  health: () => req<{ stt: boolean; llmMode: string; dataSource: string }>('/api/health'),
  transcribe: async (blob: Blob, mime: string) => {
    const fd = new FormData();
    const ext = mime.includes('mp4') ? 'mp4' : mime.includes('ogg') ? 'ogg' : mime.includes('wav') ? 'wav' : 'webm';
    fd.append('file', new File([blob], `audio.${ext}`, { type: mime.split(';')[0] }));
    fd.append('mime', mime);
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 35_000);
    try {
      const res = await fetch('/api/transcribe', { method: 'POST', body: fd, signal: ctrl.signal });
      const body = (await res.json().catch(() => ({}))) as { text?: string; error?: string };
      if (!res.ok) throw new Error(body.error ?? 'stt failed');
      return body.text ?? '';
    } finally {
      clearTimeout(t);
    }
  },
};
