import { useState } from 'react';
import {
  ArrowRight,
  CalendarDays,
  Check,
  CheckCheck,
  ChevronRight,
  CircleCheck,
  ListPlus,
  Pencil,
  Plus,
  ShoppingBasket,
  Sparkles,
  Store,
  UsersRound,
  Trash2,
  UserRound,
  X,
} from 'lucide-react';
import { api, formatQuantity, prettyDate } from '../api';
import Modal from '../components/Modal';
import MemberAvatar from '../components/MemberAvatar';
import type {
  HouseholdState,
  PageProps,
  ShoppingItem,
  ShoppingList,
  Suggestion,
  Member,
} from '../types';
import '../shopping.css';
import '../shopping-playful.css';

type ShopperScope = 'all' | 'mine' | 'unassigned' | `member:${string}`;
const shoppingPalettes = ['leaf', 'peach', 'butter', 'berry', 'sky', 'coffee'];
function shoppingPalette(value: string) {
  return shoppingPalettes[
    [...value].reduce((sum, letter) => sum + letter.charCodeAt(0), 0) % shoppingPalettes.length
  ];
}
function ShopperAvatar({ member }: { member?: Member }) {
  return member ? (
    <MemberAvatar member={member} size="sm" className="shopping-shopper-portrait" />
  ) : (
    <span className="shopping-shopper-avatar unassigned" aria-hidden="true">
      <UserRound size={17} />
    </span>
  );
}
function BasketBuddy() {
  return (
    <div className="shopping-basket-buddy" aria-hidden="true">
      <svg viewBox="0 0 260 185" fill="none">
        <ellipse cx="131" cy="163" rx="87" ry="12" fill="#d5b16a" fillOpacity=".28" />
        <path
          d="M66 111c-26-14-31 8-13 20M201 112c25-11 30 11 11 20"
          stroke="#ad8550"
          strokeWidth="8"
          strokeLinecap="round"
        />
        <path
          d="M97 148l-8 17M168 148l8 17"
          stroke="#986e43"
          strokeWidth="8"
          strokeLinecap="round"
        />
        <path
          d="M77 81C77 45 179 43 184 80"
          stroke="#a47a4d"
          strokeWidth="11"
          strokeLinecap="round"
        />
        <path d="M94 86c-16-25-8-41 5-34 7-28 27-14 14 12 16-16 29-6 10 20" fill="#95b466" />
        <path d="M119 96l11-56c2-11 17-9 17 3l-1 53" fill="#f4a268" />
        <path
          d="M136 41c-7-21 2-27 8-12 5-19 16-15 8 3"
          stroke="#82a35c"
          strokeWidth="5"
          strokeLinecap="round"
        />
        <path d="M157 80c-2-19 3-35 18-35s23 12 24 35" fill="#f8df9d" />
        <path d="M169 52l8 10M182 51l8 10" stroke="#d9b877" strokeWidth="3" strokeLinecap="round" />
        <path
          d="M56 87h151l-14 58c-2 10-12 17-25 17H93c-13 0-23-7-25-17L56 87Z"
          fill="#edc580"
          stroke="#c99b5c"
          strokeWidth="3"
        />
        <path
          d="M52 87c0-6 4-10 10-10h140c6 0 10 4 10 10s-4 10-10 10H62c-6 0-10-4-10-10Z"
          fill="#f6d89e"
          stroke="#c99b5c"
          strokeWidth="3"
        />
        <path
          d="M80 103l8 44M98 103l5 47M165 103l-5 47M183 103l-8 44"
          stroke="#dcb374"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <circle cx="113" cy="120" r="4" fill="#654a32" />
        <circle cx="149" cy="120" r="4" fill="#654a32" />
        <path d="M122 128c5 7 13 7 18 0" stroke="#654a32" strokeWidth="3.5" strokeLinecap="round" />
        <ellipse cx="102" cy="130" rx="9" ry="5" fill="#e9a478" />
        <ellipse cx="159" cy="130" rx="9" ry="5" fill="#e9a478" />
        <path
          d="M35 44v12M29 50h12M223 60v10M218 65h10"
          stroke="#c4a46b"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <circle cx="221" cy="140" r="3" fill="#bdad83" />
        <path d="m41 139 4 4 4-4" stroke="#afac7b" strokeWidth="2" strokeLinecap="round" />
      </svg>
      <span>good things, coming home.</span>
    </div>
  );
}

interface CreateListProps {
  state: HouseholdState;
  memberId: string;
  onClose: () => void;
  onCreated: (id: string, list?: ShoppingList) => Promise<void> | void;
  initialDate?: string;
}
export function CreateListModal({
  state,
  memberId,
  onClose,
  onCreated,
  initialDate = '',
}: CreateListProps) {
  const [name, setName] = useState('');
  const [date, setDate] = useState(initialDate);
  const [assigned, setAssigned] = useState(memberId);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const list = await api<ShoppingList>('/lists', {
        method: 'POST',
        body: { name: name.trim(), date: date || null, memberId: assigned || null, notes },
      });
      await onCreated(list.id, list);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title="Plan a shopping trip"
      subtitle="One list, every store, everyone on the same page."
      onClose={onClose}
    >
      <form className="shopping-form" onSubmit={submit}>
        <div className="shopping-form-body">
          <div className="field">
            <label htmlFor="new-trip-name">Trip name</label>
            <input
              id="new-trip-name"
              placeholder="e.g. The weekly shop"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={100}
            />
          </div>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="new-trip-date">
                Shopping date <span className="field-optional">optional</span>
              </label>
              <input
                id="new-trip-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="new-trip-member">Who’s shopping?</label>
              <select
                id="new-trip-member"
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
          <div className="field">
            <label htmlFor="new-trip-notes">
              A little note <span className="field-optional">optional</span>
            </label>
            <textarea
              id="new-trip-notes"
              rows={2}
              placeholder="Anything to remember for this trip…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={1000}
            />
          </div>
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
          <button className="btn btn-primary" disabled={busy || !name.trim()}>
            {busy ? 'Creating…' : 'Create trip'}
            <ArrowRight size={16} />
          </button>
        </div>
      </form>
    </Modal>
  );
}

