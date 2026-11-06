# English App — MVP Design

- **Ngày:** 2026-11-06
- **Trạng thái:** Đã duyệt thiết kế, chờ review spec
- **Người dùng:** chỉ một người (chủ dự án), dùng cá nhân

## 1. Bối cảnh và mục tiêu

### Người dùng

- Trình độ hiện tại: **A2**.
- Làm IT, muốn chuyển sang công ty IT có cơ hội đi outsourcing.
- Thời gian học: **1–2 giờ/ngày**, trên cả điện thoại và máy tính.
- Viết code app theo kiểu nhỏ lẻ, không tính vào thời gian học.

### Mốc mục tiêu

| Mốc       | Mục tiêu                                        |
| --------- | ----------------------------------------------- |
| 02/2027   | TOEIC 650 (Nghe + Đọc)                          |
| 06/2027   | B2 — giao tiếp tốt                              |
| Cuối 2027 | IELTS 7.5 (tham vọng; đánh giá lại vào 06/2027) |

### Thứ tự ưu tiên kỹ năng

Từ vựng > Nghe > Nói/Phát âm > Ngữ pháp > Đọc/Viết.

### Mục tiêu của MVP

Phục vụ mốc TOEIC:

- Thuộc khoảng **1.200 từ TOEIC** trước 02/2027, tức khoảng 15–20 từ mới mỗi ngày.
- Nghe hiểu được câu ở tốc độ TOEIC.

MVP phải **dùng được để học hằng ngày càng sớm càng tốt** (sau bước 3 trong Mục 10).

### Tiêu chí thành công

- Học được hằng ngày trên điện thoại (PWA) và máy tính, tiến độ đồng bộ giữa hai thiết bị.
- Học được khi mạng yếu hoặc mất mạng; kết quả không bị mất.
- Trang tổng quan cho biết mình đang đi trước hay đi sau tiến độ cần có để kịp mốc 02/2027.

## 2. Kiến trúc

Monorepo full TypeScript, dùng **pnpm workspaces**:

```
english-app/
├── apps/
│   ├── web/                 Vue 3 + Vite + Pinia + vite-plugin-pwa
│   └── api/                 Node.js + Fastify + TypeScript
├── packages/
│   └── shared/              type, schema Zod, logic SRS (ts-fsrs), chấm dictation
└── tools/
    └── content-importer/    script nạp từ, tạo ví dụ (Claude API) + audio (Azure TTS)
```

| Thành phần | Lựa chọn                                                                                   |
| ---------- | ------------------------------------------------------------------------------------------ |
| Frontend   | Vue 3, Vite, TypeScript, Vue Router, Pinia, `vite-plugin-pwa`, IndexedDB (ví dụ qua `idb`) |
| Backend    | Fastify, Zod (validate), `@fastify/secure-session` (cookie session), `pino` (log)          |
| ORM / DB   | Prisma + PostgreSQL. Production dùng Neon (gói free); local dùng Postgres qua Docker       |
| SRS        | FSRS qua `ts-fsrs`, đặt trong `packages/shared` để client và server dùng chung             |
| Lưu audio  | Cloudflare R2 (gói free 10GB), truy cập công khai chỉ đọc                                  |
| Test       | Vitest                                                                                     |
| CI/CD      | GitHub Actions (lint, test, build); push lên `main` thì tự deploy lên Render (hoặc Fly.io) |

- Một service Node phục vụ cả API (`/api/*`) lẫn file build tĩnh của Vue, nên không cần CORS.
- Logic quan trọng nằm ở `packages/shared`, và **server là nguồn dữ liệu chính thức**.

### Đăng nhập

- Chỉ có một tài khoản, tạo bằng script seed. Không có trang đăng ký.
- Đăng nhập bằng email + mật khẩu (hash bằng argon2); session lưu trong cookie mã hóa (httpOnly, secure, sameSite=lax).
- Route đăng nhập có giới hạn số lần thử (`@fastify/rate-limit`).

## 3. Tính năng MVP

### 3.1 Từ vựng với SRS

