# Deploy (Render + Neon)

Một service Node trên Render phục vụ cả API (`/api/*`) lẫn bản build của web. Database là PostgreSQL trên Neon.

Bạn chỉ cần làm các bước dưới đây một lần.

## 1. Tạo database trên Neon

1. Đăng nhập https://neon.tech, tạo project mới. Chọn PostgreSQL 17, region gần Việt Nam nhất (ví dụ Singapore).
2. Copy **connection string**. Chuỗi này có dạng `postgresql://...neon.tech/neondb?sslmode=require`.

## 2. Đưa code lên GitHub

Push nhánh `main` lên repo GitHub. CI (`.github/workflows/ci.yml`) sẽ tự chạy typecheck, lint, test và build.

## 3. Tạo service trên Render

1. Vào https://dashboard.render.com, chọn **New → Blueprint**, rồi chọn repo này. Render sẽ đọc file `render.yaml`.
2. Nhập hai biến môi trường:
   - `DATABASE_URL`: connection string của Neon ở bước 1.
   - `SESSION_SECRET`: 64 ký tự hex. Tạo bằng lệnh:
     ```bash
     node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
     ```
3. Bấm Deploy. Bước build sẽ tự chạy migration (`prisma migrate deploy`).
4. Kiểm tra: mở `https://<tên-service>.onrender.com/api/health`. Kết quả phải là `{"status":"ok"}`.

## 4. Tạo tài khoản trên production

Chạy lệnh dưới đây trên máy của bạn. Mật khẩu chỉ nằm trong biến môi trường của lệnh này, không được lưu vào file nào.

```bash
DATABASE_URL='<connection string Neon>' SEED_EMAIL='you@example.com' SEED_PASSWORD='<mật khẩu mạnh>' pnpm --filter @english-app/api db:seed
```

Chạy lại lệnh này với mật khẩu mới nếu bạn muốn đổi mật khẩu.

## Lưu ý về gói miễn phí

- **Render free:** service tự tắt sau khoảng 15 phút không có truy cập. Lần mở đầu tiên sau đó sẽ mất khoảng 30–60 giây để khởi động lại.
- **Neon free:** database cũng tạm ngưng khi không dùng. Truy vấn đầu tiên sau đó chậm hơn bình thường vài giây.