function AddItemModal({
  state,
  list,
  onClose,
  onDone,
}: {
  state: HouseholdState;
  list: ShoppingList;
  onClose: () => void;
  onDone: () => Promise<void>;
}) {
  const [mode, setMode] = useState<'catalogue' | 'custom'>('catalogue');
  const [productId, setProductId] = useState('');
  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [unit, setUnit] = useState('pcs');
  const [providerId, setProviderId] = useState('');
  const [emoji, setEmoji] = useState('🛒');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const product = state.inventory.find((p) => p.id === productId);
  function choose(id: string) {
    const p = state.inventory.find((p) => p.id === id);
    setProductId(id);
    if (p) {
      setUnit(p.unit);
      setProviderId(p.preferredProviderId || '');
    }
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api(`/lists/${list.id}/items`, {
        method: 'POST',
        body: {
          ...(mode === 'catalogue' ? { productId } : {}),
          name: mode === 'catalogue' ? product?.name : name.trim(),
          emoji: mode === 'catalogue' ? product?.emoji : emoji,
          quantity: Number(quantity),
          unit,
          providerId: providerId || null,
        },
      });
      await onDone();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title="Add to your shopping list" subtitle={list.name} onClose={onClose}>
      <form className="shopping-form" onSubmit={submit}>
        <div className="shopping-form-body">
          <div className="shopping-segmented" aria-label="Choose item source">
            <button
              type="button"
              className={mode === 'catalogue' ? 'active' : ''}
              onClick={() => setMode('catalogue')}
            >
              Your items
            </button>
            <button
              type="button"
              className={mode === 'custom' ? 'active' : ''}
              onClick={() => setMode('custom')}
            >
              Something new
            </button>
          </div>
          {mode === 'catalogue' ? (
            <div className="field">
              <label htmlFor="add-product">Grocery item</label>
              <select
                id="add-product"
                required
                value={productId}
                onChange={(e) => choose(e.target.value)}
              >
                <option value="">Choose from your catalogue</option>
                {[...state.inventory]
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.emoji} {p.name}
                    </option>
                  ))}
              </select>
              {state.inventory.length === 0 && (
                <p className="field-hint">Your catalogue is empty. Add something new below.</p>
              )}
            </div>
          ) : (
            <div className="custom-item-name">
              <div className="field">
                <label htmlFor="add-emoji">Emoji</label>
                <input
                  id="add-emoji"
                  value={emoji}
                  maxLength={8}
                  onChange={(e) => setEmoji(e.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="add-name">Item name</label>
                <input
                  id="add-name"
                  placeholder="e.g. Dish soap"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  maxLength={100}
                />
              </div>
            </div>
          )}
          <div className="form-grid">
            <div className="field">
              <label htmlFor="add-quantity">Quantity</label>
              <input
                id="add-quantity"
                type="number"
                min="0.01"
                step="any"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="add-unit">Unit</label>
              <input
                id="add-unit"
                value={unit}
                placeholder="pcs, kg, L…"
                onChange={(e) => setUnit(e.target.value)}
                required
                maxLength={30}
              />
            </div>
          </div>
          <div className="field">
            <label htmlFor="add-provider">Buy from</label>
            <select
              id="add-provider"
              value={providerId}
              onChange={(e) => setProviderId(e.target.value)}
            >
              <option value="">Any store</option>
              {state.providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
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
          <button
            className="btn btn-primary"
            disabled={busy || (mode === 'catalogue' ? !productId : !name.trim())}
          >
            {busy ? 'Adding…' : 'Add item'}
            <Plus size={16} />
          </button>
        </div>
      </form>
    </Modal>
  );
}

