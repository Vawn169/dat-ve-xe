import { CustomerServiceOutlined, FileSearchOutlined, MessageOutlined, SwapOutlined, UndoOutlined } from '@ant-design/icons';
import { Alert, Collapse, Empty, Form, Input, Segmented, Tag } from 'antd';
import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ApiError, api } from '../api';
import { useAuth } from '../auth';
import { fmtDateTime } from '../format';
import { message } from '../notify';

export interface SupportItem {
  id: number;
  type: 'QUESTION' | 'COMPLAINT' | 'HANDOFF';
  bookingCode: string | null;
  contactPhone: string | null;
  subject: string;
  message: string;
  status: 'OPEN' | 'ANSWERED' | 'CLOSED';
  reply: string | null;
  repliedAt: string | null;
  createdAt: string;
  chatSessionId?: string | null;
  user?: { fullName: string; email: string } | null;
}

export const SUPPORT_TYPE: Record<SupportItem['type'], string> = { QUESTION: 'Câu hỏi', COMPLAINT: 'Khiếu nại', HANDOFF: 'Từ chatbot' };
export const SUPPORT_STATUS: Record<SupportItem['status'], { label: string; color: string }> = {
  OPEN: { label: 'Chờ xử lý', color: 'gold' },
  ANSWERED: { label: 'Đã trả lời', color: 'green' },
  CLOSED: { label: 'Đã đóng', color: 'default' },
};

/** F34: gửi câu hỏi / khiếu nại, xem phản hồi */
const HELP = [
  { icon: <FileSearchOutlined />, title: 'Tra cứu vé', text: 'Bằng mã vé và số điện thoại', to: '/tra-cuu' },
  { icon: <SwapOutlined />, title: 'Đổi chuyến', text: 'Miễn phí nếu đổi trước 12 giờ', to: '/ve-cua-toi' },
  { icon: <UndoOutlined />, title: 'Hủy vé, hoàn tiền', text: 'Theo mốc thời gian trước giờ chạy', to: '/ve-cua-toi' },
];

/** Câu hỏi thường gặp – nội dung khớp chính sách đang áp dụng trong hệ thống (chân trang, trang hủy vé). */
const FAQ = [
  { q: 'Hủy vé được hoàn bao nhiêu tiền?', a: 'Hủy trước giờ khởi hành từ 24 giờ: phí 10% giá vé. Từ 4 đến dưới 24 giờ: phí 30%. Dưới 4 giờ thì không hủy được trên web.' },
  { q: 'Tôi muốn đổi sang chuyến khác thì làm thế nào?', a: 'Vào "Vé của tôi", chọn "Đổi chuyến". Đổi miễn phí nếu còn trước giờ khởi hành từ 12 giờ, chuyến mới cùng tuyến và còn ghế.' },
  { q: 'Không nhận được email vé thì sao?', a: 'Bạn vẫn xem được vé và mã QR ở trang "Tra cứu vé" bằng mã vé và số điện thoại lúc đặt, hoặc trong "Vé của tôi" nếu đã đăng nhập.' },
  { q: 'Ghế được giữ cho tôi bao lâu?', a: 'Khi bạn chọn ghế, ghế được giữ riêng 10 phút để nhập thông tin và thanh toán. Hết thời gian mà chưa thanh toán thì ghế được mở lại cho người khác.' },
  { q: 'Ghế màu hồng là gì?', a: 'Đó là ghế dành cho nữ. Khi đặt ghế này, hành khách ngồi ghế phải có giới tính nữ.' },
];

