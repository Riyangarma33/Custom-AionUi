/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { parseError } from '@/common/utils';
import type { TFunction } from 'i18next';

/**
 * Map a revert API failure to a user-facing message. The backend carries stable
 * `REVERT_*` reason prefixes (409/422); anything else falls back to the raw
 * parsed message.
 */
export function getRevertErrorMessage(error: unknown, t: TFunction): string {
  const raw = parseError(error);
  if (raw.includes('REVERT_TURN_IN_FLIGHT')) {
    return t('messages.revert.errorTurnInFlight', { defaultValue: 'Wait for the current reply to finish before rewinding' });
  }
  if (raw.includes('REVERT_POINT_UNSUPPORTED')) {
    return t('messages.revert.errorPointUnsupported', { defaultValue: 'This message cannot be used as a rewind point' });
  }
  if (raw.includes('REVERT_UNSUPPORTED')) {
    return t('messages.revert.errorUnsupported', { defaultValue: 'This agent does not support rewind' });
  }
  if (raw.includes('REVERT_CONCURRENT_MODIFICATION')) {
    return t('messages.revert.errorConcurrentModification', { defaultValue: 'Conversation was modified concurrently' });
  }
  return t('messages.revert.errorGeneric', { message: raw, defaultValue: 'Failed to rewind: {{message}}' });
}
