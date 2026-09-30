import { useEffect, useRef, type FormEvent } from 'react';
import { Link, useParams } from 'react-router';
import type { DirectMessage, PublicUser } from '@adda/shared';
import { useConversations, usePerson, useSendMessage, useThread } from '../../hooks/queries';
import { api } from '../../lib/api';
import { keys, queryClient } from '../../lib/queryClient';
import { dayKey, fmtDate, fmtTime } from '../../lib/time';
import { useLive } from '../../stores/live';
import { Avatar, Empty, Loading } from '../../components/ui';
import { FriendButton } from '../../components/FriendButton';
import './chat.css';

export function ChatPage({ me }: { me: PublicUser }) {
  const { userId } = useParams();
  const { data: convos, isPending } = useConversations();
  const setActiveChat = useLive((s) => s.setActiveChat);

  useEffect(() => {
    setActiveChat(userId ?? null);
    return () => setActiveChat(null);
  }, [userId, setActiveChat]);

  return (
    <div className={`chat ${userId ? 'chat--thread' : ''}`}>
      <aside className="panel chat__list" aria-label="Conversations">
        <div className="panel__head">
          <h2 className="panel__title">CHATS</h2>
          <Link to="/people">+ NEW</Link>
        </div>
        {isPending ? (
          <Loading />
        ) : convos?.length ? (
          <ul>
            {convos.map((c) => (
              <li key={c.user.id}>
                <Link to={`/chat/${c.user.id}`} className={`convo ${c.user.id === userId ? 'convo--active' : ''}`}>
                  <Avatar user={c.user} size={40} showPresence />
                  <span className="grow">
                    <span className="upper truncate convo__name">{c.user.name}</span>
                    <span className="dim truncate convo__last">
                      {c.last.senderId === me.id ? 'YOU: ' : ''}
                      {c.last.text}
                    </span>
                  </span>
                  {c.unread > 0 && <span className="nav__badge">{c.unread}</span>}
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <Empty title="NO CHATS">Find someone on the People page and say hi.</Empty>
        )}
      </aside>
      <section className="panel chat__thread">
        {userId ? <Thread key={userId} otherId={userId} me={me} /> : <Empty title="PICK A CHAT">Or find new people to talk to.</Empty>}
      </section>
    </div>
  );
}

function Thread({ otherId, me }: { otherId: string; me: PublicUser }) {
  const { data: other, isError } = usePerson(otherId);
  const { data: messages, isPending } = useThread(otherId);
  const send = useSendMessage(otherId);
  const online = useLive((s) => s.online.has(otherId));
  const box = useRef<HTMLDivElement>(null);
  const count = messages?.length ?? 0;

  // Mark read on open and whenever a new message lands while we're looking.
  useEffect(() => {
    if (!messages?.some((m) => m.senderId === otherId && !m.readAt)) return;
    api.chat.markRead(otherId).then(() => queryClient.invalidateQueries({ queryKey: keys.conversations }));
  }, [count, otherId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (box.current) box.current.scrollTop = box.current.scrollHeight;
  }, [count]);

  if (isError) return <Empty title="PLAYER NOT FOUND" />;

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const input = e.currentTarget.elements.namedItem('text') as HTMLInputElement;
    const text = input.value.trim();
    if (!text || otherId === me.id) return;
    input.value = '';
    send.mutate(text, {
      onSuccess: (m) => queryClient.setQueryData<DirectMessage[]>(keys.thread(otherId), (prev) => (prev?.some((x) => x.id === m.id) ? prev : [...(prev ?? []), m])),
      onError: () => (input.value = text),
    });
  };

  return (
    <>
      <header className="thread__head">
        <Link to="/chat" className="icon-btn thread__back" aria-label="Back to chats">
          ◀
        </Link>
        {other && <Avatar user={other} size={44} showPresence />}
        <div className="grow">
          <p className="upper truncate thread__name">{other?.name ?? '…'}</p>
          <p className="dim truncate">
            {online ? <span className="c-green">ONLINE</span> : 'OFFLINE'}
            {other && ` · ${other.branch} · YEAR ${other.year}`}
            {other?.interests.length ? ` · ${other.interests.slice(0, 3).join(', ')}` : ''}
          </p>
        </div>
      </header>

      <div className="thread__log" ref={box}>
        {isPending ? (
          <Loading />
        ) : count ? (
          messages!.map((m, i) => {
            const newDay = i === 0 || dayKey(messages![i - 1]!.createdAt) !== dayKey(m.createdAt);
            const mine = m.senderId === me.id;
            return (
              <div key={m.id} className="thread__item">
                {newDay && <p className="thread__day px-xs">{fmtDate(m.createdAt)}</p>}
                <div className={`bubble ${mine ? 'bubble--mine' : ''}`}>
                  <p>{m.text}</p>
                  <span className="bubble__time">{fmtTime(m.createdAt)}</span>
                </div>
              </div>
            );
          })
        ) : (
          <p className="dim thread__hello">No messages yet. Say hi, you're both JECRCians.</p>
        )}
      </div>

      {!other ? null : other.friend === 'friends' ? (
        <form className="row thread__send" onSubmit={submit}>
          <input className="input" name="text" maxLength={1000} placeholder={`Message ${other.name.split(' ')[0]}…`} autoComplete="off" aria-label="Message" autoFocus />
          <button className="btn">SEND</button>
        </form>
      ) : (
        <div className="thread__send thread__gate">
          <p className="muted">
            {other.friend === 'incoming'
              ? `${other.name.split(' ')[0]} wants to be friends. Accept to start chatting.`
              : other.friend === 'outgoing'
                ? 'Request sent. You can chat once they accept.'
                : 'Only friends can message each other.'}
          </p>
          <FriendButton id={other.id} name={other.name} status={other.friend} />
        </div>
      )}
    </>
  );
}
