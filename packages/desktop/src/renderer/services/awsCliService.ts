/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { httpRequest } from '@/common/adapter/httpBridge';

export interface AwsRuntimeInfo {
  installed: boolean;
  version: string | null;
  user: string;
  config_path: string;
  credentials_path: string;
  sso_cache_path: string;
  login_cache_path: string;
}

export type AwsProfileAuthMethod =
  | 'sso'
  | 'console_login'
  | 'assume_role'
  | 'static_key'
  | 'credential_process'
  | 'unknown';

export interface AwsCallerIdentity {
  account: string;
  arn: string;
  user_id: string;
}

export interface AwsProfileSummary {
  name: string;
  auth_method: AwsProfileAuthMethod;
  region: string | null;
  output: string | null;
  sso_session: string | null;
  sso_start_url: string | null;
  sso_region: string | null;
  sso_account_id: string | null;
  sso_role_name: string | null;
  login_session: string | null;
  role_arn: string | null;
  source_profile: string | null;
  has_access_key: boolean;
  masked_access_key_id: string | null;
  identity: AwsCallerIdentity | null;
  status: 'valid' | 'expired' | 'missing_credentials' | 'untested' | 'error';
  last_checked: string | null;
  error_message: string | null;
}

export type AwsJobState =
  | 'starting'
  | 'needs_browser'
  | 'needs_user_code'
  | 'pending'
  | 'success'
  | 'failed'
  | 'expired'
  | 'cancelled';

export interface AwsLoginJobStatus {
  job_id: string;
  profile_name: string;
  auth_type: string;
  state: AwsJobState;
  started_at: number;
  expires_at: number;
  verification_uri: string | null;
  user_code: string | null;
  sign_in_url: string | null;
  error_message: string | null;
  identity: AwsCallerIdentity | null;
}

export interface AwsTestIdentityResponse {
  profile: string;
  status: 'valid' | 'expired' | 'missing_credentials' | 'error';
  identity: AwsCallerIdentity | null;
  error_message: string | null;
}

export interface AwsSaveProfileRequest {
  name: string;
  original_name?: string;
  region?: string;
  output?: string;
  auth_method?: string;
  sso_session?: string;
  sso_start_url?: string;
  sso_region?: string;
  sso_account_id?: string;
  sso_role_name?: string;
  login_session?: string;
  role_arn?: string;
  source_profile?: string;
  aws_access_key_id?: string;
  aws_secret_access_key?: string;
  raw_config_section?: string;
}

export interface AwsSaveSsoSessionRequest {
  name: string;
  sso_start_url: string;
  sso_region: string;
  sso_registration_scopes?: string;
}

export interface AwsSsoSessionSummary {
  name: string;
  sso_start_url: string;
  sso_region: string;
  sso_registration_scopes: string | null;
}

export const awsCliService = {
  getRuntimeInfo: () => httpRequest<AwsRuntimeInfo>('GET', '/api/aws/runtime'),
  getProfiles: () => httpRequest<AwsProfileSummary[]>('GET', '/api/aws/profiles'),
  getSsoSessions: () => httpRequest<AwsSsoSessionSummary[]>('GET', '/api/aws/sso-sessions'),
  saveSsoSession: (payload: AwsSaveSsoSessionRequest) => httpRequest<void>('POST', '/api/aws/sso-sessions', payload),
  testIdentity: (profile: string) =>
    httpRequest<AwsTestIdentityResponse>('POST', '/api/aws/profiles/test-identity', { profile }),
  startLogin: (profile: string, authType?: string) =>
    httpRequest<AwsLoginJobStatus>('POST', '/api/aws/login', { profile, auth_type: authType }),
  getJobStatus: (jobId: string) => httpRequest<AwsLoginJobStatus>('GET', `/api/aws/jobs/${jobId}`),
  submitCode: (jobId: string, code: string) =>
    httpRequest<AwsLoginJobStatus>('POST', `/api/aws/jobs/${jobId}/submit-code`, { code }),
  cancelJob: (jobId: string) => httpRequest<AwsLoginJobStatus>('POST', `/api/aws/jobs/${jobId}/cancel`),
  saveProfile: (payload: AwsSaveProfileRequest) => httpRequest<void>('POST', '/api/aws/profiles', payload),
  deleteProfile: (name: string) => httpRequest<void>('DELETE', `/api/aws/profiles/${encodeURIComponent(name)}`),
};
