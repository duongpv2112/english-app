# Phase 1 — Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dựng monorepo chạy được end-to-end: Vue app đăng nhập vào Fastify API (Postgres qua Prisma), API phục vụ luôn bản build của web, CI xanh, deploy lên Render với trang chủ "Hello" sau khi đăng nhập.

**Architecture:** pnpm workspace gồm `apps/api` (Fastify, factory `buildApp()` để test bằng `inject()`), `apps/web` (Vue 3 + Vite, dev proxy `/api` sang API), `packages/shared` (schema Zod + type dùng chung cho request/response và định dạng lỗi). Session lưu trong cookie mã hóa, chỉ một user được tạo bằng seed.

**Tech Stack:** Node 24 LTS, pnpm 10, TypeScript 5 (strict), Fastify 5, Zod 3, Prisma 6.x (cố định major 6), PostgreSQL 17, argon2, @fastify/secure-session, @fastify/rate-limit, @fastify/static, Vue 3.5, Vite, Vue Router 4, Pinia, Vitest, GitHub Actions, Render.

**Spec:** `docs/superpowers/specs/2026-11-06-english-app-mvp-design.md` (Mục 2, 5, 8, 9, 10 bước 1)

## Global Constraints

- Mọi lỗi API trả về đúng dạng `{ "error": { "code": string, "message": string } }`, không lộ stack trace.
- Mã lỗi dùng trong phase này: `VALIDATION_ERROR` (400), `UNAUTHENTICATED` (401), `INVALID_CREDENTIALS` (401), `NOT_FOUND` (404), `RATE_LIMITED` (429), `INTERNAL_ERROR` (500).
- Mọi route API có tiền tố `/api`.
- Mọi schema request/response nằm trong `packages/shared`, import qua `@english-app/shared`.
- Chỉ một tài khoản, tạo bằng seed. Không có route đăng ký.
- Mật khẩu hash bằng argon2. Cookie: `httpOnly`, `sameSite=lax`, `secure` chỉ khi `NODE_ENV=production`.
- Route đăng nhập giới hạn **5 lần/phút/IP**.
- `.env*` (trừ `.env.example`) không được commit. Key Claude/Azure không xuất hiện trong phase này.
- TypeScript `strict: true` ở mọi package. ESM (`"type": "module"`).
- Package names: `@english-app/api`, `@english-app/web`, `@english-app/shared`.

## Review Focus

1. **Email khác hoa thường / có khoảng trắng** khi đăng nhập (`  Me@Mail.com `) → vẫn đăng nhập được. Test ở Task 4.
2. **Thiếu hoặc sai `SESSION_SECRET`** → API không khởi động, báo lỗi rõ tên biến. Test ở Task 2.
3. **Route `/api/...` không tồn tại** khi đã bật phục vụ SPA → trả JSON 404, không trả `index.html`. Test ở Task 6.
4. **Body đăng nhập sai** (thiếu field, không phải JSON) → 400 `VALIDATION_ERROR` đúng dạng. Test ở Task 4.
5. **Phiên hết hạn / cookie bị sửa** → `/api/auth/me` trả 401 và web chuyển về `/login`. Test ở Task 4 (API) và Task 5 (web).

---

### Task 1: Monorepo, dev database và package shared

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `.gitignore`, `.nvmrc`, `.gitattributes`, `docker-compose.yml`, `README.md`
- Create: `packages/shared/package.json`, `packages/shared/tsconfig.json`, `packages/shared/src/index.ts`, `packages/shared/src/errors.ts`, `packages/shared/src/auth.ts`
- Test: `packages/shared/src/auth.test.ts`

