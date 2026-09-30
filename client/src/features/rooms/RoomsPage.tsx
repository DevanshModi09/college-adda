import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { useCreateRoom, useRooms } from '../../hooks/queries';
import { ApiError } from '../../lib/api';
import { useLive } from '../../stores/live';
import { AvatarStack, Empty, Field, Loading, Modal, PageHead } from '../../components/ui';
import './rooms.css';

export function RoomsPage() {
  const { data, isPending } = useRooms();
  const live = useLive((s) => s.rooms);
  const rooms = [...(live ?? data ?? [])].sort((a, b) => b.members.length - a.members.length || a.createdAt - b.createdAt);
  const [creating, setCreating] = useState(false);

  return (
    <>
      <PageHead title="CODE DESKS" sub="Pull up a desk, set what you're working on, grind together on a shared focus timer.">
        <button type="button" className="btn" onClick={() => setCreating(true)}>
          + NEW DESK
        </button>
      </PageHead>

      {isPending && !live ? (
        <Loading />
      ) : rooms.length ? (
        <div className="room-grid">
          {rooms.map((r) => {
            const status = r.members.find((m) => m.status)?.status;
            return (
              <Link key={r.id} to={`/desks/${r.id}`} className={`panel room-card ${r.members.length ? 'panel--cyan' : ''}`}>
                <div className="spread">
                  <span className="tag">{r.lang.toUpperCase()}</span>
                  <span className={r.members.length ? 'c-green' : 'dim'}>
                    <span className={`live-dot ${r.members.length ? '' : 'live-dot--off'}`} />
                    {r.members.length ? `${r.members.length} PLAYING` : 'EMPTY'}
                  </span>
                </div>
                <h2 className="room-card__name upper">{r.name}</h2>
                <p className="muted room-card__topic">{r.topic || 'No description'}</p>
                {status && <p className="room-card__status">“{status}”</p>}
                <div className="spread room-card__foot">
                  {r.members.length ? <AvatarStack users={r.members} /> : <span className="dim">BE PLAYER 1</span>}
                  <span className="px-xs c-yellow">JOIN ▶</span>
                </div>
              </Link>
            );
          })}
        </div>
      ) : (
        <div className="panel">
          <Empty title="NO DESKS YET">Set up the first one.</Empty>
        </div>
      )}

      <Modal open={creating} title="NEW CODE DESK" onClose={() => setCreating(false)}>
        <CreateRoomForm />
      </Modal>
    </>
  );
}

function CreateRoomForm() {
  const create = useCreateRoom();
  const navigate = useNavigate();
  const [error, setError] = useState<ApiError | null>(null);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    try {
      const room = await create.mutateAsync({ name: f.name!, topic: f.topic ?? '', lang: f.lang ?? '' });
      navigate(`/desks/${room.id}`);
    } catch (err) {
      setError(err as ApiError);
    }
  }

  return (
    <form className="form-grid" onSubmit={submit}>
      <Field label="DESK NAME" error={error?.details.name}>
        <input className="input" name="name" required maxLength={40} placeholder="CP contest warmup" />
      </Field>
      <Field label="WHAT'S IT FOR?">
        <input className="input" name="topic" maxLength={160} placeholder="Codeforces Div 3 practice before Sunday" />
      </Field>
      <Field label="LANGUAGE / STACK">
        <input className="input" name="lang" maxLength={24} placeholder="C++, Python, React…" />
      </Field>
      {error && !Object.keys(error.details).length && <p className="form-error">{error.message}</p>}
      <button className="btn" disabled={create.isPending}>
        CREATE & SIT DOWN
      </button>
    </form>
  );
}