- **Mỗi thẻ gồm:** từ, phiên âm IPA, loại từ, nghĩa tiếng Việt, 1–2 câu ví dụ (ngữ cảnh công sở/IT) kèm bản dịch, audio của từ và của câu.
- **Hai kiểu ôn cho mỗi từ** (mỗi kiểu là một `Card` riêng):
  - `RECOGNIZE`: nhìn từ, nghe audio, nhớ nghĩa, lật thẻ rồi tự chấm.
  - `LISTEN_TYPE`: nghe audio rồi gõ lại từ. Gõ đúng thì gợi ý chấm Good; gõ sai thì gợi ý Again. Người dùng vẫn chọn được mức khác.
- **Chấm 4 mức:** Again / Hard / Good / Easy, theo FSRS.
- **Hàng đợi mỗi ngày:**
  1. Các thẻ đến hạn, xếp theo hạn ôn tăng dần.
  2. Sau đó là từ mới, lấy theo thứ hạng TSL, tối đa `newPerDay` từ (mặc định 20, chỉnh được trong cài đặt).
  - Từ mới chỉ có thẻ `RECOGNIZE` trước. Thẻ `LISTEN_TYPE` của từ đó chỉ được mở khi thẻ `RECOGNIZE` được chấm Good lần đầu.
  - "Ngày" được tính theo múi giờ trong cài đặt của người dùng (mặc định Asia/Ho_Chi_Minh).
- **Trong một phiên học:** thẻ bị chấm Again sẽ được xếp hiện lại trong phiên. FSRS tính ngay trên client để biết thứ tự.
- **Nút "Báo sai"** trên thẻ: sửa trực tiếp nghĩa, IPA hoặc câu ví dụ, rồi lưu lên server.

### 3.2 Luyện nghe chép chính tả

- **Nguồn câu:** các câu `Example` thuộc những từ đã học (từ có ít nhất một lần chấm).
  - Ưu tiên câu chưa luyện hoặc câu có điểm thấp lần trước.
  - Mỗi phiên khoảng 10 câu.
- **Cách luyện:**
  - Nghe câu (nghe lại được, giảm tốc còn 0.75x), gõ lại cả câu, rồi nộp.
  - App so sánh theo từ và tô màu: đúng, sai, thiếu, thừa.
  - Xem được đáp án cùng bản dịch.
- **Quy tắc chấm** (đặt trong `packages/shared`):
  - Không phân biệt hoa thường, bỏ qua dấu câu, gộp nhiều khoảng trắng thành một.
  - Coi dạng viết tắt và dạng đầy đủ là như nhau (ví dụ _don't_ = _do not_, _I'm_ = _I am_), theo một bảng cố định.
  - So khớp bằng thuật toán LCS (dãy con chung dài nhất) theo từ. Điểm = số từ đúng / số từ trong câu đáp án.
- **Liên kết với SRS:**
  - Nếu từ chính của câu bị nghe sai, thẻ `LISTEN_TYPE` của từ đó được đưa lên ôn sớm hơn: hạn ôn lùi về hôm nay. Không ghi thêm `ReviewLog`.
  - Nếu từ chính chưa có thẻ `LISTEN_TYPE` thì bỏ qua bước này.

### 3.3 Trang tổng quan

- Số thẻ đến hạn hôm nay, số từ mới còn lại trong ngày, streak (số ngày liên tiếp có học).
- Số từ đã thuộc trên 1.200, so với tiến độ cần có để kịp mốc 02/2027.
  - "Đã thuộc" nghĩa là thẻ `RECOGNIZE` đang ở trạng thái FSRS `Review`.
  - Tiến độ cần có được tính tuyến tính từ ngày bắt đầu đến 2027-02-01.
- Độ chính xác chép chính tả theo từng tuần (trung bình điểm).
- Trạng thái đồng bộ: online hay offline, và số lượt chấm đang chờ gửi lên.

### 3.4 Cài đặt

- `newPerDay`, múi giờ, tốc độ phát audio mặc định.

### 3.5 Ngoài phạm vi MVP

