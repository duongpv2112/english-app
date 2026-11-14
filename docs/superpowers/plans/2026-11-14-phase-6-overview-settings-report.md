# Phase 6 — Trang tổng quan, cài đặt, nút "Báo sai" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trang chủ trở thành trang tổng quan cho biết hôm nay học gì, streak, đang đi trước hay đi sau mốc 1.200 từ trước 02/2027, độ chính xác chép chính tả theo tuần và trạng thái đồng bộ. Thêm trang cài đặt, và nút "Báo sai" để sửa nội dung thẻ ngay khi học.

**Architecture:** Các phép tính ngày (ngày địa phương, cộng ngày, nửa đêm của một ngày) và hằng số mục tiêu nằm trong `packages/shared`. API có ba nhóm route mới: `/settings`, `/words/:id`, `/stats/overview`. Phần đếm thẻ hôm nay được tách khỏi `getStudyToday` để thống kê không tạo thẻ. Web có store cài đặt dùng chung (tốc độ audio mặc định), form sửa nội dung trên thẻ học, và trang chủ mới đọc từ `/stats/overview`.

**Tech Stack:** như Phase 3–4.

**Spec:** `docs/superpowers/specs/2026-11-06-english-app-mvp-design.md` (Mục 3.1 nút "Báo sai", 3.3, 3.4, 5, 10 bước 6)

## Global Constraints

- Route có tiền tố `/api`, cần đăng nhập, lỗi trả `{ error: { code, message } }`; schema nằm trong `packages/shared`.
- "Đã thuộc" = thẻ `RECOGNIZE` ở trạng thái FSRS `Review` (`state = 2`).
- Mục tiêu: **1.200 từ** trước **2027-02-01**. Tiến độ cần có tính **tuyến tính** từ ngày bắt đầu (`User.startedAt`) tới 2027-02-01.
- Streak: số ngày liên tiếp có học, tính theo múi giờ người dùng.
- Độ chính xác chép chính tả: trung bình điểm theo từng tuần.
- Trạng thái đồng bộ: online hay offline, và số lượt chấm đang chờ gửi.
- Cài đặt: `newPerDay`, múi giờ, tốc độ phát audio mặc định.
- "Báo sai": sửa nghĩa, IPA hoặc câu ví dụ, rồi lưu lên server.

## Quyết định lệch khỏi spec

- **"Có học" trong một ngày** = có ít nhất một lượt chấm thẻ hoặc một bài chép chính tả trong ngày đó. Hôm nay chưa học thì streak vẫn tính tới hôm qua (chưa bị mất cho tới hết ngày).
- **Tuần bắt đầu từ thứ Hai**; hiển thị 8 tuần gần nhất, tuần không có bài chép thì để trống.
- **Thêm chỉ số "cần khoảng N từ/ngày"** để kịp mốc, tính từ số từ còn thiếu và số ngày còn lại.
- **Sửa câu ví dụ (`textEn`) thì xóa audio của câu đó** (`audioKey = null`), để lần chạy `tts` sau tạo lại. Key audio của câu ví dụ đổi sang dạng có mã băm nội dung (`audio/examples/<id>-<hash>.mp3`), vì file audio được cache 1 năm: ghi đè cùng key sẽ khiến trình duyệt vẫn phát bản cũ.
- **Không sửa được chính từ (`lemma`)**: lemma là khóa của danh sách TSL và của audio từ.
- **Tự gửi lượt chấm và bài chép đang chờ khi có mạng trở lại** (trích từ bước 5), vì trang tổng quan đã hiện trạng thái đồng bộ.
- **`newPerDay` từ 0 tới 100; tốc độ audio từ 0.5 tới 1.5.**

## Review Focus

