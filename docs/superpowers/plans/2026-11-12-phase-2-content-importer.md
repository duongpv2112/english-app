# Phase 2 — Content Importer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** CLI `pnpm importer <lệnh>` chạy trên máy người dùng để nạp danh sách TSL vào DB, sinh nội dung thẻ bằng Claude API, sinh audio bằng Azure TTS rồi đưa lên R2, và xuất file rà soát.

**Architecture:** Thêm model `Word` và `Example` vào schema Prisma của `apps/api` (nguồn schema duy nhất). Package mới `tools/content-importer` chứa logic thuần cho từng lệnh; mọi dịch vụ ngoài (Claude, Azure, R2) đi qua một interface hàm nhỏ, nên test dùng bản giả và không cần key. Các adapter thật là lớp mỏng, `cli.ts` chỉ đọc tham số, kiểm tra biến môi trường rồi nối các phần lại.

**Tech Stack:** Node 24 (chạy TS trực tiếp), Prisma 6, Zod 4, `@anthropic-ai/sdk` (`messages.parse` + `zodOutputFormat`), Azure Speech REST qua `fetch`, `@aws-sdk/client-s3` cho R2, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-06-english-app-mvp-design.md` (Mục 4, 6, 8, 9, 10 bước 2)

## Global Constraints

- Mọi lệnh **chạy lại được**: nội dung đã có thì bỏ qua, không ghi trùng.
- Key Claude, key Azure và thông tin R2 chỉ nằm trong `tools/content-importer/.env` trên máy. Không commit, không đưa lên Render, không in ra log.
- Một mục lỗi không làm dừng cả lô.
- `enrich`: khoảng **20 từ mỗi request**, thử lại với backoff, **sau 3 lần** vẫn lỗi thì ghi vào `failed.json`.
- `enrich` chỉ xử lý từ **chưa có nghĩa**; `tts` chỉ xử lý mục **chưa có `audioKey`**.
- Mỗi từ có đúng **2 câu ví dụ** ngữ cảnh công sở/IT, mức A2–B1, kèm bản dịch.
- Giọng câu ví dụ xoay vòng en-US, en-GB, en-AU.
- Test không gọi mạng: Claude, Azure, R2 đều dùng bản giả.
- TypeScript `strict`, ESM, import có đuôi `.ts`, không dùng cú pháp không xóa được (`erasableSyntaxOnly`).
- Package name: `@english-app/content-importer`.

## Quyết định lệch khỏi spec

- `Word.pos`, `Word.ipa`, `Word.meaningVi` là **nullable** (spec ghi `String`). Lý do: `import-tsl` chỉ có `lemma` và `tslRank`, và spec yêu cầu `enrich` "chỉ xử lý từ chưa có nghĩa", tức phải có trạng thái "chưa có nghĩa". Các phase sau chỉ đưa vào hàng đợi học những từ có `meaningVi` khác null.
- Mô hình Claude mặc định là `claude-haiku-5-5` (spec: "model mới nhất có chi phí thấp"), đổi được bằng biến `ANTHROPIC_MODEL`.

## Review Focus

1. **CSV bẩn** (BOM, CRLF, dòng trống, dòng tiêu đề, chữ hoa, từ lặp) → vẫn ra danh sách lemma sạch, đúng thứ hạng. Test ở Task 2.
2. **Claude trả thiếu, thừa hoặc lặp từ** so với lô đã hỏi → coi là lỗi, thử lại, không ghi một phần. Test ở Task 3.
3. **Chạy lại `enrich` sau khi lô trước lỗi giữa chừng** → không sinh trùng `Example`. Test ở Task 3.
4. **Câu có ký tự đặc biệt XML** (`&`, `<`, `'`) → SSML gửi Azure được escape, không hỏng request. Test ở Task 4.
5. **Một mục TTS hoặc upload lỗi** → các mục khác vẫn chạy, mục lỗi giữ `audioKey = null` để lần sau làm lại. Test ở Task 4.
6. **Thiếu biến môi trường** → lệnh dừng ngay, báo đúng tên biến thiếu, chưa đụng tới DB. Test ở Task 5.

---

### Task 1: Model `Word`, `Example` và cổng dùng chung cho importer

