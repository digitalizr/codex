import { useCallback, useState } from 'react';
import type { FormEvent } from 'react';
import {
  ArrowDownLeft,
  ArrowUpRight,
  CalendarDays,
  Check,
  MapPin,
  Package,
  Pencil,
  Trash2,
} from 'lucide-react';
import Modal from './Modal';
import { api, daysUntil, formatQuantity, prettyDate } from '../api';
import type { HouseholdState, InventoryItem } from '../types';
import '../inventory.css';

type SharedProps = {
  state: HouseholdState;
  onClose: () => void;
  onSaved: () => Promise<void>;
  notify: (message: string, kind?: 'success' | 'error') => void;
};

const productEmojis = ['🥛', '🥚', '🍞', '🍎', '🥑', '🥦', '🍝', '🍚', '🧀', '🍗', '☕', '🫙'];

export function AddItemModal({ state, onClose, onSaved, notify }: SharedProps) {
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('🛒');
  const [categoryId, setCategoryId] = useState(state.categories[0]?.id ?? '');
  const [unit, setUnit] = useState('pcs');
  const [minQuantity, setMinQuantity] = useState('1');
  const [providerId, setProviderId] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [locationId, setLocationId] = useState(state.locations[0]?.id ?? '');
  const [expiresAt, setExpiresAt] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const close = useCallback(() => {
    if (!busy) onClose();
  }, [busy, onClose]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const initialQuantity = Number(quantity);
    if (initialQuantity > 0 && !locationId) {
      setError('Choose a storage location for your item.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await api('/products', {
        method: 'POST',
        body: {
          name: name.trim(),
          emoji: emoji.trim() || '🛒',
          categoryId,
          unit: unit.trim(),
          minQuantity: Number(minQuantity),
          preferredProviderId: providerId || null,
          initialQuantity,
          locationId: locationId || null,
          expiresAt: expiresAt || null,
        },
      });
      await onSaved();
      notify(`${name.trim()} added to your household.`);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add this item.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title="Add an item"
      subtitle="A place for everything you bring home."
      onClose={close}
      wide
    >
      <form onSubmit={submit} className="inventory-dialog-form">
        <div className="modal-body">
          <div className="product-form-intro">
            <div className="product-form-preview" aria-hidden="true">
              {emoji || '🛒'}
            </div>
            <div className="field product-name-field">
              <label htmlFor="new-product-name">Item name</label>
              <input
                id="new-product-name"
                placeholder="e.g. Oat milk"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={100}
                required
              />
            </div>
          </div>
          <fieldset className="emoji-picker">
            <legend>Choose an icon</legend>
            <div>
              {productEmojis.map((icon) => (
                <button
                  key={icon}
                  type="button"
                  aria-label={`Choose ${icon} icon`}
                  aria-pressed={emoji === icon}
                  className={emoji === icon ? 'selected' : ''}
                  onClick={() => setEmoji(icon)}
                >
                  {icon}
                </button>
              ))}
              <input
                aria-label="Custom item emoji"
                placeholder="✏️"
                value={productEmojis.includes(emoji) ? '' : emoji}
                onChange={(e) => setEmoji(e.target.value)}
                maxLength={8}
                title="Or enter your own emoji"
              />
            </div>
          </fieldset>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="new-product-category">Category</label>
              <select
                id="new-product-category"
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                required
              >
                {!state.categories.length && (
                  <option value="">Add a category in Settings first</option>
                )}
                {state.categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.emoji} {category.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="new-product-unit">Unit</label>
              <input
                id="new-product-unit"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                list="inventory-units"
                required
                maxLength={20}
              />
              <datalist id="inventory-units">
                {['pcs', 'packs', 'kg', 'g', 'l', 'ml', 'cans', 'bottles', 'portions'].map(
                  (value) => (
                    <option key={value} value={value} />
                  ),
                )}
              </datalist>
            </div>
            <div className="field">
              <label htmlFor="new-product-min">Keep at least</label>
              <input
                id="new-product-min"
                type="number"
                min="0"
                max="100000"
                step="any"
                value={minQuantity}
                onChange={(e) => setMinQuantity(e.target.value)}
                required
              />
              <small>We suggest a refill when stock falls below this.</small>
            </div>
            <div className="field">
              <label htmlFor="new-product-provider">
                Preferred store <span>(optional)</span>
              </label>
              <select
                id="new-product-provider"
                value={providerId}
                onChange={(e) => setProviderId(e.target.value)}
              >
                <option value="">No preference</option>
                {state.providers.map((provider) => (
                  <option key={provider.id} value={provider.id}>
                    {provider.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="inventory-form-divider">
            <Package size={16} />
            <span>What's at home right now</span>
          </div>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="new-product-quantity">
                Starting quantity <span>({unit || 'pcs'})</span>
              </label>
              <input
                id="new-product-quantity"
                type="number"
                min="0"
                max="100000"
                step="any"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                required
              />
              <small>Set to 0 to track an item you need to buy.</small>
            </div>
            <div className="field">
              <label htmlFor="new-product-location">Storage location</label>
              <select
                id="new-product-location"
                value={locationId}
                onChange={(e) => setLocationId(e.target.value)}
                required={Number(quantity) > 0}
              >
                {!state.locations.length && (
                  <option value="">Add a location in Settings first</option>
                )}
                {state.locations.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.emoji} {location.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="new-product-expiry">
                Best before <span>(optional)</span>
              </label>
              <input
                id="new-product-expiry"
                type="date"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
              />
            </div>
          </div>
          {error && (
            <p role="alert" className="error-message">
              {error}
            </p>
          )}
        </div>
        <footer className="modal-footer">
          <button type="button" className="btn btn-secondary" onClick={close} disabled={busy}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            disabled={
              busy || !state.categories.length || (Number(quantity) > 0 && !state.locations.length)
            }
          >
            <Check size={17} />
            {busy ? 'Adding…' : 'Add to inventory'}
          </button>
        </footer>
      </form>
    </Modal>
  );
}

export function StockActionModal({
  item,
  state,
  kind,
  onClose,
  onSaved,
  notify,
}: SharedProps & { item: InventoryItem; kind: 'add' | 'consume' | 'discard' | 'edit' }) {
  const [quantity, setQuantity] = useState(String(kind === 'add' ? 1 : Math.min(1, item.quantity)));
  const [locationId, setLocationId] = useState(
    kind === 'add'
      ? item.batches.find((batch) => batch.quantity > 0)?.locationId || state.locations[0]?.id || ''
      : '',
  );
  const [expiresAt, setExpiresAt] = useState('');
  const [name, setName] = useState(item.name);
  const [emoji, setEmoji] = useState(item.emoji);
  const [categoryId, setCategoryId] = useState(item.categoryId);
  const [unit, setUnit] = useState(item.unit);
  const [minQuantity, setMinQuantity] = useState(String(item.minQuantity));
  const [providerId, setProviderId] = useState(item.preferredProviderId ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [batchDraft, setBatchDraft] = useState<{
    id: string;
    quantity: string;
    locationId: string;
    expiresAt: string;
  } | null>(null);
  const [batchBusy, setBatchBusy] = useState(false);
  const [batchError, setBatchError] = useState('');
  const close = useCallback(() => {
    if (!busy && !batchBusy) onClose();
  }, [busy, batchBusy, onClose]);
  const currentItem = state.inventory.find((entry) => entry.id === item.id) ?? item;
  const removing = kind === 'consume' || kind === 'discard';
  const available =
    locationId && removing
      ? currentItem.batches
          .filter((batch) => batch.locationId === locationId)
          .reduce((sum, batch) => sum + batch.quantity, 0)
      : currentItem.quantity;
  const stockedLocations = state.locations.filter((location) =>
    currentItem.batches.some((batch) => batch.locationId === location.id && batch.quantity > 0),
  );
  const titles = {
    add: 'Add stock',
    consume: 'Use an item',
    discard: 'Mark as gone',
    edit: 'Edit item',
  };

  async function saveBatch() {
    if (!batchDraft || batchBusy || busy) return;
    const amount = Number(batchDraft.quantity);
    if (!batchDraft.quantity.trim() || !Number.isFinite(amount) || amount < 0 || amount > 1000000) {
      setBatchError('Enter a quantity from 0 to 1,000,000.');
      return;
    }
    if (!batchDraft.locationId) {
      setBatchError('Choose a storage location.');
      return;
    }
    setBatchBusy(true);
    setBatchError('');
    try {
      await api(`/batches/${batchDraft.id}`, {
        method: 'PATCH',
        body: {
          quantity: amount,
          locationId: batchDraft.locationId,
          expiresAt: batchDraft.expiresAt || null,
        },
      });
      await onSaved();
      setBatchDraft(null);
      notify(`${item.name} stock details updated.`);
    } catch (err) {
      setBatchError(err instanceof Error ? err.message : 'Could not update these stock details.');
    } finally {
      setBatchBusy(false);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || batchBusy || batchDraft) return;
    if (removing && Number(quantity) > available) {
      setError(`Only ${formatQuantity(available)} ${item.unit} are available in this location.`);
      return;
    }
    setBusy(true);
    setError('');
    try {
      if (kind === 'edit')
        await api(`/products/${item.id}`, {
          method: 'PATCH',
          body: {
            name: name.trim(),
            emoji: emoji.trim() || '🛒',
            categoryId,
            unit: unit.trim(),
            minQuantity: Number(minQuantity),
            preferredProviderId: providerId || null,
          },
        });
      else if (kind === 'add')
        await api('/stock', {
          method: 'POST',
          body: {
            productId: item.id,
            quantity: Number(quantity),
            locationId,
            expiresAt: expiresAt || null,
          },
        });
      else
        await api('/stock/consume', {
          method: 'POST',
          body: {
            productId: item.id,
            quantity: Number(quantity),
            kind: kind === 'consume' ? 'consumed' : 'discarded',
            ...(locationId ? { locationId } : {}),
          },
        });
      await onSaved();
      notify(
        kind === 'edit'
          ? `${name.trim()} updated.`
          : kind === 'add'
            ? `${item.name} restocked.`
            : kind === 'consume'
              ? `Use of ${item.name} recorded.`
              : `${item.name} marked as gone.`,
      );
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update this item.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title={titles[kind]}
      subtitle={
        kind === 'discard'
          ? 'Keep your stock accurate when something is spoiled or gone.'
          : kind === 'edit'
            ? 'Make this item work for your household.'
            : kind === 'add'
              ? 'Fresh groceries, neatly accounted for.'
              : 'A quick update keeps everyone in the loop.'
      }
      onClose={close}
    >
      <form onSubmit={submit} className="inventory-dialog-form">
        <div className="modal-body">
          <div className="stock-item-summary">
            <span className="stock-item-emoji" aria-hidden="true">
              {item.emoji}
            </span>
            <div>
              <strong>{item.name}</strong>
              <span>
                {formatQuantity(currentItem.quantity)} {item.unit} at home
              </span>
            </div>
          </div>
          {kind === 'edit' ? (
            <>
              <div className="form-grid">
                <div className="field">
                  <label htmlFor="edit-product-name">Item name</label>
                  <input
                    id="edit-product-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    maxLength={100}
                    required
                  />
                </div>
                <div className="field">
                  <label htmlFor="edit-product-emoji">Icon</label>
                  <input
                    id="edit-product-emoji"
                    value={emoji}
                    onChange={(e) => setEmoji(e.target.value)}
                    maxLength={8}
                  />
                </div>
                <div className="field">
                  <label htmlFor="edit-product-category">Category</label>
                  <select
                    id="edit-product-category"
                    value={categoryId}
                    onChange={(e) => setCategoryId(e.target.value)}
                    required
                  >
                    {state.categories.map((category) => (
                      <option value={category.id} key={category.id}>
                        {category.emoji} {category.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="edit-product-unit">Unit</label>
                  <input
                    id="edit-product-unit"
                    value={unit}
                    onChange={(e) => setUnit(e.target.value)}
                    required
                    maxLength={20}
                  />
                </div>
                <div className="field">
                  <label htmlFor="edit-product-min">Keep at least</label>
                  <input
                    id="edit-product-min"
                    type="number"
                    min="0"
                    max="100000"
                    step="any"
                    value={minQuantity}
                    onChange={(e) => setMinQuantity(e.target.value)}
                    required
                  />
                </div>
                <div className="field">
                  <label htmlFor="edit-product-provider">Preferred store</label>
                  <select
                    id="edit-product-provider"
                    value={providerId}
                    onChange={(e) => setProviderId(e.target.value)}
                  >
                    <option value="">No preference</option>
                    {state.providers.map((provider) => (
                      <option value={provider.id} key={provider.id}>
                        {provider.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <p className="inventory-form-hint">
                Edit stock below to move it, set a best-before date or correct a count. Use “Use”
                and “Mark as gone” for consumption and waste. Each correction is saved in your
                activity history.
              </p>
            </>
          ) : (
            <>
              <div className="form-grid">
                <div className="field">
                  <label htmlFor="stock-action-quantity">
                    {kind === 'add'
                      ? 'Quantity to add'
                      : kind === 'consume'
                        ? 'Quantity used'
                        : 'Quantity gone'}{' '}
                    <span>({item.unit})</span>
                  </label>
                  <input
                    id="stock-action-quantity"
                    type="number"
                    min="0.001"
                    max={removing ? available : 100000}
                    step="any"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    required
                  />
                </div>
                <div className="field">
                  <label htmlFor="stock-action-location">
                    {kind === 'add' ? 'Put it in' : 'Take it from'}
                  </label>
                  <select
                    id="stock-action-location"
                    value={locationId}
                    onChange={(e) => {
                      setLocationId(e.target.value);
                      setError('');
                    }}
                    required={kind === 'add'}
                  >
                    {removing && <option value="">Any location · oldest first</option>}
                    {(kind === 'add' ? state.locations : stockedLocations).map((location) => (
                      <option value={location.id} key={location.id}>
                        {location.emoji} {location.name}
                      </option>
                    ))}
                  </select>
                </div>
                {kind === 'add' && (
                  <div className="field">
                    <label htmlFor="stock-action-expiry">
                      Best before <span>(optional)</span>
                    </label>
                    <input
                      id="stock-action-expiry"
                      type="date"
                      value={expiresAt}
                      onChange={(e) => setExpiresAt(e.target.value)}
                    />
                  </div>
                )}
              </div>
              {removing && (
                <p className="inventory-form-hint">
                  {kind === 'consume'
                    ? 'Use the oldest stock first to help reduce food waste.'
                    : 'This records a discarded item, keeping it separate from what you consumed.'}{' '}
                  {locationId && `${formatQuantity(available)} ${item.unit} available here.`}
                </p>
              )}
            </>
          )}
          {currentItem.batches.some((batch) => batch.quantity > 0) && (
            <div className="inventory-batch-summary">
              <h3>Currently at home</h3>
              {currentItem.batches
                .filter((batch) => batch.quantity > 0)
                .map((batch) => {
                  const location = state.locations.find((entry) => entry.id === batch.locationId);
                  const days = daysUntil(batch.expiresAt);
                  const editing = batchDraft?.id === batch.id;
                  return (
                    <div
                      className={`inventory-batch-entry ${editing ? 'editing' : ''}`}
                      key={batch.id}
                    >
                      <div className="inventory-batch-row">
                        <span>
                          <MapPin size={14} />
                          {location?.name ?? 'Unknown location'}
                        </span>
                        <strong>
                          {formatQuantity(batch.quantity)} {item.unit}
                        </strong>
                        {kind === 'edit' && (
                          <button
                            type="button"
                            className="btn btn-ghost btn-small inventory-batch-edit-button"
                            aria-label={`Edit stock in ${location?.name ?? 'this location'}, ${formatQuantity(batch.quantity)} ${item.unit}${batch.expiresAt ? `, best before ${prettyDate(batch.expiresAt)}` : ''}`}
                            disabled={busy || batchBusy || (!!batchDraft && !editing)}
                            onClick={() => {
                              setBatchDraft({
                                id: batch.id,
                                quantity: String(batch.quantity),
                                locationId: batch.locationId,
                                expiresAt: batch.expiresAt ?? '',
                              });
                              setBatchError('');
                            }}
                          >
                            <Pencil size={12} />
                            Edit stock
                          </button>
                        )}
                        <span className={days !== null && days < 0 ? 'expiry-overdue' : ''}>
                          <CalendarDays size={14} />
                          {batch.expiresAt
                            ? `Best before ${prettyDate(batch.expiresAt)}`
                            : 'No date set'}
                        </span>
                      </div>
                      {editing && batchDraft && (
                        <div className="inventory-batch-editor">
                          <div className="form-grid">
                            <div className="field">
                              <label htmlFor={`batch-quantity-${batch.id}`}>
                                Correct quantity <span>({item.unit})</span>
                              </label>
                              <input
                                id={`batch-quantity-${batch.id}`}
                                type="number"
                                min="0"
                                max="1000000"
                                step="any"
                                value={batchDraft.quantity}
                                disabled={batchBusy}
                                onChange={(e) =>
                                  setBatchDraft({ ...batchDraft, quantity: e.target.value })
                                }
                              />
                              <small>Set to 0 to remove this stock batch.</small>
                            </div>
                            <div className="field">
                              <label htmlFor={`batch-location-${batch.id}`}>Storage location</label>
                              <select
                                id={`batch-location-${batch.id}`}
                                value={batchDraft.locationId}
                                disabled={batchBusy}
                                onChange={(e) =>
                                  setBatchDraft({ ...batchDraft, locationId: e.target.value })
                                }
                              >
                                {state.locations.map((entry) => (
                                  <option key={entry.id} value={entry.id}>
                                    {entry.emoji} {entry.name}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div className="field full">
                              <label htmlFor={`batch-expiry-${batch.id}`}>
                                Best before <span>(optional)</span>
                              </label>
                              <input
                                id={`batch-expiry-${batch.id}`}
                                type="date"
                                value={batchDraft.expiresAt}
                                disabled={batchBusy}
                                onChange={(e) =>
                                  setBatchDraft({ ...batchDraft, expiresAt: e.target.value })
                                }
                              />
                            </div>
                          </div>
                          {batchError && (
                            <p role="alert" className="error-message">
                              {batchError}
                            </p>
                          )}
                          <div className="inventory-batch-editor-actions">
                            <button
                              type="button"
                              className="btn btn-ghost btn-small"
                              disabled={batchBusy}
                              onClick={() => {
                                setBatchDraft(null);
                                setBatchError('');
                              }}
                            >
                              Cancel correction
                            </button>
                            <button
                              type="button"
                              className="btn btn-secondary btn-small"
                              disabled={batchBusy}
                              onClick={saveBatch}
                            >
                              <Check size={14} />
                              {batchBusy ? 'Saving stock…' : 'Save stock changes'}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
          )}
          {error && (
            <p role="alert" className="error-message">
              {error}
            </p>
          )}
        </div>
        <footer className="modal-footer">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={close}
            disabled={busy || batchBusy}
          >
            Cancel
          </button>
          <button
            className={`btn ${kind === 'discard' ? 'btn-danger' : 'btn-primary'}`}
            title={batchDraft ? 'Save or cancel your stock correction first.' : undefined}
            disabled={
              busy ||
              batchBusy ||
              !!batchDraft ||
              (removing && available <= 0) ||
              (kind === 'add' && !locationId)
            }
          >
            {kind === 'add' ? (
              <ArrowDownLeft size={17} />
            ) : kind === 'consume' ? (
              <ArrowUpRight size={17} />
            ) : kind === 'discard' ? (
              <Trash2 size={17} />
            ) : (
              <Check size={17} />
            )}
            {busy
              ? 'Saving…'
              : kind === 'add'
                ? 'Add stock'
                : kind === 'consume'
                  ? 'Record use'
                  : kind === 'discard'
                    ? 'Mark as gone'
                    : 'Save changes'}
          </button>
        </footer>
      </form>
    </Modal>
  );
}

export function DeleteItemModal({
  item,
  onClose,
  onSaved,
  notify,
}: {
  item: InventoryItem;
  onClose: () => void;
  onSaved: () => Promise<void>;
  notify: SharedProps['notify'];
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const close = useCallback(() => {
    if (!busy) onClose();
  }, [busy, onClose]);
  async function remove() {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await api(`/products/${item.id}`, { method: 'DELETE' });
      await onSaved();
      notify(`${item.name} removed from your inventory.`);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove this item.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={`Remove ${item.name}?`}
      subtitle="For a mistaken entry or an item you no longer want to track."
      onClose={close}
    >
      <div className="modal-body">
        <div className="stock-item-summary">
          <span className="stock-item-emoji" aria-hidden="true">
            {item.emoji}
          </span>
          <div>
            <strong>{item.name}</strong>
            <span>
              {formatQuantity(item.quantity)} {item.unit} at home
            </span>
          </div>
        </div>
        <p className="confirm-copy">
          This permanently removes the item and its current stock from your inventory. It will no
          longer appear in refill suggestions. Existing shopping list entries and activity history
          keep their recorded names.
        </p>
        <p className="inventory-form-hint">
          If you used or threw away this item, choose “Use” or “Mark as gone” instead to keep
          tracking it.
        </p>
        {error && (
          <p role="alert" className="error-message">
            {error}
          </p>
        )}
      </div>
      <footer className="modal-footer">
        <button className="btn btn-secondary" disabled={busy} onClick={close}>
          Keep item
        </button>
        <button className="btn btn-danger" disabled={busy} onClick={remove}>
          <Trash2 size={16} />
          {busy ? 'Removing…' : 'Remove item'}
        </button>
      </footer>
    </Modal>
  );
}