Các phần sau để giai đoạn sau:

- Luyện nói, phát âm, shadowing
- Ngữ pháp
- Đề luyện TOEIC Part 1–7
- Thông báo nhắc học
- Đọc, viết
- Hỗ trợ nhiều người dùng

### 3.6 Lộ trình sau MVP (định hướng, chưa thiết kế)

| Thời điểm     | Nội dung                                                     |
| ------------- | ------------------------------------------------------------ |
| Trước 02/2027 | Luyện TOEIC Part 2/3/4 (nghe) và Part 5 (ngữ pháp, từ vựng)  |
| Trước 06/2027 | Luyện nói: shadowing, hội thoại với AI, chấm phát âm         |
| Cuối 2027     | Writing và Speaking theo dạng bài IELTS, AI chấm và nhận xét |

## 4. Mô hình dữ liệu (Prisma)

```prisma
model User {
  id           String   @id @default(cuid())
  email        String   @unique
  passwordHash String
  newPerDay    Int      @default(20)
  timezone     String   @default("Asia/Ho_Chi_Minh")
  playbackRate Float    @default(1.0)
  startedAt    DateTime @default(now())
  cards        Card[]
  dictations   DictationAttempt[]
}

model Word {
  id        String    @id @default(cuid())
  lemma     String    @unique
  pos       String          // loại từ: noun, verb...
  ipa       String
  meaningVi String
  tslRank   Int       @unique
  audioKey  String?         // key trên R2
  examples  Example[]
  cards     Card[]
}

model Example {
  id        String  @id @default(cuid())
  wordId    String
  word      Word    @relation(fields: [wordId], references: [id])
  textEn    String
  textVi    String
  audioKey  String?
  voice     String?         // vd en-US-..., en-GB-..., en-AU-...
  dictations DictationAttempt[]
}

enum CardMode { RECOGNIZE LISTEN_TYPE }

model Card {
  id         String    @id @default(cuid())
  userId     String
  user       User      @relation(fields: [userId], references: [id])
  wordId     String
  word       Word      @relation(fields: [wordId], references: [id])
  mode       CardMode
  // Trạng thái FSRS (theo ts-fsrs)
  due        DateTime
  stability  Float
  difficulty Float
  elapsedDays   Int
  scheduledDays Int
  reps       Int
  lapses     Int
  state      Int             // 0 New, 1 Learning, 2 Review, 3 Relearning
  lastReview DateTime?
  logs       ReviewLog[]
  @@unique([userId, wordId, mode])
  @@index([userId, due])
}

model ReviewLog {
  id         String   @id             // UUID do client tạo; dùng để không ghi trùng
  cardId     String
  card       Card     @relation(fields: [cardId], references: [id])
  rating     Int                       // 1 Again, 2 Hard, 3 Good, 4 Easy
  reviewedAt DateTime                  // thời điểm chấm trên client
  receivedAt DateTime @default(now())
  @@index([cardId, reviewedAt])
}

model DictationAttempt {
  id         String   @id              // UUID do client tạo
  userId     String
  user       User     @relation(fields: [userId], references: [id])
  exampleId  String
  example    Example  @relation(fields: [exampleId], references: [id])
  input      String
  score      Float
  diff       Json                      // kết quả so sánh theo từ
  createdAt  DateTime
}
```

Session lưu trong cookie mã hóa, nên không cần bảng session.

## 5. API (tiền tố `/api`)

| Method    | Path                        | Mô tả                                                                                     |
| --------- | --------------------------- | ----------------------------------------------------------------------------------------- |
| POST      | `/auth/login`               | Đăng nhập                                                                                 |
| POST      | `/auth/logout`              | Đăng xuất                                                                                 |
| GET       | `/auth/me`                  | Người dùng hiện tại                                                                       |
| GET       | `/study/today`              | Hàng đợi hôm nay: thẻ đến hạn + từ mới, kèm dữ liệu từ, ví dụ và URL audio                |
| POST      | `/reviews/batch`            | Gửi danh sách lượt chấm `{ id, cardId, rating, reviewedAt }[]`; không ghi trùng theo `id` |
| GET       | `/dictation/session`        | Khoảng 10 câu để luyện                                                                    |
| POST      | `/dictation/attempts/batch` | Gửi các lần chép chính tả; server chấm lại bằng logic trong `shared`                      |
| PATCH     | `/words/:id`                | Sửa nội dung từ hoặc ví dụ (nút "Báo sai")                                                |
| GET       | `/stats/overview`           | Số liệu cho trang tổng quan                                                               |
| GET/PATCH | `/settings`                 | Cài đặt                                                                                   |

