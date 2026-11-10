import { AlertTriangle } from 'lucide-react';
import Button from './Button';
import { Card, CardBody, CardFooter, CardHeader } from './Card';

export default function ConfirmDialog({
  isOpen,
  title,
  description,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  confirmVariant = 'danger',
  loading = false,
  onConfirm,
  onClose,
}) {
  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      <div
        className="fixed inset-0 bg-navy-950/60 backdrop-blur-xs transition-opacity"
        onClick={!loading ? onClose : undefined}
        aria-hidden="true"
      />

      <Card className="relative z-10 w-full max-w-md shadow-xl">
        <CardHeader
          title={
            <div className="flex items-center gap-2.5 text-ink" id="confirm-dialog-title">
              {confirmVariant === 'danger' && (
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-danger-100 text-danger-600">
                  <AlertTriangle size={18} />
                </div>
              )}
              <span className="text-base font-semibold">{title}</span>
            </div>
          }
        />
        <CardBody className="py-2 text-sm text-muted">
          {description}
        </CardBody>
        <CardFooter className="flex justify-end gap-2.5 pt-4">
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            {cancelText}
          </Button>
          <Button variant={confirmVariant} loading={loading} onClick={onConfirm}>
            {confirmText}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}