1. **Đổi múi giờ sang giá trị không hợp lệ** → 400, không lưu; múi giờ hợp lệ khác (`America/New_York`) → streak và ranh giới ngày đổi theo. Test ở Task 2 và Task 3.
2. **Người dùng mới chưa học gì** → streak 0, đã thuộc 0, 8 tuần đều trống, không lỗi. Test ở Task 3.
3. **Đã qua 2027-02-01** → tiến độ cần có là 1.200, "cần N từ/ngày" là `null`. Test ở Task 1 và Task 3.
4. **"Báo sai" với câu ví dụ không thuộc từ đó** → 400, không sửa gì. Test ở Task 2.
5. **Số từ mới còn lại trên trang tổng quan khớp với hàng đợi `/study/today`**, và gọi thống kê không tạo thẻ. Test ở Task 3.
6. **Sửa nội dung khi đang học** → các thẻ khác của cùng từ trong phiên cũng hiện nội dung mới. Test ở Task 4.

---

### Task 1: Logic dùng chung

**Files:**

- Modify: `packages/shared/src/day.ts`, `packages/shared/src/index.ts`
- Create: `packages/shared/src/settings.ts`, `packages/shared/src/stats.ts`, `packages/shared/src/words.ts`
- Test: thêm vào `packages/shared/src/day.test.ts`; tạo `settings.test.ts`, `stats.test.ts`, `words.test.ts`

**Interfaces:**

- `day.ts`:
  - `localDate(at: Date, timezone: string): string` — `'YYYY-MM-DD'` của ngày địa phương
  - `addDays(date: string, days: number): string`
  - `startOfLocalDate(date: string, timezone: string): Date` — thời điểm nửa đêm của ngày đó
  - `isValidTimeZone(name: string): boolean`
- `settings.ts`: `settingsSchema` `{ newPerDay: int 0–100; timezone: string (hợp lệ); playbackRate: number 0.5–1.5 }`; `settingsPatchSchema` = mọi trường tùy chọn, ít nhất một trường; types `Settings`, `SettingsPatch`.
- `stats.ts`:
  - `TARGET_WORDS = 1200`, `TARGET_DATE = '2027-02-01'`
  - `requiredKnown(start: Date, target: Date, now: Date): number` — `round(1200 × tỉ lệ thời gian đã qua)`, kẹp trong 0…1200
  - `currentStreak(studyDays: string[], today: string): { current: number; studiedToday: boolean }`
  - `statsOverviewSchema`: `{ today: { dueCount; newCount }; streak: { current; studiedToday }; progress: { known; target; required; targetDate; neededPerDay: number | null }; dictationWeeks: { weekStart: string; average: number | null; attempts: number }[] }`
- `words.ts`: `wordPatchSchema` `{ pos?: string (1–30); ipa?: string (1–100); meaningVi?: string (1–300); examples?: { id: string; textEn?: string (1–300); textVi?: string (1–300) }[] (1–10) }`, các chuỗi được `trim`; ít nhất một trường; type `WordPatch`. `studyWordSchema` = phần `word` của `studyCardSchema`; type `StudyWord`.

- [ ] **Step 1: Viết test**

```ts
// day.test.ts
it('localDate uses the zone', () => {
  expect(localDate(new Date('2026-11-12T20:00:00Z'), 'Asia/Ho_Chi_Minh')).toBe('2026-11-13')
  expect(localDate(new Date('2026-11-12T20:00:00Z'), 'America/New_York')).toBe('2026-11-12')
})
it('addDays crosses months and years', () => {
  expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
  expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
})
it('startOfLocalDate', () => {
  expect(startOfLocalDate('2027-02-01', 'Asia/Ho_Chi_Minh').toISOString()).toBe(
    '2027-01-31T17:00:00.000Z',
  )
})
it('isValidTimeZone', () => {
  expect(['Asia/Ho_Chi_Minh', 'UTC', 'America/New_York'].every(isValidTimeZone)).toBe(true)
  expect(['', 'Mars/Base', 'GMT+99'].some(isValidTimeZone)).toBe(false)
})

// stats.test.ts — start 2026-11-01, target 2027-02-01 (92 ngày)
it('requiredKnown is linear and clamped', () => {
  // now = start → 0; now = giữa (46 ngày) → 600; now = target → 1200; trước start → 0; sau target → 1200
})
it('currentStreak counts back from today, or from yesterday when today is empty', () => {
  expect(currentStreak(['2026-11-12', '2026-11-13', '2026-11-14'], '2026-11-14')).toEqual({
    current: 3,
    studiedToday: true,
  })
  expect(currentStreak(['2026-11-12', '2026-11-13'], '2026-11-14')).toEqual({
    current: 2,
    studiedToday: false,
  })
  expect(currentStreak(['2026-11-10', '2026-11-12'], '2026-11-14')).toEqual({
    current: 0,
    studiedToday: false,
  })
  expect(currentStreak([], '2026-11-14')).toEqual({ current: 0, studiedToday: false })
})

// settings.test.ts
it('accepts valid settings and rejects out-of-range values and unknown zones', () => {})
it('a patch needs at least one field', () => {})

// words.test.ts
it('trims fields and rejects empty ones', () => {})
it('a patch needs at least one field', () => {})
```