**Files:**

- Modify: `apps/api/prisma/schema.prisma`, `apps/api/package.json` (thêm `exports`), `apps/api/src/db.ts`, `apps/api/test/db.ts`, `apps/api/test/globalSetup.ts`
- Create: `apps/api/prisma/migrations/*_content/migration.sql` (Prisma sinh)
- Test: `apps/api/src/content.test.ts`

**Interfaces:**

- Produces:
  - Model `Word { id cuid; lemma String @unique; pos String?; ipa String?; meaningVi String?; tslRank Int @unique; audioKey String?; examples Example[] }`
  - Model `Example { id cuid; wordId; word Word; textEn String; textVi String; audioKey String?; voice String? }` có `@@index([wordId])`
  - `@english-app/api/db` → `createPrisma(databaseUrl)`, và re-export type `PrismaClient`, `Word`, `Example`, `Prisma`
  - `@english-app/api/test/db` → `testDb(): PrismaClient`, `resetDb(db)` (xóa cả `Example`, `Word`, `User`)
  - `apps/api/test/globalSetup.ts` chạy được từ package khác (chạy `prisma migrate deploy` với `cwd` là thư mục `apps/api`)

- [ ] **Step 1: Viết test** (`content.test.ts`)

```ts
it('word starts with only lemma and rank', async () => {
  const w = await db.word.create({ data: { lemma: 'invoice', tslRank: 1 } })
  expect([w.pos, w.ipa, w.meaningVi, w.audioKey]).toEqual([null, null, null, null])
})
it('lemma and tslRank are unique', async () => {
  await db.word.create({ data: { lemma: 'invoice', tslRank: 1 } })
  await expect(db.word.create({ data: { lemma: 'invoice', tslRank: 2 } })).rejects.toThrow()
  await expect(db.word.create({ data: { lemma: 'budget', tslRank: 1 } })).rejects.toThrow()
})
it('resetDb clears words and examples', async () => {
  await db.word.create({
    data: { lemma: 'invoice', tslRank: 1, examples: { create: { textEn: 'a', textVi: 'b' } } },
  })
  await resetDb(db)
  expect([await db.word.count(), await db.example.count()]).toEqual([0, 0])
})
```

- [ ] **Step 2: Chạy test, xác nhận FAIL**
  - Run: `pnpm --filter @english-app/api test content`
  - Expected: FAIL (`db.word` chưa tồn tại)
- [ ] **Step 3: Thêm model, tạo migration**
  - Run: `pnpm --filter @english-app/api exec prisma migrate dev --name content`
  - Expected: thư mục migration `*_content` được tạo
- [ ] **Step 4: Sửa `db.ts`, `test/db.ts`, `globalSetup.ts`, `package.json`**
  - `exports`: `"./db": "./src/db.ts"`, `"./test/db": "./test/db.ts"`.
  - Chuyển khối `declare module 'vitest'` (`ProvidedContext.databaseUrl`) sang `test/db.ts`, để package khác import `test/db` là có luôn kiểu.
- [ ] **Step 5: Chạy test, typecheck**
  - Run: `pnpm --filter @english-app/api test && pnpm typecheck`
  - Expected: toàn bộ PASS
- [ ] **Step 6: Commit** — `feat(api): add Word and Example models`

---

### Task 2: Khung importer và lệnh `import-tsl`

**Files:**

- Create: `tools/content-importer/package.json`, `tsconfig.json`, `vitest.config.ts`, `src/tsl.ts`
- Test: `tools/content-importer/src/tsl.test.ts`

**Interfaces:**

- Consumes: `@english-app/api/db`, `@english-app/api/test/db`, `globalSetup.ts` (Task 1).
- Produces:
  - `parseTslCsv(text: string): string[]` — lemma theo thứ tự xuất hiện. Lấy cột đầu của mỗi dòng; bỏ BOM, bỏ dấu nháy bao quanh, `trim`, chuyển chữ thường; bỏ dòng trống; bỏ dòng đầu nếu ô đầu là `headword`, `word` hoặc `lemma`; từ lặp chỉ giữ lần đầu.
  - `importTsl(db: PrismaClient, lemmas: string[]): Promise<{ created: number; skipped: number }>` — `tslRank` = vị trí trong danh sách (bắt đầu từ 1). Từ đã có (trùng `lemma` hoặc `tslRank`) thì bỏ qua.