function EditItemModal({
  state,
  item,
  onClose,
  onDone,
}: {
  state: HouseholdState;
  item: ShoppingItem;
  onClose: () => void;
  onDone: () => Promise<void>;
}) {
  const [quantity, setQuantity] = useState(String(item.quantity));
  const [providerId, setProviderId] = useState(item.providerId || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api(`/items/${item.id}`, {
        method: 'PATCH',
        body: { quantity: Number(quantity), providerId: providerId || null },
      });
      await onDone();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title={`Edit ${item.name}`} onClose={onClose}>
      <form className="shopping-form" onSubmit={submit}>
        <div className="shopping-form-body">
          <div className="field">
            <label htmlFor="edit-item-quantity">Quantity ({item.unit})</label>
            <input
              id="edit-item-quantity"
              type="number"
              min="0.01"
              step="any"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="edit-item-provider">Buy from</label>
            <select
              id="edit-item-provider"
              value={providerId}
              onChange={(e) => setProviderId(e.target.value)}
            >
              <option value="">Any store</option>
              {state.providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
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
          <button className="btn btn-primary" disabled={busy}>
            {busy ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function EditTripModal({
  state,
  list,
  memberId,
  onClose,
  onDone,
}: {
  state: HouseholdState;
  list: ShoppingList;
  memberId: string;
  onClose: () => void;
  onDone: () => Promise<void>;
}) {
  const [name, setName] = useState(list.name);
  const [date, setDate] = useState(list.date || '');
  const [assigned, setAssigned] = useState(list.memberId || '');
  const [notes, setNotes] = useState(list.notes);
  const [status, setStatus] = useState(list.status);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api(`/lists/${list.id}`, {
        method: 'PATCH',
        body: { name: name.trim(), date: date || null, memberId: assigned || null, notes, status },
      });
      await onDone();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title="Trip details" onClose={onClose}>
      <form className="shopping-form" onSubmit={submit}>
        <div className="shopping-form-body">
          <div className="field">
            <label htmlFor="edit-trip-name">Trip name</label>
            <input
              id="edit-trip-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={100}
            />
          </div>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="edit-trip-date">Shopping date</label>
              <input
                id="edit-trip-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="edit-trip-member">Who’s shopping?</label>
              <select
                id="edit-trip-member"
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
          <div className="field">
            <label htmlFor="edit-trip-status">Trip status</label>
            <select
              id="edit-trip-status"
              value={status}
              onChange={(e) => setStatus(e.target.value as 'planned' | 'shopping')}
            >
              <option value="planned">Planned</option>
              <option value="shopping">Shopping now</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="edit-trip-notes">Notes</label>
            <textarea
              id="edit-trip-notes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={1000}
            />
          </div>
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
          <button className="btn btn-primary" disabled={busy || !name.trim()}>
            {busy ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ReceiveModal({
  state,
  list,
  onClose,
  onDone,
}: {
  state: HouseholdState;
  list: ShoppingList;
  onClose: () => void;
  onDone: () => Promise<void>;
}) {
  const [locationId, setLocationId] = useState(state.locations[0]?.id || '');
  const [expiresAt, setExpiresAt] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const checked = list.items.filter((i) => i.checked);
  const unbought = list.items.length - checked.length;
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api(`/lists/${list.id}/complete`, {
        method: 'POST',
        body: { locationId, expiresAt: expiresAt || null },
      });
      await onDone();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title="Welcome home, groceries"
      subtitle="Check in what you bought and finish this trip."
      onClose={onClose}
    >
      <form className="shopping-form" onSubmit={submit}>
        <div className="shopping-form-body">
          <div className="receive-summary">
            <span className="receive-icon">
              <ShoppingBasket size={26} />
            </span>
            <div>
              <strong>
                {checked.length} {checked.length === 1 ? 'item' : 'items'} ready to check in
              </strong>
              <p>Checked items will be added to your home inventory.</p>
            </div>
          </div>
          <div className="receive-items">
            {checked.map((i) => (
              <span key={i.id}>
                {i.emoji} {i.name} <small>× {formatQuantity(i.quantity)}</small>
              </span>
            ))}
          </div>
          <div className="field">
            <label htmlFor="receive-location">Store these groceries in</label>
            <select
              id="receive-location"
              value={locationId}
              onChange={(e) => setLocationId(e.target.value)}
              required
            >
              <option value="" disabled>
                Choose a location
              </option>
              {state.locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.emoji} {l.name}
                </option>
              ))}
            </select>
            <p className="field-hint">
              You can move individual items between locations in Inventory.
            </p>
          </div>
          <div className="field">
            <label htmlFor="receive-expiry">
              Best-before date <span className="field-optional">optional</span>
            </label>
            <input
              id="receive-expiry"
              type="date"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
            />
            <p className="field-hint">
              Applies to all received items. Update individual dates in Inventory.
            </p>
          </div>
          {unbought > 0 && (
            <p className="receive-unbought">
              {unbought} unchecked {unbought === 1 ? 'item stays' : 'items stay'} on this completed
              trip as not bought.
            </p>
          )}
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
          <button className="btn btn-primary" disabled={busy || !locationId || !checked.length}>
            {busy ? 'Checking in…' : 'Check in & complete'}
            <CheckCheck size={17} />
          </button>
        </div>
      </form>
    </Modal>
  );
}

function SuggestionsModal({
  state,
  suggestions,
  memberId,
  initialListId,
  onClose,
  onDone,
}: {
  state: HouseholdState;
  suggestions: Suggestion[];
  memberId: string;
  initialListId?: string;
  onClose: () => void;
  onDone: (id: string) => Promise<void>;
}) {
  const lists = state.lists.filter((l) => l.status !== 'completed');
  const [target, setTarget] = useState(initialListId || lists[0]?.id || 'new');
  const [createdList, setCreatedList] = useState<ShoppingList | null>(null);
  const [remaining, setRemaining] = useState(suggestions);
  const [name, setName] = useState('Restock the essentials');
  const [date, setDate] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      let id = target;
      if (target === 'new') {
        const created = await api<ShoppingList>('/lists', {
          method: 'POST',
          body: { name: name.trim(), date: date || null, memberId: memberId || null },
        });
        id = created.id;
        setTarget(id);
        setCreatedList(created);
      }
      for (const s of remaining) {
        await api(`/lists/${id}/items`, {
          method: 'POST',
          body: {
            productId: s.productId,
            name: s.name,
            emoji: s.emoji,
            quantity: s.quantity,
            unit: s.unit,
            providerId: s.preferredProviderId,
          },
        });
        setRemaining((items) => items.filter((item) => item.productId !== s.productId));
      }
      await onDone(id);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title="Turn suggestions into a plan"
      subtitle={`${suggestions.length} ${suggestions.length === 1 ? 'essential' : 'essentials'} selected. You choose the shopping trip.`}
      onClose={onClose}
    >
      <form className="shopping-form" onSubmit={submit}>
        <div className="shopping-form-body">
          <div className="receive-items">
            {suggestions.map((s) => (
              <span key={s.productId}>
                {s.emoji} {s.name}{' '}
                <small>
                  {formatQuantity(s.quantity)} {s.unit}
                </small>
              </span>
            ))}
          </div>
          <div className="field">
            <label htmlFor="suggestion-list">Add to shopping trip</label>
            <select id="suggestion-list" value={target} onChange={(e) => setTarget(e.target.value)}>
              {lists.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                  {l.date ? ` · ${prettyDate(l.date)}` : ''}
                </option>
              ))}
              {createdList && !lists.some((l) => l.id === createdList.id) && (
                <option value={createdList.id}>{createdList.name}</option>
              )}
              <option value="new">＋ Create a new trip</option>
            </select>
          </div>
          {remaining.length < suggestions.length && (
            <p className="field-hint">
              {suggestions.length - remaining.length} items added. {remaining.length} remaining.
            </p>
          )}
          {target === 'new' && (
            <>
              <div className="field">
                <label htmlFor="suggestion-name">Trip name</label>
                <input
                  id="suggestion-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  maxLength={100}
                />
              </div>
              <div className="field">
                <label htmlFor="suggestion-date">
                  Shopping date <span className="field-optional">optional</span>
                </label>
                <input
                  id="suggestion-date"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </div>
            </>
          )}
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
          <button className="btn btn-primary" disabled={busy || (target === 'new' && !name.trim())}>
            {busy ? 'Adding…' : 'Add to list'}
            <ArrowRight size={16} />
          </button>
        </div>
      </form>
    </Modal>
  );
}

