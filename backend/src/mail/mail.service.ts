import { Global, Injectable, Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { PrismaService } from '../prisma/prisma.service';

export interface MailInput {
  to: string;
  subject: string;
  html: string;
  /** Ảnh nhúng: trong html dùng src="cid:<cid>" */
  images?: { cid: string; dataUrl: string }[];
}

/**
 * Gửi email. Nếu chưa cấu hình SMTP (bản xem trước), email chỉ được lưu vào bảng mail_logs
 * để xem trong Trang quản trị → Hộp thư thử nghiệm. Mọi email đều được lưu lại.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transport: nodemailer.Transporter | null;
  private readonly from: string;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    const host = config.get<string>('SMTP_HOST');
    this.from = config.get<string>('MAIL_FROM') ?? 'Đặt vé xe <no-reply@example.com>';
    this.transport = host
      ? nodemailer.createTransport({
          host,
          port: Number(config.get('SMTP_PORT') ?? 587),
          auth: { user: config.get<string>('SMTP_USER'), pass: config.get<string>('SMTP_PASS') },
        })
      : null;
  }

  async send(m: MailInput): Promise<void> {
    if (!m.to) return;
    let via = 'OUTBOX';
    if (this.transport) {
      try {
        await this.transport.sendMail({
          from: this.from,
          to: m.to,
          subject: m.subject,
          html: m.html,
          attachments: (m.images ?? []).map((i) => ({ cid: i.cid, path: i.dataUrl })),
        });
        via = 'SMTP';
      } catch (e) {
        this.logger.error(`Gửi email tới ${m.to} lỗi: ${e instanceof Error ? e.message : e}`);
      }
    }
    // Bản lưu: thay cid bằng ảnh nhúng để xem được trong trình duyệt
    let html = m.html;
    for (const i of m.images ?? []) html = html.split(`cid:${i.cid}`).join(i.dataUrl);
    await this.prisma.mailLog.create({ data: { to: m.to, subject: m.subject, html, via } });
  }
}

/** Khung email dùng chung */
export function mailLayout(title: string, body: string): string {
  return `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;border:1px solid #dfe6e4;border-radius:10px;overflow:hidden">
<div style="background:#0b7a5e;color:#fff;padding:14px 18px;font-size:18px;font-weight:bold">ĐặtVéXe · ${title}</div>
<div style="padding:18px;color:#1c2a28;font-size:14px;line-height:1.6">${body}</div>
<div style="padding:10px 18px;background:#f3f5f4;color:#5f6f6c;font-size:12px">Email tự động từ đồ án Website đặt vé xe khách. Dữ liệu là dữ liệu mẫu.</div>
</div>`;
}

@Global()
@Module({ providers: [MailService], exports: [MailService] })
export class MailModule {}
