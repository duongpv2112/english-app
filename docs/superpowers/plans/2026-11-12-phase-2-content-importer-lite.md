# Phase 2 — Content Importer (bản rút gọn, chưa có TTS) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Có CLI `tools/content-importer` nạp danh sách TSL vào bảng `Word`, dùng Claude API tạo loại từ, IPA, nghĩa tiếng Việt và 2 câu ví dụ, rồi xuất báo cáo markdown để rà lại. Kết quả là khoảng 200 từ có đủ nội dung để làm bước 3 (học SRS). Phần `tts` (Azure + R2) để sau.

**Architecture:** Prisma schema ở `apps/api` được mở rộng với đủ 5 model của spec (một migration). Importer là package `@english-app/content-importer` trong `tools/`, dùng Prisma client qua `@english-app/api/db`. Mỗi lệnh là một hàm nhận `PrismaClient` (và với `enrich` là một `WordEnricher` tiêm vào), nên test được với DB thật và Claude giả. `cli.ts` chỉ đọc tham số, env rồi gọi các hàm này.

**Tech Stack:** Node 24 (chạy `.ts` trực tiếp, type stripping), Prisma 6, Zod 4, `@anthropic-ai/sdk`, `csv-parse`, Vitest 5, embedded Postgres cho test.

**Spec:** `docs/superpowers/specs/2026-11-06-english-app-mvp-design.md` (Mục 4, 6, 9, 10 bước 2)

## Global Constraints

- Phạm vi: `import-tsl`, `enrich`, `report`. **Không** làm `tts`, không đụng Azure hay R2.
- `erasableSyntaxOnly`: không dùng `enum`, `namespace`, parameter properties của TS. Import file nội bộ có đuôi `.ts`.
- Mọi lệnh chạy lại được nhiều lần mà không tạo dữ liệu trùng.
- `import-tsl`: từ (`lemma`) đã có thì bỏ qua. `lemma` được trim và viết thường.
- `enrich`: chỉ xử lý từ có `meaningVi` null, theo `tslRank` tăng dần, lô **20 từ**/request, mỗi lô thử tối đa **3 lần** với backoff (1s, 2s), lỗi cuối cùng ghi vào `failed.json`. Một lô lỗi không làm dừng các lô khác.
- Câu ví dụ: **2 câu**, ngữ cảnh công sở/IT, mức **A2–B1**, kèm bản dịch tiếng Việt. Chấp nhận 1–2 câu khi validate (spec Mục 3.1: "1–2 câu ví dụ").
- Model mặc định `claude-opus-5-5`, đổi được qua env `ENRICH_MODEL`. Bật server-side refusal fallback (`betas: ['server-side-fallback-2026-07-01']`, `fallbacks: 'default'`).
- `ANTHROPIC_API_KEY` và `DATABASE_URL` chỉ nằm trong `tools/content-importer/.env` (không commit). Chỉ commit `.env.example`.
- Kết quả từ Claude luôn được kiểm tra bằng Zod trước khi ghi DB.

## Review Focus

1. **CSV có BOM, xuống dòng CRLF, dòng trống, chữ hoa hoặc khoảng trắng thừa** (`﻿Word\r\n Invoice \r\n\r\n`) → nạp đúng `invoice`, không lỗi. Test ở Task 2.
2. **Chạy lại `import-tsl` với cùng file** → báo 0 từ mới, không lỗi unique. Test ở Task 2.
3. **Claude trả thiếu từ, thừa từ, hoặc `lemma` khác hoa thường** → khớp không phân biệt hoa thường; từ thiếu được thử lại trong lần sau; từ thừa bị bỏ qua. Test ở Task 3.
4. **`enrich` bị ngắt giữa chừng rồi chạy lại** → các từ đã lưu giữ nguyên, không có từ nào bị thêm câu ví dụ lần hai. Test ở Task 3.
5. **Thiếu `DATABASE_URL` hoặc `ANTHROPIC_API_KEY`** → CLI dừng ngay với thông báo nêu tên biến, trước khi gọi DB hay API. Test ở Task 5.

---

### Task 1: Mở rộng Prisma schema và cho phép package khác dùng DB

**Files:**

- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/<timestamp>_content_models/migration.sql` (sinh bằng `prisma migrate dev --name content_models`)
- Modify: `apps/api/src/db.ts`, `apps/api/package.json`, `apps/api/test/db.ts`, `apps/api/test/globalSetup.ts`, `package.json` (root)
- Test: `apps/api/src/schema.test.ts`

**Interfaces:**

- Produces:
  - Model `Word`, `Example`, `Card`, `ReviewLog`, `DictationAttempt`, enum `CardMode` đúng như spec Mục 4, **trừ** các điểm khác dưới đây.
  - `@english-app/api/db` export `createPrisma(databaseUrl: string): PrismaClient` và `export type { PrismaClient, Word, Example } from '@prisma/client'`.
  - `resetDb(db)` truncate cả `User` và `Word` (CASCADE).

Khác với spec (ghi lý do trong commit message):

- `Word.pos`, `Word.ipa`, `Word.meaningVi` là **nullable**, vì `import-tsl` chỉ có `lemma` và `tslRank`; `enrich` điền sau. "Từ chưa có nghĩa" = `meaningVi IS NULL`.
- Thêm `Word.enrichedAt DateTime?` để `report` lọc nội dung mới tạo.
- Thêm `@@index([wordId])` cho `Example`.
- `User` thêm quan hệ `cards Card[]`, `dictations DictationAttempt[]`.

- [ ] **Step 1: Viết test `apps/api/src/schema.test.ts`**

```ts
it('creates a word with only lemma and rank', async () => {
  const w = await db.word.create({ data: { lemma: 'invoice', tslRank: 1 } })
  expect(w.meaningVi).toBeNull()
  expect(w.enrichedAt).toBeNull()
})
it('rejects duplicate lemma and duplicate tslRank', async () => {
  await db.word.create({ data: { lemma: 'invoice', tslRank: 1 } })
  await expect(db.word.create({ data: { lemma: 'invoice', tslRank: 2 } })).rejects.toThrow()
  await expect(db.word.create({ data: { lemma: 'budget', tslRank: 1 } })).rejects.toThrow()
})
it('allows one card per (user, word, mode)', async () => {
  // tạo user + word, tạo Card RECOGNIZE, tạo lại RECOGNIZE → throw, tạo LISTEN_TYPE → ok
})
```

`beforeEach` gọi `resetDb(db)`.

- [ ] **Step 2: Chạy test, thấy fail**

Run: `pnpm --filter @english-app/api test src/schema.test.ts`
Expected: FAIL (`db.word` undefined).

- [ ] **Step 3: Sửa `schema.prisma`, sinh migration**

Run: `pnpm db:start` (terminal khác), rồi `pnpm --filter @english-app/api exec prisma migrate dev --name content_models`.

- [ ] **Step 4: Cho package khác dùng DB và test DB**
  - `apps/api/package.json`: thêm `"exports": { "./db": "./src/db.ts" }`.
  - `db.ts`: thêm type re-export ở trên.
  - `test/db.ts`: `resetDb` dùng `TRUNCATE TABLE "User", "Word" CASCADE`.
  - `test/globalSetup.ts`: lệnh `prisma migrate deploy` chạy với `cwd` là thư mục `apps/api` (`fileURLToPath(new URL('..', import.meta.url))`), để importer dùng lại được file setup này.
  - Root `package.json`: `"test": "pnpm -r --workspace-concurrency=1 test"`. Lý do: api và importer dùng chung database test (CI) và cùng cổng embedded Postgres 54330, nên không được chạy song song.

- [ ] **Step 5: Chạy toàn bộ test api, thấy pass**

Run: `pnpm --filter @english-app/api test && pnpm --filter @english-app/api typecheck`
Expected: PASS, kể cả test auth cũ.

- [ ] **Step 6: Commit**

```bash
git add apps/api package.json
git commit -m "feat(api): add Word, Example, Card, ReviewLog, DictationAttempt models"
```

---

### Task 2: Package importer và lệnh `import-tsl`

**Files:**

- Create: `tools/content-importer/package.json`, `tsconfig.json`, `vitest.config.ts`, `.env.example`, `test/db.ts`
- Create: `tools/content-importer/src/importTsl.ts`
- Test: `tools/content-importer/src/importTsl.test.ts`

**Interfaces:**

- Consumes: `createPrisma`, `PrismaClient` từ `@english-app/api/db`; `testDb`, `resetDb` từ `apps/api/test/db.ts`.
- Produces:
  - `parseTslCsv(text: string): { lemma: string; rank: number }[]`
  - `importTsl(db: PrismaClient, rows: { lemma: string; rank: number }[]): Promise<{ inserted: number; skipped: number }>`

Package setup:

- Tên `@english-app/content-importer`, private, `"type": "module"`. Dependencies: `@english-app/api: workspace:*`, `@anthropic-ai/sdk`, `csv-parse`, `zod` (cùng `^4.6.7`). Dev: `vitest 5.1.0`.
- Scripts: `"cli": "node --env-file-if-exists=.env src/cli.ts"`, `"test": "vitest run"`, `"typecheck": "tsc -p tsconfig.json"`.
- `vitest.config.ts`: `include: ['src/**/*.test.ts']`, `globalSetup: ['../../apps/api/test/globalSetup.ts']`, `fileParallelism: false`.
- `tsconfig.json`: extends base, `include: ["src", "test", "vitest.config.ts", "../../apps/api/test/globalSetup.ts"]` (để thấy khai báo `ProvidedContext.databaseUrl`).
- `test/db.ts`: `export { testDb, resetDb } from '../../../apps/api/test/db.ts'`.
- `.env.example`: `DATABASE_URL=postgres://english:english@localhost:5432/english_app`, `ANTHROPIC_API_KEY=`, `# ENRICH_MODEL=claude-opus-5-5`.