export default function Shopping({ state, refresh, notify, memberId }: PageProps) {
  const [mode, setMode] = useState<'active' | 'completed'>('active');
  const [shopperScope, setShopperScope] = useState<ShopperScope>('all');
  const [selectedId, setSelectedId] = useState('');
  const [selectedSuggestions, setSelectedSuggestions] = useState<Set<string>>(new Set());
  const [suggestionBatch, setSuggestionBatch] = useState<Suggestion[] | null>(null);
  const [dialog, setDialog] = useState<'create' | 'add' | 'edit' | 'receive' | 'delete' | null>(
    null,
  );
  const [editItem, setEditItem] = useState<ShoppingItem | null>(null);
  const [removeItem, setRemoveItem] = useState<ShoppingItem | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [checkedOverrides, setCheckedOverrides] = useState<Record<string, boolean>>({});
  const [error, setError] = useState('');
  const isChecked = (item: ShoppingItem) => checkedOverrides[item.id] ?? item.checked;
  const viewer = state.members.find((member) => member.id === memberId);
  const shopperPalette = (id: string | null | undefined) => {
    const index = state.members.findIndex((member) => member.id === id);
    return index < 0 ? 'coffee' : ['leaf', 'berry', 'sky', 'peach', 'butter', 'coffee'][index % 6];
  };
  const selectedShopper = shopperScope.startsWith('member:')
    ? state.members.find((member) => member.id === shopperScope.slice(7))
    : undefined;
  const scope = shopperScope.startsWith('member:') && !selectedShopper ? 'all' : shopperScope;
  const matchesShopper = (trip: ShoppingList) =>
    scope === 'all' ||
    (scope === 'mine'
      ? trip.memberId === memberId
      : scope === 'unassigned'
        ? !trip.memberId
        : trip.memberId === selectedShopper?.id);
  const scopedTrips = state.lists.filter(matchesShopper);
  const scopeName =
    scope === 'all'
      ? 'All household'
      : scope === 'unassigned'
        ? 'Unassigned'
        : `${scope === 'mine' ? viewer?.name || 'Your profile' : selectedShopper?.name}’s trips`;
  const lists = scopedTrips
    .filter((l) => (mode === 'completed' ? l.status === 'completed' : l.status !== 'completed'))
    .sort(
      (a, b) =>
        (a.date || '9999').localeCompare(b.date || '9999') ||
        b.createdAt.localeCompare(a.createdAt),
    );
  const list = lists.find((l) => l.id === selectedId) || lists[0];
  const completed = list?.status === 'completed';
  const checked = list?.items.filter(isChecked).length || 0;
  const total = list?.items.length || 0;
  const assignee = state.members.find((m) => m.id === list?.memberId);
  const providerGroups = list
    ? [...new Set(list.items.map((i) => i.providerId))].map((id) => ({
        provider: state.providers.find((p) => p.id === id),
        id,
        items: list.items.filter((i) => i.providerId === id),
      }))
    : [];
  async function run(key: string, action: () => Promise<unknown>, message?: string) {
    setBusy(key);
    setError('');
    try {
      await action();
      await refresh();
      if (message) notify(message);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }
  async function toggleItem(item: ShoppingItem) {
    const value = !isChecked(item);
    setCheckedOverrides((previous) => ({ ...previous, [item.id]: value }));
    await run(item.id, () =>
      api(`/items/${item.id}`, { method: 'PATCH', body: { checked: value } }),
    );
    setCheckedOverrides((previous) => {
      const next = { ...previous };
      delete next[item.id];
      return next;
    });
  }
  async function selectedCreated(id: string) {
    await refresh();
    setSelectedId(id);
    setShopperScope('all');
    setMode('active');
    notify('Shopping trip created');
  }
  async function suggestionsAdded(id: string) {
    await refresh();
    setSelectedId(id);
    setShopperScope('all');
    setMode('active');
    setSelectedSuggestions(new Set());
    notify('Essentials added to your shopping list');
  }
  function toggleSuggestion(id: string) {
    setSelectedSuggestions((previous) => {
      const next = new Set(previous);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }
  function quickAdd(s: Suggestion) {
    if (list && !completed) {
      void run(
        s.productId,
        () =>
          api(`/lists/${list.id}/items`, {
            method: 'POST',
            body: {
              productId: s.productId,
              name: s.name,
              emoji: s.emoji,
              quantity: s.quantity,
              unit: s.unit,
              providerId: s.preferredProviderId,
            },
          }),
        `${s.name} added to ${list.name}`,
      );
    } else setSuggestionBatch([s]);
  }
  const pending = scopedTrips.filter((l) => l.status !== 'completed');
  return (
    <div className="shopping-page">
      <div className="page-heading shopping-playful-heading">
        <div>
          <span className="page-eyebrow">
            <Sparkles size={15} /> OUR NEXT LITTLE FOOD ADVENTURE
          </span>
          <h1>
            Shopping lists
            <span className="shopping-heading-heart" aria-hidden="true">
              ♡
            </span>
          </h1>
          <p>Little lists. Lovely meals. Let’s bring the good stuff home.</p>
          <span className="shopping-heading-note">
            <UsersRound size={15} /> One shared pantry, a little teamwork.
          </span>
        </div>
        <button className="btn btn-primary" onClick={() => setDialog('create')}>
          <Plus size={18} /> New shopping trip
        </button>
        <BasketBuddy />
      </div>
      <section className="shopping-scope-panel" aria-label="Whose shopping trips are displayed">
        <div className="shopping-scope-heading">
          <div>
            <h2>Whose little shopping adventure?</h2>
            <p>Choose a shopper, or see everyone’s plans together.</p>
          </div>
          <div className="shopping-viewer-identity">
            <ShopperAvatar member={viewer} />
            <span>
              Viewing as<strong>{viewer?.name || 'Your profile'}</strong>
            </span>
          </div>
        </div>
        <div
          className="shopping-scope-controls"
          role="group"
          aria-label="Filter shopping trips by shopper"
        >
          <button
            className={scope === 'all' ? 'selected' : ''}
            aria-pressed={scope === 'all'}
            onClick={() => setShopperScope('all')}
          >
            <UsersRound size={17} />
            All household
          </button>
          <button
            className={scope === 'mine' ? 'selected' : ''}
            aria-label="Mine"
            aria-pressed={scope === 'mine'}
            onClick={() => setShopperScope('mine')}
          >
            <UserRound size={17} />
            Mine<span>{viewer?.name}</span>
          </button>
          <button
            className={scope === 'unassigned' ? 'selected' : ''}
            aria-pressed={scope === 'unassigned'}
            onClick={() => setShopperScope('unassigned')}
          >
            <ShoppingBasket size={17} />
            Unassigned
          </button>
          <label
            className={`shopping-shopper-select ${scope.startsWith('member:') ? 'selected' : ''}`}
          >
            <UserRound size={17} />
            <select
              aria-label="Filter trips by shopper"
              value={scope.startsWith('member:') ? scope.slice(7) : ''}
              onChange={(event) =>
                setShopperScope(event.target.value ? `member:${event.target.value}` : 'all')
              }
            >
              <option value="">Choose a shopper</option>
              {state.members.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="shopping-scope-summary" role="status">
          <span className="shopping-scope-dot" />
          Showing{' '}
          <strong>
            {scope === 'all'
              ? 'all household trips'
              : scope === 'unassigned'
                ? 'unassigned trips'
                : scopeName}
          </strong>
          <span className="shopping-scope-result-count">
            {lists.length} {mode === 'completed' ? 'completed' : 'upcoming'}{' '}
            {lists.length === 1 ? 'trip' : 'trips'}
          </span>
        </p>
      </section>
      {error && (
        <p className="error-message" role="alert">
          {error}
          <button className="icon-btn" aria-label="Dismiss error" onClick={() => setError('')}>
            <X size={16} />
          </button>
        </p>
      )}
      <div className="shopping-layout">
        <aside className="card trip-sidebar">
          <div className="trip-sidebar-heading">
            <h2>{scope === 'all' ? 'Household trips' : scopeName}</h2>
            <span className="shopping-count">{lists.length}</span>
          </div>
          <div className="shopping-segmented">
            <button
              className={mode === 'active' ? 'active' : ''}
              aria-pressed={mode === 'active'}
              onClick={() => setMode('active')}
            >
              Upcoming <span>{pending.length}</span>
            </button>
            <button
              className={mode === 'completed' ? 'active' : ''}
              aria-pressed={mode === 'completed'}
              onClick={() => setMode('completed')}
            >
              Completed
            </button>
          </div>
          <div className="trip-options">
            {lists.length === 0 ? (
              <div className="trip-sidebar-empty">
                <ShoppingBasket size={28} />
                <p>
                  {mode === 'completed'
                    ? 'No completed trips in this view yet.'
                    : scope !== 'all'
                      ? 'No upcoming trips for this shopper yet.'
                      : 'A happy pantry starts with a little list.'}
                </p>
                {mode === 'active' && (
                  <button
                    className="btn btn-secondary btn-small"
                    onClick={() => setDialog('create')}
                  >
                    Plan your first trip
                  </button>
                )}
              </div>
            ) : (
              lists.map((l) => {
                const count = l.items.filter((i) => i.checked).length;
                const shopper = state.members.find((member) => member.id === l.memberId);
                return (
                  <button
                    className={`trip-option shopping-palette-${shopperPalette(l.memberId)} ${list?.id === l.id ? 'selected' : ''}`}
                    aria-pressed={list?.id === l.id}
                    key={l.id}
                    onClick={() => setSelectedId(l.id)}
                  >
                    <span className="trip-option-top">
                      <span className="trip-option-icon">
                        {l.status === 'completed' ? (
                          <CircleCheck size={18} />
                        ) : (
                          <ShoppingBasket size={18} />
                        )}
                      </span>
                      <strong>{l.name}</strong>
                      {list?.id === l.id && <ChevronRight size={15} />}
                    </span>
                    <span className="trip-option-meta">
                      <CalendarDays size={12} />
                      {prettyDate(l.date)}
                      <span>·</span>
                      {l.items.length} items
                    </span>
                    <span className="trip-option-shopper">
                      <ShopperAvatar member={shopper} />
                      <span>
                        <small>Trip shopper</small>
                        <strong>{shopper?.name || 'Unassigned'}</strong>
                      </span>
                    </span>
                    {l.status === 'shopping' && (
                      <span className="badge amber trip-option-status">Shopping now</span>
                    )}
                    <span className="trip-mini-progress">
                      <span
                        style={{ width: `${l.items.length ? (count / l.items.length) * 100 : 0}%` }}
                      />
                    </span>
                  </button>
                );
              })
            )}
          </div>
          <div className="sidebar-tip">
            <Sparkles size={17} />
            <p>Keep one trip per shopping day. Split your items by store inside.</p>
          </div>
        </aside>
        <section
          className={`card shopping-detail shopping-palette-${shopperPalette(list?.memberId)}`}
        >
          {list ? (
            <>
              <header className="shopping-list-header">
                <div>
                  <span
                    className={`badge ${completed ? 'green' : list.status === 'shopping' ? 'amber' : 'neutral'}`}
                  >
                    {completed
                      ? 'Completed'
                      : list.status === 'shopping'
                        ? 'Shopping now'
                        : 'Planned trip'}
                  </span>
                  <h2>{list.name}</h2>
                  <div className="list-meta">
                    <span>
                      <CalendarDays size={14} />
                      {prettyDate(list.date)}
                    </span>
                    <span>
                      {total} {total === 1 ? 'little essential' : 'little essentials'}
                    </span>
                  </div>
                </div>
                <div className="list-header-actions">
                  {!completed && (
                    <button
                      className="icon-btn"
                      aria-label="Edit trip details"
                      title="Edit trip details"
                      onClick={() => setDialog('edit')}
                    >
                      <Pencil size={17} />
                    </button>
                  )}
                  <button
                    className="icon-btn"
                    aria-label="Delete trip"
                    title="Delete trip"
                    onClick={() => {
                      setError('');
                      setDialog('delete');
                    }}
                  >
                    <Trash2 size={17} />
                  </button>
                </div>
              </header>
              <div className="shopping-trip-shopper" aria-label="Trip shopper">
                <ShopperAvatar member={assignee} />
                <div>
                  <span>Trip shopper</span>
                  <strong>{assignee?.name || 'Unassigned'}</strong>
                </div>
                <p>
                  {assignee
                    ? assignee.id === memberId
                      ? 'This trip is yours. Happy shopping!'
                      : `On ${assignee.name}’s list. Shared with your household.`
                    : 'A little adventure waiting for a volunteer.'}
                </p>
              </div>
              {list.notes && <p className="shopping-trip-note">{list.notes}</p>}
              {!completed && !list.memberId && (
                <div className="trip-claim">
                  <span>This trip is waiting for a shopper.</span>
                  <button
                    className="btn btn-ghost btn-small"
                    disabled={!!busy}
                    onClick={() =>
                      void run(
                        'assign',
                        async () => {
                          await api(`/lists/${list.id}`, { method: 'PATCH', body: { memberId } });
                          setShopperScope('mine');
                          setSelectedId(list.id);
                        },
                        `Trip assigned to ${viewer?.name || 'you'}`,
                      )
                    }
                  >
                    I’ll take this trip <ArrowRight size={14} />
                  </button>
                </div>
              )}
              <div className="shopping-progress">
                <div>
                  <span>
                    {completed ? 'Safely home in the pantry' : 'A little closer to a full basket'}
                  </span>
                  <strong>
                    {checked}
                    <span> / {total} items</span>
                  </strong>
                </div>
                <div className="shopping-progress-track">
                  <span style={{ width: `${total ? (checked / total) * 100 : 0}%` }} />
                </div>
              </div>
              {completed && (
                <div className="completed-notice">
                  <CheckCheck size={18} />
                  <p>
                    {checked} checked {checked === 1 ? 'item was' : 'items were'} added to
                    inventory. Unchecked items were not bought.
                  </p>
                </div>
              )}
              <div className="shopping-groups">
                {providerGroups.map((group) => (
                  <section
                    className={`shopping-provider shopping-palette-${shoppingPalette(group.id || 'any')}`}
                    key={group.id || 'any'}
                  >
                    <header>
                      <span className="store-symbol">
                        <Store size={17} />
                      </span>
                      <h3>{group.provider?.name || 'Any store'}</h3>
                      <span>
                        {group.items.length} {group.items.length === 1 ? 'item' : 'items'}
                      </span>
                    </header>
                    {group.items.map((item) => (
                      <div
                        className={`shopping-item ${isChecked(item) ? 'is-checked' : ''}`}
                        key={item.id}
                      >
                        <label className="shopping-checkbox">
                          <input
                            type="checkbox"
                            checked={isChecked(item)}
                            disabled={completed || !!busy}
                            onChange={() => void toggleItem(item)}
                            aria-label={`${isChecked(item) ? 'Uncheck' : 'Mark bought'} ${item.name}`}
                          />
                          <span>
                            <Check size={14} />
                          </span>
                        </label>
                        <span className="shopping-item-emoji">{item.emoji}</span>
                        <div className="shopping-item-description">
                          <strong>{item.name}</strong>
                          {completed && (
                            <small className={item.checked ? 'received-label' : 'unbought-label'}>
                              {item.checked ? 'Checked in' : 'Not bought'}
                            </small>
                          )}
                        </div>
                        <span className="shopping-item-quantity">
                          {formatQuantity(item.quantity)} <small>{item.unit}</small>
                        </span>
                        {!completed && (
                          <div className="shopping-item-actions">
                            <button
                              className="icon-btn"
                              aria-label={`Edit ${item.name}`}
                              onClick={() => setEditItem(item)}
                            >
                              <Pencil size={14} />
                            </button>
                            <button
                              className="icon-btn"
                              aria-label={`Remove ${item.name}`}
                              onClick={() => {
                                setError('');
                                setRemoveItem(item);
                              }}
                            >
                              <X size={16} />
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </section>
                ))}
                {total === 0 && (
                  <div className="shopping-empty-list">
                    <span>🧺</span>
                    <h3>A fresh start for your next shop</h3>
                    <p>Add your favourites or pick a few restock suggestions below.</p>
                  </div>
                )}
              </div>
              {!completed && (
                <footer className="shopping-list-footer">
                  <button className="btn btn-secondary" onClick={() => setDialog('add')}>
                    <Plus size={16} /> Add an item
                  </button>
                  <button
                    className="btn btn-primary"
                    onClick={() => setDialog('receive')}
                    disabled={!!busy || !checked || state.locations.length === 0}
                  >
                    <CheckCheck size={17} /> Check in groceries{' '}
                    <span className="button-count">{checked}</span>
                  </button>
                </footer>
              )}
              {!completed && state.locations.length === 0 && (
                <p className="field-hint shopping-location-hint">
                  Add a storage location in Settings before checking in groceries.
                </p>
              )}
            </>
          ) : (
            <div className="empty-state shopping-no-trip">
              <ShoppingBasket size={44} />
              <h2>
                {mode === 'completed' ? 'Good shops, remembered.' : 'Make room for a good shop.'}
              </h2>
              <p>
                {mode === 'completed'
                  ? 'No completed trips for this view. The lovely things you bring home will appear here.'
                  : scope !== 'all'
                    ? 'No upcoming trips for this shopper. Try the household view or plan a new little adventure.'
                    : 'Create a trip, add what you need, and check things off as you go.'}
              </p>
              {scope !== 'all' && (
                <button className="btn btn-secondary" onClick={() => setShopperScope('all')}>
                  <UsersRound size={17} /> See all household trips
                </button>
              )}
              {mode === 'active' && (
                <button className="btn btn-primary" onClick={() => setDialog('create')}>
                  <Plus size={17} /> Create shopping trip
                </button>
              )}
            </div>
          )}
        </section>
      </div>
      <section className="card shopping-suggestions">
        <div className="suggestions-heading">
          <div>
            <div className="suggestion-eyebrow">
              <Sparkles size={16} /> A LITTLE HELP FROM YOUR PANTRY
            </div>
            <h2>A little pantry wish list</h2>
            <p>Shared essentials that could use a top-up. Pick what comes home next.</p>
          </div>
          {state.suggestions.length > 0 && (
            <button
              className="btn btn-primary btn-small"
              disabled={!selectedSuggestions.size}
              onClick={() =>
                setSuggestionBatch(
                  state.suggestions.filter((s) => selectedSuggestions.has(s.productId)),
                )
              }
            >
              <ListPlus size={16} /> Add selected{' '}
              {selectedSuggestions.size > 0 && (
                <span className="button-count">{selectedSuggestions.size}</span>
              )}
            </button>
          )}
        </div>
        {state.suggestions.length > 0 && list && !completed && (
          <p className="shopping-suggestion-target">
            <ShoppingBasket size={15} />
            <span>
              Quick add goes to <strong>{list.name}</strong>
              <small>Trip shopper: {assignee?.name || 'Unassigned'}</small>
            </span>
          </p>
        )}
        {state.suggestions.length > 0 ? (
          <div className="suggestion-grid">
            {state.suggestions.map((s) => (
              <div
                className={`suggestion-tile shopping-palette-${shoppingPalette(s.categoryId)} ${selectedSuggestions.has(s.productId) ? 'selected' : ''}`}
                key={s.productId}
              >
                <label className="shopping-checkbox">
                  <input
                    type="checkbox"
                    checked={selectedSuggestions.has(s.productId)}
                    onChange={() => toggleSuggestion(s.productId)}
                    aria-label={`Select ${s.name} suggestion`}
                  />
                  <span>
                    <Check size={14} />
                  </span>
                </label>
                <span className="suggestion-emoji">{s.emoji}</span>
                <div className="suggestion-info">
                  <strong>{s.name}</strong>
                  <span
                    className={
                      s.reason === 'out' ? 'suggestion-reason-out' : 'suggestion-reason-low'
                    }
                  >
                    {s.reason === 'out'
                      ? 'Out of stock'
                      : `${formatQuantity(s.currentQuantity)} ${s.unit} left`}
                  </span>
                  <small>
                    Add {formatQuantity(s.quantity)} {s.unit}
                  </small>
                </div>
                <button
                  className="suggestion-add"
                  aria-label={`Add ${s.name} to shopping list`}
                  title={list && !completed ? `Add to ${list.name}` : 'Add to a shopping trip'}
                  disabled={!!busy}
                  onClick={() => quickAdd(s)}
                >
                  <Plus size={18} />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="suggestions-all-stocked">
            <span>🌿</span>
            <div>
              <strong>Your essentials are in good shape.</strong>
              <p>Low-stock items will show up here when it’s time to replenish.</p>
            </div>
          </div>
        )}
      </section>
      {dialog === 'create' && (
        <CreateListModal
          state={state}
          memberId={memberId}
          onClose={() => setDialog(null)}
          onCreated={selectedCreated}
        />
      )}{' '}
      {dialog === 'add' && list && (
        <AddItemModal state={state} list={list} onClose={() => setDialog(null)} onDone={refresh} />
      )}{' '}
      {dialog === 'edit' && list && (
        <EditTripModal
          state={state}
          list={list}
          memberId={memberId}
          onClose={() => setDialog(null)}
          onDone={refresh}
        />
      )}{' '}
      {dialog === 'receive' && list && (
        <ReceiveModal
          state={state}
          list={list}
          onClose={() => setDialog(null)}
          onDone={async () => {
            await refresh();
            setMode('completed');
            setSelectedId(list.id);
            notify('Groceries checked in. Your pantry is up to date.');
          }}
        />
      )}
      {editItem && (
        <EditItemModal
          state={state}
          item={editItem}
          onClose={() => setEditItem(null)}
          onDone={refresh}
        />
      )}{' '}
      {suggestionBatch && (
        <SuggestionsModal
          state={state}
          suggestions={suggestionBatch}
          memberId={memberId}
          initialListId={list && !completed ? list.id : undefined}
          onClose={() => setSuggestionBatch(null)}
          onDone={suggestionsAdded}
        />
      )}{' '}
      {dialog === 'delete' && list && (
        <Modal title="Delete this shopping trip?" onClose={() => setDialog(null)}>
          <div className="modal-body">
            <p className="confirmation-copy">
              “{list.name}” and its shopping list will be deleted.
              {completed ? ' Groceries already checked into inventory will stay there.' : ''}
            </p>
            {error && (
              <p className="error-message" role="alert">
                {error}
              </p>
            )}
          </div>
          <div className="modal-footer">
            <button className="btn btn-secondary" onClick={() => setDialog(null)}>
              Keep trip
            </button>
            <button
              className="btn btn-danger"
              disabled={!!busy}
              onClick={() =>
                void run(
                  'delete-list',
                  async () => {
                    await api(`/lists/${list.id}`, { method: 'DELETE' });
                    setDialog(null);
                  },
                  'Shopping trip deleted',
                )
              }
            >
              {busy ? 'Deleting…' : 'Delete trip'}
            </button>
          </div>
        </Modal>
      )}
      {removeItem && (
        <Modal title="Remove this item?" onClose={() => setRemoveItem(null)}>
          <div className="modal-body">
            <p className="confirmation-copy">Remove {removeItem.name} from this shopping trip?</p>
            {error && (
              <p className="error-message" role="alert">
                {error}
              </p>
            )}
          </div>
          <div className="modal-footer">
            <button className="btn btn-secondary" onClick={() => setRemoveItem(null)}>
              Keep item
            </button>
            <button
              className="btn btn-danger"
              disabled={!!busy}
              onClick={() =>
                void run(
                  'delete-item',
                  async () => {
                    await api(`/items/${removeItem.id}`, { method: 'DELETE' });
                    setRemoveItem(null);
                  },
                  'Item removed',
                )
              }
            >
              {busy ? 'Removing…' : 'Remove item'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
