'use client';

import { useState, useEffect } from 'react';

interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  isActive: boolean;
  isVerified: boolean;
  createdAt: string;
  _count?: { orders: number; reviews: number };
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [apiConnected, setApiConnected] = useState(false);

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) return;

      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api'}/users`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        const data = await response.json();
        setUsers(data.data || []);
        setApiConnected(true);
      }
    } catch (err) {
      console.log('API not available');
    } finally {
      setLoading(false);
    }
  };

  const filteredUsers = users.filter(u =>
    u.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    u.firstName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    u.lastName?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (loading) {
    return <div style={{ textAlign: 'center', padding: '64px' }}>Loading users...</div>;
  }

  return (
    <div>
      {!apiConnected && (
        <div style={{ padding: '16px', backgroundColor: '#fef3c7', border: '1px solid #f59e0b', borderRadius: '8px', marginBottom: '24px' }}>
          <p style={{ fontWeight: 600, color: '#92400e' }}>⚠️ API Disconnected</p>
          <p style={{ fontSize: '14px', color: '#92400e' }}>Start API to manage users: <code>npm run dev:api</code></p>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
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
          style={{ width: '100%', padding: '12px 16px', border: '1px solid #e5e5e5', borderRadius: '6px', fontSize: '14px', outline: 'none' }}
        />
      </div>

      <div style={{ backgroundColor: 'white', borderRadius: '8px', border: '1px solid #e5e5e5', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ backgroundColor: '#f9f9f9', borderBottom: '1px solid #e5e5e5' }}>
              <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: '#666' }}>User</th>
              <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: '#666' }}>Email</th>
              <th style={{ padding: '12px 16px', textAlign: 'center', fontSize: '12px', fontWeight: 600, color: '#666' }}>Role</th>
              <th style={{ padding: '12px 16px', textAlign: 'center', fontSize: '12px', fontWeight: 600, color: '#666' }}>Orders</th>
              <th style={{ padding: '12px 16px', textAlign: 'center', fontSize: '12px', fontWeight: 600, color: '#666' }}>Status</th>
              <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: '#666' }}>Joined</th>
            </tr>
          </thead>
          <tbody>
            {filteredUsers.map((user) => (
              <tr key={user.id} style={{ borderBottom: '1px solid #e5e5e5' }}>
                <td style={{ padding: '16px' }}>
                  <p style={{ fontWeight: 500 }}>{user.firstName} {user.lastName}</p>
                </td>
                <td style={{ padding: '16px', fontSize: '14px' }}>{user.email}</td>
                <td style={{ padding: '16px', textAlign: 'center' }}>
                  <span style={{ padding: '4px 8px', borderRadius: '50px', fontSize: '12px', backgroundColor: user.role === 'admin' ? '#fef3c7' : '#dbeafe', color: user.role === 'admin' ? '#f59e0b' : '#3b82f6', textTransform: 'capitalize' }}>
                    {user.role}
                  </span>
                </td>
                <td style={{ padding: '16px', textAlign: 'center', fontWeight: 500 }}>{user._count?.orders || 0}</td>
                <td style={{ padding: '16px', textAlign: 'center' }}>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: user.isActive ? '#22c55e' : '#ef4444', display: 'inline-block' }} />
                </td>
                <td style={{ padding: '16px', fontSize: '14px', color: '#666' }}>
                  {user.createdAt ? new Date(user.createdAt).toLocaleDateString() : 'N/A'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {filteredUsers.length === 0 && (
          <div style={{ padding: '32px', textAlign: 'center', color: '#666' }}>No users found</div>
        )}
      </div>
    </div>
  );
}
