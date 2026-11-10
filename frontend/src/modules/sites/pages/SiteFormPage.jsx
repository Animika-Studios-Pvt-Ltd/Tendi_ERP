import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate, useParams } from 'react-router-dom';
import { z } from 'zod';
import ErrorState from '@/components/common/ErrorState';
import PageHeader from '@/components/common/PageHeader';
import PageLoader from '@/components/common/PageLoader';
import FormAlert from '@/components/forms/FormAlert';
import FormField from '@/components/forms/FormField';
import Button from '@/components/ui/Button';
import { Card, CardBody, CardFooter, CardHeader } from '@/components/ui/Card';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Textarea from '@/components/ui/Textarea';
import { projectsService } from '@/services/projects.service';
import { sitesService } from '@/services/sites.service';
import { usersService } from '@/services/users.service';
import { applyServerErrors } from '@/utils/validation';
import { SITE_STATUS_OPTIONS } from '../constants';

const siteSchema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9][A-Z0-9-]{1,19}$/, 'Use 2-20 uppercase letters, numbers or dashes'),
  name: z.string().trim().min(1, 'Enter site name').max(120),
  project: z.string().min(1, 'Select a project'),
  status: z.string(),
  description: z.string().trim().max(1000).optional(),
  location: z.object({
    address: z.string().trim().max(300).optional(),
    city: z.string().trim().max(80).optional(),
    state: z.string().trim().max(80).optional(),
    pincode: z.string().trim().max(10).regex(/^\d*$/, 'Use digits only').optional(),
  }),
  siteEngineer: z.string().optional(),
  startDate: z.string().optional(),
  targetCompletionDate: z.string().optional(),
});

