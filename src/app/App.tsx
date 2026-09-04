import { useRef } from "react";
import { useDocumentSession } from "../features/documents/useDocumentSession";
import { useReadingPreferences } from "../features/reading/useReadingPreferences";
import {
  createAppEventChannel,
  type AppEventChannel,
} from "../shared/app-events";
import {
  BlockingModalProvider,
  createBlockingModalController,
  type BlockingModalController,
} from "../shared/blocking-modal";
import { AppWorkspace } from "./AppWorkspace";
import "../styles/base.css";
import "./App.css";

function App() {
  const appEventsRef = useRef<AppEventChannel | null>(null);
  const blockingModalRef = useRef<BlockingModalController | null>(null);
  if (appEventsRef.current === null) {
    appEventsRef.current = createAppEventChannel();
  }
  if (blockingModalRef.current === null) {
    blockingModalRef.current = createBlockingModalController();
  }
  const events = appEventsRef.current;
  const blockingModal = blockingModalRef.current;
  const documents = useDocumentSession({
    events,
    isBlockingModalOpen: blockingModal.isOpen,
  });
  const reading = useReadingPreferences({
    events,
    isBlockingModalOpen: blockingModal.isOpen,
  });

  if (documents.isRestoringStartupDocument) {
    return (
      <div
        className="app-shell is-starting"
        data-theme={reading.theme}
        data-font={reading.readingFont}
        data-line-spacing={reading.lineSpacing}
        style={reading.readingStyle}
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

  return (
    <BlockingModalProvider controller={blockingModal}>
      <AppWorkspace
        events={events}
        documents={documents}
        reading={reading}
        isBlockingModalOpen={blockingModal.isOpen}
      />
    </BlockingModalProvider>
  );
}

export default App;
