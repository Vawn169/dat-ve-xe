import { DownloadOutlined, FileSearchOutlined, InfoCircleOutlined, MobileOutlined, NumberOutlined, SafetyCertificateOutlined, SearchOutlined } from '@ant-design/icons';
import { Alert, Form, Input } from 'antd';
import { useState } from 'react';
import { ApiError, api, download } from '../api';
import { TicketCard } from '../components/TicketCard';
import { message } from '../notify';
import type { Booking } from '../types';

export function Lookup() {
  const [result, setResult] = useState<Booking | null>(null);
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (v: { code: string; phone: string }) => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      setResult(await api<Booking>('/bookings/lookup', { method: 'POST', body: { code: v.code.trim().toUpperCase(), phone: v.phone.trim() } }));
      setPhone(v.phone.trim());
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Có lỗi xảy ra');
    } finally {
      setLoading(false);
    }
  };

  const pdf = async () => {
    if (!result) return;
    try {
      await download(`/bookings/${result.code}/pdf?phone=${encodeURIComponent(phone)}`, `ve-${result.code}.pdf`);
    } catch (e) {
      message.error(e instanceof ApiError ? e.message : 'Không tải được vé');
    }
  };

  return (
    <div className="container section narrow lookup">
      <div className="page-hero">
        <span className="ph-icon">
          <FileSearchOutlined />
        </span>
        <span className="ph-pill">
          <SafetyCertificateOutlined /> Không cần tài khoản
        </span>
        <h1>Tra cứu vé và lấy mã QR lên xe</h1>
        <p className="muted">Nhập mã vé (in trên vé, ví dụ VE7K3QZ9MP) và số điện thoại lúc đặt để xem tình trạng vé, tải vé PDF.</p>
      </div>
      <section className="card lookup-card">
        <Form layout="vertical" onFinish={submit} className="lookup-form" requiredMark={false}>
          <div className="two-col">
            <Form.Item name="code" label="Mã đặt vé / mã tra cứu" rules={[{ required: true, message: 'Nhập mã vé' }]}>
              <Input id="lookup-code" prefix={<NumberOutlined />} placeholder="VD: VE7K3QZ9MP" size="large" />
            </Form.Item>
            <Form.Item name="phone" label="Số điện thoại đặt vé" rules={[{ required: true, pattern: /^0\d{9}$/, message: 'Số điện thoại 10 số' }]}>
              <Input id="lookup-phone" prefix={<MobileOutlined />} placeholder="VD: 0912345678" size="large" />
            </Form.Item>
          </div>
          <button className="btn-primary btn-block btn-lg" type="submit" disabled={loading}>
            <SearchOutlined /> {loading ? 'Đang tra…' : 'Tra cứu vé'}
          </button>
          <p className="info-note">
            <InfoCircleOutlined /> Không nhớ mã vé? Mã có trong email xác nhận gửi lúc đặt vé.
          </p>
        </Form>
      </section>
      {error && <Alert type="error" showIcon message={error} style={{ marginTop: 16 }} />}
      {result && (
        <TicketCard
          b={result}
          actions={
            result.status === 'PAID' ? (
              <button className="btn-outline" onClick={pdf}>
                <DownloadOutlined /> Tải vé PDF
              </button>
            ) : undefined
          }
        />
      )}
    </div>
  );
}