- `package.json`: phụ thuộc `@english-app/api` (`workspace:*`) để `pnpm -r test` chạy test importer **sau** test API (hai bên dùng chung một DB test). `vitest.config.ts` dùng `globalSetup: ['../../apps/api/test/globalSetup.ts']`, `fileParallelism: false`.

- [ ] **Step 1: Viết test** (`tsl.test.ts`)

```ts
it('parses a messy CSV', () => {
  const csv = '﻿Headword,Rank\r\nInvoice,1\r\n\r\n"budget",2\r\n invoice ,3\r\ndeadline\r\n'
  expect(parseTslCsv(csv)).toEqual(['invoice', 'budget', 'deadline'])
})
it('keeps the first row when it is not a header', () => {
  expect(parseTslCsv('invoice\nbudget')).toEqual(['invoice', 'budget'])
})
it('imports words with rank by position', async () => {
  expect(await importTsl(db, ['invoice', 'budget'])).toEqual({ created: 2, skipped: 0 })
  const words = await db.word.findMany({ orderBy: { tslRank: 'asc' } })
  expect(words.map((w) => [w.lemma, w.tslRank])).toEqual([
    ['invoice', 1],
    ['budget', 2],
  ])
})
it('skips existing words on rerun and keeps their content', async () => {
  await importTsl(db, ['invoice', 'budget'])
  await db.word.update({ where: { lemma: 'invoice' }, data: { meaningVi: 'hóa đơn' } })
  expect(await importTsl(db, ['invoice', 'budget', 'deadline'])).toEqual({ created: 1, skipped: 2 })
  expect((await db.word.findUniqueOrThrow({ where: { lemma: 'invoice' } })).meaningVi).toBe(
    'hóa đơn',
  )
})
```

- [ ] **Step 2: Chạy test, xác nhận FAIL**
  - Run: `pnpm install && pnpm --filter @english-app/content-importer test`
  - Expected: FAIL (`./tsl.ts` chưa tồn tại)
- [ ] **Step 3: Implement `tsl.ts`** — ghi bằng `createMany({ skipDuplicates: true })`; `created` là `count` trả về.
- [ ] **Step 4: Chạy test, typecheck, lint**
  - Run: `pnpm --filter @english-app/content-importer test && pnpm typecheck && pnpm lint`
  - Expected: 4 test PASS
- [ ] **Step 5: Commit** — `feat(importer): add import-tsl`

---

### Task 3: Lệnh `enrich`

**Files:**

- Create: `tools/content-importer/src/enrich.ts`, `tools/content-importer/src/claude.ts`
- Test: `tools/content-importer/src/enrich.test.ts`

**Interfaces:**

- Consumes: model `Word`, `Example` (Task 1).
- Produces:
  - `wordEnrichmentSchema` (Zod): `{ lemma: string; pos: 'noun' | 'verb' | 'adjective' | 'adverb' | 'preposition' | 'conjunction' | 'pronoun' | 'determiner' | 'other'; ipa: string (min 1); meaningVi: string (min 1); examples: { textEn: string (min 1); textVi: string (min 1) }[] (đúng 2 phần tử) }`; type `WordEnrichment`
  - `enrichmentBatchSchema` = `{ words: WordEnrichment[] }`
  - `type Enricher = (lemmas: string[]) => Promise<WordEnrichment[]>`
  - `enrichWords(db, enricher, opts): Promise<{ enriched: number; failed: number }>` với `opts = { limit?: number; batchSize?: number /* 20 */; maxAttempts?: number /* 3 */; sleep?: (ms: number) => Promise<void>; failedPath: string }`
  - `createClaudeEnricher(client: Anthropic, model: string): Enricher`
