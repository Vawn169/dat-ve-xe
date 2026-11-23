import { Controller, Get, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AdminModule } from './admin/admin.module';
import { AuditInterceptor } from './admin/audit.interceptor';
import { AuthModule } from './auth/auth.module';
import { BookingModule } from './booking/booking.module';
import { CatalogModule } from './catalog/catalog.module';
import { ChatModule } from './chat/chat.module';
import { ChatbotToolsModule } from './chatbot-tools/chatbot-tools.controller';
import { CouponsModule } from './coupons/coupons.module';
import { MailModule } from './mail/mail.service';
import { SupportModule } from './support/support.module';
import { Public } from './common/decorators/auth.decorators';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { validateEnv } from './config/env.validation';
import { PaymentModule } from './payment/payment.module';
import { PrismaModule, PrismaService } from './prisma/prisma.service';
import { RedisModule, RedisService } from './redis/redis.service';

@Controller('health')
class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  /** Kiểm tra server, PostgreSQL, Redis (dùng để "đánh thức" server trước khi demo) */
  @Public()
  @Get()
  async check() {
    await this.prisma.$queryRaw`SELECT 1`;
    await this.redis.client.ping();
    return { status: 'ok', time: new Date().toISOString() };
  }
}

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    ThrottlerModule.forRoot({
      throttlers: [{ ttl: 60_000, limit: 120 }],
      // Chỉ bật DISABLE_THROTTLE=true khi chạy kiểm thử tải/đồng thời trên máy dev
      skipIf: () => process.env.DISABLE_THROTTLE === 'true',
    }),
    ScheduleModule.forRoot(),
    PrismaModule,
    RedisModule,
    MailModule,
    AuthModule,
    CatalogModule,
    BookingModule,
    PaymentModule,
    ChatbotToolsModule,
    CouponsModule,
    SupportModule,
    AdminModule,
    ChatModule,
  ],
  controllers: [HealthController],
  providers: [
    // Thứ tự quan trọng: giới hạn tần suất → xác thực → phân quyền
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    // F35: nhật ký thao tác của nhân viên / quản trị
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
  ],
})
export class AppModule {}