export default function SiteFormPage() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();

  const [projects, setProjects] = useState([]);
  const [engineers, setEngineers] = useState([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [initialError, setInitialError] = useState(null);

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(siteSchema),
    defaultValues: {
      code: '',
      name: '',
      project: '',
      status: 'active',
      description: '',
      location: { address: '', city: '', state: '', pincode: '' },
      siteEngineer: '',
      startDate: '',
      targetCompletionDate: '',
    },
  });

  useEffect(() => {
    let cancelled = false;
    setInitialLoading(true);

    Promise.all([
      projectsService.list({ limit: 100 }),
      usersService.list({ role: 'site_engineer', limit: 100 }).catch(() => ({ data: [] })),
      isEdit ? sitesService.getSite(id) : Promise.resolve(null),
    ])
      .then(([projRes, engRes, siteRes]) => {
        if (cancelled) return;
        setProjects(projRes.data);
        setEngineers(engRes.data || []);

        if (siteRes?.data) {
          const s = siteRes.data;
          reset({
            code: s.code,
            name: s.name,
            project: s.project?.id || '',
            status: s.status,
            description: s.description || '',
            location: {
              address: s.location?.address || '',
              city: s.location?.city || '',
              state: s.location?.state || '',
              pincode: s.location?.pincode || '',
            },
            siteEngineer: s.siteEngineer?.id || '',
            startDate: s.startDate ? s.startDate.slice(0, 10) : '',
            targetCompletionDate: s.targetCompletionDate ? s.targetCompletionDate.slice(0, 10) : '',
          });
        }
      })
      .catch((err) => !cancelled && setInitialError(err))
      .finally(() => !cancelled && setInitialLoading(false));

    return () => {
      cancelled = true;
    };
  }, [id, isEdit, reset]);

  const onSubmit = async (values) => {
    const payload = {
      ...values,
      siteEngineer: values.siteEngineer || null,
      startDate: values.startDate || null,
      targetCompletionDate: values.targetCompletionDate || null,
    };

    try {
      if (isEdit) {
        await sitesService.updateSite(id, payload);
        navigate(`/sites/${id}`);
      } else {
        const { data } = await sitesService.createSite(payload);
        navigate(`/sites/${data.id}`);
      }
    } catch (err) {
      if (!applyServerErrors(err, setError)) {
        setError('root', { message: err.message || 'Operation failed' });
      }
    }
  };

  if (initialLoading) return <PageLoader message="Loading site configuration…" />;
  if (initialError) return <ErrorState error={initialError} />;

  const projectOptions = [
    { value: '', label: 'Select a project…' },
    ...projects.map((p) => ({ value: p.id, label: `${p.code} - ${p.name}` })),
  ];

  const engineerOptions = [
    { value: '', label: 'Unassigned (None)' },
    ...engineers.map((e) => ({ value: e.id, label: `${e.fullName} (${e.email})` })),
  ];

  return (
    <>
      <PageHeader
        title={isEdit ? 'Edit Site' : 'New Construction Site'}
        description={
          isEdit
            ? 'Update site details, location and in-charge engineer.'
            : 'Register a work zone or site under a construction project.'
        }
      />

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <FormAlert error={errors.root?.message} />

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <Card>
              <CardHeader title="Site Identification" />
              <CardBody className="space-y-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <FormField label="Site code" required error={errors.code?.message}>
                    <Input
                      {...register('code')}
                      placeholder="e.g. SITE-01-A"
                      disabled={isEdit}
                      className="uppercase font-mono"
                    />
                  </FormField>
                  <FormField label="Site name" required error={errors.name?.message}>
                    <Input {...register('name')} placeholder="e.g. Tower A Foundation & Basement" />
                  </FormField>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <FormField label="Parent project" required error={errors.project?.message}>
                    <Select {...register('project')} options={projectOptions} disabled={isEdit} />
                  </FormField>
                  <FormField label="Site status" required error={errors.status?.message}>
                    <Select {...register('status')} options={SITE_STATUS_OPTIONS} />
                  </FormField>
                </div>

                <FormField label="Description" error={errors.description?.message}>
                  <Textarea
                    {...register('description')}
                    rows={3}
                    placeholder="Brief description of the work zone, scope or package..."
                  />
                </FormField>
              </CardBody>
            </Card>

            <Card>
              <CardHeader title="Physical Location" />
              <CardBody className="space-y-4">
                <FormField label="Street address" error={errors.location?.address?.message}>
                  <Input {...register('location.address')} placeholder="Survey No., Plot, Road..." />
                </FormField>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <FormField label="City" error={errors.location?.city?.message}>
                    <Input {...register('location.city')} placeholder="e.g. Bengaluru" />
                  </FormField>
                  <FormField label="State" error={errors.location?.state?.message}>
                    <Input {...register('location.state')} placeholder="e.g. Karnataka" />
                  </FormField>
                  <FormField label="PIN Code" error={errors.location?.pincode?.message}>
                    <Input {...register('location.pincode')} placeholder="e.g. 560001" />
                  </FormField>
                </div>
              </CardBody>
            </Card>
          </div>

          <div className="space-y-6">
            <Card>
              <CardHeader title="Personnel & Timeline" />
              <CardBody className="space-y-4">
                <FormField
                  label="Site Engineer in-charge"
                  hint="Field engineer submitting daily reports"
                  error={errors.siteEngineer?.message}
                >
                  <Select {...register('siteEngineer')} options={engineerOptions} />
                </FormField>

                <FormField label="Start date" error={errors.startDate?.message}>
                  <Input type="date" {...register('startDate')} />
                </FormField>

                <FormField label="Target completion date" error={errors.targetCompletionDate?.message}>
                  <Input type="date" {...register('targetCompletionDate')} />
                </FormField>
              </CardBody>
              <CardFooter className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => navigate(isEdit ? `/sites/${id}` : '/sites')}
                >
                  Cancel
                </Button>
                <Button type="submit" loading={isSubmitting}>
                  {isEdit ? 'Save changes' : 'Create site'}
                </Button>
              </CardFooter>
            </Card>
          </div>
        </div>
      </form>
    </>
  );
}

