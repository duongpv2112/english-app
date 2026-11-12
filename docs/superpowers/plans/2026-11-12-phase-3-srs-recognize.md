# Phase 3 — Học từ vựng SRS, kiểu RECOGNIZE (bản online) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Học được từ vựng hằng ngày trên web: trang chủ cho biết số thẻ đến hạn và số từ mới còn lại; trang học hiện từng thẻ `RECOGNIZE`, lật thẻ, chấm Again/Hard/Good/Easy; kết quả gửi lên server và FSRS cập nhật lịch ôn.

**Architecture:** Logic FSRS (bọc `ts-fsrs`) và cách tính "ngày" theo múi giờ nằm trong `packages/shared`, client và server dùng chung. API thêm `GET /api/study/today` (tạo thẻ cho từ mới khi cần, trả hàng đợi) và `POST /api/reviews/batch` (không ghi trùng, tính lại khi lượt chấm đến muộn). Web có một module phiên học thuần (dễ test), một bộ gửi lượt chấm, và hai view.

**Tech Stack:** `ts-fsrs` 6, Zod 4, Fastify 5, Prisma 6, Vue 3 + Pinia, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-06-english-app-mvp-design.md` (Mục 3.1, 4, 5, 7 (phần mỗi lần chấm), 9, 10 bước 3)

## Global Constraints

- Chỉ kiểu `RECOGNIZE`. **Không** tạo thẻ `LISTEN_TYPE` trong phase này (xem Rulings ở cuối).
- Chưa có offline, IndexedDB, service worker (bước 5). Lượt chấm chưa gửi được chỉ giữ trong bộ nhớ.
- Chưa có audio (chưa có TTS). Không thêm field audio vào response.
- Chấm 4 mức: `1` Again, `2` Hard, `3` Good, `4` Easy. Nhãn trên nút: **Quên**, **Khó**, **Được**, **Dễ**.
- FSRS: `fsrs({ enable_fuzz: false })` với tham số mặc định của `ts-fsrs` (retention 0.9, learning steps `1m`, `10m`). Không fuzz để client và server tính ra cùng kết quả.
- "Ngày" tính theo `User.timezone` (mặc định `Asia/Ho_Chi_Minh`), từ 00:00 đến 00:00 hôm sau theo giờ địa phương.
- Hàng đợi hôm nay: thẻ đến hạn (`reps > 0`, `due` trước cuối ngày) xếp theo `due` tăng dần, rồi từ mới theo `tslRank`, tối đa `newPerDay` từ mới **mỗi ngày** (tính cả những từ mới đã học trước đó trong cùng ngày).
- Chỉ từ đã có nội dung (`meaningVi IS NOT NULL`) mới được đưa vào hàng đợi.
- Trong phiên: sau khi chấm, nếu `due` mới trước cuối ngày thì thẻ được xếp lại vào hàng đợi theo `due`; ngược lại thẻ rời phiên.
- Lỗi API theo dạng `{ error: { code, message } }`; mọi schema request/response nằm trong `@english-app/shared`.
- `ReviewLog.id` là UUID do client tạo. Server bỏ qua `id` đã có.
- `reviewedAt` ở tương lai (đồng hồ máy lệch) được server lấy bằng thời điểm nhận.

## Review Focus

1. **Ranh giới ngày theo múi giờ:** học 5 từ mới lúc 23:50 rồi mở lại lúc 00:10 (giờ Việt Nam) → hôm sau lại có đủ `newPerDay` từ mới; trong cùng một ngày thì không. Test ở Task 1 (`localDayRange`) và Task 2.
2. **Gửi lại cùng một batch** (mạng chập chờn, client thử lại) → không có log trùng, trạng thái thẻ không đổi ở lần hai. Test ở Task 3.
3. **Lượt chấm cũ đến sau lượt mới hơn** → trạng thái thẻ bằng đúng kết quả khi chấm theo thứ tự thời gian. Test ở Task 3.
4. **Ít từ đã enrich hơn `newPerDay`**, hoặc có từ chưa enrich → chỉ trả các từ có nội dung, không lỗi. Test ở Task 2.
5. **Gửi lượt chấm thất bại** (mất mạng, server lỗi) → lượt chấm không mất, hiện số lượt đang chờ, lần chấm sau gửi lại cả những lượt cũ; 401 thì chuyển về trang đăng nhập. Test ở Task 4.

---

### Task 1: FSRS và ngày theo múi giờ trong `packages/shared`

**Files:**

- Create: `packages/shared/src/srs.ts`, `packages/shared/src/day.ts`
- Modify: `packages/shared/src/index.ts`, `packages/shared/package.json` (thêm `ts-fsrs` `^6.0.0`)
- Test: `packages/shared/src/srs.test.ts`, `packages/shared/src/day.test.ts`

**Interfaces:**

- Produces:
  - `type Rating = 1 | 2 | 3 | 4`; `type CardStateValue = 0 | 1 | 2 | 3` (New, Learning, Review, Relearning)
  - `interface CardState { due: Date; stability: number; difficulty: number; scheduledDays: number; learningSteps: number; reps: number; lapses: number; state: CardStateValue; lastReview: Date | null }`
  - `newCardState(now: Date): CardState`
  - `applyRating(card: CardState, rating: Rating, at: Date): CardState`
  - `replayReviews(reviews: { rating: Rating; reviewedAt: Date }[]): CardState`: sắp xếp theo `reviewedAt`, bắt đầu từ `newCardState(reviews[0].reviewedAt)`, áp từng lượt. Mảng rỗng thì throw.
  - `localDayRange(now: Date, timeZone: string): { start: Date; end: Date }`

`srs.ts` chuyển đổi giữa `CardState` (camelCase, `lastReview: null`) và `Card` của `ts-fsrs` (snake_case, `last_review?: Date`). Một instance `fsrs({ enable_fuzz: false })` dùng chung trong module.

Thuật toán `localDayRange` (không thêm thư viện):

```ts
// offset(t) = (giờ địa phương của t, đọc bằng Intl.DateTimeFormat với timeZone, hourCycle 'h23', ghép thành ms UTC) - t
// 1. Lấy y, m, d địa phương của `now`.
// 2. Với mốc nửa đêm địa phương (y, m, d) và (y, m, d + 1): guess = Date.UTC(y, m - 1, d);
//    t = guess - offset(guess); t = guess - offset(t)   // lần thứ hai sửa cho ngày đổi giờ (DST)
// 3. start = mốc của ngày (y, m, d); end = mốc của ngày kế tiếp.
```

- [ ] **Step 1: Viết test**

```ts
// day.test.ts
it('uses Vietnam local midnight', () => {
  expect(localDayRange(new Date('2026-11-12T18:30:00Z'), 'Asia/Ho_Chi_Minh')).toEqual({
    start: new Date('2026-11-12T17:00:00Z'), end: new Date('2026-11-13T17:00:00Z'),
  })
})
it('23:50 and 00:10 local fall on different days', () => {
  const a = localDayRange(new Date('2026-11-12T16:50:00Z'), 'Asia/Ho_Chi_Minh')
  const b = localDayRange(new Date('2026-11-12T17:10:00Z'), 'Asia/Ho_Chi_Minh')
  expect(a.end).toEqual(b.start)
})
it('handles a 23-hour DST day', () => {
  expect(localDayRange(new Date('2026-03-08T15:00:00Z'), 'America/New_York')).toEqual({
    start: new Date('2026-03-08T05:00:00Z'), end: new Date('2026-03-09T04:00:00Z'),
  })
})

