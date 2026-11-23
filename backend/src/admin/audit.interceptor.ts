import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Role } from '@prisma/client';
import { Observable, tap } from 'rxjs';
import { AuthUser } from '../common/decorators/auth.decorators';
import { PrismaService } from '../prisma/prisma.service';

const SECRET_KEYS = /password|token|secret/i;

function scrub(v: unknown): unknown {
  if (!v || typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.slice(0, 20).map(scrub);
  return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, SECRET_KEYS.test(k) ? '***' : scrub(x)]));
}

/**
 * F35: ghi nhật ký mọi thao tác thay đổi dữ liệu (POST/PATCH/PUT/DELETE) của nhân viên và quản trị viên.
 * Không ghi mật khẩu / token.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private readonly prisma: PrismaService) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (ctx.getType() !== 'http') return next.handle();
    const req = ctx.switchToHttp().getRequest<{ method: string; originalUrl: string; body: unknown; user?: AuthUser }>();
    const user = req.user;
    const watched = user && (user.role === Role.ADMIN || user.role === Role.STAFF) && req.method !== 'GET';
    if (!watched) return next.handle();
    const write = (status: number) =>
      this.prisma.auditLog
        .create({ data: { userId: user.id, method: req.method, path: req.originalUrl.slice(0, 300), status, detail: scrub(req.body) as object } })
        .catch(() => undefined);
    return next.handle().pipe(
      tap({
        next: () => void write(ctx.switchToHttp().getResponse<{ statusCode: number }>().statusCode),
        error: (e: { status?: number }) => void write(e?.status ?? 500),
      }),
    );
  }
}
