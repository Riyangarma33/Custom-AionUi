/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { Alert, Form, Input, Message, Modal } from '@arco-design/web-react';
import { useTranslation } from 'react-i18next';
import {
  type AwsSaveSsoSessionRequest,
  type AwsSsoSessionSummary,
  awsCliService,
} from '@/renderer/services/awsCliService';

interface AwsSsoSessionModalProps {
  visible: boolean;
  session?: AwsSsoSessionSummary | null;
  onClose: () => void;
  onSuccess: (newSessionName?: string) => void;
}

export const AwsSsoSessionModal: React.FC<AwsSsoSessionModalProps> = ({
  visible,
  session,
  onClose,
  onSuccess,
}) => {
  const { t } = useTranslation();
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible) {
      if (session) {
        form.setFieldsValue({
          name: session.name,
          sso_start_url: session.sso_start_url,
          sso_region: session.sso_region,
          sso_registration_scopes: session.sso_registration_scopes || 'sso:account:access',
        });
      } else {
        form.resetFields();
        form.setFieldsValue({
          sso_region: 'ap-southeast-1',
          sso_registration_scopes: 'sso:account:access',
        });
      }
    }
  }, [visible, session, form]);

  const handleSubmit = async () => {
    try {
      const values = await form.validate();
      setSaving(true);

      const payload: AwsSaveSsoSessionRequest = {
        name: values.name.trim(),
        sso_start_url: values.sso_start_url.trim(),
        sso_region: values.sso_region.trim(),
        sso_registration_scopes: values.sso_registration_scopes?.trim() || undefined,
      };

      await awsCliService.saveSsoSession(payload);
      Message.success(
        t('settings.awsSsoSessionSaved', { defaultValue: 'SSO session configuration saved successfully' })
      );
      onSuccess(payload.name);
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
          style={{ maxWidth: 'calc(min(100vw - 24px, 540px) - 96px)' }}
        >
          <span
            className='truncate block text-14px font-medium'
            title={
              session
                ? `${t('settings.awsEditSsoSession', { defaultValue: 'Edit SSO Session' })}: ${session.name}`
                : t('settings.awsAddSsoSession', { defaultValue: 'Add AWS SSO Session' })
            }
          >
            {session
              ? `${t('settings.awsEditSsoSession', { defaultValue: 'Edit SSO Session' })}: ${session.name}`
              : t('settings.awsAddSsoSession', { defaultValue: 'Add AWS SSO Session' })}
          </span>
        </div>
      }
      visible={visible}
      onCancel={onClose}
      onOk={handleSubmit}
      okButtonProps={{ loading: saving }}
      okText={t('common.save', { defaultValue: 'Save Session' })}
      cancelText={t('common.cancel', { defaultValue: 'Cancel' })}
      style={{ width: 'calc(100vw - 24px)', maxWidth: 540 }}
    >
      <div className='flex flex-col gap-12px pt-8px'>
        <Alert
          type='info'
          content={t('settings.awsSsoSessionNotice', {
            defaultValue:
              'Defines a shared AWS IAM Identity Center portal. Profiles will link to this session and share its login token.',
          })}
        />

        <Form form={form} layout='vertical' className='w-full'>
          <Form.Item
            label={t('settings.awsSsoSessionName', { defaultValue: 'SSO Session Name' })}
            field='name'
            rules={[{ required: true, message: 'Please enter session name' }]}
            extra='Identifier used in ~/.aws/config, e.g. AryaNoble or AcmeCorp'
          >
            <Input placeholder='e.g. AcmeCorp' disabled={Boolean(session)} />
          </Form.Item>

          <Form.Item
            label={t('settings.awsSsoStartUrl', { defaultValue: 'SSO Start URL' })}
            field='sso_start_url'
            rules={[{ required: true, message: 'Please enter start URL' }]}
            extra='AWS IAM Identity Center portal URL'
          >
            <Input placeholder='https://my-portal.awsapps.com/start/#' />
          </Form.Item>

          <div className='grid grid-cols-2 gap-12px'>
            <Form.Item
              label={t('settings.awsSsoRegion', { defaultValue: 'SSO Region' })}
              field='sso_region'
              rules={[{ required: true, message: 'Please enter region' }]}
            >
              <Input placeholder='e.g. ap-southeast-1, us-east-1' />
            </Form.Item>

            <Form.Item
              label={t('settings.awsSsoRegistrationScopes', { defaultValue: 'Registration Scopes' })}
              field='sso_registration_scopes'
            >
              <Input placeholder='sso:account:access' />
            </Form.Item>
          </div>
        </Form>
      </div>
    </Modal>
  );
};
