import { useCallback, useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import {
  House,
  LayoutDashboard,
  Package,
  ShoppingBasket,
  CalendarDays,
  History,
  Settings as SettingsIcon,
  ChevronRight,
  ChevronsUpDown,
  Search,
  Leaf,
  ArrowRight,
  Menu,
  X,
  Check,
  AlertCircle,
  Heart,
  Copy,
  Sparkles,
} from 'lucide-react';
import { api, setActiveMemberId } from './api';
import type { HouseholdState, InventoryItem, Page, ReleaseInfo } from './types';
import Overview from './pages/Overview';
import Inventory from './pages/Inventory';
import Shopping, { CreateListModal } from './pages/Shopping';
import Planner from './pages/Planner';
import Activity from './pages/Activity';
import Settings from './pages/Settings';
import { AddItemModal, StockActionModal } from './components/InventoryDialogs';
import MemberAvatar from './components/MemberAvatar';
import './shell.css';

const navigation: { id: Page; label: string; icon: typeof House }[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'inventory', label: 'My inventory', icon: Package },
  { id: 'shopping', label: 'Shopping lists', icon: ShoppingBasket },
  { id: 'planner', label: 'Shopping planner', icon: CalendarDays },
  { id: 'activity', label: 'Kitchen activity', icon: History },
];
const readPage = (): Page => {
  const p = location.pathname.slice(1);
  return ['inventory', 'shopping', 'planner', 'activity', 'settings'].includes(p)
    ? (p as Page)
    : 'overview';
};
type Toast = { id: number; message: string; kind: 'success' | 'error' };
let releaseInfoRequest: Promise<ReleaseInfo> | undefined;

