# Báo cáo bản xem trước – Website đặt vé xe khách (đủ 35 chức năng)

Ngày 21/11/2026. Bản này chỉ nằm trên máy của Văn, **không đẩy lên GitHub**. Thư mục `~/dat-ve-xe` không phải repo git. Repo nhóm `~/DoAnVeXe` và PR #1 không bị đụng tới.

## 1. Tóm tắt

- Cả 35/35 chức năng đều có giao diện và API, chạy được trên máy.
- Kiểm thử tự động API: **44/44 đạt**.
- Kiểm thử giao diện bằng Chrome thật: **54/54 đạt**, không có lỗi trong console trình duyệt.
- Một số phần mới ở mức giả lập:
  - Thanh toán là giả lập. Code VNPay đã viết nhưng chưa chạy thử.
  - Email chưa gửi thật, được lưu ở "Hộp thư thử nghiệm".
  - Chatbot chạy chế độ luật (không AI). Chế độ AI Claude chưa thử vì cần khóa API và tốn phí.
- Chi tiết những gì chưa làm hoặc chưa thử nằm ở mục 5.

## 2. Cách mở xem

Hiện backend (cổng 3000) và giao diện (cổng 5173) **đang chạy**. Mở trình duyệt vào: http://localhost:5173

Nếu máy đã tắt, chạy lại bằng 3 lệnh, mỗi lệnh một cửa sổ terminal Ubuntu:

```bash
docker start datve-pg datve-redis
cd ~/dat-ve-xe/backend && ANTHROPIC_API_KEY= DISABLE_THROTTLE=true ~/.local/node-v22.11.0-linux-x64/bin/node dist/main.js
cd ~/dat-ve-xe/frontend && PATH=~/.local/node-v22.11.0-linux-x64/bin:$PATH npx vite
```

Muốn đưa dữ liệu mẫu về như ban đầu: `cd ~/dat-ve-xe/backend && npx prisma db seed`

Tài khoản mẫu (mật khẩu đều là `Matkhau@123`):

| Vai trò | Email | Vào được |
|---|---|---|
| Khách hàng | khach@example.com | Đặt vé, Vé của tôi, Tài khoản, Hỗ trợ |
| Nhân viên | staff@example.com | Thêm trang Nhân viên (bán vé tại quầy, soát vé) |
| Quản trị | admin@example.com | Thêm trang Quản trị (12 mục) |

Mã giảm giá để thử: `GIAM10` (giảm 10%, tối đa 50.000đ), `CHAOBAN` (giảm 30.000đ cho đơn từ 200.000đ), `HETHAN` (đã hết hạn, để thử báo lỗi).

## 3. Bảng 35 chức năng

Mã và tên chức năng theo file `35_ChucNang`. Cột "Kiểm thử" ghi chức năng được kiểm tra tự động ở API, ở giao diện (UI), hay cả hai.

