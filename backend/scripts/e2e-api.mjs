// Kiểm thử API toàn bộ 35 chức năng trên dữ liệu seed. Chạy: node scripts/e2e-api.mjs  (server chạy với DISABLE_THROTTLE=true)
const API = process.env.API ?? 'http://localhost:3000/api';
const PW = 'Matkhau@123';
let pass = 0, fail = 0;
const check = (name, ok, extra) => { ok ? pass++ : fail++; console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${!ok && extra !== undefined ? ' → ' + JSON.stringify(extra).slice(0, 400) : ''}`); };
async function call(method, path, body, token, raw = false) {
  const r = await fetch(API + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  if (raw) return { status: r.status, type: r.headers.get('content-type'), buf: Buffer.from(await r.arrayBuffer()) };
  return { status: r.status, j: await r.json().catch(() => null) };
}
const login = async (email, pw = PW) => (await call('POST', '/auth/login', { email, password: pw })).j;
const vnDate = (d = 0) => new Date(Date.now() + 7 * 3600e3 + d * 864e5).toISOString().slice(0, 10);
const enc = encodeURIComponent;
const mails = async (admin) => (await call('GET', '/admin/mails', null, admin)).j.data;

(async () => {
  const admin = (await login('admin@example.com')).data.accessToken;
  const staff = (await login('staff@example.com')).data.accessToken;
  let khach = (await login('khach@example.com')).data.accessToken;

  // ---- F02 quên mật khẩu ----
  const fg = await call('POST', '/auth/forgot-password', { email: 'minh@example.com' });
  const fg2 = await call('POST', '/auth/forgot-password', { email: 'khong-ton-tai@example.com' });
  check('F02 Quên mật khẩu: trả cùng thông báo dù email không tồn tại', fg.j.success && fg2.j.data.message === fg.j.data.message);
  const resetMail = (await mails(admin)).find((m) => m.to === 'minh@example.com' && m.subject.includes('Đặt lại'));
  const token = resetMail?.html.match(/token=([a-f0-9]+)/)?.[1];
  check('F02 Email đặt lại mật khẩu có đường dẫn', !!token);
  const rs = await call('POST', '/auth/reset-password', { token, password: 'MatkhauMoi@1' });
  const rs2 = await call('POST', '/auth/reset-password', { token, password: 'MatkhauMoi@2' });
  check('F02 Đặt lại mật khẩu thành công, dùng lại link → lỗi', rs.j.success && rs2.j.error?.code === 'INVALID_TOKEN', [rs.j, rs2.j]);
  check('F02 Đăng nhập bằng mật khẩu mới', (await login('minh@example.com', 'MatkhauMoi@1')).success);

  // ---- F03 hồ sơ ----
  const up = await call('PATCH', '/auth/me', { fullName: 'Khách hàng mẫu', phone: '0900000003' }, khach);
  const cpw = await call('POST', '/auth/change-password', { currentPassword: 'sai-mat-khau', newPassword: 'abcdefgh' }, khach);
  check('F03 Sửa hồ sơ; đổi mật khẩu sai mật khẩu cũ → WRONG_PASSWORD', up.j.success && cpw.j.error?.code === 'WRONG_PASSWORD', cpw.j);

  // ---- F04 hành khách thường đi ----
  const sp = await call('POST', '/auth/me/passengers', { fullName: 'Lê Văn Tèo', gender: 'MALE', age: 8 }, khach);
  const lsp = await call('GET', '/auth/me/passengers', null, khach);
  const dsp = await call('DELETE', `/auth/me/passengers/${sp.j.data.id}`, null, khach);
  check('F04 Thêm / xem / xóa hành khách thường đi', sp.j.success && lsp.j.data.length >= 3 && dsp.j.success);

  // ---- F05 F06 F20 tìm chuyến + lọc + đánh giá ----
  const date = vnDate(2);
  const s = await call('GET', `/trips?from=${enc('hồ chí minh')}&to=${enc('đà lạt')}&date=${date}&sort=price`);
  // Dữ liệu mẫu có nhiều nhà xe; các bước sau dùng chuyến của nhà xe Phù Sa Express (có tọa độ điểm đón, sơ đồ 36 giường)
  const nAll = s.j.data.length;
  s.j.data = s.j.data.filter((t) => t.operatorName === 'Phù Sa Express');
  check('F05 Tìm chuyến HCM → Đà Lạt có nhiều nhà xe, có logo, ảnh xe và điểm đánh giá', nAll > 3 && !!s.j.data[0].operatorLogo && s.j.data[0].photos.length > 0 && s.j.data[0].pickups.length > 0 && s.j.data.length === 3 && s.j.data[0].rating >= 4 && s.j.data[0].ratingCount >= 3, s.j.data[0]);
  const s2 = await call('GET', `/trips?from=${enc('hồ chí minh')}&to=${enc('cần thơ')}&date=${date}&busType=${enc('Limousine 9 chỗ')}&priceMax=250000&minRating=4&hourFrom=10&hourTo=20`);
  check('F06 Lọc loại xe + giá + điểm đánh giá + giờ', s2.j.data.every((t) => t.busType === 'Limousine 9 chỗ' && t.basePrice <= 250000 && t.rating >= 4) && s2.j.data.filter((t) => t.operatorName === 'Phù Sa Express').length === 2, s2.j.data.map((t) => t.departAt));
  const trip = s.j.data.find((t) => (new Date(t.departAt).getUTCHours() + 7) % 24 === 22);
  const other = s.j.data.find((t) => t.id !== trip.id);

  // ---- F07 chi tiết chuyến, F11 tọa độ ----
  const det = (await call('GET', `/trips/${trip.id}`)).j.data;
  check('F07 Chi tiết chuyến có tiện ích xe, F11 điểm đón có tọa độ', det.bus.amenities.includes('Wi-Fi') && det.route.stops[0].lat > 10, det.bus);
  const rv = (await call('GET', `/trips/${trip.id}/reviews`)).j.data;
  check('F20 Xem đánh giá của tuyến (tên người đánh giá được che)', rv.count >= 3 && rv.reviews[0].author.includes('***'), rv);

  // ---- F08 F10 sơ đồ ghế: giá theo ghế, ghế nữ ----
  const map = (await call('GET', `/trips/${trip.id}/seats`, null, khach)).j.data;
  const female = map.seats.find((x) => x.femaleOnly && x.status === 'AVAILABLE');
  const lower = map.seats.find((x) => x.code === 'A02');
  const upper = map.seats.find((x) => x.code === 'B03');
  check('F08 Giá theo loại ghế (tầng dưới +20.000đ); F10 có ghế dành cho nữ', lower.price === upper.price + 20000 && !!female, { lower, upper, female });

  // ---- F09 giữ ghế ----
  const h = await call('POST', `/trips/${trip.id}/holds`, { seatIds: [female.seatId, upper.seatId] }, khach);
  check('F09 Giữ 2 ghế', h.j.success, h.j);
  const book = (extra) => call('POST', '/bookings', { tripId: trip.id, seatIds: [female.seatId, upper.seatId], pickupStopId: det.route.stops[0].id, dropoffStopId: det.route.stops[2].id, contactName: 'Khách hàng mẫu', contactPhone: '0900000003', contactEmail: 'khach@example.com', ...extra }, khach);
  const bMale = await book({ passengers: [{ name: 'Anh A', gender: 'MALE' }, { name: 'Chị B', gender: 'FEMALE' }] });
  check('F10 Ghế nữ mà hành khách khai Nam → FEMALE_ONLY_SEAT', bMale.j.error?.code === 'FEMALE_ONLY_SEAT', bMale.j);

  // ---- F12 mã giảm giá ----
  const subtotal = female.price + upper.price;
  const cOk = await call('POST', '/coupons/check', { code: 'giam10', amount: subtotal });
  const cBad = await call('POST', '/coupons/check', { code: 'HETHAN', amount: subtotal });
  check('F12 Kiểm tra mã: GIAM10 hợp lệ, HETHAN báo hết hạn', cOk.j.data?.discount === Math.min(Math.round(subtotal * 0.1), 50000) && cBad.j.error?.code === 'COUPON_INVALID', [cOk.j, cBad.j]);
  const b = await book({ passengers: [{ name: 'Trần Thị Hoa', gender: 'FEMALE', age: 28 }, { name: 'Khách hàng mẫu', gender: 'MALE' }], couponCode: 'GIAM10' });
  check('F07 F12 Tạo đơn có giảm giá, đúng tổng tiền', b.j.success && b.j.data.totalAmount === subtotal - cOk.j.data.discount && b.j.data.couponCode === 'GIAM10', b.j);
  const code = b.j.data.code;

  // ---- F13 thanh toán + F14 email vé ----
  const p = await call('POST', '/payments', { bookingCode: code }, khach);
  const paid = await call('GET', `/payments/mock/pay?txnRef=${p.j.data.txnRef}&amount=${p.j.data.amount}&result=success`);
  check('F13 Thanh toán thành công → PAID', paid.j.data?.bookingStatus === 'PAID', paid.j);
  const ticketMail = (await mails(admin)).find((m) => m.subject.includes(code) && m.subject.startsWith('Vé điện tử'));
  check('F14 Email vé điện tử có mã QR', ticketMail && ticketMail.html.includes('data:image/png;base64'));

  // ---- F15 PDF ----
  const pdf = await call('GET', `/bookings/${code}/pdf`, null, khach, true);
  const pdfPublic = await call('GET', `/bookings/${code}/pdf?phone=0900000003`, null, null, true);
  const pdfWrong = await call('GET', `/bookings/${code}/pdf?phone=0999999999`, null, null, true);
  check('F15 Tải vé PDF (chủ vé, hoặc mã + SĐT đúng; SĐT sai → 404)', pdf.type === 'application/pdf' && pdf.buf.slice(0, 4).toString() === '%PDF' && pdfPublic.status === 200 && pdfWrong.status === 404, [pdf.status, pdfPublic.status, pdfWrong.status]);

  // ---- F16 F17 ----
  const mine = await call('GET', '/bookings/me', null, khach);
  const lk = await call('POST', '/bookings/lookup', { code, phone: '0900000003' });
  check('F16 Vé của tôi; F17 tra cứu (SĐT bị che)', mine.j.data.some((x) => x.code === code) && lk.j.data.contactPhone === '090****003');

  // ---- F19 đổi chuyến ----
  const m2 = (await call('GET', `/trips/${other.id}/seats`, null, khach)).j.data;
  const newFemale = m2.seats.find((x) => x.femaleOnly && x.status === 'AVAILABLE');
  const newUpper = m2.seats.find((x) => x.code === 'B04');
  await call('POST', `/trips/${other.id}/holds`, { seatIds: [newFemale.seatId, newUpper.seatId] }, khach);
  const ch = await call('POST', `/bookings/${code}/change`, { tripId: other.id, seatIds: [newFemale.seatId, newUpper.seatId] }, khach);
  const oldMap = (await call('GET', `/trips/${trip.id}/seats`)).j.data;
  check('F19 Đổi sang chuyến khác cùng tuyến; ghế cũ trống lại', ch.j.data?.trip.id === other.id && oldMap.seats.find((x) => x.seatId === upper.seatId).status === 'AVAILABLE', ch.j);
  check('F19 Có email xác nhận đổi vé', (await mails(admin)).some((m) => m.subject.startsWith('Đổi vé thành công') && m.subject.includes(code)));

  // ---- F18 hủy vé ----
  const cc = await call('POST', `/bookings/${code}/cancel`, {}, khach);
  check('F18 Hủy vé: hoàn 90% theo chính sách', cc.j.data?.status === 'CANCELLED' && cc.j.data.refundAmount === Math.round(b.j.data.totalAmount * 0.9), cc.j);

  // ---- F20 đánh giá ----
  const past = mine.j.data.find((x) => x.canReview);
  const r1 = await call('POST', `/bookings/${past?.code}/review`, { rating: 5, comment: 'Rất tốt' }, khach);
  const r2 = await call('POST', `/bookings/${past?.code}/review`, { rating: 3 }, khach);
  const r3 = await call('POST', `/bookings/${code}/review`, { rating: 5 }, khach);
  check('F20 Đánh giá chuyến đã đi; lần 2 bị chặn; vé chưa đi bị chặn', r1.j.success && r2.j.error?.code === 'REVIEW_NOT_ALLOWED' && r3.j.error?.code === 'REVIEW_NOT_ALLOWED', [r1.j, r2.j, r3.j]);

  // ---- F23 bán vé tại quầy + F24 check-in ----
  const cm = (await call('GET', `/trips/${trip.id}/seats`, null, staff)).j.data;
  const cs = cm.seats.filter((x) => x.status === 'AVAILABLE' && !x.femaleOnly).slice(0, 2);
  await call('POST', `/trips/${trip.id}/holds`, { seatIds: cs.map((x) => x.seatId) }, staff);
  const counter = await call('POST', '/staff/bookings', { tripId: trip.id, seatIds: cs.map((x) => x.seatId), pickupStopId: det.route.stops[0].id, dropoffStopId: det.route.stops[2].id, contactName: 'Khách quầy', contactPhone: '0933333333' }, staff);
  check('F23 Bán vé tại quầy (tiền mặt) → PAID, kênh COUNTER', counter.j.data?.status === 'PAID' && counter.j.data.channel === 'COUNTER', counter.j);
  const mani = await call('GET', `/staff/trips/${trip.id}/passengers`, null, staff);
  const ci = await call('POST', '/staff/checkin', { code: `DVX|${counter.j.data.code}` }, staff);
  const ci2 = await call('POST', '/staff/checkin', { code: counter.j.data.code }, staff);
  check('F24 Danh sách hành khách; check-in bằng mã QR; quét lại báo đã lên xe', mani.j.data.passengers.some((x) => x.code === counter.j.data.code) && ci.j.data.alreadyCheckedIn === false && ci2.j.data.alreadyCheckedIn === true, [ci.j, ci2.j]);
  check('F24 Khách không được gọi API nhân viên', (await call('GET', `/staff/trips/${trip.id}/passengers`, null, khach)).status === 403);

  // ---- F25 F26 F27 quản trị tuyến, xe, ghế, chuyến ----
  const nr = await call('POST', '/routes', { originCity: 'Đà Nẵng', destinationCity: 'Huế', durationMinutes: 150, stops: [{ name: 'Văn phòng Đà Nẵng (mẫu)', address: 'Hải Châu', type: 'PICKUP', orderNo: 1, lat: 16.0544, lng: 108.2022 }, { name: 'Văn phòng Huế (mẫu)', address: 'TP. Huế', type: 'DROPOFF', orderNo: 2, offsetMinutes: 150 }] }, admin);
  const ur = await call('PATCH', `/routes/${nr.j.data.id}`, { isActive: false }, admin);
  check('F25 Thêm tuyến có điểm đón, ngừng tuyến', nr.j.success && ur.j.data.isActive === false, nr.j);
  const lay = (await call('GET', '/seat-layouts', null, admin)).j.data[0];
  const us = await call('PATCH', `/seats/${lay.seats[0].id}`, { priceExtra: 25000 }, admin);
  const ub = await call('PATCH', `/buses/${(await call('GET', '/buses', null, admin)).j.data[0].id}`, { amenities: ['Wi-Fi', 'Nước uống', 'TV'] }, admin);
  const blockSeat = m2.seats.find((x) => x.status === 'AVAILABLE' && x.code === 'B10');
  const bl = await call('POST', `/trips/${other.id}/seats/${blockSeat.seatId}/block`, { blocked: true }, admin);
  const hb = await call('POST', `/trips/${other.id}/holds`, { seatIds: [blockSeat.seatId] }, khach);
  await call('POST', `/trips/${other.id}/seats/${blockSeat.seatId}/block`, { blocked: false }, admin);
  check('F26 Sửa phụ thu ghế, tiện ích xe; khóa ghế → khách không giữ được', us.j.data.priceExtra === 25000 && ub.j.success && bl.j.data.status === 'BLOCKED' && hb.j.error?.code === 'SEAT_TAKEN', [bl.j, hb.j]);
  await call('PATCH', `/seats/${lay.seats[0].id}`, { priceExtra: 20000 }, admin);
  const gen = await call('POST', '/schedules/generate', { days: 15 }, admin);
  const gen2 = await call('POST', '/schedules/generate', { days: 15 }, admin);
  check('F27 Tạo chuyến hàng loạt từ lịch; bấm lại không tạo trùng', gen.j.data.created >= 1 && gen2.j.data.created === 0, [gen.j, gen2.j]);
  // hủy chuyến có khách: dùng chuyến Cần Thơ ngày kia
  const ct = (await call('GET', `/trips?from=${enc('Hồ Chí Minh')}&to=${enc('Cần Thơ')}&date=${vnDate(3)}`)).j.data.find((t) => t.operatorName === 'Phù Sa Express');
  const ctm = (await call('GET', `/trips/${ct.id}/seats`, null, khach)).j.data;
  const ctSeat = ctm.seats.find((x) => x.status === 'AVAILABLE' && !x.femaleOnly);
  const ctDet = (await call('GET', `/trips/${ct.id}`)).j.data;
  await call('POST', `/trips/${ct.id}/holds`, { seatIds: [ctSeat.seatId] }, khach);
  const cb = await call('POST', '/bookings', { tripId: ct.id, seatIds: [ctSeat.seatId], pickupStopId: ctDet.route.stops[0].id, dropoffStopId: ctDet.route.stops[1].id, contactName: 'Khách hàng mẫu', contactPhone: '0900000003', contactEmail: 'khach@example.com' }, khach);
  const cp = await call('POST', '/payments', { bookingCode: cb.j.data.code }, khach);
  await call('GET', `/payments/mock/pay?txnRef=${cp.j.data.txnRef}&amount=${cp.j.data.amount}&result=success`);
  const ctc = await call('POST', `/trips/${ct.id}/cancel`, {}, admin);
  const after = await call('GET', `/bookings/${cb.j.data.code}`, null, khach);
  check('F27 Hủy chuyến: vé bị hủy, hoàn 100%, có email báo khách', ctc.j.data?.cancelledBookings === 1 && after.j.data.status === 'CANCELLED' && after.j.data.refundAmount === after.j.data.totalAmount && (await mails(admin)).some((m) => m.subject.includes('đã bị hủy') && m.subject.includes(cb.j.data.code)), [ctc.j, after.j.data?.status]);

  // ---- F28 quản lý đơn ----
  const al = await call('GET', `/bookings?q=${counter.j.data.code}`, null, admin);
  const ac = await call('POST', `/bookings/${counter.j.data.code}/cancel`, { fullRefund: true }, admin);
  check('F28 Tìm đơn theo mã; admin hủy hoàn 100%', al.j.data.length === 1 && ac.j.data.refundAmount === counter.j.data.totalAmount, ac.j);

  // ---- F29 người dùng ----
  const users = (await call('GET', '/admin/users?q=lan@', null, admin)).j.data;
  await call('PATCH', `/admin/users/${users[0].id}`, { isLocked: true }, admin);
  const locked = await call('POST', '/auth/login', { email: 'lan@example.com', password: PW });
  await call('PATCH', `/admin/users/${users[0].id}`, { isLocked: false }, admin);
  const adminId = (await call('GET', '/auth/me', null, admin)).j.data.id;
  const selfLock = await call('PATCH', `/admin/users/${adminId}`, { isLocked: true }, admin);
  check('F29 Khóa tài khoản → không đăng nhập được; không tự khóa chính mình', locked.j.error?.code === 'ACCOUNT_LOCKED' && selfLock.status === 403, [locked.j, selfLock.j]);

  // ---- F31 mã giảm giá ----
  const nc = await call('POST', '/admin/coupons', { code: 'TET2027', percent: 15, maxDiscount: 80000, validFrom: new Date().toISOString(), validTo: new Date(Date.now() + 864e6).toISOString() }, admin);
  const bc = await call('POST', '/admin/coupons', { code: 'LOI', validFrom: new Date().toISOString(), validTo: new Date().toISOString() }, admin);
  check('F31 Tạo mã giảm giá; thiếu % hoặc số tiền → lỗi', nc.j.success && bc.j.success === false, bc.j);

  // ---- F21 F22 chatbot (chế độ theo luật) ----
  const c1 = (await call('POST', '/chat', { message: 'mai có xe sài gòn đi đà lạt buổi tối không?' })).j.data;
  check('F21 Chatbot hiểu "mai", "sài gòn", "tối" → trả chuyến thật', c1.trips.length >= 1 && c1.reply.includes('Đà Lạt'), c1);
  const c2 = (await call('POST', '/chat', { sessionId: c1.sessionId, message: 'cho mình hỏi chính sách hủy vé' })).j.data;
  check('F21 Chatbot trả lời chính sách hủy vé từ tài liệu', c2.reply.includes('10%'), c2.reply);
  const c3 = (await call('POST', '/chat', { message: `tra giúp vé ${past.code} sđt 0900000003` })).j.data;
  check('F21 Chatbot tra vé bằng mã + SĐT', c3.reply.includes(past.code), c3.reply);
  const c6 = (await call('POST', '/chat', { message: 'hành lý được mang bao nhiêu kg?' })).j.data;
  const c7 = (await call('POST', '/chat', { message: 'muốn đổi vé sang ngày khác thì sao' })).j.data;
  check('F21 Chatbot trả lời đúng chủ đề hành lý và đổi vé', c6.reply.startsWith('Hành lý') && c7.reply.startsWith('Đổi vé'), [c6.reply, c7.reply]);
  const c4 = (await call('POST', '/chat', { message: 'thời tiết hôm nay thế nào' })).j.data;
  const ho = await call('POST', '/support', { type: 'HANDOFF', subject: 'Chatbot chuyển nhân viên', message: 'Khách hỏi ngoài phạm vi', contactPhone: '0944444444', chatSessionId: c4.sessionId });
  check('F22 Câu ngoài phạm vi → gợi ý gặp nhân viên; tạo yêu cầu chuyển nhân viên', c4.suggestHandoff === true && ho.j.success, [c4, ho.j]);

  // ---- F32 tri thức chatbot + lịch sử ----
  const kb = await call('POST', '/admin/kb', { title: 'Thú cưng', content: 'Không nhận chở thú cưng trên xe giường nằm.' }, admin);
  const c5 = (await call('POST', '/chat', { message: 'có được mang thú cưng không' })).j.data;
  const chats = (await call('GET', '/admin/chats', null, admin)).j.data;
  check('F32 Thêm tài liệu → chatbot dùng ngay; admin xem lịch sử chat', kb.j.success && c5.reply.includes('thú cưng') && chats.length >= 3, c5.reply);

  // ---- F34 hỗ trợ ----
  const sup = await call('POST', '/support', { subject: 'Khiếu nại tài xế', message: 'Xe đến trễ 30 phút', bookingCode: past.code, type: 'COMPLAINT' }, khach);
  const noPhone = await call('POST', '/support', { subject: 'Hỏi', message: 'Không đăng nhập, không SĐT' });
  const rep = await call('POST', `/admin/support/${sup.j.data.id}/reply`, { reply: 'Xin lỗi bạn, nhà xe sẽ nhắc nhở tài xế.' }, staff);
  const mySup = (await call('GET', '/support/me', null, khach)).j.data;
  check('F34 Gửi khiếu nại; nhân viên trả lời; khách xem câu trả lời; khách vãng lai phải có SĐT', rep.j.data.status === 'ANSWERED' && mySup.some((x) => x.reply) && noPhone.j.error?.code === 'VALIDATION_FAILED', noPhone.j);

  // ---- F30 thống kê ----
  const st = (await call('GET', `/admin/stats?from=${vnDate(-7)}&to=${vnDate(14)}`, null, admin)).j.data;
  const xl = await call('GET', `/admin/stats/export?from=${vnDate(-7)}&to=${vnDate(14)}`, null, admin, true);
  check('F30 Thống kê doanh thu, theo tuyến, lấp đầy; xuất Excel', st.revenue > 0 && st.byRoute.length >= 1 && st.tripRows.length > 100 && xl.buf.slice(0, 2).toString() === 'PK', { revenue: st.revenue, routes: st.byRoute });

  // ---- F35 nhật ký ----
  const logs = (await call('GET', '/admin/audit-logs', null, admin)).j.data;
  check('F35 Nhật ký ghi thao tác admin/nhân viên, không lưu mật khẩu', logs.some((l) => l.path.includes('/cancel')) && !JSON.stringify(logs).includes(PW));

  // ---- F01 + phân quyền ----
  check('F01 Khách gọi API quản trị → 403', (await call('GET', '/admin/users', null, khach)).status === 403);

  // ---- F33 nhắc lịch: đặt chuyến trong 3 giờ tới, chờ tác vụ tự động (chạy mỗi phút) ----
  const today = (await call('GET', `/trips?from=${enc('Hồ Chí Minh')}&to=${enc('Nha Trang')}&date=${vnDate(0)}`)).j.data.find((t) => new Date(t.departAt) - Date.now() < 3 * 3600e3);
  if (!today) {
    check('F33 Nhắc lịch (bỏ qua: không có chuyến nào trong 3 giờ tới lúc chạy test)', true);
  } else {
    const tm = (await call('GET', `/trips/${today.id}/seats`, null, khach)).j.data;
    const ts = tm.seats.find((x) => x.status === 'AVAILABLE' && !x.femaleOnly);
    const td = (await call('GET', `/trips/${today.id}`)).j.data;
    await call('POST', `/trips/${today.id}/holds`, { seatIds: [ts.seatId] }, khach);
    const tb = await call('POST', '/bookings', { tripId: today.id, seatIds: [ts.seatId], pickupStopId: td.route.stops.find((x) => x.type !== 'DROPOFF').id, dropoffStopId: td.route.stops.find((x) => x.type === 'DROPOFF').id, contactName: 'Khách hàng mẫu', contactPhone: '0900000003', contactEmail: 'khach@example.com' }, khach);
    const tp = await call('POST', '/payments', { bookingCode: tb.j.data.code }, khach);
    await call('GET', `/payments/mock/pay?txnRef=${tp.j.data.txnRef}&amount=${tp.j.data.amount}&result=success`);
    let got = false;
    for (let i = 0; i < 14 && !got; i++) {
      await new Promise((r) => setTimeout(r, 5000));
      got = (await mails(admin)).some((m) => m.subject.startsWith('Nhắc lịch') && m.subject.includes(tb.j.data.code));
    }
    check('F33 Email nhắc lịch tự gửi cho chuyến trong 3 giờ tới', got);
  }

  console.log(`\nKết quả: ${pass}/${pass + fail} đạt`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
