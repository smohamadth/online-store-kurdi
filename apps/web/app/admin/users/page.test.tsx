/**
 * AdminUsersPage — the user list + role/activation editor.
 *
 * Verifies the role badge + status dot render, the edit modal lets an admin
 * change role/active state and POSTs it to PUT /users/:id, and that a
 * failed role change keeps the modal open with the server's reason (the
 * "last active admin" guard path).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import AdminUsersPage from './page';

vi.mock('@/lib/hooks', () => ({ useIsMobile: () => false }));

const user = {
  id: 'u1',
  email: 'sam@example.com',
  firstName: 'Sam',
  lastName: 'Karim',
  role: 'manager',
  isActive: true,
  isVerified: true,
  createdAt: '2024-03-01T00:00:00Z',
  _count: { orders: 3, reviews: 1 },
};

function okJson(data: any) {
  return Promise.resolve({
    ok: true,
    status: 200,
    json: async () => ({ status: 'success', data }),
  } as any);
}

describe('AdminUsersPage', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('token', 'test-token');
    const fetchMock = vi.fn(async (url: string, opts?: any) => {
      const u = String(url);
      if (u.includes('/users') && (!opts || !opts.method || opts.method === 'GET')) {
        return okJson([user]);
      }
      if (u.includes('/users/u1') && opts?.method === 'PUT') {
        const body = JSON.parse(opts.body);
        return okJson({ ...user, ...body });
      }
      return okJson([]);
    });
    (global.fetch as any) = fetchMock;
  });

  it('renders users with their role badge and order count', async () => {
    render(<AdminUsersPage />);
    await waitFor(() => expect(screen.getByText('Sam Karim')).toBeTruthy());
    expect(screen.getByText('sam@example.com')).toBeTruthy();
    expect(screen.getByText('manager')).toBeTruthy();
    expect(screen.getByText('3')).toBeTruthy(); // orders count
  });

  it('opens the edit modal prefilled and saves a role change to the API', async () => {
    render(<AdminUsersPage />);
    await waitFor(() => expect(screen.getByText('Sam Karim')).toBeTruthy());

    screen.getByText('Edit').click();
    await waitFor(() => expect(screen.getByText('Edit user')).toBeTruthy());

    // Change the role dropdown to admin.
    const roleSelect = screen.getByLabelText('Role') as HTMLSelectElement;
    fireEvent.change(roleSelect, { target: { value: 'admin' } });
    expect(roleSelect.value).toBe('admin');

    screen.getByText('Save changes').click();
    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/users/u1'),
        expect.objectContaining({ method: 'PUT' })
      )
    );
    await waitFor(() => expect(screen.getByText('Saved Sam Karim.')).toBeTruthy());
  });

  it('keeps the modal open and shows the server reason when a save is rejected', async () => {
    (global.fetch as any) = vi.fn(async (url: string, opts?: any) => {
      const u = String(url);
      if (u.includes('/users') && (!opts?.method || opts.method === 'GET')) return okJson([user]);
      if (u.includes('/users/u1') && opts?.method === 'PUT') {
        return Promise.resolve({
          ok: false,
          status: 400,
          json: async () => ({ status: 'error', message: 'Cannot deactivate the last active admin' }),
        } as any);
      }
      return okJson([]);
    });

    render(<AdminUsersPage />);
    await waitFor(() => expect(screen.getByText('Sam Karim')).toBeTruthy());
    screen.getByText('Edit').click();
    await waitFor(() => expect(screen.getByText('Edit user')).toBeTruthy());
    screen.getByText('Save changes').click();

    await waitFor(() =>
      expect(screen.getByText('Cannot deactivate the last active admin')).toBeTruthy()
    );
    // The modal is still open with the rejection message.
    expect(screen.getByText('Edit user')).toBeTruthy();
  });

  it('toggles a user active/inactive from the row', async () => {
    const fetchMock = vi.fn(async (url: string, opts?: any) => {
      const u = String(url);
      if (u.includes('/users') && (!opts?.method || opts.method === 'GET')) return okJson([user]);
      if (u.includes('/users/u1') && opts?.method === 'PUT') {
        return okJson({ ...user, isActive: !user.isActive });
      }
      return okJson([]);
    });
    (global.fetch as any) = fetchMock;

    render(<AdminUsersPage />);
    await waitFor(() => expect(screen.getByText('Sam Karim')).toBeTruthy());

    const deactivate = screen.getByText('Deactivate');
    deactivate.click();
    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/users/u1'),
        expect.objectContaining({ method: 'PUT', body: expect.stringContaining('"isActive":false') })
      )
    );
  });
});
