import { createContext, useContext, type ReactNode } from "react";

export type BlockingModalController = {
  register: () => () => void;
  isOpen: () => boolean;
};

const fallbackBlockingModalController: BlockingModalController = {
  register: () => () => undefined,
  isOpen: () => false,
};

const BlockingModalContext = createContext<BlockingModalController>(
  fallbackBlockingModalController,
);

export function createBlockingModalController(): BlockingModalController {
  let openModalCount = 0;

  return {
    register() {
      openModalCount += 1;
      let isRegistered = true;

      return () => {
        if (!isRegistered) return;
        isRegistered = false;
        openModalCount = Math.max(0, openModalCount - 1);
      };
    },
    isOpen: () => openModalCount > 0,
  };
}

export function BlockingModalProvider({
  controller,
  children,
}: {
  controller: BlockingModalController;
  children: ReactNode;
}) {
  return (
    <BlockingModalContext value={controller}>
      {children}
    </BlockingModalContext>
  );
}

export function useBlockingModal() {
  return useContext(BlockingModalContext);
}
