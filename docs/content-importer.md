# Nạp nội dung (content importer)

Công cụ dòng lệnh chạy **trên máy của bạn** để đưa từ vựng vào database: nạp danh sách từ, sinh nghĩa và câu ví dụ bằng Claude, sinh audio bằng Azure TTS rồi đưa lên Cloudflare R2.

Mọi lệnh đều chạy lại được. Phần đã làm xong sẽ được bỏ qua, nên nếu lỗi giữa chừng bạn chỉ cần chạy lại đúng lệnh đó.

## 1. Chuẩn bị

### File danh sách từ TSL

Tải TOEIC Service List (TSL) của Browne & Culligan tại https://www.newgeneralservicelist.com (mục TOEIC Service List), lưu thành file CSV. Danh sách này dùng giấy phép CC BY-SA 4.0, nên nếu sau này bạn chia sẻ dữ liệu thì cần ghi nguồn.

Importer chỉ đọc **cột đầu tiên**, mỗi dòng một từ, và coi thứ tự dòng là thứ hạng TSL. Dòng tiêu đề (`Headword`, `Word` hoặc `Lemma`) được tự bỏ qua. Nếu file tải về có cột khác đứng trước cột từ, hãy xóa các cột đó đi.

### Khóa API

Copy `tools/content-importer/.env.example` thành `tools/content-importer/.env` rồi điền:

| Biến                                                                     | Dùng cho | Lấy ở đâu                                                                                                     |
| ------------------------------------------------------------------------ | -------- | ------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                                                           | mọi lệnh | Database local, hoặc connection string của Neon khi nạp cho production                                        |
| `ANTHROPIC_API_KEY`                                                      | `enrich` | https://console.anthropic.com → API keys                                                                      |
| `AZURE_SPEECH_KEY`, `AZURE_SPEECH_REGION`                                | `tts`    | Azure portal → tạo tài nguyên Speech (gói F0 miễn phí) → Keys and Endpoint                                    |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` | `tts`    | Cloudflare dashboard → R2 → tạo bucket, rồi Manage API tokens → token quyền Object Read & Write cho bucket đó |

File `.env` đã nằm trong `.gitignore`. Các khóa này chỉ để trên máy bạn, không đưa lên Render.

### Cho phép đọc công khai bucket R2

App sẽ phát audio thẳng từ R2, nên bucket cần đọc được công khai: Cloudflare dashboard → R2 → chọn bucket → Settings → Public access → bật **r2.dev subdomain** (hoặc gắn tên miền riêng). Ghi lại địa chỉ công khai của bucket, phase sau sẽ cần.

## 2. Nạp 200 từ đầu tiên

Chạy lần lượt từ thư mục gốc của repo:

```bash
pnpm importer import-tsl tsl.csv
```

```bash
pnpm importer enrich --limit 200
```

```bash
pnpm importer report
```

Mở `report.md` và đọc lướt để tìm nghĩa, phiên âm hoặc câu ví dụ sai. Chưa có giao diện sửa ở bước này; nút "Báo sai" trong app sẽ có ở phase sau. Khi thấy ổn thì sinh audio:

```bash
pnpm importer tts --limit 200
```

Mỗi lệnh in ra một dòng tóm tắt, ví dụ `enrich: enriched 200, failed 0`.

## 3. Nạp đủ 1.200 từ

Khi đã quen với 200 từ đầu, nạp tiếp tới 1.200 từ theo cùng thứ tự. Các lệnh chỉ xử lý phần còn thiếu, nên chạy lại với `--limit` lớn hơn là được:

```bash
pnpm importer enrich --limit 1000
```

```bash
pnpm importer report
```

```bash
pnpm importer tts --limit 1200
```

`import-tsl` đã nạp cả danh sách ở bước 2 nên không cần chạy lại. `--limit` của `enrich` tính số từ chưa có nghĩa sẽ xử lý trong lần chạy này; của `tts` tính số từ còn thiếu audio.

Nên chia làm vài lần (ví dụ 200 từ mỗi lần) và đọc `report.md` sau mỗi lần. Từ nào sai thì sửa ngay khi học bằng nút "Báo sai" trên thẻ. Sửa câu ví dụ tiếng Anh sẽ xóa audio của câu đó; chạy lại `pnpm importer tts` để tạo audio mới.

Số từ mới mỗi ngày chỉnh trong trang Cài đặt của app (mặc định 20).

## 4. Các lệnh

| Lệnh                                                 | Việc làm                                                                                                                            |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `import-tsl <file.csv>`                              | Thêm các từ chưa có vào bảng `Word`. Từ đã có được giữ nguyên.                                                                      |
| `enrich [--limit N]`                                 | Với các từ chưa có nghĩa (thứ hạng thấp trước): sinh loại từ, IPA, nghĩa tiếng Việt và 2 câu ví dụ kèm bản dịch. Mỗi request 20 từ. |
| `tts [--limit N]`                                    | Với các từ đã có nghĩa mà còn thiếu audio: sinh mp3 cho từ và cho từng câu ví dụ, đưa lên R2. `--limit` tính theo số từ.            |
| `report [--format md\|csv] [--out FILE] [--limit N]` | Xuất các từ đã có nghĩa ra file để rà lại. Mặc định ghi `report.md`.                                                                |

Giọng đọc: từ dùng giọng Mỹ; câu ví dụ xoay vòng giọng Mỹ, Anh và Úc để quen nhiều giọng như trong bài thi TOEIC.

## 5. Khi có lỗi

- **`enrich` báo `failed` lớn hơn 0:** mỗi lô được thử 3 lần. Lô nào vẫn lỗi thì các từ trong lô được ghi vào `failed.json` kèm lý do, và không có gì của lô đó được ghi vào database. Chạy lại `enrich` là các từ này được làm lại. Khi không còn lỗi, `failed.json` tự được xóa.
- **`tts` báo `failed` lớn hơn 0:** lý do từng mục được in ra màn hình. Chạy lại `tts` để làm lại riêng các mục đó.
- **Thiếu khóa:** lệnh dừng ngay và nêu tên các biến còn thiếu trong `.env`.

## 6. Chi phí

- Claude: mặc định dùng `claude-haiku-5-5`. Đổi model bằng biến `ANTHROPIC_MODEL` trong `.env` nếu chất lượng nội dung chưa đạt.
- Azure TTS và R2 đều có gói miễn phí. Hãy xem hạn mức hiện tại trên trang giá của từng dịch vụ trước khi nạp đủ 1.200 từ.
