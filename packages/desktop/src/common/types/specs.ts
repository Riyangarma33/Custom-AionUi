/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

export type SpecType = 'feature' | 'bugfix';
export type SpecWorkflow = 'requirements_first' | 'design_first' | 'quick_spec';
export type SpecPhase = 'requirements' | 'design' | 'tasks' | 'executing' | 'completed';
export type TaskStatus = 'todo' | 'in_progress' | 'completed';
export type SpecLocationType = 'aion' | 'kiro' | 'openspec';

export interface SpecTask {
  id: string;
  line_number: number;
  status: TaskStatus;
  title: string;
  description?: string;
  wave?: number;
  parent_id?: string;
  refs?: string[];
  indent?: number;
}

export interface SpecWave {
  number: number;
  title: string;
  tasks: SpecTask[];
}

export interface WorkspaceSpecSummary {
  id: string;
  title: string;
  spec_type: SpecType;
  workflow: SpecWorkflow;
  current_phase: SpecPhase;
  active_wave: number;
  completed_tasks: number;
  total_tasks: number;
  directory_path: string;
  location_type: SpecLocationType;
  created_at: number;
  updated_at: number;
  linked_conversation_id?: string;
}

export interface SpecDetail {
  summary: WorkspaceSpecSummary;
  requirements_md?: string;
  design_md?: string;
  tasks_md?: string;
  waves: SpecWave[];
  mtime: number;
  file_mtimes: Record<string, number>;
}

export interface CreateSpecRequest {
  title: string;
  spec_type?: SpecType;
  workflow?: SpecWorkflow;
  slug?: string;
}

export interface UpdateSpecFileRequest {
  content: string;
  expected_mtime?: number;
}

export interface PatchTaskRequest {
  status: TaskStatus;
  expected_mtime?: number;
}

export interface TransitionPhaseRequest {
  phase: SpecPhase;
}

export interface LinkConversationRequest {
  conversation_id?: string;
}

export const getRelativeSpecPath = (summary: {
  directory_path?: string;
  location_type?: SpecLocationType;
  id: string;
}): string => {
  if (summary.directory_path) {
    const matched = summary.directory_path.match(/\.(aion|kiro|specs)[\/\\].*$/);
    if (matched) return matched[0].replace(/\\/g, '/');
  }
  const loc = summary.location_type || 'aion';
  const folder = loc === 'openspec' || (loc as string) === 'open_spec' ? '.specs' : `.${loc}/specs`;
  return `${folder}/${summary.id}`;
};
