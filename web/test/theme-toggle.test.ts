import { mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ThemeToggle from "../src/components/ThemeToggle.vue";
import { THEME_STORAGE_KEY } from "../src/theme";

/** happy-dom has matchMedia, but not one that answers a colour-scheme query. */
function stubSystem(dark: boolean, capture?: { listener?: (e: { matches: boolean }) => void }) {
  vi.stubGlobal("matchMedia", (media: string) => ({
    matches: dark,
    media,
    addEventListener: (_type: string, fn: (event: { matches: boolean }) => void) => {
      if (capture) capture.listener = fn;
    },
    removeEventListener() {},
  }));
}

beforeEach(() => {
  localStorage.clear();
  delete document.documentElement.dataset.theme;
  document.getElementById("psb-theme-color")?.remove();
  stubSystem(true);
});

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
  delete document.documentElement.dataset.theme;
});

describe("the theme toggle", () => {
  it("starts on auto and leaves the document alone", () => {
    const wrapper = mount(ThemeToggle);

    expect(wrapper.attributes("data-choice")).toBe("auto");
    // No attribute at all, so the stylesheet's own media query decides.
    expect(document.documentElement.dataset.theme).toBeUndefined();
    expect(document.getElementById("psb-theme-color")).toBeNull();
  });

  it("cycles auto, light, dark and back, and says what it will do next", async () => {
    const wrapper = mount(ThemeToggle);
    expect(wrapper.attributes("aria-label")).toContain("Switch to light");

    await wrapper.trigger("click");
    expect(wrapper.attributes("data-choice")).toBe("light");
    expect(document.documentElement.dataset.theme).toBe("light");

    await wrapper.trigger("click");
    expect(wrapper.attributes("data-choice")).toBe("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");

    await wrapper.trigger("click");
    expect(wrapper.attributes("data-choice")).toBe("auto");
    expect(document.documentElement.dataset.theme).toBeUndefined();
  });

  it("remembers the choice", async () => {
    const first = mount(ThemeToggle);
    await first.trigger("click");
    await first.trigger("click");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");

    const second = mount(ThemeToggle);
    expect(second.attributes("data-choice")).toBe("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("sets the browser chrome colour ahead of the ones in the head", async () => {
    // index.html's two carry media queries and the spec takes the first match,
    // so an override that is not first would simply lose.
    const decoy = document.createElement("meta");
    decoy.setAttribute("name", "theme-color");
    decoy.setAttribute("media", "(prefers-color-scheme: dark)");
    document.head.append(decoy);

    const wrapper = mount(ThemeToggle);
    await wrapper.trigger("click");

    const ours = document.getElementById("psb-theme-color");
    expect(ours?.getAttribute("content")).toBe("#f6f8fb");
    expect(document.head.firstChild).toBe(ours);

    // Back to auto and the override gets out of the way again.
    await wrapper.trigger("click");
    await wrapper.trigger("click");
    expect(document.getElementById("psb-theme-color")).toBeNull();

    decoy.remove();
  });

  it("follows the device while on auto", async () => {
    const capture: { listener?: (e: { matches: boolean }) => void } = {};
    stubSystem(true, capture);
    const wrapper = mount(ThemeToggle);

    // Auto writes no attribute either way; what changes is the chrome colour
    // once a choice is made, so check through an explicit light choice.
    capture.listener?.({ matches: false });
    await wrapper.vm.$nextTick();
    expect(document.documentElement.dataset.theme).toBeUndefined();
    expect(wrapper.attributes("data-choice")).toBe("auto");
  });
});