**Interfaces:**
- Produces (`@english-app/shared`):
  - `ErrorCode` = union `'VALIDATION_ERROR' | 'UNAUTHENTICATED' | 'INVALID_CREDENTIALS' | 'NOT_FOUND' | 'RATE_LIMITED' | 'INTERNAL_ERROR'`
  - `ApiErrorBody = { error: { code: ErrorCode; message: string } }` và `apiErrorBodySchema` (Zod)
  - `loginRequestSchema` (Zod): `{ email: string (trim, lowercase, email), password: string (min 1) }`; type `LoginRequest`
  - `meResponseSchema`: `{ id: string; email: string }`; type `MeResponse`

- [ ] **Step 1: Tạo workspace root**
  - `pnpm-workspace.yaml`: `packages: ["apps/*", "packages/*"]`.
  - Root `package.json` (private) với scripts: `dev` (chạy api + web song song bằng `pnpm -r --parallel dev`), `build`, `test` (`pnpm -r test`), `typecheck` (`pnpm -r typecheck`), `lint`; `"packageManager": "pnpm@10.x"`; `engines.node: ">=24"`.
  - `.nvmrc`: `24`. `.gitattributes`: `* text=auto eol=lf`.
  - `.gitignore`: `node_modules`, `dist`, `.env`, `.env.*`, `!.env.example`, `coverage`.
  - `tsconfig.base.json`: `strict`, `module`/`moduleResolution` = `NodeNext`, `target` `ES2023`, `skipLibCheck`.
  - Thêm ESLint (flat config, `typescript-eslint`) + Prettier ở root, dùng chung cho mọi package.
- [ ] **Step 2: `docker-compose.yml`**
  - Service `postgres:17`, port `5432`, user/pass `english`/`english`.
  - Script init tạo 2 DB: `english_app` (dev) và `english_app_test` (test).
- [ ] **Step 3: Viết test cho schema** (`packages/shared/src/auth.test.ts`)

```ts
it('normalizes email', () => {
  expect(loginRequestSchema.parse({ email: '  Me@Mail.com ', password: 'x' }).email).toBe('me@mail.com')
})
it('rejects missing password', () => {
  expect(loginRequestSchema.safeParse({ email: 'me@mail.com' }).success).toBe(false)
})
it('rejects invalid email', () => {
  expect(loginRequestSchema.safeParse({ email: 'abc', password: 'x' }).success).toBe(false)
})
```

- [ ] **Step 4: Chạy test, xác nhận FAIL**
  - Run: `pnpm --filter @english-app/shared test`
  - Expected: FAIL (`loginRequestSchema` chưa tồn tại)
- [ ] **Step 5: Implement `errors.ts`, `auth.ts`, export qua `index.ts`**
  - Email normalize bằng `z.string().trim().toLowerCase().email()`.
  - Package `shared` export source TS trực tiếp qua `exports` (`"./src/index.ts"`), không cần build bước riêng trong phase này.
- [ ] **Step 6: Chạy test, typecheck, lint**
  - Run: `pnpm install && pnpm --filter @english-app/shared test && pnpm typecheck && pnpm lint`
  - Expected: 3 test PASS, không lỗi typecheck/lint
- [ ] **Step 7: Kiểm tra DB dev**
  - Run: `docker compose up -d && docker compose exec postgres psql -U english -l`
  - Expected: thấy `english_app` và `english_app_test`
- [ ] **Step 8: Commit** — `chore: scaffold pnpm monorepo and shared schemas`

---

### Task 2: API skeleton — config, error handler, health

**Files:**
- Create: `apps/api/package.json`, `apps/api/tsconfig.json`, `apps/api/vitest.config.ts`, `apps/api/.env.example`
- Create: `apps/api/src/config.ts`, `apps/api/src/app.ts`, `apps/api/src/server.ts`, `apps/api/src/plugins/errorHandler.ts`, `apps/api/src/routes/health.ts`
- Test: `apps/api/src/config.test.ts`, `apps/api/src/app.test.ts`

