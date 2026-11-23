// Gọi backend. Backend luôn trả { success, data } hoặc { success: false, error: { code, message } }.

export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
    public details?: unknown,
  ) {
    super(message);
  }
}

const TOKEN_KEY = 'dvx_token';

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* trình duyệt chặn lưu trữ: bỏ qua */
  }
}

export async function api<T>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method: opts.method ?? 'GET',
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    });
  } catch {
    throw new ApiError('NETWORK', 'Không kết nối được máy chủ. Kiểm tra backend đã chạy chưa.', 0);
  }

  let json: { success?: boolean; data?: T; error?: { code: string; message: string; details?: unknown } } | null = null;
  try {
    json = await res.json();
  } catch {
    /* phản hồi không phải JSON */
  }
  if (!res.ok || !json?.success) {
    const e = json?.error;
    throw new ApiError(e?.code ?? 'NETWORK', e?.message ?? `Lỗi máy chủ (${res.status})`, res.status, e?.details);
  }
  return json.data as T;
}

/** Tải file (PDF vé, Excel thống kê) có kèm token đăng nhập */
export async function download(path: string, filename: string) {
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`/api${path}`, { headers });
  if (!res.ok) {
    let msg = `Không tải được file (${res.status})`;
    try {
      msg = (await res.json()).error?.message ?? msg;
    } catch {
      /* không phải JSON */
    }
    throw new ApiError('DOWNLOAD', msg, res.status);
  }
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
