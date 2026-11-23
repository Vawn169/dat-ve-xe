import { CloseOutlined, CustomerServiceOutlined, MessageOutlined, SendOutlined } from '@ant-design/icons';
import { Input } from 'antd';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError, api } from '../api';
import { useAuth } from '../auth';
import { fmtTime, money } from '../format';
import { message as notify } from '../notify';
import type { TripSummary } from '../types';

interface Msg {
  role: 'user' | 'bot';
  text: string;
  trips?: TripSummary[];
  handoff?: boolean;
}

const SID_KEY = 'dvx_chat_sid';
const SUGGESTIONS = ['Tối nay có xe đi Đà Lạt không?', 'Chính sách hủy vé thế nào?', 'Được mang bao nhiêu kg hành lý?'];

const ymdVN = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(iso));

/** F21, F22: chatbot tìm chuyến, trả lời chính sách, chuyển nhân viên */
export function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([
    { role: 'bot', text: 'Xin chào! Mình là trợ lý đặt vé. Bạn có thể hỏi chuyến xe (ví dụ "mai có xe đi Cần Thơ buổi sáng không"), tra vé, hoặc hỏi chính sách hủy, đổi, hành lý.' },
  ]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [phone, setPhone] = useState('');
  const [askPhone, setAskPhone] = useState(false);
  const sid = useRef<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const nav = useNavigate();
  const { user } = useAuth();

  useEffect(() => {
    try {
      sid.current = sessionStorage.getItem(SID_KEY);
    } catch {
      /* bỏ qua */
    }
  }, []);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [msgs, open, askPhone]);

  const send = async (q: string) => {
    const m = q.trim();
    if (!m || busy) return;
    setText('');
    setMsgs((x) => [...x, { role: 'user', text: m }]);
    setBusy(true);
    try {
      const r = await api<{ sessionId: string; reply: string; trips: TripSummary[]; mode: string; suggestHandoff: boolean }>('/chat', {
        method: 'POST',
        body: { sessionId: sid.current ?? undefined, message: m },
      });
      sid.current = r.sessionId;
      try {
        sessionStorage.setItem(SID_KEY, r.sessionId);
      } catch {
        /* bỏ qua */
      }
      setMsgs((x) => [...x, { role: 'bot', text: r.reply, trips: r.trips, handoff: r.suggestHandoff }]);
    } catch (e) {
      setMsgs((x) => [...x, { role: 'bot', text: e instanceof ApiError ? e.message : 'Xin lỗi, mình đang gặp sự cố. Bạn thử lại sau nhé.', handoff: true }]);
    } finally {
      setBusy(false);
    }
  };

  const handoff = async () => {
    if (!user && !/^0\d{9}$/.test(phone)) {
      setAskPhone(true);
      return;
    }
    try {
      const last = [...msgs].reverse().find((x) => x.role === 'user')?.text ?? 'Khách cần nhân viên hỗ trợ';
      await api('/support', {
        method: 'POST',
        body: { type: 'HANDOFF', subject: 'Chatbot chuyển nhân viên', message: last.length >= 5 ? last : `Khách cần hỗ trợ: ${last}`, contactPhone: user ? undefined : phone, chatSessionId: sid.current ?? undefined },
      });
      setAskPhone(false);
      setMsgs((x) => [...x, { role: 'bot', text: 'Đã chuyển cho nhân viên. Nhân viên sẽ liên hệ lại với bạn qua email hoặc số điện thoại sớm nhất.' }]);
    } catch (e) {
      notify.error(e instanceof ApiError ? e.message : 'Không gửi được yêu cầu');
    }
  };

  return (
    <>
      {open && (
        <section className="chat-box" aria-label="Trợ lý đặt vé">
          <header>
            <b>Trợ lý đặt vé</b>
            <button aria-label="Đóng" onClick={() => setOpen(false)}>
              <CloseOutlined />
            </button>
          </header>
          <div className="chat-msgs" ref={listRef}>
            {msgs.map((m, i) => (
              <div key={i} className={`msg ${m.role}`}>
                <div className="msg-text">{m.text}</div>
                {m.trips?.map((t) => (
                  <button
                    key={t.id}
                    className="chat-trip"
                    onClick={() => {
                      nav(`/tim-chuyen?${new URLSearchParams({ from: t.originCity, to: t.destinationCity, date: ymdVN(t.departAt), trip: String(t.id) })}`);
                      setOpen(false);
                    }}
                  >
                    <b>{fmtTime(t.departAt)}</b> {t.busType} · {money(t.basePrice)} · còn {t.availableSeats} chỗ <span>Chọn ghế ›</span>
                  </button>
                ))}
                {m.handoff && (
                  <button className="chat-handoff" onClick={handoff}>
                    <CustomerServiceOutlined /> Gặp nhân viên
                  </button>
                )}
              </div>
            ))}
            {askPhone && (
              <div className="msg bot">
                Bạn để lại số điện thoại để nhân viên gọi lại nhé:
                <div className="chat-phone">
                  <Input id="chat-phone" size="small" placeholder="0901234567" value={phone} onChange={(e) => setPhone(e.target.value)} onPressEnter={handoff} />
                  <button className="btn-primary" onClick={handoff}>Gửi</button>
                </div>
              </div>
            )}
            {busy && <div className="msg bot typing">Đang trả lời…</div>}
            {msgs.length === 1 && (
              <div className="chat-suggest">
                {SUGGESTIONS.map((s) => (
                  <button key={s} onClick={() => send(s)}>
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
          <footer>
            <input id="chat-input" value={text} placeholder="Nhập câu hỏi…" maxLength={500} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send(text)} />
            <button aria-label="Gửi" onClick={() => send(text)} disabled={busy || !text.trim()}>
              <SendOutlined />
            </button>
          </footer>
        </section>
      )}
      <button className="chat-fab" aria-label="Mở trợ lý đặt vé" onClick={() => setOpen((o) => !o)}>
        <MessageOutlined />
      </button>
    </>
  );
}
