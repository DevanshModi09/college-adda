import { useState, type FormEvent } from 'react';
import type { PublicUser } from '@adda/shared';
import { api, ApiError } from '../../lib/api';
import { sectionLabel, sectionKeyOf } from '../../lib/constants';
import { keys, queryClient } from '../../lib/queryClient';
import { toast } from '../../stores/toasts';
import { Avatar, Field, PageHead, Panel } from '../../components/ui';
import { SectionFields } from '../../components/SectionFields';

export function ProfilePage({ user }: { user: PublicUser }) {
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    setBusy(true);
    setError(null);
    try {
      const next = await api.auth.updateProfile({
        name: f.name!,
        branch: f.branch!,
        year: Number(f.year),
        section: f.section!,
        bio: f.bio ?? '',
        interests: f.interests ?? '',
      });
      queryClient.setQueryData(keys.me, next);
      toast('PROFILE SAVED', { kind: 'good' });
    } catch (err) {
      setError(err as ApiError);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHead title="PLAYER CARD" sub="A good bio and interests help people find you for teams and study groups." />
      <div className="grid-2">
        <Panel title="PREVIEW" tone="cyan">
          <div className="row">
            <Avatar user={user} size={64} />
            <div>
              <p className="upper" style={{ fontSize: 32, lineHeight: 1 }}>{user.name}</p>
              <p className="dim">@{user.username}</p>
            </div>
          </div>
          <p style={{ marginTop: 14 }}>
            <span className="tag">{user.branch ? sectionLabel(sectionKeyOf(user)) : 'JECRC'}</span>
            {user.role === 'admin' && <span className="tag c-yellow"> ADMIN</span>}
          </p>
          {user.bio && <p className="muted" style={{ marginTop: 10 }}>{user.bio}</p>}
          <p className="c-cyan" style={{ marginTop: 10 }}>{user.interests.join(' · ')}</p>
        </Panel>

        <form className="panel form-grid" onSubmit={submit}>
          <Field label="FULL NAME" error={error?.details.name}>
            <input className="input" name="name" required maxLength={60} defaultValue={user.name} />
          </Field>
          <SectionFields defaults={user} error={error?.details.section} />
          <Field label="INTERESTS (COMMA SEPARATED)">
            <input className="input" name="interests" defaultValue={user.interests.join(', ')} />
          </Field>
          <Field label="BIO">
            <input className="input" name="bio" maxLength={200} defaultValue={user.bio} />
          </Field>
          {error && !Object.keys(error.details).length && <p className="form-error">{error.message}</p>}
          <button className="btn" disabled={busy}>
            SAVE
          </button>
        </form>
      </div>
    </>
  );
}
