/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useCompositionInput } from '@/renderer/hooks/chat/useCompositionInput';

describe('useCompositionInput', () => {
  it('submits on bare Enter on desktop (isMobile: false)', () => {
    const { result } = renderHook(() => useCompositionInput());
    const onEnterPress = vi.fn();
    const handler = result.current.createKeyDownHandler(onEnterPress, undefined, { isMobile: false });

    const preventDefault = vi.fn();
    handler({
      key: 'Enter',
      shiftKey: false,
      metaKey: false,
      ctrlKey: false,
      preventDefault,
    } as unknown as React.KeyboardEvent);

    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(onEnterPress).toHaveBeenCalledTimes(1);
  });

  it('preserves newline on Shift+Enter on desktop', () => {
    const { result } = renderHook(() => useCompositionInput());
    const onEnterPress = vi.fn();
    const handler = result.current.createKeyDownHandler(onEnterPress, undefined, { isMobile: false });

    const preventDefault = vi.fn();
    handler({
      key: 'Enter',
      shiftKey: true,
      metaKey: false,
      ctrlKey: false,
      preventDefault,
    } as unknown as React.KeyboardEvent);

    expect(preventDefault).not.toHaveBeenCalled();
    expect(onEnterPress).not.toHaveBeenCalled();
  });

  it('allows interceptor to consume the event on desktop', () => {
    const { result } = renderHook(() => useCompositionInput());
    const onEnterPress = vi.fn();
    const interceptor = vi.fn(() => true);
    const handler = result.current.createKeyDownHandler(onEnterPress, interceptor, { isMobile: false });

    const preventDefault = vi.fn();
    handler({
      key: 'Enter',
      shiftKey: false,
      metaKey: true,
      ctrlKey: false,
      preventDefault,
    } as unknown as React.KeyboardEvent);

    expect(interceptor).toHaveBeenCalledTimes(1);
    expect(onEnterPress).not.toHaveBeenCalled();
    expect(preventDefault).not.toHaveBeenCalled();
  });

  it('does NOT submit on bare Enter on mobile soft keyboard (isMobile: true)', () => {
    const { result } = renderHook(() => useCompositionInput());
    const onEnterPress = vi.fn();
    const handler = result.current.createKeyDownHandler(onEnterPress, undefined, { isMobile: true });

    const preventDefault = vi.fn();
    // Emulate virtual soft-keyboard Return key: key is 'Enter', shiftKey/metaKey/ctrlKey are false
    handler({
      key: 'Enter',
      shiftKey: false,
      metaKey: false,
      ctrlKey: false,
      preventDefault,
    } as unknown as React.KeyboardEvent);

    // Bare Enter should be passed through for default textarea newline insertion
    expect(preventDefault).not.toHaveBeenCalled();
    expect(onEnterPress).not.toHaveBeenCalled();
  });

  it('submits on Cmd+Enter on mobile/tablet hardware keyboards', () => {
    const { result } = renderHook(() => useCompositionInput());
    const onEnterPress = vi.fn();
    const handler = result.current.createKeyDownHandler(onEnterPress, undefined, { isMobile: true });

    const preventDefault = vi.fn();
    handler({
      key: 'Enter',
      shiftKey: false,
      metaKey: true,
      ctrlKey: false,
      preventDefault,
    } as unknown as React.KeyboardEvent);

    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(onEnterPress).toHaveBeenCalledTimes(1);
  });

  it('submits on Ctrl+Enter on mobile/tablet hardware keyboards', () => {
    const { result } = renderHook(() => useCompositionInput());
    const onEnterPress = vi.fn();
    const handler = result.current.createKeyDownHandler(onEnterPress, undefined, { isMobile: true });

    const preventDefault = vi.fn();
    handler({
      key: 'Enter',
      shiftKey: false,
      metaKey: false,
      ctrlKey: true,
      preventDefault,
    } as unknown as React.KeyboardEvent);

    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(onEnterPress).toHaveBeenCalledTimes(1);
  });

  it('does NOT submit when IME composition is active', () => {
    const { result } = renderHook(() => useCompositionInput());
    const onEnterPress = vi.fn();
    const handler = result.current.createKeyDownHandler(onEnterPress, undefined, { isMobile: false });

    // Start composition
    act(() => {
      result.current.compositionHandlers.onCompositionStartCapture();
    });

    const preventDefault = vi.fn();
    handler({
      key: 'Enter',
      shiftKey: false,
      preventDefault,
    } as unknown as React.KeyboardEvent);

    expect(preventDefault).not.toHaveBeenCalled();
    expect(onEnterPress).not.toHaveBeenCalled();

    // End composition
    act(() => {
      result.current.compositionHandlers.onCompositionEndCapture();
    });

    handler({
      key: 'Enter',
      shiftKey: false,
      preventDefault,
    } as unknown as React.KeyboardEvent);

    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(onEnterPress).toHaveBeenCalledTimes(1);
  });
});
