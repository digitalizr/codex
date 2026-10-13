import { useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  GripVertical,
  MoveRight,
  Sparkles,
  Plus,
  UserRound,
} from 'lucide-react';
import { api, prettyDate, today } from '../api';
import Modal from '../components/Modal';
import MemberAvatar from '../components/MemberAvatar';
import type { HouseholdState, PageProps, ShoppingList } from '../types';
import { CreateListModal } from './Shopping';
import '../shopping.css';
import '../planner-playful.css';

function addDays(date: string, amount: number) {
  const value = new Date(`${date}T12:00:00`);
  value.setDate(value.getDate() + amount);
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
}
function monday(date: string) {
  const value = new Date(`${date}T12:00:00`);
  return addDays(date, -((value.getDay() + 6) % 7));
}
function weekLabel(start: string) {
  const end = addDays(start, 6);
  const a = new Date(`${start}T12:00:00`);
  const b = new Date(`${end}T12:00:00`);
  const monthA = a.toLocaleDateString('en-GB', { month: 'long' });
  const monthB = b.toLocaleDateString('en-GB', { month: 'long' });
  return monthA === monthB
    ? `${a.getDate()}–${b.getDate()} ${monthA} ${b.getFullYear()}`
    : `${a.getDate()} ${monthA} – ${b.getDate()} ${monthB} ${b.getFullYear()}`;
}

function ScheduleModal({
  state,
  memberId,
  initialDate,
  initialListId,
  onClose,
  onDone,
}: {
  state: HouseholdState;
  memberId: string;
  initialDate: string;
  initialListId?: string;
  onClose: () => void;
  onDone: (date: string | null) => Promise<void>;
}) {
  const available = state.lists.filter((l) => l.status !== 'completed');
  const [listId, setListId] = useState(initialListId || available[0]?.id || '');
  const existing = available.find((l) => l.id === listId);
  const [date, setDate] = useState(initialDate);
  const [assigned, setAssigned] = useState(existing?.memberId || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api(`/lists/${listId}`, {
        method: 'PATCH',
        body: { date: date || null, memberId: assigned || null },
      });
      await onDone(date || null);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={initialListId ? 'Schedule this trip' : 'Bring a trip into your week'}
      subtitle="Pick a day and decide who’s heading out."
      onClose={onClose}
    >
      <form className="shopping-form" onSubmit={submit}>
        <div className="shopping-form-body">
          <div className="field">
            <label htmlFor="schedule-list">Shopping trip</label>
            <select
              id="schedule-list"
              value={listId}
              onChange={(e) => {
                setListId(e.target.value);
                setAssigned(available.find((l) => l.id === e.target.value)?.memberId || '');
              }}
              required
            >
              {available.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                  {l.date ? ` · ${prettyDate(l.date)}` : ' · Not scheduled'}
                </option>
              ))}
            </select>
          </div>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="schedule-date">Shopping date</label>
              <input
                id="schedule-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="schedule-member">Who’s shopping?</label>
              <select
                id="schedule-member"
                value={assigned}
                onChange={(e) => setAssigned(e.target.value)}
              >
                <option value="">Unassigned</option>
                {state.members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                    {m.id === memberId ? ' (you)' : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <p className="field-hint">Leave the date blank to keep this trip unscheduled.</p>
          {error && (
            <p className="error-message" role="alert">
              {error}
            </p>
          )}
        </div>
        <div className="modal-footer">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={busy || !listId}>
            {busy ? 'Saving…' : 'Save to planner'}
            <Check size={16} />
          </button>
        </div>
      </form>
    </Modal>
  );
}