- Hành vi `enrichWords`:
  - Lấy các từ `meaningVi = null`, xếp theo `tslRank`, tối đa `limit`; chia lô `batchSize`.
  - Mỗi lô gọi `enricher`. Kết quả hợp lệ khi qua được `wordEnrichmentSchema` **và** tập `lemma` trả về (so sánh chữ thường) đúng bằng tập đã hỏi, không thiếu, không thừa, không lặp.
  - Lỗi hoặc không hợp lệ: chờ `1000 * 2 ** (lần - 1)` ms rồi thử lại, tối đa `maxAttempts` lần gọi.
  - Lô thành công: một transaction cho cả lô — cập nhật `pos`, `ipa`, `meaningVi` và tạo 2 `Example` cho mỗi từ.
  - Lô thất bại: không ghi gì vào DB, chuyển sang lô kế.
  - Cuối lượt ghi `failedPath` dạng JSON `[{ lemma, error }]` nếu có từ lỗi; nếu không có từ lỗi thì xóa file cũ (nếu tồn tại).
- `createClaudeEnricher`: `client.messages.parse` với `output_config.format = zodOutputFormat(enrichmentBatchSchema)`, `max_tokens: 16000`. `stop_reason` khác `end_turn` hoặc `parsed_output` là `null` → ném lỗi nêu `stop_reason`. Prompt hệ thống yêu cầu: IPA giọng Mỹ đặt trong `/…/`, nghĩa tiếng Việt ngắn theo nghĩa thông dụng nhất trong TOEIC, 2 câu ví dụ công sở/IT mức A2–B1 dài 6–14 từ có chứa từ đang học (được chia dạng), bản dịch tự nhiên.

- [ ] **Step 1: Viết test** (`enrich.test.ts`; `fake(lemmas)` trả nội dung hợp lệ cho từng lemma; `sleep` là hàm giả ghi lại số ms)

```ts
it('enriches pending words in rank order, in batches', async () => {
  await importTsl(db, ['a1', 'a2', 'a3'])
  const calls: string[][] = []
  const res = await enrichWords(db, async (l) => (calls.push(l), fake(l)), {
    ...opts,
    batchSize: 2,
  })
  expect(res).toEqual({ enriched: 3, failed: 0 })
  expect(calls).toEqual([['a1', 'a2'], ['a3']])
  const w = await db.word.findUniqueOrThrow({ where: { lemma: 'a1' }, include: { examples: true } })
  expect([w.pos, w.ipa, w.meaningVi]).toEqual(['noun', '/a1/', 'nghĩa a1'])
  expect(w.examples).toHaveLength(2)
})
it('skips words that already have a meaning and respects limit', async () => {
  // a1 đã có meaningVi; limit 1 → chỉ hỏi ['a2']
})
it('retries with backoff, then succeeds', async () => {
  // enricher ném lỗi 2 lần đầu → sleeps = [1000, 2000], enriched 1, không có failed.json
})
it('after 3 failed attempts writes failed.json and continues with next batch', async () => {
  // batchSize 1; 'a1' luôn lỗi 'boom', 'a2' ổn
  expect(res).toEqual({ enriched: 1, failed: 1 })
  expect(JSON.parse(readFileSync(failedPath, 'utf8'))).toEqual([{ lemma: 'a1', error: 'boom' }])
  expect(a1.meaningVi).toBeNull()
})
it.each([
  ['missing word', (l) => fake(l).slice(1)],
  ['extra word', (l) => [...fake(l), ...fake(['zzz'])]],
  ['duplicated word', (l) => [fake(l)[0], fake(l)[0]]],
  ['one example only', (l) => fake(l).map((w) => ({ ...w, examples: w.examples.slice(1) }))],
])('rejects a batch with %s and writes nothing', async (_n, bad) => {
  // 2 từ, enricher luôn trả bad → failed 2, example.count() = 0, mọi meaningVi = null
})
it('rerun after a failed batch does not duplicate examples', async () => {
  // lượt 1: lô lỗi; lượt 2: ổn → mỗi từ đúng 2 example
})
it('matches lemmas case-insensitively', async () => {
  // enricher trả lemma 'A1' cho 'a1' → enriched 1
})
it('removes a stale failed.json when everything succeeds', async () => {})
```

- [ ] **Step 2: Chạy test, xác nhận FAIL**
  - Run: `pnpm --filter @english-app/content-importer test enrich`
  - Expected: FAIL (`./enrich.ts` chưa tồn tại)
