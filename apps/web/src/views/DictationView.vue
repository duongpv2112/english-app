<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import AudioButton from '../components/AudioButton.vue'
import DictationDiff from '../components/DictationDiff.vue'
import { useDictationStore } from '../stores/dictation.ts'

const dictation = useDictationStore()

const typed = ref('')
const slow = ref(false)
const field = ref<HTMLTextAreaElement | null>(null)
const nextButton = ref<HTMLButtonElement | null>(null)

const percent = (score: number) => `${Math.round(score * 100)}%`
const position = computed(() => `Câu ${dictation.index + 1}/${dictation.items.length}`)

function submit() {
  dictation.submit(typed.value)
}

function next() {
  dictation.next()
  typed.value = ''
}

// Keep the keyboard flowing: type → Enter → Enter → type.
watch(
  () => [dictation.current?.exampleId, dictation.result !== null] as const,
  async ([, hasResult]) => {
    await nextTick()
    if (hasResult) nextButton.value?.focus()
    else field.value?.focus()
  },
)

onMounted(() => dictation.load())
</script>

<template>
  <main class="page study">
    <header class="topbar">
      <RouterLink to="/" class="link">← Trang chủ</RouterLink>
      <span v-if="dictation.current" class="muted">{{ position }}</span>
    </header>

    <p v-if="dictation.syncError" class="notice" role="status">
      {{ dictation.pending.length }} bài chép chưa lưu.
      <button type="button" class="link" @click="dictation.flush()">Thử lại</button>
    </p>

    <p v-if="dictation.status === 'loading' || dictation.status === 'idle'" class="muted">
      Đang tải…
    </p>

    <section v-else-if="dictation.status === 'error'" class="panel">
      <p class="error" role="alert">Không tải được câu luyện. Kiểm tra kết nối rồi thử lại.</p>
      <button type="button" @click="dictation.load()">Thử lại</button>
    </section>

    <section v-else-if="dictation.finished && dictation.items.length === 0" class="panel">
      <p>Chưa có câu nào để luyện.</p>
      <p class="muted">
        Câu luyện lấy từ ví dụ của những từ bạn đã học ít nhất một lần, và cần có audio. Hãy học vài
        từ trước; nếu vẫn trống, kiểm tra bước tạo audio trong
        <code>docs/content-importer.md</code> và biến <code>AUDIO_BASE_URL</code>.
      </p>
      <RouterLink to="/" class="button primary">Về trang chủ</RouterLink>
    </section>

    <section v-else-if="dictation.finished" class="panel done">
      <h1>Xong phiên!</h1>
      <p v-if="dictation.average !== null">
        Độ chính xác trung bình: <strong>{{ percent(dictation.average) }}</strong> qua
        {{ dictation.scores.length }} câu.
      </p>
      <button type="button" class="primary" @click="dictation.load()">Luyện tiếp</button>
      <RouterLink to="/" class="button secondary">Về trang chủ</RouterLink>
    </section>

    <template v-else-if="dictation.current">
      <article class="flashcard dictation">
        <div class="dictation-audio">
          <!-- Keyed by sentence and speed so a change replays the audio. -->
          <AudioButton
            :key="dictation.current.exampleId"
            :url="dictation.current.audioUrl"
            :rate="slow ? 0.75 : 1"
            label="Nghe câu"
            autoplay
          >
            Nghe
          </AudioButton>
          <button
            type="button"
            :class="['toggle', { on: slow }]"
            :aria-pressed="slow"
            @click="slow = !slow"
          >
            Chậm 0.75x
          </button>
        </div>

        <form v-if="!dictation.result" @submit.prevent="submit">
          <label>
            Gõ lại câu bạn nghe
            <textarea
              ref="field"
              v-model="typed"
              rows="3"
              maxlength="500"
              autocomplete="off"
              autocapitalize="none"
              autocorrect="off"
              spellcheck="false"
              @keydown.enter.exact.prevent="submit"
            ></textarea>
          </label>
        </form>

        <div v-else class="answer">
          <p class="score" role="status">{{ percent(dictation.result.score) }}</p>
          <DictationDiff :diff="dictation.result.diff" />
          <p class="example-en">{{ dictation.current.textEn }}</p>
          <p class="example-vi">{{ dictation.current.textVi }}</p>
        </div>
      </article>

      <footer class="actions">
        <button v-if="!dictation.result" type="button" class="primary wide" @click="submit">
          Nộp
        </button>
        <button v-else ref="nextButton" type="button" class="primary wide" @click="next">
          {{ dictation.index + 1 < dictation.items.length ? 'Câu tiếp' : 'Xem kết quả' }}
        </button>
      </footer>
    </template>
  </main>
</template>
