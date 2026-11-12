# Content importer

CLI chạy trên máy bạn để nạp từ vựng vào database. Hiện có 3 lệnh: `import-tsl`, `enrich`, `report`. Phần tạo audio (`tts`) sẽ làm sau.

## Chuẩn bị

1. Copy `.env.example` thành `.env` trong thư mục này, rồi điền:
   - `DATABASE_URL`: database local (`pnpm db:start`), hoặc connection string Neon nếu muốn nạp thẳng lên production.
   - `ANTHROPIC_API_KEY`: chỉ cần cho `enrich`.
   - `ENRICH_MODEL` (không bắt buộc): mặc định `claude-opus-5-5`. Muốn rẻ hơn thì đặt `claude-haiku-5-5`.
2. Tải danh sách **TOEIC Service List (TSL) 1.2** (giấy phép CC BY-SA) và lưu thành file CSV. Dòng đầu là header, phải có cột `word` hoặc `lemma`. Có thể có cột `rank`; nếu không có thì thứ tự dòng được dùng làm thứ hạng.

Database phải đã chạy migration mới nhất (`pnpm --filter @english-app/api db:migrate` ở local; trên Render thì bước build tự chạy).

## Các lệnh

Chạy từ thư mục gốc của repo:

```bash
pnpm --filter @english-app/content-importer cli import-tsl data/tsl.csv
```

```bash
pnpm --filter @english-app/content-importer cli enrich --limit 20
```

```bash
pnpm --filter @english-app/content-importer cli report --out report.md
```

- `import-tsl <csv>`: nạp từ và thứ hạng. Đường dẫn tương đối tính từ thư mục bạn đang đứng. File có thể ngăn cách bằng `,`, `;` hoặc tab. Từ đã có thì bỏ qua, nên chạy lại bao nhiêu lần cũng được. Nếu thứ hạng của một từ mới đã thuộc về từ khác trong database (ví dụ từ thử nghiệm), từ đó không được nạp và được liệt kê ở mục "rank conflicts"; hãy xóa từ cũ rồi chạy lại.
- `enrich [--limit N]`: gọi Claude để tạo loại từ, IPA, nghĩa tiếng Việt và 2 câu ví dụ cho các từ chưa có nghĩa, theo thứ hạng. Mỗi request 20 từ, lỗi thì thử lại tối đa 3 lần. Từ vẫn lỗi được ghi vào `failed.json`; chạy lại `enrich` sẽ thử lại các từ đó.
- `report [--since YYYY-MM-DD] [--out file]`: xuất bảng markdown các từ đã có nội dung để rà lại. Mặc định ghi ra `report.md`.

Các file `failed.json` và `report.md` nằm ở thư mục bạn đứng khi chạy lệnh (với `pnpm --filter` là thư mục này) và không được commit.

## Gợi ý lần đầu

1. `enrich --limit 20`, mở `report.md` để xem chất lượng.
2. Nếu ổn thì `enrich --limit 200`. 200 từ chỉ khoảng 10 request.
