# Phase 4 — Kiểu LISTEN_TYPE và luyện chép chính tả Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Thêm kiểu ôn thứ hai cho mỗi từ (nghe rồi gõ lại từ) và màn hình luyện nghe chép chính tả theo câu, có chấm theo từ và liên kết ngược lại với SRS.

**Architecture:** Quy tắc chấm chính tả (chuẩn hóa, bảng viết tắt, LCS theo từ) nằm trong `packages/shared`: client chấm ngay để hiện kết quả, server chấm lại và lưu. API thêm một service cho chép chính tả, và mở rộng service lượt chấm để mở thẻ `LISTEN_TYPE`. Web tái dùng phiên học hiện có cho thẻ `LISTEN_TYPE`, và có thêm một store riêng cho phiên chép chính tả.

**Tech Stack:** như Phase 3 (Prisma 6, Fastify 5, Zod 4, Vue 3.5 + Pinia, Vitest).

**Spec:** `docs/superpowers/specs/2026-11-06-english-app-mvp-design.md` (Mục 3.1, 3.2, 4, 5, 8, 9, 10 bước 4)

## Global Constraints

- Mọi route API có tiền tố `/api`, cần đăng nhập, lỗi trả `{ error: { code, message } }`; schema nằm trong `packages/shared`.
- Thẻ `LISTEN_TYPE` của một từ chỉ được mở khi thẻ `RECOGNIZE` của từ đó được chấm Good (hoặc Easy) lần đầu.
- `LISTEN_TYPE`: gõ đúng thì gợi ý Good, gõ sai thì gợi ý Again; người dùng vẫn chọn được mức khác.
- Chấm chính tả: không phân biệt hoa thường, bỏ qua dấu câu, gộp khoảng trắng; dạng viết tắt và dạng đầy đủ là như nhau theo một bảng cố định; so khớp LCS theo từ; **điểm = số từ đúng / số từ trong câu đáp án**.
- Nguồn câu: các `Example` thuộc từ đã có ít nhất một lần chấm. Ưu tiên câu chưa luyện, rồi tới câu có điểm lần trước thấp. Mỗi phiên khoảng **10 câu**.
- Nghe lại được, và giảm tốc còn **0.75x**.
- Từ chính bị nghe sai → thẻ `LISTEN_TYPE` của từ đó lùi hạn ôn về hôm nay, **không ghi thêm `ReviewLog`**; chưa có thẻ `LISTEN_TYPE` thì bỏ qua.
- Server chấm lại bằng logic trong `shared`; không tin điểm client gửi lên.
- `DictationAttempt.id` là UUID do client tạo; gửi lại không ghi trùng.
- Audio lỗi thì hiện chữ thay thế, vẫn học tiếp được.

## Quyết định lệch khỏi spec

- **Thẻ `LISTEN_TYPE` mới mở có hạn ôn là đầu ngày hôm sau** (theo múi giờ người dùng), không phải ngay lập tức. Nếu để ngay thì nó hiện ra trong chính phiên vừa xem nghĩa của từ đó, bài nghe gõ mất tác dụng.
- **Thẻ `LISTEN_TYPE` không tính vào hạn mức `newPerDay`**: hạn mức đếm từ mới, không đếm kiểu ôn.
- **Phiên chép chính tả chỉ lấy câu đã có audio.** Chưa đặt `AUDIO_BASE_URL` thì phiên rỗng và màn hình giải thích lý do. Riêng thẻ `LISTEN_TYPE` thiếu audio thì hiện nghĩa tiếng Việt làm đề bài thay thế.
- **"Từ chính" trong câu được tìm bằng gốc từ**: một từ trong câu đáp án được coi là từ chính nếu nó bắt đầu bằng lemma (bỏ `e` hoặc `y` cuối khi lemma dài hơn 3 ký tự). Dạng bất quy tắc (ví dụ _sent_ của _send_) sẽ không được nhận ra, khi đó bỏ qua bước liên kết SRS.
- **Dạng `'d` và `'s` trong bảng viết tắt được quy về một nghĩa** (`'d` = _would_, `'s` = _is_; `let's` = _let us_). Người gõ _I had_ cho _I'd_ sẽ bị tính sai một từ.