- [ ] **Step 3: Implement `enrich.ts`, rồi `claude.ts`**
- [ ] **Step 4: Chạy test, typecheck, lint**
  - Run: `pnpm --filter @english-app/content-importer test && pnpm typecheck && pnpm lint`
  - Expected: PASS
- [ ] **Step 5: Commit** — `feat(importer): add enrich with Claude`

---

### Task 4: Lệnh `tts`

**Files:**

- Create: `tools/content-importer/src/tts.ts`, `src/azure.ts`, `src/r2.ts`
- Test: `tools/content-importer/src/tts.test.ts`, `src/azure.test.ts`

**Interfaces:**

- Consumes: model `Word`, `Example` (Task 1).
- Produces:
  - `type Synthesizer = (text: string, voice: string) => Promise<Uint8Array>`
  - `type Uploader = (key: string, body: Uint8Array) => Promise<void>`
  - `WORD_VOICE = 'en-US-JennyNeural'`; `EXAMPLE_VOICES = ['en-US-GuyNeural', 'en-GB-SoniaNeural', 'en-AU-NatashaNeural']`
  - `generateAudio(db, synth, upload, opts?: { limit?: number }): Promise<{ words: number; examples: number; failed: number }>`
  - `createAzureSynthesizer(cfg: { key: string; region: string; fetch?: typeof fetch }): Synthesizer`
  - `createR2Uploader(cfg: { accountId: string; accessKeyId: string; secretAccessKey: string; bucket: string }): Uploader`
- Hành vi `generateAudio`:
  - Xét các từ đã có nghĩa (`meaningVi` khác null) mà từ đó hoặc một câu ví dụ của nó còn thiếu `audioKey`; xếp theo `tslRank`; `limit` tính theo số từ.
  - Từ: đọc `lemma` bằng `WORD_VOICE`, key `audio/words/<wordId>.mp3`.
  - Câu ví dụ (xếp theo `id` trong mỗi từ, vị trí `i`): giọng `EXAMPLE_VOICES[(tslRank + i) % 3]`, key `audio/examples/<exampleId>.mp3`; lưu cả `voice`.
  - Chỉ ghi `audioKey` sau khi upload xong. Mục nào lỗi thì tăng `failed`, in `console.error` một dòng, rồi làm tiếp mục khác.
- `createAzureSynthesizer`: `POST https://<region>.tts.speech.microsoft.com/cognitiveservices/v1`, header `Ocp-Apim-Subscription-Key`, `Content-Type: application/ssml+xml`, `X-Microsoft-OutputFormat: audio-24khz-48kbitrate-mono-mp3`, `User-Agent: english-app-importer`. Body: `<speak version="1.0" xml:lang="<locale>"><voice name="<voice>">…</voice></speak>`, `locale` là 5 ký tự đầu của tên giọng, nội dung được escape `& < > " '`. Status khác 2xx → ném `Error` chứa status.
- `createR2Uploader`: `S3Client` với `region: 'auto'`, `endpoint: https://<accountId>.r2.cloudflarestorage.com`; `PutObjectCommand` với `ContentType: 'audio/mpeg'`, `CacheControl: 'public, max-age=31536000, immutable'`.

- [ ] **Step 1: Viết test** (`tts.test.ts`; `seedWord(lemma, rank)` tạo từ đã có nghĩa và 2 câu ví dụ; `synth` giả trả `Uint8Array` và ghi lại `[text, voice]`; `upload` giả ghi vào một `Map`)