export default function App() {
  const [state, setState] = useState<HouseholdState | null>(null);
  const [page, setPage] = useState<Page>(readPage);
  const [error, setError] = useState('');
  const [memberId, setMemberId] = useState(() => localStorage.getItem('hearth-member') || '');
  const [mobileMenu, setMobileMenu] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [useItem, setUseItem] = useState<InventoryItem | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [search, setSearch] = useState('');
  const [inventorySearch, setInventorySearch] = useState('');
  const [releaseInfo, setReleaseInfo] = useState<ReleaseInfo | null>(null);
  const [releaseChecked, setReleaseChecked] = useState(false);
  const notify = useCallback((message: string, kind: 'success' | 'error' = 'success') => {
    const id = Date.now() + Math.random();
    setToasts((items) => [...items, { id, message, kind }]);
    window.setTimeout(() => setToasts((items) => items.filter((item) => item.id !== id)), 5000);
  }, []);
  const refresh = useCallback(async () => {
    const data = await api<HouseholdState>('/state');
    setState(data);
    setError('');
  }, []);
  useEffect(() => {
    let mounted = true;
    releaseInfoRequest ??= api<ReleaseInfo>('/version');
    void releaseInfoRequest
      .then((data) => {
        if (
          mounted &&
          typeof data.version === 'string' &&
          data.version.trim() &&
          data.version.length <= 64 &&
          (data.environment === 'local' || data.environment === 'production')
        ) {
          setReleaseInfo({
            version: data.version,
            environment: data.environment,
            commit:
              typeof data.commit === 'string' && /^[a-f0-9]{40}$/i.test(data.commit)
                ? data.commit
                : null,
          });
        }
      })
      .catch(() => {})
      .finally(() => {
        if (mounted) setReleaseChecked(true);
      });
    return () => {
      mounted = false;
    };
  }, []);
  useEffect(() => {
    void refresh().catch((e) => setError((e as Error).message));
    const onFocus = () => {
      void refresh().catch(() => {});
    };
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') onFocus();
    }, 15000);
    window.addEventListener('focus', onFocus);
    const onPop = () => {
      setPage(readPage());
      setMobileMenu(false);
    };
    window.addEventListener('popstate', onPop);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('popstate', onPop);
    };
  }, [refresh]);
  useEffect(() => {
    if (state && !state.members.some((m) => m.id === memberId)) {
      const id = state.members[0]?.id || '';
      setMemberId(id);
      setActiveMemberId(id);
      localStorage.setItem('hearth-member', id);
    } else if (memberId) {
      setActiveMemberId(memberId);
      localStorage.setItem('hearth-member', memberId);
    }
  }, [state, memberId]);
  const navigate = useCallback((newPage: Page) => {
    setPage(newPage);
    setMobileMenu(false);
    if (newPage === 'inventory') setInventorySearch('');
    history.pushState({}, '', newPage === 'overview' ? '/' : `/${newPage}`);
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, []);
  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    navigate('inventory');
    setInventorySearch(search.trim());
    setSearch('');
  };
  const activeMember = state?.members.find((m) => m.id === memberId);
  const selectMember = (id: string) => {
    setActiveMemberId(id);
    localStorage.setItem('hearth-member', id);
    setMemberId(id);
  };
  const currentPage = navigation.find((n) => n.id === page)?.label || 'Household settings';
  const sharedProps = state ? { state, refresh, notify, memberId } : null;
  const releaseEnvironment = releaseInfo?.environment === 'production' ? 'Production' : 'Local';
  const releaseLabel = releaseInfo
    ? `${releaseEnvironment}, version ${releaseInfo.version}${releaseInfo.commit ? `, commit ${releaseInfo.commit}` : ''}`
    : '';
  const canCopyCommit = !!(
    releaseInfo?.commit &&
    window.isSecureContext &&
    navigator.clipboard?.writeText
  );
  async function copyCommit() {
    if (!releaseInfo?.commit || !canCopyCommit) return;
    try {
      await navigator.clipboard.writeText(releaseInfo.commit);
      notify('Running commit copied.');
    } catch {
      notify('Could not copy the commit. Please try again.', 'error');
    }
  }
  return (
    <div className="app-shell">
      {mobileMenu && (
        <button
          className="mobile-sidebar-overlay"
          onClick={() => setMobileMenu(false)}
          aria-label="Close navigation"
        />
      )}
      <aside className={`sidebar ${mobileMenu ? 'open' : ''}`}>
        <button className="brand" onClick={() => navigate('overview')} aria-label="Hearth home">
          <span className="brand-mark">
            <House size={36} strokeWidth={1.8} />
            <span className="brand-heart" aria-hidden="true">
              ♡
            </span>
          </span>
          <span>
            <span className="brand-word">
              hearth<span style={{ color: '#e9703d' }}>.</span>
            </span>
            <span className="brand-tagline" style={{ display: 'block' }}>
              A little more home.
            </span>
          </span>
        </button>
        <div className="sidebar-divider" />
        <div className="sidebar-label">YOUR LITTLE CORNER</div>
        <nav className="side-nav" aria-label="Main navigation">
          {navigation.map(({ id, label, icon: Icon }) => (
            <button
              className={`nav-link ${page === id ? 'active' : ''}`}
              key={id}
              data-page={id}
              onClick={() => navigate(id)}
              aria-current={page === id ? 'page' : undefined}
            >
              <span className="nav-icon-bubble">
                <Icon size={19} />
              </span>
              <span>{label}</span>
              {id === 'shopping' &&
                !!state?.lists.filter((l) => l.status !== 'completed').length && (
                  <span className="nav-count">
                    {state.lists.filter((l) => l.status !== 'completed').length}
                  </span>
                )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <Leaf size={20} />
            <span className="sidebar-note-sparkle" aria-hidden="true">
              ✧
            </span>
            <h4>Little habits. Lovely home.</h4>
            <p>
              A little peek before you shop
              <br />
              leaves room for good things.
            </p>
            <button onClick={() => navigate('inventory')}>
              See what’s at home <ArrowRight size={12} />
            </button>
          </div>
          <button
            className={`nav-link settings-nav ${page === 'settings' ? 'active' : ''}`}
            onClick={() => navigate('settings')}
            aria-current={page === 'settings' ? 'page' : undefined}
          >
            <span className="nav-icon-bubble">
              <SettingsIcon size={18} />
            </span>
            Household settings
          </button>
          <button className="household-profile" onClick={() => navigate('settings')}>
            <span className="sidebar-person-portrait">
              <MemberAvatar member={activeMember} size="sm" />
            </span>
            <span>
              <strong>{state?.household.name || 'My household'}</strong>
              <small>
                {activeMember ? `Using as ${activeMember.name}` : 'Your home, your rhythm'}
              </small>
            </span>
            <ChevronsUpDown size={13} />
          </button>
        </div>
      </aside>
      <main className="app-main">
        <header className="topbar">
          <button
            className="mobile-menu-button"
            aria-label="Open navigation"
            onClick={() => setMobileMenu(true)}
          >
            <Menu size={20} />
          </button>
          <div className="breadcrumbs">
            <House size={13} />
            <span>{state?.household.name || 'Our household'}</span>
            <ChevronRight size={11} />
            <span>{currentPage}</span>
          </div>
          <div className="topbar-right">
            <form className="global-search" onSubmit={submitSearch}>
              <Search size={13} />
              <input
                placeholder="Find something at home…"
                aria-label="Find a grocery item"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <kbd>↵</kbd>
            </form>
            <div className="top-divider" />
            <div
              className="member-switch profile-mini-switch"
              title={
                activeMember ? `Using as ${activeMember.name}` : 'Choose your household profile'
              }
            >
              <span className="profile-mini-portrait">
                <MemberAvatar member={activeMember} size="sm" />
              </span>
              <div className="profile-mini-copy">
                <label htmlFor="active-household-profile">Using as</label>
                <select
                  id="active-household-profile"
                  value={memberId}
                  onChange={(e) => selectMember(e.target.value)}
                  aria-label="Active household member"
                >
                  {state?.members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </header>
        {state && activeMember && (
          <section
            className="household-presence"
            aria-label="Active household profile"
            style={{ '--profile-color': activeMember.color } as CSSProperties}
          >
            <div className="presence-person">
              <span className="presence-portrait">
                <MemberAvatar member={activeMember} size="lg" />
                <span className="presence-avatar-heart" aria-hidden="true">
                  ♡
                </span>
              </span>
              <div className="presence-copy">
                <span className="presence-kicker">
                  <Heart size={11} /> OUR HOME, TOGETHER
                </span>
                <h2>
                  <span>Using as</span> <strong>{activeMember.name}</strong>
                </h2>
                <p>Your grocery updates will carry your name.</p>
              </div>
            </div>
            <div className="presence-switcher">
              <div className="presence-switcher-label">
                <Sparkles size={12} /> Who’s using Hearth?
              </div>
              <div
                className="presence-profile-options"
                role="group"
                aria-label="Choose active household profile"
              >
                {state.members.map((member) => (
                  <button
                    key={member.id}
                    type="button"
                    className={`presence-profile-button ${memberId === member.id ? 'selected' : ''}`}
                    style={{ '--member-color': member.color } as CSSProperties}
                    aria-label={`Use profile ${member.name}`}
                    aria-pressed={memberId === member.id}
                    title={`Use profile ${member.name}`}
                    onClick={() => selectMember(member.id)}
                  >
                    <span className="presence-choice-portrait">
                      <MemberAvatar member={member} size="sm" />
                    </span>
                    <span className="presence-choice-name">{member.name}</span>
                    {memberId === member.id && (
                      <span className="presence-choice-check">
                        <Check size={13} />
                      </span>
                    )}
                  </button>
                ))}
              </div>
              <p className="presence-trip-note">
                Trip assignments stay as planned when you switch.
              </p>
            </div>
          </section>
        )}
        <div className="content-area">
          {!state ? (
            error ? (
              <div className="empty-state">
                <AlertCircle size={32} />
                <h3>Let’s reconnect to your kitchen</h3>
                <p>{error}</p>
                <button
                  className="btn btn-primary"
                  onClick={() => void refresh().catch((e) => setError((e as Error).message))}
                >
                  Try again
                </button>
              </div>
            ) : (
              <div className="loading-screen">
                <div className="loading-spinner" />
                <span>Making a little room for home…</span>
              </div>
            )
          ) : (
            sharedProps && (
              <>
                {page === 'overview' && (
                  <Overview
                    {...sharedProps}
                    navigate={navigate}
                    onAddItem={() => setShowAdd(true)}
                    onUseItem={setUseItem}
                    onCreateList={() => setShowCreate(true)}
                  />
                )}{' '}
                {page === 'inventory' && (
                  <Inventory {...sharedProps} initialSearch={inventorySearch} />
                )}{' '}
                {page === 'shopping' && <Shopping {...sharedProps} />}{' '}
                {page === 'planner' && <Planner {...sharedProps} />}{' '}
                {page === 'activity' && <Activity {...sharedProps} />}{' '}
                {page === 'settings' && <Settings {...sharedProps} />}
                <footer className="app-footer">
                  <span>
                    <Heart size={10} /> A little care for your everyday.
                  </span>
                  {releaseInfo ? (
                    <div
                      className={`release-badge ${releaseInfo.environment}`}
                      role="group"
                      aria-label={releaseLabel}
                      title={releaseLabel}
                    >
                      <span className="release-environment">
                        <span className="release-dot" aria-hidden="true" />
                        {releaseEnvironment}
                      </span>
                      <span className="release-separator" aria-hidden="true">
                        ·
                      </span>
                      <span className="release-version">v{releaseInfo.version}</span>
                      {releaseInfo.commit && (
                        <>
                          <span className="release-separator" aria-hidden="true">
                            ·
                          </span>
                          <code>{releaseInfo.commit.slice(0, 7)}</code>
                          {canCopyCommit && (
                            <button
                              className="release-copy"
                              onClick={() => void copyCommit()}
                              aria-label={`Copy running commit ${releaseInfo.commit}`}
                              title={`Copy running commit ${releaseInfo.commit}`}
                            >
                              <Copy size={10} />
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  ) : (
                    <span className="release-unavailable">
                      {releaseChecked ? 'Version unavailable' : 'Checking version…'}
                    </span>
                  )}
                </footer>
              </>
            )
          )}
        </div>
      </main>
      <div className="toast-stack" aria-live="polite">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role={toast.kind === 'error' ? 'alert' : 'status'}
            className={`toast ${toast.kind}`}
          >
            {toast.kind === 'error' ? <AlertCircle size={16} /> : <Check size={16} />}
            <span>{toast.message}</span>
            <button
              aria-label="Dismiss notification"
              onClick={() => setToasts((items) => items.filter((item) => item.id !== toast.id))}
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
      {state && showAdd && (
        <AddItemModal
          state={state}
          onClose={() => setShowAdd(false)}
          onSaved={refresh}
          notify={notify}
        />
      )}{' '}
      {state && useItem && (
        <StockActionModal
          state={state}
          item={useItem}
          kind="consume"
          onClose={() => setUseItem(null)}
          onSaved={refresh}
          notify={notify}
        />
      )}{' '}
      {state && showCreate && (
        <CreateListModal
          state={state}
          memberId={memberId}
          onClose={() => setShowCreate(false)}
          onCreated={async () => {
            await refresh();
            notify('Your shopping trip is ready');
            navigate('shopping');
          }}
        />
      )}
    </div>
  );
}