## Review Focus

1. **Ô nhập rỗng hoặc chỉ có dấu câu** → điểm 0, mọi từ là "thiếu", không lỗi chia cho 0. Test ở Task 1.
2. **Dấu nháy cong `’`, dấu gạch nối, số** trong câu → chuẩn hóa giống nhau ở cả hai phía. Test ở Task 1.
3. **Chấm Good nhiều lần, hoặc gửi lại cùng lô** → chỉ có một thẻ `LISTEN_TYPE` cho mỗi từ. Test ở Task 2.
4. **Client gửi lần chép cho câu không tồn tại** → bị từ chối riêng, các lần khác vẫn ghi. Test ở Task 3.
5. **Gõ sai từ chính khi thẻ `LISTEN_TYPE` đã quá hạn** → hạn ôn không bị đẩy muộn hơn. Test ở Task 3.
6. **Thẻ `LISTEN_TYPE` không có audio** → hiện nghĩa làm đề bài, vẫn gõ và chấm được. Test ở Task 4.
7. **Mất mạng khi nộp bài chép** → giữ lại, gửi ở lần sau. Test ở Task 5.

---

### Task 1: Logic chấm dùng chung và schema

**Files:**

- Create: `packages/shared/src/dictation.ts`
- Modify: `packages/shared/src/index.ts`
- Test: `packages/shared/src/dictation.test.ts`

**Interfaces:**

- Produces (`@english-app/shared`):
  - `normalizeWords(text: string): string[]` — chữ thường; `’` và `‘` thành `'`; mở dạng viết tắt theo bảng; mọi ký tự không phải chữ, số hoặc `'` thành khoảng trắng; bỏ `'` ở đầu và cuối từ; tách theo khoảng trắng.
  - `diffTokenSchema`, type `DiffToken = { type: 'correct' | 'wrong' | 'missing' | 'extra'; expected: string | null; actual: string | null }`
  - `gradeDictation(expected: string, input: string): { score: number; diff: DiffToken[] }` — LCS theo từ đã chuẩn hóa. Trong mỗi đoạn không khớp, ghép lần lượt từ đáp án với từ đã gõ thành `wrong`; đáp án còn dư là `missing`, từ gõ dư là `extra`. `score` = số `correct` / số từ đáp án (đáp án rỗng → 0).
  - `isTypedCorrect(lemma: string, input: string): boolean` — so sánh sau `normalizeWords`.
  - `keyWordMissed(lemma: string, diff: DiffToken[]): boolean | null` — `null` khi không tìm thấy từ chính trong câu đáp án; `true` khi có từ chính nào không phải `correct`.
  - `dictationItemSchema`: `{ exampleId; wordId; lemma; textEn; textVi; audioUrl: string }`; type `DictationItem`
  - `dictationSessionResponseSchema`: `{ items: DictationItem[] }`
  - `dictationAttemptInputSchema`: `{ id: uuid; exampleId: string (min 1); input: string (max 500); createdAt: ISO datetime }`; type `DictationAttemptInput`
  - `dictationBatchRequestSchema`: `{ attempts: DictationAttemptInput[] (1–100) }`
  - `dictationBatchResponseSchema`: `{ applied: number; duplicates: number; rejected: string[]; results: { id: string; score: number; diff: DiffToken[] }[] }`

- [ ] **Step 1: Viết test** (`dictation.test.ts`)

