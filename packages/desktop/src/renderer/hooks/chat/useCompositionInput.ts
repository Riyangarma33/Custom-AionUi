import { useRef, useState } from 'react';

export interface KeyDownHandlerOptions {
  isMobile?: boolean;
}

export type KeyDownInterceptFn = (e: React.KeyboardEvent) => boolean;

/**
 * 共享的输入法合成事件处理hook
 * 消除SendBox组件和GUID页面中的IME处理重复代码
 */
export const useCompositionInput = () => {
  const isComposing = useRef(false);
  const [isComposingState, setIsComposingState] = useState(false);

  const compositionHandlers = {
    onCompositionStartCapture: () => {
      isComposing.current = true;
      setIsComposingState(true);
    },
    onCompositionEndCapture: () => {
      isComposing.current = false;
      setIsComposingState(false);
    },
  };

  const createKeyDownHandler = (
    onEnterPress: () => void,
    interceptOrOptions?: KeyDownInterceptFn | KeyDownHandlerOptions,
    options?: KeyDownHandlerOptions
  ) => {
    const onKeyDownIntercept = typeof interceptOrOptions === 'function' ? interceptOrOptions : undefined;
    const resolvedOptions =
      typeof interceptOrOptions === 'object' && interceptOrOptions !== null ? interceptOrOptions : (options ?? {});
    const { isMobile = false } = resolvedOptions;

    return (e: React.KeyboardEvent) => {
      if (isComposing.current) return;
      if (onKeyDownIntercept?.(e)) return;

      if (e.key === 'Enter') {
        const hasModifier = e.metaKey || e.ctrlKey;
        if (isMobile) {
          // Mobile soft keyboard: bare Enter inserts a newline in textarea;
          // hardware keyboards (e.g. iPad Magic Keyboard) submit via Cmd+Enter / Ctrl+Enter.
          if (hasModifier && !e.shiftKey) {
            e.preventDefault();
            onEnterPress();
          }
        } else {
          // Desktop: bare Enter submits; Shift+Enter creates a newline.
          if (!e.shiftKey) {
            e.preventDefault();
            onEnterPress();
          }
        }
      }
    };
  };

  return {
    isComposing,
    isComposingState,
    compositionHandlers,
    createKeyDownHandler,
  };
};
