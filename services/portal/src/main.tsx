import { render } from "preact";
import "@fontsource-variable/inter/wght.css";
import "@fontsource-variable/public-sans/wght.css";
import "@fontsource/dm-mono/400.css";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/layout.css";
import "./styles/components.css";
import "./styles/charts.css";
import { App } from "./app";

render(<App />, document.getElementById("app")!);
