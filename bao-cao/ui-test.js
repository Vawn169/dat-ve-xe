// Chạy thử giao diện bằng Chrome thật: bấm qua các luồng của 35 chức năng, chụp màn hình.
const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');

const BASE = 'http://localhost:5173';
const OUT = path.join(__dirname, 'shots');
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
const results = [];
const consoleErrors = [];
const check = (name, ok, extra) => { results.push({ name, ok: !!ok, extra }); console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${extra ? ' → ' + extra : ''}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const step = async (name, fn) => { try { await fn(); } catch (e) { check(name + ' (lỗi)', false, e.message.split('\n')[0]); } };

async function newPage(browser, w = 1366, h = 900) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: w, height: h });
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 90) + ' @ ' + page.url()); });
  page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message));
  return page;
}
const shot = (page, name, full = true) => page.screenshot({ path: path.join(OUT, name), fullPage: full });
const clickText = async (page, selector, text) => {
  const els = await page.$$(selector);
  for (const el of els) { const t = await el.evaluate((n) => n.textContent); if (t && t.includes(text)) { await el.click(); return true; } }
  return false;
};
const text = (page, sel) => page.$eval(sel, (e) => e.textContent).catch(() => '');
async function loginAs(page, email) {
  await page.goto(BASE + '/', { waitUntil: 'networkidle0' });
  await page.evaluate(async (email) => {
    const r = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'Matkhau@123' }) });
    localStorage.setItem('dvx_token', (await r.json()).data.accessToken);
  }, email);
}
const ymd = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(d);
const pickFirstOption = async (page, selectId) => {
  await page.click(`#${selectId}`);
  await page.waitForSelector('.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option', { timeout: 8000 });
  await sleep(500); // chờ hiệu ứng mở danh sách
  await page.click('.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option');
};

