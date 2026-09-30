import { Link } from 'react-router';
import type { FriendStatus } from '@adda/shared';
import { useFriendAction } from '../hooks/queries';
import { toast } from '../stores/toasts';

/** The one control for a relationship: add → requested → accept/decline → message. */
export function FriendButton({ id, name, status, block = false }: { id: string; name: string; status: FriendStatus; block?: boolean }) {
  const act = useFriendAction();
  const busy = act.isPending;
  const cls = (extra = '') => `btn btn--sm ${block ? 'btn--block' : ''} ${extra}`;
  const run = (action: 'request' | 'accept' | 'remove', done?: string) =>
    act.mutate({ id, action }, { onSuccess: () => done && toast(done, { kind: 'good' }) });

  switch (status) {
    case 'friends':
      return (
        <Link to={`/chat/${id}`} className={cls('btn--cyan')}>
          MESSAGE
        </Link>
      );
    case 'outgoing':
      return (
        <button type="button" className={cls('btn--ghost')} disabled={busy} onClick={() => run('remove')} title="Click to cancel the request">
          REQUESTED · CANCEL
        </button>
      );
    case 'incoming':
      return (
        <span className={`row friend-btns ${block ? 'friend-btns--block' : ''}`}>
          <button type="button" className="btn btn--sm" disabled={busy} onClick={() => run('accept', `YOU AND ${name.toUpperCase()} ARE FRIENDS`)}>
            ACCEPT
          </button>
          <button type="button" className="btn btn--sm btn--ghost" disabled={busy} onClick={() => run('remove')}>
            DECLINE
          </button>
        </span>
      );
    default:
      return (
        <button type="button" className={cls('btn--pink')} disabled={busy} onClick={() => run('request', 'FRIEND REQUEST SENT')}>
          + ADD FRIEND
        </button>
      );
  }
}