```ts
it('ignores case, punctuation and extra spaces', () => {
  expect(gradeDictation('Please send the invoice.', '  please   SEND the invoice ').score).toBe(1)
})
it.each([
  ["I don't know.", 'i do not know'],
  ["I'm late.", 'I am late'],
  ['We will not go.', "we won't go"],
  ["It's ready.", 'it is ready'],
  ['They’re here.', "they're here"],
  ["Let's start.", 'let us start'],
  ['He cannot come.', "he can't come"],
])('treats %s and %s as the same', (a, b) => {
  expect(gradeDictation(a, b).score).toBe(1)
})
it('marks a wrong word', () => {
  expect(gradeDictation('send the invoice', 'send the invoices')).toEqual({
    score: 2 / 3,
    diff: [
      { type: 'correct', expected: 'send', actual: 'send' },
      { type: 'correct', expected: 'the', actual: 'the' },
      { type: 'wrong', expected: 'invoice', actual: 'invoices' },
    ],
  })
})
it('marks missing and extra words', () => {
  // 'please send the invoice' vs 'send me the invoice' → missing please, correct send, extra me, correct the, correct invoice; score 3/4
})
it('empty or punctuation-only input scores 0 with every word missing', () => {})
it('empty expected text scores 0', () => {})
it('handles hyphens and numbers', () => {
  expect(normalizeWords('A well-known, 24-hour service!')).toEqual([
    'a',
    'well',
    'known',
    '24',
    'hour',
    'service',
  ])
})
it('isTypedCorrect ignores case and surrounding spaces', () => {})
it('keyWordMissed finds inflected forms', () => {
  // lemma 'invoice': 'the invoices are late' gõ đúng → false; gõ sai 'invoices' → true
  // lemma 'apply', câu 'she applied today' gõ sai 'applied' → true
  // lemma 'send', câu 'he sent it' → null
})
it('schema rejects a 501-character input and a 101-attempt batch', () => {})
```

- [ ] **Step 2: Chạy test, xác nhận FAIL** — `pnpm --filter @english-app/shared test dictation`
- [ ] **Step 3: Implement `dictation.ts`, export qua `index.ts`**
- [ ] **Step 4: Chạy test, typecheck, lint** → PASS
- [ ] **Step 5: Commit** — `feat(shared): add dictation grading`

---

### Task 2: Mở thẻ `LISTEN_TYPE` và đưa vào hàng đợi

**Files:**

- Modify: `apps/api/src/services/reviews.ts`, `apps/api/src/services/studyQueue.ts`
- Test: thêm case vào `apps/api/src/services/reviews.test.ts`, `apps/api/src/services/studyQueue.test.ts`

**Interfaces:**

- Consumes: `startOfNextDay`, `newCardState` (Phase 3).
- Produces:
  - `applyReviewBatch`: sau khi cập nhật một thẻ `RECOGNIZE` mà lô có lượt chấm ≥ 3, tạo thẻ `LISTEN_TYPE` cho từ đó nếu chưa có: `newCardState` với `due = startOfNextDay(now, user.timezone)`, `createdAt = now`. Dùng `createMany({ skipDuplicates: true })`.
  - `getStudyToday`: thẻ đến hạn gồm thẻ `RECOGNIZE` có `state` khác 0, **và mọi thẻ `LISTEN_TYPE`** (kể cả `state` 0), có `due < dayEnd`. `isNew` chỉ đúng với thẻ `RECOGNIZE` có `state` 0. Hạn mức từ mới không đổi.

- [ ] **Step 1: Viết test**

```ts
// reviews.test.ts
it('first Good on a RECOGNIZE card unlocks its LISTEN_TYPE card, due tomorrow', async () => {
  // Good tại t (10:00 giờ VN) → có 1 thẻ LISTEN_TYPE của từ đó: state 0, due 2026-11-12T17:00:00Z
})
it('Easy also unlocks; Again and Hard do not', async () => {})
it('rating Good again, or resending the batch, never creates a second LISTEN_TYPE card', async () => {})
it('reviewing a LISTEN_TYPE card updates it and unlocks nothing', async () => {})

// studyQueue.test.ts
it('an unlocked LISTEN_TYPE card appears from the next day, without using the new budget', async () => {
  // hôm nay: không có thẻ LISTEN_TYPE; ngày mai: có, mode 'LISTEN_TYPE', isNew false; newCount vẫn đủ newPerDay
})
```

- [ ] **Step 2: Chạy test, xác nhận FAIL** — `pnpm --filter @english-app/api test reviews studyQueue`
- [ ] **Step 3: Implement**
- [ ] **Step 4: Chạy test, typecheck, lint** → PASS
- [ ] **Step 5: Commit** — `feat(api): unlock LISTEN_TYPE cards`

---

### Task 3: API chép chính tả

**Files:**