(async () => {
  const browser = await puppeteer.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true, args: ['--no-first-run', '--lang=vi-VN'] });
  let code = null;
  let searchUrl = null;
  try {
    const p1 = await newPage(browser);
    await step('Trang chủ & tìm chuyến', async () => {
      await p1.goto(BASE + '/', { waitUntil: 'networkidle0' });
      await p1.waitForSelector('.route-card', { timeout: 10000 });
      check('F05 Trang chủ: ô tìm chuyến + tuyến phổ biến', (await p1.$$('.route-card')).length >= 2);
      await shot(p1, '01_trang_chu.png');
      await clickText(p1, '.route-card', 'Đà Lạt');
      await p1.waitForSelector('.trip-card', { timeout: 10000 });
      const u = new URL(p1.url());
      u.searchParams.set('date', ymd(new Date(Date.now() + 2 * 86400e3)));
      searchUrl = u.toString();
      await p1.goto(searchUrl, { waitUntil: 'networkidle0' });
      await p1.waitForSelector('.trip-card', { timeout: 10000 });
      check('F05 Kết quả tìm chuyến (ngày kia)', (await p1.$$('.trip-card')).length >= 1);
      check('F06/F07 Thẻ chuyến có logo nhà xe, ảnh xe, đánh giá, tiện ích', !!(await p1.$('.op-logo')) && !!(await p1.$('.photo-strip img')) && !!(await p1.$('.tag-soft')));
      check('F06 Bộ lọc: nhà xe, loại xe, điểm đón/trả, tiện ích', (await p1.$$('.filter-sections .ant-collapse-item')).length >= 8 && (await p1.$$('.quick-chips .chip')).length >= 8);
      await shot(p1, '02_ket_qua_tim_chuyen.png');
    });

    await step('Chi tiết chuyến', async () => {
      await clickText(p1, '.trip-links button', 'Đánh giá');
      await p1.waitForSelector('.trip-info', { timeout: 8000 });
      await sleep(800);
      check('F07 Chi tiết chuyến: điểm đón/trả, đánh giá, hình ảnh, tiện ích, chính sách', (await p1.$$('.trip-info .ant-tabs-tab')).length === 5);
      await shot(p1, '03_chi_tiet_danh_gia.png');
      await clickText(p1, '.trip-links button', 'Đánh giá');
    });

    await step('Chọn ghế + đăng nhập', async () => {
      await p1.click('.trip-card .trip-btns .btn-primary');
      await p1.waitForSelector('.seat', { timeout: 10000 });
      check('F08 Sơ đồ ghế 2 tầng', (await p1.$$('.deck')).length === 2);
      check('F10 Có ghế dành cho nữ (màu hồng)', (await p1.$$('.seat.female')).length > 0);
      await sleep(800);
      check('F08 Kết nối realtime', await p1.$('.live.on'));
      await (await p1.$('.seat.AVAILABLE:not(.female)')).click();
      await p1.waitForSelector('#login-email', { timeout: 5000 });
      check('F01 Chưa đăng nhập bấm ghế thì hiện hộp đăng nhập (có link Quên mật khẩu)', (await text(p1, '.ant-modal')).includes('Quên mật khẩu'));
      await p1.type('#login-email', 'khach@example.com');
      await p1.type('#login-password', 'Matkhau@123');
      await p1.click('.ant-modal button[type=submit]');
      await sleep(1500);
      let seats = await p1.$$('.seat.AVAILABLE:not(.female)');
      await seats[0].click();
      await p1.waitForSelector('.seat.HELD_BY_ME', { timeout: 5000 });
      seats = await p1.$$('.seat.AVAILABLE:not(.female)');
      await seats[0].click();
      await p1.waitForFunction(() => document.querySelectorAll('.seat.HELD_BY_ME').length === 2, { timeout: 5000 });
      check('F09 Giữ 2 ghế có đồng hồ đếm ngược', await p1.$('.hold-timer'));
      await shot(p1, '04_chon_ghe.png');
    });

    await step('Đặt vé + mã giảm giá + thanh toán', async () => {
      await p1.click('.seat-summary .btn-primary');
      await p1.waitForSelector('#contact-name', { timeout: 8000 });
      await sleep(500);
      check('F11/F04 Điểm đón trả, thông tin hành khách từng ghế', (await p1.$$('.pax')).length === 2);
      await p1.type('#coupon-code', 'GIAM10');
      await clickText(p1, '.coupon button', 'Áp dụng');
      await p1.waitForSelector('.coupon ~ .ok, small.ok', { timeout: 5000 });
      check('F12 Áp mã GIAM10 thành công', (await text(p1, 'small.ok')).includes('GIAM10'), await text(p1, 'small.ok'));
      await shot(p1, '05_thong_tin_va_ma_giam.png');
      await p1.click('.checkout form button[type=submit]');
      await p1.waitForSelector('.pay-box', { timeout: 10000 });
      code = new URL(p1.url()).searchParams.get('code');
      check('F13 Tạo đơn, chuyển sang thanh toán', !!code, code);
      await shot(p1, '06_thanh_toan.png');
      await p1.click('.pay-actions .btn-primary');
      await p1.waitForSelector('.pay-success', { timeout: 10000 });
      check('F13 Thanh toán (giả lập) thành công', true);
    });

    await step('Vé của tôi', async () => {
      await p1.goto(BASE + '/ve-cua-toi', { waitUntil: 'networkidle0' });
      await p1.waitForSelector('.ticket', { timeout: 8000 });
      check('F16 Vé của tôi có vé vừa đặt', (await p1.$$eval('.ticket-code', (e) => e.map((x) => x.textContent))).includes(code));
      await clickText(p1, '.qr-box .link', 'QR');
      await p1.waitForSelector('img.qr', { timeout: 5000 });
      check('F14 Hiện mã QR lên xe', true);
      const acts = await text(p1, '.ticket-actions');
      check('F15/F19 Có nút tải PDF và Đổi chuyến', acts.includes('PDF') && acts.includes('Đổi chuyến'), acts);
      await shot(p1, '07_ve_cua_toi_qr.png');
      await clickText(p1, '.ant-segmented-item', 'Đã đi');
      await sleep(500);
      const past = await text(p1, '.ticket-list');
      check('F20 Có chuyến đã đi chờ đánh giá', past.includes('Đánh giá'));
      if (await clickText(p1, '.ticket-actions button', 'Đánh giá chuyến đi')) {
        await p1.waitForSelector('#review-comment', { timeout: 5000 });
        await p1.type('#review-comment', 'Xe sạch, tài xế chạy êm.');
        await shot(p1, '08_danh_gia.png', false);
        await p1.click('.ant-modal-footer .ant-btn-primary');
        await sleep(1200);
        check('F20 Gửi đánh giá', (await text(p1, '.ticket-list')).includes('Xe sạch'));
      }
      await clickText(p1, '.ant-segmented-item', 'Sắp đi');
      await sleep(300);
    });

    await step('Đổi chuyến', async () => {
      await p1.goto(BASE + '/doi-ve/' + code, { waitUntil: 'networkidle0' });
      await p1.waitForSelector('.change-head', { timeout: 8000 });
      await sleep(800);
      await p1.click('.trip-card .trip-price .btn-primary');
      await p1.waitForSelector('.seat.AVAILABLE', { timeout: 8000 });
      await sleep(800);
      for (let i = 0; i < 2; i++) {
        const s = await p1.$$('.seat.AVAILABLE:not(.female)');
        await s[0].click();
        await p1.waitForFunction((n) => document.querySelectorAll('.seat.HELD_BY_ME').length === n, { timeout: 5000 }, i + 1);
      }
      await shot(p1, '09_doi_chuyen.png');
      await p1.click('.seat-summary .btn-primary');
      await p1.waitForFunction(() => location.pathname === '/ve-cua-toi', { timeout: 10000 });
      await p1.waitForSelector('.ticket', { timeout: 8000 });
      await sleep(500);
      check('F19 Đổi chuyến thành công (vé có nhãn Đã đổi chuyến)', (await text(p1, '.ticket-list')).includes('Đã đổi chuyến'));
    });

    await step('Tra cứu', async () => {
      const p3 = await newPage(browser);
      await p3.goto(BASE + '/tra-cuu', { waitUntil: 'networkidle0' });
      await p3.type('#lookup-code', code);
      await p3.type('#lookup-phone', '0900000003');
      await p3.click('.lookup-form button[type=submit]');
      await p3.waitForSelector('.ticket', { timeout: 8000 });
      check('F17 Tra cứu vé không đăng nhập, có nút PDF', (await text(p3, '.ticket')).includes('PDF'));
      await shot(p3, '10_tra_cuu.png');
      // Chatbot
      await p3.click('.chat-fab');
      await p3.waitForSelector('#chat-input');
      await p3.type('#chat-input', 'mai có xe đi Cần Thơ không');
      await p3.keyboard.press('Enter');
      await p3.waitForFunction(() => document.querySelectorAll('.msg.bot').length >= 2 && !document.querySelector('.typing'), { timeout: 15000 });
      check('F21 Chatbot tìm chuyến, trả về thẻ chuyến bấm được', (await p3.$$('.chat-trip')).length > 0);
      await p3.type('#chat-input', 'được mang bao nhiêu kg hành lý');
      await p3.keyboard.press('Enter');
      await sleep(1500);
      const last = await p3.$$eval('.msg.bot .msg-text', (e) => e[e.length - 1].textContent);
      check('F21 Chatbot trả lời chính sách hành lý', /kg|hành lý/i.test(last), last.slice(0, 80));
      await p3.type('#chat-input', 'thời tiết hôm nay thế nào');
      await p3.keyboard.press('Enter');
      await sleep(1500);
      check('F22 Câu ngoài phạm vi có nút Gặp nhân viên', (await p3.$$('.chat-handoff')).length > 0);
      await shot(p3, '11_chatbot.png', false);
      // Hỗ trợ (khách vãng lai)
      await p3.goto(BASE + '/ho-tro', { waitUntil: 'networkidle0' });
      await p3.type('#sup-subject', 'Hỏi về xuất hóa đơn');
      await p3.type('#sup-message', 'Cho mình hỏi có xuất hóa đơn VAT được không?');
      await p3.type('#sup-phone', '0911222333');
      await p3.click('form button[type=submit]');
      await p3.waitForSelector('.ant-alert-success', { timeout: 6000 });
      check('F34 Gửi yêu cầu hỗ trợ', true);
      await shot(p3, '12_ho_tro.png');
      // Quên mật khẩu
      await p3.goto(BASE + '/quen-mat-khau', { waitUntil: 'networkidle0' });
      await p3.type('#forgot-email', 'lan@example.com');
      await p3.click('form button[type=submit]');
      await p3.waitForSelector('.ant-alert-success', { timeout: 6000 });
      check('F02 Quên mật khẩu gửi link', true);
    });

    await step('Tài khoản', async () => {
      await p1.goto(BASE + '/tai-khoan', { waitUntil: 'networkidle0' });
      await p1.waitForSelector('#acc-name', { timeout: 8000 });
      await clickText(p1, '.ant-tabs-tab', 'Hành khách');
      await sleep(600);
      check('F03/F04 Tài khoản: hồ sơ, hành khách đã lưu', (await p1.$$('.pax-list li')).length >= 1);
      await shot(p1, '13_tai_khoan.png');
    });

    await step('Hủy vé', async () => {
      await p1.goto(BASE + '/ve-cua-toi', { waitUntil: 'networkidle0' });
      await p1.waitForSelector('.ticket');
      await sleep(1200);
      const diag = await p1.$$eval('.ticket-actions button', (els) => els.map((e) => { const r = e.getBoundingClientRect(); return `${e.textContent.trim()}[${Math.round(r.width)}x${Math.round(r.height)} disp=${getComputedStyle(e).display}]`; }));
      console.log('DIAG nút:', diag.join(' | '), '| url', p1.url());
      await clickText(p1, '.ticket-actions button', 'Hủy vé');
      await p1.waitForSelector('.ant-popconfirm .ant-btn-primary', { timeout: 5000 });
      await sleep(600); // chờ hiệu ứng mở hộp xác nhận
      await p1.click('.ant-popconfirm .ant-btn-primary');
      await sleep(1500);
      await clickText(p1, '.ant-segmented-item', 'Tất cả');
      await sleep(500);
      const st = await text(p1, '.ticket-list');
      check('F18 Hủy vé, hiện tiền hoàn', st.includes('Đã hủy') && st.includes('Hoàn lại'));
    });

    // ---------- Nhân viên ----------
    let staffCode = null;
    const s = await newPage(browser);
    await step('Bán vé tại quầy', async () => {
      await loginAs(s, 'staff@example.com');
      await s.goto(BASE + '/nhan-vien', { waitUntil: 'networkidle0' });
      await s.waitForSelector('#counter-trip', { timeout: 8000 });
      await sleep(800);
      await pickFirstOption(s, 'counter-trip');
      await s.waitForSelector('.seat.AVAILABLE', { timeout: 8000 });
      await sleep(800);
      await (await s.$('.seat.AVAILABLE:not(.female)')).click();
      await s.waitForSelector('.seat.HELD_BY_ME', { timeout: 5000 });
      await s.click('.seat-summary .btn-primary');
      await s.waitForSelector('#c-name', { timeout: 5000 });
      await s.type('#c-name', 'Lê Văn Quầy');
      await s.type('#c-phone', '0977000111');
      await shot(s, '14_ban_ve_tai_quay.png');
      await s.click('form button[type=submit]');
      await s.waitForSelector('.counter-done', { timeout: 10000 });
      staffCode = await text(s, '.counter-done .ticket-code');
      check('F23 Bán vé tại quầy, thu tiền mặt, xuất vé', !!staffCode && (await text(s, '.counter-done')).includes('Mua tại quầy'), staffCode);
      await shot(s, '15_ve_tai_quay.png');
    });
    await step('Soát vé', async () => {
      await s.goto(BASE + '/nhan-vien', { waitUntil: 'networkidle0' });
      await clickText(s, '.ant-tabs-tab', 'Soát vé');
      await s.waitForSelector('#checkin-code', { timeout: 5000 });
      await s.type('#checkin-code', `DVX|${staffCode}`);
      await clickText(s, '.checkin-box button', 'Xác nhận');
      await s.waitForSelector('.checkin-box .ant-alert', { timeout: 6000 });
      check('F24 Soát vé bằng nội dung QR', (await s.$('.checkin-box .ant-alert-success')) != null, await text(s, '.checkin-box .ant-alert'));
      await clickText(s, '.checkin-box button', 'Xác nhận');
      await s.type('#checkin-code', staffCode);
      await clickText(s, '.checkin-box button', 'Xác nhận');
      await sleep(1000);
      check('F24 Soát lại vé đã soát thì cảnh báo', (await text(s, '.checkin-box .ant-alert')).includes('ĐÃ SOÁT'));
      await pickFirstOption(s, 'check-trip');
      await sleep(1000);
      await shot(s, '16_soat_ve.png');
    });

    // ---------- Quản trị ----------
    const a = await newPage(browser);
    await step('Quản trị', async () => {
      await loginAs(a, 'admin@example.com');
      await a.goto(BASE + '/quan-tri', { waitUntil: 'networkidle0' });
      await a.waitForSelector('.kpi', { timeout: 10000 });
      await sleep(800);
      check('F30 Thống kê: 4 chỉ số + biểu đồ doanh thu theo ngày', (await a.$$('.kpi')).length === 4 && (await a.$('.bar-chart svg')));
      const bars = await a.$$('.bar-chart .bar');
      if (bars.length) {
        await bars[0].hover();
        await sleep(300);
        check('F30 Rê chuột vào cột hiện chú thích', (await a.$('.chart-tip')) != null);
      }
      await shot(a, '17_qt_thong_ke.png');
      const sections = [
        ['chuyen', '18_qt_chuyen_lich_chay.png'],
        ['tuyen', '19_qt_tuyen.png'],
        ['xe', '20_qt_xe_so_do_ghe.png'],
        ['ve', '21_qt_don_ve.png'],
        ['nguoi-dung', '22_qt_nguoi_dung.png'],
        ['ma-giam-gia', '23_qt_ma_giam_gia.png'],
        ['tri-thuc', '24_qt_tri_thuc.png'],
        ['chat', '25_qt_lich_su_chat.png'],
        ['ho-tro', '26_qt_ho_tro.png'],
        ['nhat-ky', '27_qt_nhat_ky.png'],
        ['hop-thu', '28_qt_hop_thu.png'],
      ];
      for (const [k, f] of sections) {
        await a.goto(`${BASE}/quan-tri?muc=${k}`, { waitUntil: 'networkidle0' });
        await sleep(700);
        const rows = await a.$$('.admin-main .ant-table-row, .admin-main .card');
        check(`Quản trị · ${k}: có dữ liệu`, rows.length > 0, `${rows.length} dòng/khối`);
        await shot(a, f);
      }
      // Hộp thư: mở email vé
      await a.goto(`${BASE}/quan-tri?muc=hop-thu`, { waitUntil: 'networkidle0' });
      await a.waitForSelector('.ant-table-row');
      await (await a.$('.ant-table-row')).click();
      await a.waitForSelector('.mail-frame', { timeout: 5000 });
      await sleep(500);
      await shot(a, '29_qt_xem_email.png', false);
      check('Hộp thư thử nghiệm: xem nội dung email', true);
      // Form mới: tạo sơ đồ ghế, thêm xe, sửa tuyến
      const typeIn = async (sel, val) => { await a.click(sel, { clickCount: 3 }); await a.keyboard.press('Backspace'); await a.type(sel, String(val)); };
      const okModal = async () => { await sleep(400); const b = await a.$$('.ant-modal-wrap:not([style*="display: none"]) .ant-modal-footer .ant-btn-primary'); await b[b.length - 1].click(); };
      await a.goto(`${BASE}/quan-tri?muc=xe`, { waitUntil: 'networkidle0' });
      await a.waitForSelector('#layout-pick');
      await clickText(a, '.admin-main button', 'Tạo sơ đồ mới');
      await a.waitForSelector('#layout-name', { visible: true });
      await a.type('#layout-name', 'Limousine 1 tầng 12 chỗ (thử)');
      await typeIn('#layout-floors', 1); await typeIn('#layout-rows', 4); await typeIn('#layout-cols', 3);
      await sleep(300);
      const hint = await text(a, '.ant-modal-wrap:not([style*="display: none"]) .hint');
      check('F26 Tạo sơ đồ: báo trước số ghế', hint.includes('12 ghế'), hint.slice(0, 40));
      await okModal();
      await sleep(1200);
      check('F26 Tạo sơ đồ ghế mới (1 tầng 12 ghế)', (await a.$$('.admin-main .deck')).length === 1 && (await a.$$('.admin-main .layout-seat')).length === 12);
      await shot(a, '34_qt_tao_so_do.png');
      await clickText(a, '.admin-main button', 'Thêm xe');
      await a.waitForSelector('#bus-plate', { visible: true });
      await a.type('#bus-plate', '51B-999.99');
      await a.type('#bus-type', 'Limousine 12 chỗ');
      await pickFirstOption(a, 'bus-layout');
      await okModal();
      await sleep(1200);
      check('F26 Thêm xe mới', (await text(a, '.admin-main .ant-table')).includes('51B-999.99'));
      await okModal().catch(() => undefined);
      // Thêm lại cùng biển số → báo lỗi
      await clickText(a, '.admin-main button', 'Thêm xe');
      await a.waitForSelector('#bus-plate', { visible: true });
      await a.type('#bus-plate', '51B-999.99');
      await a.type('#bus-type', 'Trùng biển số');
      await pickFirstOption(a, 'bus-layout');
      await okModal();
      await sleep(1200);
      const msg = await text(a, '.ant-message');
      check('F26 Trùng biển số thì báo lỗi rõ ràng', msg.includes('đã có trong đội xe'), msg);
      await a.keyboard.press('Escape');
      await sleep(400);
      // Sửa xe
      const editBtns = await a.$$('.admin-main .ant-table-row button.btn-ghost');
      await editBtns[editBtns.length - 1].click();
      await a.waitForSelector('#bus-type', { visible: true });
      await sleep(300);
      await typeIn('#bus-type', 'Limousine 12 chỗ VIP');
      await okModal();
      await sleep(1200);
      check('F26 Sửa xe', (await text(a, '.admin-main .ant-table')).includes('Limousine 12 chỗ VIP'));
      // Sửa tuyến: đổi địa chỉ điểm đón đầu tiên
      await a.goto(`${BASE}/quan-tri?muc=tuyen`, { waitUntil: 'networkidle0' });
      await a.waitForSelector('.admin-main .card');
      await clickText(a, '.admin-main .row-actions button', 'Sửa tuyến');
      await a.waitForSelector('#r-origin', { visible: true });
      await sleep(400);
      const prefilled = await a.$eval('#r-origin', (e) => e.value);
      check('F25 Mở form sửa tuyến có sẵn dữ liệu', prefilled.length > 0, prefilled);
      const addr = await a.$('.ant-modal-wrap:not([style*="display: none"]) .stop-row input[placeholder="Địa chỉ"]');
      await addr.click({ clickCount: 3 }); await a.keyboard.press('Backspace');
      await addr.type('Số 1 Đường Thử, Quận 1');
      await shot(a, '35_qt_sua_tuyen.png', false);
      await okModal();
      await sleep(1200);
      check('F25 Sửa điểm đón của tuyến', (await text(a, '.admin-main')).includes('Số 1 Đường Thử'));
      // Khóa ghế
      await a.goto(`${BASE}/quan-tri?muc=chuyen`, { waitUntil: 'networkidle0' });
      await a.waitForSelector('.ant-table-row');
      if (await clickText(a, '.row-actions button', 'Khóa ghế')) {
        await a.waitForSelector('.ant-modal .seat', { timeout: 6000 });
        const free = await a.$('.ant-modal .seat:not(.SOLD):not(.BLOCKED)');
        await free.click();
        await sleep(1000);
        check('F27 Khóa ghế trên chuyến', (await a.$$('.ant-modal .seat.BLOCKED')).length >= 1);
        await shot(a, '30_qt_khoa_ghe.png', false);
        await (await a.$('.ant-modal .seat.BLOCKED')).click();
        await sleep(800);
      }
    });

    // ---------- Điện thoại ----------
    await step('Điện thoại', async () => {
      const m = await newPage(browser, 390, 844);
      await m.goto(BASE + '/', { waitUntil: 'networkidle0' });
      await m.waitForSelector('.route-card');
      await shot(m, '31_dt_trang_chu.png');
      await m.goto(searchUrl, { waitUntil: 'networkidle0' });
      await m.waitForSelector('.trip-card');
      await (await m.$('.trip-card .trip-btns .btn-primary')).click();
      await m.waitForSelector('.seat');
      await sleep(500);
      const o1 = await m.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      check('Điện thoại: sơ đồ ghế không tràn ngang', o1 <= 1, `tràn ${o1}px`);
      await shot(m, '32_dt_so_do_ghe.png');
      await loginAs(m, 'admin@example.com');
      await m.goto(BASE + '/quan-tri', { waitUntil: 'networkidle0' });
      await m.waitForSelector('.kpi', { timeout: 8000 });
      await sleep(500);
      const o2 = await m.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      check('Điện thoại: trang quản trị không tràn ngang', o2 <= 1, `tràn ${o2}px`);
      await shot(m, '33_dt_quan_tri.png');
    });
  } catch (e) {
    check('Lỗi khi chạy kịch bản', false, e.message);
  } finally {
    await browser.close();
    const errs = consoleErrors.filter((t) => !/favicon|Download the React DevTools|409 \(Conflict\) @ .*muc=xe/.test(t));
    console.log('Lỗi console trình duyệt:', errs.length ? errs.slice(0, 10) : 'không có');
    console.log(`\nKết quả: ${results.filter((r) => r.ok).length}/${results.length} đạt`);
    fs.writeFileSync(path.join(__dirname, 'result.json'), JSON.stringify({ results, consoleErrors: errs }, null, 2));
  }
})();
