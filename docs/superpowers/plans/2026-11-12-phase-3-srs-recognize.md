# Phase 3 — Học từ vựng SRS kiểu RECOGNIZE Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sau phase này, người dùng đăng nhập là học được hằng ngày: xem hàng đợi hôm nay (thẻ đến hạn rồi từ mới), lật thẻ, chấm 4 mức theo FSRS, và kết quả được lưu trên server.

**Architecture:** Logic SRS (bọc `ts-fsrs`) và ranh giới ngày theo múi giờ nằm trong `packages/shared`, client và server dùng chung nên tính ra cùng một kết quả. API có hai service thuần nhận `db` làm tham số (`getStudyToday`, `applyReviewBatch`) và một file route mỏng. Web có một Pinia store điều khiển phiên học; mỗi lượt chấm được tính ngay trên client để xếp lại hàng đợi, rồi gửi lên server. Lượt chưa gửi được thì giữ trong `localStorage` và gửi lại sau.

**Tech Stack:** `ts-fsrs` 6 (API `fsrs()`), Prisma 6, Fastify 5, Zod 4, Vue 3.5 + Pinia, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-06-english-app-mvp-design.md` (Mục 3.1, 4, 5, 8, 9, 10 bước 3)

## Global Constraints

- Mọi route API có tiền tố `/api`, cần đăng nhập (`app.requireAuth`), lỗi trả `{ error: { code, message } }`.
- Mọi schema request/response nằm trong `packages/shared`.
- **Server là nguồn dữ liệu chính thức.** Client chỉ tính FSRS để xếp hàng đợi trong phiên.
- Chấm 4 mức: 1 Again, 2 Hard, 3 Good, 4 Easy.
- Hàng đợi: thẻ đến hạn trước, xếp theo hạn ôn tăng dần; sau đó là từ mới theo `tslRank`, tối đa `newPerDay` từ mỗi ngày.
- "Ngày" tính theo `User.timezone` (mặc định `Asia/Ho_Chi_Minh`).
- `ReviewLog.id` là UUID do client tạo; gửi lại cùng `id` không được ghi trùng.
- FSRS tắt fuzz, để client và server ra cùng kết quả.
- Audio lỗi hoặc không có thì vẫn học tiếp được.
- Giao diện tiếng Việt, hiển thị ổn ở chiều rộng 375px.

## Quyết định lệch khỏi spec

- **`Card` bỏ cột `elapsedDays`, thêm `learningSteps` và `createdAt`.** `ts-fsrs` 6 không còn `elapsed_days` trong thẻ mà có `learning_steps`; `createdAt` là điểm gốc để tính lại trạng thái từ toàn bộ log.
- **`GET /study/today` tạo sẵn dòng `Card` cho các từ mới của hôm nay.** Nhờ vậy `/reviews/batch` luôn nhận `cardId` đúng như spec.
- **Thẻ còn trong bước học (hạn ôn vẫn trong hôm nay) được xếp lại trong phiên, không chỉ riêng thẻ chấm Again.** FSRS cho từ mới đi qua các bước 1 phút và 10 phút; nếu chỉ xếp lại thẻ Again thì học xong phiên vẫn còn thẻ đến hạn trong ngày.
- **`POST /reviews/batch` nhận `{ reviews: [...] }`** thay cho mảng trần, để sau này thêm trường không phải đổi dạng.
- **Chưa tạo thẻ `LISTEN_TYPE`** khi chấm Good lần đầu. Việc đó thuộc bước 4, cùng lúc với giao diện của kiểu ôn này.
- **Lượt chấm chưa gửi được lưu trong `localStorage`.** Hàng đợi IndexedDB đầy đủ thuộc bước 5.
- **Biến môi trường mới `AUDIO_BASE_URL`** (địa chỉ công khai của bucket R2). Không đặt thì thẻ không có audio.

## Review Focus

1. **Chưa có từ nào được nạp** → hàng đợi rỗng, màn hình báo rõ thay vì lỗi. Test ở Task 2 và Task 4.
2. **Cùng một lô gửi hai lần** (gửi lại sau khi mất mạng) → trạng thái thẻ không bị tính hai lần. Test ở Task 3.
3. **Lượt chấm cho thẻ không tồn tại hoặc của người khác** → bị từ chối riêng, các lượt còn lại vẫn được ghi. Test ở Task 3.
4. **Ranh giới ngày theo múi giờ**: thẻ đến hạn 00:30 ngày mai (giờ địa phương) chưa vào hôm nay; hạn mức từ mới tính lại từ 00:00 giờ địa phương. Test ở Task 1 và Task 2.
5. **`reviewedAt` ở tương lai** (đồng hồ máy sai) → server kéo về thời điểm hiện tại. Test ở Task 3.
6. **Mất mạng khi gửi lượt chấm** → lượt chấm được giữ lại, còn sau khi tải lại trang, và được gửi ở lần sau. Test ở Task 4.
7. **Từ chưa có audio** hoặc chưa đặt `AUDIO_BASE_URL` → `audioUrl` là `null`, thẻ vẫn học được. Test ở Task 2.

---

### Task 1: Logic dùng chung — SRS, ranh giới ngày, schema

**Files:**

- Create: `packages/shared/src/srs.ts`, `packages/shared/src/day.ts`, `packages/shared/src/study.ts`
- Modify: `packages/shared/src/index.ts`, `packages/shared/package.json` (thêm `ts-fsrs`)
- Test: `packages/shared/src/srs.test.ts`, `packages/shared/src/day.test.ts`, `packages/shared/src/study.test.ts`

**Interfaces:**

- Produces (`@english-app/shared`):
  - `ratingSchema` (1 | 2 | 3 | 4), type `Rating`
  - `cardStateSchema`, type `CardState = { due: string; stability: number; difficulty: number; scheduledDays: number; learningSteps: number; reps: number; lapses: number; state: 0 | 1 | 2 | 3; lastReview: string | null }` — `due` và `lastReview` là chuỗi ISO
  - `newCardState(now: Date): CardState` — `state` 0, `due` = `now`
  - `applyRating(state: CardState, rating: Rating, reviewedAt: Date): CardState`
  - `replayReviews(createdAt: Date, reviews: { rating: Rating; reviewedAt: Date }[]): CardState` — áp lần lượt theo thứ tự đưa vào, bắt đầu từ `newCardState(createdAt)`
  - `previewDue(state: CardState, now: Date): Record<Rating, string>` — hạn ôn kế tiếp cho từng mức chấm
  - `DEFAULT_TIMEZONE = 'Asia/Ho_Chi_Minh'`
  - `startOfDay(now: Date, timezone: string): Date`, `startOfNextDay(now: Date, timezone: string): Date` — múi giờ không hợp lệ thì dùng `DEFAULT_TIMEZONE`
  - `studyCardSchema`: `{ cardId: string; mode: 'RECOGNIZE' | 'LISTEN_TYPE'; isNew: boolean; state: CardState; word: { id; lemma; pos: string | null; ipa: string | null; meaningVi: string; audioUrl: string | null; examples: { id; textEn; textVi; audioUrl: string | null }[] } }`; type `StudyCard`
  - `studyTodayResponseSchema`: `{ cards: StudyCard[]; dueCount: number; newCount: number; dayEndsAt: string }`; type `StudyTodayResponse`
  - `reviewInputSchema`: `{ id: uuid; cardId: string (min 1); rating: Rating; reviewedAt: ISO datetime }`; type `ReviewInput`
  - `reviewBatchRequestSchema`: `{ reviews: ReviewInput[] (1–500) }`
  - `reviewBatchResponseSchema`: `{ applied: number; duplicates: number; rejected: string[]; cards: { cardId: string; state: CardState }[] }`; type `ReviewBatchResponse`
- `srs.ts` là nơi duy nhất import `ts-fsrs`: `fsrs(generatorParameters({ enable_fuzz: false }))`.

- [ ] **Step 1: Viết test**

```ts
// srs.test.ts — t0 = 2026-01-01T00:00:00Z
it('new card is due now in state New', () => {
  expect(newCardState(t0)).toMatchObject({
    state: 0,
    reps: 0,
    due: t0.toISOString(),
    lastReview: null,
  })
})
it('Good on a new card enters learning, due in 10 minutes', () => {
  const s = applyRating(newCardState(t0), 3, t0)
  expect(s).toMatchObject({
    state: 1,
    reps: 1,
    due: '2026-01-01T00:10:00.000Z',
    lastReview: t0.toISOString(),
  })
})
it('Again on a new card is due in 1 minute', () => {
  expect(applyRating(newCardState(t0), 1, t0).due).toBe('2026-01-01T00:01:00.000Z')
})
it('a second Good graduates to Review, due in whole days', () => {
  const s = applyRating(applyRating(newCardState(t0), 3, t0), 3, minutes(10))
  expect(s.state).toBe(2)
  expect(s.scheduledDays).toBeGreaterThanOrEqual(1)
})
it('Easy on a new card goes straight to Review', () => {
  expect(applyRating(newCardState(t0), 4, t0).state).toBe(2)
})
it('Again on a Review card counts a lapse and enters Relearning', () => {
  // từ thẻ Review ở trên, chấm 1 sau 3 ngày → state 3, lapses 1
})
it('does not mutate its input and is deterministic', () => {})
it('replayReviews equals applying the ratings one by one', () => {})
it('previewDue matches applyRating for every rating', () => {})

