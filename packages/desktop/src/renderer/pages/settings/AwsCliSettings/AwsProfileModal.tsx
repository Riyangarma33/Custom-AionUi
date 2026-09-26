/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Form, Input, Message, Modal, Select, Tag } from '@arco-design/web-react';
import { useTranslation } from 'react-i18next';
import {
  type AwsProfileSummary,
  type AwsSaveProfileRequest,
  type AwsSsoSessionSummary,
  awsCliService,
} from '@/renderer/services/awsCliService';

interface AwsProfileModalProps {
  visible: boolean;
  profile: AwsProfileSummary | null;
  allProfiles?: AwsProfileSummary[];
  ssoSessions?: AwsSsoSessionSummary[];
  onClose: () => void;
  onSuccess: () => void;
  onOpenAddSsoSession?: () => void;
}

export const AwsProfileModal: React.FC<AwsProfileModalProps> = ({
  visible,
  profile,
  allProfiles = [],
  ssoSessions = [],
  onClose,
  onSuccess,
  onOpenAddSsoSession,
}) => {
  const { t } = useTranslation();
  const [form] = Form.useForm();
  const [authMethod, setAuthMethod] = useState<string>('sso');
  const [selectedSsoSessionName, setSelectedSsoSessionName] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Fallback: extract from allProfiles if ssoSessions array is empty
  const effectiveSsoSessions = useMemo(() => {
    if (ssoSessions.length > 0) return ssoSessions;
    const map = new Map<string, { startUrl: string; region: string }>();
    for (const p of allProfiles) {
      if (p.sso_session && !map.has(p.sso_session)) {
        map.set(p.sso_session, {
          startUrl: p.sso_start_url || '',
          region: p.sso_region || p.region || '',
        });
      }
    }
    return Array.from(map.entries()).map(([name, data]) => ({
      name,
      sso_start_url: data.startUrl,
      sso_region: data.region,
      sso_registration_scopes: 'sso:account:access',
    }));
  }, [ssoSessions, allProfiles]);

  const selectedSessionData = useMemo(() => {
    return effectiveSsoSessions.find((s) => s.name === selectedSsoSessionName);
  }, [effectiveSsoSessions, selectedSsoSessionName]);

  // Options for Assume Role source_profile select
  const sourceProfileOptions = useMemo(() => {
    return allProfiles.map((p) => ({
      label: p.name,
      value: p.name,
    }));
  }, [allProfiles]);

  useEffect(() => {
    if (visible) {
      if (profile) {
        const method = profile.auth_method === 'console_login' ? 'console_login' : profile.auth_method;
        setAuthMethod(method);
        setSelectedSsoSessionName(profile.sso_session || null);

        form.setFieldsValue({
          name: profile.name,
          authMethod: method,
          region: profile.region || '',
          output: profile.output || 'json',
          sso_session: profile.sso_session || '',
          sso_account_id: profile.sso_account_id || '',
          sso_role_name: profile.sso_role_name || '',
          login_session: profile.login_session || '',
          role_arn: profile.role_arn || '',
          source_profile: profile.source_profile || '',
          aws_access_key_id: '',
          aws_secret_access_key: '',
          raw_config_section: '',
        });
      } else {
        setAuthMethod('sso');
        setSelectedSsoSessionName(null);
        form.resetFields();
        form.setFieldsValue({
          authMethod: 'sso',
          output: 'json',
          region: 'ap-southeast-1',
        });
      }
    }
  }, [visible, profile, form]);

  const handleSsoSessionChange = (val: string) => {
    setSelectedSsoSessionName(val);
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validate();
      setSaving(true);

      const sessionObj = effectiveSsoSessions.find((s) => s.name === values.sso_session);

      const payload: AwsSaveProfileRequest = {
        name: values.name.trim(),
        original_name: profile?.name,
        region: values.region?.trim() || undefined,
        output: values.output?.trim() || undefined,
        auth_method: authMethod,
        sso_session: values.sso_session?.trim() || undefined,
        sso_start_url: sessionObj?.sso_start_url || undefined,
        sso_region: sessionObj?.sso_region || undefined,
        sso_account_id: values.sso_account_id?.trim() || undefined,
        sso_role_name: values.sso_role_name?.trim() || undefined,
        login_session: values.login_session?.trim() || undefined,
        role_arn: values.role_arn?.trim() || undefined,
        source_profile: values.source_profile?.trim() || undefined,
        aws_access_key_id: values.aws_access_key_id?.trim() || undefined,
        aws_secret_access_key: values.aws_secret_access_key?.trim() || undefined,
        raw_config_section: values.raw_config_section?.trim() || undefined,
      };

      await awsCliService.saveProfile(payload);
      Message.success(t('settings.awsProfileSaved', { defaultValue: 'AWS profile saved successfully' }));
      onSuccess();
      onClose();
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'error' in err) return;
      const msg = err instanceof Error ? err.message : String(err);
      Message.error(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={
        <div
          className='overflow-hidden'
          style={{ maxWidth: 'calc(min(100vw - 24px, 580px) - 96px)' }}
        >
          <span
            className='truncate block text-14px font-medium'
            title={
              profile
                ? `${t('settings.awsEditProfile', { defaultValue: 'Edit Profile' })}: ${profile.name}`
                : t('settings.awsAddProfile', { defaultValue: 'Add AWS CLI Profile' })
            }
          >
            {profile
              ? `${t('settings.awsEditProfile', { defaultValue: 'Edit Profile' })}: ${profile.name}`
              : t('settings.awsAddProfile', { defaultValue: 'Add AWS CLI Profile' })}
          </span>
        </div>
      }
      visible={visible}
      onCancel={onClose}
      onOk={handleSubmit}
      okButtonProps={{ loading: saving }}
      okText={t('common.save', { defaultValue: 'Save Profile' })}
      cancelText={t('common.cancel', { defaultValue: 'Cancel' })}
      style={{ width: 'calc(100vw - 24px)', maxWidth: 580 }}
    >
      <div className='flex flex-col gap-12px pt-8px'>
        <Alert
          type='info'
          content={t('settings.awsBackupNotice', {
            defaultValue:
              'A timestamped backup of ~/.aws/config is automatically created before any modification is saved.',
          })}
        />

        <Form form={form} layout='vertical' className='w-full'>
          <Form.Item
            label={t('settings.awsProfileName', { defaultValue: 'Profile Name' })}
            field='name'
            rules={[{ required: true, message: 'Please enter profile name' }]}
          >
            <Input placeholder='e.g. production-admin or AryaNoble - SFA' />
          </Form.Item>

          <Form.Item
            label={t('settings.awsAuthMethod', { defaultValue: 'Authentication Type' })}
            field='authMethod'
          >
            <Select
              value={authMethod}
              onChange={(val) => setAuthMethod(val)}
              options={[
                { value: 'sso', label: 'IAM Identity Center (SSO)' },
                { value: 'console_login', label: 'AWS Console Login (aws login)' },
                { value: 'assume_role', label: 'Assume IAM Role (role_arn + source_profile)' },
                { value: 'static_key', label: 'Static Access Key (Direct credentials)' },
                { value: 'raw', label: 'Custom / Raw INI Section' },
              ]}
            />
          </Form.Item>

          {/* SSO Fields — locked strictly to existing sessions */}
          {authMethod === 'sso' && (
            <>
              <Form.Item
                label={
                  <div className='flex items-center justify-between w-full'>
                    <span>{t('settings.awsSsoSession', { defaultValue: 'SSO Session' })}</span>
                    {onOpenAddSsoSession && (
                      <Button
                        type='text'
                        size='mini'
                        className='!p-0 text-12px text-primary hover:underline'
                        onClick={() => {
                          onClose();
                          onOpenAddSsoSession();
                        }}
                      >
                        + {t('settings.awsAddSsoSession', { defaultValue: 'Add new SSO Session' })}
                      </Button>
                    )}
                  </div>
                }
                field='sso_session'
                rules={[{ required: true, message: 'Please select an existing SSO session' }]}
                extra={
                  effectiveSsoSessions.length === 0
                    ? 'No SSO sessions found. Please click "+ Add new SSO Session" above to configure one.'
                    : 'Select from configured IAM Identity Center portal sessions on this VPS'
                }
              >
                <Select
                  showSearch
                  allowClear
                  placeholder='Select configured SSO session...'
                  onChange={handleSsoSessionChange}
                  options={effectiveSsoSessions.map((s) => ({
                    label: `${s.name} (${s.sso_region || 'global'})`,
                    value: s.name,
                  }))}
                />
              </Form.Item>

              {/* Portal details preview tag */}
              {selectedSessionData && (
                <div className='p-10px rounded-6px bg-[var(--color-fill-2)] border border-[var(--color-border-2)] text-12px mb-16px flex flex-col gap-4px'>
                  <div className='flex items-center gap-6px'>
                    <span className='text-t-secondary font-medium'>Portal URL:</span>
                    <span className='font-mono text-primary truncate max-w-400px' title={selectedSessionData.sso_start_url}>
                      {selectedSessionData.sso_start_url}
                    </span>
                  </div>
                  <div className='flex items-center gap-6px'>
                    <span className='text-t-secondary font-medium'>Region:</span>
                    <Tag size='small' color='arcoblue'>
                      {selectedSessionData.sso_region}
                    </Tag>
                  </div>
                </div>
              )}

              <div className='grid grid-cols-2 gap-12px'>
                <Form.Item
                  label={t('settings.awsSsoAccountId', { defaultValue: 'SSO Account ID' })}
                  field='sso_account_id'
                  rules={[{ required: true, message: 'Please enter 12-digit AWS Account ID' }]}
                >
                  <Input placeholder='12-digit AWS Account ID' maxLength={12} />
                </Form.Item>

                <Form.Item
                  label={t('settings.awsSsoRoleName', { defaultValue: 'SSO Role Name' })}
                  field='sso_role_name'
                  rules={[{ required: true, message: 'Please enter SSO role name' }]}
                >
                  <Input placeholder='e.g. AdministratorAccess or ReadOnly' />
                </Form.Item>
              </div>
            </>
          )}

          {/* Console Login Fields */}
          {authMethod === 'console_login' && (
            <Form.Item
              label={t('settings.awsLoginSession', { defaultValue: 'Login Session Identifier / ARN (Optional)' })}
              field='login_session'
              extra={t('settings.awsLoginSessionExtra', {
                defaultValue:
                  'Optional. AWS CLI will automatically generate and record your console session ARN during your first login.',
              })}
            >
              <Input
                placeholder={
                  profile?.login_session
                    ? profile.login_session
                    : 'Auto-populated by AWS CLI on first login'
                }
              />
            </Form.Item>
          )}

          {/* Assume Role Fields */}
          {authMethod === 'assume_role' && (
            <>
              <Form.Item
                label={t('settings.awsRoleArn', { defaultValue: 'Target Role ARN' })}
                field='role_arn'
                rules={[{ required: true, message: 'Please enter target role ARN' }]}
              >
                <Input placeholder='arn:aws:iam::123456789012:role/RoleName' />
              </Form.Item>

              <Form.Item
                label={t('settings.awsSourceProfile', { defaultValue: 'Source Profile' })}
                field='source_profile'
                rules={[{ required: true, message: 'Please select or enter source profile' }]}
                extra='Profile containing credentials used to assume the target role'
              >
                <Select
                  showSearch
                  allowCreate
                  placeholder='Select or type source profile...'
                  options={sourceProfileOptions}
                />
              </Form.Item>
            </>
          )}

          {/* Static Key Fields */}
          {authMethod === 'static_key' && (
            <>
              <Form.Item
                label={t('settings.awsAccessKeyId', { defaultValue: 'AWS Access Key ID' })}
                field='aws_access_key_id'
              >
                <Input placeholder='AKIA...' />
              </Form.Item>
              <Form.Item
                label={t('settings.awsSecretAccessKey', { defaultValue: 'AWS Secret Access Key' })}
                field='aws_secret_access_key'
                extra='Credentials are saved securely to ~/.aws/credentials with mode 600 and never returned in UI.'
              >
                <Input.Password placeholder='Enter secret access key' />
              </Form.Item>
            </>
          )}

          {/* Raw INI Section */}
          {authMethod === 'raw' && (
            <Form.Item
              label={t('settings.awsRawSection', { defaultValue: 'Raw Section Content' })}
              field='raw_config_section'
              extra='Enter key = value lines for this profile section'
            >
              <Input.TextArea rows={5} placeholder={'region = ap-southeast-1\noutput = json'} />
            </Form.Item>
          )}

          {/* Common Region and Output */}
          <div className='grid grid-cols-2 gap-12px'>
            <Form.Item
              label={t('settings.awsDefaultRegion', { defaultValue: 'Default Region' })}
              field='region'
            >
              <Input placeholder='e.g. ap-southeast-1, us-east-1' />
            </Form.Item>
            <Form.Item
              label={t('settings.awsOutputFormat', { defaultValue: 'Output Format' })}
              field='output'
            >
              <Select
                options={[
                  { value: 'json', label: 'json' },
                  { value: 'yaml', label: 'yaml' },
                  { value: 'text', label: 'text' },
                  { value: 'table', label: 'table' },
                ]}
              />
            </Form.Item>
          </div>
        </Form>
      </div>
    </Modal>
  );
};
