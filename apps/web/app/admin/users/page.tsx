// /admin/users - the user list + role/activation editor.
// Role changes go through PUT /api/users/:id with the ADMIN schema
// (self-update can't touch role - that's the privilege-escalation
// guard; here the admin does it deliberately). Deactivating a user
// instantly invalidates their sessions (authenticate checks isActive).
'use client';

import { useState, useEffect } from 'react';
import { authHttp, errorMessage } from '@/lib/http';
import { useIsMobile } from '@/lib/hooks';
import { ButtonSpinner } from '@/components/Spinner';

interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone?: string | null;
  role: string;
  isActive: boolean;
  isVerified: boolean;
  createdAt: string;
  _count?: { orders: number; reviews: number };
}

const ROLES = [
  { value: 'customer', label: 'Customer', hint: 'Can shop, review and manage their own orders.' },
  { value: 'manager', label: 'Manager', hint: 'Admin panel access for day-to-day store operations.' },
  { value: 'admin', label: 'Admin', hint: 'Full control, including users and settings.' },
];

const roleStyle = (role: string) => {
  const map: Record<string, { bg: string; fg: string }> = {
    admin: { bg: '#fef3c7', fg: '#b45309' },
    manager: { bg: '#ede9fe', fg: '#6d28d9' },
    customer: { bg: '#dbeafe', fg: '#3b82f6' },
  };
  return map[role] || map.customer;
};