**Interfaces:**
- Consumes: `ApiErrorBody`, `ErrorCode` từ Task 1.
- Produces:
  - `loadConfig(env: NodeJS.ProcessEnv): Config` — ném `Error` có message chứa tên biến sai.
  - `Config = { nodeEnv: 'development' | 'test' | 'production'; port: number; databaseUrl: string; sessionSecret: Buffer; webDistDir: string | null }`
  - `buildApp(config: Config): Promise<FastifyInstance>` — chưa `listen`.
  - `class AppError extends Error { constructor(code: ErrorCode, statusCode: number, message: string) }` — export từ `plugins/errorHandler.ts`; route ném lỗi này để trả đúng định dạng.
  - `GET /api/health` → `200 { status: 'ok' }`.

- [ ] **Step 1: Viết test config** (`config.test.ts`)

```ts
const base = { DATABASE_URL: 'postgres://x', SESSION_SECRET: 'a'.repeat(64) }
it('parses valid env', () => {
  const c = loadConfig(base)
  expect(c.port).toBe(3000)
  expect(c.sessionSecret.length).toBe(32)
  expect(c.webDistDir).toBeNull()
})
it('rejects missing SESSION_SECRET', () => {
  expect(() => loadConfig({ DATABASE_URL: 'postgres://x' })).toThrow(/SESSION_SECRET/)
})
it('rejects non-hex SESSION_SECRET', () => {
  expect(() => loadConfig({ ...base, SESSION_SECRET: 'z'.repeat(64) })).toThrow(/SESSION_SECRET/)
})
```

- [ ] **Step 2: Viết test app** (`app.test.ts`, dùng `app.inject`)

```ts
it('GET /api/health → 200 ok', async () => {
  expect((await app.inject('/api/health')).json()).toEqual({ status: 'ok' })
})
it('unknown /api route → 404 NOT_FOUND shape', async () => {
  const res = await app.inject('/api/nope')
  expect(res.statusCode).toBe(404)
  expect(res.json()).toEqual({ error: { code: 'NOT_FOUND', message: expect.any(String) } })
})
it('thrown generic error → 500 INTERNAL_ERROR without stack', async () => {
  // đăng ký route test ném new Error('boom') trước app.ready()
  const res = await app.inject('/api/__boom')
  expect(res.statusCode).toBe(500)
  expect(res.json().error.code).toBe('INTERNAL_ERROR')
  expect(res.body).not.toContain('boom')
})
```

- [ ] **Step 3: Chạy test, xác nhận FAIL**
  - Run: `pnpm --filter @english-app/api test`
  - Expected: FAIL (module chưa tồn tại)
