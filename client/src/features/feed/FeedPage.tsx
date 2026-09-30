import { useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import type { Post, PublicUser } from '@adda/shared';
import { useCreatePost, useDeletePost, useFeed, useLikePost } from '../../hooks/queries';
import { useNow } from '../../hooks/useNow';
import { prepareImage } from '../../lib/image';
import { ago } from '../../lib/time';
import { toast } from '../../stores/toasts';
import { Avatar, Empty, Loading, PageHead, Panel } from '../../components/ui';
import './feed.css';

const MAX = 500;

export function FeedPage({ me }: { me: PublicUser }) {
  const { data, isPending } = useFeed();
  const now = useNow(30_000);

  return (
    <>
      <PageHead title="FEED" sub="What's on your mind? Canteen reviews, lab rants, lost-and-found, memes. The whole campus sees it." />
      <Composer me={me} />
      {isPending ? (
        <Loading />
      ) : data?.length ? (
        <div className="feed">
          {data.map((p) => (
            <PostCard key={p.id} p={p} now={now} />
          ))}
        </div>
      ) : (
        <Panel>
          <Empty title="QUIET CAMPUS">Nobody has posted yet. Break the ice.</Empty>
        </Panel>
      )}
    </>
  );
}

function Composer({ me }: { me: PublicUser }) {
  const create = useCreatePost();
  const fileRef = useRef<HTMLInputElement>(null);
  const [body, setBody] = useState('');
  const [image, setImage] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);

  const pick = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow picking the same file again
    if (!file) return;
    setPreparing(true);
    try {
      setImage(await prepareImage(file));
    } catch (err) {
      toast((err as Error).message.toUpperCase(), { kind: 'bad' });
    } finally {
      setPreparing(false);
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!body.trim() && !image) return;
    try {
      await create.mutateAsync({ body: body.trim(), ...(image ? { image } : {}) });
      setBody('');
      setImage(null);
    } catch (err) {
      toast((err as Error).message, { kind: 'bad' });
    }
  };

  const busy = create.isPending || preparing;

  return (
    <Panel tone="pink" className="feed-compose">
      <form onSubmit={submit} className="feed-compose__form">
        <Avatar user={me} size={44} />
        <div className="grow stack">
          <textarea
            className="textarea"
            rows={3}
            maxLength={MAX}
            placeholder={`What's up, ${me.name.split(' ')[0]}?`}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            aria-label="New post"
          />
          {image && (
            <div className="feed-compose__preview">
              <img src={image} alt="Photo to post" />
              <button type="button" className="icon-btn" onClick={() => setImage(null)} aria-label="Remove photo">
                X
              </button>
            </div>
          )}
          <div className="spread feed-compose__foot">
            <span className="row">
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => fileRef.current?.click()} disabled={busy}>
                {preparing ? 'SHRINKING…' : image ? '📷 CHANGE PHOTO' : '📷 ADD PHOTO'}
              </button>
              <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" hidden onChange={pick} />
              <span className="muted">
                {body.length}/{MAX}
              </span>
            </span>
            <button className="btn" disabled={busy || (!body.trim() && !image)}>
              {create.isPending ? 'POSTING…' : 'POST'}
            </button>
          </div>
        </div>
      </form>
    </Panel>
  );
}

function PostCard({ p, now }: { p: Post; now: number }) {
  const like = useLikePost();
  const remove = useDeletePost();
  return (
    <article className="panel post">
      <header className="row post__head">
        {p.author && <Avatar user={p.author} size={40} showPresence />}
        <div className="grow">
          <p className="upper post__name">
            {p.author?.name ?? 'SOMEONE'}
            {p.author?.role === 'admin' && <span className="c-yellow"> · ADMIN</span>}
            {p.author?.guest && <span className="dim"> · GUEST</span>}
          </p>
          <p className="dim">
            {p.author ? `${p.author.branch} · Y${p.author.year} · ${p.author.section} · ` : ''}
            {ago(p.createdAt, now)}
          </p>
        </div>
      </header>
      {p.body && <p className="post__body">{p.body}</p>}
      {p.image && <img className="post__img" src={p.image} alt={p.body ? `Photo: ${p.body.slice(0, 80)}` : 'Photo'} loading="lazy" />}
      <footer className="row post__foot">
        <button type="button" className={`post__like ${p.liked ? 'is-liked' : ''}`} onClick={() => like.mutate(p.id)} aria-pressed={p.liked}>
          {p.liked ? '♥' : '♡'} {p.likes}
        </button>
        {p.canDelete && (
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => remove.mutate(p.id)}>
            DELETE
          </button>
        )}
      </footer>
    </article>
  );
}
