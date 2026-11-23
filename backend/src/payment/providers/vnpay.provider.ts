import { HttpStatus } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';
import { AppException, ErrorCode } from '../../common/errors';
import { CreatePaymentInput, PaymentProvider, VerifiedCallback } from './payment-provider';

/** Sắp xếp tham số theo tên và mã hóa giá trị giống mã mẫu Node.js của VNPay (khoảng trắng → '+'). */
export function vnpSignData(params: Record<string, string>): string {
  return Object.keys(params)
    .filter((k) => params[k] !== undefined && params[k] !== '')
    .sort()
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(params[k]).replace(/%20/g, '+')}`)
    .join('&');
}

export const vnpSign = (data: string, secret: string) => createHmac('sha512', secret).update(Buffer.from(data, 'utf-8')).digest('hex');

/** yyyyMMddHHmmss theo giờ Việt Nam */
function vnStamp(d: Date): string {
  const v = new Date(d.getTime() + 7 * 3_600_000).toISOString();
  return v.slice(0, 19).replace(/[-:T]/g, '');
}

/**
 * Cổng VNPay (môi trường sandbox) – viết theo tài liệu VNPay phiên bản 2.1.0.
 * CHƯA chạy thử với tài khoản sandbox thật: cần VNPAY_TMN_CODE và VNPAY_HASH_SECRET do VNPay cấp.
 */
export class VnpayProvider implements PaymentProvider {
  readonly name = 'vnpay';

  constructor(
    private readonly tmnCode: string,
    private readonly secret: string,
    private readonly payUrl: string,
    private readonly returnUrl: string,
  ) {}

  createPaymentUrl(input: CreatePaymentInput & { expiresAt?: Date }): string {
    const now = new Date();
    const params: Record<string, string> = {
      vnp_Version: '2.1.0',
      vnp_Command: 'pay',
      vnp_TmnCode: this.tmnCode,
      vnp_Locale: 'vn',
      vnp_CurrCode: 'VND',
      vnp_TxnRef: input.txnRef,
      vnp_OrderInfo: input.orderInfo,
      vnp_OrderType: 'other',
      vnp_Amount: String(input.amount * 100),
      vnp_ReturnUrl: this.returnUrl,
      vnp_IpAddr: input.ipAddr.replace('::ffff:', '') || '127.0.0.1',
      vnp_CreateDate: vnStamp(now),
      vnp_ExpireDate: vnStamp(input.expiresAt ?? new Date(now.getTime() + 15 * 60_000)),
    };
    const data = vnpSignData(params);
    return `${this.payUrl}?${data}&vnp_SecureHash=${vnpSign(data, this.secret)}`;
  }

  verifyCallback(query: Record<string, string>): VerifiedCallback {
    const { vnp_SecureHash: given, vnp_SecureHashType: _t, ...rest } = query;
    const vnp = Object.fromEntries(Object.entries(rest).filter(([k]) => k.startsWith('vnp_')));
    const expected = vnpSign(vnpSignData(vnp), this.secret);
    const a = Buffer.from(expected);
    const b = Buffer.from(String(given ?? ''));
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new AppException(ErrorCode.PAYMENT_INVALID_SIGNATURE, 'Chữ ký VNPay không hợp lệ', HttpStatus.BAD_REQUEST);
    }
    return {
      txnRef: vnp.vnp_TxnRef,
      amount: Number(vnp.vnp_Amount) / 100,
      success: vnp.vnp_ResponseCode === '00' && vnp.vnp_TransactionStatus === '00',
    };
  }
}
