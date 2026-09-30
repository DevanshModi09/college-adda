import { useNavigate } from 'react-router';
import { useToasts } from '../stores/toasts';

export function Toaster() {
  const { toasts, dismiss } = useToasts();
  const navigate = useNavigate();
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <button
          key={t.id}
          type="button"
          className={`toast toast--${t.kind}`}
          onClick={() => {
            dismiss(t.id);
            if (t.href) navigate(t.href);
          }}
        >
          {t.text}
        </button>
      ))}
    </div>
  );
}
