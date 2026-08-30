import { useRef } from "react";
import { useDocumentSession } from "../features/documents/useDocumentSession";
import { useReadingPreferences } from "../features/reading/useReadingPreferences";
import {
  createAppEventChannel,
  type AppEventChannel,
} from "../shared/app-events";
import { AppWorkspace } from "./AppWorkspace";
import "../styles/base.css";
import "./App.css";

function App() {
  const appEventsRef = useRef<AppEventChannel | null>(null);
  if (appEventsRef.current === null) {
    appEventsRef.current = createAppEventChannel();
  }
  const events = appEventsRef.current;
  const documents = useDocumentSession({ events });
  const reading = useReadingPreferences();

  if (documents.isRestoringStartupDocument) {
    return (
      <div
        className="app-shell is-starting"
        data-theme={reading.theme}
        data-font={reading.readingFont}
        data-line-spacing={reading.lineSpacing}
        style={reading.readingZoomStyle}
      >
        <main
          className="startup-document-state"
          role="status"
          aria-live="polite"
        >
          <span className="startup-document-pulse" aria-hidden="true" />
          <span>마지막 문서를 여는 중…</span>
        </main>
      </div>
    );
  }

  return <AppWorkspace events={events} documents={documents} reading={reading} />;
}

export default App;