Quy tắc `parseTslCsv`:

- Bỏ BOM. Dòng đầu là header. Cột từ là cột có tên `word` hoặc `lemma` (không phân biệt hoa thường); không có thì throw `Error` nêu rõ cần cột `word` hoặc `lemma`.
- `rank` = giá trị cột `rank` nếu có; nếu không có cột đó thì là thứ tự dòng dữ liệu (bắt đầu từ 1). File TSL vốn đã xếp theo tần suất.
- Lemma trim và viết thường. Bỏ dòng có lemma rỗng. Lemma trùng trong file: giữ dòng đầu.
- Parse bằng `csv-parse/sync` (`bom: true`, `skip_empty_lines: true`, `relax_column_count: true`).

`importTsl` dùng `db.word.createMany({ data, skipDuplicates: true })`; `inserted` = `count`, `skipped` = `rows.length - count`. Lemma hoặc rank đã có đều bị bỏ qua.

- [ ] **Step 1: Viết test**

```ts
describe('parseTslCsv', () => {
  it('uses row order as rank when there is no rank column', () => {
    expect(parseTslCsv('Word\ninvoice\nbudget\n')).toEqual([
      { lemma: 'invoice', rank: 1 }, { lemma: 'budget', rank: 2 },
    ])
  })
  it('handles BOM, CRLF, blank lines, case and spaces', () => {
    expect(parseTslCsv('﻿Word\r\n Invoice \r\n\r\nBUDGET\r\n')).toEqual([
      { lemma: 'invoice', rank: 1 }, { lemma: 'budget', rank: 2 },
    ])
  })
  it('reads the rank column when present', () => {
    expect(parseTslCsv('lemma,rank\ninvoice,7\n')).toEqual([{ lemma: 'invoice', rank: 7 }])
  })
  it('keeps the first of duplicate lemmas', () => {
    expect(parseTslCsv('word\ninvoice\nInvoice\n')).toEqual([{ lemma: 'invoice', rank: 1 }])
  })
  it('throws when there is no word or lemma column', () => {
    expect(() => parseTslCsv('foo\nbar\n')).toThrow(/word.*lemma|lemma.*word/i)
  })
})
describe('importTsl', () => {
  it('inserts new words and skips them on a second run', async () => {
    const rows = [{ lemma: 'invoice', rank: 1 }, { lemma: 'budget', rank: 2 }]
    expect(await importTsl(db, rows)).toEqual({ inserted: 2, skipped: 0 })
    expect(await importTsl(db, rows)).toEqual({ inserted: 0, skipped: 2 })
    expect(await db.word.count()).toBe(2)
  })
})
```

- [ ] **Step 2: `pnpm install`, chạy test, thấy fail**

Run: `pnpm install && pnpm --filter @english-app/content-importer test`
Expected: FAIL (module `./importTsl.ts` chưa có).

- [ ] **Step 3: Viết `importTsl.ts`**

- [ ] **Step 4: Chạy test và typecheck, thấy pass**

