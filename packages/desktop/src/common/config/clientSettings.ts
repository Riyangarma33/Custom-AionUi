import type { SpeechToTextConfig } from '@/common/types/provider/speech';
import type { IMcpServer, TProviderWithModel } from '@/common/config/storage';

export type GoogleClientSetting = {
  proxy?: string;
};

export type ImageGenerationModelSetting = TProviderWithModel & {
  switch?: boolean;
};

/**
 * A conversation folder (Phase 3.12, Track A).
 *
 * Folder membership on the conversation itself lives in `extra.group_id`; this
 * catalog exists so that empty folders, rename, ordering and nesting can be
 * represented without deriving everything from conversations. The key is
 * intentionally `group_id` — **never** `folder_id`, which is a filesystem root
 * identity owned by `aionui-project`.
 *
 * `workspace` scopes the folder to the client-derived project group (the
 * `extra.workspace` path string), matching the grouping key the left panel
 * already uses. `parent_id` is persisted even though the first release only
 * renders one visual level.
 */
export type ConversationFolder = {
  group_id: string;
  workspace: string;
  parent_id: string | null;
  name: string;
  order_key: number;
};

export type ClientBusinessSettingMap = {
  'google.config': GoogleClientSetting;
  'mcp.config': IMcpServer[] | undefined;
  'tools.imageGenerationModel': ImageGenerationModelSetting | undefined;
  'tools.speechToText': SpeechToTextConfig | undefined;
  'acp.promptTimeout': number | undefined;
  'acp.agentIdleTimeout': number | undefined;
  /**
   * Preview size ceiling for text-like files, **in whole megabytes**.
   *
   * Stored in MB rather than bytes because that is the unit the settings field
   * presents; the byte conversion belongs to the one place that compares against a
   * file size (`resolvePreviewPayload`). Keeping the stored unit and the displayed
   * unit identical means a value read back from storage never has to be
   * reinterpreted.
   *
   * `undefined` means "never configured" and falls back to the built-in default —
   * distinct from any number the user could enter.
   */
  'preview.textSizeLimitMb': number | undefined;
  /**
   * Conversation folder catalog for the left panel (Phase 3.12, Track A).
   *
   * Stored in the user-scoped `client_preferences` KV through the generic
   * `/api/settings/client` endpoint — adding this key here is the entire
   * persistence integration; no backend handler or whitelist change is needed.
   */
  'sidebar.conversationFolders': ConversationFolder[] | undefined;
};

export type ClientBusinessSettingKey = keyof ClientBusinessSettingMap;
