import Anthropic from '@anthropic-ai/sdk';
import { Body, Controller, Injectable, Logger, Module, Post } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { IsOptional, IsString, IsUUID, Length } from 'class-validator';
import { BookingModule } from '../booking/booking.module';
import { BookingService } from '../booking/booking.service';
import { CatalogModule } from '../catalog/catalog.module';
import { CatalogService } from '../catalog/catalog.service';
import { AuthUser, CurrentUser, Public } from '../common/decorators/auth.decorators';
import { AppException, ErrorCode } from '../common/errors';
import { PrismaService } from '../prisma/prisma.service';

export class ChatDto {
  @IsOptional() @IsUUID() sessionId?: string;
  @IsString() @Length(1, 500) message: string;
}

type TripCard = Awaited<ReturnType<CatalogService['searchTrips']>>[number];
export interface ChatReply {
  sessionId: string;
  reply: string;
  trips: TripCard[];
  mode: 'ai' | 'rule';
  suggestHandoff: boolean;
}

const MAX_MESSAGES_PER_SESSION = 60;
const MODEL = 'claude-opus-5-5';

// ---------- Tiện ích tiếng Việt ----------
const strip = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd');

/** Tên gọi khác của địa danh → từ khóa tìm trong CSDL (khó khăn #29) */
const CITY_ALIASES: { key: string; names: string[] }[] = [
  { key: 'Hồ Chí Minh', names: ['tp hcm', 'tphcm', 'hcm', 'sai gon', 'saigon', 'sg', 'ho chi minh', 'thanh pho ho chi minh'] },
  { key: 'Đà Lạt', names: ['da lat', 'dalat'] },
  { key: 'Cần Thơ', names: ['can tho', 'cantho'] },
  { key: 'Nha Trang', names: ['nha trang', 'nhatrang'] },
  { key: 'Hà Nội', names: ['ha noi', 'hanoi', 'hn'] },
  { key: 'Sa Pa', names: ['sa pa', 'sapa'] },
];

/** Từ thông dụng, không mang chủ đề (đã bỏ dấu) */
const STOPWORDS = new Set(
  'co khong duoc cho minh toi ban hoi the nao nay hom la va cua voi mot nhu gi sao oi nhe nha giup xin vay thi de can muon biet em anh chi ah a o di khi nao bao nhieu roi chua dang se da'.split(' '),
);

const vnToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());
const addDays = (ymd: string, n: number) => {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const fmtTime = (d: Date | string) =>
  new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(d));
const fmtDay = (ymd: string) =>
  new Intl.DateTimeFormat('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit', timeZone: 'UTC' }).format(new Date(`${ymd}T00:00:00Z`));
const money = (n: number) => `${n.toLocaleString('vi-VN')}đ`;

/** Hiểu ngày tương đối: hôm nay, mai, mốt/ngày kia, thứ 2..7, chủ nhật, dd/mm */
export function parseDate(text: string, today = vnToday()): string | null {
  const t = strip(text);
  const dm = t.match(/\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{4}))?\b/);
  if (dm) {
    const year = dm[3] ?? today.slice(0, 4);
    const ymd = `${year}-${dm[2].padStart(2, '0')}-${dm[1].padStart(2, '0')}`;
    return ymd < today && !dm[3] ? `${Number(year) + 1}${ymd.slice(4)}` : ymd;
  }
  if (/\b(ngay kia|ngay mot|\bmot\b)/.test(t)) return addDays(today, 2);
  if (/\b(ngay mai|\bmai\b)/.test(t)) return addDays(today, 1);
  if (/\b(hom nay|toi nay|chieu nay|sang nay|bay gio)\b/.test(t)) return today;
  const weekday = t.match(/\b(thu (hai|ba|tu|nam|sau|bay)|thu ([2-7])|chu nhat|cn)\b/);
  if (weekday) {
    const words: Record<string, number> = { hai: 1, ba: 2, tu: 3, nam: 4, sau: 5, bay: 6 };
    const target = weekday[0].startsWith('chu') || weekday[0] === 'cn' ? 0 : weekday[2] ? words[weekday[2]] : Number(weekday[3]) - 1;
    const now = new Date(`${today}T00:00:00Z`).getUTCDay();
    let diff = (target - now + 7) % 7 || 7; // "thứ 6" = thứ 6 sắp tới (không tính hôm nay)
    if (/tuan sau|tuan toi/.test(t)) diff += 7;
    return addDays(today, diff);
  }
  return null;
}