```ts
it('creates audio for the word and both examples', async () => {
  const w = await seedWord('invoice', 1)
  expect(await generateAudio(db, synth, upload)).toEqual({ words: 1, examples: 2, failed: 0 })
  expect([...uploaded.keys()].sort()).toEqual(
    [`audio/words/${w.id}.mp3`, ...w.examples.map((e) => `audio/examples/${e.id}.mp3`)].sort(),
  )
  expect(synthCalls[0]).toEqual(['invoice', 'en-US-JennyNeural'])
})
it('rotates example voices across words', async () => {
  // rank 1 → [en-GB, en-AU]; rank 2 → [en-AU, en-US]; cột voice được lưu đúng
})
it('second run does nothing', async () => {
  // chạy 2 lần → lần 2 trả { words: 0, examples: 0, failed: 0 }, synth không được gọi thêm
})
it('skips words without a meaning', async () => {})
it('limit counts words', async () => {
  // 2 từ, limit 1 → chỉ từ rank 1 có audio
})
it('a failing item leaves its audioKey null and the rest still run', async () => {
  // upload ném lỗi với key của câu ví dụ đầu → { words: 1, examples: 1, failed: 1 }
  // chạy lại với upload ổn → { words: 0, examples: 1, failed: 0 }
})
```

`azure.test.ts` (truyền `fetch` giả):

```ts
it('posts escaped SSML with the right headers', async () => {
  await synth(`R&D <team> isn't "late"`, 'en-GB-SoniaNeural')
  expect(url).toBe('https://southeastasia.tts.speech.microsoft.com/cognitiveservices/v1')
  expect(headers['Ocp-Apim-Subscription-Key']).toBe('k')
  expect(headers['X-Microsoft-OutputFormat']).toBe('audio-24khz-48kbitrate-mono-mp3')
  expect(body).toBe(
    '<speak version="1.0" xml:lang="en-GB"><voice name="en-GB-SoniaNeural">' +
      'R&amp;D &lt;team&gt; isn&apos;t &quot;late&quot;</voice></speak>',
  )
})
it('returns the audio bytes', async () => {})
it('throws with the status on a non-2xx response', async () => {
  await expect(synth('x', 'en-US-JennyNeural')).rejects.toThrow(/429/)
})
```

- [ ] **Step 2: Chạy test, xác nhận FAIL**
  - Run: `pnpm --filter @english-app/content-importer test tts azure`
  - Expected: FAIL (module chưa tồn tại)
- [ ] **Step 3: Implement `tts.ts`, `azure.ts`, `r2.ts`**
- [ ] **Step 4: Chạy test, typecheck, lint**
  - Run: `pnpm --filter @english-app/content-importer test && pnpm typecheck && pnpm lint`
  - Expected: PASS
- [ ] **Step 5: Commit** — `feat(importer): add tts with Azure and R2`

---

### Task 5: Lệnh `report`, CLI và hướng dẫn

**Files:**

- Create: `tools/content-importer/src/report.ts`, `src/args.ts`, `src/cli.ts`, `tools/content-importer/.env.example`, `docs/content-importer.md`
- Modify: root `package.json` (script `importer`), `.gitignore` (`failed.json`, `report.md`, `report.csv`), `README.md`
- Test: `tools/content-importer/src/report.test.ts`, `src/args.test.ts`

**Interfaces:**

- Consumes: `parseTslCsv`, `importTsl` (Task 2); `enrichWords`, `createClaudeEnricher` (Task 3); `generateAudio`, `createAzureSynthesizer`, `createR2Uploader` (Task 4).
- Produces:
  - `buildReport(db, opts: { format: 'md' | 'csv'; limit?: number }): Promise<string>` — các từ đã có nghĩa, xếp theo `tslRank`, kèm câu ví dụ.
    - `md`: mỗi từ một mục `## <rank>. <lemma> (<pos>) <ipa>`, dòng nghĩa, rồi mỗi câu ví dụ một gạch đầu dòng `- <textEn> — <textVi>`.
    - `csv`: dòng tiêu đề `rank,lemma,pos,ipa,meaningVi,example1En,example1Vi,example2En,example2Vi`; ô có dấu phẩy, nháy kép hoặc xuống dòng thì bọc nháy kép và nhân đôi nháy kép bên trong.
  - `parseArgs(argv: string[]): Command`, với `Command` là một trong: `{ name: 'import-tsl'; file: string }`, `{ name: 'enrich'; limit?: number }`, `{ name: 'tts'; limit?: number }`, `{ name: 'report'; format: 'md' | 'csv'; out: string; limit?: number }`. `out` mặc định `report.<format>`, `format` mặc định `md`. Sai lệnh, thiếu file, `--limit` không phải số nguyên dương, `--format` lạ → ném `UsageError` có message chứa cách dùng.
  - `requireEnv(env: NodeJS.ProcessEnv, names: string[]): Record<string, string>` — ném `Error` liệt kê **tất cả** tên biến còn thiếu hoặc rỗng.
  - Biến cần cho từng lệnh: mọi lệnh cần `DATABASE_URL`; `enrich` thêm `ANTHROPIC_API_KEY`; `tts` thêm `AZURE_SPEECH_KEY`, `AZURE_SPEECH_REGION`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`.
  - `cli.ts`: `parseArgs` → `requireEnv` → mới tạo kết nối DB → chạy lệnh → in một dòng tóm tắt → đóng DB. Lỗi thì in message (không in stack) và thoát mã 1.
  - Root script: `"importer": "node --env-file-if-exists=tools/content-importer/.env tools/content-importer/src/cli.ts"`.

- [ ] **Step 1: Viết test** (`report.test.ts`, `args.test.ts`)

```ts
it('markdown report lists enriched words by rank', async () => {
  expect(await buildReport(db, { format: 'md' })).toBe(
    '## 1. invoice (noun) /ˈɪnvɔɪs/\n\nhóa đơn\n\n' +
      '- Please send the invoice. — Vui lòng gửi hóa đơn.\n' +
      '- The invoice is late. — Hóa đơn bị trễ.\n',
  )
})
it('csv report escapes commas and quotes', async () => {
  // meaningVi = 'hóa đơn, "bill"' → ô thành "hóa đơn, ""bill"""
})
it('excludes words without a meaning and respects limit', async () => {})

