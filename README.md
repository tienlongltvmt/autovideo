# DownloadAuto

Ứng dụng tải **một hoặc nhiều video cùng lúc** từ nhiều nền tảng khác nhau
(YouTube, TikTok, Instagram, Twitter/X, Facebook, Bilibili, SoundCloud, Vimeo,
Reddit, Pinterest, Snapchat, Twitch clip, VK, OK, Rutube, Dailymotion, Bluesky,
Tumblr, Loom, Streamable, Newgrounds, **Xiaohongshu/RedNote**).

Ứng dụng dùng [cobalt](https://github.com/imputnet/cobalt) API (self-host) làm
engine phân giải link, và bổ sung phần cobalt không có: **hàng đợi tải hàng
loạt, tải đồng thời có giới hạn, tiến độ realtime, lưu file về máy**.

## Kiến trúc

```
┌─────────────┐   dán nhiều link    ┌──────────────────┐   POST /{ url }   ┌─────────────┐
│  Web UI     │ ──────────────────▶ │  downloadauto    │ ────────────────▶ │ cobalt API  │
│ (trình duyệt)│ ◀────────────────── │  (Node/Express)  │ ◀──────────────── │  (Docker)   │
└─────────────┘   SSE tiến độ       │  - hàng đợi      │  tunnel/redirect/ └─────────────┘
                                    │  - concurrency   │  picker/error
                                    │  - tải file      │
                                    └────────┬─────────┘
                                             ▼
                                       downloads/
```

- cobalt API nhận diện nền tảng và trả về link tải (`tunnel` = cobalt proxy/remux
  qua ffmpeg, `redirect` = link trực tiếp, `picker` = bài đăng nhiều ảnh/video).
- downloadauto quản lý hàng đợi: mỗi URL là một job, tải song song tối đa
  `CONCURRENCY` file; bài đăng nhiều media (`picker`) tự động tách thành các
  job con.

## Cài đặt & chạy

Yêu cầu: Node.js ≥ 18.17 và Docker.

```bash
# 1. Chạy cobalt API (lần đầu sẽ pull image)
docker compose up -d

# 2. Cài dependency và chạy app
npm install
npm start
```

Mở **http://localhost:3000**, dán link — hoặc dán **cả đoạn văn bản chứa link**,
app tự bắt link ra — rồi bấm **Tải xuống**. File được lưu vào thư mục `downloads/`.

### Bắt link trong input

Ô nhập nhận văn bản tùy ý và tự động trích link:

- Bắt mọi link `http(s)://`, tự gọt dấu câu dính cuối link (`!`, `.`, `),`…)
- Bắt cả link **thiếu `https://`** của các nền tảng đã biết
  (vd: `tiktok.com/@user/video/123`, `youtu.be/abc`)
- Khử link trùng lặp, hiển thị preview số link bắt được kèm tên nền tảng;
  link không thuộc nền tảng nào được đánh dấu "chưa rõ hỗ trợ"
- Nút **Lọc link** thay nội dung ô nhập bằng danh sách link sạch (mỗi dòng một link)

### Resolver riêng cho nền tảng cobalt chưa hỗ trợ

Ngoài 21 nền tảng của cobalt, app có tầng **resolver riêng** trong
[`src/resolvers/`](src/resolvers/) cho các nền tảng cobalt không hỗ trợ:

- **Xiaohongshu / RedNote** (`xhslink.com`, `xiaohongshu.com`): theo redirect
  của link rút gọn → đọc `__INITIAL_STATE__` của trang note → tải video MP4
  trực tiếp từ CDN (tên file theo tiêu đề note); note dạng album ảnh tự tách
  thành nhiều mục tải riêng.

Muốn thêm nền tảng khác: tạo file mới trong `src/resolvers/` export
`service`, `matches(url)`, `resolve(url, signal)` rồi đăng ký vào
[`src/resolvers/index.js`](src/resolvers/index.js).

### Tải cả playlist YouTube

Dán link playlist (`youtube.com/playlist?list=...`) là app tự đọc danh sách
và tách thành từng video đưa vào hàng đợi (tối đa 100 video đầu). Hỗ trợ cả
playlist "Uploads" của kênh (id dạng `UUxxxx`). Kiến trúc expander trong
[`src/expanders/`](src/expanders/) — thêm loại "tập video" khác tương tự
như thêm resolver.

### Tự động thử lại lỗi tạm thời

Lỗi mạng, rate-limit (HTTP 429), server quá tải (5xx)… được tự thử lại tối đa
2 lần với thời gian chờ tăng dần trước khi báo lỗi. Lỗi vĩnh viễn (video
riêng tư, không hỗ trợ…) báo ngay không thử lại.

### Lịch sử không mất khi restart

Hàng đợi được lưu xuống `data/jobs.json` (đổi bằng `DATA_DIR`). Restart
server là lịch sử vẫn còn; job đang tải dở được đánh dấu *gián đoạn* (file
tải dở được dọn tự động) và có thể bấm **Thử lại**. Job đã xong có thêm nút
**Xóa +file** để xóa cả file trên đĩa.

## Cấu hình

Sao chép `.env.example` thành `.env` và chỉnh nếu cần:

| Biến | Mặc định | Ý nghĩa |
|---|---|---|
| `COBALT_API_URL` | `http://localhost:9000` | URL của cobalt instance |
| `COBALT_API_KEY` | *(trống)* | API key nếu instance yêu cầu xác thực |
| `CONCURRENCY` | `3` | Số file tải đồng thời tối đa |
| `DOWNLOAD_DIR` | `./downloads` | Thư mục lưu file |
| `PORT` | `3000` | Cổng web app |

## REST API

Có thể dùng trực tiếp không cần UI:

```bash
# Thêm nhiều URL vào hàng đợi
curl -X POST http://localhost:3000/api/jobs \
  -H "Content-Type: application/json" \
  -d '{
    "urls": [
      "https://www.youtube.com/watch?v=...",
      "https://www.tiktok.com/@user/video/..."
    ],
    "options": { "videoQuality": "1080", "downloadMode": "auto" }
  }'

# Hoặc gửi văn bản tự do — server tự bắt link bên trong
curl -X POST http://localhost:3000/api/jobs \
  -H "Content-Type: application/json" \
  -d '{"text": "xem video này nè youtu.be/abc123 hay lắm!"}'

# Xem trạng thái hàng đợi
curl http://localhost:3000/api/jobs

# Hủy / thử lại / xóa một job
curl -X POST http://localhost:3000/api/jobs/<id>/cancel
curl -X POST http://localhost:3000/api/jobs/<id>/retry
curl -X DELETE http://localhost:3000/api/jobs/<id>

# Theo dõi tiến độ realtime (SSE)
curl -N http://localhost:3000/api/events
```

`options` nhận mọi key theo [schema của cobalt](https://github.com/imputnet/cobalt/blob/main/docs/api.md):
`downloadMode` (auto/audio/mute), `videoQuality` (max…144), `audioFormat`
(mp3/best/ogg/opus/wav), `filenameStyle`, `youtubeVideoCodec`, `allowH265`,
`tiktokFullAudio`, `subtitleLang`…

## Đưa lên production

Toàn bộ stack (app + cobalt) đóng gói sẵn bằng Docker, deploy lên VPS chỉ cần
vài lệnh. File cấu hình: [`docker-compose.prod.yml`](docker-compose.prod.yml)
và [`Dockerfile`](Dockerfile).

### Deploy lên VPS (Ubuntu/Debian)

```bash
# 1. Cài Docker (nếu chưa có)
curl -fsSL https://get.docker.com | sh

# 2. Đưa code lên server (git clone hoặc scp/rsync)
git clone <repo-của-bạn> downloadauto && cd downloadauto

# 3. Chạy — nhớ đặt mật khẩu vì app sẽ mở ra internet
APP_PASSWORD='mật-khẩu-mạnh' docker compose -f docker-compose.prod.yml up -d --build
```

Truy cập `http://<ip-server>:3000` (đổi cổng bằng biến `APP_PORT`).
File tải về nằm trong thư mục `./downloads` trên server.

Kiến trúc production: cobalt **chỉ chạy trong mạng nội bộ Docker**, không mở
cổng ra ngoài; app truy cập cobalt qua hostname `cobalt-api` nội bộ. Chỉ duy
nhất app được expose.

### Bảo vệ bằng mật khẩu

Đặt biến `APP_PASSWORD` là toàn bộ app (web + API) yêu cầu đăng nhập
HTTP Basic Auth — username nhập gì cũng được, mật khẩu là giá trị đã đặt.
**Bắt buộc nên bật khi mở ra internet**, vì ai truy cập được là dùng được
băng thông + ổ đĩa server của bạn.

### HTTPS với tên miền (khuyến nghị dùng Caddy)

```bash
# trên server, cài caddy rồi tạo /etc/caddy/Caddyfile:
download.ten-mien-cua-ban.com {
    reverse_proxy localhost:3000
}
```

Caddy tự xin chứng chỉ Let's Encrypt. Nếu dùng nginx thì cần thêm
`proxy_buffering off;` cho endpoint `/api/events` (SSE).

### Cập nhật phiên bản

```bash
git pull
docker compose -f docker-compose.prod.yml up -d --build   # build lại app
docker compose -f docker-compose.prod.yml pull cobalt-api # cập nhật cobalt
```

### Lưu ý khi vận hành

- **YouTube trên IP datacenter**: VPS thường bị YouTube chặn (lỗi
  `youtube.login`). Cần cấu hình cookies hoặc chạy thêm
  `yt-session-generator` — xem [docs của cobalt](https://github.com/imputnet/cobalt/blob/main/docs/run-an-instance.md).
  Các nền tảng khác (TikTok, RedNote, Twitter…) không bị ảnh hưởng.
- **Dung lượng đĩa**: app không tự xóa file đã tải; đặt cron dọn định kỳ nếu
  cần, vd: `find ./downloads -mtime +7 -delete`.
- **Hai môi trường tách biệt**: `docker-compose.yml` (dev, project
  `downloadauto-dev`) và `docker-compose.prod.yml` (project
  `downloadauto-prod`) đã đặt tên project riêng — chạy song song không đụng
  độ nhau.
- **Docker Desktop trên macOS + ổ đĩa ngoài**: nếu test stack production ngay
  trên máy Mac mà project nằm trên ổ ngoài (`/Volumes/...`), bind mount có
  thể gặp trục trặc do cơ chế file sharing của Docker Desktop — khuyến nghị
  chỉ chạy stack production trên Linux, còn trên Mac thì dev bằng `npm start`.

## Ghi chú

- **YouTube**: từ IP dân dụng thường chạy được ngay; nếu gặp lỗi
  `youtube.login`, instance cần cấu hình cookies hoặc poToken — xem
  [docs của cobalt](https://github.com/imputnet/cobalt/blob/main/docs/run-an-instance.md).
- **Instagram/Reddit**: một số nội dung cần cookies (`COOKIE_PATH` trong
  `docker-compose.yml`).
- Không dùng `api.cobalt.tools` công cộng — instance đó có bot protection và
  không cho phép app bên ngoài gọi vào; luôn self-host như hướng dẫn trên.