// day.test.ts
it('start of day in Ho Chi Minh (UTC+7)', () => {
  expect(startOfDay(new Date('2026-11-12T20:00:00Z'), 'Asia/Ho_Chi_Minh').toISOString()).toBe(
    '2026-11-12T17:00:00.000Z',
  )
  expect(startOfNextDay(new Date('2026-11-12T20:00:00Z'), 'Asia/Ho_Chi_Minh').toISOString()).toBe(
    '2026-11-13T17:00:00.000Z',
  )
})
it('the instant of local midnight belongs to the new day', () => {})
it('handles a zone behind UTC and a DST change day', () => {
  // America/New_York, 2026-03-08 (ngày chỉ có 23 giờ): start 05:00Z, next 2026-03-09T04:00Z
})
it('falls back to the default zone for an invalid zone name', () => {})

// study.test.ts
it('accepts a valid review batch', () => {})
it.each([
  'rating 5',
  'rating 0',
  'id not a uuid',
  'reviewedAt not a datetime',
  'empty reviews',
  '501 reviews',
])('rejects %s', () => {})
```

- [ ] **Step 2: Chạy test, xác nhận FAIL** — `pnpm --filter @english-app/shared test` → FAIL (module chưa tồn tại)
- [ ] **Step 3: Implement `srs.ts`, `day.ts`, `study.ts`, export qua `index.ts`**
  - `startOfDay`: lấy ngày giờ địa phương bằng `Intl.DateTimeFormat` (`hourCycle: 'h23'`), suy ra độ lệch so với UTC, rồi tính lại độ lệch tại chính thời điểm nửa đêm vừa tìm được (để đúng trong ngày đổi giờ).
- [ ] **Step 4: Chạy test, typecheck, lint** — `pnpm --filter @english-app/shared test && pnpm typecheck && pnpm lint` → PASS
- [ ] **Step 5: Commit** — `feat(shared): add SRS scheduling, day boundaries and study schemas`

---

### Task 2: Model `Card`, `ReviewLog` và `GET /api/study/today`

**Files:**

- Modify: `apps/api/prisma/schema.prisma`, `apps/api/src/config.ts`, `apps/api/src/app.ts`, `apps/api/test/db.ts`, `apps/api/test/app.ts`, `apps/api/.env.example`, `render.yaml`, `docs/deploy.md`
- Create: `apps/api/prisma/migrations/*_cards/`, `apps/api/src/services/cardState.ts`, `apps/api/src/services/studyQueue.ts`, `apps/api/src/routes/study.ts`, `apps/api/test/content.ts`
- Test: `apps/api/src/services/studyQueue.test.ts`, `apps/api/src/routes/study.test.ts`, thêm case vào `apps/api/src/config.test.ts`

**Interfaces:**

- Consumes: mọi thứ Task 1 tạo ra.
- Produces:
  - `enum CardMode { RECOGNIZE LISTEN_TYPE }`
  - Model `Card { id; userId; wordId; mode; due DateTime; stability Float; difficulty Float; scheduledDays Int; learningSteps Int @default(0); reps Int; lapses Int; state Int; lastReview DateTime?; createdAt DateTime @default(now()); logs ReviewLog[]; @@unique([userId, wordId, mode]); @@index([userId, due]) }`
  - Model `ReviewLog { id String @id; cardId; rating Int; reviewedAt DateTime; receivedAt DateTime @default(now()); @@index([cardId, reviewedAt]) }`
  - `Config.audioBaseUrl: string | null` — từ `AUDIO_BASE_URL` (phải là URL `http(s)`; bỏ dấu `/` ở cuối)
  - `cardToState(card: Card): CardState` và `stateToCardData(state: CardState)` (trả phần dữ liệu để ghi vào `Card`)
  - `getStudyToday(db, userId: string, now: Date, audioBaseUrl: string | null): Promise<StudyTodayResponse>`
  - `GET /api/study/today` → `200 StudyTodayResponse`
  - `test/content.ts`: `seedWords(db, n): Promise<Word[]>` tạo `n` từ đã có nghĩa (`w1`…`wn`, `tslRank` 1…n), mỗi từ 2 câu ví dụ
  - `resetDb` xóa thêm `ReviewLog`, `Card`
- Hành vi `getStudyToday`:
  1. Tính `dayStart`, `dayEnd` theo múi giờ của user.
  2. `introducedToday` = số thẻ `RECOGNIZE` của user có log trong hôm nay và không có log nào trước hôm nay. Hạn mức còn lại = `max(0, newPerDay - introducedToday)`.
  3. Thẻ mới = thẻ `state` 0 sẵn có, xếp theo `tslRank`, lấy tối đa bằng hạn mức. Còn thiếu thì tạo thêm `Card` (`newCardState(now)`) cho các từ **đã có nghĩa** mà user chưa có thẻ `RECOGNIZE`, theo `tslRank`.
  4. Thẻ đến hạn = thẻ `RECOGNIZE` có `state` khác 0 và `due < dayEnd`, xếp theo `due` tăng dần.
  5. Trả `cards` = đến hạn rồi tới mới; `dueCount`, `newCount`; `dayEndsAt = dayEnd`.
  6. `audioUrl` = `<audioBaseUrl>/<audioKey>` khi cả hai đều có, ngược lại `null`. Câu ví dụ xếp theo `id`.

- [ ] **Step 1: Viết test**

```ts
// studyQueue.test.ts — now = 2026-11-12T03:00:00Z (10:00 giờ VN); user newPerDay mặc định 20
it('empty database → empty queue', async () => {
  expect(await getStudyToday(db, user.id, now, null)).toMatchObject({
    cards: [],
    dueCount: 0,
    newCount: 0,
    dayEndsAt: '2026-11-12T17:00:00.000Z',
  })
})
it('introduces new words by rank up to newPerDay and creates their cards', async () => {
  // 25 từ → 20 thẻ w1…w20, isNew true, state.state 0; db.card.count() = 20
})
it('is idempotent: a second call returns the same cards', async () => {})
it('skips words without a meaning', async () => {})
it('respects a custom newPerDay', async () => {})
it('reviewed-today cards use up the new budget', async () => {
  // newPerDay 3; gọi 1 lần, chấm (ghi log + cập nhật state) 2 thẻ → lần sau newCount = 1 và không tạo thêm thẻ
})
it('the new budget resets at local midnight', async () => {
  // log của 3 thẻ ở 2026-11-11T16:59Z (23:59 hôm trước giờ VN) → hôm nay vẫn có 3 thẻ mới
})
it('due cards come first, ordered by due, then new cards', async () => {})
it('a card due after local midnight is not in today', async () => {
  // due 2026-11-12T17:30Z (00:30 ngày mai giờ VN) → không có; due 16:59Z → có
})
it('builds audio URLs only when base URL and key both exist', async () => {
  // base 'https://cdn.test' + audioKey 'audio/words/x.mp3' → 'https://cdn.test/audio/words/x.mp3'; thiếu một trong hai → null
})
it("does not return another user's cards", async () => {})

// study.test.ts (route)
it('GET /api/study/today without session → 401 UNAUTHENTICATED', async () => {})
it('GET /api/study/today → 200 matching studyTodayResponseSchema', async () => {})

// config.test.ts
it('AUDIO_BASE_URL is optional, validated and stripped of a trailing slash', () => {})
```

- [ ] **Step 2: Chạy test, xác nhận FAIL** — `pnpm --filter @english-app/api test study` → FAIL
- [ ] **Step 3: Thêm model, tạo migration** — `pnpm --filter @english-app/api exec prisma migrate dev --name cards`
- [ ] **Step 4: Implement config, `cardState.ts`, `studyQueue.ts`, `routes/study.ts`, đăng ký trong `app.ts`**
- [ ] **Step 5: Chạy test, typecheck, lint** — `pnpm --filter @english-app/api test && pnpm typecheck && pnpm lint` → PASS
- [ ] **Step 6: Cập nhật `.env.example`, `render.yaml` (`AUDIO_BASE_URL`, `sync: false`), `docs/deploy.md`**
- [ ] **Step 7: Commit** — `feat(api): add cards and today's study queue`

---

### Task 3: `POST /api/reviews/batch`

**Files:**

- Create: `apps/api/src/services/reviews.ts`
- Modify: `apps/api/src/routes/study.ts`
- Test: `apps/api/src/services/reviews.test.ts`, thêm case vào `apps/api/src/routes/study.test.ts`

**Interfaces:**

- Consumes: `applyRating`, `replayReviews`, `ReviewInput`, `ReviewBatchResponse` (Task 1); `cardToState`, `stateToCardData`, `getStudyToday`, `seedWords` (Task 2).
- Produces:
  - `applyReviewBatch(db, userId: string, reviews: ReviewInput[], now: Date): Promise<ReviewBatchResponse>`
  - `POST /api/reviews/batch` body `reviewBatchRequestSchema` → `200 ReviewBatchResponse`; body sai → 400 `VALIDATION_ERROR`
- Hành vi `applyReviewBatch` (tất cả trong một transaction, khóa các dòng `Card` liên quan bằng `SELECT … FOR UPDATE`):
  1. `id` lặp trong cùng lô: chỉ giữ lượt đầu, các lượt sau tính vào `duplicates`.
  2. `id` đã có trong `ReviewLog` → `duplicates`.
  3. `cardId` không phải thẻ của user → đưa `id` vào `rejected`.
  4. `reviewedAt` sau `now` → dùng `now`.
  5. Với mỗi thẻ, xếp lượt mới theo (`reviewedAt`, `id`). Nếu lượt sớm nhất không sau `lastReview` của thẻ (đến muộn) → `replayReviews(card.createdAt, toàn bộ log cũ + mới đã xếp)`. Ngược lại áp lần lượt bằng `applyRating`.
  6. Ghi log, cập nhật thẻ. `applied` = số log mới; `cards` = trạng thái mới của các thẻ có thay đổi.

- [ ] **Step 1: Viết test**

```ts
// reviews.test.ts — 3 từ, thẻ lấy từ getStudyToday; r(card, rating, at) tạo ReviewInput với uuid mới
it('applies a rating: writes the log and updates the card', async () => {
  // Good tại t → applied 1; thẻ trong DB khớp applyRating(newCardState, 3, t); log có rating 3 và reviewedAt t
})
it('applies several ratings for one card in reviewedAt order, whatever the array order', async () => {})
it('sending the same batch twice changes nothing the second time', async () => {
  // lần 2: { applied: 0, duplicates: n, cards: [] }; reps của thẻ không đổi; số log không đổi
})
it('a repeated id inside one batch is applied once', async () => {})
it('rejects reviews for unknown cards and other users’ cards, applies the rest', async () => {})
it('a late review triggers a replay of the whole history', async () => {
  // gửi Good tại t+10m trước, rồi Again tại t → trạng thái = replayReviews(createdAt, [Again@t, Good@t+10m])
})
it('clamps reviewedAt in the future to now', async () => {})
it('an empty result batch (all duplicates/rejected) does not fail', async () => {})

// study.test.ts (route)
it('POST /api/reviews/batch without session → 401', async () => {})
it('POST /api/reviews/batch with an invalid body → 400 VALIDATION_ERROR', async () => {})
it('POST /api/reviews/batch → 200, and the card leaves the new list of /study/today', async () => {})
```

- [ ] **Step 2: Chạy test, xác nhận FAIL** — `pnpm --filter @english-app/api test reviews` → FAIL
- [ ] **Step 3: Implement `reviews.ts` và route**
- [ ] **Step 4: Chạy test, typecheck, lint** — `pnpm --filter @english-app/api test && pnpm typecheck && pnpm lint` → PASS
- [ ] **Step 5: Commit** — `feat(api): add review batch endpoint`

---

### Task 4: Web — logic phiên học

**Files:**

- Create: `apps/web/src/study/queue.ts`, `apps/web/src/study/format.ts`, `apps/web/src/study/pending.ts`, `apps/web/src/stores/study.ts`
- Test: `apps/web/src/study/queue.test.ts`, `apps/web/src/study/format.test.ts`, `apps/web/src/stores/study.test.ts`

**Interfaces:**

- Consumes: `StudyCard`, `StudyTodayResponse`, `ReviewInput`, `Rating`, `applyRating`, `previewDue` (Task 1); `api`, `ApiError` (Phase 1).
- Produces:
  - `REQUEUE_GAP = 3`
  - `requeue(rest: StudyCard[], card: StudyCard, rating: Rating, dayEndsAt: Date): StudyCard[]` — `rest` là hàng đợi đã bỏ thẻ vừa chấm; `card` mang trạng thái mới. Hạn ôn mới từ `dayEndsAt` trở đi → không xếp lại. Còn trong hôm nay: Again → chèn vào vị trí `min(REQUEUE_GAP, rest.length)`; mức khác → cuối hàng. Thẻ xếp lại có `isNew = false`.
  - `formatInterval(from: Date, due: Date): string` — dưới 1 giờ: `"N phút"` (tối thiểu 1); dưới 1 ngày: `"N giờ"`; dưới 60 ngày: `"N ngày"`; còn lại `"N tháng"` (30 ngày một tháng). Làm tròn gần nhất.
  - `loadPending(): ReviewInput[]`, `savePending(list: ReviewInput[]): void` — khóa `localStorage` `english-app:pending-reviews`; dữ liệu hỏng hoặc `localStorage` không dùng được thì coi như rỗng.
  - Store `useStudyStore()`:
    - state: `status: 'idle' | 'loading' | 'ready' | 'error'`, `queue: StudyCard[]`, `dueCount`, `newCount`, `dayEndsAt: string | null`, `revealed: boolean`, `reviewedCount: number`, `pending: ReviewInput[]`, `syncError: boolean`
    - getters: `current: StudyCard | null`, `finished: boolean` (`status === 'ready'` và hàng đợi rỗng), `intervals: Record<Rating, string> | null` (nhãn cho 4 nút của thẻ hiện tại)
    - actions: `load()` (gửi các lượt đang chờ trước, rồi gọi `/study/today`), `reveal()`, `rate(rating)`, `flush()`
  - `rate`: tính trạng thái mới bằng `applyRating`, thêm `{ id: crypto.randomUUID(), cardId, rating, reviewedAt }` vào `pending` (lưu `localStorage`), cập nhật hàng đợi bằng `requeue`, đặt `revealed = false`, tăng `reviewedCount`, rồi gọi `flush()` mà không chờ.
  - `flush`: mỗi lúc chỉ một request; gửi toàn bộ `pending` hiện có tới `POST /reviews/batch`. Thành công → bỏ đúng các lượt đã gửi, `syncError = false`, và nếu trong lúc chờ có lượt mới thì gửi tiếp. Lỗi 400 → bỏ lô đó (server sẽ không bao giờ nhận). Lỗi khác → giữ nguyên, `syncError = true`.

- [ ] **Step 1: Viết test**

```ts
// queue.test.ts — dayEndsAt = cuối hôm nay; card(n) tạo StudyCard giả
it('Again reinserts the card 3 places later', () => {
  expect(ids(requeue([c2, c3, c4, c5], dueInOneMinute(c1), 1, dayEnd))).toEqual([
    '2',
    '3',
    '4',
    '1',
    '5',
  ])
})
it('Again with a short queue goes to the end', () => {})
it('a learning step later today goes to the end', () => {})
it('a card due tomorrow or later leaves the session', () => {})
it('a requeued card is no longer new', () => {})

// format.test.ts
it.each([
  [30_000, '1 phút'],
  [10 * MIN, '10 phút'],
  [3 * HOUR, '3 giờ'],
  [DAY, '1 ngày'],
  [4.4 * DAY, '4 ngày'],
  [90 * DAY, '3 tháng'],
])('%d ms → %s', () => {})

// stores/study.test.ts — fetch giả trả hàng đợi 2 thẻ mới
it('load fetches the queue', async () => {})
it('load with no cards is finished, not an error', async () => {})
it('load failure sets status error', async () => {})
it('rate sends the review and advances to the next card', async () => {
  // sau reveal + rate(3): current là thẻ 2; POST /api/reviews/batch nhận 1 review rating 3; thẻ 1 (hạn 10 phút) nằm cuối hàng
})
it('Easy removes the card from the session', async () => {})
it('a failed send keeps the review pending and in localStorage', async () => {
  // fetch POST ném TypeError → pending.length 1, syncError true, loadPending() có 1 phần tử
})
it('pending reviews from a previous visit are sent on load', async () => {
  // savePending([x]) trước khi tạo store → load() gọi POST với x trước khi GET; sau đó pending rỗng
})
it('a 400 response drops the batch', async () => {})
it('intervals labels the four buttons for the current card', async () => {
  // thẻ mới → { 1: '1 phút', 2: '6 phút', 3: '10 phút', 4: '… ngày' }
})
```

- [ ] **Step 2: Chạy test, xác nhận FAIL** — `pnpm --filter @english-app/web test` → FAIL
- [ ] **Step 3: Implement `queue.ts`, `format.ts`, `pending.ts`, `stores/study.ts`**
- [ ] **Step 4: Chạy test, typecheck, lint** — `pnpm --filter @english-app/web test && pnpm typecheck && pnpm lint` → PASS
- [ ] **Step 5: Commit** — `feat(web): add study session store`

---

### Task 5: Web — màn hình học

**Files:**

- Create: `apps/web/src/views/StudyView.vue`, `apps/web/src/components/AudioButton.vue`
- Modify: `apps/web/src/views/HomeView.vue`, `apps/web/src/router.ts`, `apps/web/src/style.css`, `README.md`
- Test: thêm case vào `apps/web/src/router.test.ts`

**Interfaces:**

- Consumes: `useStudyStore` (Task 4); `useAuthStore` (Phase 1).
- Produces:
  - Route `/study` (`meta.requiresAuth`).
  - `AudioButton` (props `url: string | null`, `autoplay?: boolean`, `label: string`): nút phát audio. `url` là `null` thì không hiện gì. Phát lỗi thì hiện chữ "Không phát được âm thanh" và không chặn thao tác khác. Trình duyệt chặn tự phát thì bỏ qua, người dùng vẫn bấm nút được.
  - `HomeView`: lời chào, số thẻ đến hạn và số từ mới hôm nay, nút "Bắt đầu học" dẫn tới `/study`. Hàng đợi rỗng: nếu chưa có thẻ nào trong hôm nay thì hiện "Hôm nay không có thẻ nào để học", kèm gợi ý nạp từ bằng importer. Tải lỗi: thông báo và nút "Thử lại". Có lượt chấm chưa gửi: hiện số lượt. Giữ nút "Đăng xuất".
  - `StudyView`:
    - Thanh trên: nút quay về trang chủ, số thẻ còn lại, và dòng "N lượt chấm chưa lưu — Thử lại" khi `syncError`.
    - Mặt trước: từ, IPA, nút audio của từ (tự phát khi thẻ hiện ra), nút "Hiện đáp án".
    - Mặt sau: thêm loại từ, nghĩa tiếng Việt, từng câu ví dụ kèm bản dịch và nút audio; 4 nút chấm "Quên", "Khó", "Được", "Dễ", mỗi nút kèm khoảng thời gian tới lần ôn sau.
    - Phím tắt: Space hoặc Enter để lật thẻ; phím 1–4 để chấm (chỉ khi đã lật).
    - Hết thẻ: "Xong rồi!" kèm số lượt đã chấm và nút về trang chủ.
    - Đang tải và lỗi tải có trạng thái riêng.

- [ ] **Step 1: Viết test router**

```ts
it('/study requires login', async () => {
  // chưa đăng nhập → /login?redirect=/study
})
```

- [ ] **Step 2: Chạy test, xác nhận FAIL** — `pnpm --filter @english-app/web test router` → FAIL
- [ ] **Step 3: Implement route, `AudioButton`, `StudyView`, `HomeView`, CSS**
- [ ] **Step 4: Chạy test, typecheck, lint, build** — `pnpm test && pnpm typecheck && pnpm lint && pnpm build` → PASS
- [ ] **Step 5: Kiểm tra trên trình duyệt** (API + web chạy thật với DB local có 5 từ đã có nghĩa, `newPerDay` đặt 3; viewport 375px)
  - Đăng nhập → trang chủ ghi 0 thẻ đến hạn, 3 từ mới.
  - Vào học: lật thẻ, chấm Dễ → thẻ rời phiên. Chấm Được → thẻ quay lại ở cuối. Chấm Quên → thẻ quay lại sớm.
  - Học hết → "Xong rồi!". Tải lại trang chủ → 0 từ mới.
  - Dừng API giữa phiên, chấm một thẻ → hiện dòng "chưa lưu". Bật lại API, bấm "Thử lại" → dòng đó biến mất và log có trong DB.
- [ ] **Step 6: Cập nhật `README.md`** (biến `AUDIO_BASE_URL`, luồng học)
- [ ] **Step 7: Commit** — `feat(web): add study screen`
