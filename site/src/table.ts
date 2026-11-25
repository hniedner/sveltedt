import { mount } from "svelte";
import "./app.css";
import "@hniedner/sveltedt/styles.css";
import "./table.css";
import TablePage from "./TablePage.svelte";

mount(TablePage, { target: document.body });