- Modify: `apps/api/prisma/schema.prisma`, `apps/api/src/app.ts`, `apps/api/test/db.ts`
- Create: `apps/api/prisma/migrations/*_dictation/`, `apps/api/src/services/dictation.ts`, `apps/api/src/routes/dictation.ts`
- Test: `apps/api/src/services/dictation.test.ts`, `apps/api/src/routes/dictation.test.ts`

**Interfaces:**

- Consumes: `gradeDictation`, `keyWordMissed` và các schema (Task 1); thẻ `LISTEN_TYPE` (Task 2).
- Produces:
  - Model `DictationAttempt { id String @id; userId; exampleId; input String; score Float; diff Json; createdAt DateTime; @@index([userId, exampleId, createdAt]) }` (quan hệ tới `User` và `Example`)
  - `DICTATION_SESSION_SIZE = 10`
  - `getDictationSession(db, userId, audioBaseUrl: string | null): Promise<{ items: DictationItem[] }>`
  - `applyDictationAttempts(db, userId, attempts: DictationAttemptInput[], now: Date): Promise<DictationBatchResponse>`
  - `GET /api/dictation/session`, `POST /api/dictation/attempts/batch`
  - `resetDb` xóa thêm `DictationAttempt`
- Hành vi `getDictationSession`:
  - `audioBaseUrl` là `null` → `{ items: [] }`.
  - Ứng viên: `Example` có `audioKey`, thuộc từ mà user có ít nhất một thẻ với `reps > 0`.
  - Xếp: câu chưa có lần chép nào trước (theo `tslRank`, rồi `id`); sau đó câu đã chép, theo điểm **lần gần nhất** tăng dần (rồi `tslRank`, `id`). Lấy `DICTATION_SESSION_SIZE` câu đầu.
- Hành vi `applyDictationAttempts` (một transaction):
  - `id` lặp trong lô hoặc đã có trong DB → `duplicates`. `exampleId` không tồn tại → `rejected`.
  - `createdAt` sau `now` → dùng `now`.
  - Chấm bằng `gradeDictation(example.textEn, input)`, lưu `score` và `diff`.
  - `keyWordMissed(lemma, diff) === true` → nếu user có thẻ `LISTEN_TYPE` của từ đó với `due > now` thì đặt `due = now`. Không ghi `ReviewLog`, không đổi trường FSRS nào khác.
  - `results` chứa kết quả của các lần vừa ghi.

- [ ] **Step 1: Viết test**

```ts
// dictation.test.ts (service) — 4 từ đã có nghĩa, mọi câu ví dụ có audioKey; base 'https://cdn.test'
it('no reviewed words → empty session', async () => {})
it('no audio base URL → empty session', async () => {})
it('offers examples only of words that have been reviewed, with audio URLs', async () => {
  // chấm w1 và w2 → 4 câu, theo thứ tự tslRank; audioUrl 'https://cdn.test/<audioKey>'
})
it('skips examples without audio', async () => {})
it('unpractised sentences come first, then lowest last score', async () => {
  // A: chép 2 lần (0.2 rồi 1.0), B: chép 1 lần 0.5, C và D chưa chép → [C, D, B, A]
})
it('caps the session at 10 sentences', async () => {})
it('stores a graded attempt, ignoring any score the client might send', async () => {
  // input sai 1 từ → score và diff khớp gradeDictation; dòng trong DB có cùng giá trị
})
it('resending the same attempt stores nothing new', async () => {})
it('rejects an attempt for an unknown example, stores the rest', async () => {})
it('missing the key word pulls the LISTEN_TYPE card forward to now, without a review log', async () => {
  // thẻ LISTEN_TYPE due ngày mai → sau lần chép sai từ chính: due = now; reps, state không đổi; reviewLog.count không đổi
})
it('getting the key word right leaves the card alone', async () => {})
it('an overdue LISTEN_TYPE card keeps its earlier due date', async () => {})
it('missing the key word without a LISTEN_TYPE card changes nothing', async () => {})

// dictation.test.ts (route)
it('both routes need a session → 401', async () => {})
it('GET /api/dictation/session → 200 matching the schema', async () => {})
it('POST with an invalid body → 400 VALIDATION_ERROR', async () => {})
it('POST → 200 with graded results', async () => {})
```

