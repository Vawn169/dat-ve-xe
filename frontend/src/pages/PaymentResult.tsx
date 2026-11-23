import { Result } from 'antd';
import { Link, useSearchParams } from 'react-router-dom';

/** Trang VNPay chuyển về sau khi thanh toán (backend đã xử lý kết quả rồi chuyển hướng tới đây) */
export function PaymentResult() {
  const [params] = useSearchParams();
  const status = params.get('status');
  const code = params.get('code') ?? '';
  if (status === 'success') {
    return (
      <Result
        status="success"
        title="Thanh toán thành công!"
        subTitle={`Mã vé ${code}. Vé điện tử đã được gửi qua email.`}
        extra={<Link className="btn-primary" to="/ve-cua-toi">Xem vé của tôi</Link>}
      />
    );
  }
  return (
    <Result
      status="warning"
      title="Thanh toán chưa thành công"
      subTitle="Bạn có thể thanh toán lại trong mục Vé của tôi trước khi đơn hết hạn."
      extra={<Link className="btn-primary" to="/ve-cua-toi">Về vé của tôi</Link>}
    />
  );
}