function MoveTripModal({
  list,
  onClose,
  onMove,
}: {
  list: ShoppingList;
  onClose: () => void;
  onMove: (id: string, date: string | null, expectedDate: string | null) => Promise<void>;
}) {
  const [date, setDate] = useState(list.date || today());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await onMove(list.id, date || null, list.date);
      onClose();
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title={`Move ${list.name}`} subtitle="New day, same little adventure." onClose={onClose}>
      <form className="shopping-form" onSubmit={submit}>
        <div className="shopping-form-body">
          <div className="field">
            <label htmlFor="move-trip-date">New shopping date</label>
            <input
              id="move-trip-date"
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />
          </div>
          <p className="field-hint">
            Only the date changes. Your shopper and grocery list stay together. Clear the date to
            keep it unscheduled.
          </p>
          {error && (
            <p className="error-message" role="alert">
              {error}
            </p>
          )}
        </div>
        <div className="modal-footer">
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={busy}>
            {busy ? 'Moving…' : 'Move trip'}
            <MoveRight size={16} />
          </button>
        </div>
      </form>
    </Modal>
  );
}

type TripDrag = {
  pointerId: number;
  id: string;
  name: string;
  originalDate: string | null;
  startX: number;
  startY: number;
  x: number;
  y: number;
  active: boolean;
  target: string | null | undefined;
  weekDirection: number;
  weekEnteredAt: number;
};
type DragPreview = Pick<TripDrag, 'id' | 'name' | 'x' | 'y' | 'target'>;

