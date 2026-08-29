import React from "react";
import ReactDOM from "react-dom/client";
import "@fontsource/pretendard/400.css";
import "@fontsource/pretendard/700.css";
import "@fontsource-variable/noto-sans-kr";
import "@fontsource-variable/noto-serif-kr";
import App from "./app/App";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
