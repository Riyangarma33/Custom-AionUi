/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import RevertDock from '@/renderer/pages/conversation/components/RevertDock';

vi.mock('@icon-park/react', () => ({
  Undo: () => <span data-testid='undo-icon' />,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { count?: number; defaultValue?: string }) => {
      if (options?.count !== undefined && options?.defaultValue) {
        return options.defaultValue.replace('{{count}}', String(options.count));
      }
      return options?.defaultValue ?? key;
    },
  }),
}));

describe('RevertDock', () => {
  it('renders rolled back count and handles restore click', () => {
    const onRestore = vi.fn();
    render(<RevertDock rolledBackCount={3} onRestore={onRestore} />);

    expect(screen.getByTestId('revert-dock')).toBeInTheDocument();
    expect(screen.getByTestId('revert-dock-count')).toHaveTextContent('3 rolled back message(s)');

    const restoreBtn = screen.getByTestId('revert-dock-restore-btn');
    expect(restoreBtn).toBeInTheDocument();
    fireEvent.click(restoreBtn);

    expect(onRestore).toHaveBeenCalledTimes(1);
  });
});
