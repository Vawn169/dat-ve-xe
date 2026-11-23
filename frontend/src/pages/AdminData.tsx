import { Alert, Checkbox, DatePicker, Form, Input, InputNumber, Modal, Popconfirm, Segmented, Select, Switch, Table, Tag } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { useEffect, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../auth';
import { TicketCard } from '../components/TicketCard';
import { STATUS, fmtDateTime, fmtDay, money } from '../format';
import { message } from '../notify';
import type { Booking, BookingStatus, Role } from '../types';
import { errMsg } from './Admin';
import { SUPPORT_STATUS, SUPPORT_TYPE, type SupportItem } from './Support';

// ======================= Đơn / vé (F28) =======================

export function BookingsPanel() {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<BookingStatus | ''>('');
  const [rows, setRows] = useState<Booking[] | null>(null);
  const [open, setOpen] = useState<Booking | null>(null);
  const [full, setFull] = useState(false);

  const load = () => {
    setRows(null);
    const p = new URLSearchParams();
    if (q.trim()) p.set('q', q.trim());
    if (status) p.set('status', status);
    api<Booking[]>(`/bookings?${p}`).then(setRows).catch(() => setRows([]));
  };
  useEffect(load, [status]);

  const cancel = async (b: Booking) => {
    try {
      const r = await api<Booking>(`/bookings/${b.code}/cancel`, { method: 'POST', body: { fullRefund: full } });
      message.success(`Đã hủy ${b.code}${r.refundAmount != null ? `, hoàn ${money(r.refundAmount)}` : ''}`);
      setOpen(null);
      load();
    } catch (e) {
      message.error(errMsg(e, 'Không hủy được'));
    }
  };

  return (
    <div>
      <div className="toolbar">
        <Input.Search id="bk-q" placeholder="Mã vé, số điện thoại hoặc tên" value={q} onChange={(e) => setQ(e.target.value)} onSearch={load} style={{ maxWidth: 340 }} enterButton="Tìm" />
        <Select
          id="bk-status"
          value={status}
          onChange={setStatus}
          style={{ minWidth: 180 }}
          options={[{ value: '', label: 'Mọi trạng thái' }, ...Object.entries(STATUS).map(([value, s]) => ({ value, label: s.label }))]}
        />
      </div>
      <Table
        size="small"
        rowKey="code"
        loading={!rows}
        dataSource={rows ?? []}
        scroll={{ x: true }}
        onRow={(b) => ({ onClick: () => setOpen(b), style: { cursor: 'pointer' } })}
        columns={[
          { title: 'Mã vé', dataIndex: 'code' },
          { title: 'Khách', render: (_, b) => `${b.contactName} · ${b.contactPhone}` },
          { title: 'Chuyến', render: (_, b) => `${fmtDateTime(b.trip.departAt)} · ${b.trip.originCity} → ${b.trip.destinationCity}` },
          { title: 'Ghế', render: (_, b) => b.seats.map((s) => s.code).join(', ') },
          { title: 'Tiền', dataIndex: 'totalAmount', render: money, align: 'right' },
          { title: 'Kênh', dataIndex: 'channel', render: (v) => (v === 'COUNTER' ? 'Tại quầy' : 'Online') },
          { title: 'Trạng thái', dataIndex: 'status', render: (v: BookingStatus) => <Tag color={STATUS[v].color}>{STATUS[v].label}</Tag> },
        ]}
      />
      <Modal open={!!open} footer={null} onCancel={() => setOpen(null)} width={760} title={`Đơn ${open?.code ?? ''}`} destroyOnHidden>
        {open && (
          <TicketCard
            b={open}
            actions={
              (open.status === 'PAID' || open.status === 'PENDING_PAYMENT') && (
                <>
                  <Checkbox checked={full} onChange={(e) => setFull(e.target.checked)}>
                    Hoàn 100% (lỗi từ nhà xe)
                  </Checkbox>
                  <Popconfirm title={`Hủy vé ${open.code}?`} description={full ? 'Hoàn toàn bộ tiền cho khách.' : 'Hoàn theo chính sách hủy.'} okText="Hủy vé" cancelText="Không" onConfirm={() => cancel(open)}>
                    <button className="btn-outline danger">Hủy vé cho khách</button>
                  </Popconfirm>
                </>
              )
            }
          />
        )}
      </Modal>
    </div>
  );
}

// ======================= Người dùng (F29) =======================

interface AdminUser {
  id: number;
  fullName: string;
  email: string;
  phone: string;
  role: Role;
  isLocked: boolean;
  createdAt: string;
  _count: { bookings: number };
}

export function UsersPanel() {
  const { user: me } = useAuth();
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<AdminUser[] | null>(null);
  const load = () => api<AdminUser[]>(`/admin/users?q=${encodeURIComponent(q)}`).then(setRows).catch(() => setRows([]));
  useEffect(() => {
    load();
  }, []);
  const update = async (u: AdminUser, body: { role?: Role; isLocked?: boolean }) => {
    try {
      await api(`/admin/users/${u.id}`, { method: 'PATCH', body });
      message.success('Đã cập nhật');
      load();
    } catch (e) {
      message.error(errMsg(e, 'Không cập nhật được'));
    }
  };
  return (
    <div>
      <div className="toolbar">
        <Input.Search id="u-q" placeholder="Tên, email hoặc số điện thoại" value={q} onChange={(e) => setQ(e.target.value)} onSearch={load} style={{ maxWidth: 340 }} enterButton="Tìm" />
      </div>
      <Table
        size="small"
        rowKey="id"
        loading={!rows}
        dataSource={rows ?? []}
        scroll={{ x: true }}
        columns={[
          { title: 'Họ tên', dataIndex: 'fullName' },
          { title: 'Email', dataIndex: 'email' },
          { title: 'SĐT', dataIndex: 'phone' },
          { title: 'Số đơn', render: (_, u) => u._count.bookings, align: 'right' },
          {
            title: 'Vai trò',
            dataIndex: 'role',
            render: (v: Role, u) => (
              <Select
                size="small"
                value={v}
                disabled={u.id === me?.id}
                onChange={(role) => update(u, { role })}
                style={{ width: 130 }}
                aria-label={`Vai trò của ${u.fullName}`}
                options={[
                  { value: 'CUSTOMER', label: 'Khách hàng' },
                  { value: 'STAFF', label: 'Nhân viên' },
                  { value: 'ADMIN', label: 'Quản trị' },
                ]}
              />
            ),
          },
          {
            title: 'Khóa',
            dataIndex: 'isLocked',
            render: (v: boolean, u) => <Switch size="small" checked={v} disabled={u.id === me?.id} onChange={(isLocked) => update(u, { isLocked })} aria-label={`Khóa tài khoản ${u.fullName}`} />,
          },
        ]}
      />
    </div>
  );
}

// ======================= Mã giảm giá (F31) =======================

interface Coupon {
  id: number;
  code: string;
  description: string | null;
  percent: number | null;
  amount: number | null;
  maxDiscount: number | null;
  minOrder: number;
  usageLimit: number | null;
  usedCount: number;
  validFrom: string;
  validTo: string;
  isActive: boolean;
}

export function CouponsPanel() {
  const [rows, setRows] = useState<Coupon[]>([]);
  const [adding, setAdding] = useState(false);
  const [kind, setKind] = useState<'percent' | 'amount'>('percent');
  const [form] = Form.useForm();
  const load = () => api<Coupon[]>('/admin/coupons').then(setRows).catch(() => undefined);
  useEffect(() => {
    load();
  }, []);

  const toggle = async (c: Coupon, isActive: boolean) => {
    try {
      await api(`/admin/coupons/${c.id}`, { method: 'PATCH', body: { isActive } });
      load();
    } catch (e) {
      message.error(errMsg(e, 'Không cập nhật được'));
    }
  };

  const add = async (v: { code: string; description?: string; value: number; maxDiscount?: number; minOrder?: number; usageLimit?: number; range: [Dayjs, Dayjs] }) => {
    try {
      await api('/admin/coupons', {
        method: 'POST',
        body: {
          code: v.code.trim().toUpperCase(),
          description: v.description || undefined,
          percent: kind === 'percent' ? v.value : undefined,
          amount: kind === 'amount' ? v.value : undefined,
          maxDiscount: kind === 'percent' ? v.maxDiscount ?? undefined : undefined,
          minOrder: v.minOrder ?? 0,
          usageLimit: v.usageLimit ?? undefined,
          validFrom: v.range[0].startOf('day').toISOString(),
          validTo: v.range[1].endOf('day').toISOString(),
        },
      });
      setAdding(false);
      form.resetFields();
      load();
      message.success('Đã tạo mã giảm giá');
    } catch (e) {
      message.error(errMsg(e, 'Không tạo được mã'));
    }
  };

  const now = new Date().toISOString();
  return (
    <div>
      <div className="toolbar">
        <button className="btn-primary" onClick={() => setAdding(true)}>
          Tạo mã giảm giá
        </button>
      </div>
      <Table
        size="small"
        rowKey="id"
        dataSource={rows}
        pagination={false}
        scroll={{ x: true }}
        columns={[
          { title: 'Mã', dataIndex: 'code', render: (v) => <b>{v}</b> },
          { title: 'Giảm', render: (_, c) => (c.percent ? `${c.percent}%${c.maxDiscount ? ` (tối đa ${money(c.maxDiscount)})` : ''}` : money(c.amount ?? 0)) },
          { title: 'Đơn tối thiểu', dataIndex: 'minOrder', render: money, align: 'right' },
          { title: 'Đã dùng', render: (_, c) => `${c.usedCount}${c.usageLimit ? `/${c.usageLimit}` : ''}`, align: 'right' },
          { title: 'Hiệu lực', render: (_, c) => `${fmtDay(c.validFrom)} – ${fmtDay(c.validTo)}` },
          { title: 'Tình trạng', render: (_, c) => (c.validTo < now ? <Tag>Hết hạn</Tag> : c.validFrom > now ? <Tag color="blue">Chưa tới ngày</Tag> : <Tag color="green">Trong hạn</Tag>) },
          { title: 'Bật', dataIndex: 'isActive', render: (v, c) => <Switch size="small" checked={v} onChange={(x) => toggle(c, x)} aria-label={`Bật tắt mã ${c.code}`} /> },
        ]}
      />
      <Modal open={adding} title="Tạo mã giảm giá" onCancel={() => setAdding(false)} onOk={() => form.submit()} okText="Tạo" cancelText="Hủy" forceRender>
        <Form form={form} layout="vertical" onFinish={add} requiredMark={false} initialValues={{ range: [dayjs(), dayjs().add(30, 'day')], minOrder: 0 }}>
          <Form.Item name="code" label="Mã (chữ in hoa, số)" rules={[{ required: true, pattern: /^[A-Za-z0-9]{3,20}$/, message: '3–20 ký tự chữ hoặc số' }]}>
            <Input id="cp-code" />
          </Form.Item>
          <Form.Item name="description" label="Mô tả">
            <Input id="cp-desc" />
          </Form.Item>
          <Segmented value={kind} onChange={(v) => setKind(v as typeof kind)} options={[{ value: 'percent', label: 'Giảm theo %' }, { value: 'amount', label: 'Giảm số tiền' }]} style={{ marginBottom: 12 }} />
          <div className="two-col">
            <Form.Item name="value" label={kind === 'percent' ? 'Phần trăm giảm' : 'Số tiền giảm (đ)'} rules={[{ required: true, message: 'Nhập mức giảm' }]}>
              <InputNumber id="cp-value" min={kind === 'percent' ? 1 : 1000} max={kind === 'percent' ? 100 : undefined} style={{ width: '100%' }} />
            </Form.Item>
            {kind === 'percent' && (
              <Form.Item name="maxDiscount" label="Giảm tối đa (đ)">
                <InputNumber id="cp-max" min={0} step={10000} style={{ width: '100%' }} />
              </Form.Item>
            )}
            <Form.Item name="minOrder" label="Đơn tối thiểu (đ)">
              <InputNumber id="cp-min" min={0} step={10000} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="usageLimit" label="Số lượt dùng tối đa">
              <InputNumber id="cp-limit" min={1} style={{ width: '100%' }} />
            </Form.Item>
          </div>
          <Form.Item name="range" label="Thời gian hiệu lực" rules={[{ required: true }]}>
            <DatePicker.RangePicker id="cp-range" format="DD/MM/YYYY" style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

// ======================= Tri thức chatbot & lịch sử chat (F32) =======================

interface KbDoc {
  id: number;
  title: string;
  content: string;
  updatedAt: string;
}

export function KbPanel() {
  const [rows, setRows] = useState<KbDoc[]>([]);
  const [editing, setEditing] = useState<Partial<KbDoc> | null>(null);
  const [form] = Form.useForm();
  const load = () => api<KbDoc[]>('/admin/kb').then(setRows).catch(() => undefined);
  useEffect(() => {
    load();
  }, []);
  useEffect(() => {
    if (editing) form.setFieldsValue({ title: editing.title, content: editing.content });
    else form.resetFields();
  }, [editing]);

  const save = async (v: { title: string; content: string }) => {
    try {
      if (editing?.id) await api(`/admin/kb/${editing.id}`, { method: 'PATCH', body: v });
      else await api('/admin/kb', { method: 'POST', body: v });
      setEditing(null);
      load();
      message.success('Đã lưu. Chatbot dùng nội dung mới ngay ở câu hỏi tiếp theo.');
    } catch (e) {
      message.error(errMsg(e, 'Không lưu được'));
    }
  };
  const del = async (id: number) => {
    try {
      await api(`/admin/kb/${id}`, { method: 'DELETE' });
      load();
    } catch (e) {
      message.error(errMsg(e, 'Không xóa được'));
    }
  };

  return (
    <div>
      <p className="hint">Chatbot tra cứu các tài liệu này khi khách hỏi về chính sách, hành lý, đổi trả… Sửa ở đây thì câu trả lời đổi theo, không cần sửa code.</p>
      <div className="toolbar">
        <button className="btn-primary" onClick={() => setEditing({})}>
          Thêm tài liệu
        </button>
      </div>
      {rows.map((d) => (
        <section key={d.id} className="card kb-item">
          <div className="page-head">
            <h3>{d.title}</h3>
            <span className="row-actions">
              <button className="btn-ghost" onClick={() => setEditing(d)}>
                Sửa
              </button>
              <Popconfirm title="Xóa tài liệu này?" okText="Xóa" cancelText="Không" onConfirm={() => del(d.id)}>
                <button className="btn-ghost danger">Xóa</button>
              </Popconfirm>
            </span>
          </div>
          <p>{d.content}</p>
          <small className="muted">Cập nhật {fmtDateTime(d.updatedAt)}</small>
        </section>
      ))}
      <Modal open={!!editing} title={editing?.id ? 'Sửa tài liệu' : 'Thêm tài liệu'} onCancel={() => setEditing(null)} onOk={() => form.submit()} okText="Lưu" cancelText="Hủy" width={640} forceRender>
        <Form form={form} layout="vertical" onFinish={save} requiredMark={false}>
          <Form.Item name="title" label="Tiêu đề" rules={[{ required: true, min: 2 }]}>
            <Input id="kb-title" />
          </Form.Item>
          <Form.Item name="content" label="Nội dung" rules={[{ required: true, min: 2 }]}>
            <Input.TextArea id="kb-content" rows={6} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

interface ChatSession {
  id: string;
  startedAt: string;
  user: string;
  count: number;
  messages: { id: number; role: string; content: string; createdAt: string }[];
}

export function ChatsPanel() {
  const [rows, setRows] = useState<ChatSession[]>([]);
  useEffect(() => {
    api<ChatSession[]>('/admin/chats').then(setRows).catch(() => undefined);
  }, []);
  return (
    <Table
      size="small"
      rowKey="id"
      dataSource={rows}
      scroll={{ x: true }}
      expandable={{
        expandedRowRender: (s) => (
          <div className="chat-log">
            {s.messages.map((m) => (
              <div key={m.id} className={`msg ${m.role === 'user' ? 'user' : 'bot'}`}>
                <div className="msg-text">{m.content}</div>
              </div>
            ))}
          </div>
        ),
      }}
      columns={[
        { title: 'Bắt đầu', dataIndex: 'startedAt', render: fmtDateTime },
        { title: 'Người dùng', dataIndex: 'user' },
        { title: 'Số tin', dataIndex: 'count', align: 'right' },
        { title: 'Câu hỏi đầu', render: (_, s) => s.messages.find((m) => m.role === 'user')?.content ?? '' },
      ]}
    />
  );
}

// ======================= Hỗ trợ khách (F34) =======================

export function SupportPanel() {
  const [status, setStatus] = useState<'' | SupportItem['status']>('OPEN');
  const [rows, setRows] = useState<SupportItem[] | null>(null);
  const [replying, setReplying] = useState<SupportItem | null>(null);
  const [text, setText] = useState('');
  const [close, setClose] = useState(false);
  const load = () => {
    setRows(null);
    api<SupportItem[]>(`/admin/support${status ? `?status=${status}` : ''}`).then(setRows).catch(() => setRows([]));
  };
  useEffect(load, [status]);

  const send = async () => {
    if (!replying) return;
    try {
      await api(`/admin/support/${replying.id}/reply`, { method: 'POST', body: { reply: text, close } });
      setReplying(null);
      setText('');
      load();
      message.success('Đã trả lời, khách nhận email.');
    } catch (e) {
      message.error(errMsg(e, 'Không gửi được'));
    }
  };

  return (
    <div>
      <div className="toolbar">
        <Segmented
          value={status}
          onChange={(v) => setStatus(v as typeof status)}
          options={[
            { value: 'OPEN', label: 'Chờ xử lý' },
            { value: 'ANSWERED', label: 'Đã trả lời' },
            { value: 'CLOSED', label: 'Đã đóng' },
            { value: '', label: 'Tất cả' },
          ]}
        />
      </div>
      <Table
        size="small"
        rowKey="id"
        loading={!rows}
        dataSource={rows ?? []}
        scroll={{ x: true }}
        columns={[
          { title: 'Thời gian', dataIndex: 'createdAt', render: fmtDateTime },
          { title: 'Loại', dataIndex: 'type', render: (v: SupportItem['type']) => <Tag color={v === 'COMPLAINT' ? 'volcano' : v === 'HANDOFF' ? 'purple' : undefined}>{SUPPORT_TYPE[v]}</Tag> },
          { title: 'Khách', render: (_, s) => s.user?.fullName ?? s.contactPhone ?? 'Khách' },
          { title: 'Tiêu đề', dataIndex: 'subject' },
          { title: 'Nội dung', dataIndex: 'message', ellipsis: true },
          { title: 'Vé', dataIndex: 'bookingCode' },
          { title: 'Trạng thái', dataIndex: 'status', render: (v: SupportItem['status']) => <Tag color={SUPPORT_STATUS[v].color}>{SUPPORT_STATUS[v].label}</Tag> },
          {
            title: '',
            render: (_, s) => (
              <button className="btn-ghost" onClick={() => { setReplying(s); setText(s.reply ?? ''); }}>
                {s.reply ? 'Xem / sửa' : 'Trả lời'}
              </button>
            ),
          },
        ]}
      />
      <Modal open={!!replying} title={`Trả lời: ${replying?.subject ?? ''}`} onCancel={() => setReplying(null)} onOk={send} okText="Gửi trả lời" cancelText="Hủy" okButtonProps={{ disabled: text.trim().length < 2 }}>
        {replying && (
          <>
            <Alert type="info" message={replying.message} description={replying.chatSessionId ? 'Yêu cầu từ chatbot – xem đoạn chat ở mục Lịch sử chat.' : undefined} style={{ marginBottom: 12 }} />
            <Input.TextArea id="sup-reply" rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder="Nội dung trả lời gửi cho khách" />
            <Checkbox checked={close} onChange={(e) => setClose(e.target.checked)} style={{ marginTop: 8 }}>
              Đóng yêu cầu sau khi trả lời
            </Checkbox>
          </>
        )}
      </Modal>
    </div>
  );
}

// ======================= Nhật ký & hộp thư (F35) =======================

interface Audit {
  id: number;
  method: string;
  path: string;
  status: number;
  detail: unknown;
  createdAt: string;
  user: { fullName: string; role: Role } | null;
}

export function AuditPanel() {
  const [rows, setRows] = useState<Audit[]>([]);
  useEffect(() => {
    api<Audit[]>('/admin/audit-logs').then(setRows).catch(() => undefined);
  }, []);
  return (
    <>
      <p className="hint">Mọi thao tác thay đổi dữ liệu của nhân viên và quản trị viên được ghi lại (mật khẩu, token đã được che).</p>
      <Table
        size="small"
        rowKey="id"
        dataSource={rows}
        scroll={{ x: true }}
        columns={[
          { title: 'Thời gian', dataIndex: 'createdAt', render: fmtDateTime, width: 150 },
          { title: 'Người làm', render: (_, a) => (a.user ? `${a.user.fullName} (${a.user.role === 'ADMIN' ? 'QT' : 'NV'})` : '—') },
          { title: 'Thao tác', render: (_, a) => <code>{a.method} {a.path.replace(/^\/api/, '')}</code> },
          { title: 'Kết quả', dataIndex: 'status', render: (v: number) => <Tag color={v < 400 ? 'green' : 'red'}>{v}</Tag> },
          { title: 'Chi tiết', dataIndex: 'detail', render: (v) => (v ? <code className="detail">{JSON.stringify(v)}</code> : '') },
        ]}
      />
    </>
  );
}

interface Mail {
  id: number;
  to: string;
  subject: string;
  html: string;
  via: string;
  createdAt: string;
}

export function MailsPanel() {
  const [rows, setRows] = useState<Mail[]>([]);
  const [open, setOpen] = useState<Mail | null>(null);
  useEffect(() => {
    api<Mail[]>('/admin/mails').then(setRows).catch(() => undefined);
  }, []);
  return (
    <>
      <p className="hint">Bản xem trước chưa có máy chủ mail (SMTP) nên email được lưu ở đây. Khi điền SMTP vào .env, email gửi thật và vẫn được ghi lại.</p>
      <Table
        size="small"
        rowKey="id"
        dataSource={rows}
        scroll={{ x: true }}
        onRow={(m) => ({ onClick: () => setOpen(m), style: { cursor: 'pointer' } })}
        columns={[
          { title: 'Thời gian', dataIndex: 'createdAt', render: fmtDateTime, width: 150 },
          { title: 'Người nhận', dataIndex: 'to' },
          { title: 'Tiêu đề', dataIndex: 'subject' },
          { title: 'Cách gửi', dataIndex: 'via', render: (v) => <Tag>{v === 'OUTBOX' ? 'Hộp thư thử' : v}</Tag> },
        ]}
      />
      <Modal open={!!open} footer={null} onCancel={() => setOpen(null)} width={640} title={open?.subject}>
        {open && <iframe title="Nội dung email" className="mail-frame" srcDoc={open.html} sandbox="" />}
      </Modal>
    </>
  );
}
