import { mount } from "svelte";
import "./app.css";
import "@hniedner/sveltedt/styles.css";
import "./slow.css";
import SlowPage from "./SlowPage.svelte";

mount(SlowPage, { target: document.body });