// srs.test.ts
const t0 = new Date('2026-11-12T01:00:00Z')
it('a new card is New and due now', () => {
  expect(newCardState(t0)).toMatchObject({ state: 0, reps: 0, lapses: 0, due: t0, lastReview: null })
})
it('Good on a new card goes to Learning, due in 10 minutes', () => {
  const c = applyRating(newCardState(t0), 3, t0)
  expect(c).toMatchObject({ state: 1, reps: 1, lastReview: t0 })
  expect(c.due).toEqual(new Date('2026-11-12T01:10:00Z'))
})
it('Again on a new card is due in 1 minute', () => {
  expect(applyRating(newCardState(t0), 1, t0).due).toEqual(new Date('2026-11-12T01:01:00Z'))
})
it('Easy on a new card goes straight to Review, due at least a day later', () => {
  const c = applyRating(newCardState(t0), 4, t0)
  expect(c.state).toBe(2)
  expect(c.due.getTime() - t0.getTime()).toBeGreaterThanOrEqual(24 * 3600_000)
})
it('is deterministic', () => {
  expect(applyRating(newCardState(t0), 3, t0)).toEqual(applyRating(newCardState(t0), 3, t0))
})
it('replayReviews sorts by time and equals applying in order', () => {
  const t1 = new Date('2026-11-12T01:10:00Z')
  const inOrder = applyRating(applyRating(newCardState(t0), 3, t0), 3, t1)
  expect(replayReviews([{ rating: 3, reviewedAt: t1 }, { rating: 3, reviewedAt: t0 }])).toEqual(inOrder)
})
it('replayReviews throws on an empty list', () => {
  expect(() => replayReviews([])).toThrow()
})
```

- [ ] **Step 2: Chạy test, thấy fail**

Run: `pnpm install && pnpm --filter @english-app/shared test`
Expected: FAIL (module chưa có).

- [ ] **Step 3: Viết `day.ts`, `srs.ts`, export trong `index.ts`**

- [ ] **Step 4: Chạy test và typecheck, thấy pass**

Run: `pnpm --filter @english-app/shared test && pnpm --filter @english-app/shared typecheck && pnpm --filter @english-app/web typecheck`
Expected: PASS (web typecheck để chắc `ts-fsrs` dùng được trong bundle của web).

- [ ] **Step 5: Commit**

```bash
git add packages/shared pnpm-lock.yaml
git commit -m "feat(shared): add FSRS wrapper and timezone day range"
```

---

### Task 2: `GET /api/study/today`

**Files:**

- Modify: `apps/api/prisma/schema.prisma` (Card: bỏ `elapsedDays`, thêm `learningSteps Int`), migration mới `card_learning_steps`
- Create: `packages/shared/src/study.ts` (schema), `apps/api/src/study/todayQueue.ts`, `apps/api/src/study/cardState.ts`, `apps/api/src/routes/study.ts`, `apps/api/test/fixtures.ts`
- Modify: `packages/shared/src/index.ts`, `apps/api/src/app.ts`
- Test: `apps/api/src/study/todayQueue.test.ts`, `apps/api/src/routes/study.test.ts`

**Interfaces:**

- Consumes: `newCardState`, `localDayRange`, `CardState` (Task 1).
- Produces:
  - `cardStateJsonSchema` (Zod): như `CardState` nhưng `due`, `lastReview` là chuỗi ISO (`z.iso.datetime()`), `lastReview` nullable. `parseCardState(json): CardState` chuyển ngược lại sang `Date`.
  - `studyCardSchema`: `{ cardId: string; isNew: boolean; state: CardStateJson; word: { id: string; lemma: string; pos: string; ipa: string; meaningVi: string; examples: { id: string; textEn: string; textVi: string }[] } }`
  - `studyTodayResponseSchema`: `{ cards: StudyCard[]; dueCount: number; newCount: number; dayEnd: string (ISO) }`
  - `cardToState(card: Card): CardState` và `stateToCardData(s: CardState)` (cho Prisma `data`) trong `apps/api/src/study/cardState.ts`
  - `buildTodayQueue(db: PrismaClient, userId: string, now: Date): Promise<StudyTodayResponse>`
  - Test helpers trong `apps/api/test/fixtures.ts`: `seedWords(db, n, { enriched = true } = {})` (lemma `w1..wn`, rank 1..n, 2 câu ví dụ nếu enriched), `loggedInUser(app, db)` → `{ user, cookies }` (seed user + login, dùng `seedUser`, `login`, `sessionCookie` đã có).

Ghi chú migration: bảng `Card` chưa có dữ liệu thật, nên bỏ cột `elapsedDays` an toàn. `ts-fsrs` 6 không còn `elapsed_days` mà có `learning_steps`.

Thuật toán `buildTodayQueue`:

1. `user` từ `userId`; `{ start, end } = localDayRange(now, user.timezone)`.
2. `introducedToday` = số thẻ `RECOGNIZE` của user có log `reviewedAt >= start` và **không** có log `reviewedAt < start` (`logs: { some: {...}, none: {...} }`).
3. `newCount = max(0, user.newPerDay - introducedToday)`.
4. Từ mới: các `Word` có `meaningVi` khác null và không có thẻ `RECOGNIZE` của user với `reps > 0`, theo `tslRank` tăng dần, lấy `newCount` từ. Tạo thẻ còn thiếu bằng `card.createMany({ data: ..., skipDuplicates: true })` với `newCardState(now)`. Thẻ đã tạo từ lần mở trước mà chưa chấm (`reps = 0`) được dùng lại.
5. Thẻ đến hạn: thẻ `RECOGNIZE` của user, `reps > 0`, `due < end`, theo `due` tăng dần.
6. `cards` = thẻ đến hạn rồi thẻ mới (theo `tslRank`); `dueCount` = số thẻ đến hạn; `newCount` = số thẻ mới thực tế trả về; `dayEnd = end`.

Route: `GET /api/study/today`, `preHandler: app.requireAuth`, trả `buildTodayQueue(app.db, request.userId, new Date())`.

- [ ] **Step 1: Viết test** (`todayQueue.test.ts` gọi thẳng hàm với `now` cố định; `newPerDay` mặc định 20)

```ts
it('returns new enriched words in tslRank order, up to newPerDay', async () => {
  // seedWords 25 → cards có 20 phần tử, isNew true, lemma w1..w20; newCount 20, dueCount 0
})
it('skips words without content and returns fewer when not enough', async () => {
  // seedWords 3 enriched + 2 chưa enrich → 3 thẻ, không lỗi
})
it('reuses unreviewed cards instead of creating new ones', async () => {
  // gọi 2 lần → db.card.count() === 20, cùng tập cardId
})
it('puts due cards first, ordered by due, and excludes cards due after today', async () => {
  // tạo sẵn 3 thẻ reps 1: due hôm qua, due 1 giờ trước, due ngày mai
  // → 2 thẻ đầu là thẻ đến hạn (hôm qua trước), dueCount 2, thẻ ngày mai không có
})
it('counts new words already introduced today against newPerDay, by local day', async () => {
  // newPerDay 20; 5 thẻ có log đầu tiên lúc 23:50 giờ VN (2026-11-12T16:50Z)
  // now = 2026-11-12T16:55Z (cùng ngày) → newCount 15
  // now = 2026-11-12T17:10Z (đã sang ngày mới) → newCount 20
})
it('only returns RECOGNIZE cards', async () => {
  // một thẻ LISTEN_TYPE reps 1 đến hạn → không có trong cards
})
```

`routes/study.test.ts`:

```ts
it('requires login', async () => { /* GET không cookie → 401 UNAUTHENTICATED */ })
it('returns a queue that matches the response schema', async () => {
  // seedWords 2, loggedInUser → 200; studyTodayResponseSchema.parse(res.json()) không throw; cards.length 2
})
```

- [ ] **Step 2: Chạy test, thấy fail**

Run: `pnpm --filter @english-app/api test src/study src/routes/study.test.ts`
Expected: FAIL.

- [ ] **Step 3: Sửa schema, sinh migration**

Run: `pnpm --filter @english-app/api exec prisma migrate dev --name card_learning_steps`

- [ ] **Step 4: Viết `study.ts` (shared), `cardState.ts`, `todayQueue.ts`, route, đăng ký trong `app.ts`, `fixtures.ts`**

- [ ] **Step 5: Chạy test và typecheck, thấy pass**

Run: `pnpm --filter @english-app/api test && pnpm --filter @english-app/api typecheck && pnpm --filter @english-app/shared typecheck`
Expected: PASS, kể cả test cũ.

- [ ] **Step 6: Commit**

```bash
git add apps/api packages/shared
git commit -m "feat(api): add GET /api/study/today"
```

---

### Task 3: `POST /api/reviews/batch`

**Files:**

- Create: `apps/api/src/study/applyReviews.ts`, `apps/api/src/routes/reviews.ts`
- Modify: `packages/shared/src/study.ts`, `apps/api/src/app.ts`
- Test: `apps/api/src/study/applyReviews.test.ts`, `apps/api/src/routes/reviews.test.ts`

**Interfaces:**

- Consumes: `applyRating`, `replayReviews` (Task 1); `cardToState`, `stateToCardData`, fixtures (Task 2).
- Produces:
  - `reviewSchema`: `{ id: z.uuid(); cardId: string (min 1); rating: 1|2|3|4; reviewedAt: z.iso.datetime() }`
  - `reviewBatchRequestSchema`: `{ reviews: Review[] }`, 1 đến 500 phần tử.
  - `reviewBatchResponseSchema`: `{ accepted: number; duplicates: number }`
  - `applyReviews(db: PrismaClient, userId: string, reviews: Review[], now: Date): Promise<{ accepted: number; duplicates: number }>`

Thuật toán `applyReviews`:

1. Bỏ `id` trùng trong chính batch (giữ cái đầu), rồi bỏ `id` đã có trong `ReviewLog`. Số bị bỏ là `duplicates`.
2. `reviewedAt = min(reviewedAt, now)`.
3. Các `cardId` còn lại phải là thẻ của `userId`; thiếu một thẻ nào thì throw `AppError('NOT_FOUND', 404, 'Card not found')` và không ghi gì.
4. Gom theo `cardId`, sắp theo `reviewedAt`. Với mỗi thẻ, trong một `$transaction`:
   - Nếu `lastReview` khác null và lượt sớm nhất **trước** `lastReview`: lấy toàn bộ log cũ của thẻ cộng lượt mới, `replayReviews`.
   - Ngược lại: áp `applyRating` lần lượt từ `cardToState(card)`.
   - `reviewLog.createMany` các lượt mới (`receivedAt` mặc định), `card.update` bằng `stateToCardData`.
5. `accepted` = số log đã ghi.

Route: `POST /api/reviews/batch`, `preHandler: app.requireAuth`, `parse(reviewBatchRequestSchema, request.body)`, trả `applyReviews(app.db, request.userId, body.reviews, new Date())`.

- [ ] **Step 1: Viết test** (`applyReviews.test.ts`; tạo thẻ qua `buildTodayQueue` để có thẻ mới thật)

```ts
it('applies a Good rating and writes a log', async () => {
  // → { accepted: 1, duplicates: 0 }; thẻ state 1, reps 1, due = reviewedAt + 10 phút; 1 ReviewLog
})
it('applies several reviews of one card in time order', async () => {
  // gửi [Good lúc t1, Again lúc t0] (đảo thứ tự) → bằng applyRating(applyRating(new, 1, t0), 3, t1)
})
it('ignores a batch sent twice', async () => {
  // gửi cùng batch 2 lần → lần 2 { accepted: 0, duplicates: 1 }; thẻ không đổi; 1 log
})
it('ignores duplicate ids inside one batch', async () => {
  // 2 phần tử cùng id → { accepted: 1, duplicates: 1 }
})
it('recomputes from all logs when an older review arrives late', async () => {
  // batch A: Good lúc t1 → batch B: Again lúc t0 (t0 < t1)
  // → trạng thái thẻ toEqual replayReviews([{1,t0},{3,t1}]); 2 log
})
it('clamps a reviewedAt in the future to now', async () => {
  // reviewedAt = now + 1 ngày → thẻ lastReview = now; log reviewedAt = now
})
it('rejects a card of another user or unknown card with NOT_FOUND and writes nothing', async () => {
  // cardId 'nope' cùng với một lượt hợp lệ → throw code NOT_FOUND; ReviewLog.count() === 0
})
```

`routes/reviews.test.ts`:

```ts
it('requires login', async () => { /* 401 */ })
it('rejects an invalid body with VALIDATION_ERROR', async () => {
  // rating 5, id không phải uuid, reviews rỗng → 400 VALIDATION_ERROR
})
it('accepts a batch and the card leaves today queue when due tomorrow', async () => {
  // GET today → chấm Easy (4) thẻ đầu → POST 200 { accepted: 1, duplicates: 0 }
  // GET today lần nữa → thẻ đó không còn trong cards
})
```

- [ ] **Step 2: Chạy test, thấy fail**

Run: `pnpm --filter @english-app/api test src/study/applyReviews.test.ts src/routes/reviews.test.ts`
Expected: FAIL.

- [ ] **Step 3: Viết schema, `applyReviews.ts`, route, đăng ký trong `app.ts`**

- [ ] **Step 4: Chạy test và typecheck, thấy pass**

Run: `pnpm --filter @english-app/api test && pnpm --filter @english-app/api typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api packages/shared
git commit -m "feat(api): add POST /api/reviews/batch with dedupe and late-review replay"
```

---

### Task 4: Phiên học và gửi lượt chấm trên web

**Files:**

- Create: `apps/web/src/study/session.ts`, `apps/web/src/study/reviewSync.ts`
- Test: `apps/web/src/study/session.test.ts`, `apps/web/src/study/reviewSync.test.ts`

**Interfaces:**

- Consumes: `applyRating`, `parseCardState`, `CardState`, `Rating`, `StudyCard`, `StudyTodayResponse`, `Review` (Task 1–3); `api`, `ApiError` (`apps/web/src/api/client.ts`).
- Produces:
  - `interface SessionItem { card: StudyCard; state: CardState }`
  - `interface Session { queue: SessionItem[]; dayEnd: Date; reviewed: number }`
  - `createSession(today: StudyTodayResponse): Session`: giữ thứ tự server trả.
  - `currentItem(s: Session): SessionItem | undefined`: phần tử đầu.
  - `rateCurrent(s: Session, rating: Rating, now: Date, newId: () => string): { session: Session; review: Review }`: không sửa `s` (trả bản mới). Tính `applyRating`, tạo `review` `{ id: newId(), cardId, rating, reviewedAt: now.toISOString() }`. Nếu `due` mới `< dayEnd` thì chèn lại vào hàng đợi **sau** mọi phần tử có `due <=` due mới (phần tử mới chưa chấm coi như `due` = `now`); nếu không thì bỏ khỏi hàng đợi. `reviewed + 1`.
  - `class ReviewSync`: `constructor(send: (reviews: Review[]) => Promise<unknown>)`; `pending: Review[]`; `add(review): void`; `flush(): Promise<void>`: gửi toàn bộ `pending` trong một batch; thành công thì xóa những lượt đã gửi (giữ lượt được `add` trong lúc đang gửi); thất bại thì giữ nguyên `pending` và ném lại lỗi. Chỉ một lần gửi chạy tại một thời điểm: gọi `flush` khi đang gửi thì đợi lần đang chạy xong rồi gửi tiếp phần còn lại.
  - `sendReviews(reviews: Review[])`: `api('/reviews/batch', { method: 'POST', body: { reviews } })`.

- [ ] **Step 1: Viết test**

```ts
// session.test.ts (dùng StudyCard giả; dayEnd = now + 12 giờ)
it('starts with the server order', () => { /* currentItem là thẻ đầu tiên */ })
it('Again puts the card back after the other cards due now', () => {
  // [a, b, c] mới; chấm a Again (due +1 phút) → thứ tự [b, c, a]; review.rating 1, cardId a
})
it('Easy removes a new card from today session', () => {
  // [a, b]; a Easy (due >= 1 ngày, sau dayEnd) → [b]; reviewed 1
})
it('a card due later today is placed by due time', () => {
  // [a (Again → +1 phút), b, c]: chấm a Again, rồi b Good (+10 phút) → [c, a, b]
})
it('does not mutate the old session', () => { /* s cũ giữ nguyên queue */ })

