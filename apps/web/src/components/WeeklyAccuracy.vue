<script setup lang="ts">
import type { StatsOverview } from '@english-app/shared'
import { computed } from 'vue'

const props = defineProps<{ weeks: StatsOverview['dictationWeeks'] }>()

const percent = (value: number) => `${Math.round(value * 100)}%`
/** '2026-11-09' → '9/11' */
const short = (date: string) => {
  const [, month, day] = date.split('-').map(Number)
  return `${day}/${month}`
}
const describe = (week: StatsOverview['dictationWeeks'][number]) =>
  week.average === null
    ? `Tuần từ ${short(week.weekStart)}: chưa luyện`
    : `Tuần từ ${short(week.weekStart)}: ${percent(week.average)} (${week.attempts} câu)`

const latest = computed(() => [...props.weeks].reverse().find((w) => w.average !== null) ?? null)
const empty = computed(() => latest.value === null)
</script>

<template>
  <section class="panel">
    <h2>Chép chính tả theo tuần</h2>
    <p v-if="empty" class="muted">Chưa có bài chép nào. Điểm trung bình mỗi tuần sẽ hiện ở đây.</p>
    <template v-else>
      <p class="muted">
        Tuần gần nhất: <strong class="figure">{{ percent(latest!.average!) }}</strong> qua
        {{ latest!.attempts }} câu
      </p>
      <!-- Columns are 0–100% accuracy on one baseline; an empty week draws nothing. -->
      <div class="columns" role="img" :aria-label="weeks.map(describe).join('; ')">
        <div class="columns-grid" aria-hidden="true">
          <span>100%</span>
          <span>50%</span>
          <span>0%</span>
        </div>
        <div class="columns-plot">
          <div
            v-for="week in weeks"
            :key="week.weekStart"
            class="column-slot"
            tabindex="0"
            :aria-label="describe(week)"
          >
            <div
              v-if="week.average !== null"
              class="column"
              :style="{ height: `${Math.max(week.average * 100, 1)}%` }"
            ></div>
            <span class="column-tip" role="tooltip">{{ describe(week) }}</span>
          </div>
        </div>
        <div class="columns-axis" aria-hidden="true">
          <span v-for="week in weeks" :key="week.weekStart">{{ short(week.weekStart) }}</span>
        </div>
      </div>
      <details>
        <summary>Xem bảng</summary>
        <table class="data-table">
          <thead>
            <tr>
              <th scope="col">Tuần từ</th>
              <th scope="col">Độ chính xác</th>
              <th scope="col">Số câu</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="week in weeks" :key="week.weekStart">
              <td>{{ short(week.weekStart) }}</td>
              <td>{{ week.average === null ? '–' : percent(week.average) }}</td>
              <td>{{ week.attempts }}</td>
            </tr>
          </tbody>
        </table>
      </details>
    </template>
  </section>
</template>
