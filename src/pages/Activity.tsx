import { useMemo, useState } from 'react';
import { History, Search, PackagePlus, Utensils, Leaf, Download } from 'lucide-react';
import { formatQuantity } from '../api';
import type { PageProps, Activity as ActivityType } from '../types';
import MemberAvatar from '../components/MemberAvatar';
import '../household-playful.css';
const descriptions: Record<ActivityType['action'], string> = {
  added: 'Checked in',
  consumed: 'Used',
  discarded: 'Discarded',
  adjusted: 'Adjusted',
  purchased: 'Purchased',
};
export default function Activity({ state, notify }: PageProps) {
  const [search, setSearch] = useState('');
  const [action, setAction] = useState('all');
  const [member, setMember] = useState('all');
  const filtered = useMemo(
    () =>
      state.activity.filter(
        (a) =>
          (action === 'all' || a.action === action) &&
          (member === 'all' || a.memberName === member) &&
          `${a.productName} ${a.memberName} ${a.locationName}`
            .toLowerCase()
            .includes(search.toLowerCase()),
      ),
    [state.activity, search, action, member],
  );
  function download() {
    const rows = [
      ['Date', 'Item', 'Action', 'Quantity', 'Unit', 'Member', 'Location'],
      ...filtered.map((a) => [
        new Date(a.createdAt).toLocaleString('en-GB', { timeZone: 'Europe/Berlin' }),
        a.productName,
        descriptions[a.action],
        String(a.quantity),
        a.unit,
        a.memberName,
        a.locationName,
      ]),
    ];
    const safe = (value: string) => {
      const clean = /^[=+\-@]/.test(value) ? `'${value}` : value;
      return '"' + clean.replace(/"/g, '""') + '"';
    };
    const blob = new Blob([rows.map((row) => row.map(safe).join(',')).join('\r\n')], {
      type: 'text/csv;charset=utf-8',
    });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'hearth-activity.csv';
    link.click();
    URL.revokeObjectURL(link.href);
    notify('Activity exported');
  }
  return (
    <div className="activity-page page-enter">
      <div className="page-heading household-playful-heading activity-heading">
        <div>
          <div className="eyebrow date-eyebrow">THE LITTLE EVERYDAY THINGS</div>
          <h1>
            Your kitchen, in motion<span className="greeting-dot">.</span>
          </h1>
          <p>Everything that came in, was enjoyed, or left your home.</p>
        </div>
        <button className="btn btn-secondary" onClick={download} disabled={!filtered.length}>
          <Download size={16} />
          Export activity
        </button>
        <div className="household-heading-friends" aria-hidden="true">
          <span className="household-friend-orbit" />
          <span className="household-friend first">🥕</span>
          <span className="household-friend second">🍋</span>
          <span className="household-friend-note">little moments, remembered.</span>
        </div>
      </div>
      <div className="activity-summary">
        <div className="card">
          <span className="icon-tile green">
            <PackagePlus size={20} />
          </span>
          <div>
            <strong>
              {
                state.activity.filter((a) => a.action === 'added' || a.action === 'purchased')
                  .length
              }
            </strong>
            <small>Check-ins recorded</small>
          </div>
        </div>
        <div className="card">
          <span className="icon-tile peach">
            <Utensils size={20} />
          </span>
          <div>
            <strong>{state.activity.filter((a) => a.action === 'consumed').length}</strong>
            <small>Items enjoyed</small>
          </div>
        </div>
        <div className="card">
          <span className="icon-tile amber">
            <Leaf size={20} />
          </span>
          <div>
            <strong>{state.activity.filter((a) => a.action === 'discarded').length}</strong>
            <small>Discarded entries</small>
          </div>
        </div>
      </div>
      <div className="activity-controls">
        <label className="search-box">
          <Search size={15} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search kitchen activity…"
            aria-label="Search kitchen activity"
          />
        </label>
        <select
          className="filter-select"
          aria-label="Filter action"
          value={action}
          onChange={(e) => setAction(e.target.value)}
        >
          <option value="all">All actions</option>
          {Object.entries(descriptions).map(([key, name]) => (
            <option key={key} value={key}>
              {name}
            </option>
          ))}
        </select>
        <select
          className="filter-select"
          aria-label="Filter household member"
          value={member}
          onChange={(e) => setMember(e.target.value)}
        >
          <option value="all">Everyone</option>
          {[...new Set(state.activity.map((a) => a.memberName))].map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
        <span className="activity-count">
          {filtered.length} {filtered.length === 1 ? 'entry' : 'entries'}
        </span>
      </div>
      {filtered.length ? (
        <div className="card activity-table-card">
          <table className="activity-table">
            <thead>
              <tr>
                <th>Grocery item</th>
                <th>What happened</th>
                <th>Quantity</th>
                <th>Location</th>
                <th>Who</th>
                <th>When</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((a) => (
                <tr key={a.id}>
                  <td data-label="Grocery item">
                    <div className="activity-item">
                      <span>{a.emoji}</span>
                      {a.productName}
                    </div>
                  </td>
                  <td data-label="What happened">
                    <span
                      className={`badge ${a.action === 'consumed' ? 'green' : a.action === 'discarded' ? 'red' : a.action === 'adjusted' ? 'amber' : 'neutral'}`}
                    >
                      {descriptions[a.action]}
                    </span>
                  </td>
                  <td data-label="Quantity">
                    {formatQuantity(a.quantity)} {a.unit}
                  </td>
                  <td data-label="Location">{a.locationName || '—'}</td>
                  <td data-label="Who">
                    <span className="activity-person">
                      <MemberAvatar
                        member={
                          state.members.find((member) => member.name === a.memberName) || {
                            id: 'history',
                            name: a.memberName,
                            color: '#956c81',
                          }
                        }
                        size="sm"
                      />
                      <strong>{a.memberName}</strong>
                    </span>
                  </td>
                  <td data-label="When">
                    <span className="activity-time">
                      {new Date(a.createdAt).toLocaleDateString('en-GB', {
                        timeZone: 'Europe/Berlin',
                        day: 'numeric',
                        month: 'short',
                      })}
                      <br />
                      {new Date(a.createdAt).toLocaleTimeString('en-GB', {
                        timeZone: 'Europe/Berlin',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="card empty-state">
          <History size={35} />
          <h3>{state.activity.length ? 'No matching activity' : 'Your story starts here'}</h3>
          <p>
            {state.activity.length
              ? 'Try another filter to find what you’re looking for.'
              : 'Check in or use an item and its story will appear here.'}
          </p>
        </div>
      )}
      <p className="activity-footnote">
        Showing the latest 300 movements. Your full history is included in the household export in
        Settings.
      </p>
    </div>
  );
}
