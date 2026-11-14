import { render } from "preact";
import "@fontsource-variable/piazzolla/standard.css";
import "@fontsource-variable/piazzolla/standard-italic.css";
import "@fontsource-variable/golos-text/index.css";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/layout.css";
import "./styles/components.css";
import "./styles/charts.css";
import { App } from "./app";

render(<App />, document.getElementById("app")!);
