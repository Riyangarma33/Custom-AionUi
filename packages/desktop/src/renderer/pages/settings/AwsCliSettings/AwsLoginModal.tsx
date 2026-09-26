/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import { Alert, Button, Input, Message, Modal, Space, Spin, Typography } from '@arco-design/web-react';
import { ArrowRightUp, Check, Close, Copy, Loading, Refresh } from '@icon-park/react';
import { useTranslation } from 'react-i18next';
import {
  type AwsLoginJobStatus,
  type AwsProfileSummary,
  awsCliService,
} from '@/renderer/services/awsCliService';

interface AwsLoginModalProps {
  visible: boolean;
  profile: AwsProfileSummary | null;
  sessionTitle?: string | null;
  onClose: () => void;
  onSuccess: () => void;
}

export const AwsLoginModal: React.FC<AwsLoginModalProps> = ({
  visible,
  profile,
  sessionTitle,
  onClose,
  onSuccess,
}) => {
  const { t } = useTranslation();
  const [job, setJob] = useState<AwsLoginJobStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [authCode, setAuthCode] = useState('');
  const [submittingCode, setSubmittingCode] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const pollTimerRef = useRef<number | null>(null);

  const clearTimer = () => {
    if (pollTimerRef.current !== null) {
      window.clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  };

  const startLoginFlow = async (profileName: string) => {
    clearTimer();
    setLoading(true);
    setAuthCode('');
    try {
      const initialJob = await awsCliService.startLogin(profileName);
      setJob(initialJob);

      // Start polling
      pollTimerRef.current = window.setInterval(async () => {
        try {
          const updated = await awsCliService.getJobStatus(initialJob.job_id);
          setJob(updated);
          if (
            updated.state === 'success' ||
            updated.state === 'failed' ||
            updated.state === 'expired' ||
            updated.state === 'cancelled'
          ) {
            clearTimer();
            if (updated.state === 'success') {
              Message.success(t('settings.awsLoginSuccess', { defaultValue: 'Login successful!' }));
              onSuccess();
            }
          }
        } catch (err) {
          console.error('Failed to poll AWS login job status:', err);
        }
      }, 1500);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      Message.error(t('settings.awsLoginStartFailed', { defaultValue: 'Failed to start login: ' }) + msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (visible && profile) {
      void startLoginFlow(profile.name);
    } else {
      clearTimer();
      setJob(null);
    }
    return () => clearTimer();
  }, [visible, profile?.name]);

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard
      .writeText(text)
      .then(() => {
        Message.success(`${label} copied to clipboard`);
      })
      .catch(() => {
        Message.error('Failed to copy');
      });
  };

  const handleOpenUrl = (url: string) => {
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const handleSubmitCode = async () => {
    if (!job || !authCode.trim()) return;
    setSubmittingCode(true);
    try {
      const updated = await awsCliService.submitCode(job.job_id, authCode.trim());
      setJob(updated);
      Message.info(t('settings.awsCodeSubmitted', { defaultValue: 'Authorization code submitted' }));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      Message.error(msg);
    } finally {
      setSubmittingCode(false);
    }
  };

  const handleCancel = async () => {
    if (!job) return;
    setCancelling(true);
    try {
      const updated = await awsCliService.cancelJob(job.job_id);
      setJob(updated);
      clearTimer();
      Message.info(t('settings.awsLoginCancelled', { defaultValue: 'Login cancelled' }));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      Message.error(msg);
    } finally {
      setCancelling(false);
    }
  };

  const isJobActive =
    job &&
    (job.state === 'starting' ||
      job.state === 'needs_browser' ||
      job.state === 'needs_user_code' ||
      job.state === 'pending');

  return (
    <Modal
      title={
        <div
          className='flex items-center gap-8px overflow-hidden'
          style={{ maxWidth: 'calc(min(100vw - 24px, 560px) - 96px)' }}
        >
          <Refresh className={isJobActive ? 'animate-spin text-primary shrink-0' : 'shrink-0'} />
          <span
            className='min-w-0 flex-1 truncate block text-14px font-medium'
            title={
              sessionTitle
                ? `${t('settings.awsLoginSessionTitle', { defaultValue: 'AWS SSO Login' })} — ${sessionTitle}`
                : `${t('settings.awsLoginTitle', { defaultValue: 'AWS Login' })} — ${profile?.name}`
            }
          >
            {sessionTitle
              ? `${t('settings.awsLoginSessionTitle', { defaultValue: 'AWS SSO Login' })} — ${sessionTitle}`
              : `${t('settings.awsLoginTitle', { defaultValue: 'AWS Login' })} — ${profile?.name}`}
          </span>
        </div>
      }
      visible={visible}
      onCancel={() => {
        if (isJobActive) {
          void handleCancel();
        }
        onClose();
      }}
      footer={
        <div className='flex justify-between items-center w-full gap-8px flex-wrap'>
          <div>
            {isJobActive && (
              <Button
                status='danger'
                size='small'
                loading={cancelling}
                onClick={handleCancel}
              >
                {t('common.cancel', { defaultValue: 'Cancel Login' })}
              </Button>
            )}
          </div>
          <Space>
            {job?.state === 'failed' || job?.state === 'expired' || job?.state === 'cancelled' ? (
              <Button
                type='primary'
                size='small'
                onClick={() => profile && void startLoginFlow(profile.name)}
              >
                {t('common.retry', { defaultValue: 'Retry' })}
              </Button>
            ) : null}
            <Button size='small' onClick={onClose}>
              {job?.state === 'success' ? t('common.done', { defaultValue: 'Done' }) : t('common.close', { defaultValue: 'Close' })}
            </Button>
          </Space>
        </div>
      }
      style={{ width: 'calc(100vw - 24px)', maxWidth: 560 }}
    >
      <div className='flex flex-col gap-16px py-8px'>
        {loading && !job && (
          <div className='flex flex-col items-center justify-center py-32px gap-12px text-t-secondary'>
            <Spin size={28} />
            <span className='text-14px'>
              {t('settings.awsInitializingLogin', { defaultValue: 'Initializing AWS CLI login session...' })}
            </span>
          </div>
        )}

        {/* SSO flow with device code */}
        {job?.state === 'needs_browser' && (
          <div className='flex flex-col gap-16px'>
            <Alert
              type='info'
              content={t('settings.awsSsoAlert', {
                defaultValue:
                  'Open the verification URL below in your browser and verify the displayed code matches.',
              })}
            />

            {job.verification_uri && (
              <div className='flex flex-col gap-6px'>
                <Typography.Text type='secondary' className='text-12px'>
                  1. {t('settings.awsVerificationUrl', { defaultValue: 'Verification URL' })}:
                </Typography.Text>
                <div className='flex flex-col sm:flex-row sm:items-center justify-between gap-8px p-10px rounded-6px bg-[var(--color-fill-2)] border border-[var(--color-border-2)]'>
                  <span className='text-12px sm:text-13px font-mono break-all select-all flex-1 text-primary'>
                    {job.verification_uri}
                  </span>
                  <Space size='mini' className='self-end sm:self-auto shrink-0'>
                    <Button
                      size='mini'
                      icon={<Copy />}
                      onClick={() => handleCopy(job.verification_uri!, 'URL')}
                    >
                      {t('common.copy', { defaultValue: 'Copy' })}
                    </Button>
                    <Button
                      size='mini'
                      type='primary'
                      icon={<ArrowRightUp />}
                      onClick={() => handleOpenUrl(job.verification_uri!)}
                    >
                      {t('common.open', { defaultValue: 'Open' })}
                    </Button>
                  </Space>
                </div>
              </div>
            )}

            {job.user_code && (
              <div className='flex flex-col gap-6px'>
                <Typography.Text type='secondary' className='text-12px'>
                  2. {t('settings.awsUserCode', { defaultValue: 'Confirmation Code' })}:
                </Typography.Text>
                <div className='flex items-center justify-between gap-8px p-10px sm:p-12px rounded-6px bg-[var(--color-fill-2)] border border-[var(--color-border-2)]'>
                  <span className='text-18px sm:text-22px font-bold font-mono tracking-wider select-all text-primary truncate'>
                    {job.user_code}
                  </span>
                  <Button
                    size='small'
                    icon={<Copy />}
                    onClick={() => handleCopy(job.user_code!, 'Code')}
                    className='shrink-0'
                  >
                    {t('settings.copyCode', { defaultValue: 'Copy Code' })}
                  </Button>
                </div>
              </div>
            )}

            <div className='flex items-center justify-center gap-8px p-12px text-t-secondary text-13px'>
              <Spin size={16} />
              <span>
                {t('settings.awsWaitingBrowserApproval', {
                  defaultValue: 'Waiting for approval in IAM Identity Center...',
                })}
              </span>
            </div>
          </div>
        )}

        {/* Remote console login flow */}
        {job?.state === 'needs_user_code' && (
          <div className='flex flex-col gap-16px'>
            <Alert
              type='info'
              content={t('settings.awsRemoteAlert', {
                defaultValue:
                  'Sign in through the AWS Management Console link, then paste the authorization code below.',
              })}
            />

            {job.sign_in_url && (
              <div className='flex flex-col gap-6px'>
                <Typography.Text type='secondary' className='text-12px'>
                  1. {t('settings.awsSignInUrl', { defaultValue: 'Sign-in URL' })}:
                </Typography.Text>
                <div className='flex items-center gap-8px p-10px rounded-6px bg-[var(--color-fill-2)] border border-[var(--color-border-2)]'>
                  <span className='text-13px font-mono break-all select-all flex-1 text-primary'>
                    {job.sign_in_url}
                  </span>
                  <Space size='mini'>
                    <Button
                      size='mini'
                      icon={<Copy />}
                      onClick={() => handleCopy(job.sign_in_url!, 'URL')}
                    >
                      {t('common.copy', { defaultValue: 'Copy' })}
                    </Button>
                    <Button
                      size='mini'
                      type='primary'
                      icon={<ArrowRightUp />}
                      onClick={() => handleOpenUrl(job.sign_in_url!)}
                    >
                      {t('common.open', { defaultValue: 'Open' })}
                    </Button>
                  </Space>
                </div>
              </div>
            )}

            <div className='flex flex-col gap-6px'>
              <Typography.Text type='secondary' className='text-12px'>
                2. {t('settings.awsPasteAuthCode', { defaultValue: 'Paste Authorization Code' })}:
              </Typography.Text>
              <div className='flex items-center gap-8px'>
                <Input
                  placeholder={t('settings.awsAuthCodePlaceholder', { defaultValue: 'Enter authorization code...' })}
                  value={authCode}
                  onChange={setAuthCode}
                  onPressEnter={handleSubmitCode}
                  disabled={submittingCode}
                />
                <Button
                  type='primary'
                  loading={submittingCode}
                  disabled={!authCode.trim()}
                  onClick={handleSubmitCode}
                >
                  {t('common.submit', { defaultValue: 'Submit' })}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Pending / exchanging */}
        {job?.state === 'pending' && (
          <div className='flex flex-col items-center justify-center py-24px gap-12px text-t-secondary'>
            <Spin size={24} />
            <span className='text-14px'>
              {t('settings.awsFinalizingAuth', { defaultValue: 'Completing authentication and retrieving tokens...' })}
            </span>
          </div>
        )}

        {/* Success */}
        {job?.state === 'success' && (
          <div className='flex flex-col items-center py-16px gap-12px'>
            <div className='w-48px h-48px rounded-full bg-[var(--color-success-light-1)] flex items-center justify-center text-[var(--color-success-6)] text-24px'>
              <Check />
            </div>
            <Typography.Title heading={6} className='!m-0 text-center'>
              {t('settings.awsAuthSuccessTitle', { defaultValue: 'Authentication Succeeded' })}
            </Typography.Title>
            <Typography.Text type='secondary' className='text-13px text-center'>
              {t('settings.awsAuthSuccessDesc', {
                defaultValue: 'AWS CLI credentials refreshed successfully. Agents can now access AWS services.',
              })}
            </Typography.Text>

            {job.identity && (
              <div className='w-full p-12px rounded-6px bg-[var(--color-fill-2)] border border-[var(--color-border-2)] text-12px flex flex-col gap-4px'>
                <div>
                  <span className='text-t-secondary font-medium'>Account ID: </span>
                  <span className='font-mono'>{job.identity.account}</span>
                </div>
                <div>
                  <span className='text-t-secondary font-medium'>ARN: </span>
                  <span className='font-mono break-all'>{job.identity.arn}</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Failed / Expired / Cancelled */}
        {(job?.state === 'failed' || job?.state === 'expired' || job?.state === 'cancelled') && (
          <div className='flex flex-col gap-12px py-8px'>
            <Alert
              type={job.state === 'cancelled' ? 'warning' : 'error'}
              title={
                job.state === 'cancelled'
                  ? t('settings.awsCancelledTitle', { defaultValue: 'Login Cancelled' })
                  : job.state === 'expired'
                    ? t('settings.awsExpiredTitle', { defaultValue: 'Login Timed Out' })
                    : t('settings.awsFailedTitle', { defaultValue: 'Login Failed' })
              }
              content={
                job.error_message ||
                (job.state === 'expired'
                  ? t('settings.awsTimeoutMsg', { defaultValue: 'The login operation timed out after 10 minutes.' })
                  : t('settings.awsFailedMsg', { defaultValue: 'An error occurred during AWS login.' }))
              }
            />
          </div>
        )}
      </div>
    </Modal>
  );
};