- Mọi request và response đều có schema Zod đặt trong `packages/shared`.
- Lỗi luôn trả về dạng `{ error: { code, message } }`.

### Xử lý `POST /reviews/batch`

1. Bỏ qua các `id` đã có trong `ReviewLog`.
2. Gom các lượt chấm theo `cardId`, sắp xếp theo `reviewedAt` tăng dần.
3. Nếu có lượt chấm cũ hơn `lastReview` của thẻ, tức đến muộn, thì tính lại trạng thái FSRS từ toàn bộ log của thẻ đó.
4. Ghi log và cập nhật trạng thái thẻ trong một transaction.
   - Khi một thẻ `RECOGNIZE` được chấm Good hoặc Easy lần đầu, tạo luôn thẻ `LISTEN_TYPE` cho từ đó, nếu chưa có.

## 6. Quy trình tạo nội dung (`tools/content-importer`)

Đây là CLI Node chạy trên máy người dùng, theo từng bước, chạy lại được nhiều lần.

1. **`import-tsl <csv>`**
   - Nạp danh sách TSL (giấy phép CC BY-SA) vào bảng `Word`, gồm `lemma` và `tslRank`.
   - Nếu từ đã có thì bỏ qua.
2. **`enrich [--limit N]`**
   - Gọi Claude API theo lô (khoảng 20 từ mỗi request) để tạo: loại từ, IPA, nghĩa tiếng Việt, 2 câu ví dụ ngữ cảnh công sở/IT ở mức A2–B1 kèm bản dịch.
   - Kết quả là JSON, được kiểm tra bằng schema Zod.
   - Chỉ xử lý từ chưa có nghĩa.
   - Lỗi thì thử lại với backoff; sau 3 lần vẫn lỗi thì ghi vào `failed.json`.
3. **`tts [--limit N]`**
   - Tạo audio bằng Azure TTS cho từ và câu chưa có `audioKey`.
   - Xoay vòng giọng en-US, en-GB, en-AU cho câu ví dụ.
   - Upload file mp3 lên R2 rồi lưu `audioKey`.
4. **`report`**
   - Xuất file markdown hoặc CSV để rà lại các nội dung mới tạo.

Ghi chú:

- Bản đầu tiên nạp khoảng 200 từ đầu (`--limit 200`) để bắt đầu học ngay.
- Key Claude, key Azure và thông tin R2 chỉ để trong `.env` trên máy, không commit và không đưa lên server production.
- Mô hình Claude: dùng model mới nhất có chi phí thấp phù hợp. Chi phí cụ thể sẽ kiểm tra khi triển khai.

## 7. Offline và đồng bộ

- **Service worker** (`vite-plugin-pwa`, Workbox):
  - Precache phần giao diện (app shell).
  - Audio từ R2 dùng chiến lược cache-first.
- **Khi mở app (có mạng):**
  - Gọi `/study/today` và lưu kết quả vào IndexedDB.
  - Tải trước audio của hàng đợi hôm nay.
- **Mỗi lần chấm:**
  - FSRS tính ngay trên client để cập nhật hàng đợi trong phiên.
  - Bản ghi `{ id: uuid, cardId, rating, reviewedAt }` được thêm vào hàng đợi trong IndexedDB.
- **Đồng bộ:**
  - Chạy khi trở lại online, sau mỗi 10 lượt chấm, và khi đóng hoặc ẩn trang (`visibilitychange`).
  - Nếu thất bại thì thử lại sau khoảng thời gian tăng dần (1s, 2s, 4s… tối đa 60s).
  - Server là bản chính thức. Sau khi đồng bộ, client tải lại `/study/today` để lấy trạng thái chuẩn.
