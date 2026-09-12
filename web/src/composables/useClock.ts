import { onScopeDispose, ref, type Ref } from "vue";

/**
 * A `Date` that refreshes on an interval and cleans itself up with the component.
 *
 * Separate from the clock inside `useBoard`, which exists to age the snapshot and
 * is tied to a board. This one just drives the wall clock in the header, so it
 * survives an airport switch and costs one timer.
 */
export function useClock(intervalMs = 1000): Ref<Date> {
  const now = ref(new Date());

  const timer = setInterval(() => {
    now.value = new Date();
  }, intervalMs);

  onScopeDispose(() => clearInterval(timer));

  return now;
}
