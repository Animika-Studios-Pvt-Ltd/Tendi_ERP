import { zodResolver } from '@hookform/resolvers/zod';
import { X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate, useParams } from 'react-router-dom';
import { z } from 'zod';
import ErrorState from '@/components/common/ErrorState';
import PageHeader from '@/components/common/PageHeader';
import PageLoader from '@/components/common/PageLoader';
import FormAlert from '@/components/forms/FormAlert';
import FormField from '@/components/forms/FormField';
import Avatar from '@/components/ui/Avatar';
import Button from '@/components/ui/Button';
import { Card, CardBody, CardFooter, CardHeader } from '@/components/ui/Card';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Textarea from '@/components/ui/Textarea';
import { useProject } from '@/hooks/useProject';
import { projectsService } from '@/services/projects.service';
import { applyServerErrors } from '@/utils/validation';
import { PROJECT_STATUS_OPTIONS } from '../constants';
import UserPicker from '../components/UserPicker';

/** Client-side mirror of backend/src/modules/projects/projects.validator.js */
const schema = z
  .object({
    code: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9][A-Z0-9-]{1,19}$/, 'Use 2-20 letters, numbers or dashes'),
    name: z.string().trim().min(1, 'Enter the project name').max(120),
    status: z.string(),
    description: z.string().trim().max(2000),
    client: z.object({
      name: z.string().trim().max(120),
      contactPerson: z.string().trim().max(120),
      phone: z.string().trim().max(20).regex(/^[+\d\s()-]*$/, 'Enter a valid phone number'),
    }),
    location: z.object({
      address: z.string().trim().max(300),
      city: z.string().trim().max(80),
      state: z.string().trim().max(80),
      pincode: z.string().trim().max(10).regex(/^\d*$/, 'Use digits only'),
    }),
    contractValue: z.string().trim().regex(/^\d*(\.\d{0,2})?$/, 'Enter an amount in rupees'),
    startDate: z.string(),
    plannedEndDate: z.string(),
    actualEndDate: z.string(),
    progressPercent: z.coerce.number().int('Use a whole number').min(0).max(100, 'Use 0 to 100'),
  })
  .superRefine((value, ctx) => {
    if (value.startDate && value.plannedEndDate && value.plannedEndDate < value.startDate) {
      ctx.addIssue({ code: 'custom', path: ['plannedEndDate'], message: 'Planned end must be on or after the start date' });
    }
    if (value.startDate && value.actualEndDate && value.actualEndDate < value.startDate) {
      ctx.addIssue({ code: 'custom', path: ['actualEndDate'], message: 'Actual end must be on or after the start date' });
    }
  });

const EMPTY = {
  code: '',
  name: '',
  status: 'planning',
  description: '',
  client: { name: '', contactPerson: '', phone: '' },
  location: { address: '', city: '', state: '', pincode: '' },
  contractValue: '',
  startDate: '',
  plannedEndDate: '',
  actualEndDate: '',
  progressPercent: 0,
};

const day = (value) => (value ? String(value).slice(0, 10) : '');

function toFormValues(project) {
  return {
    code: project.code,
    name: project.name,
    status: project.status,
    description: project.description,
    client: { ...EMPTY.client, ...project.client },
    location: { ...EMPTY.location, ...project.location },
    contractValue: project.contractValue ? String(project.contractValue) : '',
    startDate: day(project.startDate),
    plannedEndDate: day(project.plannedEndDate),
    actualEndDate: day(project.actualEndDate),
    progressPercent: project.progressPercent,
  };
}

function ManagerField({ value, onChange, id, invalid, ...aria }) {
  if (!value) {
    return <UserPicker id={id} invalid={invalid} onSelect={onChange} placeholder="Search for the project manager" {...aria} />;
  }
  return (
    <div id={id} className="flex h-9 items-center gap-2 rounded-md border border-line-strong bg-surface pr-1 pl-2">
      <Avatar name={value.fullName} size="sm" />
      <span className="min-w-0 flex-1 truncate text-sm">{value.fullName}</span>
      <Button variant="ghost" size="icon-sm" aria-label="Remove project manager" onClick={() => onChange(null)}>
        <X size={14} />
      </Button>
    </div>
  );
}