- **Chép chính tả khi offline:** dùng chung cơ chế hàng đợi, với `POST /dictation/attempts/batch`.

## 8. Xử lý lỗi

- **API:**
  - Fastify error handler đưa mọi lỗi về dạng `{ error: { code, message } }`.
  - Lỗi Zod trả 400, chưa đăng nhập trả 401, không tìm thấy trả 404, lỗi khác trả 500 và không lộ chi tiết.
  - Log bằng `pino`.
- **Frontend:**
  - Hiện chỉ báo offline và số lượt chấm đang chờ gửi.
  - Lỗi 401 thì chuyển về trang đăng nhập; hàng đợi vẫn được giữ lại.
  - Audio lỗi thì hiện chữ thay thế, vẫn học tiếp được.
- **Importer:** thử lại với backoff, ghi `failed.json`, không làm dừng cả lô.

## 9. Kiểm thử

- **Unit test (Vitest)** cho `packages/shared` và services của API:
  - Xếp hàng đợi hôm nay: thẻ đến hạn trước, rồi từ mới, giới hạn `newPerDay`, ranh giới ngày theo múi giờ.
  - Chấm chép chính tả: hoa thường, dấu câu, dạng viết tắt, các trường hợp thiếu, thừa, sai từ.
  - Gộp lượt chấm khi đồng bộ: không ghi trùng, lượt chấm đến muộn thì tính lại, đúng thứ tự.
  - Mở thẻ `LISTEN_TYPE` khi thẻ `RECOGNIZE` được chấm Good lần đầu.
- **Integration test:**
  - Gọi các route chính bằng Fastify `inject()` với PostgreSQL test (Docker).
  - Gồm đăng nhập, `/study/today`, `/reviews/batch`, dictation.
- **Frontend:** test các composable có logic (hàng đợi đồng bộ, phiên học). Phần giao diện kiểm tra bằng tay.
- **Importer:** dùng bản giả (mock) của Claude và Azure, test validate và bước bỏ qua nội dung đã có.

## 10. Thứ tự xây dựng

Mỗi bước xong là chạy được.

1. **Khung dự án:**
   - Monorepo pnpm, Prisma + Postgres, Fastify, Vue, đăng nhập.
   - CI và deploy bản "Hello" lên Render.
2. **Content importer:** `import-tsl`, `enrich`, `tts`, `report`, nạp khoảng 200 từ.
3. **Học từ vựng SRS, kiểu `RECOGNIZE`:**
   - `/study/today`, `/reviews/batch` (bản online), giao diện học.
   - **Từ bước này đã học được hằng ngày.**
4. **Kiểu `LISTEN_TYPE` và luyện chép chính tả.**
5. **PWA và offline:** cài lên điện thoại, IndexedDB, hàng đợi đồng bộ.
6. **Trang tổng quan, cài đặt, nút "Báo sai"**, sau đó nạp đủ 1.200 từ.

## 11. Rủi ro và lưu ý

- **Thời gian rất gấp:** từ A2 lên TOEIC 650 trong khoảng 3 tháng. Mỗi bước làm app nên giữ nhỏ để không ảnh hưởng đến 1–2 giờ học mỗi ngày.
- **AI có thể tạo sai** IPA, nghĩa hoặc câu ví dụ. Cách giảm thiểu: bước `report` để rà lại, và nút "Báo sai" để sửa khi học.
- **Gói miễn phí có giới hạn:**
  - Neon có thể tạm ngưng khi không có truy cập, nên lần mở đầu tiên có thể chậm vài giây.
  - Render free có thời gian khởi động lại (cold start). Có thể nâng lên gói vài USD/tháng nếu thấy khó chịu.
- **iOS PWA:** dung lượng cache có giới hạn và có thể bị xóa nếu lâu không mở app. Khi đó app sẽ tải lại audio của hàng đợi hôm nay.