export default function AdminUsersPage() {
  const isMobile = useIsMobile();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [loadError, setLoadError] = useState('');
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [editing, setEditing] = useState<User | null>(null);
  const [form, setForm] = useState({ firstName: '', lastName: '', role: 'customer', isActive: true });
  const [saving, setSaving] = useState(false);
  const [modalError, setModalError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const notify = (type: 'success' | 'error', text: string) => {
    setMsg({ type, text });
    if (type === 'success') setTimeout(() => setMsg(null), 4000);
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      const res = await authHttp.get<User[]>('/users');
      setUsers(res.data || []);
      setLoadError('');
    } catch (err) {
      // Never present an empty table as "no users" when the request failed -
      // that reads as data loss.
      setLoadError(errorMessage(err, 'Could not load users.'));
    } finally {
      setLoading(false);
    }
  };

  const openEdit = (u: User) => {
    setEditing(u);
    setForm({
      firstName: u.firstName || '',
      lastName: u.lastName || '',
      role: u.role,
      isActive: u.isActive,
    });
    setModalError('');
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    setSaving(true);
    setModalError('');
    try {
      const res = await authHttp.put<User>(`/users/${editing.id}`, {
        firstName: form.firstName,
        lastName: form.lastName,
        role: form.role,
        isActive: form.isActive,
      });
      // Trust the server's response, not the local form: the API applies its
      // own guard rails and may legitimately return something different.
      const saved = res.data;
      setUsers((list) => list.map((u) => (u.id === saved.id ? { ...u, ...saved } : u)));
      setEditing(null);
      notify('success', `Saved ${saved.firstName} ${saved.lastName}.`);
    } catch (err) {
      // Keep the modal open with the server's real reason (e.g. "last active
      // admin"). Closing it would imply the change was stored.
      setModalError(errorMessage(err, 'Save failed. Nothing was changed.'));
    } finally {
      setSaving(false);
    }
  };

  /** One-click activate/deactivate straight from the row. */
  const toggleActive = async (u: User) => {
    setBusyId(u.id);
    try {
      const res = await authHttp.put<User>(`/users/${u.id}`, { isActive: !u.isActive });
      const saved = res.data;
      setUsers((list) => list.map((x) => (x.id === saved.id ? { ...x, ...saved } : x)));
      notify('success', `${saved.email} ${saved.isActive ? 'activated' : 'deactivated'}.`);
    } catch (err) {
      notify('error', errorMessage(err, 'Could not change activation.'));
    } finally {
      setBusyId(null);
    }
  };

  const filteredUsers = users.filter(
    (u) =>
      u.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.firstName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.lastName?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (loading) {
    return <div style={{ textAlign: 'center', padding: '64px' }}>Loading users...</div>;
  }

  const th: React.CSSProperties = {
    padding: '12px 16px',
    textAlign: 'left',
    fontSize: '12px',
    fontWeight: 600,
    color: '#666',
  };
  const label: React.CSSProperties = {
    display: 'block',
    fontSize: '13px',
    fontWeight: 600,
    marginBottom: '6px',
  };
  const input: React.CSSProperties = {
    width: '100%',
    padding: '9px 11px',
    border: '1px solid #d4d4d4',
    borderRadius: '6px',
    fontSize: '14px',
  };

  return (
    <div>
      {loadError && (
        <div
          style={{
            padding: '16px',
            backgroundColor: '#fef3c7',
            border: '1px solid #f59e0b',
            borderRadius: '8px',
            marginBottom: '24px',
          }}
        >
          <p style={{ fontWeight: 600, color: '#92400e' }}>⚠️ Could not load users</p>
          <p style={{ fontSize: '14px', color: '#92400e' }}>{loadError}</p>
        </div>
      )}

      {msg && (
        <div
          style={{
            padding: '12px 16px',
            borderRadius: '8px',
            marginBottom: '20px',
            fontSize: '14px',
            backgroundColor: msg.type === 'success' ? '#dcfce7' : '#fee2e2',
            color: msg.type === 'success' ? '#166534' : '#991b1b',
          }}
        >
          {msg.text}
        </div>
      )}

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '24px',
        }}
      >
        <div>
          <h2 style={{ fontSize: '20px', fontWeight: 'bold' }}>Users</h2>
          <p style={{ color: '#666', fontSize: '14px' }}>{users.length} total users</p>
        </div>
      </div>

      <div style={{ marginBottom: '24px' }}>
        <input
          type="text"
          placeholder="Search users..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{
            width: '100%',
            padding: '12px 16px',
            border: '1px solid #e5e5e5',
            borderRadius: '6px',
            fontSize: '14px',
            outline: 'none',
          }}
        />
      </div>

      <div
        style={{
          backgroundColor: 'white',
          borderRadius: '8px',
          border: '1px solid #e5e5e5',
          overflowX: 'auto',
        }}
      >
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ backgroundColor: '#f9f9f9', borderBottom: '1px solid #e5e5e5' }}>
              <th style={th}>User</th>
              <th style={th}>Email</th>
              <th style={{ ...th, textAlign: 'center' }}>Role</th>
              <th style={{ ...th, textAlign: 'center' }}>Orders</th>
              <th style={{ ...th, textAlign: 'center' }}>Status</th>
              <th style={th}>Joined</th>
              <th style={{ ...th, textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredUsers.map((user) => {
              const rs = roleStyle(user.role);
              return (
                <tr
                  key={user.id}
                  data-user-row={user.email}
                  style={{ borderBottom: '1px solid #e5e5e5', opacity: user.isActive ? 1 : 0.6 }}
                >
                  <td style={{ padding: '16px' }}>
                    <p style={{ fontWeight: 500 }}>
                      {user.firstName} {user.lastName}
                    </p>
                  </td>
                  <td style={{ padding: '16px', fontSize: '14px' }}>{user.email}</td>
                  <td style={{ padding: '16px', textAlign: 'center' }}>
                    <span
                      style={{
                        padding: '4px 8px',
                        borderRadius: '50px',
                        fontSize: '12px',
                        backgroundColor: rs.bg,
                        color: rs.fg,
                        textTransform: 'capitalize',
                        fontWeight: 600,
                      }}
                    >
                      {user.role}
                    </span>
                  </td>
                  <td style={{ padding: '16px', textAlign: 'center', fontWeight: 500 }}>
                    {user._count?.orders || 0}
                  </td>
                  <td style={{ padding: '16px', textAlign: 'center' }}>
                    <span
                      title={user.isActive ? 'Active' : 'Deactivated'}
                      style={{
                        width: '8px',
                        height: '8px',
                        borderRadius: '50%',
                        backgroundColor: user.isActive ? '#22c55e' : '#ef4444',
                        display: 'inline-block',
                      }}
                    />
                  </td>
                  <td style={{ padding: '16px', fontSize: '14px', color: '#666' }}>
                    {user.createdAt ? new Date(user.createdAt).toLocaleDateString() : 'N/A'}
                  </td>
                  <td style={{ padding: '16px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button
                      onClick={() => openEdit(user)}
                      style={{
                        padding: '7px 14px',
                        border: '1px solid #d4d4d4',
                        borderRadius: '6px',
                        background: '#fff',
                        cursor: 'pointer',
                        fontWeight: 600,
                        fontSize: '13px',
                        marginRight: '8px',
                      }}
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => toggleActive(user)}
                      disabled={busyId === user.id}
                      style={{
                        padding: '7px 14px',
                        border: `1px solid ${user.isActive ? '#fca5a5' : '#86efac'}`,
                        color: user.isActive ? '#b91c1c' : '#15803d',
                        borderRadius: '6px',
                        background: '#fff',
                        cursor: busyId === user.id ? 'default' : 'pointer',
                        fontWeight: 600,
                        fontSize: '13px',
                      }}
                    >
                      {user.isActive ? 'Deactivate' : 'Activate'}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {filteredUsers.length === 0 && (
          <div style={{ padding: '32px', textAlign: 'center', color: '#666' }}>No users found</div>
        )}
      </div>

      {/* Edit modal */}
      {editing && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'center',
            padding: '24px',
            overflowY: 'auto',
            zIndex: 1000,
          }}
          onClick={() => !saving && setEditing(null)}
        >
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={save}
            style={{
              backgroundColor: '#fff',
              borderRadius: '12px',
              padding: '24px',
              width: '100%',
              maxWidth: '520px',
            }}
          >
            <h2 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '4px' }}>Edit user</h2>
            <p style={{ fontSize: '13px', color: '#666', marginBottom: '18px' }}>{editing.email}</p>

            {modalError && (
              <div
                style={{
                  padding: '11px 14px',
                  borderRadius: '8px',
                  marginBottom: '16px',
                  fontSize: '14px',
                  backgroundColor: '#fee2e2',
                  color: '#991b1b',
                }}
              >
                {modalError}
              </div>
            )}

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
                gap: '14px',
              }}
            >
              <div>
                <label style={label} htmlFor="u-first">
                  First name
                </label>
                <input
                  id="u-first"
                  style={input}
                  value={form.firstName}
                  onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                />
              </div>
              <div>
                <label style={label} htmlFor="u-last">
                  Last name
                </label>
                <input
                  id="u-last"
                  style={input}
                  value={form.lastName}
                  onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                />
              </div>
            </div>

            <div style={{ marginTop: '16px' }}>
              <label style={label} htmlFor="u-role">
                Role
              </label>
              <select
                id="u-role"
                style={input}
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value })}
              >
                {ROLES.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
              <p style={{ fontSize: '12px', color: '#888', marginTop: '6px' }}>
                {ROLES.find((r) => r.value === form.role)?.hint}
              </p>
            </div>

            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                marginTop: '18px',
                fontSize: '14px',
                cursor: 'pointer',
              }}
            >
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
              />
              <span>
                <strong>Active</strong>
                <span style={{ display: 'block', fontSize: '12px', color: '#888' }}>
                  Deactivated users cannot sign in.
                </span>
              </span>
            </label>

            <div
              style={{
                display: 'flex',
                gap: '10px',
                justifyContent: 'flex-end',
                marginTop: '24px',
              }}
            >
              <button
                type="button"
                onClick={() => setEditing(null)}
                disabled={saving}
                style={{
                  padding: '10px 18px',
                  border: '1px solid #d4d4d4',
                  borderRadius: '6px',
                  background: '#fff',
                  cursor: 'pointer',
                  fontWeight: 600,
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                style={{
                  padding: '10px 20px',
                  backgroundColor: '#111',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: saving ? 'default' : 'pointer',
                  fontWeight: 700,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                {saving ? (
                  <>
                    <ButtonSpinner /> Saving…
                  </>
                ) : (
                  'Save changes'
                )}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
