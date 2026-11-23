/**
 * DỮ LIỆU MẪU cho máy dev và bản xem trước (tên điểm đón, tọa độ gần đúng, giá vé, giờ chạy đều do nhóm tự đặt, không phải dữ liệu thật).
 * Chạy: npm run db:seed   (XÓA dữ liệu cũ trong các bảng rồi tạo lại)
 */
import { BookingStatus, Gender, PaymentStatus, PrismaClient, Role, StopType, TripSeatStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { generateSeats } from '../src/catalog/seat-layout.util';
import { generateTicketCode } from '../src/common/ticket-code';

const prisma = new PrismaClient();
const DAY = 86_400_000;

function vnTodayStart(): Date {
  const vnToday = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
  return new Date(`${vnToday}T00:00:00+07:00`);
}
const at = (dayOffset: number, hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return new Date(vnTodayStart().getTime() + dayOffset * DAY + (h * 60 + m) * 60_000);
};

async function main() {
  // Xóa theo thứ tự phụ thuộc
  await prisma.$transaction([
    prisma.auditLog.deleteMany(),
    prisma.mailLog.deleteMany(),
    prisma.supportRequest.deleteMany(),
    prisma.review.deleteMany(),
    prisma.payment.deleteMany(),
    prisma.bookingItem.deleteMany(),
    prisma.tripSeat.deleteMany(),
    prisma.booking.deleteMany(),
    prisma.trip.deleteMany(),
    prisma.tripSchedule.deleteMany(),
    prisma.bus.deleteMany(),
    prisma.seat.deleteMany(),
    prisma.seatLayout.deleteMany(),
    prisma.stop.deleteMany(),
    prisma.route.deleteMany(),
    prisma.operator.deleteMany(),
    prisma.coupon.deleteMany(),
    prisma.chatMessage.deleteMany(),
    prisma.chatSession.deleteMany(),
    prisma.kbDocument.deleteMany(),
    prisma.savedPassenger.deleteMany(),
    prisma.passwordReset.deleteMany(),
    prisma.user.deleteMany(),
  ]);

  const passwordHash = await bcrypt.hash(process.env.SEED_PASSWORD ?? 'Matkhau@123', 10);
  const mk = (fullName: string, email: string, phone: string, role: Role = Role.CUSTOMER) =>
    prisma.user.create({ data: { fullName, email, phone, passwordHash, role } });
  await mk('Quản trị viên', 'admin@example.com', '0900000001', Role.ADMIN);
  await mk('Nhân viên bán vé', 'staff@example.com', '0900000002', Role.STAFF);
  const khach = await mk('Khách hàng mẫu', 'khach@example.com', '0900000003');
  const reviewers = await Promise.all([
    mk('Nguyễn Thị Lan', 'lan@example.com', '0911000001'),
    mk('Trần Văn Minh', 'minh@example.com', '0911000002'),
    mk('Lê Hoàng Anh', 'anh@example.com', '0911000003'),
  ]);
  await prisma.savedPassenger.createMany({
    data: [
      { userId: khach.id, fullName: 'Khách hàng mẫu', phone: '0900000003', gender: Gender.MALE, age: 30 },
      { userId: khach.id, fullName: 'Trần Thị Hoa', gender: Gender.FEMALE, age: 28 },
    ],
  });

  // Nhà xe đều là TÊN TỰ ĐẶT, logo do nhóm tự vẽ (frontend/public/nha-xe). Ảnh xe lấy từ Wikimedia Commons, giấy phép tự do,
  // nguồn và tác giả từng ảnh ở frontend/public/xe/nguon-anh.json.
  const operator = await prisma.operator.create({ data: { name: 'Phù Sa Express', hotline: '1900 0001 (mẫu)', logoUrl: '/nha-xe/phu-sa.svg' } });

  // Sơ đồ ghế: giường nằm 2 tầng (tầng dưới phụ thu 20.000đ, hàng cuối tầng dưới dành cho nữ), limousine 9 chỗ (hàng đầu phụ thu)
  const sleeper = await prisma.seatLayout.create({
    data: {
      name: 'Giường nằm 2 tầng 36 chỗ',
      floors: 2,
      rows: 6,
      cols: 3,
      seats: {
        create: generateSeats(2, 6, 3).map((s) => ({ ...s, priceExtra: s.floor === 1 ? 20_000 : 0, femaleOnly: s.floor === 1 && s.rowNo === 6 })),
      },
    },
    include: { seats: true },
  });
  const limo = await prisma.seatLayout.create({
    data: {
      name: 'Limousine 9 chỗ',
      floors: 1,
      rows: 3,
      cols: 3,
      seats: { create: generateSeats(1, 3, 3).map((s) => ({ ...s, priceExtra: s.rowNo === 1 ? 30_000 : 0, femaleOnly: s.rowNo === 3 && s.colNo === 3 })) },
    },
    include: { seats: true },
  });

  const SLEEPER_AMENITIES = ['Wi-Fi', 'Nước uống', 'Chăn đắp', 'Cổng sạc USB', 'Nhà vệ sinh'];
  const LIMO_AMENITIES = ['Wi-Fi', 'Nước uống', 'Ghế massage', 'Cổng sạc USB', 'Khăn lạnh'];
  // Ảnh theo loại xe; mỗi xe xoay vòng ảnh đại diện để danh sách không giống hệt nhau
  const PHOTOS = {
    sleeper: ['giuong-nam-1', 'giuong-nam-2', 'giuong-nam-3', 'giuong-nam-trong-1', 'giuong-nam-trong-2'],
    cabin: ['cabin-1', 'cabin-2', 'cabin-trong-1', 'cabin-trong-2'],
    limo: ['limousine-1', 'limousine-2', 'limousine-3', 'limousine-4'],
    seat: ['ghe-ngoi-1', 'ghe-ngoi-2', 'ghe-ngoi-3', 'ghe-ngoi-trong-1', 'ghe-ngoi-trong-2'],
  };
  let photoTurn = 0;
  const photosFor = (kind: keyof typeof PHOTOS) => {
    const list = PHOTOS[kind];
    const ext = list.filter((f) => !f.includes('trong'));
    const first = ext[photoTurn++ % ext.length];
    return [first, ...list.filter((f) => f !== first)].map((f) => `/xe/${f}.jpg`);
  };
  const bus = (plate: string, busType: string, layoutId: number, amenities: string[], kind: keyof typeof PHOTOS, operatorId = operator.id) =>
    prisma.bus.create({ data: { operatorId, plateNumber: plate, busType, seatLayoutId: layoutId, amenities, photos: photosFor(kind) } });
  const b1 = await bus('51B-000.01', 'Giường nằm 36 chỗ', sleeper.id, SLEEPER_AMENITIES, 'sleeper');
  const b2 = await bus('51B-000.02', 'Limousine 9 chỗ', limo.id, LIMO_AMENITIES, 'limo');
  const b3 = await bus('51B-000.03', 'Giường nằm 36 chỗ', sleeper.id, SLEEPER_AMENITIES, 'sleeper');
  const b4 = await bus('29B-000.04', 'Limousine 9 chỗ', limo.id, LIMO_AMENITIES, 'limo');

  type S = { name: string; address: string; type: StopType; orderNo: number; offsetMinutes: number; lat: number; lng: number };
  const route = (origin: string, dest: string, minutes: number, km: number, stops: S[]) =>
    prisma.route.create({
      data: { operatorId: operator.id, originCity: origin, destinationCity: dest, durationMinutes: minutes, distanceKm: km, stops: { create: stops } },
      include: { stops: true },
    });
  const P = StopType.PICKUP;
  const D = StopType.DROPOFF;
  const dalat = await route('TP. Hồ Chí Minh', 'Đà Lạt', 420, 300, [
    { name: 'Văn phòng Quận 1 (mẫu)', address: 'Quận 1, TP. Hồ Chí Minh', type: P, orderNo: 1, offsetMinutes: 0, lat: 10.7769, lng: 106.7009 },
    { name: 'Điểm đón Thủ Đức (mẫu)', address: 'TP. Thủ Đức, TP. Hồ Chí Minh', type: P, orderNo: 2, offsetMinutes: 40, lat: 10.8494, lng: 106.7537 },
    { name: 'Văn phòng trung tâm Đà Lạt (mẫu)', address: 'Phường 1, Đà Lạt', type: D, orderNo: 3, offsetMinutes: 420, lat: 11.9404, lng: 108.4583 },
  ]);
  const cantho = await route('TP. Hồ Chí Minh', 'Cần Thơ', 210, 170, [
    { name: 'Văn phòng Quận 5 (mẫu)', address: 'Quận 5, TP. Hồ Chí Minh', type: P, orderNo: 1, offsetMinutes: 0, lat: 10.754, lng: 106.6634 },
    { name: 'Văn phòng Ninh Kiều (mẫu)', address: 'Ninh Kiều, Cần Thơ', type: D, orderNo: 2, offsetMinutes: 210, lat: 10.0341, lng: 105.788 },
  ]);
  const nhatrang = await route('TP. Hồ Chí Minh', 'Nha Trang', 540, 430, [
    { name: 'Văn phòng Bình Thạnh (mẫu)', address: 'Bình Thạnh, TP. Hồ Chí Minh', type: P, orderNo: 1, offsetMinutes: 0, lat: 10.8106, lng: 106.7091 },
    { name: 'Văn phòng Nha Trang (mẫu)', address: 'Lộc Thọ, Nha Trang', type: D, orderNo: 2, offsetMinutes: 540, lat: 12.2388, lng: 109.1967 },
  ]);
  const sapa = await route('Hà Nội', 'Sa Pa', 330, 320, [
    { name: 'Văn phòng Hoàn Kiếm (mẫu)', address: 'Hoàn Kiếm, Hà Nội', type: P, orderNo: 1, offsetMinutes: 0, lat: 21.0285, lng: 105.8542 },
    { name: 'Văn phòng Sa Pa (mẫu)', address: 'Thị xã Sa Pa, Lào Cai', type: D, orderNo: 2, offsetMinutes: 330, lat: 22.3364, lng: 103.8438 },
  ]);

  // Lịch chạy hằng ngày (F27) và tạo chuyến cho 14 ngày tới
  const plans = [
    { route: dalat, bus: b1, seats: sleeper.seats, times: ['07:00', '13:00', '22:00'], price: 300_000 },
    { route: cantho, bus: b2, seats: limo.seats, times: ['06:00', '12:00', '18:00'], price: 200_000 },
    { route: nhatrang, bus: b3, seats: sleeper.seats, times: ['20:00', '21:30'], price: 350_000 },
    { route: sapa, bus: b4, seats: limo.seats, times: ['07:00', '22:00'], price: 450_000 },
  ];
  let tripCount = 0;
  for (const p of plans) {
    for (const time of p.times) {
      const sch = await prisma.tripSchedule.create({
        data: { routeId: p.route.id, busId: p.bus.id, departTime: time, durationMinutes: p.route.durationMinutes!, basePrice: p.price },
      });
      for (let day = 0; day < 14; day++) {
        const departAt = at(day, time);
        if (departAt <= new Date()) continue;
        const trip = await prisma.trip.create({
          data: {
            routeId: p.route.id,
            busId: p.bus.id,
            scheduleId: sch.id,
            departAt,
            arriveAt: new Date(departAt.getTime() + p.route.durationMinutes! * 60_000),
            basePrice: p.price,
          },
        });
        await prisma.tripSeat.createMany({ data: p.seats.map((s) => ({ tripId: trip.id, seatId: s.id })) });
        tripCount++;
      }
    }
  }

  // Vài chuyến ĐÃ CHẠY có vé đã đi, để thử đánh giá (F20) và thống kê (F30)
  const pastTrip = async (routeObj: typeof dalat, busObj: typeof b1, seats: typeof sleeper.seats, day: number, time: string, price: number) => {
    const departAt = at(day, time);
    const trip = await prisma.trip.create({
      data: { routeId: routeObj.id, busId: busObj.id, departAt, arriveAt: new Date(departAt.getTime() + routeObj.durationMinutes! * 60_000), basePrice: price, status: 'COMPLETED' },
    });
    await prisma.tripSeat.createMany({ data: seats.map((s) => ({ tripId: trip.id, seatId: s.id })) });
    return trip;
  };
  const sold = async (trip: { id: number; basePrice: number; routeId: number }, user: { id: number; fullName: string; phone: string; email: string }, seatCode: string, routeObj: typeof dalat, layoutSeats: typeof sleeper.seats) => {
    const seat = layoutSeats.find((s) => s.code === seatCode)!;
    const ts = await prisma.tripSeat.findUniqueOrThrow({ where: { tripId_seatId: { tripId: trip.id, seatId: seat.id } } });
    const price = trip.basePrice + seat.priceExtra;
    const b = await prisma.booking.create({
      data: {
        code: generateTicketCode(),
        userId: user.id,
        tripId: trip.id,
        pickupStopId: routeObj.stops.find((s) => s.type === StopType.PICKUP)!.id,
        dropoffStopId: routeObj.stops.find((s) => s.type === StopType.DROPOFF)!.id,
        contactName: user.fullName,
        contactPhone: user.phone,
        contactEmail: user.email,
        totalAmount: price,
        status: BookingStatus.PAID,
        expiresAt: new Date(),
        reminderSentAt: new Date(),
        items: { create: { tripSeatId: ts.id, price, passengerName: user.fullName, checkedInAt: new Date() } },
        payments: { create: { provider: 'mock', txnRef: `SEED-${trip.id}-${seatCode}`, amount: price, status: PaymentStatus.SUCCESS, paidAt: new Date() } },
      },
    });
    await prisma.tripSeat.update({ where: { id: ts.id }, data: { status: TripSeatStatus.SOLD, bookingId: b.id } });
    return b;
  };
  const p1 = await pastTrip(dalat, b1, sleeper.seats, -3, '07:00', 300_000);
  const p2 = await pastTrip(dalat, b1, sleeper.seats, -2, '22:00', 300_000);
  const p3 = await pastTrip(cantho, b2, limo.seats, -1, '06:00', 200_000);
  const reviewsData: [typeof p1, (typeof reviewers)[0], string, typeof dalat, typeof sleeper.seats, number, string][] = [
    [p1, reviewers[0], 'B01', dalat, sleeper.seats, 5, 'Xe sạch, tài xế chạy êm, đến đúng giờ.'],
    [p1, reviewers[1], 'B02', dalat, sleeper.seats, 4, 'Giường hơi ngắn nhưng nhân viên nhiệt tình.'],
    [p2, reviewers[2], 'A05', dalat, sleeper.seats, 5, 'Đặt ghế trên web rất nhanh, có nước uống và chăn.'],
    [p3, reviewers[0], 'A04', cantho, limo.seats, 4, 'Limousine thoải mái, đón đúng điểm.'],
  ];
  for (const [trip, u, seat, r, seats, rating, comment] of reviewsData) {
    const b = await sold(trip, u, seat, r, seats);
    await prisma.review.create({ data: { bookingId: b.id, tripId: trip.id, userId: u.id, rating, comment } });
  }
  await sold(p2, khach, 'B07', dalat, sleeper.seats); // khách mẫu có 1 chuyến đã đi, chưa đánh giá → thử F20

  // ================= Thêm 7 nhà xe mẫu, nhiều loại xe (để thử bộ lọc nhà xe, loại xe, điểm đón/trả) =================
  /** Sơ đồ ghế ngồi: mỗi hàng 4 ghế, lối đi ở giữa (cột 3 bỏ trống) */
  const seatRows = (rows: number) => {
    const out: { code: string; floor: number; rowNo: number; colNo: number }[] = [];
    let n = 1;
    for (let r = 1; r <= rows; r++) for (const c of [1, 2, 4, 5]) out.push({ code: `A${String(n++).padStart(2, '0')}`, floor: 1, rowNo: r, colNo: c });
    return out;
  };
  const layout = (name: string, floors: number, rows: number, cols: number, seats: { code: string; floor: number; rowNo: number; colNo: number }[], extra: (s: { floor: number; rowNo: number }) => number, female: (s: { floor: number; rowNo: number; colNo: number }) => boolean) =>
    prisma.seatLayout.create({
      data: { name, floors, rows, cols, seats: { create: seats.map((s) => ({ ...s, priceExtra: extra(s), femaleOnly: female(s) })) } },
      include: { seats: true },
    });
  const sleeper42 = await layout('Giường nằm 2 tầng 42 chỗ', 2, 7, 3, generateSeats(2, 7, 3), (s) => (s.floor === 1 ? 20_000 : 0), (s) => s.floor === 1 && s.rowNo === 7);
  const cabin24 = await layout(
    'Cabin đôi 2 tầng 24 phòng',
    2,
    6,
    3,
    generateSeats(2, 6, 3).filter((s) => s.colNo !== 2).map((s, i, arr) => ({ ...s, code: `${s.floor === 1 ? 'A' : 'B'}${String(arr.slice(0, i + 1).filter((x) => x.floor === s.floor).length).padStart(2, '0')}` })),
    (s) => (s.floor === 1 ? 50_000 : 0),
    (s) => s.floor === 1 && s.rowNo === 6,
  );
  const limoBed24 = await layout('Limousine giường 2 tầng 24 chỗ', 2, 4, 3, generateSeats(2, 4, 3), (s) => (s.floor === 1 && s.rowNo === 1 ? 40_000 : 0), (s) => s.floor === 1 && s.rowNo === 4 && s.colNo === 3);
  const seat28 = await layout('Ghế ngồi 28 chỗ', 1, 7, 5, seatRows(7), (s) => (s.rowNo === 1 ? 10_000 : 0), () => false);
  const seat44 = await layout('Ghế ngồi 44 chỗ', 1, 11, 5, seatRows(11), () => 0, () => false);

  const SEAT_AMENITIES = ['Điều hòa', 'Nước uống', 'Cổng sạc USB'];
  const CABIN_AMENITIES = ['Wi-Fi', 'Nước uống', 'Chăn đắp', 'Rèm riêng tư', 'Màn hình giải trí', 'Cổng sạc USB', 'Nhà vệ sinh'];
  const LIMOBED_AMENITIES = ['Wi-Fi', 'Nước uống', 'Chăn đắp', 'Rèm riêng tư', 'Cổng sạc USB', 'Khăn lạnh'];
  const TYPES = {
    sleeper36: { busType: 'Giường nằm 36 chỗ', layout: sleeper, amen: SLEEPER_AMENITIES, kind: 'sleeper' as const },
    sleeper42: { busType: 'Giường nằm 42 chỗ', layout: sleeper42, amen: SLEEPER_AMENITIES, kind: 'sleeper' as const },
    cabin24: { busType: 'Cabin đôi 24 phòng', layout: cabin24, amen: CABIN_AMENITIES, kind: 'cabin' as const },
    limoBed24: { busType: 'Limousine giường 24 chỗ', layout: limoBed24, amen: LIMOBED_AMENITIES, kind: 'cabin' as const },
    limo9: { busType: 'Limousine 9 chỗ', layout: limo, amen: LIMO_AMENITIES, kind: 'limo' as const },
    seat28: { busType: 'Ghế ngồi 28 chỗ', layout: seat28, amen: SEAT_AMENITIES, kind: 'seat' as const },
    seat44: { busType: 'Ghế ngồi 44 chỗ', layout: seat44, amen: SEAT_AMENITIES, kind: 'seat' as const },
  };

  // Điểm đón/trả dùng chung theo thành phố. Không ghi tọa độ: nút "Xem bản đồ" sẽ tìm theo tên + địa chỉ.
  type St = { name: string; address: string };
  const PICK: Record<string, St[]> = {
    'TP. Hồ Chí Minh': [
      { name: 'Bến xe Miền Tây', address: 'Quận Bình Tân, TP. Hồ Chí Minh' },
      { name: 'Bến xe Miền Đông mới', address: 'TP. Thủ Đức, TP. Hồ Chí Minh' },
      { name: 'Ngã Tư Ga', address: 'Quận 12, TP. Hồ Chí Minh' },
      { name: 'Văn phòng Quận 10 (mẫu)', address: 'Quận 10, TP. Hồ Chí Minh' },
      { name: 'Văn phòng Quận 6 (mẫu)', address: 'Quận 6, TP. Hồ Chí Minh' },
      { name: 'Huyện Bình Chánh', address: 'Huyện Bình Chánh, TP. Hồ Chí Minh' },
    ],
    'Hà Nội': [
      { name: 'Bến xe Mỹ Đình', address: 'Quận Nam Từ Liêm, Hà Nội' },
      { name: 'Bến xe Giáp Bát', address: 'Quận Hoàng Mai, Hà Nội' },
      { name: 'Văn phòng Hoàn Kiếm (mẫu)', address: 'Quận Hoàn Kiếm, Hà Nội' },
      { name: 'Bến xe Nước Ngầm', address: 'Quận Hoàng Mai, Hà Nội' },
    ],
  };
  const DROP: Record<string, St[]> = {
    'Cần Thơ': [
      { name: 'Bến xe Cần Thơ', address: 'Quận Cái Răng, Cần Thơ' },
      { name: 'Văn phòng Ninh Kiều (mẫu)', address: 'Quận Ninh Kiều, Cần Thơ' },
    ],
    'Đà Lạt': [
      { name: 'Bến xe Liên tỉnh Đà Lạt', address: 'Phường 3, Đà Lạt' },
      { name: 'Văn phòng trung tâm Đà Lạt (mẫu)', address: 'Phường 1, Đà Lạt' },
    ],
    'Nha Trang': [
      { name: 'Bến xe phía Nam Nha Trang', address: 'Phường Vĩnh Trung, Nha Trang' },
      { name: 'Văn phòng Lộc Thọ (mẫu)', address: 'Phường Lộc Thọ, Nha Trang' },
    ],
    'Vũng Tàu': [
      { name: 'Bến xe Vũng Tàu', address: 'Phường 3, Vũng Tàu' },
      { name: 'Văn phòng Bãi Sau (mẫu)', address: 'Phường Thắng Tam, Vũng Tàu' },
    ],
    'Sa Pa': [
      { name: 'Bến xe Sa Pa', address: 'Thị xã Sa Pa, Lào Cai' },
      { name: 'Văn phòng Sa Pa (mẫu)', address: 'Thị xã Sa Pa, Lào Cai' },
    ],
    'Hải Phòng': [
      { name: 'Bến xe Niệm Nghĩa', address: 'Quận Lê Chân, Hải Phòng' },
      { name: 'Bến xe Lạc Long', address: 'Quận Hồng Bàng, Hải Phòng' },
    ],
  };
  const MINUTES: Record<string, number> = { 'Cần Thơ': 210, 'Đà Lạt': 420, 'Nha Trang': 540, 'Vũng Tàu': 150, 'Sa Pa': 330, 'Hải Phòng': 120 };

  type Line = { from: string; to: string; type: keyof typeof TYPES; times: string[]; price: number; pick: number[]; drop: number[]; ratings: number[] };
  const OPERATORS: { name: string; logo: string; hotline: string; plate: string; lines: Line[] }[] = [
    { name: 'Hải Âu Xanh', logo: 'hai-au', hotline: '1900 0002 (mẫu)', plate: '72B', lines: [
      { from: 'TP. Hồ Chí Minh', to: 'Vũng Tàu', type: 'limo9', times: ['06:00', '08:00', '14:00', '17:00'], price: 180_000, pick: [3, 1], drop: [0, 1], ratings: [5, 5, 4, 5] },
      { from: 'TP. Hồ Chí Minh', to: 'Nha Trang', type: 'sleeper42', times: ['19:00', '21:00'], price: 320_000, pick: [1, 2], drop: [0], ratings: [4, 4, 3, 5] },
    ] },
    { name: 'Lúa Vàng', logo: 'lua-vang', hotline: '1900 0003 (mẫu)', plate: '65B', lines: [
      { from: 'TP. Hồ Chí Minh', to: 'Cần Thơ', type: 'seat44', times: ['05:30', '07:30', '09:30', '13:30', '16:30', '19:30'], price: 140_000, pick: [0, 5], drop: [0], ratings: [4, 3, 4, 4, 3] },
      { from: 'TP. Hồ Chí Minh', to: 'Vũng Tàu', type: 'seat28', times: ['07:00', '15:00'], price: 120_000, pick: [0, 4], drop: [0], ratings: [4, 4] },
    ] },
    { name: 'Mây Trắng Limousine', logo: 'may-trang', hotline: '1900 0004 (mẫu)', plate: '51F', lines: [
      { from: 'TP. Hồ Chí Minh', to: 'Cần Thơ', type: 'limo9', times: ['08:00', '11:00', '17:35'], price: 230_000, pick: [3, 4, 0], drop: [1, 0], ratings: [5, 5, 5, 4] },
      { from: 'TP. Hồ Chí Minh', to: 'Đà Lạt', type: 'limoBed24', times: ['09:00', '23:00'], price: 420_000, pick: [3, 2], drop: [1], ratings: [5, 4, 5] },
      { from: 'Hà Nội', to: 'Hải Phòng', type: 'limo9', times: ['07:00', '10:00', '16:00'], price: 200_000, pick: [2, 0], drop: [0, 1], ratings: [5, 4] },
    ] },
    { name: 'Sen Hồng', logo: 'sen-hong', hotline: '1900 0005 (mẫu)', plate: '49B', lines: [
      { from: 'TP. Hồ Chí Minh', to: 'Đà Lạt', type: 'cabin24', times: ['21:00', '22:30'], price: 450_000, pick: [1, 2], drop: [0, 1], ratings: [5, 5, 4] },
      { from: 'TP. Hồ Chí Minh', to: 'Nha Trang', type: 'cabin24', times: ['20:30'], price: 480_000, pick: [1], drop: [1], ratings: [5, 4] },
    ] },
    { name: 'Trăng Non', logo: 'trang-non', hotline: '1900 0006 (mẫu)', plate: '24B', lines: [
      { from: 'Hà Nội', to: 'Sa Pa', type: 'sleeper42', times: ['06:30', '21:30'], price: 300_000, pick: [0, 1], drop: [0], ratings: [4, 4, 5, 3] },
      { from: 'Hà Nội', to: 'Sa Pa', type: 'cabin24', times: ['22:00'], price: 450_000, pick: [2, 0], drop: [1], ratings: [5, 5] },
      { from: 'Hà Nội', to: 'Hải Phòng', type: 'seat28', times: ['06:00', '12:00', '18:00'], price: 110_000, pick: [1, 3], drop: [0], ratings: [3, 4, 4] },
    ] },
    { name: 'Gió Biển', logo: 'gio-bien', hotline: '1900 0007 (mẫu)', plate: '79B', lines: [
      { from: 'TP. Hồ Chí Minh', to: 'Nha Trang', type: 'sleeper36', times: ['18:00', '22:00'], price: 330_000, pick: [1, 2], drop: [0, 1], ratings: [4, 5, 4] },
      { from: 'TP. Hồ Chí Minh', to: 'Vũng Tàu', type: 'seat28', times: ['06:30', '10:30', '16:30'], price: 130_000, pick: [1, 3], drop: [0, 1], ratings: [4, 3] },
    ] },
    { name: 'Cánh Diều', logo: 'canh-dieu', hotline: '1900 0008 (mẫu)', plate: '66B', lines: [
      { from: 'TP. Hồ Chí Minh', to: 'Cần Thơ', type: 'sleeper42', times: ['10:00', '18:00', '22:00'], price: 180_000, pick: [0, 5, 4], drop: [0, 1], ratings: [4, 4, 5] },
      { from: 'TP. Hồ Chí Minh', to: 'Đà Lạt', type: 'sleeper42', times: ['08:00', '20:00'], price: 290_000, pick: [1, 2], drop: [0], ratings: [4, 3, 4] },
    ] },
  ];
  const REVIEW_TEXT: Record<number, string[]> = {
    5: ['Xe sạch, đi êm, đúng giờ.', 'Nhân viên nhiệt tình, sẽ đi lại.', 'Đón đúng điểm, chỗ nằm thoải mái.'],
    4: ['Ổn so với giá vé.', 'Xe tốt, chỉ hơi trễ 15 phút.', 'Có nước uống, điều hòa mát.'],
    3: ['Xe hơi cũ, ghế chưa thoải mái.', 'Dừng nghỉ hơi lâu.'],
  };

  let extraTrips = 0;
  let extraBuses = 0;
  let extraReviews = 0;
  let plateNo = 10;
  for (const op of OPERATORS) {
    const o = await prisma.operator.create({ data: { name: op.name, hotline: op.hotline, logoUrl: `/nha-xe/${op.logo}.svg` } });
    for (const line of op.lines) {
      const ty = TYPES[line.type];
      const minutes = MINUTES[line.to];
      const stops = [
        ...line.pick.map((i, k) => ({ ...PICK[line.from][i], type: StopType.PICKUP, orderNo: k + 1, offsetMinutes: k * 20 })),
        ...line.drop.map((i, k) => ({ ...DROP[line.to][i], type: StopType.DROPOFF, orderNo: line.pick.length + k + 1, offsetMinutes: minutes - (line.drop.length - 1 - k) * 20 })),
      ];
      const r = await prisma.route.create({
        data: { operatorId: o.id, originCity: line.from, destinationCity: line.to, durationMinutes: minutes, stops: { create: stops } },
        include: { stops: true },
      });
      // Mỗi giờ chạy một xe riêng (xe chạy đêm về ngày hôm sau mới quay đầu)
      for (const time of line.times) {
        const b = await bus(`${op.plate}-${String(plateNo++).padStart(3, '0')}.${String(10 + extraBuses).padStart(2, '0')}`, ty.busType, ty.layout.id, ty.amen, ty.kind, o.id);
        extraBuses++;
        const sch = await prisma.tripSchedule.create({ data: { routeId: r.id, busId: b.id, departTime: time, durationMinutes: minutes, basePrice: line.price } });
        const tripRows = [];
        for (let day = 0; day < 14; day++) {
          const departAt = at(day, time);
          if (departAt <= new Date()) continue;
          tripRows.push({ routeId: r.id, busId: b.id, scheduleId: sch.id, departAt, arriveAt: new Date(departAt.getTime() + minutes * 60_000), basePrice: line.price });
        }
        const created = await prisma.trip.createManyAndReturn({ data: tripRows, select: { id: true } });
        await prisma.tripSeat.createMany({ data: created.flatMap((t) => ty.layout.seats.map((s) => ({ tripId: t.id, seatId: s.id }))) });
        extraTrips += created.length;
      }
      // Một chuyến đã chạy có đánh giá để tuyến có điểm sao
      const firstBus = await prisma.bus.findFirstOrThrow({ where: { operatorId: o.id, busType: ty.busType }, orderBy: { id: 'asc' } });
      const past = await pastTrip(r as typeof dalat, firstBus as typeof b1, ty.layout.seats as typeof sleeper.seats, -2, line.times[0], line.price);
      for (let k = 0; k < line.ratings.length; k++) {
        const rating = line.ratings[k];
        const who = reviewers[k % reviewers.length];
        const seatCode = ty.layout.seats.filter((s) => !s.femaleOnly)[k].code;
        const b = await sold(past, who, seatCode, r as typeof dalat, ty.layout.seats as typeof sleeper.seats);
        const texts = REVIEW_TEXT[rating];
        await prisma.review.create({ data: { bookingId: b.id, tripId: past.id, userId: who.id, rating, comment: texts[k % texts.length] } });
        extraReviews++;
      }
    }
  }

  await prisma.coupon.createMany({
    data: [
      { code: 'GIAM10', description: 'Giảm 10%, tối đa 50.000đ (mẫu)', percent: 10, maxDiscount: 50_000, validFrom: new Date(Date.now() - DAY), validTo: new Date(Date.now() + 60 * DAY) },
      { code: 'CHAOBAN', description: 'Giảm 30.000đ cho đơn từ 200.000đ (mẫu)', amount: 30_000, minOrder: 200_000, usageLimit: 100, validFrom: new Date(Date.now() - DAY), validTo: new Date(Date.now() + 60 * DAY) },
      { code: 'HETHAN', description: 'Mã đã hết hạn để thử lỗi (mẫu)', percent: 20, validFrom: new Date(Date.now() - 30 * DAY), validTo: new Date(Date.now() - DAY) },
    ],
  });

  await prisma.kbDocument.createMany({
    data: [
      { title: 'Chính sách hủy vé (mẫu của nhóm)', content: 'Hủy trước giờ khởi hành từ 24 giờ: phí 10% giá vé. Từ 4 đến dưới 24 giờ: phí 30%. Dưới 4 giờ: không hủy được. Tiền hoàn về phương thức đã thanh toán.' },
      { title: 'Đổi vé, đổi ngày đi', content: 'Đổi được sang chuyến khác cùng tuyến trước giờ khởi hành ít nhất 12 giờ, miễn phí đổi. Chỉ đổi sang chỗ cùng giá hoặc rẻ hơn; phần chênh lệch được hoàn lại. Vào Vé của tôi, chọn Đổi chuyến.' },
      { title: 'Thời gian giữ ghế', content: 'Ghế được giữ 10 phút sau khi chọn. Sau khi tạo đơn, khách có 8 phút để thanh toán. Hết thời gian ghế được mở lại cho người khác.' },
      { title: 'Hành lý', content: 'Mỗi khách được mang 20 kg hành lý ký gửi và 1 túi xách nhỏ. Không nhận hàng dễ cháy nổ.' },
      { title: 'Ghế dành cho nữ', content: 'Một số ghế có biểu tượng màu hồng là ghế dành cho nữ. Khi đặt các ghế này, hành khách phải khai giới tính Nữ.' },
      { title: 'Thanh toán', content: 'Thanh toán trực tuyến qua cổng thanh toán (bản đồ án dùng cổng thử nghiệm) hoặc trả tiền mặt tại quầy. Vé điện tử có mã QR được gửi qua email ngay khi thanh toán xong.' },
      { title: 'Trẻ em', content: 'Trẻ em từ 5 tuổi trở lên phải mua vé. Trẻ dưới 5 tuổi đi cùng người lớn, ngồi chung ghế, miễn phí.' },
    ],
  });

  await prisma.supportRequest.create({
    data: { userId: khach.id, subject: 'Hỏi về hành lý cồng kềnh (mẫu)', message: 'Tôi mang theo xe đạp gấp có được không?', type: 'QUESTION' },
  });

  console.log(`Seed xong: 7 tài khoản, ${1 + OPERATORS.length} nhà xe, ${4 + extraBuses} xe, ${tripCount + extraTrips} chuyến sắp chạy, ${4 + extraReviews} đánh giá, 3 mã giảm giá, 7 tài liệu chính sách.`);
  console.log('Đăng nhập thử: admin@example.com / staff@example.com / khach@example.com, mật khẩu = SEED_PASSWORD trong .env');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
