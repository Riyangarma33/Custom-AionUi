/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TForkCapability } from './forkConversation';

/**
 * Whether the in-place rewind entry point should be shown on one message.
 *
 * Scoped to the builtin `aionrs` agent in Phase 3.8:
 * - Only user messages (`isUserMessage`) can be rewound.
 * - Only `aionrs` conversations (`conversationType === 'aionrs'`).
 * - Gated on `forkCapability`:
 *   - The last message (HEAD) is always rewindable.
 *   - Mid-history messages require `forkCapability.at_turn` and `hasTurnAnchor`.
 */
export function isRevertEnabled(
  conversationType: string | undefined,
  forkCapability: TForkCapability | undefined,
  position: { isUserMessage: boolean; isLastMessage: boolean; hasTurnAnchor?: boolean }
): boolean {
  if (!position.isUserMessage) return false;
  if (conversationType !== 'aionrs') return false;
  if (!forkCapability) return false;
  if (position.isLastMessage) return true;
  return forkCapability.at_turn;
}
