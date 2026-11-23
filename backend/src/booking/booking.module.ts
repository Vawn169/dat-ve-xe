import { Module } from '@nestjs/common';
import { CouponsModule } from '../coupons/coupons.module';
import { RealtimeModule } from '../realtime/seats.gateway';
import { BookingController, SeatsController, StaffController } from './booking.controller';
import { BookingService } from './booking.service';
import { HoldService } from './hold.service';

@Module({
  imports: [RealtimeModule, CouponsModule],
  controllers: [SeatsController, BookingController, StaffController],
  providers: [BookingService, HoldService],
  exports: [BookingService],
})
export class BookingModule {}
