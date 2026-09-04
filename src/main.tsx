import React from "react";
import ReactDOM from "react-dom/client";
import "@fontsource-variable/dancing-script";
import "@fontsource-variable/eb-garamond";
import "@fontsource-variable/eb-garamond/wght-italic.css";
import "@fontsource-variable/literata";
import "@fontsource-variable/literata/wght-italic.css";
import "@fontsource/gowun-batang/400.css";
import "@fontsource/gowun-batang/700.css";
import "@fontsource/pretendard/400.css";
import "@fontsource/pretendard/700.css";
import "@fontsource-variable/noto-sans-kr";
import "@fontsource-variable/noto-serif-kr";
import App from "./app/App";
import { configureMacosTitleBar } from "./app/title-bar";

void configureMacosTitleBar();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
