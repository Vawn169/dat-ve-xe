// Thanh bước đặt vé dùng chung cho các trang đặt vé (theo thiết kế Stitch).
import { CheckOutlined } from '@ant-design/icons';

const STEPS = ['Chọn chuyến và ghế', 'Thông tin hành khách', 'Thanh toán', 'Nhận vé'];

export function BookingSteps({ current }: { current: number }) {
  return (
    <ol className="bsteps" aria-label="Các bước đặt vé">
      {STEPS.map((s, i) => (
        <li key={s} className={i < current ? 'done' : i === current ? 'now' : ''} aria-current={i === current ? 'step' : undefined}>
          <span className="bs-dot">{i < current ? <CheckOutlined /> : i + 1}</span>
          <span className="bs-label">{s}</span>
        </li>
      ))}
    </ol>
  );
}
