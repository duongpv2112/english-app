<script setup lang="ts">
import type { Rating, StudyWord } from '@english-app/shared'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import AudioButton from '../components/AudioButton.vue'
import WordEditor from '../components/WordEditor.vue'
import { useStudyStore } from '../stores/study.ts'

const study = useStudyStore()

const ratings: { rating: Rating; label: string; tone: string }[] = [
  { rating: 1, label: 'Quên', tone: 'again' },
  { rating: 2, label: 'Khó', tone: 'hard' },
  { rating: 3, label: 'Được', tone: 'good' },
  { rating: 4, label: 'Dễ', tone: 'easy' },
]

const typed = ref('')
/** The "Báo sai" form is open for the card on screen. */
const editing = ref(false)
const isListen = computed(() => study.current?.mode === 'LISTEN_TYPE')
/** A listen card hides the word until it is checked; without audio the meaning is the prompt. */
const showWord = computed(() => !isListen.value || study.revealed)

function saved(word: StudyWord) {
  study.updateWord(word)
  editing.value = false
}

function rate(rating: Rating) {
  editing.value = false
  study.rate(rating)
}

function check() {
  study.checkTyped(typed.value)
  typed.value = ''
}

function onKey(event: KeyboardEvent) {
  if (event.ctrlKey || event.metaKey || event.altKey || !study.current) return
  // Typing in a field: the form handles Enter, and digits belong to the text.
  const target = event.target
  if (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    editing.value
  ) {
    return
  }
  // A focused button already reacts to Space and Enter itself.
  const onButton = event.target instanceof HTMLElement && event.target.closest('button, a')
  if (!study.revealed) {
    if ((event.key === ' ' || event.key === 'Enter') && !onButton && !isListen.value) {
      event.preventDefault()
      study.reveal()
    }
    return
  }
  if (['1', '2', '3', '4'].includes(event.key)) {
    event.preventDefault()
    rate(Number(event.key) as Rating)
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKey)
  void study.load()
})
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <main class="page study">
    <header class="topbar">
      <RouterLink to="/" class="link">← Trang chủ</RouterLink>
      <span v-if="study.status === 'ready' && study.current" class="muted">
        Còn {{ study.queue.length }} thẻ
      </span>
    </header>

    <p v-if="study.syncError" class="notice" role="status">
      {{ study.pending.length }} lượt chấm chưa lưu.
      <button type="button" class="link" @click="study.flush()">Thử lại</button>
    </p>

    <p v-if="study.status === 'loading' || study.status === 'idle'" class="muted">Đang tải…</p>

    <section v-else-if="study.status === 'error'" class="panel">
      <p class="error" role="alert">Không tải được thẻ. Kiểm tra kết nối rồi thử lại.</p>
      <button type="button" @click="study.load()">Thử lại</button>
    </section>

    <section v-else-if="study.finished" class="panel done">
      <h1>Xong rồi!</h1>
      <p v-if="study.reviewedCount > 0">Bạn đã chấm {{ study.reviewedCount }} lượt.</p>
      <p v-else>Hôm nay không còn thẻ nào để học.</p>
      <RouterLink to="/" class="button primary">Về trang chủ</RouterLink>
    </section>

    <template v-else-if="study.current">
      <!-- The key makes Vue rebuild the card, so audio restarts and nothing carries over. -->
      <article :key="study.current.cardId + study.reviewedCount" class="flashcard">
        <p v-if="study.current.isNew" class="badge">Từ mới</p>
        <p v-else-if="isListen" class="badge">Nghe và gõ lại</p>

        <template v-if="showWord">
          <h1 class="lemma">{{ study.current.word.lemma }}</h1>
          <p class="ipa">
            <span v-if="study.current.word.ipa">{{ study.current.word.ipa }}</span>
            <AudioButton :url="study.current.word.audioUrl" label="Nghe từ" :autoplay="!isListen" />
          </p>
          <p
            v-if="study.typedCorrect !== null"
            :class="['typed-result', study.typedCorrect ? 'right' : 'not-right']"
            role="status"
          >
            <template v-if="study.typedCorrect">Đúng rồi</template>
            <template v-else-if="study.typedInput">
              Chưa đúng — bạn gõ: <s>{{ study.typedInput }}</s>
            </template>
            <template v-else>Chưa đúng — bạn chưa gõ gì</template>
          </p>
        </template>

        <form v-else class="listen" @submit.prevent="check">
          <p v-if="study.current.word.audioUrl" class="listen-audio">
            <AudioButton :url="study.current.word.audioUrl" label="Nghe lại" autoplay>
              Nghe lại
            </AudioButton>
          </p>
          <template v-else>
            <p class="meaning">{{ study.current.word.meaningVi }}</p>
            <p class="muted">Chưa có audio — gõ từ tiếng Anh có nghĩa này.</p>
          </template>
          <label>
            Gõ lại từ bạn nghe
            <input
              v-model="typed"
              type="text"
              autocomplete="off"
              autocapitalize="none"
              autocorrect="off"
              spellcheck="false"
              autofocus
            />
          </label>
        </form>

        <WordEditor
          v-if="study.revealed && editing"
          :word="study.current.word"
          @saved="saved"
          @cancel="editing = false"
        />
        <div v-else-if="study.revealed" class="answer">
          <p class="meaning">
            <span v-if="study.current.word.pos" class="pos">{{ study.current.word.pos }}</span>
            {{ study.current.word.meaningVi }}
          </p>
          <ul class="examples">
            <li v-for="example in study.current.word.examples" :key="example.id">
              <p class="example-en">
                {{ example.textEn }}
                <AudioButton :url="example.audioUrl" label="Nghe câu ví dụ" />
              </p>
              <p class="example-vi">{{ example.textVi }}</p>
            </li>
          </ul>
        </div>
      </article>

      <footer v-if="!editing" class="actions">
        <button v-if="study.revealed" type="button" class="link report" @click="editing = true">
          Báo sai
        </button>
        <button
          v-if="!study.revealed && isListen"
          type="button"
          class="primary wide"
          @click="check"
        >
          Kiểm tra
        </button>
        <button
          v-else-if="!study.revealed"
          type="button"
          class="primary wide"
          @click="study.reveal()"
        >
          Hiện đáp án
        </button>
        <div v-else class="ratings">
          <button
            v-for="item in ratings"
            :key="item.rating"
            type="button"
            :class="['rating', item.tone, { suggested: study.suggestedRating === item.rating }]"
            @click="rate(item.rating)"
          >
            <span class="rating-label">{{ item.label }}</span>
            <span class="rating-interval">{{ study.intervals?.[item.rating] }}</span>
          </button>
        </div>
      </footer>
    </template>
  </main>
</template>