| Mã | Chức năng | Xem ở đâu trên web | Tình trạng | Kiểm thử |
|---|---|---|---|---|
| F01 | Đăng ký, đăng nhập | Nút "Đăng nhập / Đăng ký" góc phải; tài khoản bị khóa không đăng nhập được; phân quyền khách / nhân viên / quản trị | Chạy được | API + UI |
| F02 | Quên mật khẩu | Link "Quên mật khẩu?" trong hộp đăng nhập → /quen-mat-khau. Link đặt lại hiệu lực 30 phút, dùng 1 lần | Chạy được (email nằm ở Hộp thư thử nghiệm) | API + UI |
| F03 | Hồ sơ, đổi mật khẩu | Menu tên người dùng → Tài khoản | Chạy được | API + UI |
| F04 | Hành khách thường đi | Tài khoản → Hành khách đã lưu (tối đa 10); khi đặt vé có ô chọn nhanh | Chạy được | API + UI |
| F05 | Tìm chuyến | Trang chủ: ô tìm kiếm + tuyến phổ biến | Chạy được | API + UI |
| F06 | Lọc và sắp xếp | Trang kết quả: lọc giờ, loại xe, giá, điểm đánh giá; sắp xếp giờ / giá / đánh giá / ghế trống | Chạy được | API + UI |
| F07 | Xem chi tiết chuyến | Nút "Chi tiết" trên thẻ chuyến: Tiện ích, Lộ trình, Chính sách, Đánh giá | Chạy được | API + UI |
| F08 | Sơ đồ ghế realtime | Nút "Chọn ghế": sơ đồ 2 tầng, người khác giữ / mua ghế thì cập nhật ngay; giá riêng theo ghế | Chạy được | API + UI |
| F09 | Giữ ghế có đếm ngược | Đồng hồ giữ ghế. Chống giữ vô hạn: tổng thời gian giữ có giới hạn, quá thì phải chờ 15 phút; tối đa 60 lần giữ mỗi giờ | Chạy được | API + UI |
| F10 | Ghế dành cho nữ | Ghế màu hồng có biểu tượng nữ; khai giới tính Nam thì bị chặn (chặn cả ở backend) | Chạy được | API + UI |
| F11 | Chọn điểm đón / trả | Chọn khi chọn ghế; có link "Bản đồ" mở Google Maps theo tọa độ | Chạy được | API + UI |
| F12 | Áp mã giảm giá | Trang đặt vé, khung bên phải | Chạy được | API + UI |
| F13 | Thanh toán online | Trang thanh toán giả lập (có chữ ký, gọi lại 2 lần không trừ 2 lần). VNPay sandbox đã viết code | Giả lập; **VNPay chưa chạy thử** | API + UI |
| F14 | Vé điện tử mã QR | Vé của tôi → "Hiện mã QR lên xe"; email vé có mã QR | Chạy được | API + UI |
| F15 | Tải vé PDF | Vé của tôi, Tra cứu vé (phải đúng số điện thoại) | Chạy được | API + UI |
| F16 | Vé của tôi | Tab Sắp đi / Đã đi / Tất cả | Chạy được | API + UI |
| F17 | Tra cứu vé | /tra-cuu, không cần đăng nhập, số điện thoại được che | Chạy được | API + UI |
| F18 | Hủy vé, hoàn tiền | Phí: trước 24 giờ 10%, từ 4–24 giờ 30%, dưới 4 giờ không hủy | Chạy được; **chỉ ghi số tiền hoàn, chưa hoàn tiền thật** | API + UI |
| F19 | Đổi chuyến / đổi ngày | Nút "Đổi chuyến": trước giờ chạy 12 giờ, cùng tuyến, cùng số ghế, chỗ mới cùng giá hoặc rẻ hơn | Chạy được | API + UI |
| F20 | Đánh giá chuyến đi | Tab "Đã đi" → "Đánh giá chuyến đi" (1 lần mỗi vé); hiện ở trang tìm chuyến | Chạy được | API + UI |
| F21 | Chatbot hỏi đáp | Nút tròn góc phải dưới. Tìm chuyến (hiểu "mai", "tối", "sài gòn"), tra vé, trả lời chính sách từ tài liệu | Chạy được ở chế độ luật; **chế độ AI chưa thử** | API + UI |
| F22 | Chuyển cho nhân viên | Câu ngoài phạm vi → nút "Gặp nhân viên" → hiện ở Quản trị → Hỗ trợ khách | Chạy được | API + UI |
| F23 | Bán vé tại quầy | Trang Nhân viên → Bán vé tại quầy: thu tiền mặt, xuất vé, In / Tải PDF | Chạy được (nút In chưa thử máy in thật) | API + UI |
| F24 | Danh sách hành khách, check-in | Nhân viên → Soát vé: nhập mã hoặc quét QR, soát lại thì cảnh báo; danh sách theo chuyến | Chạy được (quét bằng camera chưa thử thật) | API + UI |
| F25 | Quản lý tuyến | Quản trị → Tuyến & điểm đón: thêm tuyến, **sửa tuyến** (thông tin, điểm đón / trả, tọa độ, thêm / bớt điểm); ngừng / mở bán | Chạy được | API + UI |
| F26 | Quản lý xe, sơ đồ ghế | Quản trị → Xe & sơ đồ ghế: **thêm / sửa xe** (biển số, loại xe, sơ đồ, tiện ích; trùng biển số thì báo), **tạo sơ đồ ghế mới** (số tầng, hàng, ghế mỗi hàng); phụ thu, ghế nữ từng ghế | Chạy được | API + UI |
| F27 | Quản lý chuyến | Quản trị → Chuyến & lịch chạy: lịch cố định, tạo chuyến hàng loạt (không tạo trùng), khóa ghế, hủy chuyến (hoàn 100% + email) | Chạy được | API + UI |
| F28 | Quản lý đơn / vé | Quản trị → Đơn / vé: tìm theo mã / SĐT / tên, lọc trạng thái, hủy hộ khách (theo chính sách hoặc hoàn 100%) | Chạy được | API + UI |
| F29 | Quản lý người dùng | Quản trị → Người dùng: đổi vai trò, khóa; không tự khóa chính mình | Chạy được | API + UI |
| F30 | Thống kê | Quản trị → Thống kê: 4 chỉ số, biểu đồ theo ngày / tuyến / chuyến, bảng số liệu, xuất Excel | Chạy được | API + UI |
| F31 | Quản lý mã giảm giá | Quản trị → Mã giảm giá: giảm % (có mức trần) hoặc số tiền, đơn tối thiểu, số lượt, bật / tắt | Chạy được | API + UI |
| F32 | Quản lý tri thức chatbot | Quản trị → Tri thức chatbot (thêm / sửa / xóa, chatbot dùng ngay), Lịch sử chat | Chạy được | API + UI |
| F33 | Nhắc lịch trước giờ chạy | Tự gửi email nhắc 3 giờ trước giờ chạy; xem ở Quản trị → Hộp thư thử nghiệm | Chạy được (email chưa gửi thật) | API |
| F34 | Yêu cầu hỗ trợ / khiếu nại | /ho-tro; quản trị / nhân viên trả lời, khách nhận email và xem trong trang | Chạy được | API + UI |
| F35 | Nhật ký thao tác | Quản trị → Nhật ký thao tác: ghi mọi thao tác thay đổi dữ liệu của nhân viên / quản trị, che mật khẩu | Chạy được | API + UI |