Run: `pnpm --filter @english-app/content-importer test && pnpm --filter @english-app/content-importer typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tools/content-importer pnpm-lock.yaml
git commit -m "feat(importer): add content-importer package with import-tsl"
```

---

### Task 3: Lệnh `enrich` (với enricher giả)

**Files:**

- Create: `tools/content-importer/src/enrichSchema.ts`, `tools/content-importer/src/enrich.ts`
- Test: `tools/content-importer/src/enrich.test.ts`

**Interfaces:**

- Consumes: `PrismaClient` từ Task 1.
- Produces:
  - `enrichOutputSchema` (Zod, dùng làm JSON schema gửi Claude): `{ words: { lemma: string; pos: string; ipa: string; meaningVi: string; examples: { textEn: string; textVi: string }[] }[] }`
  - `enrichedWordSchema` (Zod, kiểm tra chặt từng từ): như một phần tử của `words`, nhưng mọi chuỗi `trim().min(1)` và `examples` có 1–2 phần tử.
  - `type EnrichedWord = z.infer<typeof enrichedWordSchema>`
  - `type WordEnricher = (lemmas: string[]) => Promise<unknown>` (trả về JSON thô; `enrich` tự validate)
  - `enrich(db: PrismaClient, enricher: WordEnricher, opts: { limit?: number; batchSize?: number; maxAttempts?: number; sleep?: (ms: number) => Promise<void> }): Promise<{ enriched: number; failed: { lemma: string; error: string }[] }>`
  - Mặc định: `batchSize` 20, `maxAttempts` 3, `sleep` là `setTimeout` thật. `limit` không truyền = tất cả từ chưa có nghĩa.

Thuật toán `enrich`:

1. Lấy các từ `meaningVi: null`, `orderBy: { tslRank: 'asc' }`, `take: limit`. Chia lô theo `batchSize`.
2. Với mỗi lô, giữ danh sách `pending` (lemma chưa xong). Lặp tối đa `maxAttempts` lần khi `pending` còn phần tử:
   - Gọi `enricher(pending)`. Nếu throw, hoặc kết quả không qua `enrichOutputSchema`, thì ghi nhận lỗi cho cả `pending`.
   - Nếu qua: với từng phần tử, khớp `lemma` không phân biệt hoa thường với `pending`. Phần tử không khớp thì bỏ qua. Phần tử khớp nhưng không qua `enrichedWordSchema` thì giữ lại trong `pending` với lỗi Zod. Phần tử hợp lệ thì lưu (bước 3) và bỏ khỏi `pending`. Lemma không có trong kết quả thì lỗi là `'missing from response'`.
   - Trước lần thử thứ 2 và 3: `await sleep(1000 * 2 ** (attempt - 1))` (1000, 2000).
3. Lưu một từ trong một `$transaction`: `word.updateMany({ where: { id, meaningVi: null }, data: { pos, ipa, meaningVi, enrichedAt: new Date() } })`. Chỉ khi `count === 1` mới `example.createMany` các câu ví dụ. Như vậy chạy lại hoặc chạy song song không bao giờ thêm câu ví dụ lần hai.
4. Hết số lần thử mà `pending` còn từ thì đưa vào `failed` kèm lỗi cuối cùng. Sang lô tiếp theo.

Việc ghi `failed.json` để cho CLI (Task 5); `enrich` chỉ trả về danh sách.

- [ ] **Step 1: Viết test** (enricher giả trả JSON cố định; `sleep` giả ghi lại các giá trị ms)

