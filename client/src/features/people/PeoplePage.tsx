import { useDeferredValue, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import type { Person, PublicUser } from '@adda/shared';
import { useFriendAction, useFriends, usePeople } from '../../hooks/queries';
import { BRANCHES, YEARS } from '../../lib/constants';
import { useLive } from '../../stores/live';
import { Avatar, Empty, Loading, PageHead } from '../../components/ui';
import { FriendButton } from '../../components/FriendButton';
import './people.css';

type Tab = 'find' | 'friends' | 'requests';

export function PeoplePage() {
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as Tab) || 'find';
  const { data: overview } = useFriends();
  const setTab = (t: Tab) => setParams(t === 'find' ? {} : { tab: t }, { replace: true });

  return (
    <>
      <PageHead title="PEOPLE" sub="Find your people, add them as friends, then DM. Only friends can message each other." />

      <div className="tabs" role="group" aria-label="People">
        <button type="button" className="tab" aria-pressed={tab === 'find'} onClick={() => setTab('find')}>
          FIND PLAYERS
        </button>
        <button type="button" className="tab" aria-pressed={tab === 'friends'} onClick={() => setTab('friends')}>
          FRIENDS{overview?.friends.length ? <span className="tab__count">{overview.friends.length}</span> : null}
        </button>
        <button type="button" className="tab" aria-pressed={tab === 'requests'} onClick={() => setTab('requests')}>
          REQUESTS{overview?.incoming.length ? <span className="tab__count c-pink">{overview.incoming.length}</span> : null}
        </button>
      </div>

      {tab === 'find' && <FindPlayers />}
      {tab === 'friends' && <FriendsList friends={overview?.friends} />}
      {tab === 'requests' && <Requests incoming={overview?.incoming} outgoing={overview?.outgoing} />}
    </>
  );
}

function FindPlayers() {
  const [q, setQ] = useState('');
  const [branch, setBranch] = useState('');
  const [year, setYear] = useState('');
  const [onlineOnly, setOnlineOnly] = useState(false);
  const deferredQ = useDeferredValue(q.trim());
  const { data, isPending } = usePeople({ q: deferredQ, branch, year, online: onlineOnly });

  return (
    <>
      <div className="panel people-filters">
        <input className="input" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, interest, bio… try “React”" aria-label="Search people" />
        <select className="select" value={branch} onChange={(e) => setBranch(e.target.value)} aria-label="Branch">
          <option value="">ALL BRANCHES</option>
          {BRANCHES.map((b) => <option key={b}>{b}</option>)}
        </select>
        <select className="select" value={year} onChange={(e) => setYear(e.target.value)} aria-label="Year">
          <option value="">ALL YEARS</option>
          {YEARS.map((y) => <option key={y} value={y}>YEAR {y}</option>)}
        </select>
        <label className="check">
          <input type="checkbox" checked={onlineOnly} onChange={(e) => setOnlineOnly(e.target.checked)} /> ONLINE
        </label>
      </div>

      {isPending ? (
        <Loading />
      ) : data?.length ? (
        <div className="people-grid">
          {data.map((u) => (
            <PersonCard key={u.id} u={u} onInterest={setQ} />
          ))}
        </div>
      ) : (
        <div className="panel">
          <Empty title="NO PLAYERS FOUND">{q || branch || year || onlineOnly ? 'Try a broader search.' : 'Invite your classmates to Adda!'}</Empty>
        </div>
      )}
    </>
  );
}

function PersonCard({ u, onInterest }: { u: Person; onInterest?: (i: string) => void }) {
  const online = useLive((s) => s.online.has(u.id));
  return (
    <article className={`panel person ${u.friend === 'friends' ? 'panel--cyan' : ''}`}>
      <div className="row">
        <Avatar user={u} size={52} showPresence />
        <div className="grow">
          <h2 className="person__name upper truncate">{u.name}</h2>
          <p className="dim">@{u.username}</p>
        </div>
      </div>
      <p>
        <span className="tag">{u.branch || 'JECRC'}</span> <span className="tag">Y{u.year} · {u.section}</span>
        {u.friend === 'friends' && <span className="c-cyan"> ★ FRIEND</span>}
        {online && <span className="c-green"> ● ONLINE</span>}
      </p>
      {u.bio && <p className="muted">{u.bio}</p>}
      {u.interests.length > 0 && (
        <div className="person__chips">
          {u.interests.map((i) =>
            onInterest ? (
              <button key={i} type="button" className="chip" onClick={() => onInterest(i)}>
                {i}
              </button>
            ) : (
              <span key={i} className="chip">
                {i}
              </span>
            )
          )}
        </div>
      )}
      <div className="person__cta">
        <FriendButton id={u.id} name={u.name} status={u.friend} block />
      </div>
    </article>
  );
}

function FriendsList({ friends }: { friends?: PublicUser[] }) {
  const online = useLive((s) => s.online);
  const remove = useFriendAction();
  if (!friends) return <Loading />;
  if (!friends.length) {
    return (
      <div className="panel">
        <Empty title="NO FRIENDS YET">Find players and hit + ADD FRIEND.</Empty>
      </div>
    );
  }
  const sorted = [...friends].sort((a, b) => Number(online.has(b.id)) - Number(online.has(a.id)));
  return (
    <ul className="panel friend-list">
      {sorted.map((u) => (
        <li key={u.id}>
          <Avatar user={u} size={40} showPresence />
          <div className="grow">
            <p className="upper truncate">{u.name}</p>
            <p className="dim">
              {u.branch} · Y{u.year} · {u.section}
              {online.has(u.id) && <span className="c-green"> · ONLINE</span>}
            </p>
          </div>
          <Link to={`/chat/${u.id}`} className="btn btn--sm btn--cyan">
            MESSAGE
          </Link>
          <button type="button" className="icon-btn" onClick={() => remove.mutate({ id: u.id, action: 'remove' })} aria-label={`Unfriend ${u.name}`} title="Unfriend">
            X
          </button>
        </li>
      ))}
    </ul>
  );
}

function Requests({ incoming, outgoing }: { incoming?: PublicUser[]; outgoing?: PublicUser[] }) {
  if (!incoming || !outgoing) return <Loading />;
  return (
    <div className="grid-2">
      <section className="panel">
        <h2 className="panel__title">WAITING ON YOU</h2>
        {incoming.length ? (
          <ul className="friend-list friend-list--bare">
            {incoming.map((u) => (
              <li key={u.id}>
                <Avatar user={u} size={40} />
                <div className="grow">
                  <p className="upper truncate">{u.name}</p>
                  <p className="dim">{u.branch} · Y{u.year} · {u.section}</p>
                </div>
                <FriendButton id={u.id} name={u.name} status="incoming" />
              </li>
            ))}
          </ul>
        ) : (
          <Empty title="NO REQUESTS" />
        )}
      </section>
      <section className="panel">
        <h2 className="panel__title">SENT</h2>
        {outgoing.length ? (
          <ul className="friend-list friend-list--bare">
            {outgoing.map((u) => (
              <li key={u.id}>
                <Avatar user={u} size={40} />
                <div className="grow">
                  <p className="upper truncate">{u.name}</p>
                  <p className="dim">{u.branch} · Y{u.year} · {u.section}</p>
                </div>
                <FriendButton id={u.id} name={u.name} status="outgoing" />
              </li>
            ))}
          </ul>
        ) : (
          <Empty title="NOTHING PENDING" />
        )}
      </section>
    </div>
  );
}