- [ ] **Step 2: Chạy test, xác nhận FAIL** — `pnpm --filter @english-app/shared test`
- [ ] **Step 3: Implement**
- [ ] **Step 4: Chạy test, typecheck, lint** → PASS
- [ ] **Step 5: Commit** — `feat(shared): add date helpers, settings, stats and word edit schemas`

---

### Task 2: API cài đặt và sửa nội dung từ

**Files:**

- Create: `apps/api/src/routes/settings.ts`, `apps/api/src/routes/words.ts`, `apps/api/src/services/words.ts`
- Modify: `apps/api/src/app.ts`, `apps/api/src/services/studyQueue.ts` (xuất `toStudyWord`), `tools/content-importer/src/tts.ts`
- Test: `apps/api/src/routes/settings.test.ts`, `apps/api/src/routes/words.test.ts`, sửa `tools/content-importer/src/tts.test.ts`

**Interfaces:**

- `GET /api/settings` → `200 Settings`; `PATCH /api/settings` body `SettingsPatch` → `200 Settings`.
- `updateWord(db, wordId, patch: WordPatch, audioBaseUrl): Promise<StudyWord>` — một transaction. Từ không tồn tại → `AppError('NOT_FOUND', 404)`. Có `id` câu ví dụ không thuộc từ đó → `AppError('VALIDATION_ERROR', 400)`, không sửa gì. `textEn` đổi khác giá trị cũ → `audioKey` và `voice` thành `null`.
- `PATCH /api/words/:id` body `WordPatch` → `200 StudyWord`.
- `toStudyWord(word, audioBaseUrl): StudyWord` tách từ `toStudyCard`.
- `tts.ts`: key câu ví dụ = `audio/examples/<exampleId>-<8 ký tự hex đầu của sha256(textEn)>.mp3`.

- [ ] **Step 1: Viết test**

```ts
// settings.test.ts
it('both routes need a session → 401', async () => {})
it('GET returns the defaults', async () => {
  // { newPerDay: 20, timezone: 'Asia/Ho_Chi_Minh', playbackRate: 1 }
})
it('PATCH updates only the given fields', async () => {})
it.each([
  { newPerDay: 101 },
  { newPerDay: 1.5 },
  { timezone: 'Mars/Base' },
  { playbackRate: 3 },
  {},
])('PATCH %j → 400', async () => {})
it('a new newPerDay is used by /study/today', async () => {})

// words.test.ts
it('needs a session → 401', async () => {})
it('updates meaning, IPA and an example; returns the word', async () => {})
it('changing an example sentence clears its audio; changing only the translation keeps it', async () => {})
it('unknown word → 404 NOT_FOUND', async () => {})
it('an example of another word → 400 and nothing changes', async () => {})
it('invalid body → 400 VALIDATION_ERROR', async () => {})

// tts.test.ts — kỳ vọng key mới; sửa textEn rồi chạy lại → key mới khác key cũ
```

- [ ] **Step 2: Chạy test, xác nhận FAIL**
- [ ] **Step 3: Implement**
- [ ] **Step 4: Chạy test, typecheck, lint** — `pnpm test && pnpm typecheck && pnpm lint` → PASS
- [ ] **Step 5: Commit** — `feat(api): add settings and word correction routes`

---

### Task 3: API thống kê tổng quan

**Files:**

