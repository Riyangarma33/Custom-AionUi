/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Dropdown,
  Input,
  Menu,
  Message,
  Popconfirm,
  Radio,
  Space,
  Table,
  Tag,
  Tooltip,
} from '@arco-design/web-react';
import {
  CheckOne,
  Close,
  Connection,
  Copy,
  Delete,
  Down,
  Edit,
  FolderOpen,
  Info,
  LinkCloud,
  ListView,
  Login,
  Plus,
  Refresh,
  Right,
  Search,
  Shield,
  TreeList,
} from '@icon-park/react';
import { useTranslation } from 'react-i18next';
import SettingsPageHeader from '../components/SettingsPageHeader';
import SettingsPageWrapper from '../components/SettingsPageWrapper';
import {
  type AwsCallerIdentity,
  type AwsProfileSummary,
  type AwsRuntimeInfo,
  type AwsSsoSessionSummary,
  awsCliService,
} from '@/renderer/services/awsCliService';
import { AwsLoginModal } from './AwsLoginModal';
import { AwsProfileModal } from './AwsProfileModal';
import { AwsSsoSessionModal } from './AwsSsoSessionModal';

export interface AwsProfileRow {
  key: string;
  name: string;
  isGroup: boolean;
  groupType?: 'sso' | 'console_login' | 'assume_role' | 'static_key' | 'other';
  groupLabel?: string;
  profileCount?: number;
  profile?: AwsProfileSummary;
  auth_method?: AwsProfileSummary['auth_method'];
  region?: string | null;
  output?: string | null;
  sso_session?: string | null;
  sso_start_url?: string | null;
  sso_region?: string | null;
  sso_account_id?: string | null;
  sso_role_name?: string | null;
  login_session?: string | null;
  role_arn?: string | null;
  source_profile?: string | null;
  has_access_key?: boolean;
  masked_access_key_id?: string | null;
  identity?: AwsCallerIdentity | null;
  status?: string;
  last_checked?: string | null;
  error_message?: string | null;
  children?: AwsProfileRow[];
}

function formatAccountId(id?: string | null): string {
  if (!id) return '';
  const clean = id.trim();
  if (/^\d{12}$/.test(clean)) {
    return `${clean.slice(0, 4)}-${clean.slice(4, 8)}-${clean.slice(8, 12)}`;
  }
  return clean;
}

function renderRoleTag(roleName?: string | null) {
  if (!roleName) return null;
  const lower = roleName.toLowerCase();
  let color = 'gray';
  if (lower.includes('admin') || lower.includes('root')) {
    color = 'orangered';
  } else if (
    lower.includes('read') ||
    lower.includes('ro') ||
    lower.includes('view') ||
    lower.includes('audit')
  ) {
    color = 'green';
  } else if (lower.includes('rw') || lower.includes('write') || lower.includes('dev')) {
    color = 'arcoblue';
  }
  return (
    <Tag size='small' color={color} className='text-10px font-normal max-w-180px truncate'>
      {roleName}
    </Tag>
  );
}

