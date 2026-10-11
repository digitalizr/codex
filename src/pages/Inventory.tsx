import { useEffect, useMemo, useState } from 'react';
import {
  ArrowUpRight,
  CalendarDays,
  ChevronDown,
  LayoutGrid,
  List,
  MapPin,
  MoreHorizontal,
  Package,
  Plus,
  Search,
  SlidersHorizontal,
  Trash2,
  X,
} from 'lucide-react';
import { daysUntil, formatQuantity, prettyDate } from '../api';
import type { InventoryItem, PageProps } from '../types';
import { AddItemModal, DeleteItemModal, StockActionModal } from '../components/InventoryDialogs';
import '../inventory.css';

type ItemAction = { item: InventoryItem; kind: 'add' | 'consume' | 'discard' | 'edit' };
type StatusFilter = 'all' | 'good' | 'low' | 'out' | 'expiring' | 'refill';

function nearestDate(item: InventoryItem, locationId: string) {
  if (locationId === 'all') return item.expiresAt;
  return (
    item.batches
      .filter((batch) => batch.locationId === locationId && batch.quantity > 0 && batch.expiresAt)
      .map((batch) => batch.expiresAt!)
      .sort()[0] ?? null
  );
}

function expiryInfo(date: string | null) {
  const days = daysUntil(date);
  if (days === null) return null;
  if (days < 0)
    return {
      text: `${Math.abs(days)} ${Math.abs(days) === 1 ? 'day' : 'days'} past date`,
      tone: 'expired',
    };
  if (days === 0) return { text: 'Best before today', tone: 'soon' };
  if (days === 1) return { text: 'Best before tomorrow', tone: 'soon' };
  if (days <= 3) return { text: `Best before in ${days} days`, tone: 'soon' };
  return { text: `Best before ${prettyDate(date)}`, tone: 'normal' };
}

