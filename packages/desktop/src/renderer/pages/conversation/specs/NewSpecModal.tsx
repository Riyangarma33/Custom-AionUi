/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Form, Input, Message, Modal, Radio } from '@arco-design/web-react';
import { useTranslation } from 'react-i18next';
import { ipcBridge } from '@/common';
import type { SpecDetail, SpecType, SpecWorkflow } from '@/common/types/specs';

interface NewSpecModalProps {
  visible: boolean;
  projectId: string;
  onClose: () => void;
  onCreated: (spec: SpecDetail) => void;
}

const slugify = (text: string): string =>
  text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');

export const NewSpecModal: React.FC<NewSpecModalProps> = ({ visible, projectId, onClose, onCreated }) => {
  const { t } = useTranslation();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);

  const handleTitleChange = (val: string) => {
    const currentSlug = form.getFieldValue('slug');
    if (!currentSlug || currentSlug === slugify(form.getFieldValue('title') || '')) {
      form.setFieldValue('slug', slugify(val));
    }
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validate();
      setLoading(true);
      const spec = await ipcBridge.project.specs.create.invoke({
        project_id: projectId,
        title: values.title.trim(),
        slug: values.slug?.trim() || undefined,
        spec_type: values.spec_type as SpecType,
        workflow: values.workflow as SpecWorkflow,
      });
      Message.success(t('specs.createSuccess', { defaultValue: 'Specification created successfully' }));
      form.resetFields();
      onCreated(spec);
      onClose();
    } catch (err) {
      if (err instanceof Error) {
        Message.error(err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      title={t('specs.newSpec', { defaultValue: 'New Specification' })}
      visible={visible}
      onOk={handleSubmit}
      onCancel={() => {
        form.resetFields();
        onClose();
      }}
      confirmLoading={loading}
      okText={t('common.create', { defaultValue: 'Create' })}
      cancelText={t('common.cancel', { defaultValue: 'Cancel' })}
      className='max-w-520px'
    >
      <Form
        form={form}
        layout='vertical'
        initialValues={{
          spec_type: 'feature',
          workflow: 'requirements_first',
        }}
      >
        <Form.Item
          label={t('specs.title', { defaultValue: 'Specification Title' })}
          field='title'
          rules={[{ required: true, message: t('specs.titleRequired', { defaultValue: 'Please enter a title' }) }]}
        >
          <Input
            placeholder='e.g. User Profile Avatar Upload'
            onChange={handleTitleChange}
            autoFocus
          />
        </Form.Item>

        <Form.Item
          label={t('specs.slug', { defaultValue: 'Identifier Slug' })}
          field='slug'
          extra={t('specs.slugExtra', { defaultValue: 'Folder name on disk (.aion/specs/<slug>/)' })}
        >
          <Input placeholder='e.g. user-profile-avatar-upload' />
        </Form.Item>

        <Form.Item
          label={t('specs.type', { defaultValue: 'Specification Type' })}
          field='spec_type'
        >
          <Radio.Group type='button'>
            <Radio value='feature'>
              <span className='text-blue-500 font-medium'>
                {t('specs.featureSpec', { defaultValue: 'Feature Spec' })}
              </span>
            </Radio>
            <Radio value='bugfix'>
              <span className='text-amber-500 font-medium'>
                {t('specs.bugfixSpec', { defaultValue: 'Bugfix Spec' })}
              </span>
            </Radio>
          </Radio.Group>
        </Form.Item>

        <Form.Item
          label={t('specs.workflow', { defaultValue: 'Workflow Variant' })}
          field='workflow'
        >
          <Radio.Group direction='vertical'>
            <Radio value='requirements_first'>
              <div className='flex flex-col'>
                <span className='font-medium text-t-primary'>
                  {t('specs.requirementsFirst', { defaultValue: 'Requirements-First (Recommended)' })}
                </span>
                <span className='text-12px text-t-secondary'>
                  {t('specs.requirementsFirstDesc', { defaultValue: 'Draft user stories & EARS criteria before technical design' })}
                </span>
              </div>
            </Radio>
            <Radio value='design_first'>
              <div className='flex flex-col'>
                <span className='font-medium text-t-primary'>
                  {t('specs.designFirst', { defaultValue: 'Design-First' })}
                </span>
                <span className='text-12px text-t-secondary'>
                  {t('specs.designFirstDesc', { defaultValue: 'Jump straight to architecture schemas and APIs' })}
                </span>
              </div>
            </Radio>
            <Radio value='quick_spec'>
              <div className='flex flex-col'>
                <span className='font-medium text-t-primary'>
                  {t('specs.quickSpec', { defaultValue: 'Quick Spec' })}
                </span>
                <span className='text-12px text-t-secondary'>
                  {t('specs.quickSpecDesc', { defaultValue: 'Concise checklist for rapid iterations' })}
                </span>
              </div>
            </Radio>
          </Radio.Group>
        </Form.Item>
      </Form>
    </Modal>
  );
};
