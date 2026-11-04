import { Eye, EyeOff, Lock } from 'lucide-react';
import { forwardRef, useState } from 'react';
import Input from '@/components/ui/Input';

const PasswordInput = forwardRef(function PasswordInput(props, ref) {
  const [visible, setVisible] = useState(false);
  return (
    <Input
      ref={ref}
      type={visible ? 'text' : 'password'}
      leftIcon={Lock}
      rightSlot={
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          className="inline-flex h-7 w-7 items-center justify-center rounded text-muted hover:bg-navy-50 hover:text-ink"
          aria-label={visible ? 'Hide password' : 'Show password'}
        >
          {visible ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      }
      {...props}
    />
  );
});

export default PasswordInput;