const AwsCliSettings: React.FC = () => {
  const { t } = useTranslation();
  const [runtimeInfo, setRuntimeInfo] = useState<AwsRuntimeInfo | null>(null);
  const [profiles, setProfiles] = useState<AwsProfileSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [authFilter, setAuthFilter] = useState('all');
  const [viewMode, setViewMode] = useState<'tree' | 'flat'>('tree');
  const [expandedKeys, setExpandedKeys] = useState<string[]>([]);
  const hasInitializedExpand = useRef(false);

  // Modal states
  const [loginModalVisible, setLoginModalVisible] = useState(false);
  const [loginProfile, setLoginProfile] = useState<AwsProfileSummary | null>(null);
  const [loginSessionTitle, setLoginSessionTitle] = useState<string | null>(null);

  const [profileModalVisible, setProfileModalVisible] = useState(false);
  const [editingProfile, setEditingProfile] = useState<AwsProfileSummary | null>(null);

  const [ssoSessions, setSsoSessions] = useState<AwsSsoSessionSummary[]>([]);
  const [ssoSessionModalVisible, setSsoSessionModalVisible] = useState(false);

  // Per-row identity testing spinners
  const [testingRow, setTestingRow] = useState<Record<string, boolean>>({});
  // Per-group batch testing spinners: groupKey -> { current: number, total: number }
  const [testingBatch, setTestingBatch] = useState<Record<string, { current: number; total: number }>>({});

  const loadData = async () => {
    setLoading(true);
    try {
      const [rt, profs, sessions] = await Promise.all([
        awsCliService.getRuntimeInfo().catch((e) => {
          console.error('Failed to get AWS runtime info:', e);
          return null;
        }),
        awsCliService.getProfiles().catch((e) => {
          console.error('Failed to get AWS profiles:', e);
          return [];
        }),
        awsCliService.getSsoSessions().catch((e) => {
          console.error('Failed to get AWS SSO sessions:', e);
          return [];
        }),
      ]);
      setRuntimeInfo(rt);
      setProfiles(profs);
      setSsoSessions(sessions);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      Message.error(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

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

  const handleTestIdentity = async (profileName: string) => {
    setTestingRow((prev) => ({ ...prev, [profileName]: true }));
    try {
      const res = await awsCliService.testIdentity(profileName);
      setProfiles((prev) =>
        prev.map((p) => {
          if (p.name === profileName) {
            return {
              ...p,
              status: res.status as AwsProfileSummary['status'],
              identity: res.identity,
              error_message: res.error_message,
              last_checked: new Date().toISOString(),
            };
          }
          return p;
        })
      );
      if (res.status === 'valid') {
        const accountStr = res.identity?.account ? ` (${res.identity.account})` : '';
        Message.success(
          `${profileName}: ${t('settings.awsIdentityValid', { defaultValue: 'Valid caller identity' })}${accountStr}`
        );
      } else if (res.status === 'expired') {
        Message.warning(
          `${profileName}: ${t('settings.awsIdentityExpired', { defaultValue: 'Credentials expired' })}`
        );
      } else {
        Message.error(
          `${profileName}: ${res.error_message || t('settings.awsIdentityFailed', { defaultValue: 'Identity check failed' })}`
        );
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      Message.error(msg);
    } finally {
      setTestingRow((prev) => ({ ...prev, [profileName]: false }));
    }
  };

  const handleDeleteProfile = async (profileName: string) => {
    try {
      await awsCliService.deleteProfile(profileName);
      Message.success(
        t('settings.awsProfileDeleted', { defaultValue: 'Profile deleted successfully (backup saved)' })
      );
      void loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      Message.error(msg);
    }
  };

  const handleBatchTest = async (groupKey: string, profileNames: string[]) => {
    if (profileNames.length === 0) return;
    setTestingBatch((prev) => ({ ...prev, [groupKey]: { current: 0, total: profileNames.length } }));

    let successCount = 0;
    let failCount = 0;
    for (let i = 0; i < profileNames.length; i++) {
      const name = profileNames[i];
      try {
        const res = await awsCliService.testIdentity(name);
        setProfiles((prev) =>
          prev.map((p) => {
            if (p.name === name) {
              return {
                ...p,
                status: res.status as AwsProfileSummary['status'],
                identity: res.identity,
                error_message: res.error_message,
                last_checked: new Date().toISOString(),
              };
            }
            return p;
          })
        );
        if (res.status === 'valid') successCount++;
        else failCount++;
      } catch (e) {
        console.warn(`Batch test error for ${name}:`, e);
        failCount++;
      }
      setTestingBatch((prev) => ({
        ...prev,
        [groupKey]: { current: i + 1, total: profileNames.length },
      }));
    }

    setTestingBatch((prev) => {
      const next = { ...prev };
      delete next[groupKey];
      return next;
    });

    if (failCount === 0) {
      Message.success(
        t('settings.awsBatchTestSuccess', {
          defaultValue: `Validated all ${successCount} profiles successfully`,
          count: successCount,
        })
      );
    } else {
      Message.info(
        t('settings.awsBatchTestPartial', {
          defaultValue: `Batch check finished: ${successCount} valid, ${failCount} need attention`,
          success: successCount,
          failed: failCount,
        })
      );
    }
  };

  // Filter profiles by query and category
  const filteredProfiles = useMemo(() => {
    return profiles.filter((p) => {
      // Category filter
      if (authFilter !== 'all') {
        if (authFilter === 'sso' && p.auth_method !== 'sso') return false;
        if (authFilter === 'console_login' && p.auth_method !== 'console_login') return false;
        if (authFilter === 'assume_role' && p.auth_method !== 'assume_role') return false;
        if (authFilter === 'static_key' && p.auth_method !== 'static_key') return false;
      }
      // Query filter
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      const matchName = p.name.toLowerCase().includes(q);
      const matchAccount = p.sso_account_id?.toLowerCase().includes(q) || p.identity?.account.includes(q);
      const matchRole =
        p.sso_role_name?.toLowerCase().includes(q) ||
        p.role_arn?.toLowerCase().includes(q) ||
        p.identity?.arn.toLowerCase().includes(q);
      const matchRegion = p.region?.toLowerCase().includes(q);
      const matchSession = p.sso_session?.toLowerCase().includes(q) || p.login_session?.toLowerCase().includes(q);
      return matchName || matchAccount || matchRole || matchRegion || matchSession;
    });
  }, [profiles, searchQuery, authFilter]);

  // Breakdown statistics
  const stats = useMemo(() => {
    let ssoCount = 0;
    let consoleCount = 0;
    let assumeRoleCount = 0;
    let staticKeyCount = 0;
    for (const p of profiles) {
      if (p.auth_method === 'sso') ssoCount++;
      else if (p.auth_method === 'console_login') consoleCount++;
      else if (p.auth_method === 'assume_role') assumeRoleCount++;
      else if (p.auth_method === 'static_key') staticKeyCount++;
    }
    return { total: profiles.length, ssoCount, consoleCount, assumeRoleCount, staticKeyCount };
  }, [profiles]);

  // Grouping logic for the Tree view
  const treeData = useMemo(() => {
    if (viewMode === 'flat') {
      return filteredProfiles.map((p) => ({
        key: `profile-${p.name}`,
        name: p.name,
        isGroup: false,
        profile: p,
        auth_method: p.auth_method,
        region: p.region,
        sso_account_id: p.sso_account_id,
        sso_role_name: p.sso_role_name,
        login_session: p.login_session,
        role_arn: p.role_arn,
        source_profile: p.source_profile,
        masked_access_key_id: p.masked_access_key_id,
        status: p.status,
        identity: p.identity,
        error_message: p.error_message,
      }));
    }

    // Identify which profiles are referenced as source_profile
    const sourceParents = new Set<string>();
    for (const p of profiles) {
      if (p.source_profile) {
        sourceParents.add(p.source_profile);
      }
    }

    interface GroupBucket {
      key: string;
      groupLabel: string;
      groupType: 'sso' | 'console_login' | 'assume_role' | 'static_key' | 'other';
      region?: string | null;
      startUrl?: string | null;
      repProfile?: AwsProfileSummary;
      profiles: AwsProfileSummary[];
    }

    const buckets = new Map<string, GroupBucket>();

    const getBucket = (
      key: string,
      label: string,
      type: GroupBucket['groupType'],
      region?: string | null,
      startUrl?: string | null,
      rep?: AwsProfileSummary
    ): GroupBucket => {
      let b = buckets.get(key);
      if (!b) {
        b = {
          key,
          groupLabel: label,
          groupType: type,
          region,
          startUrl,
          repProfile: rep,
          profiles: [],
        };
        buckets.set(key, b);
      }
      if (!b.region && region) b.region = region;
      if (!b.startUrl && startUrl) b.startUrl = startUrl;
      if (!b.repProfile && rep) b.repProfile = rep;
      return b;
    };

    for (const p of filteredProfiles) {
      if (p.sso_session) {
        const b = getBucket(
          `sso:${p.sso_session}`,
          `${p.sso_session} (SSO)`,
          'sso',
          p.sso_region || p.region,
          p.sso_start_url,
          p
        );
        b.profiles.push(p);
      } else if (p.source_profile && sourceParents.has(p.source_profile)) {
        const parentP = profiles.find((x) => x.name === p.source_profile);
        const isConsole = parentP?.auth_method === 'console_login';
        const b = getBucket(
          isConsole ? `console:${p.source_profile}` : `parent:${p.source_profile}`,
          isConsole ? `${p.source_profile} (Console Login)` : `${p.source_profile} (Assume Role)`,
          isConsole ? 'console_login' : 'assume_role',
          parentP?.region || p.region,
          null,
          parentP || p
        );
        b.profiles.push(p);
      } else if (p.auth_method === 'console_login') {
        if (sourceParents.has(p.name)) {
          const b = getBucket(
            `console:${p.name}`,
            `${p.name} (Console Login)`,
            'console_login',
            p.region,
            null,
            p
          );
          b.profiles.unshift(p);
        } else {
          const b = getBucket(
            'console:standalone',
            'Console Login Sessions',
            'console_login',
            null,
            null,
            p
          );
          b.profiles.push(p);
        }
      } else if (p.auth_method === 'assume_role' && p.source_profile) {
        const b = getBucket(
          `assume:${p.source_profile}`,
          `Assume Role via ${p.source_profile}`,
          'assume_role',
          p.region,
          null,
          p
        );
        b.profiles.push(p);
      } else if (p.auth_method === 'static_key') {
        const b = getBucket(
          'static:credentials',
          'Static Access Keys',
          'static_key',
          null,
          null,
          p
        );
        b.profiles.push(p);
      } else {
        const b = getBucket(
          'other:profiles',
          'Other Profiles',
          'other',
          null,
          null,
          p
        );
        b.profiles.push(p);
      }
    }

    const rows: AwsProfileRow[] = [];
    const sortedBuckets = Array.from(buckets.values()).sort(
      (a, b) => b.profiles.length - a.profiles.length
    );

    for (const b of sortedBuckets) {
      if (b.profiles.length === 0) continue;

      const seen = new Set<string>();
      const uniqueProfiles = b.profiles.filter((p) => {
        if (seen.has(p.name)) return false;
        seen.add(p.name);
        return true;
      });

      const childRows: AwsProfileRow[] = uniqueProfiles.map((p) => ({
        key: `profile-${p.name}`,
        name: p.name,
        isGroup: false,
        profile: p,
        auth_method: p.auth_method,
        region: p.region,
        sso_account_id: p.sso_account_id,
        sso_role_name: p.sso_role_name,
        login_session: p.login_session,
        role_arn: p.role_arn,
        source_profile: p.source_profile,
        masked_access_key_id: p.masked_access_key_id,
        status: p.status,
        identity: p.identity,
        error_message: p.error_message,
      }));

      rows.push({
        key: `group-${b.key}`,
        name: b.groupLabel,
        groupLabel: b.groupLabel,
        isGroup: true,
        groupType: b.groupType,
        profileCount: uniqueProfiles.length,
        region: b.region,
        sso_start_url: b.startUrl,
        profile: b.repProfile,
        children: childRows,
      });
    }

    return rows;
  }, [filteredProfiles, viewMode, profiles]);

  // All group keys for expand/collapse management
  const allGroupKeys = useMemo(
    () => treeData.filter((r) => r.isGroup).map((r) => r.key),
    [treeData]
  );

  // Auto-expand groups when search is active; default collapsed on load for >10 profiles
  useEffect(() => {
    if (viewMode !== 'tree' || allGroupKeys.length === 0) return;

    if (!hasInitializedExpand.current) {
      hasInitializedExpand.current = true;
      if (profiles.length > 10) {
        setExpandedKeys([]);
      } else {
        setExpandedKeys(allGroupKeys);
      }
      return;
    }

    if (searchQuery.trim().length > 0) {
      setExpandedKeys(allGroupKeys);
    }
  }, [searchQuery, viewMode, allGroupKeys, profiles.length]);

  const isAllExpanded = expandedKeys.length >= allGroupKeys.length && allGroupKeys.length > 0;

  const toggleExpandAll = () => {
    if (isAllExpanded) {
      setExpandedKeys([]);
    } else {
      setExpandedKeys(allGroupKeys);
    }
  };

  const renderAuthMethodBadge = (method: AwsProfileSummary['auth_method']) => {
    switch (method) {
      case 'sso':
        return <Tag color='arcoblue'>SSO</Tag>;
      case 'console_login':
        return <Tag color='cyan'>Console Login</Tag>;
      case 'assume_role':
        return <Tag color='purple'>Assume Role</Tag>;
      case 'static_key':
        return <Tag color='orange'>Static Key</Tag>;
      case 'credential_process':
        return <Tag color='gray'>Credential Process</Tag>;
      default:
        return <Tag color='gray'>Unknown</Tag>;
    }
  };

  const renderIdentityStatus = (record: AwsProfileSummary) => {
    if (testingRow[record.name]) {
      return (
        <Tag icon={<Refresh className='animate-spin' />} color='arcoblue'>
          Testing...
        </Tag>
      );
    }
    if (record.status === 'valid') {
      return (
        <Tooltip
          content={
            <div className='text-12px font-mono'>
              <div>Account: {record.identity?.account}</div>
              <div>ARN: {record.identity?.arn}</div>
            </div>
          }
        >
          <Tag icon={<CheckOne />} color='green'>
            Valid
          </Tag>
        </Tooltip>
      );
    }
    if (record.status === 'expired') {
      return (
        <Tooltip content={record.error_message || 'Session token expired. Click Login/Refresh to renew.'}>
          <Tag icon={<Info />} color='gold'>
            Expired
          </Tag>
        </Tooltip>
      );
    }
    if (record.status === 'missing_credentials') {
      return (
        <Tooltip content={record.error_message || 'No credentials found for this profile.'}>
          <Tag icon={<Close />} color='gray'>
            Missing
          </Tag>
        </Tooltip>
      );
    }
    if (record.status === 'error') {
      return (
        <Tooltip content={record.error_message || 'Identity check failed'}>
          <Tag icon={<Close />} color='red'>
            Error
          </Tag>
        </Tooltip>
      );
    }
    return <Tag color='gray'>Untested</Tag>;
  };

  const columns = [
    {
      title: t('settings.awsProfileName', { defaultValue: 'Profile / Session' }),
      dataIndex: 'name',
      width: 290,
      fixed: 'left' as const,
      render: (_: unknown, record: AwsProfileRow) => {
        if (record.isGroup) {
          return (
            <div className='flex items-center gap-8px font-semibold text-13px text-t-primary min-w-0 pr-6px'>
              {record.groupType === 'sso' ? (
                <LinkCloud className='text-primary text-16px flex-shrink-0' />
              ) : (
                <Connection className='text-primary text-16px flex-shrink-0' />
              )}
              <span className='truncate' title={record.groupLabel || record.name}>
                {record.groupLabel || record.name}
              </span>
              <Tag size='small' color='arcoblue' className='font-normal flex-shrink-0'>
                {record.profileCount} {record.profileCount === 1 ? 'profile' : 'profiles'}
              </Tag>
            </div>
          );
        }

        const copyMenu = (
          <Menu>
            <Menu.Item key='copy-name' onClick={() => handleCopy(record.name, 'Profile name')}>
              Copy Name ({record.name})
            </Menu.Item>
            <Menu.Item
              key='copy-export'
              onClick={() => handleCopy(`export AWS_PROFILE="${record.name}"`, 'Export command')}
            >
              Copy export AWS_PROFILE=&quot;{record.name}&quot;
            </Menu.Item>
            <Menu.Item
              key='copy-cmd'
              onClick={() =>
                handleCopy(
                  `aws sts get-caller-identity --profile "${record.name}"`,
                  'AWS CLI command'
                )
              }
            >
              Copy aws sts command
            </Menu.Item>
          </Menu>
        );

        return (
          <div className='flex items-center gap-6px pl-6px min-w-0 pr-6px overflow-hidden'>
            <div className='min-w-0 flex-1 overflow-hidden'>
              <Tooltip content={record.name}>
                <span className='font-medium text-13px truncate block select-all' title={record.name}>
                  {record.name}
                </span>
              </Tooltip>
            </div>
            {record.name === 'default' && (
              <Tag size='small' color='blue' className='flex-shrink-0'>
                default
              </Tag>
            )}
            <Dropdown droplist={copyMenu} trigger={['click', 'hover']} position='bottom'>
              <button
                type='button'
                className='text-t-secondary hover:text-primary cursor-pointer p-2px transition-colors border-none bg-transparent flex-shrink-0'
                title='Copy profile name or export snippet'
              >
                <Copy />
              </button>
            </Dropdown>
          </div>
        );
      },
    },
    {
      title: t('settings.awsAuthMethod', { defaultValue: 'Auth Method' }),
      width: 105,
      render: (_: unknown, record: AwsProfileRow) => {
        if (record.isGroup) {
          switch (record.groupType) {
            case 'sso':
              return <Tag color='arcoblue'>SSO Session</Tag>;
            case 'console_login':
              return <Tag color='cyan'>Console Login</Tag>;
            case 'assume_role':
              return <Tag color='purple'>Assume Role</Tag>;
            case 'static_key':
              return <Tag color='orange'>Static Keys</Tag>;
            default:
              return <Tag color='gray'>Group</Tag>;
          }
        }
        return renderAuthMethodBadge(record.auth_method!);
      },
    },
    {
      title: t('settings.awsRegion', { defaultValue: 'Region' }),
      width: 105,
      render: (_: unknown, record: AwsProfileRow) => {
        if (record.isGroup) {
          return record.region ? (
            <span className='font-mono text-12px text-t-secondary whitespace-nowrap'>{record.region}</span>
          ) : (
            <span className='text-t-secondary text-12px'>—</span>
          );
        }
        return (
          <span className='font-mono text-12px text-t-secondary whitespace-nowrap'>{record.region || '—'}</span>
        );
      },
    },
    {
      title: t('settings.awsTargetAccountRole', { defaultValue: 'Account / Target' }),
      width: 200,
      render: (_: unknown, record: AwsProfileRow) => {
        if (record.isGroup) {
          if (record.groupType === 'sso' && record.sso_start_url) {
            return (
              <span
                className='text-11px text-t-secondary font-mono truncate max-w-220px block'
                title={record.sso_start_url}
              >
                {record.sso_start_url}
              </span>
            );
          }
          return <span className='text-t-secondary text-12px'>—</span>;
        }

        if (record.auth_method === 'sso') {
          return (
            <div className='flex flex-col text-12px min-w-0 pr-4px'>
              {record.sso_account_id && (
                <div className='flex items-center gap-4px'>
                  <span className='font-mono text-t-primary font-medium tracking-tight'>
                    {formatAccountId(record.sso_account_id)}
                  </span>
                  <Tooltip content='Copy Account ID'>
                    <button
                      type='button'
                      onClick={() => handleCopy(record.sso_account_id!, 'Account ID')}
                      className='text-t-tertiary hover:text-primary cursor-pointer p-1px transition-colors border-none bg-transparent'
                    >
                      <Copy size={12} />
                    </button>
                  </Tooltip>
                </div>
              )}
              {record.sso_role_name && (
                <div className='mt-2px'>
                  {renderRoleTag(record.sso_role_name)}
                </div>
              )}
            </div>
          );
        }
        if (record.auth_method === 'console_login') {
          return (
            <div className='flex flex-col text-12px min-w-0 pr-4px'>
              <span
                className='text-t-secondary font-mono truncate max-w-220px block'
                title={record.login_session || ''}
              >
                {record.login_session || '—'}
              </span>
            </div>
          );
        }
        if (record.auth_method === 'assume_role') {
          return (
            <div className='flex flex-col text-12px min-w-0 pr-4px'>
              <span
                className='font-mono text-t-primary truncate max-w-220px block text-11px'
                title={record.role_arn || ''}
              >
                {record.role_arn || '—'}
              </span>
              {record.source_profile && (
                <span className='text-t-secondary text-11px'>via {record.source_profile}</span>
              )}
            </div>
          );
        }
        if (record.auth_method === 'static_key') {
          return (
            <span className='font-mono text-12px text-t-secondary whitespace-nowrap'>
              {record.masked_access_key_id || 'Static Key'}
            </span>
          );
        }
        return <span className='text-t-secondary text-12px'>—</span>;
      },
    },
    {
      title: t('settings.awsCallerIdentity', { defaultValue: 'Caller Identity' }),
      width: 110,
      render: (_: unknown, record: AwsProfileRow) => {
        if (record.isGroup) {
          const validCount = record.children?.filter((c) => c.status === 'valid').length ?? 0;
          const totalCount = record.children?.length ?? 0;
          if (validCount > 0) {
            return (
              <Tag color='green' size='small'>
                {validCount}/{totalCount} Valid
              </Tag>
            );
          }
          return <span className='text-t-secondary text-12px'>—</span>;
        }
        return renderIdentityStatus(record.profile!);
      },
    },
    {
      title: t('common.actions', { defaultValue: 'Actions' }),
      width: 190,
      fixed: 'right' as const,
      render: (_: unknown, record: AwsProfileRow) => {
        if (record.isGroup) {
          const isSso = record.groupType === 'sso';
          const rep = record.profile;
          const childProfiles = record.children?.map((c) => c.name) || [];
          const isBatchTesting = testingBatch[record.key];
          return (
            <div className='flex items-center gap-6px flex-nowrap whitespace-nowrap'>
              {isSso && rep && (
                <Button
                  size='mini'
                  type='primary'
                  icon={<Login />}
                  onClick={() => {
                    setLoginProfile(rep);
                    setLoginSessionTitle(record.groupLabel || record.name);
                    setLoginModalVisible(true);
                  }}
                >
                  {t('settings.awsLoginSession', { defaultValue: 'Login Session' })}
                </Button>
              )}
              {childProfiles.length > 0 && (
                <Button
                  size='mini'
                  loading={Boolean(isBatchTesting)}
                  onClick={() => handleBatchTest(record.key, childProfiles)}
                >
                  {isBatchTesting
                    ? `${isBatchTesting.current}/${isBatchTesting.total}`
                    : t('settings.awsTestAll', { defaultValue: 'Test All' })}
                </Button>
              )}
            </div>
          );
        }

        const isChildOfSso = record.auth_method === 'sso';
        const isConsole = record.auth_method === 'console_login';

        return (
          <div className='flex items-center gap-4px flex-nowrap whitespace-nowrap'>
            <Button
              size='mini'
              loading={testingRow[record.name]}
              onClick={() => handleTestIdentity(record.name)}
            >
              {t('settings.awsTestIdentity', { defaultValue: 'Test' })}
            </Button>

            {isConsole && (
              <Button
                size='mini'
                type='primary'
                icon={<Login />}
                onClick={() => {
                  setLoginProfile(record.profile!);
                  setLoginSessionTitle(null);
                  setLoginModalVisible(true);
                }}
              >
                {t('settings.awsLogin', { defaultValue: 'Login' })}
              </Button>
            )}

            {isChildOfSso && record.status === 'expired' && (
              <Button
                size='mini'
                type='outline'
                status='warning'
                icon={<Login />}
                onClick={() => {
                  setLoginProfile(record.profile!);
                  setLoginSessionTitle(null);
                  setLoginModalVisible(true);
                }}
              >
                {t('settings.awsRenew', { defaultValue: 'Renew' })}
              </Button>
            )}

            <Tooltip content={t('common.edit', { defaultValue: 'Edit Profile' })}>
              <Button
                size='mini'
                icon={<Edit />}
                onClick={() => {
                  setEditingProfile(record.profile!);
                  setProfileModalVisible(true);
                }}
              />
            </Tooltip>

            <Popconfirm
              title={t('settings.awsDeleteConfirmTitle', { defaultValue: 'Delete Profile?' })}
              content={t('settings.awsDeleteConfirmContent', {
                defaultValue: `Are you sure you want to delete profile "${record.name}"? A backup copy of ~/.aws/config will be saved before removal.`,
                name: record.name,
              })}
              okText={t('common.delete', { defaultValue: 'Delete' })}
              cancelText={t('common.cancel', { defaultValue: 'Cancel' })}
              okButtonProps={{ status: 'danger' }}
              onOk={() => handleDeleteProfile(record.name)}
            >
              <Tooltip content={t('common.delete', { defaultValue: 'Delete Profile' })}>
                <Button size='mini' status='danger' icon={<Delete />} />
              </Tooltip>
            </Popconfirm>
          </div>
        );
      },
    },
  ];

  return (
    <SettingsPageWrapper contentClassName='md:max-w-1280px'>
      <div className='flex flex-col gap-16px'>
        <SettingsPageHeader
          data-testid='aws-cli-header'
          title={t('settings.awsCliTitle', { defaultValue: 'AWS CLI Manager' })}
          description={t('settings.awsCliDescription', {
            defaultValue:
              'Centrally manage AWS CLI profiles and run interactive browserless logins for AI runtime agents.',
          })}
        />

        {/* Runtime info callout */}
        <Alert
          type='info'
          content={
            <div className='flex items-center justify-between flex-wrap gap-8px text-13px'>
              <span>
                {t('settings.awsRuntimeBanner', {
                  defaultValue:
                    'Managing AWS CLI profiles for the AionUi runtime user (aionui). Configured profiles are available to agents running on this VPS.',
                })}
              </span>
              {runtimeInfo?.user && (
                <Tag color='blue' icon={<Shield />}>
                  user: {runtimeInfo.user}
                </Tag>
              )}
            </div>
          }
        />

        {/* Summary metric cards */}
        <div className='grid grid-cols-2 lg:grid-cols-4 gap-8px sm:gap-12px'>
          <Card size='small' className='border border-[var(--color-border-2)] rounded-8px shadow-xs'>
            <div className='flex flex-col gap-2px sm:gap-4px'>
              <span className='text-11px sm:text-12px text-t-secondary truncate'>AWS CLI Status</span>
              <div className='flex items-center gap-6px sm:gap-8px mt-2px'>
                {runtimeInfo?.installed ? (
                  <Tag color='green' size='small' icon={<CheckOne />}>
                    Installed
                  </Tag>
                ) : (
                  <Tag color='red' size='small' icon={<Close />}>
                    Not Installed
                  </Tag>
                )}
                <span
                  className='text-11px sm:text-12px font-mono text-t-secondary truncate'
                  title={runtimeInfo?.version || ''}
                >
                  {runtimeInfo?.version?.split(' ')[0] || ''}
                </span>
              </div>
            </div>
          </Card>

          <Card size='small' className='border border-[var(--color-border-2)] rounded-8px shadow-xs'>
            <div className='flex flex-col gap-2px sm:gap-4px'>
              <span className='text-11px sm:text-12px text-t-secondary truncate'>Runtime Host</span>
              <div className='flex items-center gap-4px sm:gap-6px mt-2px'>
                <Tag color='arcoblue' size='small' icon={<Shield />}>
                  {runtimeInfo?.user || 'aionui'}
                </Tag>
                <span className='text-11px sm:text-12px text-t-secondary truncate'>Linux aarch64</span>
              </div>
            </div>
          </Card>

          <Card size='small' className='border border-[var(--color-border-2)] rounded-8px shadow-xs'>
            <div className='flex flex-col gap-2px sm:gap-4px'>
              <span className='text-11px sm:text-12px text-t-secondary truncate'>Configuration Path</span>
              <div className='flex items-center gap-4px sm:gap-6px mt-2px min-w-0'>
                <FolderOpen className='text-primary flex-shrink-0' />
                <span
                  className='text-11px sm:text-12px font-mono text-t-secondary truncate'
                  title={runtimeInfo?.config_path || '~/.aws/config'}
                >
                  {runtimeInfo?.config_path || '~/.aws/config'}
                </span>
              </div>
            </div>
          </Card>

          <Card size='small' className='border border-[var(--color-border-2)] rounded-8px shadow-xs'>
            <div className='flex flex-col gap-2px sm:gap-4px'>
              <span className='text-11px sm:text-12px text-t-secondary truncate'>Active Profiles</span>
              <div className='flex items-center justify-between mt-2px gap-4px flex-wrap'>
                <span className='text-16px sm:text-18px font-bold text-t-primary'>{stats.total}</span>
                <Space size={4}>
                  <Tag size='small' color='arcoblue'>
                    SSO: {stats.ssoCount}
                  </Tag>
                  <Tag size='small' color='cyan'>
                    Console: {stats.consoleCount}
                  </Tag>
                </Space>
              </div>
            </div>
          </Card>
        </div>

        {/* Toolbar Row 1: Search & Action Buttons */}
        <div className='flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-10px mt-4px'>
          {/* Search + Compact Refresh on mobile & desktop */}
          <div className='flex items-center gap-8px flex-1 max-w-full sm:max-w-500px'>
            <Input
              prefix={<Search />}
              placeholder={t('settings.awsSearchPlaceholder', {
                defaultValue: 'Search profile, session, account ID, role...',
              })}
              allowClear
              value={searchQuery}
              onChange={setSearchQuery}
              className='flex-1'
            />
            <Tooltip content={t('common.refresh', { defaultValue: 'Refresh' })}>
              <Button
                icon={<Refresh className={loading ? 'animate-spin' : ''} />}
                onClick={loadData}
                disabled={loading}
                className='flex-shrink-0'
              />
            </Tooltip>
          </div>

          {/* Creation actions: 2-column grid on mobile, inline on desktop */}
          <div className='grid grid-cols-2 sm:flex sm:items-center gap-8px flex-shrink-0'>
            <Button
              icon={<LinkCloud />}
              onClick={() => setSsoSessionModalVisible(true)}
              className='w-full sm:w-auto justify-center'
            >
              {t('settings.awsAddSsoSession', { defaultValue: 'Add SSO Session' })}
            </Button>
            <Button
              type='primary'
              icon={<Plus />}
              onClick={() => {
                setEditingProfile(null);
                setProfileModalVisible(true);
              }}
              className='w-full sm:w-auto justify-center'
            >
              {t('settings.awsAddProfile', { defaultValue: 'Add Profile' })}
            </Button>
          </div>
        </div>

        {/* Toolbar Row 2: Category Filters, View Mode, & Expand/Collapse */}
        <div className='flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-10px pt-2px'>
          {/* Horizontally scrollable category pills on mobile */}
          <div className='overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden pb-2px -mb-2px max-w-full'>
            <Radio.Group
              type='button'
              size='small'
              value={authFilter}
              onChange={setAuthFilter}
              className='whitespace-nowrap flex-shrink-0'
            >
              <Radio value='all'>All ({stats.total})</Radio>
              <Radio value='sso'>SSO ({stats.ssoCount})</Radio>
              <Radio value='console_login'>Console ({stats.consoleCount})</Radio>
              <Radio value='assume_role'>Role ({stats.assumeRoleCount})</Radio>
              <Radio value='static_key'>Key ({stats.staticKeyCount})</Radio>
            </Radio.Group>
          </div>

          <div className='flex items-center justify-between sm:justify-end gap-8px flex-shrink-0'>
            {/* View Mode Toggle: Tree vs Flat */}
            <Radio.Group
              type='button'
              size='small'
              value={viewMode}
              onChange={(val) => setViewMode(val as 'tree' | 'flat')}
            >
              <Radio value='tree'>
                <Space size={4}>
                  <TreeList />
                  <span>{t('settings.awsTreeView', { defaultValue: 'Grouped' })}</span>
                </Space>
              </Radio>
              <Radio value='flat'>
                <Space size={4}>
                  <ListView />
                  <span>{t('settings.awsFlatView', { defaultValue: 'Flat List' })}</span>
                </Space>
              </Radio>
            </Radio.Group>

            {viewMode === 'tree' && (
              <Button size='small' onClick={toggleExpandAll}>
                {isAllExpanded
                  ? t('settings.awsCollapseAll', { defaultValue: 'Collapse All' })
                  : t('settings.awsExpandAll', { defaultValue: 'Expand All' })}
              </Button>
            )}
          </div>
        </div>

        {/* Profiles Table (Tree / Flat) */}
        <div className='border border-[var(--color-border-2)] rounded-8px overflow-hidden bg-[var(--color-bg-2)]'>
          <Table
            rowKey='key'
            loading={loading}
            columns={columns}
            data={treeData}
            expandedRowKeys={viewMode === 'tree' ? expandedKeys : undefined}
            onExpandedRowsChange={
              viewMode === 'tree' ? (keys) => setExpandedKeys(keys as string[]) : undefined
            }
            indentSize={20}
            pagination={
              viewMode === 'flat'
                ? {
                    pageSize: 20,
                    showTotal: true,
                    sizeCanChange: true,
                  }
                : false
            }
            scroll={{ x: 1000 }}
          />
        </div>

        {/* Interactive Login Modal */}
        <AwsLoginModal
          visible={loginModalVisible}
          profile={loginProfile}
          sessionTitle={loginSessionTitle}
          onClose={() => {
            setLoginModalVisible(false);
            setLoginProfile(null);
            setLoginSessionTitle(null);
          }}
          onSuccess={() => {
            void loadData();
          }}
        />

        {/* Profile Add/Edit Modal */}
        <AwsProfileModal
          visible={profileModalVisible}
          profile={editingProfile}
          allProfiles={profiles}
          ssoSessions={ssoSessions}
          onOpenAddSsoSession={() => {
            setProfileModalVisible(false);
            setSsoSessionModalVisible(true);
          }}
          onClose={() => {
            setProfileModalVisible(false);
            setEditingProfile(null);
          }}
          onSuccess={() => {
            void loadData();
          }}
        />

        {/* SSO Session Add Modal */}
        <AwsSsoSessionModal
          visible={ssoSessionModalVisible}
          onClose={() => setSsoSessionModalVisible(false)}
          onSuccess={(newSessionName) => {
            void loadData();
            if (newSessionName) {
              setEditingProfile(null);
              setProfileModalVisible(true);
            }
          }}
        />
      </div>
    </SettingsPageWrapper>
  );
};

export default AwsCliSettings;