```ts
const good = (lemma: string) => ({
  lemma, pos: 'noun', ipa: '/x/', meaningVi: 'nghĩa',
  examples: [{ textEn: 'A.', textVi: 'B.' }, { textEn: 'C.', textVi: 'D.' }],
})

it('enriches words in tslRank order, respecting limit and batch size', async () => {
  // seed 5 từ rank 1..5; enricher ghi lại các lô nhận được
  // enrich(db, fake, { limit: 3, batchSize: 2 }) → các lô [[r1, r2], [r3]], enriched 3
  // từ rank 4, 5 vẫn meaningVi null; mỗi từ đã xong có 2 Example và enrichedAt khác null
})
it('matches lemmas case-insensitively and ignores extra words', async () => {
  // enricher trả { words: [good('INVOICE'), good('unrequested')] } cho ['invoice']
  // → invoice được lưu; không có Word 'unrequested'
})
it('retries only missing or invalid words with 1s then 2s backoff', async () => {
  // ['invoice','budget']; lần 1 chỉ trả invoice; lần 2 trả budget với meaningVi ''; lần 3 trả budget hợp lệ
  // → enriched 2, failed [], lô thứ hai nhận ['budget'], sleep được gọi với [1000, 2000]
})
it('reports words still failing after 3 attempts and continues with the next batch', async () => {
  // batchSize 1; enricher throw cho 'invoice', trả hợp lệ cho 'budget'
  // → failed [{ lemma: 'invoice', error: <message của lỗi throw> }], budget đã được lưu, enricher được gọi 3 lần cho invoice
})
it('never adds examples twice when run again', async () => {
  // chạy enrich 2 lần với cùng fake → lần 2 enriched 0, mỗi từ vẫn đúng 2 Example
})
it('rejects a word with zero or three examples', () => {
  // enrichedWordSchema.safeParse(...) với examples [] và 3 phần tử → success false
})
```

- [ ] **Step 2: Chạy test, thấy fail**

Run: `pnpm --filter @english-app/content-importer test src/enrich.test.ts`
Expected: FAIL.

- [ ] **Step 3: Viết `enrichSchema.ts` và `enrich.ts`**

- [ ] **Step 4: Chạy test và typecheck, thấy pass**

Run: `pnpm --filter @english-app/content-importer test && pnpm --filter @english-app/content-importer typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tools/content-importer
git commit -m "feat(importer): add enrich with validation, retry and idempotent saves"
```

---

### Task 4: Enricher gọi Claude API

**Files:**

- Create: `tools/content-importer/src/claudeEnricher.ts`
- Test: `tools/content-importer/src/claudeEnricher.test.ts`

**Interfaces:**

- Consumes: `enrichOutputSchema`, `WordEnricher` từ Task 3.
- Produces:
  - `ENRICH_SYSTEM_PROMPT: string`
  - `buildEnrichRequest(lemmas: string[], model: string)`: object tham số cho `client.beta.messages.create` (không stream).
  - `parseEnrichResponse(message: { stop_reason: string | null; content: { type: string; text?: string }[] }): unknown`: trả JSON đã parse; throw `Error` khi `stop_reason` là `refusal` hoặc `max_tokens`, hoặc không có block `text`, hoặc text không phải JSON.
  - `createClaudeEnricher(client: Anthropic, model: string): WordEnricher`

Tham số request:

- `model`, `max_tokens: 16000`, `betas: ['server-side-fallback-2026-07-01']`, `fallbacks: 'default'`.
- `output_config: { format: { type: 'json_schema', schema: z.toJSONSchema(enrichOutputSchema) } }`. Không dùng helper `zodOutputFormat`; cách này không phụ thuộc helper có hỗ trợ Zod 4 hay không.
- `system: ENRICH_SYSTEM_PROMPT`. Một message `user` liệt kê các lemma, mỗi lemma một dòng.
- Không gửi `thinking`, `temperature`, `tool_choice`. Effort để mặc định.

`ENRICH_SYSTEM_PROMPT` phải nêu: người học tiếng Việt trình độ A2, đang học từ vựng TOEIC, làm IT; với mỗi từ trả về `lemma` (giữ nguyên như đầu vào), `pos` là một trong `noun, verb, adjective, adverb, preposition, conjunction, pronoun, determiner, number, other` (nghĩa hay gặp nhất trong TOEIC); `ipa` kiểu Mỹ, đặt trong `/.../`; `meaningVi` ngắn gọn, tối đa 3 nghĩa cách nhau bằng `; `; đúng 2 câu ví dụ ngữ cảnh công sở/IT, mức A2–B1, dưới 15 từ, có chứa từ đó (được chia dạng), kèm `textVi` dịch tự nhiên.

- [ ] **Step 1: Viết test** (không gọi mạng)

