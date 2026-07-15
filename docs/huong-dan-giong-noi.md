# Hướng dẫn tab Giọng nói — tạo giọng đọc AI lồng tiếng video

Tab **Giọng nói** biến văn bản thành giọng đọc AI (text-to-speech) chạy
**hoàn toàn trên máy của bạn** — không API key, không trả phí, văn bản và
giọng không gửi lên mạng. File giọng đọc tạo ra được lưu thẳng vào **kho
nhạc nền**, dùng ngay để lồng tiếng video ở tab Chỉnh sửa.

## Luồng làm việc trọn vẹn

```
Tab Tải xuống          Tab Giọng nói              Tab Chỉnh sửa
─────────────          ─────────────              ─────────────
tải video từ     →     nhập lời bình         →    chọn video + bố cục
TikTok/RedNote/        chọn giọng, bấm tạo        Âm thanh → "Thay nhạc nền"
YouTube...             (job chạy trong            chọn file voice_*.wav
                       hàng đợi chung)            → Xuất video đã lồng tiếng
```

## ✅ Máy này đã setup sẵn 2 engine

> **Trạng thái hiện tại** (đã cài đặt và chạy sẵn):
>
> 1. **VieNeu-TTS** — engine **TIẾNG VIỆT** (khuyên dùng), 14 giọng có sẵn
>    (nam/nữ · Bắc/Trung/Nam · tin tức/tự nhiên/kể chuyện), cổng 3901.
>    - Nằm tại `Backend/VieNeu-TTS`; nếu server tắt (sau khi khởi động lại
>      máy), chạy: `cd Backend/VieNeu-TTS && ./start-server.sh`
> 2. **Voicebox** — chạy bằng Docker, cổng 17600, đã tạo sẵn 4 giọng preset
>    (Heart/Michael tiếng Anh · Vivian tiếng Trung · Ryan Qwen).
>    - Tự chạy lại cùng Docker; nếu tắt: `cd Backend/voicebox && docker compose up -d`
>
> Mở tab **Giọng nói** là badge hiện cả hai; chọn Engine → chọn giọng → nhập
> lời thoại → tạo.

## So sánh 3 engine được hỗ trợ

