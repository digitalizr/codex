import { useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Plus,
  ShoppingBasket,
  UserRound,
} from 'lucide-react';
import { api, prettyDate, today } from '../api';
import Modal from '../components/Modal';
import type { HouseholdState, PageProps, ShoppingList } from '../types';
import { CreateListModal } from './Shopping';
import '../shopping.css';

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
    setBusy(id);
    setError('');
    try {
      await api(`/lists/${id}`, { method: 'PATCH', body: { memberId } });
      await refresh();
      notify('Trip assigned to you');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }
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
    <div className="planner-page">
      <div className="page-heading">
        <div>
          <span className="page-eyebrow">GOOD FOOD STARTS WITH A SIMPLE PLAN</span>
          <h1>Your weekly planner</h1>
          <p>A shared rhythm for a well-stocked home.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setCreateDate(current)}>
          <Plus size={18} /> Plan a shopping trip
        </button>
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
            <p>Assigned to you</p>
          </div>
        </div>
        <div className="card planner-summary-card">
          <span className="planner-summary-icon sand">
            <Clock3 size={21} />
          </span>
          <div>
            <strong>{unscheduled.length}</strong>
            <p>Waiting for a date</p>
          </div>
        </div>
      </div>
      <section className="card planner-calendar">
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
                onClick={() => setStart(addDays(start, -7))}
              >
                <ChevronLeft size={19} />
              </button>
              <button
                className="icon-btn"
                aria-label="Next week"
                onClick={() => setStart(addDays(start, 7))}
              >
                <ChevronRight size={19} />
              </button>
            </div>
          </div>
        </header>
        <div className="calendar-scroll" ref={calendarScroll}>
          <div className="planner-week-grid">
            {days.map((date, index) => {
              const trips = weekTrips.filter((l) => l.date === date);
              return (
                <section key={date} className={`planner-day ${date === current ? 'is-today' : ''}`}>
                  <header className="planner-day-header">
                    <span>{['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'][index]}</span>
                    <strong>{Number(date.slice(-2))}</strong>
                    {date === current && <small>Today</small>}
                  </header>
                  <div className="planner-day-trips">
                    {trips.map((l) => {
                      const m = state.members.find((m) => m.id === l.memberId);
                      return (
                        <button
                          className={`calendar-trip ${l.status === 'completed' ? 'completed' : l.status === 'shopping' ? 'shopping' : ''}`}
                          key={l.id}
                          onClick={() => openTrip(l)}
                        >
                          <span className="calendar-trip-symbol">
                            {l.status === 'completed' ? (
                              <Check size={14} />
                            ) : (
                              <ShoppingBasket size={14} />
                            )}
                          </span>
                          <strong>{l.name}</strong>
                          <span className="calendar-trip-count">
                            {l.items.length} {l.items.length === 1 ? 'item' : 'items'}
                          </span>
                          <span className="calendar-trip-assignee">
                            <span style={{ background: m?.color || '#aaa' }} />
                            {m?.name || 'Unassigned'}
                          </span>
                          {l.status === 'completed' && <small>Completed</small>}
                          {l.status === 'shopping' && <small>Shopping now</small>}
                        </button>
                      );
                    })}
                  </div>
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
          <span className="calendar-legend-tip">Choose a day to plan your next shop.</span>
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
                      className="icon-btn"
                      aria-label={`Edit schedule for ${l.name}`}
                      onClick={() => openTrip(l)}
                    >
                      <ChevronRight size={18} />
                    </button>
                  )}
                </div>
              );
            })
          )}
        </section>
        <section className="card planner-unscheduled">
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
                <span className="unscheduled-icon">
                  <ShoppingBasket size={19} />
                </span>
                <div>
                  <strong>{l.name}</strong>
                  <p>
                    {l.items.length} {l.items.length === 1 ? 'item' : 'items'} ·{' '}
                    {state.members.find((m) => m.id === l.memberId)?.name || 'Unassigned'}
                  </p>
                </div>
                <button
                  className="btn btn-ghost btn-small"
                  onClick={() => setSchedule({ date: current, id: l.id })}
                >
                  Schedule <ArrowRight size={14} />
                </button>
              </div>
            ))
          )}
        </section>
      </div>
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