export default function ProjectFormPage() {
  const { id } = useParams();
  const editing = Boolean(id);
  const navigate = useNavigate();
  const { refreshProjects } = useProject();

  const [loadState, setLoadState] = useState({ loading: editing, error: null });
  const [manager, setManager] = useState(null);
  const [notice, setNotice] = useState(null);

  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(schema), defaultValues: EMPTY });

  useEffect(() => {
    if (!editing) return;
    let cancelled = false;
    projectsService
      .get(id)
      .then(({ data }) => {
        if (cancelled) return;
        reset(toFormValues(data));
        setManager(data.projectManager);
        setLoadState({ loading: false, error: null });
      })
      .catch((error) => !cancelled && setLoadState({ loading: false, error }));
    return () => {
      cancelled = true;
    };
  }, [editing, id, reset]);

  const onSubmit = async (values) => {
    setNotice(null);
    const payload = {
      ...values,
      contractValue: values.contractValue ? Number(values.contractValue) : 0,
      startDate: values.startDate || null,
      plannedEndDate: values.plannedEndDate || null,
      actualEndDate: values.actualEndDate || null,
      projectManager: manager?.id ?? null,
    };
    try {
      const { data } = editing ? await projectsService.update(id, payload) : await projectsService.create(payload);
      refreshProjects();
      navigate(`/projects/${data.id}`, { replace: true });
    } catch (error) {
      if (!applyServerErrors(error, setError)) setNotice(error.message);
    }
  };

  if (loadState.loading) return <PageLoader label="Loading project" />;
  if (loadState.error) {
    return <ErrorState title="This project could not be opened" error={loadState.error} onRetry={() => window.location.reload()} />;
  }

  const cancelTo = editing ? `/projects/${id}` : '/projects';

  return (
    <>
      <PageHeader
        title={editing ? 'Edit project' : 'New project'}
        description={editing ? 'Update the project register entry.' : 'Register a project. You can add the team after saving.'}
      />
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-6">
        {notice && <FormAlert>{notice}</FormAlert>}

        <Card>
          <CardHeader title="Project" />
          <CardBody className="grid gap-5 md:grid-cols-6">
            <FormField label="Code" required hint="Short reference, e.g. PRJ-024" error={errors.code?.message} className="md:col-span-2">
              <Input className="uppercase" maxLength={20} {...register('code')} />
            </FormField>
            <FormField label="Project name" required error={errors.name?.message} className="md:col-span-4">
              <Input maxLength={120} {...register('name')} />
            </FormField>
            <FormField label="Status" error={errors.status?.message} className="md:col-span-2">
              <Select options={PROJECT_STATUS_OPTIONS} {...register('status')} />
            </FormField>
            <FormField label="Project manager" error={errors.projectManager?.message} className="md:col-span-4">
              <ManagerField value={manager} onChange={setManager} />
            </FormField>
            <FormField label="Description" error={errors.description?.message} className="md:col-span-6">
              <Textarea rows={3} maxLength={2000} {...register('description')} />
            </FormField>
          </CardBody>
        </Card>

        <div className="grid gap-6 xl:grid-cols-2">
          <Card>
            <CardHeader title="Client" />
            <CardBody className="grid gap-5 sm:grid-cols-2">
              <FormField label="Client name" error={errors.client?.name?.message} className="sm:col-span-2">
                <Input maxLength={120} {...register('client.name')} />
              </FormField>
              <FormField label="Contact person" error={errors.client?.contactPerson?.message}>
                <Input maxLength={120} {...register('client.contactPerson')} />
              </FormField>
              <FormField label="Phone" error={errors.client?.phone?.message}>
                <Input type="tel" maxLength={20} placeholder="+91 98765 43210" {...register('client.phone')} />
              </FormField>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Site location" />
            <CardBody className="grid gap-5 sm:grid-cols-3">
              <FormField label="Address" error={errors.location?.address?.message} className="sm:col-span-3">
                <Input maxLength={300} {...register('location.address')} />
              </FormField>
              <FormField label="City" error={errors.location?.city?.message}>
                <Input maxLength={80} {...register('location.city')} />
              </FormField>
              <FormField label="State" error={errors.location?.state?.message}>
                <Input maxLength={80} {...register('location.state')} />
              </FormField>
              <FormField label="PIN code" error={errors.location?.pincode?.message}>
                <Input inputMode="numeric" maxLength={10} {...register('location.pincode')} />
              </FormField>
            </CardBody>
          </Card>
        </div>

        <Card>
          <CardHeader title="Contract and schedule" />
          <CardBody className="grid gap-5 sm:grid-cols-2 lg:grid-cols-5">
            <FormField label="Contract value (₹)" error={errors.contractValue?.message}>
              <Input inputMode="decimal" className="tabular" placeholder="0" {...register('contractValue')} />
            </FormField>
            <FormField label="Start date" error={errors.startDate?.message}>
              <Input type="date" {...register('startDate')} />
            </FormField>
            <FormField label="Planned end" error={errors.plannedEndDate?.message}>
              <Input type="date" {...register('plannedEndDate')} />
            </FormField>
            <FormField label="Actual end" error={errors.actualEndDate?.message}>
              <Input type="date" {...register('actualEndDate')} />
            </FormField>
            <FormField label="Progress (%)" error={errors.progressPercent?.message}>
              <Input type="number" min={0} max={100} step={1} className="tabular" {...register('progressPercent')} />
            </FormField>
          </CardBody>
          <CardFooter>
            <Button variant="secondary" onClick={() => navigate(cancelTo)}>
              Cancel
            </Button>
            <Button type="submit" loading={isSubmitting}>
              {editing ? 'Save changes' : 'Create project'}
            </Button>
          </CardFooter>
        </Card>
      </form>
    </>
  );
}