| | **VieNeu-TTS** 🇻🇳 | **Voicebox** | **OmniVoice Studio** |
|---|---|---|---|
| Trang chủ | [github.com/pnnbao97/VieNeu-TTS](https://github.com/pnnbao97/VieNeu-TTS) | [voicebox.sh](https://voicebox.sh) | [github.com/debpalash/OmniVoice-Studio](https://github.com/debpalash/OmniVoice-Studio) |
| Cổng API | 3901 | 17493 (app) / 17600 (docker) | 3900 |
| Tiếng Việt | ✅✅ chuyên tiếng Việt (10.000+ giờ dữ liệu Việt-Anh) | ❌ không hỗ trợ | ⚠️ có nhưng chưa tối ưu |
| Giọng có sẵn | 14 giọng Việt (vùng miền + phong cách) | 50+ preset (Anh/Trung) | tùy engine |
| Clone giọng | ✅ 3–8 giây mẫu | ✅ vài giây mẫu | ✅ ~3 giây |
| Đặc biệt | thẻ cảm xúc `[cười]`, `[thở dài]`; 48 kHz; chạy nhanh trên CPU/Mac | ổn định, nhiều engine | 646 ngôn ngữ, dubbing video |
| Chọn ngôn ngữ khi tạo | tự nhận diện | ✅ dropdown | tự nhận diện |

**Mẹo cho giọng Việt (VieNeu)**: chèn thẳng thẻ cảm xúc vào lời thoại —
`[cười] Trời ơi, giọng tự nhiên dã man!` hoặc `[thở dài]`, `[hắng giọng]`.

### Cài Voicebox

1. Tải bản macOS tại [voicebox.sh](https://voicebox.sh) → mở app.
   API tự chạy ở cổng 17493, không cần cấu hình gì.
2. Trong app: **Profiles → New Profile** → clone giọng bằng cách thả vào
   một đoạn audio mẫu vài giây (giọng của bạn hoặc giọng muốn nhái), hoặc
   chọn một trong 50+ giọng preset.
3. Quay lại tab Giọng nói của downloadauto → badge chuyển xanh
   **"Voicebox · N giọng"**.

### Cài OmniVoice Studio

1. Tải installer từ [trang Releases](https://github.com/debpalash/OmniVoice-Studio/releases)
   (hoặc chạy từ source theo README của dự án) → mở app.
   API tự chạy ở cổng 3900.
2. Trong app: **Settings → Models** tải model phù hợp máy (tự nhận
   CUDA/MPS/CPU), rồi vào **Studio** clone giọng hoặc lấy giọng có sẵn ở
   **Voice Gallery**.
3. Quay lại tab Giọng nói → chọn Engine **OmniVoice** → danh sách giọng
   hiện ra (luôn có "Giọng mặc định" kể cả khi chưa clone giọng nào).

## Dùng tab Giọng nói

1. **Engine**: chọn Voicebox hoặc OmniVoice (chấm ● = đang chạy)
2. **Giọng**: danh sách lấy trực tiếp từ app engine — muốn thêm giọng thì
   tạo trong app đó rồi bấm lại tab này
3. **Ngôn ngữ**: chỉ áp dụng với Voicebox; OmniVoice tự nhận diện
4. Nhập **lời thoại** — **không giới hạn độ dài** (có bộ đếm ký tự):
   - Voicebox: tự chia đoạn và nối liền mạch (auto-chunking + crossfade)
   - OmniVoice: app tự cắt câu thành đoạn ≤3.500 ký tự, tạo từng đoạn rồi
     nối bằng ffmpeg — tiến độ hiện "đang tổng hợp đoạn i/N"
5. Bấm **Nghe thử** để preview đoạn đầu bằng giọng/engine đã chọn. Bản nghe
   thử phát ngay trên form và không lưu vào kho âm thanh.
6. Bấm **🎙 Tạo giọng nói** → job chạy trong hàng đợi (tab Tải xuống),
   hủy/thử lại được như mọi job khác
7. Xong → file `voice_*.wav` xuất hiện ở **Kho âm thanh** (nghe thử ngay
   bằng player) và trong dropdown **"Thay nhạc nền"** của tab Chỉnh sửa

### Lồng tiếng video

1. Tab **Chỉnh sửa** → chọn video → chỉnh bố cục/cắt đoạn nếu cần
2. Phần **Tốc độ & âm thanh** → Âm thanh: **"Thay nhạc nền"** → chọn file
   `voice_…` vừa tạo → chỉnh âm lượng nếu muốn
3. **Xuất video** → video ra có giọng đọc thay tiếng gốc; giọng ngắn hơn
   video thì tự lặp, dài hơn thì bị cắt theo video

## Cấu hình (file `.env`)

| Biến | Mặc định | Ghi chú |
|---|---|---|
| `VOICEBOX_API_URL` | `http://localhost:17493` | đổi nếu self-host Voicebox bằng docker (thường cổng 17600) |
| `OMNIVOICE_API_URL` | `http://localhost:3900` | đổi nếu OmniVoice chạy máy khác |

## Xử lý sự cố

| Hiện tượng | Nguyên nhân & cách xử lý |
|---|---|
| Badge đỏ "chưa có engine giọng nói" | App engine chưa mở. Mở Voicebox hoặc OmniVoice lên rồi bấm lại tab; kiểm tra cổng bằng `curl http://localhost:17493/health` hoặc `curl http://localhost:3900/v1/audio/voices` |
| Lần tạo đầu rất lâu | Engine đang tải model AI (vài GB) — chỉ chậm lần đầu |
| Job lỗi "từ chối yêu cầu" | Giọng (profile) không còn tồn tại trong app engine — bấm lại tab để nạp danh sách mới |
| Giọng tiếng Việt bị ngọng/sai dấu | Thử engine khác trong app (Voicebox: Qwen3-TTS thường tốt cho tiếng Việt; OmniVoice: xem bảng tương thích trong Settings → Engines); đảm bảo văn bản gõ đủ dấu |
| Nghe thấy tiếng "bíp" thay vì giọng | File đó là âm thanh thử nghiệm cũ, không phải giọng do engine thật tạo — xóa ở Kho âm thanh và tạo lại khi engine đã kết nối (badge xanh) |
| Muốn giọng đọc khớp nhịp video | Tạo giọng trước, nghe độ dài, rồi cắt video (trim) cho khớp; hoặc chỉnh Tốc độ video |
