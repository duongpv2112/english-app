<script setup lang="ts">
import type { StudyWord, WordPatch } from '@english-app/shared'
import { computed, reactive, ref } from 'vue'
import { api, ApiError } from '../api/client.ts'

const props = defineProps<{ word: StudyWord }>()
const emit = defineEmits<{ saved: [word: StudyWord]; cancel: [] }>()

const form = reactive({
  pos: props.word.pos ?? '',
  ipa: props.word.ipa ?? '',
  meaningVi: props.word.meaningVi,
  examples: props.word.examples.map((e) => ({ id: e.id, textEn: e.textEn, textVi: e.textVi })),
})
const saving = ref(false)
const error = ref('')

/** Only the fields that differ from the word as loaded. */
const patch = computed((): WordPatch | null => {
  const changed = (value: string, before: string | null) => {
    const trimmed = value.trim()
    return trimmed !== (before ?? '').trim() ? trimmed : undefined
  }
  const examples = form.examples
    .map((e, i) => {
      const before = props.word.examples[i]!
      return {
        id: e.id,
        textEn: changed(e.textEn, before.textEn),
        textVi: changed(e.textVi, before.textVi),
      }
    })
    .filter((e) => e.textEn !== undefined || e.textVi !== undefined)
  const result: WordPatch = {
    pos: changed(form.pos, props.word.pos),
    ipa: changed(form.ipa, props.word.ipa),
    meaningVi: changed(form.meaningVi, props.word.meaningVi),
    examples: examples.length > 0 ? examples : undefined,
  }
  return Object.values(result).some((v) => v !== undefined) ? result : null
})

async function save() {
  if (!patch.value || saving.value) return
  saving.value = true
  error.value = ''
  try {
    emit(
      'saved',
      await api<StudyWord>(`/words/${props.word.id}`, { method: 'PATCH', body: patch.value }),
    )
  } catch (e) {
    error.value =
      e instanceof ApiError && e.code === 'VALIDATION_ERROR'
        ? 'Không ô nào được để trống.'
        : 'Không lưu được. Kiểm tra kết nối rồi thử lại.'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <form class="editor" @submit.prevent="save">
    <h2>Sửa nội dung “{{ word.lemma }}”</h2>
    <div class="editor-row">
      <label>
        Loại từ
        <input v-model="form.pos" type="text" maxlength="30" />
      </label>
      <label>
        Phiên âm
        <input v-model="form.ipa" type="text" maxlength="100" />
      </label>
    </div>
    <label>
      Nghĩa tiếng Việt
      <input v-model="form.meaningVi" type="text" maxlength="300" />
    </label>
    <fieldset v-for="(example, i) in form.examples" :key="example.id">
      <legend>Câu ví dụ {{ i + 1 }}</legend>
      <label>
        Câu tiếng Anh
        <textarea v-model="example.textEn" rows="2" maxlength="300"></textarea>
      </label>
      <label>
        Bản dịch
        <textarea v-model="example.textVi" rows="2" maxlength="300"></textarea>
      </label>
    </fieldset>
    <p class="muted small">Sửa câu tiếng Anh sẽ xóa audio của câu đó cho tới lần chạy tts sau.</p>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <div class="editor-actions">
      <button type="button" class="secondary" @click="emit('cancel')">Hủy</button>
      <button type="submit" class="primary" :disabled="!patch || saving">
        {{ saving ? 'Đang lưu…' : 'Lưu' }}
      </button>
    </div>
  </form>
</template>