- Create: `apps/api/src/services/stats.ts`, `apps/api/src/routes/stats.ts`
- Modify: `apps/api/src/services/studyQueue.ts` (tách `countToday`), `apps/api/src/app.ts`
- Test: `apps/api/src/services/stats.test.ts`, `apps/api/src/routes/stats.test.ts`

**Interfaces:**

- `countToday(db, userId, now): Promise<{ dueCount: number; newCount: number }>` — không ghi gì; cùng điều kiện với `getStudyToday`.
- `getStatsOverview(db, userId, now): Promise<StatsOverview>`:
  - `today` = `countToday`.
  - `streak`: các ngày địa phương (theo `User.timezone`) có `ReviewLog` của thẻ của user hoặc `DictationAttempt` của user, tính bằng SQL (`AT TIME ZONE`), rồi `currentStreak`.
  - `progress`: `known` = số thẻ `RECOGNIZE` có `state = 2`; `required = requiredKnown(startOfDay(startedAt), startOfLocalDate(TARGET_DATE), now)`; `neededPerDay = ceil((1200 − known) / số ngày còn lại tính cả hôm nay)`, `null` khi đã đủ hoặc đã qua mốc.
  - `dictationWeeks`: 8 tuần gần nhất (cũ trước), mỗi tuần bắt đầu thứ Hai theo ngày địa phương; `average` = trung bình `score`, `null` khi không có bài.
- `GET /api/stats/overview` → `200 StatsOverview`.

- [ ] **Step 1: Viết test**

```ts
// stats.test.ts — now = 2026-11-14T03:00Z (thứ Bảy, 10:00 giờ VN); user.startedAt = 2026-11-01T00:00Z
it('a new user gets zeros and eight empty weeks', async () => {
  // streak { 0, false }, known 0, required > 0, dictationWeeks.length 8, mọi average null; tuần cuối weekStart '2026-11-09'
})
it('today counts match /study/today and create no cards', async () => {})
it('streak counts local days with reviews or dictation', async () => {
  // log lúc 2026-11-12T16:30Z (23:30 ngày 12 VN) và 2026-11-12T17:30Z (00:30 ngày 13 VN), bài chép ngày 14 → current 3, studiedToday true
})
it('streak follows the user time zone', async () => {
  // cùng dữ liệu với múi giờ UTC → kết quả khác
})
it('known counts only RECOGNIZE cards in Review', async () => {})
it('neededPerDay is null once the target date has passed', async () => {})
it('weekly dictation averages', async () => {
  // 2 bài tuần này (0.5, 1.0) và 1 bài tuần trước (0.25) → hai tuần cuối 0.25 và 0.75
})

// stats.test.ts (route)
it('needs a session → 401; returns the schema shape', async () => {})
```

- [ ] **Step 2: Chạy test, xác nhận FAIL**
- [ ] **Step 3: Implement**
- [ ] **Step 4: Chạy test, typecheck, lint** → PASS
- [ ] **Step 5: Commit** — `feat(api): add stats overview`

---

### Task 4: Web — cài đặt và "Báo sai"

**Files:**

- Create: `apps/web/src/stores/settings.ts`, `apps/web/src/views/SettingsView.vue`, `apps/web/src/components/WordEditor.vue`
- Modify: `apps/web/src/router.ts`, `apps/web/src/stores/study.ts`, `apps/web/src/components/AudioButton.vue`, `apps/web/src/views/StudyView.vue`, `apps/web/src/style.css`
- Test: `apps/web/src/stores/settings.test.ts`, thêm vào `apps/web/src/stores/study.test.ts` và `router.test.ts`

**Interfaces:**

