import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import {
  Check,
  Database,
  Download,
  FolderHeart,
  HardDrive,
  Heart,
  Info,
  MapPin,
  Pencil,
  Plus,
  ShieldCheck,
  Store,
  Tags,
  Trash2,
  Users,
} from 'lucide-react';
import Modal from '../components/Modal';
import MemberAvatar from '../components/MemberAvatar';
import { api, today } from '../api';
import type { Category, Location, Member, PageProps, Provider } from '../types';
import '../household-playful.css';

type Tab = 'household' | 'locations' | 'categories' | 'providers' | 'data';
type Registry = 'members' | 'locations' | 'categories' | 'providers';
type Entry = Member | Location | Category | Provider;
type Editor = { registry: Registry; entry?: Entry };
type Removal = { registry: Registry; entry: Entry };
const details = {
  members: { singular: 'profile', title: 'Household profiles', emoji: '👤', color: '#568B72' },
  locations: { singular: 'location', title: 'Storage locations', emoji: '📦', color: '#648C69' },
  categories: { singular: 'category', title: 'Item categories', emoji: '🏷️', color: '#628B61' },
  providers: { singular: 'store', title: 'Your grocery stores', emoji: '🛍️', color: '#648C69' },
};

function errorText(error: unknown) {
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.';
}
export default function Settings({ state, refresh, notify, memberId }: PageProps) {
  const [tab, setTab] = useState<Tab>('household');
  const [householdName, setHouseholdName] = useState(state.household.name);
  const [savingName, setSavingName] = useState(false);
  const [nameError, setNameError] = useState('');
  const [editor, setEditor] = useState<Editor | null>(null);
  const [removal, setRemoval] = useState<Removal | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');
  useEffect(() => {
    setHouseholdName(state.household.name);
  }, [state.household.name]);

  async function saveHousehold(event: FormEvent) {
    event.preventDefault();
    if (savingName) return;
    setSavingName(true);
    setNameError('');
    try {
      await api('/household', { method: 'PATCH', body: { name: householdName.trim() } });
      await refresh();
      notify('Your household name has been updated.');
    } catch (error) {
      setNameError(errorText(error));
    } finally {
      setSavingName(false);
    }
  }

  async function exportData() {
    if (exporting) return;
    setExporting(true);
    setExportError('');
    try {
      const response = await fetch('/api/export', {
        headers: memberId ? { 'X-Member-Id': memberId } : {},
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Could not export your household data.');
      }
      const file = await response.blob();
      const url = URL.createObjectURL(file);
      const link = document.createElement('a');
      link.href = url;
      link.download = `hearth-household-${today()}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      notify('Your household export is ready.');
    } catch (error) {
      setExportError(errorText(error));
    } finally {
      setExporting(false);
    }
  }

  function registryRows(registry: Registry) {
    return (
      <div className={`settings-list ${registry === 'members' ? 'settings-profile-list' : ''}`}>
        {state[registry].length ? (
          state[registry].map((entry) => {
            const inUse =
              registry === 'locations'
                ? state.inventory.filter((item) =>
                    item.batches.some(
                      (batch) => batch.locationId === entry.id && batch.quantity > 0,
                    ),
                  ).length
                : registry === 'categories'
                  ? state.inventory.filter((item) => item.categoryId === entry.id).length
                  : registry === 'providers'
                    ? state.inventory.filter((item) => item.preferredProviderId === entry.id).length
                    : state.lists.filter(
                        (list) => list.memberId === entry.id && list.status !== 'completed',
                      ).length;
            const subtext =
              registry === 'locations'
                ? `${inUse} ${inUse === 1 ? 'item' : 'items'} at home here`
                : registry === 'categories'
                  ? `${inUse} ${inUse === 1 ? 'item' : 'items'} in this category`
                  : registry === 'providers'
                    ? `${inUse} preferred ${inUse === 1 ? 'item' : 'items'}${'notes' in entry && entry.notes ? ` · ${entry.notes}` : ''}`
                    : entry.id === memberId
                      ? `Current profile · ${inUse} upcoming ${inUse === 1 ? 'trip' : 'trips'}`
                      : `${inUse} upcoming ${inUse === 1 ? 'trip' : 'trips'}`;
            const isActiveMember = registry === 'members' && entry.id === memberId;
            return (
              <div
                className={`settings-row ${isActiveMember ? 'settings-active-profile' : ''}`}
                key={entry.id}
              >
                <span
                  className={`settings-row-icon ${registry === 'members' ? 'member' : ''}`}
                  style={
                    'color' in entry && registry === 'providers'
                      ? { color: entry.color, backgroundColor: `${entry.color}15` }
                      : undefined
                  }
                >
                  {registry === 'members' ? (
                    <MemberAvatar member={entry as Member} />
                  ) : 'emoji' in entry ? (
                    entry.emoji
                  ) : (
                    <Store size={19} />
                  )}
                </span>
                <div className="settings-row-copy">
                  <strong>
                    {entry.name}
                    {isActiveMember && (
                      <span className="badge green" style={{ marginLeft: 8 }}>
                        Using now
                      </span>
                    )}
                  </strong>
                  <small>{subtext}</small>
                </div>
                <button
                  className="icon-btn"
                  aria-label={`Edit ${entry.name}`}
                  onClick={() => setEditor({ registry, entry })}
                >
                  <Pencil size={15} />
                </button>
                <button
                  className="icon-btn"
                  aria-label={`Remove ${entry.name}`}
                  disabled={isActiveMember}
                  title={
                    isActiveMember
                      ? 'Switch to another profile before removing this one.'
                      : `Remove ${entry.name}`
                  }
                  onClick={() => setRemoval({ registry, entry })}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            );
          })
        ) : (
          <div className="settings-empty">
            No {registry === 'providers' ? 'stores' : registry} yet. Add your first{' '}
            {details[registry].singular} to get started.
          </div>
        )}
      </div>
    );
  }

  const tabs: { id: Tab; name: string; emoji: string }[] = [
    { id: 'household', name: 'Household', emoji: '🏡' },
    { id: 'locations', name: 'Locations', emoji: '🧺' },
    { id: 'categories', name: 'Categories', emoji: '🌈' },
    { id: 'providers', name: 'Stores', emoji: '🛍️' },
    { id: 'data', name: 'Data', emoji: '💌' },
  ];
  return (
    <div className="settings-page">
      <div className="page-heading household-playful-heading settings-heading">
        <div>
          <div className="eyebrow date-eyebrow">THE PEOPLE & PLACES THAT MAKE IT HOME</div>
          <h1>A home that works for you</h1>
          <p>Your places, your people, your everyday preferences.</p>
        </div>
        <div className="household-heading-friends" aria-hidden="true">
          <span className="household-friend-orbit" />
          <span className="household-friend first">🏡</span>
          <span className="household-friend second">🌷</span>
          <span className="household-friend-note">made for your kind of home.</span>
        </div>
      </div>
      <nav className="settings-tabs" aria-label="Settings sections">
        {tabs.map((item) => (
          <button
            key={item.id}
            className={tab === item.id ? 'active' : ''}
            aria-current={tab === item.id ? 'page' : undefined}
            onClick={() => setTab(item.id)}
          >
            <span aria-hidden="true">{item.emoji}</span>
            {item.name}
          </button>
        ))}
      </nav>
      {tab === 'household' && (
        <div className="settings-grid">
          <section className="card settings-card settings-household-card">
            <h2>Your household</h2>
            <p>A shared space for keeping the kitchen in order.</p>
            <form onSubmit={saveHousehold} style={{ marginTop: 22 }}>
              <div className="field">
                <label htmlFor="household-name">Household name</label>
                <input
                  id="household-name"
                  value={householdName}
                  onChange={(e) => setHouseholdName(e.target.value)}
                  maxLength={100}
                  placeholder="e.g. Our little home"
                  required
                />
              </div>
              {nameError && (
                <p className="error-message" role="alert">
                  {nameError}
                </p>
              )}
              <button
                className="btn btn-primary"
                style={{ marginTop: 16 }}
                disabled={
                  savingName ||
                  !householdName.trim() ||
                  householdName.trim() === state.household.name
                }
              >
                <Check size={16} />
                {savingName ? 'Saving…' : 'Save name'}
              </button>
            </form>
            <div className="settings-note">
              <Heart size={17} />
              <p>
                Your inventory, lists and shopping plans belong to this household. Everyone using a
                profile sees the same shared space.
              </p>
            </div>
          </section>
          <section className="card settings-card settings-people-card">
            <h2>Better together</h2>
            <p>Start with yourself. Add your partner whenever you're ready.</p>
            {registryRows('members')}
            <button
              className="btn btn-secondary btn-small"
              onClick={() => setEditor({ registry: 'members' })}
            >
              <Plus size={15} />
              Add a profile
            </button>
            <div className="settings-note">
              <Users size={17} />
              <p>
                Profiles are names for assigning shopping trips and recording activity. They don't
                require accounts or passwords. Switch the active profile in the top bar.
              </p>
            </div>
          </section>
        </div>
      )}
      {tab === 'locations' && (
        <div className="settings-grid">
          <section className="card settings-card">
            <h2>Storage locations</h2>
            <p>Give every item a place, from the fridge to that little snack drawer.</p>
            {registryRows('locations')}
            <button
              className="btn btn-primary btn-small"
              onClick={() => setEditor({ registry: 'locations' })}
            >
              <Plus size={15} />
              Add a location
            </button>
          </section>
          <section className="card settings-card">
            <div className="icon-tile green" style={{ marginBottom: 18 }}>
              <MapPin size={20} />
            </div>
            <h2>A place for everything</h2>
            <p>
              Use any location names that make sense at home: fridge, pantry, freezer, basement, or
              a shelf in the kitchen.
            </p>
            <div className="settings-note">
              <Info size={17} />
              <p>
                An item can have stock in several locations, each with its own best-before date.
                Locations already used by stock records must be reassigned before you can remove
                them.
              </p>
            </div>
          </section>
        </div>
      )}
      {tab === 'categories' && (
        <div className="settings-grid">
          <section className="card settings-card">
            <h2>Your item categories</h2>
            <p>Organize groceries in a way that feels natural to you.</p>
            {registryRows('categories')}
            <button
              className="btn btn-primary btn-small"
              onClick={() => setEditor({ registry: 'categories' })}
            >
              <Plus size={15} />
              Add a category
            </button>
          </section>
          <section className="card settings-card">
            <div className="icon-tile peach" style={{ marginBottom: 18 }}>
              <Tags size={20} />
            </div>
            <h2>Make it your own</h2>
            <p>
              Create categories for breakfast staples, fresh produce, baking supplies or anything
              else you keep at home. Add a friendly icon and a color to make them yours.
            </p>
            <div className="settings-note">
              <FolderHeart size={17} />
              <p>
                Categories help you filter your inventory and see what belongs together. Change an
                item's category in Inventory before removing a category it uses.
              </p>
            </div>
          </section>
        </div>
      )}
      {tab === 'providers' && (
        <div className="settings-grid">
          <section className="card settings-card">
            <h2>Your grocery stores</h2>
            <p>A little planning for the places you already love to shop.</p>
            {registryRows('providers')}
            <button
              className="btn btn-primary btn-small"
              onClick={() => setEditor({ registry: 'providers' })}
            >
              <Plus size={15} />
              Add a store
            </button>
          </section>
          <section className="card settings-card">
            <div className="icon-tile amber" style={{ marginBottom: 18 }}>
              <Store size={20} />
            </div>
            <h2>One list, a few stops</h2>
            <p>
              Add REWE, PENNY, your local market, or an online grocery service. Give items a
              preferred store and organize shopping trips by stop.
            </p>
            <div className="settings-note">
              <Info size={17} />
              <p>
                Preferred stores carry into refill suggestions. You can change the store for
                individual items in any shopping list. Store notes are handy for opening hours or
                your usual branch.
              </p>
            </div>
          </section>
        </div>
      )}
      {tab === 'data' && (
        <div className="settings-grid">
          <section className="card settings-card">
            <div className="icon-tile green" style={{ marginBottom: 18 }}>
              <Database size={20} />
            </div>
            <h2>Your household data</h2>
            <p>
              Your home has its own dedicated SQLite database. Stock changes, lists, plans and
              activity are saved as you use the app.
            </p>
            <div className="settings-data-stats">
              <span>{state.inventory.length} items</span>
              <span>{state.lists.length} shopping lists</span>
              <span>{state.locations.length} locations</span>
              <span>{state.members.length} profiles</span>
            </div>
            <div className="settings-note">
              <HardDrive size={17} />
              <p>
                Your database persists when the app restarts. Keep an external copy of your data
                with a JSON export whenever you need one.
              </p>
            </div>
          </section>
          <section className="card settings-card">
            <div className="icon-tile blue" style={{ marginBottom: 18 }}>
              <Download size={20} />
            </div>
            <h2>Take a copy with you</h2>
            <p>
              Download your household data as a JSON file, including inventory, shopping lists,
              settings and activity history.
            </p>
            <button className="btn btn-secondary" onClick={exportData} disabled={exporting}>
              <Download size={16} />
              {exporting ? 'Preparing export…' : 'Export household data'}
            </button>
            {exportError && (
              <p className="error-message" role="alert">
                {exportError}
              </p>
            )}
            <div className="settings-note">
              <ShieldCheck size={17} />
              <p>
                The export is a portable data snapshot for your records. Importing or restoring a
                JSON file is not available in the app yet.
              </p>
            </div>
          </section>
          {state.household.demo && (
            <section className="card settings-card wide danger">
              <h2>Ready to make it yours?</h2>
              <p>
                Clear the starter inventory, shopping lists and activity history, then begin with
                the groceries in your own home. Your household, profiles, locations, categories and
                stores will stay.
              </p>
              <button className="btn btn-danger" onClick={() => setConfirmReset(true)}>
                <Trash2 size={16} />
                Clear starter data
              </button>
            </section>
          )}
        </div>
      )}
      {editor && (
        <RegistryModal
          editor={editor}
          onClose={() => setEditor(null)}
          onSaved={refresh}
          notify={notify}
        />
      )}
      {removal && (
        <ConfirmChange
          title={`Remove ${removal.entry.name}?`}
          subtitle={`This removes the ${details[removal.registry].singular} from your household.`}
          buttonText="Remove"
          onClose={() => setRemoval(null)}
          onConfirm={async () => {
            await api(`/${removal.registry}/${removal.entry.id}`, { method: 'DELETE' });
            await refresh();
            notify(`${removal.entry.name} removed.`);
            setRemoval(null);
          }}
        >
          <p className="confirm-copy">
            {removal.registry === 'members'
              ? 'Previous activity will keep its recorded name. Reassign any shopping trips using this profile before removing it.'
              : removal.registry === 'locations'
                ? 'Locations with stock records cannot be removed. Reassign those records first so your inventory stays intact.'
                : removal.registry === 'categories'
                  ? 'Items using this category need to be moved to another category before it can be removed.'
                  : 'Items and shopping lists using this store need a different store before it can be removed.'}
          </p>
        </ConfirmChange>
      )}
      {confirmReset && (
        <ConfirmChange
          title="Start with your own groceries?"
          subtitle="Your starter data will be cleared permanently."
          buttonText="Clear starter data"
          onClose={() => setConfirmReset(false)}
          onConfirm={async () => {
            await api('/household/reset', { method: 'POST', body: {} });
            await refresh();
            notify('A fresh start. Your household is ready for your own groceries.');
            setConfirmReset(false);
          }}
        >
          <p className="confirm-copy">
            This clears{' '}
            <strong>all current inventory items, stock, shopping lists and activity history</strong>
            , including changes you made to the starter data. Your household name, profiles,
            locations, categories and stores are kept.
          </p>
          <p className="confirm-copy" style={{ marginTop: 12 }}>
            You can export a copy in the Data tab before starting fresh.
          </p>
        </ConfirmChange>
      )}
    </div>
  );
}

function RegistryModal({
  editor,
  onClose,
  onSaved,
  notify,
}: {
  editor: Editor;
  onClose: () => void;
  onSaved: () => Promise<void>;
  notify: PageProps['notify'];
}) {
  const { registry, entry } = editor;
  const config = details[registry];
  const [name, setName] = useState(entry?.name ?? '');
  const [emoji, setEmoji] = useState(entry && 'emoji' in entry ? entry.emoji : config.emoji);
  const [color, setColor] = useState(entry && 'color' in entry ? entry.color : config.color);
  const [notes, setNotes] = useState(entry && 'notes' in entry ? entry.notes : '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const close = useCallback(() => {
    if (!busy) onClose();
  }, [busy, onClose]);
  const hasEmoji = registry === 'locations' || registry === 'categories';
  const hasColor = registry !== 'locations';
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await api(`/${registry}${entry ? `/${entry.id}` : ''}`, {
        method: entry ? 'PATCH' : 'POST',
        body: {
          name: name.trim(),
          ...(hasEmoji ? { emoji: emoji.trim() || config.emoji } : {}),
          ...(hasColor ? { color } : {}),
          ...(registry === 'providers' ? { notes: notes.trim() } : {}),
        },
      });
      await onSaved();
      notify(`${name.trim()} ${entry ? 'updated' : 'added'}.`);
      onClose();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={`${entry ? 'Edit' : 'Add a'} ${config.singular}`}
      subtitle={
        registry === 'members'
          ? 'A simple name for sharing trips and activity.'
          : `Make this ${config.singular} a part of your home.`
      }
      onClose={close}
    >
      <form onSubmit={submit}>
        <div className="modal-body">
          <div className="form-grid">
            <div className="field full">
              <label htmlFor="registry-name">
                {registry === 'members'
                  ? 'Name'
                  : `${config.singular[0].toUpperCase()}${config.singular.slice(1)} name`}
              </label>
              <input
                id="registry-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={
                  registry === 'locations'
                    ? 'e.g. Kitchen pantry'
                    : registry === 'categories'
                      ? 'e.g. Baking essentials'
                      : registry === 'providers'
                        ? 'e.g. REWE'
                        : 'e.g. Alex'
                }
                maxLength={100}
                required
              />
            </div>
            {hasEmoji && (
              <div className="field">
                <label htmlFor="registry-emoji">Icon</label>
                <input
                  id="registry-emoji"
                  value={emoji}
                  onChange={(e) => setEmoji(e.target.value)}
                  maxLength={8}
                  required
                />
                <small>Choose an emoji that feels right.</small>
              </div>
            )}
            {hasColor && (
              <div className="field">
                <label htmlFor="registry-color">Color</label>
                <input
                  id="registry-color"
                  type="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  required
                />
                <small>A color to recognize at a glance.</small>
              </div>
            )}
            {registry === 'providers' && (
              <div className="field full">
                <label htmlFor="registry-notes">
                  Notes <span style={{ color: '#99a18e', fontWeight: 400 }}>(optional)</span>
                </label>
                <textarea
                  id="registry-notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  maxLength={2000}
                  placeholder="Your usual branch, opening hours or a reminder…"
                />
              </div>
            )}
          </div>
          {error && (
            <p className="error-message" role="alert">
              {error}
            </p>
          )}
        </div>
        <footer className="modal-footer">
          <button type="button" className="btn btn-secondary" onClick={close} disabled={busy}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={busy}>
            <Check size={16} />
            {busy ? 'Saving…' : entry ? 'Save changes' : `Add ${config.singular}`}
          </button>
        </footer>
      </form>
    </Modal>
  );
}

function ConfirmChange({
  title,
  subtitle,
  buttonText,
  onClose,
  onConfirm,
  children,
}: {
  title: string;
  subtitle: string;
  buttonText: string;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  children: React.ReactNode;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const close = useCallback(() => {
    if (!busy) onClose();
  }, [busy, onClose]);
  async function confirm() {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await onConfirm();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title={title} subtitle={subtitle} onClose={close}>
      <div className="modal-body">
        {children}
        {error && (
          <p className="error-message" role="alert">
            {error}
          </p>
        )}
      </div>
      <footer className="modal-footer">
        <button className="btn btn-secondary" onClick={close} disabled={busy}>
          Cancel
        </button>
        <button className="btn btn-danger" onClick={confirm} disabled={busy}>
          <Trash2 size={16} />
          {busy ? 'Saving…' : buttonText}
        </button>
      </footer>
    </Modal>
  );
}
