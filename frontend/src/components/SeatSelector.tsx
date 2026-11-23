import { ClockCircleOutlined, EnvironmentOutlined, WomanOutlined } from '@ant-design/icons';
import { Radio, Spin, Tooltip } from 'antd';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import { ApiError, api } from '../api';
import { useAuth } from '../auth';
import { addMinutes, fmtTime, mapsLink, money } from '../format';
import { message } from '../notify';
import type { PickedSeats, Seat, SeatMap, SeatStatus, Stop, TripDetail } from '../types';
import { mmss, useCountdown } from './useCountdown';

const MAX_SEATS = 5;
const STATUS_TEXT: Record<SeatStatus, string> = {
  AVAILABLE: 'Còn trống',
  HELD: 'Người khác đang giữ',
  HELD_BY_ME: 'Bạn đang giữ',
  SOLD: 'Đã bán',
  BLOCKED: 'Không bán',
};

interface Props {
  tripId: number;
  busType: string;
  departAt: string;
  /** book: khách đặt vé (mặc định) · change: đổi chuyến · counter: nhân viên bán tại quầy */
  mode?: 'book' | 'change' | 'counter';
  /** Số ghế bắt buộc phải chọn (đổi chuyến) */
  exactCount?: number;
  continueLabel?: string;
  onContinue?: (p: PickedSeats) => void;
}