- Store `useSettingsStore()`: state `settings: Settings | null`, `status`; actions `load()` (bỏ qua khi đã có), `save(patch)` (ném `ApiError` khi lỗi); getter `playbackRate` (mặc định 1).
- `AudioButton`: không có prop `rate` thì dùng `playbackRate` trong cài đặt.
- Store học: action `updateWord(word: StudyWord)` thay nội dung từ ở mọi thẻ trong hàng đợi có cùng `word.id`.
- `WordEditor` (prop `word`; emit `saved(word)`, `cancel`): các ô loại từ, IPA, nghĩa, và từng câu ví dụ (câu, bản dịch); chỉ gửi trường đã đổi; không đổi gì thì nút Lưu bị tắt; lỗi thì hiện thông báo và giữ nội dung đang sửa.
- `StudyView`: khi đã lật thẻ, có nút "Báo sai" mở `WordEditor` thay cho phần đáp án. Phím tắt không chạy khi con trỏ ở ô nhập, ô văn bản hoặc ô chọn.
- Route `/settings` (`requiresAuth`). `SettingsView`: số từ mới mỗi ngày, múi giờ (danh sách từ `Intl.supportedValuesOf('timeZone')`, nút "Dùng múi giờ của máy này"), tốc độ audio (0.75, 0.9, 1, 1.1, 1.25); nút Lưu; báo "Đã lưu" hoặc lỗi.

- [ ] **Step 1: Viết test**

```ts
// settings.test.ts
it('load fetches settings once', async () => {})
it('save sends only the patch and stores the result', async () => {})
it('playbackRate defaults to 1 before loading', () => {})

// study.test.ts
it('updateWord replaces the word on every queued card of that word', async () => {})

// router.test.ts
it('/settings requires login', async () => {})
```

- [ ] **Step 2: Chạy test, xác nhận FAIL**
- [ ] **Step 3: Implement**
- [ ] **Step 4: Chạy test, typecheck, lint** → PASS
- [ ] **Step 5: Commit** — `feat(web): add settings page and word correction`

---

### Task 5: Web — trang tổng quan

**Files:**

- Create: `apps/web/src/stores/stats.ts`, `apps/web/src/composables/online.ts`
- Modify: `apps/web/src/views/HomeView.vue`, `apps/web/src/App.vue`, `apps/web/src/style.css`, `docs/content-importer.md`, `README.md`
- Test: `apps/web/src/stores/stats.test.ts`, `apps/web/src/composables/online.test.ts`

**Interfaces:**

- Store `useStatsStore()`: state `overview: StatsOverview | null`, `status`; action `load()`.
- `useOnline(): Ref<boolean>` theo `navigator.onLine` và sự kiện `online`/`offline`.
- `App.vue`: khi có mạng trở lại → `flush()` của store học và store chép chính tả.
- `HomeView` (tải: gửi hàng chờ của hai store, rồi tải thống kê):
  - Hôm nay: số thẻ đến hạn, số từ mới, nút "Bắt đầu học" (hoặc thông báo hết thẻ), liên kết luyện chép chính tả.
  - Streak: "N ngày liên tiếp", kèm "Hôm nay chưa học" khi đúng.
  - Tiến độ: "Đã thuộc X / 1.200", thanh tiến độ có vạch "cần có" ở mức `required`; dòng "Đi trước N từ" hoặc "Đi sau N từ"; "Cần khoảng K từ mới mỗi ngày để kịp 01/02/2027".
  - Chép chính tả theo tuần: 8 cột (cũ bên trái), chiều cao theo `average`; tuần trống để trống; có nhãn phần trăm của tuần gần nhất có dữ liệu.
  - Đồng bộ: "Đang online" hoặc "Đang offline", số lượt chấm và bài chép đang chờ, nút "Gửi lại".
  - Thanh trên: email, liên kết "Cài đặt", "Đăng xuất".
- `docs/content-importer.md`: thêm mục "Nạp đủ 1.200 từ".

- [ ] **Step 1: Viết test**

```ts
// stats.test.ts
it('load fetches the overview', async () => {})
it('load failure sets status error', async () => {})

// online.test.ts
it('follows online and offline events', () => {})
```

- [ ] **Step 2: Chạy test, xác nhận FAIL**
- [ ] **Step 3: Implement**
- [ ] **Step 4: Chạy test, typecheck, lint, build** → PASS
- [ ] **Step 5: Kiểm tra trên trình duyệt** (375px): trang tổng quan đủ các phần; đổi `newPerDay` trong cài đặt → số từ mới đổi; "Báo sai" sửa nghĩa → thẻ hiện nghĩa mới và DB có giá trị mới; tắt mạng trình duyệt → hiện "Đang offline".
- [ ] **Step 6: Commit** — `feat(web): add overview dashboard`