export function parseCities(text: string): string[] {
  const t = ` ${strip(text).replace(/[^a-z0-9 ]/g, ' ')} `;
  const found: { key: string; at: number }[] = [];
  for (const c of CITY_ALIASES) {
    let best = -1;
    for (const n of c.names) {
      const i = t.indexOf(` ${n} `);
      if (i >= 0 && (best < 0 || i < best)) best = i;
    }
    if (best >= 0) found.push({ key: c.key, at: best });
  }
  return found.sort((a, b) => a.at - b.at).map((f) => f.key);
}

function parseHours(text: string): { hourFrom?: number; hourTo?: number } {
  const t = strip(text);
  if (/\bsang\b/.test(t)) return { hourFrom: 4, hourTo: 11 };
  if (/\btrua\b/.test(t)) return { hourFrom: 11, hourTo: 13 };
  if (/\bchieu\b/.test(t)) return { hourFrom: 12, hourTo: 17 };
  if (/\b(toi|dem)\b/.test(t)) return { hourFrom: 18, hourTo: 23 };
  return {};
}

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);
  private readonly client: Anthropic | null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly catalog: CatalogService,
    private readonly booking: BookingService,
    config: ConfigService,
  ) {
    // Chỉ bật chế độ AI khi có khóa API; không có thì dùng chế độ theo luật (dự phòng – khó khăn #31).
    this.client = config.get<string>('ANTHROPIC_API_KEY') ? new Anthropic() : null;
  }

  async chat(dto: ChatDto, user?: AuthUser): Promise<ChatReply> {
    const session = dto.sessionId
      ? await this.prisma.chatSession.findUnique({ where: { id: dto.sessionId }, include: { _count: { select: { messages: true } } } })
      : null;
    const s = session ?? (await this.prisma.chatSession.create({ data: { userId: user?.id }, include: { _count: { select: { messages: true } } } }));
    if (s._count.messages >= MAX_MESSAGES_PER_SESSION) {
      throw new AppException(ErrorCode.RATE_LIMITED, 'Cuộc trò chuyện đã quá dài, vui lòng bắt đầu cuộc mới hoặc gặp nhân viên');
    }
    const history = await this.prisma.chatMessage.findMany({ where: { sessionId: s.id }, orderBy: { id: 'desc' }, take: 10 });
    await this.prisma.chatMessage.create({ data: { sessionId: s.id, role: 'user', content: dto.message } });

    let result: Omit<ChatReply, 'sessionId'>;
    try {
      result = this.client ? await this.aiReply(dto.message, history.reverse()) : await this.ruleReply(dto.message);
    } catch (e) {
      // Mô hình lỗi / hết hạn mức → vẫn trả lời bằng chế độ theo luật để không "chết" giữa buổi demo
      this.logger.warn(`Chatbot AI lỗi, chuyển sang chế độ theo luật: ${e instanceof Error ? e.message : e}`);
      result = await this.ruleReply(dto.message);
    }
    await this.prisma.chatMessage.create({ data: { sessionId: s.id, role: 'assistant', content: result.reply } });
    return { sessionId: s.id, ...result };
  }

  // ---------------- Chế độ theo luật (không cần khóa API) ----------------

  private async ruleReply(message: string): Promise<Omit<ChatReply, 'sessionId'>> {
    const t = strip(message);
    const base = { trips: [] as TripCard[], mode: 'rule' as const, suggestHandoff: false };

    // 1. Tra vé: có mã vé + số điện thoại
    const code = message.toUpperCase().match(/\bVE[A-Z0-9]{8}\b/)?.[0];
    const phone = message.match(/\b0\d{9}\b/)?.[0];
    if (code) {
      if (!phone) return { ...base, reply: `Để tra vé ${code}, bạn gửi thêm số điện thoại đã dùng khi đặt vé nhé.` };
      try {
        const b = await this.booking.lookup(code, phone);
        const st: Record<string, string> = { PAID: 'Đã thanh toán', PENDING_PAYMENT: 'Chờ thanh toán', CANCELLED: 'Đã hủy', EXPIRED: 'Hết hạn thanh toán', NEEDS_REFUND: 'Chờ hoàn tiền' };
        return {
          ...base,
          reply: `Vé ${b.code}: ${st[b.status] ?? b.status}.\nChuyến ${b.trip.originCity} → ${b.trip.destinationCity}, khởi hành ${fmtTime(b.trip.departAt)} ngày ${new Date(b.trip.departAt).toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}.\nGhế: ${b.seats.map((x) => x.code).join(', ')}. Điểm đón: ${b.pickupStop.name}.`,
        };
      } catch {
        return { ...base, reply: 'Mình không tìm thấy vé với mã và số điện thoại này. Bạn kiểm tra lại giúp mình nhé.' };
      }
    }

    // 2. Tìm chuyến
    const cities = parseCities(message);
    const wantsTrip = cities.length > 0 || /\b(chuyen|xe|ve|gio|con cho|con ghe|di)\b/.test(t);
    if (cities.length >= 1 && wantsTrip && !/\b(huy|hoan|doi ve|hanh ly)\b/.test(t)) {
      const from = cities.length >= 2 ? cities[0] : 'Hồ Chí Minh';
      const to = cities.length >= 2 ? cities[1] : cities[0];
      if (from === to) return { ...base, reply: 'Bạn muốn đi từ đâu đến đâu? Ví dụ: "mai có xe Sài Gòn đi Đà Lạt buổi tối không?"' };
      const date = parseDate(message) ?? vnToday();
      const hours = parseHours(message);
      const trips = (await this.catalog.searchTrips({ from, to, date, ...hours })).filter((x) => x.availableSeats > 0);
      const when = `${fmtDay(date)}${hours.hourFrom !== undefined ? ` (${hours.hourFrom}h–${hours.hourTo! + 1}h)` : ''}`;
      if (!trips.length) {
        return { ...base, reply: `Hiện không có chuyến ${from} → ${to} còn chỗ vào ${when}. Bạn thử ngày khác hoặc khung giờ khác nhé.` };
      }
      const lines = trips.slice(0, 5).map((x) => `• ${fmtTime(x.departAt)} – ${x.busType}, ${money(x.basePrice)}, còn ${x.availableSeats} chỗ`);
      return {
        ...base,
        trips: trips.slice(0, 5),
        reply: `Có ${trips.length} chuyến ${from} → ${to} còn chỗ vào ${when}:\n${lines.join('\n')}\nBấm "Chọn ghế" ở chuyến bạn muốn nhé.`,
      };
    }

    // 3. Chính sách: chọn tài liệu có nhiều từ có nghĩa trùng nhất (bỏ từ thông dụng), phải trùng ít nhất 2 từ
    const docs = await this.prisma.kbDocument.findMany();
    const words = [...new Set(t.replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((w) => w.length >= 2 && !STOPWORDS.has(w)))];
    const scored = docs
      .map((d) => {
        const title = ` ${strip(d.title).replace(/[^a-z0-9 ]/g, ' ')} `;
        const body = ` ${strip(d.content).replace(/[^a-z0-9 ]/g, ' ')} `;
        const inTitle = words.filter((w) => title.includes(` ${w} `)).length;
        const inBody = words.filter((w) => !title.includes(` ${w} `) && body.includes(` ${w} `)).length;
        return { d, matched: inTitle + inBody, score: inTitle * 2 + inBody };
      })
      .sort((a, b) => b.score - a.score);
    if (scored[0] && scored[0].matched >= 2 && scored[0].score >= 3) return { ...base, reply: `${scored[0].d.title}: ${scored[0].d.content}` };

    if (/\b(chao|hello|hi|xin chao)\b/.test(t)) {
      return { ...base, reply: 'Chào bạn! Mình có thể tìm chuyến còn chỗ, tra vé (gửi mã vé + số điện thoại) và trả lời về chính sách hủy, đổi vé, hành lý.' };
    }
    return {
      ...base,
      suggestHandoff: true,
      reply: 'Xin lỗi, mình chưa hiểu câu hỏi này. Bạn thử hỏi kiểu "mai có xe Sài Gòn đi Đà Lạt tối không?", hoặc bấm "Gặp nhân viên" để được hỗ trợ trực tiếp.',
    };
  }

  // ---------------- Chế độ AI: mô hình gọi công cụ tra cứu thật ----------------

  private readonly tools: Anthropic.Beta.Messages.BetaTool[] = [
    {
      name: 'search_trips',
      description:
        'Tìm chuyến xe còn chỗ theo điểm đi, điểm đến và ngày (giờ Việt Nam). Dùng cho MỌI câu hỏi về giờ chạy, giá vé, số chỗ trống.',
      strict: true,
      input_schema: {
        type: 'object',
        properties: {
          from: { type: 'string', description: 'Thành phố đi, ví dụ "Hồ Chí Minh", "Hà Nội"' },
          to: { type: 'string', description: 'Thành phố đến, ví dụ "Đà Lạt"' },
          date: { type: 'string', description: 'Ngày đi YYYY-MM-DD' },
          hourFrom: { type: ['integer', 'null'], description: 'Giờ khởi hành sớm nhất 0–23, null nếu không lọc' },
          hourTo: { type: ['integer', 'null'], description: 'Giờ khởi hành muộn nhất 0–23, null nếu không lọc' },
        },
        required: ['from', 'to', 'date', 'hourFrom', 'hourTo'],
        additionalProperties: false,
      },
    },
    {
      name: 'lookup_ticket',
      description: 'Tra tình trạng vé. Chỉ gọi khi khách đã cung cấp CẢ mã vé và số điện thoại đặt vé.',
      strict: true,
      input_schema: {
        type: 'object',
        properties: { code: { type: 'string' }, phone: { type: 'string' } },
        required: ['code', 'phone'],
        additionalProperties: false,
      },
    },
    {
      name: 'get_policies',
      description: 'Lấy toàn bộ chính sách của nhà xe: hủy vé, đổi vé, hành lý, giữ ghế, thanh toán, ghế dành cho nữ.',
      strict: true,
      input_schema: { type: 'object', properties: {}, required: [], additionalProperties: false },
    },
  ];

  private async runTool(name: string, input: Record<string, unknown>, trips: TripCard[]): Promise<string> {
    if (name === 'search_trips') {
      const q = input as { from: string; to: string; date: string; hourFrom: number | null; hourTo: number | null };
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(q.date))) return 'Lỗi: ngày phải có dạng YYYY-MM-DD';
      const found = (
        await this.catalog.searchTrips({ from: q.from, to: q.to, date: q.date, hourFrom: q.hourFrom ?? undefined, hourTo: q.hourTo ?? undefined })
      ).filter((x) => x.availableSeats > 0);
      trips.splice(0, trips.length, ...found.slice(0, 5));
      if (!found.length) return 'Không có chuyến nào còn chỗ.';
      return JSON.stringify(
        found.slice(0, 8).map((x) => ({ gioDi: fmtTime(x.departAt), gioDen: fmtTime(x.arriveAt), loaiXe: x.busType, gia: x.basePrice, conCho: x.availableSeats })),
      );
    }
    if (name === 'lookup_ticket') {
      try {
        const b = await this.booking.lookup(String(input.code), String(input.phone));
        return JSON.stringify({ ma: b.code, trangThai: b.status, tuyen: `${b.trip.originCity} → ${b.trip.destinationCity}`, gioDi: b.trip.departAt, ghe: b.seats.map((x) => x.code), diemDon: b.pickupStop.name });
      } catch {
        return 'Không tìm thấy vé với mã và số điện thoại này.';
      }
    }
    if (name === 'get_policies') {
      const docs = await this.prisma.kbDocument.findMany();
      return docs.map((d) => `## ${d.title}\n${d.content}`).join('\n\n');
    }
    return `Lỗi: không có công cụ ${name}`;
  }

  private async aiReply(message: string, history: { role: string; content: string }[]): Promise<Omit<ChatReply, 'sessionId'>> {
    const client = this.client!;
    const system = `Bạn là trợ lý đặt vé của nhà xe trên website ĐặtVéXe. Trả lời bằng tiếng Việt, ngắn gọn, thân thiện.
Hôm nay là ${fmtDay(vnToday())} (${vnToday()}), giờ Việt Nam.
Quy tắc bắt buộc:
- Mọi thông tin về chuyến xe, giờ chạy, giá vé, số chỗ phải lấy từ công cụ search_trips. Tuyệt đối không tự đoán hoặc bịa số liệu.
- Chính sách (hủy, đổi vé, hành lý, giữ ghế, thanh toán) phải lấy từ công cụ get_policies.
- Tra vé chỉ khi khách đưa cả mã vé và số điện thoại; không tiết lộ thông tin vé của người khác.
- Tên thành phố: "Sài Gòn", "SG", "TP.HCM" đều là "Hồ Chí Minh".
- Nếu câu hỏi ngoài phạm vi đặt vé xe hoặc không chắc chắn, nói rõ và gợi ý bấm nút "Gặp nhân viên".`;
    const messages: Anthropic.Beta.Messages.BetaMessageParam[] = [
      ...history.map((h) => ({ role: h.role === 'user' ? ('user' as const) : ('assistant' as const), content: h.content })),
      { role: 'user', content: message },
    ];
    const trips: TripCard[] = [];
    for (let i = 0; i < 4; i++) {
      const res = await client.beta.messages.create({
        model: MODEL,
        max_tokens: 2000,
        system,
        tools: this.tools,
        messages,
        output_config: { effort: 'low' },
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
      });
      if (res.stop_reason === 'refusal') {
        return { reply: 'Xin lỗi, mình không thể trả lời câu này. Bạn có thể bấm "Gặp nhân viên" để được hỗ trợ.', trips: [], mode: 'ai', suggestHandoff: true };
      }
      const toolUses = res.content.filter((b): b is Anthropic.Beta.Messages.BetaToolUseBlock => b.type === 'tool_use');
      if (res.stop_reason !== 'tool_use' || !toolUses.length) {
        const text = res.content
          .filter((b): b is Anthropic.Beta.Messages.BetaTextBlock => b.type === 'text')
          .map((b) => b.text)
          .join('\n')
          .trim();
        return { reply: text || 'Mình chưa có câu trả lời phù hợp.', trips, mode: 'ai', suggestHandoff: /gặp nhân viên/i.test(text) };
      }
      messages.push({ role: 'assistant', content: res.content });
      const results: Anthropic.Beta.Messages.BetaToolResultBlockParam[] = [];
      for (const tu of toolUses) {
        results.push({ type: 'tool_result', tool_use_id: tu.id, content: await this.runTool(tu.name, tu.input as Record<string, unknown>, trips) });
      }
      messages.push({ role: 'user', content: results });
    }
    return { reply: 'Mình cần thêm thông tin để trả lời. Bạn có thể nói rõ hơn không?', trips, mode: 'ai', suggestHandoff: true };
  }
}

@ApiTags('Chatbot')
@ApiBearerAuth()
@Controller('chat')
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  /** F21: hỏi chatbot. Giới hạn 20 tin nhắn/phút mỗi IP (khó khăn #31). */
  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post()
  send(@Body() dto: ChatDto, @CurrentUser() user?: AuthUser) {
    return this.chat.chat(dto, user);
  }
}

@Module({ imports: [CatalogModule, BookingModule], controllers: [ChatController], providers: [ChatService] })
export class ChatModule {}
