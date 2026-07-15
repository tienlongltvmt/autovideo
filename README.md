# DownloadAuto

Bộ công cụ **tải → chỉnh sửa → lồng tiếng → xuất video** cho việc đăng lại
nội dung với nhận diện thương hiệu riêng, gồm 3 tab:

| Tab | Chức năng |
|---|---|
| **Tải xuống** | Tải 1 hoặc nhiều video cùng lúc từ 22 nền tảng (YouTube, TikTok, Instagram, Twitter/X, Facebook, Bilibili, **Xiaohongshu/RedNote**…); dán cả đoạn văn bản là tự bắt link; hỗ trợ playlist YouTube |
| **Chỉnh sửa** | Bố cục video kiểu Canva trong khung thương hiệu: kéo/zoom, cắt đoạn, vùng làm mờ che watermark gốc, thêm chữ + font, tốc độ, thay nhạc nền; chọn nhiều video xuất một lần |
| **Giọng nói** | Tạo giọng đọc AI chạy local (có **14 giọng tiếng Việt** qua VieNeu-TTS) để lồng tiếng video |

Giao diện **responsive cho điện thoại** và cài được như app (PWA — "Thêm vào
màn hình chính"). Ứng dụng dùng [cobalt](https://github.com/imputnet/cobalt)
API (self-host) làm engine phân giải link, và bổ sung phần cobalt không có:
hàng đợi tải hàng loạt, tiến độ realtime, chỉnh sửa video bằng ffmpeg, lịch
sử bền vững.

## Kiến trúc

```
┌──────────────┐  dán link / chỉnh sửa  ┌──────────────────┐   POST /{url}    ┌─────────────┐
│   Web UI     │ ─────────────────────▶ │  downloadauto    │ ───────────────▶ │ cobalt API  │
│ (máy tính /  │ ◀───────────────────── │  (Node/Express)  │ ◀─────────────── │  (Docker)   │
│  điện thoại) │      SSE tiến độ       │  - hàng đợi      │  tunnel/redirect └─────────────┘
└──────────────┘                        │  - resolver/     │
                                        │    expander      │   /v1/audio/…    ┌─────────────┐
                                        │  - ffmpeg (khung,│ ───────────────▶ │ engine TTS  │
                                        │    cắt, mờ, chữ) │ ◀─────────────── │ VieNeu /    │
                                        └────────┬─────────┘    file WAV      │ Voicebox /  │
                                                 ▼                            │ OmniVoice   │
                                       downloads/  data/music/                └─────────────┘
```

- cobalt API nhận diện nền tảng và trả về link tải (`tunnel` = cobalt proxy/remux
  qua ffmpeg, `redirect` = link trực tiếp, `picker` = bài đăng nhiều ảnh/video).
- downloadauto quản lý hàng đợi: mỗi URL là một job, tải song song tối đa
  `CONCURRENCY` file; bài đăng nhiều media (`picker`) tự động tách thành các
  job con. Job chỉnh sửa/gắn khung/tạo giọng cũng chạy trong cùng hàng đợi.

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

> 💡 Trên máy hiện tại app chạy ở cổng **3210** (đặt trong `.env` vì cổng
> 3000 đã bị container khác chiếm) — các ví dụ `localhost:3000` bên dưới thì
> thay bằng `localhost:3210`.

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

### Gắn khung thương hiệu (branding)

Tự động "đóng khung" video sau khi tải: banner trên cùng (nền màu + logo +
tiêu đề) và watermark chìm đè lên video — dạng template cho việc đăng lại
nội dung với nhận diện thương hiệu riêng.

- Tick **"Gắn khung thương hiệu"** khi thêm link → tải xong tự gắn, ra file
  mới `tên gốc [brand].mp4` (file gốc giữ nguyên); hoặc bấm nút **Gắn khung**
  trên video đã tải xong.
- Cấu hình trong [`branding/template.json`](branding/template.json): chữ và
  màu banner, nội dung watermark, cỡ chữ, font. Đặt logo tại
  `branding/logo.png` là tự hiện trong banner (bỏ trống thì banner chỉ có chữ).
- Xử lý bằng ffmpeg (đóng gói sẵn qua `ffmpeg-static`, không cần cài thêm);
  áp dụng cho cả video trong playlist/bài đăng nhiều media khi bật tùy chọn.
- Chạy Docker (alpine): image không có font hệ thống — copy file `.ttf`
  (font có hỗ trợ tiếng Việt) vào `branding/` và trỏ `"font"` trong
  `template.json` tới đó, vd `"font": "Arial Bold.ttf"`.

### Tab Chỉnh sửa — bố cục video kiểu Canva

Tab **Chỉnh sửa** cho phép đặt video vào khung thương hiệu cố định (mặc định
1080×1920, đổi bằng `canvas` trong `branding/template.json`) và chỉnh bố cục
trực quan như Canva:

- **Kéo** video trong khung để di chuyển, **lăn chuột** hoặc kéo thanh Zoom
  để phóng to/thu nhỏ; nút nhanh *Vừa khung / Phủ kín / Căn giữa*
- Preview hiển thị đúng banner + watermark theo template, dùng **cùng công
  thức bố cục với ffmpeg** nên kết quả xuất giống hệt những gì thấy
- **Chọn nhiều video** (checkbox / Chọn tất cả) rồi **Xuất N video** một lần —
  mỗi video thành một job chạy song song trong hàng đợi, ra file
  `tên gốc [edit].mp4`
- Bật "Dùng chung bố cục" để áp một bố cục cho tất cả; tắt đi thì mỗi video
  giữ bố cục riêng (bấm từng video để chỉnh)

Ngoài bố cục, tab Chỉnh sửa còn có:

- **Cắt đoạn** (riêng từng video): kéo 2 thanh Bắt đầu/Kết thúc — preview tự
  phát lặp trong khoảng đã chọn
- **Vùng làm mờ** (riêng từng video): bấm *＋ Thêm vùng mờ* rồi kéo thả/resize
  ngay trên preview để che watermark hoặc chữ của nền tảng gốc — xuất ra sẽ
  làm mờ đúng vùng đó
- **Tốc độ** 0.5×–2× (âm thanh gốc tự chỉnh tempo theo, không bị méo giọng)
- **Âm thanh**: giữ nguyên / tắt tiếng / **thay nhạc nền** — bấm *Tải nhạc
  lên* để đưa file mp3/m4a/wav của bạn vào (lưu ở `data/music/`), nhạc tự
  lặp theo độ dài video; kèm thanh chỉnh âm lượng
- **Chữ trên video** (riêng từng video): bấm *＋ Thêm chữ* rồi kéo thả chữ
  trên preview; sửa nội dung, **font**, cỡ chữ, màu trong toolbar. Font gồm
  các font hệ thống phổ biến + font `.ttf/.otf` bạn bỏ vào thư mục
  `branding/` — preview hiển thị đúng font thật, chữ xuất ra có bóng đổ nhẹ
  cho dễ đọc
- **Quản lý trong khung**: nút **✕** góc trên preview hoặc nút **"Gỡ video
  khỏi khung"** để bỏ video đang chỉnh; nút **×** cạnh mỗi file trong danh
  sách để xóa file khỏi ổ đĩa (có xác nhận)

### Chỉnh khung thương hiệu ngay trên giao diện

Bấm **"🖼 Chỉnh khung"** trong tab Chỉnh sửa để sửa khung trực quan, không
cần đụng vào `template.json` (khung áp dụng chung cho mọi video):

- **Tiêu đề banner**: nội dung, font, cỡ chữ, màu chữ, màu nền banner —
  preview đổi ngay khi gõ
- **Watermark**: 2 dòng chữ, font, màu, độ đậm; **kéo thả trực tiếp** trên
  khung để đặt vị trí
- **Thêm ảnh lên khung** (logo phụ, sticker, khuyến mãi...): bấm *＋ Thêm
  ảnh lên khung* để upload (lưu ở `branding/images/`), rồi kéo di chuyển /
  kéo góc resize / bấm × xóa ngay trên preview
- Bấm **"Lưu khung"** để ghi vào `branding/template.json` — từ đó mọi lần
  xuất và gắn khung đều dùng khung mới

### Tab Giọng nói — tạo giọng đọc AI lồng tiếng video

Hỗ trợ **3 engine** TTS mã nguồn mở chạy hoàn toàn local (tự nhận diện
engine nào đang chạy, chọn qua dropdown):

- 🇻🇳 [VieNeu-TTS](https://github.com/pnnbao97/VieNeu-TTS) — **chuyên tiếng
  Việt** (khuyên dùng): 14 giọng có sẵn theo giới tính/vùng miền/phong cách,
  clone giọng từ 3–8s audio, thẻ cảm xúc `[cười]` `[thở dài]`, 48 kHz, chạy
  nhanh trên CPU/Apple Silicon (cổng 3901, wrapper `server_api.py` +
  `start-server.sh` trong thư mục `VieNeu-TTS`)
- [Voicebox](https://voicebox.sh) — 7 engine TTS, 23 ngôn ngữ (không có
  tiếng Việt), 50+ giọng preset (cổng 17493 app / 17600 docker)
- [OmniVoice Studio](https://github.com/debpalash/OmniVoice-Studio) — 14
  engine TTS, 646 ngôn ngữ, API chuẩn OpenAI (cổng 3900)

Nhập lời thoại (**không giới hạn độ dài** — tự chia đoạn theo câu và nối
liền mạch bằng ffmpeg) → chọn giọng → **file giọng đọc rơi thẳng vào kho
nhạc nền** → sang tab Chỉnh sửa chọn "Thay nhạc nền" là video được lồng
tiếng. Kho âm thanh cho nghe thử và xóa file (`data/music/`).

📖 **Hướng dẫn chi tiết**: [docs/huong-dan-giong-noi.md](docs/huong-dan-giong-noi.md)
— trạng thái setup trên máy này, so sánh 3 engine, cách khởi động lại,
clone giọng, xử lý sự cố.

### Dùng trên điện thoại (PWA)

Giao diện responsive đầy đủ — kéo thả video/chữ/vùng mờ hoạt động bằng cảm
ứng. Điện thoại cùng mạng WiFi truy cập `http://<ip-máy-chạy-app>:3210`,
rồi **"Thêm vào màn hình chính"** (Add to Home Screen) là thành app riêng
chạy toàn màn hình.

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
| `CONCURRENCY` | `3` | Số job chạy đồng thời tối đa |
| `DOWNLOAD_DIR` | `./downloads` | Thư mục lưu file tải về |
| `DATA_DIR` | `./data` | Lịch sử hàng đợi + kho nhạc nền (`data/music/`) |
| `BRANDING_DIR` | `./branding` | Template khung, logo, font, ảnh khung |
| `PORT` | `3000` | Cổng web app |
| `APP_PASSWORD` | *(trống)* | Bật Basic Auth bảo vệ toàn app |
| `VIENEU_API_URL` | `http://localhost:3901` | Engine giọng tiếng Việt VieNeu-TTS |
| `VOICEBOX_API_URL` | `http://localhost:17493` | Engine giọng Voicebox |
| `OMNIVOICE_API_URL` | `http://localhost:3900` | Engine giọng OmniVoice Studio |

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
