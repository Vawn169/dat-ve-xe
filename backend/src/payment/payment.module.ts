import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BookingModule } from '../booking/booking.module';
import { PaymentController } from './payment.controller';
import { PaymentService } from './payment.service';
import { MockPaymentProvider } from './providers/mock.provider';
import { PAYMENT_PROVIDER, PaymentProvider } from './providers/payment-provider';
import { VnpayProvider } from './providers/vnpay.provider';

@Module({
  imports: [BookingModule],
  controllers: [PaymentController],
  providers: [
    PaymentService,
    {
      provide: PAYMENT_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService): PaymentProvider => {
        const name = config.get<string>('PAYMENT_PROVIDER') ?? 'mock';
        const appUrl = config.get<string>('APP_URL') ?? 'http://localhost:3000';
        switch (name) {
          case 'mock':
            return new MockPaymentProvider(config.getOrThrow<string>('PAYMENT_SECRET'), appUrl);
          case 'vnpay':
            return new VnpayProvider(
              config.getOrThrow<string>('VNPAY_TMN_CODE'),
              config.getOrThrow<string>('VNPAY_HASH_SECRET'),
              config.get<string>('VNPAY_URL') ?? 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html',
              `${appUrl}/api/payments/vnpay-return`,
            );
          default:
            throw new Error(`PAYMENT_PROVIDER "${name}" chưa được hỗ trợ (mock | vnpay)`);
        }
      },
    },
  ],
})
export class PaymentModule {}