it.each([
  [['import-tsl', 'tsl.csv'], { name: 'import-tsl', file: 'tsl.csv' }],
  [['enrich', '--limit', '200'], { name: 'enrich', limit: 200 }],
  [['tts'], { name: 'tts', limit: undefined }],
  [['report'], { name: 'report', format: 'md', out: 'report.md', limit: undefined }],
  [
    ['report', '--format', 'csv'],
    { name: 'report', format: 'csv', out: 'report.csv', limit: undefined },
  ],
])('parses %j', (argv, expected) => expect(parseArgs(argv)).toEqual(expected))
it.each([
  [[]],
  [['nope']],
  [['import-tsl']],
  [['enrich', '--limit', '0']],
  [['enrich', '--limit', 'x']],
  [['report', '--format', 'pdf']],
])('rejects %j with usage', (argv) => expect(() => parseArgs(argv)).toThrow(UsageError))
it('requireEnv names every missing variable', () => {
  expect(() => requireEnv({ A: 'x', B: '' }, ['A', 'B', 'C'])).toThrow(/B, C/)
})
```

- [ ] **Step 2: Chạy test, xác nhận FAIL**
  - Run: `pnpm --filter @english-app/content-importer test report args`
  - Expected: FAIL
- [ ] **Step 3: Implement `report.ts`, `args.ts`, `cli.ts`**
- [ ] **Step 4: Chạy test, typecheck, lint**
  - Run: `pnpm test && pnpm typecheck && pnpm lint`
  - Expected: PASS
- [ ] **Step 5: Chạy thử CLI với DB thật trên máy**
  - Run: `pnpm importer import-tsl <file csv mẫu 3 từ>`, rồi `pnpm importer report`, rồi `pnpm importer enrich` khi không có `ANTHROPIC_API_KEY`
  - Expected: lần lượt in `created 3, skipped 0`; ghi `report.md` rỗng (chưa có từ nào có nghĩa); báo thiếu `ANTHROPIC_API_KEY` và thoát mã 1
- [ ] **Step 6: Viết `.env.example`, `docs/content-importer.md`, cập nhật `README.md`**
  - `docs/content-importer.md` (tiếng Việt): nơi lấy file TSL và ghi nguồn CC BY-SA, cách lấy từng key, thứ tự chạy cho 200 từ đầu (`import-tsl` → `enrich --limit 200` → `report` rồi rà lại → `tts --limit 200`), cách chạy lại khi có `failed.json`, và cách bật truy cập công khai chỉ đọc cho bucket R2.
- [ ] **Step 7: Commit** — `feat(importer): add report, CLI and usage docs`