export default function Planner({ state, memberId, refresh, notify }: PageProps) {
  const current = today();
  const calendarScroll = useRef<HTMLDivElement>(null);
  const [start, setStart] = useState(() => monday(current));
  const [dayChoice, setDayChoice] = useState<string | null>(null);
  const [createDate, setCreateDate] = useState<string | null>(null);
  const [schedule, setSchedule] = useState<{ date: string; id?: string } | null>(null);
  const [completedTrip, setCompletedTrip] = useState<ShoppingList | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [movingTrip, setMovingTrip] = useState<ShoppingList | null>(null);
  const [drag, setDrag] = useState<DragPreview | null>(null);
  const dragSession = useRef<TripDrag | null>(null);
  const busyRef = useRef<string | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;
  const activeMember = state.members.find((member) => member.id === memberId);
  const activeName = activeMember?.name || 'You';
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const weekTrips = state.lists.filter((l) => l.date && days.includes(l.date));
  const openTrips = state.lists.filter((l) => l.status !== 'completed');
  const unscheduled = openTrips.filter((l) => !l.date);
  const yourTrips = openTrips.filter((l) => l.memberId === memberId);
  const overdue = openTrips
    .filter((l) => l.date && l.date < current)
    .sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  const upcoming = openTrips
    .filter((l) => l.date && l.date >= current)
    .sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  useEffect(() => {
    const element = calendarScroll.current;
    if (!element) return;
    const dayIndex = Array.from({ length: 7 }, (_, i) => addDays(start, i)).indexOf(current);
    if (element.scrollWidth > element.clientWidth && dayIndex >= 0) {
      const dayWidth = element.scrollWidth / 7;
      element.scrollLeft = dayIndex * dayWidth - (element.clientWidth - dayWidth) / 2;
    } else element.scrollLeft = 0;
  }, [start, current]);
  async function done(date: string | null) {
    await refresh();
    if (date) setStart(monday(date));
    notify('Your planner is up to date');
  }
  async function claim(id: string) {
    if (busyRef.current) return;
    busyRef.current = id;
    setBusy(id);
    setError('');
    try {
      await api(`/lists/${id}`, { method: 'PATCH', body: { memberId } });
      await refresh();
      notify('Trip assigned to you');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      busyRef.current = null;
      setBusy(null);
    }
  }
  async function moveTrip(id: string, date: string | null, expectedDate: string | null) {
    if (busyRef.current)
      throw new Error('Another trip is still saving. Please try again in a moment.');
    const list = stateRef.current.lists.find((entry) => entry.id === id);
    if (!list || list.status === 'completed') throw new Error('This trip can no longer be moved.');
    if (list.date !== expectedDate)
      throw new Error('This trip’s date has changed. Open it again to choose a new day.');
    if (list.date === date) return;
    busyRef.current = id;
    setBusy(id);
    setError('');
    try {
      await api(`/lists/${id}`, { method: 'PATCH', body: { date } });
      await refresh();
      if (date) setStart(monday(date));
      notify(
        date ? `${list.name} moved to ${prettyDate(date)}` : `${list.name} is now unscheduled`,
      );
    } catch (failure) {
      setError((failure as Error).message);
      throw failure;
    } finally {
      busyRef.current = null;
      setBusy(null);
    }
  }
  const moveRef = useRef(moveTrip);
  moveRef.current = moveTrip;
  function beginDrag(event: React.PointerEvent<HTMLButtonElement>, list: ShoppingList) {
    if (event.button !== 0 || busyRef.current || list.status === 'completed' || dragSession.current)
      return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragSession.current = {
      pointerId: event.pointerId,
      id: list.id,
      name: list.name,
      originalDate: list.date,
      startX: event.clientX,
      startY: event.clientY,
      x: event.clientX,
      y: event.clientY,
      active: false,
      target: undefined,
      weekDirection: 0,
      weekEnteredAt: 0,
    };
    setError('');
  }
  useEffect(() => {
    let frame = 0;
    function inspectTarget(session: TripDrag) {
      const hovered = document
        .elementFromPoint(session.x, session.y)
        ?.closest<HTMLElement>('[data-planner-drop], [data-planner-week]');
      session.target = hovered?.hasAttribute('data-planner-drop')
        ? hovered.dataset.plannerDrop || null
        : undefined;
      const direction = Number(hovered?.dataset.plannerWeek || 0);
      if (direction !== session.weekDirection) {
        session.weekDirection = direction;
        session.weekEnteredAt = performance.now();
      }
      if (direction && performance.now() - session.weekEnteredAt > 700) {
        setStart((week) => addDays(week, direction * 7));
        session.weekEnteredAt = performance.now() + 300;
      }
      setDrag({
        id: session.id,
        name: session.name,
        x: session.x,
        y: session.y,
        target: session.target,
      });
    }
    function tick() {
      const session = dragSession.current;
      if (!session?.active) {
        frame = 0;
        return;
      }
      const container = calendarScroll.current;
      if (container) {
        const box = container.getBoundingClientRect();
        if (
          session.y > box.top &&
          session.y < box.bottom &&
          session.x >= box.left &&
          session.x <= box.right
        ) {
          if (session.x < box.left + 42) container.scrollLeft -= 9;
          if (session.x > box.right - 42) container.scrollLeft += 9;
        }
      }
      // Keep a hovered week arrow still while its next week is being selected.
      if (!session.weekDirection) {
        if (session.y < 65) window.scrollBy(0, -8);
        else if (session.y > window.innerHeight - 65) window.scrollBy(0, 8);
      }
      inspectTarget(session);
      frame = requestAnimationFrame(tick);
    }
    function cancel() {
      dragSession.current = null;
      setDrag(null);
      cancelAnimationFrame(frame);
      frame = 0;
    }
    function move(event: PointerEvent) {
      const session = dragSession.current;
      if (!session || session.pointerId !== event.pointerId) return;
      session.x = event.clientX;
      session.y = event.clientY;
      if (
        !session.active &&
        Math.hypot(session.x - session.startX, session.y - session.startY) > 6
      ) {
        session.active = true;
        inspectTarget(session);
        if (!frame) frame = requestAnimationFrame(tick);
      }
      if (session.active) {
        event.preventDefault();
        inspectTarget(session);
      }
    }
    function finish(event: PointerEvent) {
      const session = dragSession.current;
      if (!session || session.pointerId !== event.pointerId) return;
      session.x = event.clientX;
      session.y = event.clientY;
      if (session.active) inspectTarget(session);
      const target = session.target;
      const shouldMove = session.active && target !== undefined;
      cancel();
      if (shouldMove)
        void moveRef
          .current(session.id, target!, session.originalDate)
          .catch((failure: Error) => setError(failure.message));
    }
    function key(event: KeyboardEvent) {
      if (event.key === 'Escape') cancel();
    }
    function lost(event: PointerEvent) {
      if (event.pointerId === dragSession.current?.pointerId) cancel();
    }
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', lost);
    window.addEventListener('keydown', key);
    window.addEventListener('blur', cancel);
    return () => {
      cancelAnimationFrame(frame);
      dragSession.current = null;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', lost);
      window.removeEventListener('keydown', key);
      window.removeEventListener('blur', cancel);
    };
  }, []);
  function openTrip(list: ShoppingList) {
    if (list.status === 'completed') setCompletedTrip(list);
    else setSchedule({ date: list.date || current, id: list.id });
  }
  function providers(list: ShoppingList) {
    const names = [
      ...new Set(
        list.items.map(
          (i) => state.providers.find((p) => p.id === i.providerId)?.name || 'Any store',
        ),
      ),
    ];
    return names.length ? names.join(' · ') : 'Stores to be decided';
  }
  return (
    <div className={`planner-page planner-playful ${drag ? 'is-dragging-trip' : ''}`}>
      <div className="page-heading planner-playful-heading">
        <div>
          <span className="page-eyebrow">
            <Sparkles size={13} /> LITTLE PLANS, HAPPY PANTRY
          </span>
          <h1>Your weekly planner</h1>
          <p>
            A little adventure for every grocery run. Make a plan, then move it when life happens.
          </p>
          <span className="planner-person-present">
            <MemberAvatar member={activeMember} size="sm" />
            <strong>{activeName} is planning</strong>
            <small>Shared household calendar</small>
          </span>
        </div>
        <button className="btn btn-primary" onClick={() => setCreateDate(current)}>
          <Plus size={18} /> Plan a shopping trip
        </button>
        <div className="planner-calendar-friend" aria-hidden="true">
          <span>🗓️</span>
          <i />
          <b>Good days ahead</b>
        </div>
      </div>
      {error && (
        <p className="error-message" role="alert">
          {error}
        </p>
      )}
      <div className="planner-summary">
        <div className="card planner-summary-card">
          <span className="planner-summary-icon sage">
            <CalendarDays size={21} />
          </span>
          <div>
            <strong>{weekTrips.filter((l) => l.status !== 'completed').length}</strong>
            <p>Trips this week</p>
          </div>
        </div>
        <div className="card planner-summary-card">
          <span className="planner-summary-icon peach">
            <UserRound size={21} />
          </span>
          <div>
            <strong>{yourTrips.length}</strong>
            <p>Assigned to {activeName}</p>
          </div>
        </div>
        <div className="card planner-summary-card">
          <span className="planner-summary-icon sand">
            <Clock3 size={21} />
          </span>
          <div>
            <strong>{unscheduled.length}</strong>
            <p>Little plans waiting</p>
          </div>
        </div>
      </div>
      <section className="card planner-calendar" aria-label="Shared shopping calendar">
        <header className="planner-calendar-toolbar">
          <div>
            <h2>{weekLabel(start)}</h2>
            <p>
              {weekTrips.length} {weekTrips.length === 1 ? 'trip' : 'trips'} planned · Europe/Berlin
            </p>
          </div>
          <div className="planner-calendar-navigation">
            <button
              className="btn btn-secondary btn-small"
              onClick={() => setStart(monday(current))}
            >
              Today
            </button>
            <div>
              <button
                className="icon-btn"
                aria-label="Previous week"
                data-planner-week="-1"
                onClick={() => setStart(addDays(start, -7))}
              >
                <ChevronLeft size={19} />
              </button>
              <button
                className="icon-btn"
                aria-label="Next week"
                data-planner-week="1"
                onClick={() => setStart(addDays(start, 7))}
              >
                <ChevronRight size={19} />
              </button>
            </div>
          </div>
        </header>
        <div
          className={`planner-drag-hint ${drag ? 'active' : ''}`}
          role="status"
          aria-live="polite"
        >
          <GripVertical size={17} />
          <span>
            {busy
              ? 'Saving your trip’s new home…'
              : drag
                ? drag.target === undefined
                  ? `Moving ${drag.name}. Drop onto a day, or hover over a week arrow.`
                  : drag.target === null
                    ? 'Release to keep this trip unscheduled.'
                    : `Release to move to ${prettyDate(drag.target)}.`
                : 'Drag a trip by its handle to change the day. Or choose Move date.'}
          </span>
        </div>
        <div className="calendar-scroll" ref={calendarScroll}>
          <div className="planner-week-grid">
            {days.map((date, index) => {
              const trips = weekTrips.filter((l) => l.date === date);
              return (
                <section
                  key={date}
                  data-planner-drop={date}
                  aria-label={`Shopping trips for ${prettyDate(date)}`}
                  className={`planner-day ${date === current ? 'is-today' : ''} ${drag?.target === date ? 'is-drop-target' : ''}`}
                >
                  <header className="planner-day-header">
                    <span>{['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'][index]}</span>
                    <strong>{Number(date.slice(-2))}</strong>
                    {date === current && <small>Today</small>}
                  </header>
                  <div className="planner-day-trips">
                    {trips.map((l) => {
                      const m = state.members.find((m) => m.id === l.memberId);
                      return (
                        <article
                          className={`calendar-trip ${l.status === 'completed' ? 'completed' : l.status === 'shopping' ? 'shopping' : ''} ${drag?.id === l.id ? 'is-trip-source' : ''}`}
                          key={l.id}
                          data-trip-id={l.id}
                          aria-busy={busy === l.id}
                        >
                          <button
                            className="calendar-trip-open"
                            onClick={() => openTrip(l)}
                            disabled={!!busy}
                            aria-label={`${l.name}, ${m?.name || 'unassigned'}, ${prettyDate(date)}${l.status === 'completed' ? ', completed' : ''}`}
                          >
                            <span className="calendar-trip-symbol" aria-hidden="true">
                              {l.status === 'completed'
                                ? '🌷'
                                : l.status === 'shopping'
                                  ? '🛍️'
                                  : '🧺'}
                            </span>
                            <strong>{l.name}</strong>
                            <span className="calendar-trip-count">
                              {l.items.length} {l.items.length === 1 ? 'item' : 'items'}
                            </span>
                            <span className="calendar-trip-assignee">
                              {m ? (
                                <MemberAvatar
                                  member={m}
                                  size="sm"
                                  className="planner-shopper-avatar"
                                />
                              ) : (
                                <span className="planner-unassigned-avatar">?</span>
                              )}
                              <span className="planner-shopper-name">
                                {m?.name || 'Unassigned'}
                                {m?.id === memberId && <small> · you</small>}
                              </span>
                            </span>
                            {l.status === 'completed' && (
                              <small className="planner-trip-status">All done ✓</small>
                            )}
                            {l.status === 'shopping' && (
                              <small className="planner-trip-status">Shopping now</small>
                            )}
                          </button>
                          {l.status !== 'completed' && (
                            <div className="calendar-trip-actions">
                              <button
                                className="planner-drag-handle"
                                disabled={!!busy}
                                aria-label={`Drag ${l.name} to another date, or press Enter to choose a date`}
                                onPointerDown={(event) => beginDrag(event, l)}
                                onClick={(event) => {
                                  if (event.detail === 0) setMovingTrip(l);
                                }}
                              >
                                <GripVertical size={17} />
                              </button>
                              <button
                                className="planner-move-date"
                                disabled={!!busy}
                                onClick={() => setMovingTrip(l)}
                                aria-label={`Move date for ${l.name}`}
                              >
                                {busy === l.id ? 'Saving…' : 'Move date'}
                              </button>
                            </div>
                          )}
                        </article>
                      );
                    })}
                  </div>
                  {drag?.target === date && (
                    <span className="planner-drop-label">Drop here ✨</span>
                  )}
                  <button
                    className="calendar-add-trip"
                    onClick={() => setDayChoice(date)}
                    aria-label={`Plan a trip for ${prettyDate(date)}`}
                  >
                    <Plus size={15} />
                    <span>Add trip</span>
                  </button>
                </section>
              );
            })}
          </div>
        </div>
        <footer className="calendar-legend">
          <span>
            <i className="legend-planned" />
            Planned
          </span>
          <span>
            <i className="legend-shopping" />
            Shopping
          </span>
          <span>
            <i className="legend-completed" />
            Completed
          </span>
          <span className="calendar-legend-tip">
            Plans can change. That’s what the handles are for.
          </span>
        </footer>
      </section>
      <div className="planner-bottom-grid">
        <section className="card planner-next-trips">
          <div className="planner-section-heading">
            <div>
              <h2>On the horizon</h2>
              <p>Your next trips, ready when you are.</p>
            </div>
            <span className="shopping-count">{upcoming.length + overdue.length}</span>
          </div>
          {[...overdue, ...upcoming].length === 0 ? (
            <div className="planner-empty">
              <span>🌤️</span>
              <p>Your calendar has room for a fresh plan.</p>
              <button
                className="btn btn-secondary btn-small"
                onClick={() => setCreateDate(current)}
              >
                Plan a trip <Plus size={15} />
              </button>
            </div>
          ) : (
            [...overdue, ...upcoming].map((l) => {
              const m = state.members.find((m) => m.id === l.memberId);
              return (
                <div key={l.id} className="planner-next-trip">
                  <span className={`planner-date-block ${l.date! < current ? 'overdue' : ''}`}>
                    <strong>{Number(l.date!.slice(-2))}</strong>
                    <small>
                      {new Date(`${l.date}T12:00:00`).toLocaleDateString('en-GB', {
                        month: 'short',
                      })}
                    </small>
                  </span>
                  <div className="planner-next-trip-description">
                    <button onClick={() => openTrip(l)}>{l.name}</button>
                    <p>{providers(l)}</p>
                    <div>
                      <span>
                        <UserRound size={12} />
                        {m?.name || 'Unassigned'}
                      </span>
                      {l.date! < current ? (
                        <span className="planner-overdue">Past planned date</span>
                      ) : l.date === current ? (
                        <span className="badge green">Today</span>
                      ) : (
                        <span>
                          {new Date(`${l.date}T12:00:00`).toLocaleDateString('en-GB', {
                            weekday: 'long',
                          })}
                        </span>
                      )}
                    </div>
                  </div>
                  {!l.memberId ? (
                    <button
                      className="btn btn-secondary btn-small"
                      disabled={!!busy}
                      onClick={() => void claim(l.id)}
                    >
                      {busy === l.id ? 'Assigning…' : 'I’ll go'}
                    </button>
                  ) : (
                    <button
                      className="btn btn-ghost btn-small"
                      disabled={!!busy}
                      aria-label={`Move date for ${l.name}`}
                      onClick={() => setMovingTrip(l)}
                    >
                      Move date <MoveRight size={15} />
                    </button>
                  )}
                </div>
              );
            })
          )}
        </section>
        <section
          className={`card planner-unscheduled ${drag?.target === null ? 'is-drop-target' : ''}`}
          data-planner-drop=""
          aria-label="Unscheduled shopping trips"
        >
          <div className="planner-section-heading">
            <div>
              <h2>Find them a day</h2>
              <p>Good plans waiting for a spot.</p>
            </div>
            <span className="shopping-count">{unscheduled.length}</span>
          </div>
          {unscheduled.length === 0 ? (
            <div className="planner-empty">
              <span>🗓️</span>
              <p>Every trip has its place.</p>
              <small>Unscheduled shopping lists will appear here.</small>
            </div>
          ) : (
            unscheduled.map((l) => (
              <div className="unscheduled-trip" key={l.id}>
                <button
                  className="planner-drag-handle unscheduled-icon"
                  disabled={!!busy}
                  aria-label={`Drag ${l.name} to a day, or press Enter to choose a date`}
                  onPointerDown={(event) => beginDrag(event, l)}
                  onClick={(event) => {
                    if (event.detail === 0) setMovingTrip(l);
                  }}
                >
                  <GripVertical size={19} />
                </button>
                <div>
                  <strong>{l.name}</strong>
                  <p>
                    {l.items.length} {l.items.length === 1 ? 'item' : 'items'} ·{' '}
                    {state.members.find((m) => m.id === l.memberId)?.name || 'Unassigned'}
                  </p>
                </div>
                <button
                  className="btn btn-ghost btn-small"
                  disabled={!!busy}
                  onClick={() => setSchedule({ date: current, id: l.id })}
                >
                  Schedule <ArrowRight size={14} />
                </button>
              </div>
            ))
          )}
        </section>
      </div>
      {drag && (
        <div
          className="planner-drag-preview"
          style={{
            left: Math.max(8, Math.min(drag.x + 15, window.innerWidth - 225)),
            top: Math.max(8, Math.min(drag.y + 18, window.innerHeight - 90)),
          }}
          aria-hidden="true"
        >
          <span>🧺</span>
          <div>
            <strong>{drag.name}</strong>
            <small>
              {drag.target === undefined
                ? 'Find a happy new day'
                : drag.target === null
                  ? 'Keep me unscheduled'
                  : prettyDate(drag.target)}
            </small>
          </div>
        </div>
      )}
      {movingTrip && (
        <MoveTripModal list={movingTrip} onClose={() => setMovingTrip(null)} onMove={moveTrip} />
      )}
      {dayChoice && (
        <Modal
          title={`Make a plan for ${prettyDate(dayChoice)}`}
          subtitle="A new list or a trip you’ve already started?"
          onClose={() => setDayChoice(null)}
        >
          <div className="planner-choice modal-body">
            <button
              onClick={() => {
                setCreateDate(dayChoice);
                setDayChoice(null);
              }}
            >
              <span>
                <Plus size={23} />
              </span>
              <div>
                <strong>Create a new trip</strong>
                <p>Start a fresh list for this day.</p>
              </div>
              <ChevronRight size={18} />
            </button>
            <button
              disabled={!openTrips.length}
              onClick={() => {
                setSchedule({ date: dayChoice });
                setDayChoice(null);
              }}
            >
              <span>
                <CalendarDays size={23} />
              </span>
              <div>
                <strong>Schedule an existing trip</strong>
                <p>
                  {openTrips.length
                    ? 'Bring one of your lists into the calendar.'
                    : 'Create a shopping list to get started.'}
                </p>
              </div>
              <ChevronRight size={18} />
            </button>
          </div>
        </Modal>
      )}
      {createDate !== null && (
        <CreateListModal
          state={state}
          memberId={memberId}
          initialDate={createDate}
          onClose={() => setCreateDate(null)}
          onCreated={async (_id, created) => {
            await refresh();
            notify('Shopping trip added to your planner');
            if (created?.date) setStart(monday(created.date));
          }}
        />
      )}
      {schedule && (
        <ScheduleModal
          state={state}
          memberId={memberId}
          initialDate={schedule.date}
          initialListId={schedule.id}
          onClose={() => setSchedule(null)}
          onDone={done}
        />
      )}{' '}
      {completedTrip && (
        <Modal
          title={completedTrip.name}
          subtitle={`Completed trip · ${prettyDate(completedTrip.date)}`}
          onClose={() => setCompletedTrip(null)}
        >
          <div className="modal-body">
            <div className="completed-notice">
              <Check size={18} />
              <p>
                This trip is complete. {completedTrip.items.filter((i) => i.checked).length} items
                were received at home.
              </p>
            </div>
            <div className="completed-trip-preview">
              {completedTrip.items.map((i) => (
                <div key={i.id}>
                  <span>
                    {i.emoji} {i.name}
                  </span>
                  <small className={i.checked ? 'received-label' : 'unbought-label'}>
                    {i.checked ? 'Checked in' : 'Not bought'}
                  </small>
                </div>
              ))}
            </div>
          </div>
          <div className="modal-footer">
            <button className="btn btn-secondary" onClick={() => setCompletedTrip(null)}>
              Close
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
