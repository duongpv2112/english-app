<script setup lang="ts">
import type { DiffToken } from '@english-app/shared'

defineProps<{ diff: DiffToken[] }>()

const titles: Record<DiffToken['type'], string> = {
  correct: 'Đúng',
  wrong: 'Sai',
  missing: 'Thiếu',
  extra: 'Thừa',
}
</script>

<template>
  <p class="diff">
    <span
      v-for="(token, i) in diff"
      :key="i"
      :class="['diff-token', token.type]"
      :title="titles[token.type]"
    >
      <template v-if="token.type === 'correct'">{{ token.expected }}</template>
      <template v-else-if="token.type === 'wrong'">
        <s>{{ token.actual }}</s> {{ token.expected }}
      </template>
      <template v-else-if="token.type === 'missing'">[{{ token.expected }}]</template>
      <s v-else>{{ token.actual }}</s>
    </span>
  </p>
  <p class="diff-legend muted">
    <span class="diff-token correct">đúng</span>
    <span class="diff-token wrong">sai</span>
    <span class="diff-token missing">[thiếu]</span>
    <span class="diff-token extra"><s>thừa</s></span>
  </p>
</template>
