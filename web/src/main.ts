import { createApp } from "vue";
import App from "./App.vue";
import "./styles/main.css";
import { startAnalytics } from "./analytics";

// Only runs when VITE_GA_ID is set, so dev and forks stay silent.
startAnalytics();

createApp(App).mount("#app");
