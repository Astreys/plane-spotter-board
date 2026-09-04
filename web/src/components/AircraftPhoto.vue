<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import { fetchPhoto, type PhotoDto } from "../api";

const props = defineProps<{ hex: string }>();

const photo = ref<PhotoDto["photo"]>(null);
const loaded = ref(false);
const root = ref<HTMLElement | null>(null);

let observer: IntersectionObserver | null = null;
let controller: AbortController | null = null;

/**
 * Lazy on purpose: a board can hold twenty rows and most of them are off screen.
 * The row renders complete without this, so nothing here blocks the list.
 */
async function load(): Promise<void> {
  if (loaded.value) return;
  loaded.value = true;
  controller = new AbortController();
  photo.value = await fetchPhoto(props.hex, controller.signal);
}

onMounted(() => {
  if (typeof IntersectionObserver === "undefined") {
    void load();
    return;
  }

  observer = new IntersectionObserver(
    (entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        void load();
        observer?.disconnect();
      }
    },
    { rootMargin: "200px" },
  );

  if (root.value) observer.observe(root.value);
});

onBeforeUnmount(() => {
  observer?.disconnect();
  controller?.abort();
});
</script>

<template>
  <div ref="root" class="photo">
    <a
      v-if="photo"
      :href="photo.link"
      target="_blank"
      rel="noopener noreferrer"
      :title="photo.photographer ? `Photo by ${photo.photographer} - planespotters.net` : 'planespotters.net'"
    >
      <img :src="photo.thumbnail" :alt="`Aircraft ${hex}`" loading="lazy" decoding="async" />
    </a>
    <div v-else class="photo__placeholder" aria-hidden="true"></div>
  </div>
</template>

<style scoped>
.photo {
  flex: 0 0 auto;
  width: 66px;
  height: 44px;
  border-radius: 6px;
  overflow: hidden;
  background: var(--surface-2);
}

.photo img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.photo__placeholder {
  width: 100%;
  height: 100%;
  background: linear-gradient(135deg, var(--surface-2), var(--surface));
}
</style>
