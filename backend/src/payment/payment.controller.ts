import { Body, Controller, Get, HttpStatus, Inject, Ip, Post, Query, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { AuthUser, CurrentUser, Public } from '../common/decorators/auth.decorators';
import { AppException, ErrorCode } from '../common/errors';
import { CreatePaymentDto, MockPayQuery } from './dto/payment.dto';
import { PaymentService } from './payment.service';
import { MockPaymentProvider } from './providers/mock.provider';
import { PAYMENT_PROVIDER, PaymentProvider } from './providers/payment-provider';

@ApiTags('Thanh toán')
@ApiBearerAuth()
@Controller('payments')
export class PaymentController {
  private readonly frontendUrl: string;

  constructor(
    private readonly payments: PaymentService,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
    config: ConfigService,
  ) {
    this.frontendUrl = config.get<string>('FRONTEND_URL') ?? 'http://localhost:5173';
  }

  /** Tạo giao dịch và lấy URL chuyển sang trang thanh toán */
  @Post()
  create(@Body() dto: CreatePaymentDto, @CurrentUser() user: AuthUser, @Ip() ip: string) {
    return this.payments.create(dto.bookingCode, user.id, ip);
  }

  /** Callback chung (cổng giả lập) */
  @Public()
  @Get('callback')
  callback(@Query() query: Record<string, string>) {
    return this.payments.handleCallback(query);
  }

  /** VNPay chuyển khách về đây sau khi thanh toán → xử lý rồi chuyển sang trang kết quả của frontend */
  @Public()
  @Get('vnpay-return')
  async vnpayReturn(@Query() query: Record<string, string>, @Res() res: Response) {
    let status = 'failed';
    let code = '';
    try {
      const r = await this.payments.handleCallback(query);
      code = r.bookingCode;
      status = r.paymentStatus === 'SUCCESS' ? 'success' : 'failed';
    } catch {
      status = 'error';
    }
    res.redirect(`${this.frontendUrl}/thanh-toan/ket-qua?${new URLSearchParams({ code, status })}`);
  }

  /** VNPay gọi máy chủ–máy chủ (IPN). Phải trả về đúng định dạng { RspCode, Message } của VNPay. */
  @Public()
  @Get('vnpay-ipn')
  async vnpayIpn(@Query() query: Record<string, string>, @Res() res: Response) {
    try {
      const r = await this.payments.handleCallback(query);
      res.json(r.duplicate ? { RspCode: '02', Message: 'Order already confirmed' } : { RspCode: '00', Message: 'Confirm Success' });
    } catch (e) {
      const code = e instanceof AppException ? e.code : '';
      const map: Record<string, string> = {
        [ErrorCode.PAYMENT_INVALID_SIGNATURE]: '97',
        [ErrorCode.NOT_FOUND]: '01',
        [ErrorCode.PAYMENT_AMOUNT_MISMATCH]: '04',
      };
      res.json({ RspCode: map[code] ?? '99', Message: 'Error' });
    }
  }

  /**
   * CHỈ DÙNG KHI PAYMENT_PROVIDER=mock: giả lập khách trả tiền thành công/thất bại.
   * Ví dụ: GET /api/payments/mock/pay?txnRef=...&amount=...&result=success
   */
  @Public()
  @Get('mock/pay')
  mockPay(@Query() q: MockPayQuery) {
    if (!(this.provider instanceof MockPaymentProvider)) {
      throw new AppException(ErrorCode.NOT_FOUND, 'Không có chức năng này', HttpStatus.NOT_FOUND);
    }
    const status = q.result === 'success' ? 'success' : 'fail';
    const amount = Number(q.amount);
    return this.payments.handleCallback({
      txnRef: q.txnRef,
      amount: String(amount),
      status,
      signature: this.provider.sign(q.txnRef, amount, status),
    });
  }
}
