import { useMemo, useState } from 'react';
import {
  ArrowUpRight,
  Plus,
  ArrowRight,
  CalendarDays,
  ShoppingBasket,
  Package,
  Clock3,
  ListChecks,
  Check,
  Leaf,
  Users,
  ChevronRight,
  Sparkles,
} from 'lucide-react';
import type { PageProps, Page, InventoryItem } from '../types';
import { api, daysUntil, formatQuantity, prettyDate, today } from '../api';
import Modal from '../components/Modal';

interface Props extends PageProps {
  navigate: (page: Page) => void;
  onAddItem: () => void;
  onUseItem: (item: InventoryItem) => void;
  onCreateList: () => void;
}
export default function Overview({
  state,
  navigate,
  onAddItem,
  onUseItem,
  onCreateList,
  refresh,
  notify,
  memberId,
}: Props) {
  const [location, setLocation] = useState('all');
  const [selected, setSelected] = useState<string[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [listId, setListId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const activeLists = state.lists.filter((l) => l.status !== 'completed');
  const nextTrip =
    [...activeLists]
      .filter((l) => l.date && l.date >= today())
      .sort((a, b) => (a.date || '').localeCompare(b.date || ''))[0] || activeLists[0];
  const soon = useMemo(
    () =>
      state.inventory
        .filter((i) => i.quantity > 0 && i.expiresAt && (daysUntil(i.expiresAt) ?? 10) <= 3)
        .sort((a, b) => (a.expiresAt || '').localeCompare(b.expiresAt || '')),
    [state.inventory],
  );
  const visible = state.inventory
    .filter(
      (i) =>
        i.quantity > 0 &&
        (location === 'all' || i.batches.some((b) => b.locationId === location && b.quantity > 0)),
    )
    .slice(0, 6);
  const currentMember = state.members.find((m) => m.id === memberId);
  const greetingHour = Number(
    new Date().toLocaleTimeString('en-GB', {
      timeZone: 'Europe/Berlin',
      hour: '2-digit',
      hour12: false,
    }),
  );
  const greeting =
    greetingHour < 12 ? 'Good morning' : greetingHour < 18 ? 'Good afternoon' : 'Good evening';
  const addSuggestions = async () => {
    if (!listId) {
      setError('Choose a shopping list first.');
      return;
    }
    const pending = selected.filter((id) => state.suggestions.some((s) => s.productId === id));
    if (!pending.length) {
      setSelected([]);
      setShowAdd(false);
      return;
    }
    setBusy(true);
    setError('');
    let added = 0;
    try {
      for (const id of pending) {
        const suggestion = state.suggestions.find((s) => s.productId === id)!;
        await api(`/lists/${listId}/items`, {
          method: 'POST',
          body: {
            productId: id,
            quantity: suggestion.quantity,
            unit: suggestion.unit,
            providerId: suggestion.preferredProviderId,
          },
        });
        added += 1;
        setSelected((ids) => ids.filter((value) => value !== id));
      }
      await refresh();
      notify(`${added} ${added === 1 ? 'item' : 'items'} added to your shopping list`);
      setShowAdd(false);
    } catch (e) {
      setError((e as Error).message);
      if (added)
        notify(
          `${added} ${added === 1 ? 'item was' : 'items were'} added. The remaining items are still selected.`,
        );
      try {
        await refresh();
      } catch {
        /* Keep the selected items available for retry. */
      }
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="overview-page page-enter">
      <div className="page-heading">
        <div>
          <div className="eyebrow date-eyebrow">
            {new Date().toLocaleDateString('en-GB', {
              timeZone: 'Europe/Berlin',
              weekday: 'long',
              day: 'numeric',
              month: 'long',
            })}
          </div>
          <h1>
            {greeting}
            {currentMember && currentMember.name !== 'You' ? `, ${currentMember.name}` : ''}
            <span className="greeting-dot">.</span>
          </h1>
          <p>A well-stocked home, without the guesswork.</p>
        </div>
        <button className="btn btn-primary" onClick={onAddItem}>
          <Plus size={18} /> Check in groceries
        </button>
      </div>
      {state.household.demo && (
        <div className="demo-note">
          <Sparkles size={14} />
          <span>A little inspiration to get started. You’re exploring a sample household.</span>
          <button onClick={() => navigate('settings')}>
            Make it yours <ArrowRight size={13} />
          </button>
        </div>
      )}
      <div className="overview-hero-grid">
        <section className="kitchen-hero">
          <div className="hero-content">
            <span className="hero-kicker">
              <span className="little-dot" /> YOUR KITCHEN, IN SYNC
            </span>
            <h2>
              Good food.
              <br />
              Less waste.
              <br />
              <span>More home.</span>
            </h2>
            <p>
              Keep track of the little things.
              <br />
              Make more room for everyday life.
            </p>
            <button className="hero-link" onClick={() => navigate('inventory')}>
              Take a look inside <ArrowRight size={17} />
            </button>
          </div>
          <img
            className="grocery-illustration"
            src="/grocery-bag.svg"
            alt="A paper grocery bag filled with fresh vegetables, bread and milk"
          />
          <span className="hero-decoration decor-one" />
          <span className="hero-decoration decor-two" />
        </section>
        <section className="card next-shop-card">
          <div className="card-topline">
            <div className="icon-tile peach">
              <ShoppingBasket size={20} />
            </div>
            <span className="eyebrow">UP NEXT</span>
            <span className="badge neutral">{nextTrip ? 'Shopping trip' : 'A fresh start'}</span>
          </div>
          <h3>{nextTrip?.name || 'Make a little plan'}</h3>
          <p className="next-shop-desc">
            {nextTrip
              ? 'A thoughtful restock for the week ahead.'
              : 'Your next grocery run starts with a good list.'}
          </p>
          {nextTrip ? (
            <>
              <div className="next-shop-date">
                <CalendarDays size={16} />
                {nextTrip.date
                  ? `${new Date(nextTrip.date + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'long' })}, ${prettyDate(nextTrip.date)}`
                  : 'Whenever you’re ready'}
              </div>
              <div className="next-shop-stores">
                {[...new Set(nextTrip.items.map((i) => i.providerId).filter(Boolean))]
                  .slice(0, 3)
                  .map((id, index) => {
                    const p = state.providers.find((p) => p.id === id);
                    return p ? (
                      <span
                        key={id}
                        className="store-avatar"
                        style={{ background: p.color, marginLeft: index ? -7 : 0 }}
                        title={p.name}
                      >
                        {p.name.slice(0, 1)}
                      </span>
                    ) : null;
                  })}
                <span>
                  {nextTrip.items.length} {nextTrip.items.length === 1 ? 'item' : 'items'} on your
                  list
                </span>
              </div>
              <div className="trip-progress">
                <span
                  style={{
                    width: `${nextTrip.items.length ? (nextTrip.items.filter((i) => i.checked).length / nextTrip.items.length) * 100 : 0}%`,
                  }}
                />
              </div>
              <div className="next-shop-footer">
                <span>
                  <span className="avatar-mini">
                    {state.members.find((m) => m.id === nextTrip.memberId)?.name.slice(0, 1) || '?'}
                  </span>
                  {state.members.find((m) => m.id === nextTrip.memberId)?.name || 'Unassigned'}
                </span>
                <button className="text-link" onClick={() => navigate('shopping')}>
                  Open list <ArrowUpRight size={15} />
                </button>
              </div>
            </>
          ) : (
            <button className="btn btn-secondary" onClick={onCreateList}>
              <Plus size={16} /> Create your first list
            </button>
          )}
        </section>
      </div>
      <div className="stat-grid">
        {[
          {
            icon: Package,
            value: state.inventory.filter((i) => i.quantity > 0).length,
            label: 'Items at home',
            sub: 'A little bit of everything',
            color: 'green',
            click: () => navigate('inventory'),
          },
          {
            icon: Clock3,
            value: soon.length,
            label: 'Use soon',
            sub: soon.length ? 'Good food worth saving' : 'Everything is looking fresh',
            color: 'amber',
            click: () => navigate('inventory'),
          },
          {
            icon: ShoppingBasket,
            value: state.suggestions.length,
            label: 'Running low',
            sub: 'Time for a small restock',
            color: 'peach',
            click: () => navigate('shopping'),
          },
          {
            icon: ListChecks,
            value: activeLists.length,
            label: 'Shopping lists',
            sub: 'Your plans, all in one place',
            color: 'blue',
            click: () => navigate('shopping'),
          },
        ].map((s) => (
          <button key={s.label} className="card stat-card" onClick={s.click}>
            <span className={`icon-tile ${s.color}`}>
              <s.icon size={20} />
            </span>
            <div>
              <span className="stat-value">
                {s.value}
                <ArrowUpRight size={15} />
              </span>
              <span className="stat-label">{s.label}</span>
              <span className="stat-sub">{s.sub}</span>
            </div>
          </button>
        ))}
      </div>
      <div className="kitchen-content-grid">
        <section className="inside-section">
          <div className="section-heading">
            <div>
              <h2>
                Inside your kitchen{' '}
                <span className="count-pill">
                  {state.inventory.filter((i) => i.quantity > 0).length}
                </span>
              </h2>
              <p>The everyday essentials you have at home.</p>
            </div>
            <button className="text-link" onClick={() => navigate('inventory')}>
              View all <ArrowUpRight size={15} />
            </button>
          </div>
          <div className="location-tabs">
            <button
              className={location === 'all' ? 'active' : ''}
              onClick={() => setLocation('all')}
            >
              All locations
            </button>
            {state.locations.slice(0, 3).map((l) => (
              <button
                key={l.id}
                className={location === l.id ? 'active' : ''}
                onClick={() => setLocation(l.id)}
              >
                {l.name}
              </button>
            ))}
          </div>
          <div className="home-item-grid">
            {visible.map((item) => {
              const cat = state.categories.find((c) => c.id === item.categoryId);
              const scopedBatches = item.batches.filter(
                (b) => b.quantity > 0 && (location === 'all' || b.locationId === location),
              );
              const scopedQuantity = scopedBatches.reduce((sum, b) => sum + b.quantity, 0);
              const scopedExpiry =
                scopedBatches
                  .map((b) => b.expiresAt)
                  .filter((date): date is string => !!date)
                  .sort()[0] || null;
              const exp = daysUntil(scopedExpiry);
              return (
                <article className="home-item-card" key={item.id}>
                  <div
                    className="home-item-image"
                    style={{
                      background: `color-mix(in srgb, ${cat?.color || '#869878'} 12%, #fafaf5)`,
                    }}
                  >
                    <span>{item.emoji}</span>
                    {exp !== null && exp <= 3 ? (
                      <span className={`item-sticker ${exp < 0 ? 'expired' : ''}`}>
                        <Clock3 size={10} />
                        {exp < 0
                          ? 'Past date'
                          : exp === 0
                            ? 'Use today'
                            : exp === 1
                              ? 'Use tomorrow'
                              : `Use in ${exp} days`}
                      </span>
                    ) : item.status === 'low' ? (
                      <span className="item-sticker low">Running low</span>
                    ) : (
                      <span className="fresh-dot" title="In stock" />
                    )}
                  </div>
                  <div className="home-item-info">
                    <h3>{item.name}</h3>
                    <p>
                      {formatQuantity(scopedQuantity)} {item.unit}
                      <span>·</span>
                      {state.locations.find((l) => l.id === scopedBatches[0]?.locationId)?.name ||
                        'At home'}
                    </p>
                    <button
                      className="use-item-button"
                      aria-label={`Use ${item.name}`}
                      onClick={() => onUseItem(item)}
                    >
                      <Plus size={15} />
                    </button>
                  </div>
                </article>
              );
            })}
            {visible.length === 0 && (
              <div className="empty-state kitchen-empty">
                <Package size={32} />
                <h3>A little room for something good</h3>
                <p>Check in groceries to see them here.</p>
                <button className="btn btn-primary btn-small" onClick={onAddItem}>
                  <Plus size={15} />
                  Add an item
                </button>
              </div>
            )}
          </div>
        </section>
        <section className="card restock-card">
          <div className="section-heading">
            <div>
              <div className="eyebrow">SMART LITTLE SUGGESTIONS</div>
              <h2>A little low?</h2>
            </div>
            <span className="icon-tile peach">
              <ShoppingBasket size={19} />
            </span>
          </div>
          <p className="restock-intro">
            A few things you might want to pick up. You choose what makes the list.
          </p>
          <div className="suggestion-list">
            {state.suggestions.slice(0, 5).map((s) => (
              <label className="suggestion-row" key={s.productId}>
                <input
                  type="checkbox"
                  checked={selected.includes(s.productId)}
                  onChange={() =>
                    setSelected((ids) =>
                      ids.includes(s.productId)
                        ? ids.filter((id) => id !== s.productId)
                        : [...ids, s.productId],
                    )
                  }
                />
                <span className="suggestion-emoji">{s.emoji}</span>
                <span className="suggestion-copy">
                  <strong>{s.name}</strong>
                  <small>
                    {s.reason === 'out'
                      ? 'None left at home'
                      : `${formatQuantity(s.currentQuantity)} ${s.unit} left`}
                  </small>
                </span>
                <span className="suggested-qty">
                  +{formatQuantity(s.quantity)} {s.unit}
                </span>
              </label>
            ))}
            {state.suggestions.length === 0 && (
              <div className="restock-empty">
                <Check size={25} />
                <strong>Nicely stocked.</strong>
                <p>No restocks needed right now.</p>
              </div>
            )}
          </div>
          {state.suggestions.length > 0 && (
            <button
              className="btn btn-secondary add-suggestions-btn"
              disabled={!selected.length}
              onClick={() => {
                setListId(activeLists[0]?.id || '');
                setError('');
                setShowAdd(true);
              }}
            >
              <Plus size={16} />
              {selected.length ? `Add ${selected.length} to shopping list` : 'Select items to add'}
            </button>
          )}
          <div className="restock-note">
            <Leaf size={13} />
            <span>Based on your household’s minimum stock.</span>
          </div>
        </section>
      </div>
      <div className="overview-bottom-grid">
        <section className="card use-soon-card">
          <div className="section-heading">
            <div>
              <h2>
                <span className="small-emoji">🌿</span> Use it, don’t lose it
              </h2>
              <p>A small nudge to enjoy what’s already here.</p>
            </div>
            <span className="badge amber">{soon.length} to keep an eye on</span>
          </div>
          {soon.length > 0 ? (
            <div className="soon-items">
              {soon.slice(0, 3).map((i) => (
                <button key={i.id} className="soon-item" onClick={() => onUseItem(i)}>
                  <span className="soon-emoji">{i.emoji}</span>
                  <span>
                    <strong>{i.name}</strong>
                    <small>
                      {formatQuantity(i.quantity)} {i.unit} · {prettyDate(i.expiresAt)}
                    </small>
                  </span>
                  <ChevronRight size={15} />
                </button>
              ))}
            </div>
          ) : (
            <div className="soon-empty">
              <Check size={17} /> Nothing is nearing its date. A fresher kind of peace of mind.
            </div>
          )}
        </section>
        <section className="together-card">
          <span className="icon-tile green">
            <Users size={20} />
          </span>
          <h3>Better, together.</h3>
          <p>
            A shared list. A stocked kitchen.
            <br />
            One less thing to think about.
          </p>
          <button className="text-link" onClick={() => navigate('settings')}>
            Your household <ArrowRight size={15} />
          </button>
        </section>
      </div>
      {showAdd && (
        <Modal
          title="A little restock"
          subtitle="Add your selected suggestions to a shopping list."
          onClose={() => setShowAdd(false)}
        >
          <div className="modal-body">
            <div className="selected-summary">
              {selected.length} {selected.length === 1 ? 'item' : 'items'} selected
            </div>
            {activeLists.length ? (
              <label className="field">
                Shopping list
                <select value={listId} onChange={(e) => setListId(e.target.value)}>
                  {activeLists.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <div className="empty-state">
                <p>Create a shopping list, then add these suggestions.</p>
                <button
                  className="btn btn-primary"
                  onClick={() => {
                    setShowAdd(false);
                    onCreateList();
                  }}
                >
                  Create a list
                </button>
              </div>
            )}
            {error && (
              <p className="error-message" role="alert">
                {error}
              </p>
            )}
          </div>
          <div className="modal-footer">
            <button className="btn btn-secondary" onClick={() => setShowAdd(false)}>
              Cancel
            </button>
            <button
              className="btn btn-primary"
              disabled={busy || !activeLists.length}
              onClick={addSuggestions}
            >
              {busy ? 'Adding…' : 'Add to list'}
              <ArrowRight size={16} />
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