export function Support() {
  const { user } = useAuth();
  const [params] = useSearchParams();
  const [form] = Form.useForm();
  const [type, setType] = useState<'QUESTION' | 'COMPLAINT'>('QUESTION');
  const [mine, setMine] = useState<SupportItem[]>([]);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    if (user) api<SupportItem[]>('/support/me').then(setMine).catch(() => setMine([]));
  };
  useEffect(load, [user]);
  useEffect(() => {
    const ve = params.get('ve');
    if (ve) {
      form.setFieldsValue({ bookingCode: ve });
      setType('COMPLAINT');
    }
  }, [params]);

  const submit = async (v: { subject: string; message: string; bookingCode?: string; contactPhone?: string }) => {
    setError(null);
    try {
      await api('/support', { method: 'POST', body: { type, subject: v.subject, message: v.message, bookingCode: v.bookingCode || undefined, contactPhone: v.contactPhone || undefined } });
      setSent(true);
      form.resetFields();
      message.success('Đã gửi yêu cầu hỗ trợ');
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Không gửi được yêu cầu');
    }
  };

  return (
    <>
    <div className="support-hero">
      <div className="container page-hero">
        <span className="ph-pill">
          <CustomerServiceOutlined /> Hỗ trợ khách hàng
        </span>
        <h1>Trung tâm trợ giúp</h1>
        <p className="muted">Xem nhanh các câu hỏi thường gặp, hoặc gửi yêu cầu để nhân viên trả lời qua email{user ? ' và hiển thị tại đây' : ''}.</p>
      </div>
    </div>
    <div className="container section narrow support">
      <div className="help-cards">
        {HELP.map((h) => (
          <Link key={h.title} to={h.to} className="help-card">
            <span className="th-benefit-icon">{h.icon}</span>
            <b>{h.title}</b>
            <small>{h.text}</small>
          </Link>
        ))}
      </div>
      <h2 className="sec-h">
        <MessageOutlined /> Câu hỏi thường gặp
      </h2>
      <Collapse className="faq" accordion items={FAQ.map((f, i) => ({ key: i, label: f.q, children: <p>{f.a}</p> }))} />
      <h2 className="sec-h">
        <CustomerServiceOutlined /> Gửi yêu cầu hỗ trợ
      </h2>
      <section className="card">
        <Segmented
          value={type}
          onChange={(v) => setType(v as typeof type)}
          options={[
            { value: 'QUESTION', label: 'Đặt câu hỏi' },
            { value: 'COMPLAINT', label: 'Khiếu nại' },
          ]}
          style={{ marginBottom: 16 }}
        />
        {sent && <Alert type="success" showIcon message="Đã nhận yêu cầu. Cảm ơn bạn!" style={{ marginBottom: 12 }} closable onClose={() => setSent(false)} />}
        <Form form={form} layout="vertical" onFinish={submit} requiredMark={false}>
          <Form.Item name="subject" label="Tiêu đề" rules={[{ required: true, min: 3, message: 'Nhập tiêu đề' }]}>
            <Input id="sup-subject" maxLength={150} />
          </Form.Item>
          <Form.Item name="message" label="Nội dung" rules={[{ required: true, min: 5, message: 'Nội dung tối thiểu 5 ký tự' }]}>
            <Input.TextArea id="sup-message" rows={4} maxLength={3000} />
          </Form.Item>
          <div className="two-col">
            <Form.Item name="bookingCode" label="Mã vé liên quan (nếu có)">
              <Input id="sup-code" />
            </Form.Item>
            {!user && (
              <Form.Item name="contactPhone" label="Số điện thoại liên hệ" rules={[{ required: true, pattern: /^0\d{9}$/, message: 'Số điện thoại 10 số' }]}>
                <Input id="sup-phone" />
              </Form.Item>
            )}
          </div>
          {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 12 }} />}
          <button className="btn-primary" type="submit">
            Gửi yêu cầu
          </button>
        </Form>
      </section>
      {user && (
        <>
          <h2 style={{ marginTop: 28 }}>Yêu cầu của tôi</h2>
          {!mine.length && <Empty description="Chưa có yêu cầu nào" />}
          {mine.map((s) => (
            <article key={s.id} className="card support-item">
              <div className="support-head">
                <b>{s.subject}</b>
                <span>
                  <Tag>{SUPPORT_TYPE[s.type]}</Tag>
                  <Tag color={SUPPORT_STATUS[s.status].color}>{SUPPORT_STATUS[s.status].label}</Tag>
                </span>
              </div>
              <p>{s.message}</p>
              <small className="muted">
                {fmtDateTime(s.createdAt)}
                {s.bookingCode ? ` · Vé ${s.bookingCode}` : ''}
              </small>
              {s.reply && (
                <div className="support-reply">
                  <b>Nhân viên trả lời:</b> {s.reply}
                </div>
              )}
            </article>
          ))}
        </>
      )}
    </div>
    </>
  );
}