- [ ] **Step 4: Implement**
  - `config.ts`:
    - Env schema Zod: `SESSION_SECRET` regex `/^[0-9a-f]{64}$/`, chuyển thành `Buffer.from(hex, 'hex')`.
    - `PORT` mặc định `3000`. `NODE_ENV` mặc định `development`. `WEB_DIST_DIR` optional.
  - `errorHandler.ts`:
    - `setErrorHandler` xử lý 3 loại: `AppError` → giữ code/status; lỗi validation Zod hoặc lỗi Fastify `FST_ERR_VALIDATION` / JSON body sai → 400 `VALIDATION_ERROR`; còn lại → log bằng `request.log.error` và trả 500 `INTERNAL_ERROR` với message chung.
    - `setNotFoundHandler` trả 404 `NOT_FOUND`.
  - Validation dùng `fastify-type-provider-zod` để route khai báo schema bằng Zod.
  - `server.ts`: `loadConfig(process.env)` → `buildApp` → `listen({ host: '0.0.0.0', port })`. Dev chạy bằng `tsx watch src/server.ts`, đọc `.env` qua `node --env-file`.
  - `.env.example`: `DATABASE_URL`, `SESSION_SECRET` (kèm lệnh tạo: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`), `SEED_EMAIL`, `SEED_PASSWORD`.
- [ ] **Step 5: Chạy test, xác nhận PASS**
  - Run: `pnpm --filter @english-app/api test`
  - Expected: 6 test PASS
- [ ] **Step 6: Chạy thử**
  - Run: `pnpm --filter @english-app/api dev` rồi `curl http://localhost:3000/api/health`
  - Expected: `{"status":"ok"}`
- [ ] **Step 7: Commit** — `feat(api): add Fastify skeleton with config, error handler and health route`

---

### Task 3: Prisma, model User và seed

**Files:**
- Create: `apps/api/prisma/schema.prisma`, `apps/api/prisma/migrations/*` (do Prisma sinh), `apps/api/src/db.ts`, `apps/api/src/seed.ts`, `apps/api/test/globalSetup.ts`, `apps/api/.env.test.example`
- Modify: `apps/api/src/app.ts` (decorate `app.db`), `apps/api/vitest.config.ts` (globalSetup)
- Test: `apps/api/src/seed.test.ts`

**Interfaces:**
- Consumes: `Config` (Task 2).
- Produces:
  - Model `User` đúng spec Mục 4: `id`, `email @unique`, `passwordHash`, `newPerDay @default(20)`, `timezone @default("Asia/Ho_Chi_Minh")`, `playbackRate @default(1.0)`, `startedAt @default(now())`. Các model khác để các phase sau.
  - `createPrisma(databaseUrl: string): PrismaClient`; `app.db: PrismaClient` (Fastify decorator, đóng kết nối ở `onClose`).
  - `seedUser(db: PrismaClient, email: string, password: string): Promise<User>` — upsert theo email đã normalize, hash bằng argon2.
  - Script `pnpm --filter @english-app/api db:seed` đọc `SEED_EMAIL`, `SEED_PASSWORD`. Các script `db:migrate` (`prisma migrate dev`), `db:deploy` (`prisma migrate deploy`).

- [ ] **Step 1: Viết `schema.prisma`, tạo migration**
  - Run: `pnpm --filter @english-app/api exec prisma migrate dev --name init`
  - Expected: migration `init` được tạo, bảng `User` có trong `english_app`
- [ ] **Step 2: Test setup**
  - `globalSetup.ts` chạy `prisma migrate reset --force` lên DB trong `.env.test` (`english_app_test`). Không bao giờ chạy lên DB dev.
  - Guard: nếu `DATABASE_URL` không chứa `_test` thì ném lỗi và dừng.
- [ ] **Step 3: Viết test seed** (`seed.test.ts`)

```ts
it('creates user with normalized email and argon2 hash', async () => {
  const u = await seedUser(db, '  Me@Mail.com ', 'secret123')
  expect(u.email).toBe('me@mail.com')
  expect(u.passwordHash).toMatch(/^\$argon2/)
  expect(await argon2.verify(u.passwordHash, 'secret123')).toBe(true)
})
it('is idempotent and updates password', async () => {
  await seedUser(db, 'me@mail.com', 'a')
  await seedUser(db, 'me@mail.com', 'b')
  expect(await db.user.count()).toBe(1)
  const u = await db.user.findUniqueOrThrow({ where: { email: 'me@mail.com' } })
  expect(await argon2.verify(u.passwordHash, 'b')).toBe(true)
})
```

- [ ] **Step 4: Chạy test, xác nhận FAIL**
  - Run: `pnpm --filter @english-app/api test seed`
  - Expected: FAIL (`seedUser` chưa tồn tại)
- [ ] **Step 5: Implement `db.ts`, `seed.ts`, decorator `app.db`**
- [ ] **Step 6: Chạy test, xác nhận PASS**
  - Run: `pnpm --filter @english-app/api test`
  - Expected: toàn bộ test PASS
- [ ] **Step 7: Seed DB dev**
  - Run: `pnpm --filter @english-app/api db:seed`
  - Expected: in ra email của user đã tạo, không in mật khẩu
- [ ] **Step 8: Commit** — `feat(api): add Prisma with User model and seed script`

---

### Task 4: Đăng nhập — login, logout, me

**Files:**
- Create: `apps/api/src/plugins/auth.ts`, `apps/api/src/routes/auth.ts`
- Modify: `apps/api/src/app.ts`
- Test: `apps/api/src/routes/auth.test.ts`

**Interfaces:**
- Consumes: `loginRequestSchema`, `meResponseSchema` (Task 1); `AppError` (Task 2); `app.db`, `seedUser` (Task 3).
- Produces:
  - `POST /api/auth/login` body `LoginRequest` → `200 MeResponse` + set cookie `session`. Sai email hoặc mật khẩu → 401 `INVALID_CREDENTIALS`, cùng một message cho cả hai trường hợp.
  - `POST /api/auth/logout` → `204`, xóa session.
  - `GET /api/auth/me` → `200 MeResponse` hoặc 401 `UNAUTHENTICATED`.
  - `app.requireAuth` — preHandler hook; khi qua được thì gắn `request.userId: string`. Các phase sau dùng hook này cho mọi route cần đăng nhập.
- Cấu hình: `@fastify/secure-session` với `key: config.sessionSecret`, `cookieName: 'session'`, cookie `{ path: '/', httpOnly: true, sameSite: 'lax', secure: nodeEnv === 'production', maxAge: 30 ngày }`. `@fastify/rate-limit` chỉ áp lên route login: `max: 5`, `timeWindow: '1 minute'`, `errorResponseBuilder` trả 429 `RATE_LIMITED` đúng định dạng.

- [ ] **Step 1: Viết test** (`auth.test.ts`; `beforeEach` seed `me@mail.com` / `secret123`; mỗi test tạo app mới để không dính rate limit)

```ts
it('login ok → 200 + session cookie', async () => {
  const res = await login(app, 'me@mail.com', 'secret123')
  expect(res.statusCode).toBe(200)
  expect(res.json()).toEqual({ id: expect.any(String), email: 'me@mail.com' })
  expect(res.cookies.find(c => c.name === 'session')?.httpOnly).toBe(true)
})
it('login with messy email casing → 200', async () => {
  expect((await login(app, '  ME@Mail.com ', 'secret123')).statusCode).toBe(200)
})
it('wrong password and unknown email → same 401 INVALID_CREDENTIALS', async () => {
  const a = await login(app, 'me@mail.com', 'nope')
  const b = await login(app, 'x@mail.com', 'secret123')
  expect([a.statusCode, b.statusCode]).toEqual([401, 401])
  expect(a.json()).toEqual(b.json())
  expect(a.json().error.code).toBe('INVALID_CREDENTIALS')
})
it('invalid body → 400 VALIDATION_ERROR', async () => {
  const res = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'me@mail.com' } })
  expect(res.json().error.code).toBe('VALIDATION_ERROR')
})
it('non-JSON body → 400 VALIDATION_ERROR', async () => {
  const res = await app.inject({ method: 'POST', url: '/api/auth/login', headers: { 'content-type': 'application/json' }, payload: '{bad' })
  expect(res.statusCode).toBe(400)
  expect(res.json().error.code).toBe('VALIDATION_ERROR')
})
it('me without cookie → 401 UNAUTHENTICATED', async () => {
  expect((await app.inject('/api/auth/me')).json().error.code).toBe('UNAUTHENTICATED')
})
it('me with tampered cookie → 401', async () => {
  const res = await app.inject({ url: '/api/auth/me', cookies: { session: 'garbage' } })
  expect(res.statusCode).toBe(401)
})
it('me with session → 200; after logout → 401', async () => {
  const cookie = sessionCookie(await login(app, 'me@mail.com', 'secret123'))
  expect((await app.inject({ url: '/api/auth/me', cookies: cookie })).statusCode).toBe(200)
  const out = await app.inject({ method: 'POST', url: '/api/auth/logout', cookies: cookie })
  expect(out.statusCode).toBe(204)
  expect((await app.inject({ url: '/api/auth/me', cookies: sessionCookie(out) })).statusCode).toBe(401)
})
it('6th login attempt within a minute → 429 RATE_LIMITED', async () => {
  for (let i = 0; i < 5; i++) await login(app, 'me@mail.com', 'nope')
  const res = await login(app, 'me@mail.com', 'nope')
  expect(res.statusCode).toBe(429)
  expect(res.json().error.code).toBe('RATE_LIMITED')
})
it('cookie is not secure outside production', async () => {
  const res = await login(app, 'me@mail.com', 'secret123')
  expect(res.cookies.find(c => c.name === 'session')?.secure).toBeFalsy()
})
```

- [ ] **Step 2: Chạy test, xác nhận FAIL**
  - Run: `pnpm --filter @english-app/api test auth`
  - Expected: FAIL (404 cho các route auth)
- [ ] **Step 3: Implement `plugins/auth.ts` và `routes/auth.ts`**
  - Khi email không tồn tại vẫn chạy `argon2.verify` lên một hash giả, để thời gian phản hồi giống trường hợp sai mật khẩu.
  - Session chỉ lưu `userId`.
  - `requireAuth` kiểm tra user còn tồn tại trong DB.
- [ ] **Step 4: Chạy test, xác nhận PASS**
  - Run: `pnpm --filter @english-app/api test`
  - Expected: toàn bộ test PASS
- [ ] **Step 5: Commit** — `feat(api): add session auth with login, logout, me and rate limit`

---

### Task 5: Web app — đăng nhập và trang Hello

**Files:**
- Create: `apps/web/package.json`, `apps/web/tsconfig.json`, `apps/web/vite.config.ts`, `apps/web/index.html`, `apps/web/src/main.ts`, `apps/web/src/App.vue`, `apps/web/src/router.ts`, `apps/web/src/api/client.ts`, `apps/web/src/stores/auth.ts`, `apps/web/src/views/LoginView.vue`, `apps/web/src/views/HomeView.vue`
- Test: `apps/web/src/api/client.test.ts`, `apps/web/src/router.test.ts`

**Interfaces:**
- Consumes: `LoginRequest`, `MeResponse`, `ApiErrorBody`, `ErrorCode` (Task 1); các route của Task 4.
- Produces:
  - `class ApiError extends Error { code: ErrorCode; status: number }`
  - `api<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T>` — gọi `fetch('/api' + path)` với `credentials: 'include'`, gửi JSON; status `204` → `undefined`; status khác 2xx → parse `ApiErrorBody` và ném `ApiError`; body lỗi không đúng định dạng → `ApiError('INTERNAL_ERROR', status)`.
  - Store `useAuthStore()` (Pinia): state `user: MeResponse | null`, `checked: boolean`; actions `fetchMe()`, `login(req: LoginRequest)`, `logout()`.
  - Router: `/login` (public), `/` (`meta.requiresAuth`). Guard: route cần đăng nhập mà chưa `checked` thì gọi `fetchMe()` trước; không có user thì chuyển về `/login?redirect=<path>`. Đã đăng nhập mà vào `/login` thì chuyển về `/`.
  - Vite dev server proxy `/api` sang `http://localhost:3000`.

- [ ] **Step 1: Scaffold Vue + Vite + TS**
  - Dùng `create-vue` (TypeScript, Router, Pinia, Vitest; không JSX, không e2e), rồi xóa các file demo.
- [ ] **Step 2: Viết test client** (`client.test.ts`, stub `fetch` bằng `vi.stubGlobal`)

```ts
it('returns parsed JSON on 200', async () => {
  mockFetch(200, { id: '1', email: 'a@b.c' })
  await expect(api('/auth/me')).resolves.toEqual({ id: '1', email: 'a@b.c' })
})
it('throws ApiError with code on 401', async () => {
  mockFetch(401, { error: { code: 'UNAUTHENTICATED', message: 'x' } })
  await expect(api('/auth/me')).rejects.toMatchObject({ code: 'UNAUTHENTICATED', status: 401 })
})
it('throws INTERNAL_ERROR when error body is not JSON', async () => {
  mockFetchText(502, '<html>Bad Gateway</html>')
  await expect(api('/auth/me')).rejects.toMatchObject({ code: 'INTERNAL_ERROR', status: 502 })
})
it('sends credentials and JSON body', async () => {
  const f = mockFetch(200, {})
  await api('/auth/login', { method: 'POST', body: { email: 'a', password: 'b' } })
  expect(f).toHaveBeenCalledWith('/api/auth/login', expect.objectContaining({ credentials: 'include', method: 'POST' }))
})
```

- [ ] **Step 3: Viết test guard** (`router.test.ts`, mock `fetchMe`)

```ts
it('redirects to /login with redirect param when unauthenticated', async () => {
  await router.push('/')
  expect(router.currentRoute.value.fullPath).toBe('/login?redirect=/')
})
it('redirects /login → / when already authenticated', async () => { /* store.user được set */ })
```

- [ ] **Step 4: Chạy test, xác nhận FAIL**
  - Run: `pnpm --filter @english-app/web test`
  - Expected: FAIL
- [ ] **Step 5: Implement client, store, router, views**
  - `LoginView`: form email + mật khẩu.
    - Lỗi `INVALID_CREDENTIALS` → hiện "Email hoặc mật khẩu không đúng".
    - Lỗi `RATE_LIMITED` → hiện "Thử lại sau 1 phút".
    - Đăng nhập thành công → chuyển tới `redirect` hoặc `/`.
  - `HomeView`: "Xin chào, {email}" và nút Đăng xuất.
  - Giao diện tối giản, chưa chọn thư viện UI. Chỉ cần CSS cơ bản, hiển thị ổn ở chiều rộng 375px.
- [ ] **Step 6: Chạy test, xác nhận PASS**
  - Run: `pnpm --filter @english-app/web test && pnpm typecheck`
  - Expected: PASS
- [ ] **Step 7: Kiểm tra thủ công**
  - Run: `pnpm dev`, mở `http://localhost:5173`
  - Expected:
    - Mở `/` bị chuyển về `/login`.
    - Đăng nhập bằng user seed thì thấy "Xin chào, …".
    - F5 vẫn còn đăng nhập.
    - Đăng xuất thì quay về `/login`.
- [ ] **Step 8: Commit** — `feat(web): add Vue app with login flow and auth guard`

---

### Task 6: API phục vụ bản build của web

**Files:**
- Create: `apps/api/src/plugins/spa.ts`
- Modify: `apps/api/src/app.ts`, root `package.json` (script `build`: build web trước, rồi api; script `start`)
- Test: `apps/api/src/plugins/spa.test.ts`

**Interfaces:**
- Consumes: `Config.webDistDir` (Task 2).
- Produces:
  - Khi `webDistDir` khác `null`:
    - `@fastify/static` phục vụ file trong thư mục đó.
    - Request `GET` không bắt đầu bằng `/api` và không khớp file nào → trả `index.html` (200).
    - Request `/api/*` không khớp route nào → vẫn trả JSON 404 `NOT_FOUND`.
  - Khi `webDistDir` là `null`: không đăng ký gì thêm.
  - Root `pnpm build` tạo `apps/web/dist` và `apps/api/dist`; `pnpm start` chạy `node apps/api/dist/server.js` với `WEB_DIST_DIR=apps/web/dist`.

- [ ] **Step 1: Viết test** (fixture: thư mục tạm chứa `index.html` = `<div id=app>` và `assets/a.js`)

```ts
it('serves static asset', async () => {
  expect((await app.inject('/assets/a.js')).statusCode).toBe(200)
})
it('SPA fallback for client routes', async () => {
  const res = await app.inject('/study/today')
  expect(res.statusCode).toBe(200)
  expect(res.body).toContain('<div id=app>')
})
it('unknown /api route stays JSON 404', async () => {
  const res = await app.inject('/api/nope')
  expect(res.statusCode).toBe(404)
  expect(res.json().error.code).toBe('NOT_FOUND')
})
it('no static serving when webDistDir is null', async () => {
  expect((await appWithoutDist.inject('/study/today')).statusCode).toBe(404)
})
```

- [ ] **Step 2: Chạy test, xác nhận FAIL**
  - Run: `pnpm --filter @english-app/api test spa`
  - Expected: FAIL
- [ ] **Step 3: Implement `plugins/spa.ts`**
  - Mở rộng `setNotFoundHandler` của Task 2: với `GET` không thuộc `/api` thì `reply.sendFile('index.html')`.
- [ ] **Step 4: Chạy test, xác nhận PASS**
  - Run: `pnpm --filter @english-app/api test`
  - Expected: PASS
- [ ] **Step 5: Kiểm tra bản production trên máy**
  - Run: `pnpm build && pnpm start`, mở `http://localhost:3000`
  - Expected: luồng đăng nhập giống Task 5 Step 7, nhưng chạy trên cùng một origin
- [ ] **Step 6: Commit** — `feat(api): serve web build with SPA fallback`

---

### Task 7: CI và deploy lên Render

**Files:**
- Create: `.github/workflows/ci.yml`, `render.yaml`, `docs/deploy.md`

**Interfaces:**
- Consumes: các script `typecheck`, `lint`, `test`, `build`, `start`, `db:deploy`, `db:seed` từ các task trước.
- Produces: pipeline CI; production URL trả `GET /api/health` → `{"status":"ok"}`.

- [ ] **Step 1: `ci.yml`**
  - Chạy khi push và khi có pull request.
  - Job dùng `ubuntu-latest` với service `postgres:17` (DB `english_app_test`).
  - Các bước: `pnpm/action-setup`, `actions/setup-node` (Node 24, cache pnpm), `pnpm install --frozen-lockfile`, `pnpm typecheck`, `pnpm lint`, `pnpm test` (env `DATABASE_URL` trỏ DB service, `SESSION_SECRET` là chuỗi hex cố định chỉ dùng cho test), `pnpm build`.
- [ ] **Step 2: `render.yaml`** (Blueprint)
  - Web service Node.
  - `buildCommand`: `corepack enable && pnpm install --frozen-lockfile && pnpm build && pnpm --filter @english-app/api db:deploy`.
  - `startCommand`: `pnpm start`. `healthCheckPath`: `/api/health`.
  - Env: `NODE_ENV=production`, `WEB_DIST_DIR=apps/web/dist`. `DATABASE_URL` và `SESSION_SECRET` để `sync: false` (người dùng tự nhập trên dashboard).
- [ ] **Step 3: `docs/deploy.md`** — các bước người dùng tự làm:
  1. Tạo database trên Neon, lấy connection string (có `sslmode=require`).
  2. Push repo lên GitHub.
  3. Trên Render: New → Blueprint → chọn repo, nhập `DATABASE_URL` và `SESSION_SECRET`.
  4. Seed user production: chạy `pnpm --filter @english-app/api db:seed` trên máy, với `DATABASE_URL` của Neon và `SEED_EMAIL`, `SEED_PASSWORD` đặt tạm qua biến môi trường. Không lưu mật khẩu vào file.
- [ ] **Step 4: Kiểm tra CI**
  - Run: push nhánh, rồi `gh run watch`
  - Expected: mọi bước xanh
- [ ] **Step 5: Kiểm tra production** (sau khi người dùng làm xong Step 3)
  - Run: `curl https://<render-url>/api/health`
  - Expected: `{"status":"ok"}`
  - Mở URL trên điện thoại: đăng nhập được, cookie có `Secure`.
- [ ] **Step 6: Commit** — `ci: add GitHub Actions and Render blueprint`
