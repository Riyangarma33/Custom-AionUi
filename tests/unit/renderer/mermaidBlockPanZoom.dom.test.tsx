/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import mermaid from 'mermaid';
import { LayoutContext } from '@/renderer/hooks/context/LayoutContext';
import React from 'react';

const renderMock = vi.hoisted(() => vi.fn());

vi.mock('mermaid', () => ({
  default: { initialize: vi.fn(), render: renderMock },
}));

vi.mock('@/renderer/pages/conversation/Preview', () => ({
  usePreviewContext: () => ({ openPreview: vi.fn() }),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('react-syntax-highlighter', () => ({
  default: ({ children }: { children?: React.ReactNode }) => <pre data-testid='mermaid-source'>{children}</pre>,
}));
vi.mock('react-syntax-highlighter/dist/esm/styles/hljs', () => ({ vs: {}, vs2015: {} }));

vi.mock('@arco-design/web-react', () => ({
  Message: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('@/renderer/utils/ui/clipboard', () => ({
  copyText: vi.fn().mockResolvedValue(undefined),
}));

// icon-park icons render as clickable spans that forward data-testid/title/onClick.
const makeIcon = vi.hoisted(
  () =>
    (name: string) =>
    ({
      ['data-testid']: testId,
      title,
      onClick,
    }: {
      ['data-testid']?: string;
      title?: string;
      onClick?: () => void;
    }) => <span data-icon={name} data-testid={testId} title={title} onClick={onClick} />
);

vi.mock('@icon-park/react', () => ({
  Copy: makeIcon('copy'),
  PreviewOpen: makeIcon('preview-open'),
  ZoomIn: makeIcon('zoom-in'),
  ZoomOut: makeIcon('zoom-out'),
  Refresh: makeIcon('refresh'),
  Close: makeIcon('close'),
}));

import MermaidBlock from '@/renderer/components/Markdown/MermaidBlock';
import { preserveMermaidLabelWrapping } from '@/renderer/components/Markdown/markdownUtils';

describe('Mermaid label wrapping serialization', () => {
  it('keeps wrapping on labels and descendants when moved to the zoom portal', () => {
    const result = preserveMermaidLabelWrapping('<svg xmlns="http://www.w3.org/2000/svg"><foreignObject width="200" height="72"><div xmlns="http://www.w3.org/1999/xhtml" style="white-space: nowrap"><span><p>long label</p></span></div></foreignObject></svg>');
    const svg = new DOMParser().parseFromString(result, 'image/svg+xml');
    expect(svg.querySelector('div')?.style.getPropertyPriority('white-space')).toBe('important');
    expect(svg.querySelector('p')?.style.whiteSpace).toBe('inherit');
    expect(svg.querySelector('foreignObject')?.getAttribute('width')).toBe('200');
  });

  it('leaves malformed SVG unchanged instead of replacing it with a parser error', () => {
    expect(preserveMermaidLabelWrapping('<svg><broken>')).toBe('<svg><broken>');
  });
});

// jsdom lacks the pointer capture API used by the drag handlers.
beforeAll(() => {
  Object.defineProperty(Element.prototype, 'setPointerCapture', {
    value: vi.fn(),
    configurable: true,
    writable: true,
  });
  Object.defineProperty(Element.prototype, 'hasPointerCapture', {
    value: vi.fn(() => false),
    configurable: true,
    writable: true,
  });
  Object.defineProperty(Element.prototype, 'releasePointerCapture', {
    value: vi.fn(),
    configurable: true,
    writable: true,
  });
});

describe('MermaidBlock pan/zoom', () => {
  beforeEach(() => {
    renderMock.mockReset().mockResolvedValue({ svg: '<svg width="120" height="80"></svg>' });
    document.documentElement.setAttribute('data-theme', 'light');
  });

  it('uses explicit desktop metrics with padded flowchart geometry', async () => {
    render(<MermaidBlock code={'graph TD; A-->B'} />);
    await screen.findByTestId('mermaid-diagram');
    expect(mermaid.initialize).toHaveBeenLastCalledWith(expect.objectContaining({
      themeVariables: { fontSize: '16px', fontFamily: 'sans-serif' },
      flowchart: { padding: 20, nodeSpacing: 50, rankSpacing: 50 },
    }));
  });

  it('embeds wrapping protection in the measured SVG instead of exposing overflowing labels', async () => {
    render(<MermaidBlock code={'graph TD; A["Long text with explicit<br/>line breaks"]'} />);
    await screen.findByTestId('mermaid-diagram');
    const config = vi.mocked(mermaid.initialize).mock.calls.at(-1)?.[0];
    expect(config?.themeCSS).toContain('white-space: break-spaces !important');
    expect(config?.themeCSS).toContain('white-space: inherit !important');
    expect(config?.themeCSS).not.toContain('overflow: visible');
  });

  it('remeasures when switching to mobile metrics', async () => {
    const desktop = { isMobile: false, siderCollapsed: false, setSiderCollapsed: vi.fn() };
    const { rerender } = render(<LayoutContext.Provider value={desktop}><MermaidBlock code={'graph TD; A-->B'} /></LayoutContext.Provider>);
    await screen.findByTestId('mermaid-diagram');
    rerender(<LayoutContext.Provider value={{ ...desktop, isMobile: true }}><MermaidBlock code={'graph TD; A-->B'} /></LayoutContext.Provider>);
    await waitFor(() => expect(mermaid.initialize).toHaveBeenLastCalledWith(expect.objectContaining({
      themeVariables: { fontSize: '14px', fontFamily: 'sans-serif' },
    })));
  });

  it('waits for fonts and skips measurement after unmount', async () => {
    let resolveFonts!: () => void;
    const original = Object.getOwnPropertyDescriptor(document, 'fonts');
    Object.defineProperty(document, 'fonts', { configurable: true, value: { ready: new Promise<void>((resolve) => { resolveFonts = resolve; }) } });
    try {
      const { unmount } = render(<MermaidBlock code={'graph TD; A-->B'} />);
      expect(renderMock).not.toHaveBeenCalled();
      unmount();
      await act(async () => { resolveFonts(); });
      expect(renderMock).not.toHaveBeenCalled();
    } finally {
      if (original) Object.defineProperty(document, 'fonts', original);
      else Reflect.deleteProperty(document, 'fonts');
    }
  });

  it('a failed diagram does not prevent the next diagram rendering', async () => {
    renderMock.mockRejectedValueOnce(new Error('invalid diagram'));
    const { unmount } = render(<MermaidBlock code={'invalid'} />);
    await waitFor(() => expect(renderMock).toHaveBeenCalledTimes(1));
    unmount();
    render(<MermaidBlock code={'graph TD; A-->B'} />);
    expect(await screen.findByTestId('mermaid-diagram')).toBeInTheDocument();
  });

  it('renders a static diagram without zoom controls by default', async () => {
    render(<MermaidBlock code={'graph TD; A-->B'} />);
    const diagram = await screen.findByTestId('mermaid-diagram');
    // Default path scrolls natively and exposes no zoom controls.
    expect(diagram.style.overflowX).toBe('auto');
    expect(screen.queryByTestId('mermaid-zoom-in')).toBeNull();
    expect(screen.queryByTestId('mermaid-zoom-reset')).toBeNull();
  });

  it('shows zoom controls and applies/resets scale when enablePanZoom is set', async () => {
    render(<MermaidBlock code={'graph TD; A-->B'} enablePanZoom />);
    const diagram = await screen.findByTestId('mermaid-diagram');
    // Pan viewport clips (hidden overflow) instead of native scroll.
    expect(diagram.style.overflow).toBe('hidden');

    const inner = diagram.firstElementChild as HTMLElement;
    expect(inner.style.transform).toContain('scale(1)');

    fireEvent.click(screen.getByTestId('mermaid-zoom-in'));
    expect(inner.style.transform).toContain('scale(1.25)');

    fireEvent.click(screen.getByTestId('mermaid-zoom-out'));
    expect(inner.style.transform).toContain('scale(1)');

    fireEvent.click(screen.getByTestId('mermaid-zoom-in'));
    fireEvent.click(screen.getByTestId('mermaid-zoom-reset'));
    expect(inner.style.transform).toContain('translate(0px, 0px) scale(1)');
  });

  it('caps narrow diagrams at their natural width so they render 1:1', async () => {
    renderMock.mockResolvedValue({ svg: '<svg viewBox="0 0 100 200" width="100%"></svg>' });
    render(<MermaidBlock code={'graph TD; A-->B'} />);
    const diagram = await screen.findByTestId('mermaid-diagram');
    expect(diagram.querySelector('svg')?.getAttribute('style')).toContain('max-width: min(100%, 100px)');
  });

  it('caps wide diagrams at the container width', async () => {
    renderMock.mockResolvedValue({ svg: '<svg viewBox="0 0 2000 100" width="100%"></svg>' });
    render(<MermaidBlock code={'graph TD; A-->B'} />);
    const diagram = await screen.findByTestId('mermaid-diagram');
    expect(diagram.querySelector('svg')?.getAttribute('style')).toContain('max-width: min(100%, 2000px)');
  });

  it('opens the zoom overlay when the static diagram is clicked', async () => {
    render(<MermaidBlock code={'graph TD; A-->B'} />);
    const diagram = await screen.findByTestId('mermaid-diagram');
    fireEvent.click(diagram);
    expect(screen.getByTestId('diagram-zoom-overlay')).toBeInTheDocument();
  });

  it('opens the zoom overlay on click without panning when drag-to-pan is enabled', async () => {
    render(<MermaidBlock code={'graph TD; A-->B'} enablePanZoom />);
    const diagram = await screen.findByTestId('mermaid-diagram');

    fireEvent.pointerDown(diagram, { pointerId: 1, button: 0, clientX: 10, clientY: 10 });
    fireEvent.pointerMove(diagram, { pointerId: 1, clientX: 12, clientY: 11 });
    fireEvent.pointerUp(diagram, { pointerId: 1 });

    const inner = diagram.firstElementChild as HTMLElement;
    expect(inner.style.transform).toContain('translate(0px, 0px) scale(1)');
    expect(screen.getByTestId('diagram-zoom-overlay')).toBeInTheDocument();
  });

  it('pans instead of opening the overlay when the pointer drags past the threshold', async () => {
    render(<MermaidBlock code={'graph TD; A-->B'} enablePanZoom />);
    const diagram = await screen.findByTestId('mermaid-diagram');

    fireEvent.pointerDown(diagram, { pointerId: 1, button: 0, clientX: 10, clientY: 10 });
    fireEvent.pointerMove(diagram, { pointerId: 1, clientX: 60, clientY: 40 });
    fireEvent.pointerUp(diagram, { pointerId: 1 });

    const inner = diagram.firstElementChild as HTMLElement;
    expect(inner.style.transform).toContain('translate(50px, 30px)');
    expect(screen.queryByTestId('mermaid-zoom-overlay')).toBeNull();
  });
});