## 4. Kết quả kiểm thử

- **API** (`backend/scripts/e2e-api.mjs`): 44/44 đạt. Kết quả đầy đủ trong `bao-cao/ket-qua-api.txt`.
- **Giao diện** (Chrome thật, kịch bản `bao-cao/ui-test.js`): 54/54 đạt, không có lỗi console. Kết quả trong `bao-cao/ket-qua-ui.txt`. Kịch bản kiểm tra:
  - Đặt vé từ đầu đến cuối và realtime.
  - Mã giảm giá, mã QR, đổi chuyến, đánh giá, tra cứu, hủy vé.
  - Chatbot (3 câu), hỗ trợ, quên mật khẩu, tài khoản.
  - Bán vé tại quầy, soát vé.
  - 12 mục quản trị, khóa ghế.
  - Các form quản trị bổ sung: tạo sơ đồ ghế, thêm / sửa xe (kể cả trùng biển số), sửa tuyến.
  - Giao diện điện thoại không bị tràn ngang.
- **Trong lúc kiểm thử đã phát hiện và sửa:**
  - Ngày hiển thị sai ở bảng mã giảm giá và biểu đồ lấp đầy (giờ bị lặp hai lần).
  - Nhãn trục biểu đồ bị cắt.
  - Biểu đồ quá nhỏ trên điện thoại.
  - Trang Vé của tôi gọi API hai lần khi mở.
  - Cảnh báo form trong trang Tài khoản và trang Nhân viên.
  - Link chân trang khó đọc.
  - Báo lỗi trùng biển số xe chung chung ("Dữ liệu bị trùng"), nay báo rõ biển số nào đã có.
  - Form sửa điểm đón bị vỡ dòng, nay xếp thành bảng cột.
