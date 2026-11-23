import { App } from 'antd';
import type { MessageInstance } from 'antd/es/message/interface';

// Thông báo nhỏ góc trên (message) lấy từ <App> của Ant Design để dùng đúng giao diện chung.
let instance: MessageInstance | null = null;

export function NotifyBridge() {
  instance = App.useApp().message;
  return null;
}

export const message = {
  success: (t: string) => instance?.success(t),
  error: (t: string) => instance?.error(t),
  warning: (t: string) => instance?.warning(t),
  info: (t: string) => instance?.info(t),
};