/** Sơ đồ ghế + chọn điểm đón/trả, mở ngay dưới thẻ chuyến (giống cách redBus làm) */
export function SeatSelector({ tripId, busType, departAt, mode = 'book', exactCount, continueLabel, onContinue }: Props) {
  const { user, requireLogin } = useAuth();
  const nav = useNavigate();
  const [map, setMap] = useState<SeatMap | null>(null);
  const [detail, setDetail] = useState<TripDetail | null>(null);
  const [mine, setMine] = useState<number[]>([]);
  const mineRef = useRef<Set<number>>(new Set());
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [pickup, setPickup] = useState<number>();
  const [dropoff, setDropoff] = useState<number>();
  const [busy, setBusy] = useState<number | null>(null);
  const [live, setLive] = useState(false);
  const left = useCountdown(expiresAt);
  const sleeper = /giường|cabin/i.test(busType);
  const limit = exactCount ?? MAX_SEATS;

  const load = useCallback(async () => {
    const [m, d] = await Promise.all([api<SeatMap>(`/trips/${tripId}/seats`), api<TripDetail>(`/trips/${tripId}`)]);
    const held = m.seats.filter((s) => s.status === 'HELD_BY_ME').map((s) => s.seatId);
    mineRef.current = new Set(held);
    setMine(held);
    setMap(m);
    setDetail(d);
    if (!held.length) setExpiresAt(null);
    const stops = d.route.stops;
    setPickup((p) => p ?? stops.find((s) => s.type !== 'DROPOFF')?.id);
    setDropoff((p) => p ?? [...stops].reverse().find((s) => s.type !== 'PICKUP')?.id);
  }, [tripId]);

  useEffect(() => {
    load().catch((e) => message.error(e instanceof ApiError ? e.message : 'Không tải được sơ đồ ghế'));
  }, [load, user?.id]);

  // Nhận cập nhật trạng thái ghế từ người khác theo thời gian thực
  useEffect(() => {
    const s = io('/seats', { transports: ['websocket'] });
    s.on('connect', () => {
      s.emit('join', { tripId });
      setLive(true);
    });
    s.on('disconnect', () => setLive(false));
    s.on('seats:update', (e: { tripId: number; seatIds: number[]; status: 'HELD' | 'SOLD' | 'AVAILABLE' }) => {
      setMap(
        (prev) =>
          prev && {
            ...prev,
            seats: prev.seats.map((seat) => {
              if (!e.seatIds.includes(seat.seatId)) return seat;
              if (e.status === 'HELD') return { ...seat, status: mineRef.current.has(seat.seatId) ? 'HELD_BY_ME' : 'HELD' };
              return { ...seat, status: e.status };
            }),
          },
      );
    });
    return () => {
      s.disconnect();
    };
  }, [tripId]);

  useEffect(() => {
    if (left === 0 && mine.length) {
      message.warning('Hết thời gian giữ ghế, vui lòng chọn lại');
      load().catch(() => undefined);
    }
  }, [left]);

  const setSeatStatus = (seatId: number, status: SeatStatus) =>
    setMap((prev) => prev && { ...prev, seats: prev.seats.map((s) => (s.seatId === seatId ? { ...s, status } : s)) });

  const toggle = async (seat: Seat) => {
    if (!requireLogin()) return;
    if (busy) return;
    if (seat.status === 'AVAILABLE') {
      if (mine.length >= limit) {
        message.info(exactCount ? `Cần chọn đúng ${exactCount} ghế` : `Mỗi lần đặt tối đa ${MAX_SEATS} ghế`);
        return;
      }
      if (seat.femaleOnly) message.info(`Ghế ${seat.code} dành cho nữ – hành khách ngồi ghế này cần khai giới tính Nữ`);
      setBusy(seat.seatId);
      mineRef.current.add(seat.seatId);
      try {
        const r = await api<{ expiresInSeconds: number }>(`/trips/${tripId}/holds`, { method: 'POST', body: { seatIds: [seat.seatId] } });
        setMine((m) => [...m, seat.seatId]);
        setSeatStatus(seat.seatId, 'HELD_BY_ME');
        setExpiresAt(Date.now() + r.expiresInSeconds * 1000);
      } catch (e) {
        mineRef.current.delete(seat.seatId);
        message.error(e instanceof ApiError ? e.message : 'Không giữ được ghế');
        load().catch(() => undefined);
      } finally {
        setBusy(null);
      }
    } else if (seat.status === 'HELD_BY_ME') {
      setBusy(seat.seatId);
      try {
        await api(`/trips/${tripId}/holds`, { method: 'DELETE', body: { seatIds: [seat.seatId] } });
        mineRef.current.delete(seat.seatId);
        const rest = mine.filter((id) => id !== seat.seatId);
        setMine(rest);
        setSeatStatus(seat.seatId, 'AVAILABLE');
        if (!rest.length) setExpiresAt(null);
      } catch (e) {
        message.error(e instanceof ApiError ? e.message : 'Không bỏ chọn được ghế');
      } finally {
        setBusy(null);
      }
    }
  };

  if (!map || !detail) {
    return (
      <div className="seat-panel loading">
        <Spin /> Đang tải sơ đồ ghế…
      </div>
    );
  }

  const stops = detail.route.stops;
  const pickups = stops.filter((s) => s.type !== 'DROPOFF');
  const dropoffs = stops.filter((s) => s.type !== 'PICKUP');
  const selected = map.seats.filter((s) => mine.includes(s.seatId));
  const total = selected.reduce((sum, s) => sum + s.price, 0);
  const enough = exactCount ? selected.length === exactCount : selected.length > 0;

  const goNext = () => {
    if (!enough || !pickup || !dropoff) {
      message.warning(exactCount ? `Chọn đúng ${exactCount} ghế` : 'Chọn ít nhất 1 ghế, điểm đón và điểm trả');
      return;
    }
    const picked: PickedSeats = {
      tripId,
      seatIds: selected.map((s) => s.seatId),
      seatCodes: selected.map((s) => s.code),
      femaleOnly: selected.map((s) => s.femaleOnly),
      prices: selected.map((s) => s.price),
      pickupStopId: pickup,
      dropoffStopId: dropoff,
      expiresAt: expiresAt ?? Date.now() + map.holdTtlSeconds * 1000,
    };
    if (onContinue) return onContinue(picked);
    try {
      sessionStorage.setItem('dvx_checkout', JSON.stringify(picked));
    } catch {
      /* bỏ qua */
    }
    nav('/dat-ve', { state: picked });
  };

  const stopLabel = (s: Stop) => (
    <div className="stop-opt">
      <b>{fmtTime(addMinutes(departAt, s.offsetMinutes))}</b> · {s.name}
      <small>
        {s.address} ·{' '}
        <a href={mapsLink(s)} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
          Xem bản đồ
        </a>
      </small>
    </div>
  );
  const prices = [...new Set(map.seats.map((s) => s.price))].sort((a, b) => a - b);

  return (
    <div className="seat-panel">
      <div className="seat-left">
        <div className="seat-legend">
          <span>
            <i className="seat-dot AVAILABLE" /> Còn trống
          </span>
          <span>
            <i className="seat-dot HELD_BY_ME" /> Đang chọn
          </span>
          <span>
            <i className="seat-dot HELD" /> Người khác giữ
          </span>
          <span>
            <i className="seat-dot SOLD" /> Đã bán
          </span>
          <span>
            <i className="seat-dot AVAILABLE female" /> Dành cho nữ
          </span>
          <span className={`live ${live ? 'on' : ''}`}>{live ? '● Cập nhật trực tiếp' : '○ Đang kết nối…'}</span>
        </div>
        {prices.length > 1 && <p className="muted price-note">Giá ghế: {prices.map(money).join(' · ')} (tầng dưới / hàng đầu có phụ thu)</p>}
        <div className="decks">
          {Array.from({ length: map.layout.floors }, (_, i) => i + 1).map((floor) => (
            <div className="deck" key={floor}>
              <div className="deck-title">
                {map.layout.floors > 1 ? (floor === 1 ? 'Tầng dưới' : 'Tầng trên') : 'Sơ đồ ghế'}
                {floor === 1 && <span className="driver" title="Tài xế" />}
              </div>
              <div className="deck-grid" style={{ gridTemplateColumns: `repeat(${map.layout.cols}, var(--seat-w))` }}>
                {map.seats
                  .filter((s) => s.floor === floor)
                  .map((s) => (
                    <Tooltip key={s.seatId} title={`${s.code} · ${money(s.price)} · ${STATUS_TEXT[s.status]}${s.femaleOnly ? ' · Dành cho nữ' : ''}`}>
                      <button
                        type="button"
                        className={`seat ${s.status} ${sleeper ? 'sleeper' : ''} ${s.femaleOnly ? 'female' : ''} ${busy === s.seatId ? 'busy' : ''}`}
                        style={{ gridRow: s.rowNo, gridColumn: s.colNo }}
                        disabled={s.status === 'SOLD' || s.status === 'HELD' || s.status === 'BLOCKED'}
                        aria-pressed={s.status === 'HELD_BY_ME'}
                        aria-label={`Ghế ${s.code}, ${STATUS_TEXT[s.status]}${s.femaleOnly ? ', dành cho nữ' : ''}`}
                        onClick={() => toggle(s)}
                      >
                        <span className="seat-code">
                          {s.femaleOnly && <WomanOutlined className="seat-icon" />}
                          {s.code}
                        </span>
                        <small className="seat-sub">
                          {s.status === 'SOLD' || s.status === 'BLOCKED'
                            ? 'Đã bán'
                            : s.status === 'HELD'
                              ? 'Đang giữ'
                              : `${Math.round(s.price / 1000)}k`}
                        </small>
                      </button>
                    </Tooltip>
                  ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="seat-right">
        {left !== null && selected.length > 0 && (
          <div className={`hold-banner ${left < 60 ? 'urgent' : ''}`}>
            <ClockCircleOutlined /> Ghế được giữ cho bạn trong <b>{mmss(left)}</b>
          </div>
        )}
        <h4>
          <EnvironmentOutlined /> Điểm đón
        </h4>
        <Radio.Group value={pickup} onChange={(e) => setPickup(e.target.value)} className="stop-list">
          {pickups.map((s) => (
            <Radio key={s.id} value={s.id}>
              {stopLabel(s)}
            </Radio>
          ))}
        </Radio.Group>
        <h4>
          <EnvironmentOutlined /> Điểm trả
        </h4>
        <Radio.Group value={dropoff} onChange={(e) => setDropoff(e.target.value)} className="stop-list">
          {dropoffs.map((s) => (
            <Radio key={s.id} value={s.id}>
              {stopLabel(s)}
            </Radio>
          ))}
        </Radio.Group>

        <div className="seat-summary">
          <div className="row">
            <span>Ghế đã chọn{exactCount ? ` (cần ${exactCount})` : ''}</span>
            <b>{selected.length ? '' : 'Chưa chọn'}</b>
          </div>
          {selected.length > 0 && (
            <div className="seat-picked">
              {selected.map((s) => (
                <span key={s.seatId}>{s.code}</span>
              ))}
            </div>
          )}
          <div className="row total">
            <span>Tạm tính</span>
            <b>{money(total)}</b>
          </div>
          {left !== null && selected.length > 0 && (
            <div className={`hold-timer ${left < 60 ? 'urgent' : ''}`}>
              <ClockCircleOutlined /> Giữ ghế còn <b>{mmss(left)}</b>
            </div>
          )}
          <button className="btn-primary btn-block" disabled={!enough} onClick={goNext}>
            {continueLabel ?? (mode === 'counter' ? 'Nhập thông tin khách' : 'Tiếp tục')}
          </button>
          {!user && <p className="hint">Bấm vào ghế để chọn, hệ thống sẽ yêu cầu đăng nhập.</p>}
        </div>
      </div>
    </div>
  );
}
