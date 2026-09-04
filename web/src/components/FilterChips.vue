<script setup lang="ts">
import type { CategoryDto, CategoryId } from "../api";

const props = defineProps<{
  groups: Array<{ id: string; label: string }>;
  categories: CategoryDto[];
  selected: CategoryId[];
  counts: Record<string, number>;
}>();

const emit = defineEmits<{ toggle: [id: CategoryId]; clear: [] }>();

const inGroup = (groupId: string): CategoryDto[] =>
  props.categories.filter((category) => category.group === groupId);
</script>

<template>
  <div class="chips">
    <div v-for="group in groups" :key="group.id" class="chips__row">
      <span class="chips__label">{{ group.label }}</span>
      <div class="chips__scroll">
        <button
          v-for="category in inGroup(group.id)"
          :key="category.id"
          type="button"
          class="chip"
          :class="{ 'chip--on': selected.includes(category.id) }"
          :aria-pressed="selected.includes(category.id)"
          @click="emit('toggle', category.id)"
        >
          {{ category.label }}
          <span class="chip__count" :class="{ 'chip__count--zero': !counts[category.id] }">
            {{ counts[category.id] ?? 0 }}
          </span>
        </button>
      </div>
    </div>

    <button v-if="selected.length" type="button" class="chips__clear" @click="emit('clear')">
      Clear filters
    </button>
  </div>
</template>

<style scoped>
.chips {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.chips__row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-width: 0;
}

.chips__label {
  flex: 0 0 auto;
  width: 4.2rem;
  font-size: 0.66rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--muted);
}

/* Chip rows scroll sideways rather than wrapping: one thumb, one line. */
.chips__scroll {
  display: flex;
  gap: 0.35rem;
  overflow-x: auto;
  scrollbar-width: none;
  padding-bottom: 2px;
}

.chips__scroll::-webkit-scrollbar {
  display: none;
}

.chip {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  /* Comfortably tappable with gloves on, standing up. */
  min-height: 2.15rem;
  padding: 0 0.7rem;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: var(--surface);
  color: var(--text);
  font: inherit;
  font-size: 0.83rem;
  font-weight: 500;
  white-space: nowrap;
  cursor: pointer;
  transition: background 120ms ease, border-color 120ms ease;
}

.chip:active {
  transform: scale(0.97);
}

.chip--on {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--accent-ink);
}

.chip__count {
  font-variant-numeric: tabular-nums;
  font-size: 0.72rem;
  padding: 0.05rem 0.35rem;
  border-radius: 999px;
  background: color-mix(in srgb, currentColor 14%, transparent);
}

.chip__count--zero {
  opacity: 0.45;
}

.chips__clear {
  align-self: flex-start;
  margin-left: 4.7rem;
  padding: 0;
  border: 0;
  background: none;
  color: var(--muted);
  font: inherit;
  font-size: 0.76rem;
  text-decoration: underline;
  cursor: pointer;
}
</style>
