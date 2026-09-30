import { useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router';
import type { Notice, PublicUser } from '@adda/shared';
import { useDeleteNotice, useNotices, usePinNotice, usePostNotice, useSections } from '../../hooks/queries';
import { sectionKeyOf, sectionLabel } from '../../lib/constants';
import { fmtShortDate, fmtTime } from '../../lib/time';
import { toast } from '../../stores/toasts';
import { Avatar, Empty, Loading, PageHead, Panel } from '../../components/ui';
import { SectionSelect } from '../timetable/TimetablePage';
import './notices.css';

const MAX = 500;

export function NoticesPage({ me }: { me: PublicUser }) {
  const mine = sectionKeyOf(me);
  const [params, setParams] = useSearchParams();
  const sectionKey = params.get('section') || mine;
  const isMine = sectionKey === mine;
  const isAdmin = me.role === 'admin';
  const canPost = isMine || isAdmin;

  const { data: sections } = useSections();
  const { data, isPending } = useNotices(sectionKey);
  const pick = (key: string) => setParams(key === mine ? {} : { section: key }, { replace: true });

  return (
    <>
      <PageHead title="NOTICE BOARD" sub="Your section's wall: class moved, CR updates, lab file reminders, lost chargers. Pinned posts come from admins." />

      <div className="tt-picker">
        <label className="field tt-picker__field">
          <span className="field__label">SECTION</span>
          <SectionSelect sections={sections ?? []} value={sectionKey} mine={mine} onChange={pick} />
        </label>
        {!isMine && (
          <button type="button" className="btn btn--ghost" onClick={() => pick(mine)}>
            ◀ BACK TO MINE
          </button>
        )}
        <p className="muted tt-picker__note">
          {isMine ? 'YOUR SECTION' : `VIEWING ${sectionLabel(sectionKey)}`}
          {!canPost && ' · READ ONLY'}
        </p>
      </div>

      {canPost && <Composer sectionKey={sectionKey} isAdmin={isAdmin} />}

      {isPending ? (
        <Loading />
      ) : data?.length ? (
        <div className="notices">
          {data.map((n) => (
            <NoticeCard key={n.id} n={n} isAdmin={isAdmin} />
          ))}
        </div>
      ) : (
        <Panel>
          <Empty title="BOARD IS EMPTY">{canPost ? 'Be the first to pin something up.' : 'Nothing posted in this section yet.'}</Empty>
        </Panel>
      )}
    </>
  );
}

function Composer({ sectionKey, isAdmin }: { sectionKey: string; isAdmin: boolean }) {
  const post = usePostNotice();
  const [body, setBody] = useState('');
  const [pinned, setPinned] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!body.trim()) return;
    try {
      await post.mutateAsync({ body: body.trim(), section: sectionKey, pinned: isAdmin && pinned });
      setBody('');
      setPinned(false);
      toast('NOTICE POSTED', { kind: 'good' });
    } catch (err) {
      toast((err as Error).message, { kind: 'bad' });
    }
  };

  return (
    <Panel tone="cyan" className="notice-compose">
      <form onSubmit={submit}>
        <textarea
          className="textarea"
          rows={3}
          maxLength={MAX}
          placeholder="e.g. DBMS lab shifted to Lab 4 today. Bring your file!"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          aria-label="New notice"
        />
        <div className="spread notice-compose__foot">
          <span className="muted">
            {body.length}/{MAX}
          </span>
          <div className="row">
            {isAdmin && (
              <label className="notice-compose__pin">
                <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} /> PIN IT
              </label>
            )}
            <button className="btn" disabled={post.isPending || !body.trim()}>
              POST
            </button>
          </div>
        </div>
      </form>
    </Panel>
  );
}

function NoticeCard({ n, isAdmin }: { n: Notice; isAdmin: boolean }) {
  const pin = usePinNotice();
  const remove = useDeleteNotice();

  return (
    <article className={`panel notice ${n.pinned ? 'notice--pinned' : ''}`}>
      {n.pinned && <span className="notice__pin px-sm">📌 PINNED</span>}
      <p className="notice__body">{n.body}</p>
      <footer className="spread notice__foot">
        <span className="row notice__by">
          {n.author && <Avatar user={n.author} size={28} />}
          <span>
            {n.author?.name.toUpperCase() ?? 'SOMEONE'}
            {n.author?.role === 'admin' && <span className="c-yellow"> · ADMIN</span>}
            <span className="muted">
              {' '}
              · {fmtShortDate(n.createdAt)} {fmtTime(n.createdAt)}
            </span>
          </span>
        </span>
        <span className="row">
          {isAdmin && (
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => pin.mutate({ id: n.id, pinned: !n.pinned })}>
              {n.pinned ? 'UNPIN' : 'PIN'}
            </button>
          )}
          {n.canDelete && (
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => remove.mutate({ id: n.id, sectionKey: n.sectionKey })}>
              REMOVE
            </button>
          )}
        </span>
      </footer>
    </article>
  );
}