// reviewSync.test.ts
it('sends pending reviews and clears them on success', async () => { /* send gọi với [r1, r2]; pending [] */ })
it('keeps reviews when sending fails and resends them next time', async () => {
  // send lần 1 reject → flush reject, pending [r1]; add r2; send lần 2 resolve với [r1, r2]
})
it('keeps a review added while a send is in flight', async () => {
  // send trả promise chưa resolve; add r2 trong lúc đó; resolve → pending [r2]
})
it('does not run two sends at once', async () => { /* 2 flush liên tiếp → send không bao giờ chạy chồng nhau */ })
```

- [ ] **Step 2: Chạy test, thấy fail**

Run: `pnpm --filter @english-app/web test src/study`
Expected: FAIL.

- [ ] **Step 3: Viết `session.ts`, `reviewSync.ts`**

- [ ] **Step 4: Chạy test và typecheck, thấy pass**

Run: `pnpm --filter @english-app/web test && pnpm --filter @english-app/web typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web
git commit -m "feat(web): add study session queue and review sync"
```

---

### Task 5: Giao diện trang chủ và trang học

**Files:**

- Create: `apps/web/src/views/StudyView.vue`, `apps/web/src/stores/study.ts`
- Modify: `apps/web/src/views/HomeView.vue`, `apps/web/src/router.ts`, `apps/web/src/style.css`
- Test: `apps/web/src/stores/study.test.ts`, `apps/web/src/router.test.ts` (thêm case)

**Interfaces:**

- Consumes: `createSession`, `currentItem`, `rateCurrent`, `ReviewSync`, `sendReviews` (Task 4); `studyTodayResponseSchema` (Task 2); `ApiError`.
- Produces: store `useStudyStore` (Pinia) với state `{ today: StudyTodayResponse | null; session: Session | null; flipped: boolean; loading: boolean; error: string | null; pendingCount: number }` và actions `loadToday()`, `start()`, `flip()`, `rate(rating: Rating)`, `retrySync()`. Route `/study` (`requiresAuth`).

Hành vi:

- `loadToday()`: gọi `GET /study/today`, parse bằng schema, lưu `today`. Lỗi thì `error` = "Không tải được bài học hôm nay. Thử lại sau."
- `rate()`: `rateCurrent` (id bằng `crypto.randomUUID()`), `sync.add`, `flipped = false`, rồi `sync.flush()` không chờ. Lỗi `ApiError` 401 thì `router.replace('/login?redirect=/study')`; lỗi khác thì `error` = "Chưa gửi được N lượt chấm. Sẽ thử lại ở lần chấm sau." `pendingCount` luôn bằng `sync.pending.length` sau mỗi lần gửi.
- **HomeView:** dưới lời chào, hiện "Đến hạn: X · Từ mới: Y" (từ `loadToday`) và nút **Học** (disabled khi X + Y = 0, khi đó hiện "Hôm nay đã học xong 🎉"). Nút **Học** đi tới `/study`.
- **StudyView:** gọi `loadToday()` rồi `start()` khi mở. Mặt trước: `lemma` (to), `ipa`, `pos`, nút **Lật thẻ**. Mặt sau thêm `meaningVi` và các câu ví dụ (`textEn`, bên dưới `textVi` chữ nhỏ), cùng 4 nút **Quên / Khó / Được / Dễ**. Phía trên: "Còn N thẻ" và, nếu `pendingCount > 0`, dòng báo chờ gửi kèm nút **Gửi lại**. Hết hàng đợi: "Xong rồi! Bạn đã ôn N thẻ." và nút **Về trang chủ**.
- Phím tắt trên máy tính: `Space` lật thẻ; `1`–`4` chấm khi đã lật.
- Giao diện dùng được trên điện thoại: nút chấm xếp thành lưới 2×2 dưới 480px, mỗi nút cao ít nhất 48px.

- [ ] **Step 1: Viết test**

```ts
// stores/study.test.ts (vi.mock api client; setActivePinia(createPinia()))
it('loadToday stores the parsed queue', async () => { /* today.cards.length đúng */ })
it('rate moves to the next card, unflips and sends the review', async () => {
  // start, flip, rate(3) → flipped false; currentItem khác; send gọi với 1 review hợp lệ (reviewSchema.parse ok)
})
it('shows the pending count when sending fails', async () => {
  // send reject ApiError 500 → pendingCount 1, error chứa '1 lượt chấm'
})
it('redirects to login on 401', async () => { /* ApiError 401 → router.replace gọi với '/login?redirect=/study' */ })

