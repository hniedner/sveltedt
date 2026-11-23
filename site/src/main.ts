import { mount } from "svelte";
import "./app.css";
import "@hniedner/sveltedt/styles.css";
import ListPage from "./ListPage.svelte";

mount(ListPage, { target: document.body });