- [ ] **Step 2: Chạy test, xác nhận FAIL** — `pnpm --filter @english-app/api test dictation`
- [ ] **Step 3: Thêm model, tạo migration** — `pnpm --filter @english-app/api exec prisma migrate dev --name dictation`
- [ ] **Step 4: Implement service, route, đăng ký trong `app.ts`** (`testConfig` nhận `audioBaseUrl` qua `overrides`)
- [ ] **Step 5: Chạy test, typecheck, lint** → PASS
- [ ] **Step 6: Commit** — `feat(api): add dictation session and attempts`

---

### Task 4: Web — thẻ `LISTEN_TYPE` trong phiên học

**Files:**

- Modify: `apps/web/src/stores/study.ts`, `apps/web/src/views/StudyView.vue`, `apps/web/src/components/AudioButton.vue`, `apps/web/src/style.css`
- Test: thêm case vào `apps/web/src/stores/study.test.ts`

**Interfaces:**

- Consumes: `isTypedCorrect` (Task 1).
- Produces:
  - Store `useStudyStore` thêm state `typedCorrect: boolean | null` (đặt lại `null` khi sang thẻ khác), action `checkTyped(input: string)` (chỉ có tác dụng với thẻ `LISTEN_TYPE` chưa lật: đặt `typedCorrect` rồi lật thẻ), getter `suggestedRating: Rating | null` (3 khi gõ đúng, 1 khi gõ sai, `null` trong các trường hợp khác).
  - `AudioButton` thêm prop `rate?: number` (tốc độ phát, mặc định 1) và hiện nhãn chữ khi có slot mặc định.
  - `StudyView` với thẻ `LISTEN_TYPE`:
    - Mặt trước: không hiện từ và IPA. Có nút audio (tự phát), ô nhập "Gõ lại từ bạn nghe" và nút "Kiểm tra" (Enter để nộp). Thẻ không có audio: hiện nghĩa tiếng Việt kèm dòng "Chưa có audio — gõ từ tiếng Anh có nghĩa này".
    - Mặt sau: dòng "Đúng rồi" hoặc "Chưa đúng — bạn gõ: …", rồi nội dung như thẻ `RECOGNIZE`. Nút được gợi ý có viền nổi bật.
    - Phím 1–4 không chấm khi con trỏ đang ở ô nhập.

- [ ] **Step 1: Viết test** (thêm vào `study.test.ts`; `fakeCard(n, now, 'LISTEN_TYPE')`)

```ts
it('checkTyped with the right word reveals the card and suggests Good', async () => {
  // checkTyped(' W1 ') → revealed true, typedCorrect true, suggestedRating 3
})
it('checkTyped with a wrong word suggests Again, and any rating can still be chosen', async () => {})
it('checkTyped does nothing on a RECOGNIZE card', async () => {})
it('typedCorrect resets on the next card', async () => {})
```

- [ ] **Step 2: Chạy test, xác nhận FAIL** — `pnpm --filter @english-app/web test study`
- [ ] **Step 3: Implement store, `AudioButton`, `StudyView`, CSS**
- [ ] **Step 4: Chạy test, typecheck, lint** → PASS
- [ ] **Step 5: Commit** — `feat(web): add listen-and-type cards`

---

### Task 5: Web — luyện chép chính tả

**Files:**

- Create: `apps/web/src/stores/dictation.ts`, `apps/web/src/views/DictationView.vue`, `apps/web/src/components/DictationDiff.vue`
- Modify: `apps/web/src/study/pending.ts` (dùng chung cho hai loại hàng chờ), `apps/web/src/stores/study.ts`, `apps/web/src/router.ts`, `apps/web/src/views/HomeView.vue`, `apps/web/src/style.css`, `README.md`
- Test: `apps/web/src/stores/dictation.test.ts`, thêm case vào `apps/web/src/router.test.ts`

**Interfaces:**

