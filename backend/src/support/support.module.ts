import { Body, Controller, Get, HttpStatus, Injectable, Module, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role, SupportStatus, SupportType } from '@prisma/client';
import { IsBoolean, IsEnum, IsOptional, IsString, Length, Matches } from 'class-validator';
import { AuthUser, CurrentUser, Public, Roles } from '../common/decorators/auth.decorators';
import { AppException, ErrorCode, notFound } from '../common/errors';
import { MailService, mailLayout } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';

export class CreateSupportDto {
  @IsOptional() @IsEnum(SupportType) type?: SupportType;
  @IsString() @Length(3, 150) subject: string;
  @IsString() @Length(5, 3000) message: string;
  @IsOptional() @IsString() @Length(6, 20) bookingCode?: string;
  @IsOptional() @Matches(/^0\d{9}$/, { message: 'Số điện thoại phải gồm 10 số và bắt đầu bằng 0' }) contactPhone?: string;
  @IsOptional() @IsString() chatSessionId?: string;
}

export class ReplySupportDto {
  @IsString() @Length(2, 3000) reply: string;
  @IsOptional() @IsBoolean() close?: boolean;
}

@Injectable()
export class SupportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}

  /** F34 (và F22: chatbot chuyển nhân viên dùng type HANDOFF) */
  async create(dto: CreateSupportDto, user?: AuthUser) {
    if (!user && !dto.contactPhone) {
      throw new AppException(ErrorCode.VALIDATION_FAILED, 'Vui lòng để lại số điện thoại để nhân viên liên hệ', HttpStatus.BAD_REQUEST);
    }
    return this.prisma.supportRequest.create({
      data: { ...dto, bookingCode: dto.bookingCode?.toUpperCase(), type: dto.type ?? SupportType.QUESTION, userId: user?.id },
    });
  }

  mine(userId: number) {
    return this.prisma.supportRequest.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } });
  }

  adminList(status?: SupportStatus) {
    return this.prisma.supportRequest.findMany({
      where: { status },
      include: { user: { select: { fullName: true, email: true, phone: true } }, repliedBy: { select: { fullName: true } } },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      take: 200,
    });
  }

  async reply(id: number, staff: AuthUser, dto: ReplySupportDto) {
    const r = await this.prisma.supportRequest.findUnique({ where: { id }, include: { user: true } });
    if (!r) throw notFound('yêu cầu hỗ trợ');
    const updated = await this.prisma.supportRequest.update({
      where: { id },
      data: { reply: dto.reply, repliedAt: new Date(), repliedById: staff.id, status: dto.close ? SupportStatus.CLOSED : SupportStatus.ANSWERED },
    });
    if (r.user?.email) {
      await this.mail.send({
        to: r.user.email,
        subject: `Trả lời yêu cầu hỗ trợ: ${r.subject}`,
        html: mailLayout('Trả lời yêu cầu hỗ trợ', `<p><b>Bạn hỏi:</b> ${escapeHtml(r.message)}</p><p><b>Nhân viên trả lời:</b> ${escapeHtml(dto.reply)}</p>`),
      });
    }
    return updated;
  }
}

const escapeHtml = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string);

@ApiTags('Hỗ trợ khách hàng')
@ApiBearerAuth()
@Controller()
export class SupportController {
  constructor(private readonly support: SupportService) {}

  /** Gửi yêu cầu hỗ trợ / khiếu nại. Không đăng nhập thì phải để lại số điện thoại. */
  @Public()
  @Post('support')
  create(@Body() dto: CreateSupportDto, @CurrentUser() user?: AuthUser) {
    return this.support.create(dto, user);
  }

  @Get('support/me')
  mine(@CurrentUser() user: AuthUser) {
    return this.support.mine(user.id);
  }

  @Roles(Role.ADMIN, Role.STAFF)
  @Get('admin/support')
  list(@Query('status') status?: SupportStatus) {
    return this.support.adminList(status);
  }

  @Roles(Role.ADMIN, Role.STAFF)
  @Post('admin/support/:id/reply')
  reply(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthUser, @Body() dto: ReplySupportDto) {
    return this.support.reply(id, user, dto);
  }
}

@Module({ controllers: [SupportController], providers: [SupportService], exports: [SupportService] })
export class SupportModule {}