- **Lưu ý trung thực:** có 3 lần chạy bị báo lỗi ngẫu nhiên do kịch bản bấm vào hộp xác nhận hoặc danh sách thả xuống khi chúng còn đang mở (hiệu ứng). Kiểm tra lại cho thấy nút trên web hiển thị bình thường. Đã sửa kịch bản cho chờ hiệu ứng xong; 2 lần chạy liên tiếp đều 47/47. Sau khi thêm các form quản trị và 7 bước kiểm tra mới, lần chạy cuối 54/54.
- 35 ảnh chụp màn hình nằm trong `bao-cao/anh/`.

## 5. Hạn chế và việc chưa làm

1. **Thanh toán:** đang giả lập. Code VNPay sandbox đã có nhưng chưa chạy thử. Để thử cần đăng ký tài khoản sandbox VNPay rồi điền `VNPAY_TMN_CODE`, `VNPAY_HASH_SECRET` vào `.env` và đặt `PAYMENT_PROVIDER=vnpay`.
2. **Hoàn tiền:** hệ thống chỉ tính và ghi số tiền hoàn, chưa hoàn qua cổng thanh toán.
3. **Email:** chưa có máy chủ mail (SMTP). Mọi email (vé, nhắc lịch, đặt lại mật khẩu, trả lời hỗ trợ) được lưu ở Quản trị → Hộp thư thử nghiệm. Điền `SMTP_*` vào `.env` thì gửi thật.
4. **Chatbot AI:** đang chạy chế độ luật (không tốn tiền). Code chế độ AI dùng Claude đã viết nhưng **chưa chạy thử lần nào**. Muốn bật thì điền `ANTHROPIC_API_KEY`; mỗi câu hỏi sẽ tốn phí API.
5. **Bán vé theo chặng** (đi nửa tuyến): chưa làm, giá tính theo cả tuyến.
6. **Quét QR bằng camera** chỉ có trên trình duyệt hỗ trợ (Chrome Android), chưa thử với camera thật; nhập mã bằng tay thì đã thử. **In vé** dùng lệnh in của trình duyệt, chưa thử máy in.
7. **Trên điện thoại** menu chính ẩn; trang Tra cứu và Hỗ trợ vào bằng link ở chân trang, các trang khác nằm trong menu tên người dùng.
8. File JavaScript của giao diện hơi lớn (trên 500 kB, Vite có cảnh báo), chưa chia nhỏ.
9. Toàn bộ là dữ liệu mẫu. Kiểm thử tự động không thay được việc người thật bấm thử. Nên tự bấm qua một lượt theo mục 2.

## 6. Vị trí các file

- Code: `~/dat-ve-xe/backend`, `~/dat-ve-xe/frontend`. Đây là bản xem trước riêng, không phải repo nhóm.
- Báo cáo, ảnh, kết quả kiểm thử: `~/dat-ve-xe/bao-cao/`.
- Bản Word của báo cáo này được chép sang thư mục Downloads của Windows.

## 7. Gợi ý cách dùng bản xem trước

- Giữ đúng quy định của GVHD: không đưa cả bản này lên repo nhóm một lần.
- Mỗi ngày, lấy đúng phần việc của ngày đó trong file phân công, chép từ bản xem trước sang nhánh ngày tương ứng trong `~/DoAnVeXe`.
- Những chỗ muốn sửa (giao diện, quy tắc hủy / đổi, nội dung chatbot…) cứ ghi lại; sửa ở bản xem trước trước, chạy kiểm thử, rồi mới đưa vào repo nhóm.