- Consumes: `gradeDictation` và các schema (Task 1); route của Task 3; `AudioButton` có `rate` (Task 4).
- Produces:
  - `pendingQueue<T>(key: string, schema: ZodType<T>): { load(): T[]; save(list: T[]): void }`; `pendingReviews` (khóa cũ `english-app:pending-reviews`) và `pendingAttempts` (khóa `english-app:pending-dictation`). `loadPending` và `savePending` cũ được thay bằng `pendingReviews.load` và `pendingReviews.save`.
  - Store `useDictationStore()`:
    - state: `status: 'idle' | 'loading' | 'ready' | 'error'`, `items: DictationItem[]`, `index: number`, `result: { score: number; diff: DiffToken[] } | null`, `scores: number[]`, `pending: DictationAttemptInput[]`, `syncError: boolean`
    - getters: `current: DictationItem | null`, `finished` (`ready` và `index >= items.length`), `average: number | null` (trung bình `scores`)
    - actions: `load()` (gửi hàng chờ trước rồi gọi `/dictation/session`; đặt lại `index`, `scores`, `result`), `submit(input)` (chỉ khi chưa có `result`: chấm tại chỗ, thêm vào `pending`, lưu, gửi nền), `next()` (chỉ khi đã có `result`), `flush()`
    - `flush` xử lý lỗi giống `useStudyStore`: lỗi 400 thì bỏ lô, lỗi khác thì giữ lại và đặt `syncError`.
  - `DictationDiff` (prop `diff: DiffToken[]`): mỗi từ một nhãn có màu. `correct` xanh; `wrong` đỏ, hiện từ đã gõ bị gạch và từ đúng bên cạnh; `missing` vàng, hiện từ đúng trong ngoặc vuông; `extra` xám, gạch ngang.
  - Route `/dictation` (`meta.requiresAuth`); trang chủ có liên kết "Luyện nghe chép chính tả".
  - `DictationView`: thanh trên (về trang chủ, "Câu i/n"); nút "Nghe" (tự phát khi sang câu mới) và nút bật tắt "Chậm 0.75x"; ô nhập nhiều dòng và nút "Nộp" (Enter để nộp, Shift+Enter xuống dòng). Sau khi nộp: điểm theo phần trăm, `DictationDiff`, câu đáp án, bản dịch, nút "Câu tiếp" (Enter). Hết phiên: điểm trung bình, nút "Luyện tiếp" (tải phiên mới) và nút về trang chủ. Phiên rỗng: "Chưa có câu nào để luyện", kèm giải thích cần học từ trước và cần có audio.

- [ ] **Step 1: Viết test**

```ts
// dictation.test.ts (store) — fetch giả trả 2 câu
it('load fetches the session', async () => {})
it('an empty session is finished, not an error', async () => {})
it('submit grades locally, shows the result and sends the attempt', async () => {
  // submit('please send the invoices') cho 'Please send the invoice.' → result.score 0.75; POST nhận { id, exampleId, input, createdAt }
})
it('submit twice for the same sentence is ignored', async () => {})
it('next moves on and clears the result; the last next finishes with an average', async () => {})
it('a failed send keeps the attempt pending and in localStorage', async () => {})
it('pending attempts from a previous visit are sent on load', async () => {})

// router.test.ts
it('/dictation requires login', async () => {})
```

- [ ] **Step 2: Chạy test, xác nhận FAIL** — `pnpm --filter @english-app/web test`
- [ ] **Step 3: Implement**
- [ ] **Step 4: Chạy test, typecheck, lint, build** — `pnpm test && pnpm typecheck && pnpm lint && pnpm build` → PASS
- [ ] **Step 5: Kiểm tra trên trình duyệt** (viewport 375px; DB local có từ đã có nghĩa và file audio thử phục vụ qua `AUDIO_BASE_URL`)
  - Học 2 từ mới với "Được" hai lần → trong DB có 2 thẻ `LISTEN_TYPE`, hạn ôn ngày mai.
  - Kéo hạn thẻ `LISTEN_TYPE` về hôm nay → vào học: thẻ không hiện từ, gõ đúng thì nút "Được" được gợi ý, gõ sai thì "Quên".
  - Vào chép chính tả: nghe, gõ sai một từ, nộp → thấy màu theo từ, đáp án và bản dịch; đi hết phiên → điểm trung bình; DB có các `DictationAttempt`.
- [ ] **Step 6: Cập nhật `README.md`**
- [ ] **Step 7: Commit** — `feat(web): add dictation practice`
