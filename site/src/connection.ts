import { mount } from "svelte";
import "./app.css";
import "@hniedner/sveltedt/styles.css";
import ConnectionPage from "./ConnectionPage.svelte";

mount(ConnectionPage, { target: document.body });