```ts
it('builds a structured-output request with fallback enabled', () => {
  const req = buildEnrichRequest(['invoice', 'budget'], 'claude-opus-5-5')
  expect(req.model).toBe('claude-opus-5-5')
  expect(req.betas).toEqual(['server-side-fallback-2026-07-01'])
  expect(req.fallbacks).toBe('default')
  expect(req.output_config.format.type).toBe('json_schema')
  expect(req.output_config.format.schema).toMatchObject({ type: 'object', additionalProperties: false })
  expect(JSON.stringify(req.messages)).toContain('invoice\nbudget')
})
it('parses the JSON text block', () => {
  expect(parseEnrichResponse({ stop_reason: 'end_turn', content: [{ type: 'text', text: '{"words":[]}' }] }))
    .toEqual({ words: [] })
})
it.each(['refusal', 'max_tokens'])('throws on stop_reason %s', (stop_reason) => {
  expect(() => parseEnrichResponse({ stop_reason, content: [{ type: 'text', text: '{}' }] })).toThrow(stop_reason)
})
it('throws on non-JSON text', () => {
  expect(() => parseEnrichResponse({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'oops' }] })).toThrow()
})
it('createClaudeEnricher sends the request and returns parsed JSON', async () => {
  // client giả: { beta: { messages: { create: vi.fn().mockResolvedValue({ stop_reason: 'end_turn', content: [...] }) } } }
  // ép kiểu `as unknown as Anthropic`; kiểm tra create được gọi với buildEnrichRequest(...) và kết quả đúng
})
```

Nếu `z.toJSONSchema` không sinh `additionalProperties: false` cho object lồng nhau, dùng `z.strictObject` trong `enrichOutputSchema` (Task 3) rồi chạy lại test của cả hai task.

- [ ] **Step 2: Chạy test, thấy fail**

Run: `pnpm --filter @english-app/content-importer test src/claudeEnricher.test.ts`
Expected: FAIL.

- [ ] **Step 3: Viết `claudeEnricher.ts`**

Nếu kiểu TS của SDK chưa có `fallbacks` hoặc `output_config`, kiểm tra phiên bản SDK đã cài, nâng lên bản mới nhất trước; chỉ khi bản mới nhất vẫn thiếu mới ép kiểu tham số đó.

- [ ] **Step 4: Chạy test và typecheck, thấy pass**

Run: `pnpm --filter @english-app/content-importer test && pnpm --filter @english-app/content-importer typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tools/content-importer pnpm-lock.yaml
git commit -m "feat(importer): add Claude enricher with structured output"
```

---

### Task 5: Lệnh `report`, CLI và hướng dẫn

**Files:**

- Create: `tools/content-importer/src/report.ts`, `tools/content-importer/src/cli.ts`, `tools/content-importer/README.md`
- Test: `tools/content-importer/src/report.test.ts`, `tools/content-importer/src/cli.test.ts`
- Modify: `README.md` (root, thêm 1 dòng trỏ tới README của importer)

**Interfaces:**

- Consumes: `parseTslCsv`, `importTsl` (Task 2); `enrich` (Task 3); `createClaudeEnricher` (Task 4); `createPrisma` (Task 1).
- Produces:
  - `buildReport(db: PrismaClient, opts: { since?: Date }): Promise<string>`: markdown.
  - `requireEnv(env: Record<string, string | undefined>, names: string[]): Record<string, string>`: throw `Error` liệt kê **mọi** biến thiếu hoặc rỗng, ví dụ `Missing environment variables: DATABASE_URL, ANTHROPIC_API_KEY`.
  - `main(argv: string[], env: Record<string, string | undefined>): Promise<number>`: mã thoát.

`buildReport`:

- Lấy từ có `enrichedAt` khác null (và `>= since` nếu có), kèm `examples`, xếp theo `tslRank`.
- Dòng đầu `# Content report`, rồi `N words`, rồi bảng `| Rank | Word | POS | IPA | Nghĩa | Ví dụ |`. Cột ví dụ: mỗi câu dạng `textEn — textVi`, nối bằng `<br>`.
- Escape `|` thành `\|`, đổi xuống dòng trong nội dung thành khoảng trắng.

CLI (`node:util` `parseArgs`):

| Lệnh | Env cần | Việc làm |
| --- | --- | --- |
| `import-tsl <csv>` | `DATABASE_URL` | đọc file, `parseTslCsv`, `importTsl`, in `Inserted X, skipped Y` |
| `enrich [--limit N]` | `DATABASE_URL`, `ANTHROPIC_API_KEY` | `enrich` với Claude enricher, model `env.ENRICH_MODEL ?? 'claude-opus-5-5'`; in tiến độ mỗi lô; ghi `failed.json` (mảng `{ lemma, error }`, ghi đè mỗi lần chạy; không có lỗi thì ghi `[]`); in `Enriched X, failed Y` |
| `report [--since YYYY-MM-DD] [--out file]` | `DATABASE_URL` | ghi markdown ra `--out` (mặc định `report.md`) |