export default function Inventory({
  state,
  refresh,
  notify,
  initialSearch = '',
}: PageProps & { initialSearch?: string }) {
  const [query, setQuery] = useState(initialSearch);
  const [locationId, setLocationId] = useState('all');
  const [categoryId, setCategoryId] = useState('all');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [sort, setSort] = useState('name');
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [adding, setAdding] = useState(false);
  const [action, setAction] = useState<ItemAction | null>(null);
  const [deleting, setDeleting] = useState<InventoryItem | null>(null);
  const [menuId, setMenuId] = useState<string | null>(null);
  useEffect(() => {
    setQuery(initialSearch);
  }, [initialSearch]);

  const items = useMemo(
    () =>
      state.inventory
        .filter((item) => {
          const category = state.categories.find((entry) => entry.id === item.categoryId);
          const searchMatches = `${item.name} ${category?.name ?? ''}`
            .toLowerCase()
            .includes(query.trim().toLowerCase());
          const date = daysUntil(nearestDate(item, locationId));
          return (
            searchMatches &&
            (locationId === 'all' ||
              item.batches.some(
                (batch) => batch.locationId === locationId && batch.quantity > 0,
              )) &&
            (categoryId === 'all' || item.categoryId === categoryId) &&
            (status === 'all' ||
              (status === 'expiring'
                ? date !== null && date <= 3 && item.quantity > 0
                : status === 'refill'
                  ? item.status === 'low' || item.status === 'out'
                  : item.status === status))
          );
        })
        .sort((a, b) =>
          sort === 'expiry'
            ? (nearestDate(a, locationId) || '9999').localeCompare(
                nearestDate(b, locationId) || '9999',
              ) || a.name.localeCompare(b.name)
            : sort === 'stock'
              ? a.quantity - b.quantity || a.name.localeCompare(b.name)
              : a.name.localeCompare(b.name),
        ),
    [state.inventory, state.categories, query, locationId, categoryId, status, sort],
  );

  const lowCount = state.inventory.filter(
    (item) => item.status === 'low' || item.status === 'out',
  ).length;
  const expiringCount = state.inventory.filter(
    (item) =>
      item.quantity > 0 && daysUntil(item.expiresAt) !== null && daysUntil(item.expiresAt)! <= 3,
  ).length;
  const filtered = query || locationId !== 'all' || categoryId !== 'all' || status !== 'all';
  const openAction = (item: InventoryItem, kind: ItemAction['kind']) => {
    setMenuId(null);
    setAction({ item, kind });
  };
  const resetFilters = () => {
    setQuery('');
    setLocationId('all');
    setCategoryId('all');
    setStatus('all');
  };

  return (
    <div className="inventory-page">
      <div className="page-heading inventory-heading">
        <div>
          <div className="inventory-eyebrow">A LITTLE ORDER, EVERY DAY</div>
          <h1>
            Your inventory<span className="heading-count">{state.inventory.length}</span>
          </h1>
          <p>Know what you have. Make room for what you love.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setAdding(true)}>
          <Plus size={18} />
          Add an item
        </button>
      </div>
      <div className="inventory-summary-strip">
        <span>
          <span className="inventory-summary-dot green" />
          {state.inventory.filter((item) => item.quantity > 0).length} items at home
        </span>
        <button
          onClick={() => setStatus(status === 'refill' ? 'all' : 'refill')}
          className={status === 'refill' ? 'active' : ''}
        >
          <span className="inventory-summary-dot amber" />
          {lowCount} need a refill
        </button>
        <button
          onClick={() => setStatus(status === 'expiring' ? 'all' : 'expiring')}
          className={status === 'expiring' ? 'active' : ''}
        >
          <CalendarDays size={14} />
          {expiringCount} to use soon
        </button>
      </div>
      <div className="inventory-location-tabs" role="tablist" aria-label="Storage locations">
        <button
          role="tab"
          aria-selected={locationId === 'all'}
          className={locationId === 'all' ? 'selected' : ''}
          onClick={() => setLocationId('all')}
        >
          <Package size={17} />
          All items<span>{state.inventory.length}</span>
        </button>
        {state.locations.map((location) => (
          <button
            key={location.id}
            role="tab"
            aria-selected={locationId === location.id}
            className={locationId === location.id ? 'selected' : ''}
            onClick={() => setLocationId(location.id)}
          >
            <span className="location-tab-emoji" aria-hidden="true">
              {location.emoji}
            </span>
            {location.name}
            <span>
              {
                state.inventory.filter((item) =>
                  item.batches.some(
                    (batch) => batch.locationId === location.id && batch.quantity > 0,
                  ),
                ).length
              }
            </span>
          </button>
        ))}
      </div>
      <div className="inventory-toolbar">
        <div className="inventory-search">
          <Search size={18} />
          <input
            aria-label="Search inventory"
            placeholder="Find something in your kitchen…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button className="icon-btn" aria-label="Clear search" onClick={() => setQuery('')}>
              <X size={16} />
            </button>
          )}
        </div>
        <div className="inventory-select">
          <SlidersHorizontal size={15} />
          <select
            aria-label="Filter by category"
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
          >
            <option value="all">All categories</option>
            {state.categories.map((category) => (
              <option value={category.id} key={category.id}>
                {category.name}
              </option>
            ))}
          </select>
          <ChevronDown size={14} />
        </div>
        <div className="inventory-select inventory-status-select">
          <select
            aria-label="Filter by stock status"
            value={status}
            onChange={(e) => setStatus(e.target.value as StatusFilter)}
          >
            <option value="all">All stock levels</option>
            <option value="good">Well stocked</option>
            <option value="refill">Needs a refill</option>
            <option value="low">Running low</option>
            <option value="out">Out of stock</option>
            <option value="expiring">Use soon / past date</option>
          </select>
          <ChevronDown size={14} />
        </div>
        <div className="inventory-view-toggle" aria-label="Inventory layout">
          <button
            aria-label="Card view"
            aria-pressed={view === 'grid'}
            className={view === 'grid' ? 'selected' : ''}
            onClick={() => setView('grid')}
          >
            <LayoutGrid size={18} />
          </button>
          <button
            aria-label="List view"
            aria-pressed={view === 'list'}
            className={view === 'list' ? 'selected' : ''}
            onClick={() => setView('list')}
          >
            <List size={19} />
          </button>
        </div>
      </div>
      <div className="inventory-results-bar">
        <p>
          {filtered
            ? `${items.length} of ${state.inventory.length} items`
            : `${items.length} items in your household`}
          {filtered && <button onClick={resetFilters}>Clear filters</button>}
        </p>
        <label>
          Sort by{' '}
          <select
            aria-label="Sort inventory"
            value={sort}
            onChange={(e) => setSort(e.target.value)}
          >
            <option value="name">Name</option>
            <option value="expiry">Best before</option>
            <option value="stock">Quantity</option>
          </select>
          <ChevronDown size={13} />
        </label>
      </div>
      {items.length ? (
        <div className={`inventory-items inventory-${view}`}>
          {items.map((item) => {
            const category = state.categories.find((entry) => entry.id === item.categoryId);
            const locations = state.locations.filter((location) =>
              item.batches.some((batch) => batch.locationId === location.id && batch.quantity > 0),
            );
            const expiry = expiryInfo(nearestDate(item, locationId));
            const statusText = { good: 'Well stocked', low: 'Running low', out: 'Out of stock' }[
              item.status
            ];
            const statusColor = { good: 'green', low: 'amber', out: 'red' }[item.status];
            const quantity =
              locationId === 'all'
                ? item.quantity
                : item.batches
                    .filter((batch) => batch.locationId === locationId)
                    .reduce((sum, batch) => sum + batch.quantity, 0);
            const stockRatio =
              item.minQuantity > 0
                ? Math.min(100, (item.quantity / (item.minQuantity * 2)) * 100)
                : item.quantity > 0
                  ? 100
                  : 0;
            return (
              <article
                className={`inventory-item card ${item.status === 'out' ? 'is-out' : ''}`}
                key={item.id}
              >
                <div className="inventory-item-top">
                  <div className="inventory-product-emoji" aria-hidden="true">
                    {item.emoji}
                  </div>
                  <span className={`badge ${statusColor}`}>
                    <span className="status-pill-dot" />
                    {statusText}
                  </span>
                  <div className="inventory-item-menu">
                    <button
                      className="icon-btn inventory-menu-toggle"
                      aria-label={`More options for ${item.name}`}
                      aria-expanded={menuId === item.id}
                      onClick={() => setMenuId(menuId === item.id ? null : item.id)}
                    >
                      <MoreHorizontal size={19} />
                    </button>
                    {menuId === item.id && (
                      <>
                        <button
                          className="inventory-menu-dismiss"
                          tabIndex={-1}
                          aria-label="Close item options"
                          onClick={() => setMenuId(null)}
                        />
                        <div className="inventory-menu-dropdown">
                          <button onClick={() => openAction(item, 'edit')}>
                            Edit item & stock
                          </button>
                          <button
                            disabled={item.quantity <= 0}
                            onClick={() => openAction(item, 'discard')}
                          >
                            <Trash2 size={14} />
                            Mark as gone
                          </button>
                          <button
                            className="inventory-delete-option"
                            onClick={() => {
                              setMenuId(null);
                              setDeleting(item);
                            }}
                          >
                            <Trash2 size={14} />
                            Remove item
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </div>
                <div className="inventory-item-name">
                  <span className="inventory-category">{category?.name ?? 'Uncategorized'}</span>
                  <h2>{item.name}</h2>
                </div>
                <div className="inventory-stock">
                  <div>
                    <strong>{formatQuantity(quantity)}</strong>
                    <span>{item.unit}</span>
                    {locationId !== 'all' && quantity !== item.quantity && (
                      <small>of {formatQuantity(item.quantity)} total</small>
                    )}
                  </div>
                  <span className="inventory-stock-target">
                    Keep {formatQuantity(item.minQuantity)}+
                  </span>
                </div>
                <div
                  className={`inventory-stock-meter ${statusColor}`}
                  role="meter"
                  aria-label={`${item.name} household stock relative to target`}
                  aria-valuemin={0}
                  aria-valuemax={Math.max(item.minQuantity * 2, item.quantity, 1)}
                  aria-valuenow={item.quantity}
                >
                  <span style={{ width: `${stockRatio}%` }} />
                </div>
                <div className="inventory-item-meta">
                  <span>
                    <MapPin size={14} />
                    {locations.length
                      ? locations.map((location) => location.name).join(' · ')
                      : 'No stock at home'}
                  </span>
                  <span className={`inventory-expiry ${expiry?.tone ?? 'normal'}`}>
                    <CalendarDays size={14} />
                    {expiry?.text ?? 'No best-before date'}
                  </span>
                </div>
                <div className="inventory-item-actions">
                  <button
                    className="btn btn-secondary btn-small"
                    disabled={item.quantity <= 0}
                    onClick={() => openAction(item, 'consume')}
                  >
                    <ArrowUpRight size={15} />
                    Use
                  </button>
                  <button
                    className="btn btn-secondary btn-small inventory-add-stock"
                    onClick={() => openAction(item, 'add')}
                  >
                    <Plus size={15} />
                    Add stock
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="empty-state inventory-empty">
          <span className="inventory-empty-icon">
            <Package size={31} />
          </span>
          <h2>{filtered ? 'Nothing on this shelf' : 'A fresh start for your kitchen'}</h2>
          <p>
            {filtered
              ? 'Try another location or adjust your filters to find your items.'
              : 'Add your first item and give it a place at home. We’ll help you keep track from here.'}
          </p>
          <button
            className={`btn ${filtered ? 'btn-secondary' : 'btn-primary'}`}
            onClick={filtered ? resetFilters : () => setAdding(true)}
          >
            {filtered ? (
              'Clear filters'
            ) : (
              <>
                <Plus size={17} />
                Add your first item
              </>
            )}
          </button>
        </div>
      )}
      <div className="inventory-footer-note">
        <span aria-hidden="true">🌱</span>
        <p>A little awareness goes a long way. Use older items first and waste less.</p>
      </div>
      {adding && (
        <AddItemModal
          state={state}
          onClose={() => setAdding(false)}
          onSaved={refresh}
          notify={notify}
        />
      )}
      {action && (
        <StockActionModal
          item={action.item}
          state={state}
          kind={action.kind}
          onClose={() => setAction(null)}
          onSaved={refresh}
          notify={notify}
        />
      )}
      {deleting && (
        <DeleteItemModal
          item={deleting}
          onClose={() => setDeleting(null)}
          onSaved={refresh}
          notify={notify}
        />
      )}
    </div>
  );
}