// router.test.ts
it('/study requires login', async () => { /* chưa đăng nhập → chuyển về /login?redirect=/study */ })
```

- [ ] **Step 2: Chạy test, thấy fail**

Run: `pnpm --filter @english-app/web test`
Expected: FAIL ở `study.test.ts` và case mới của router.

- [ ] **Step 3: Viết store, views, route, CSS**

- [ ] **Step 4: Kiểm tra toàn repo**

Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`
Expected: tất cả pass.

- [ ] **Step 5: Thử bằng tay với DB local**

Seed user và vài từ đã enrich (dùng `import-tsl` + chèn nội dung giả bằng `psql`, hoặc `enrich` nếu có key), chạy `pnpm dev`, rồi dùng Playwright chụp màn hình ở 390×844 và 1280×800: trang chủ có số đếm, học hết một vòng (Quên một thẻ để thấy nó quay lại), màn hình "Xong rồi!". Tắt API giữa chừng để thấy dòng báo chờ gửi, bật lại rồi bấm **Gửi lại**.
Expected: đúng như mô tả ở trên; sau khi học xong, mở lại trang chủ thì số thẻ đến hạn và số từ mới giảm tương ứng.

- [ ] **Step 6: Commit**

```bash
git add apps/web
git commit -m "feat(web): add study view and today counts on home"
```

---

## Rulings trong plan

- **Không tạo thẻ `LISTEN_TYPE` ở phase này.** Spec Mục 5 yêu cầu tạo khi `RECOGNIZE` được chấm Good lần đầu, nhưng phase này chưa có giao diện nghe-gõ; tạo sớm sẽ khiến thẻ dồn lại. Phase 4 thêm logic tạo thẻ kèm bước tạo bù cho các từ đã được chấm Good/Easy (dựa vào `ReviewLog`).
- **Card dùng `learningSteps` thay `elapsedDays`** để khớp `ts-fsrs` 6.
- **Thẻ mới được tạo khi mở `/study/today`**, không phải khi chấm, để client có `cardId` thật cho `ReviewLog`.
