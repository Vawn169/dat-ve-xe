import { DownloadOutlined, SwapOutlined } from '@ant-design/icons';
import { Empty, Input, Modal, Popconfirm, Rate, Segmented, Skeleton } from 'antd';
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ApiError, api, download } from '../api';
import { useAuth } from '../auth';
import { TicketCard } from '../components/TicketCard';
import { money } from '../format';
import { message } from '../notify';
import type { Booking } from '../types';

export function MyTickets() {
  const { user, ready, requireLogin } = useAuth();
  const nav = useNavigate();
  const [list, setList] = useState<Booking[] | null>(null);
  const [tab, setTab] = useState<'upcoming' | 'past' | 'all'>('upcoming');
  const [reviewing, setReviewing] = useState<Booking | null>(null);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');

  const load = useCallback(() => {
    api<Booking[]>('/bookings/me')
      .then(setList)
      .catch((e) => message.error(e instanceof ApiError ? e.message : 'Không tải được vé'));
  }, []);

  // Chờ biết chắc đã/chưa đăng nhập rồi mới tải, tránh gọi API hai lần khi mở trang
  useEffect(() => {
    if (!ready) return;
    if (user) load();
    else requireLogin(load);
  }, [user?.id, ready]);

  const cancel = async (b: Booking) => {
    try {
      const r = await api<Booking>(`/bookings/${b.code}/cancel`, { method: 'POST', body: {} });
      message.success(r.refundAmount != null ? `Đã hủy vé. Số tiền hoàn: ${money(r.refundAmount)}` : 'Đã hủy đơn');
      load();
    } catch (e) {
      message.error(e instanceof ApiError ? e.message : 'Không hủy được vé');
    }
  };

  const payAgain = async (b: Booking) => {
    try {
      const p = await api<{ txnRef: string; amount: number; paymentUrl: string; provider: string }>('/payments', { method: 'POST', body: { bookingCode: b.code } });
      if (p.provider === 'vnpay') window.location.href = p.paymentUrl;
      else nav(`/thanh-toan?${new URLSearchParams({ txnRef: p.txnRef, amount: String(p.amount), code: b.code })}`);
    } catch (e) {
      message.error(e instanceof ApiError ? e.message : 'Không tạo được thanh toán');
    }
  };

  const pdf = async (b: Booking) => {
    try {
      await download(`/bookings/${b.code}/pdf`, `ve-${b.code}.pdf`);
    } catch (e) {
      message.error(e instanceof ApiError ? e.message : 'Không tải được vé');
    }
  };

  const sendReview = async () => {
    if (!reviewing) return;
    try {
      await api(`/bookings/${reviewing.code}/review`, { method: 'POST', body: { rating, comment: comment || undefined } });
      message.success('Cảm ơn bạn đã đánh giá!');
      setReviewing(null);
      setComment('');
      load();
    } catch (e) {
      message.error(e instanceof ApiError ? e.message : 'Không gửi được đánh giá');
    }
  };

  if (!user) {
    return (
      <div className="container section">
        <Empty description="Đăng nhập để xem vé của bạn">
          <button className="btn-primary" onClick={() => requireLogin(load)}>
            Đăng nhập
          </button>
        </Empty>
      </div>
    );
  }

  const now = new Date().toISOString();
  const shown = (list ?? []).filter((b) =>
    tab === 'all' ? true : tab === 'upcoming' ? b.trip.departAt > now && (b.status === 'PAID' || b.status === 'PENDING_PAYMENT') : b.trip.departAt <= now && b.status === 'PAID',
  );

  return (
    <div className="container section">
      <div className="page-head">
        <div>
          <h1>Vé của tôi</h1>
          <p className="muted">Quản lý vé đã đặt: xem mã QR, theo dõi chuyến, đổi hoặc hủy vé.</p>
        </div>
        <Segmented
          value={tab}
          onChange={(v) => setTab(v as typeof tab)}
          options={[
            { value: 'upcoming', label: 'Sắp đi' },
            { value: 'past', label: 'Đã đi' },
            { value: 'all', label: 'Tất cả' },
          ]}
        />
      </div>
      {!list && <Skeleton active />}
      {list && !shown.length && (
        <Empty description={tab === 'upcoming' ? 'Bạn chưa có chuyến sắp đi' : tab === 'past' ? 'Chưa có chuyến đã đi' : 'Bạn chưa đặt vé nào'}>
          <Link className="btn-primary" to="/">
            Tìm chuyến
          </Link>
        </Empty>
      )}
      <div className="ticket-list">
        {shown.map((b) => (
          <TicketCard
            key={b.code}
            b={b}
            actions={
              <>
                {b.status === 'PENDING_PAYMENT' && (
                  <button className="btn-primary" onClick={() => payAgain(b)}>
                    Thanh toán
                  </button>
                )}
                {b.status === 'PAID' && (
                  <button className="btn-outline" onClick={() => pdf(b)}>
                    <DownloadOutlined /> Tải vé PDF
                  </button>
                )}
                {b.canChange && (
                  <button className="btn-outline" onClick={() => nav(`/doi-ve/${b.code}`)}>
                    <SwapOutlined /> Đổi chuyến
                  </button>
                )}
                {b.canReview && (
                  <button className="btn-primary" onClick={() => setReviewing(b)}>
                    Đánh giá chuyến đi
                  </button>
                )}
                {(b.status === 'PAID' || b.status === 'PENDING_PAYMENT') && b.trip.departAt > now && (
                  <Popconfirm
                    title="Hủy vé này?"
                    description={b.status === 'PAID' ? 'Phí hủy theo chính sách: trước 24 giờ 10%, từ 4–24 giờ 30%.' : 'Đơn chưa thanh toán sẽ bị hủy.'}
                    okText="Hủy vé"
                    cancelText="Không"
                    onConfirm={() => cancel(b)}
                  >
                    <button className="btn-outline danger">Hủy vé</button>
                  </Popconfirm>
                )}
                <Link className="btn-ghost" to={`/ho-tro?ve=${b.code}`}>
                  Hỗ trợ
                </Link>
              </>
            }
          />
        ))}
      </div>
      <Modal open={!!reviewing} title={`Đánh giá chuyến ${reviewing?.trip.originCity} → ${reviewing?.trip.destinationCity}`} onCancel={() => setReviewing(null)} onOk={sendReview} okText="Gửi đánh giá" cancelText="Để sau">
        <p>Bạn chấm chuyến đi này mấy sao?</p>
        <Rate value={rating} onChange={setRating} />
        <Input.TextArea id="review-comment" rows={3} style={{ marginTop: 12 }} placeholder="Chia sẻ thêm về chuyến đi (không bắt buộc)" value={comment} onChange={(e) => setComment(e.target.value)} maxLength={1000} />
      </Modal>
    </div>
  );
}