- Kiểm tra env bằng `requireEnv` **trước** khi tạo Prisma client hay Anthropic client.
- Lệnh lạ hoặc thiếu tham số: in usage ra stderr, trả 1. Lỗi khác: in message ra stderr, trả 1. Luôn `db.$disconnect()` trong `finally`.
- Cuối file: `if (import.meta.main) process.exitCode = await main(process.argv.slice(2), process.env)`.
- Thêm `failed.json` và `report.md` vào `tools/content-importer/.gitignore`.

`README.md` của importer (tiếng Việt, ngắn): chuẩn bị `.env`; tải TSL 1.2 (CC BY-SA) và lưu thành CSV có cột `word`; ba lệnh theo thứ tự, ví dụ `pnpm --filter @english-app/content-importer cli enrich --limit 200`; cách chạy với Neon (đặt `DATABASE_URL` của Neon trong `.env`); ước tính chi phí: khoảng 10 request cho 200 từ.

- [ ] **Step 1: Viết test**

```ts
// report.test.ts
it('lists only enriched words in rank order with escaped pipes', async () => {
  // seed: rank 2 'budget' đã enrich, rank 1 'invoice' đã enrich với meaningVi 'hóa đơn | phiếu', rank 3 chưa enrich
  // → chứa '2 words'; 'invoice' xuất hiện trước 'budget'; chứa 'hóa đơn \\| phiếu'; không chứa từ rank 3
})
it('filters by since', async () => { /* enrichedAt hôm qua và hôm nay, since = hôm nay → chỉ 1 từ */ })

// cli.test.ts
it('requireEnv lists every missing variable', () => {
  expect(() => requireEnv({ DATABASE_URL: '' }, ['DATABASE_URL', 'ANTHROPIC_API_KEY']))
    .toThrow('Missing environment variables: DATABASE_URL, ANTHROPIC_API_KEY')
})
it('main returns 1 and names the variable when ANTHROPIC_API_KEY is missing', async () => {
  // spy console.error; main(['enrich'], { DATABASE_URL: 'postgres://x' }) → 1, stderr chứa 'ANTHROPIC_API_KEY'
})
it('main returns 1 with usage for an unknown command', async () => {
  // main(['tts'], {}) → 1, stderr chứa 'import-tsl'
})
it('import-tsl end to end', async () => {
  // ghi CSV tạm (mkdtemp), main(['import-tsl', path], { DATABASE_URL: inject('databaseUrl') }) → 0, db.word.count() === 2
})
```

- [ ] **Step 2: Chạy test, thấy fail**

Run: `pnpm --filter @english-app/content-importer test`
Expected: FAIL ở `report.test.ts` và `cli.test.ts`.

- [ ] **Step 3: Viết `report.ts`, `cli.ts`, `.gitignore`, `README.md`**

- [ ] **Step 4: Kiểm tra toàn repo**

Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`
Expected: tất cả pass.

- [ ] **Step 5: Thử CLI bằng tay với DB local (không cần key)**

Run: `pnpm --filter @english-app/content-importer cli import-tsl <file CSV nhỏ 3 dòng>` hai lần.
Expected: lần 1 `Inserted 3, skipped 0`, lần 2 `Inserted 0, skipped 3`. Rồi `cli enrich` khi chưa có key → thoát mã 1, báo thiếu `ANTHROPIC_API_KEY`.

- [ ] **Step 6: Commit**

```bash
git add tools/content-importer README.md
git commit -m "feat(importer): add report command and CLI"
```

---

## Sau khi xong (người dùng tự làm, cần key thật)

1. Tạo `tools/content-importer/.env` với `DATABASE_URL` (local hoặc Neon) và `ANTHROPIC_API_KEY`.
2. `cli import-tsl tsl.csv`, rồi `cli enrich --limit 20` để thử chất lượng, đọc `report.md`.
3. Nếu ổn: `cli enrich --limit 200`, rà `report.md`, chạy lại `enrich` nếu `failed.json` có từ.
