import { StaffErrorCode, endsSessions, staffChangeRefusal } from './staff-rules.js';

const owner = { id: 'owner-1', role: 'owner' as const, disabled: false };
const kitchen = { id: 'kitchen-1', role: 'kitchen' as const, disabled: false };

describe('staffChangeRefusal', () => {
  it.each([
    ['disable', { disabled: true }],
    ['demote', { role: 'cashier' as const }],
    ['reset the password of', { password: 'mat-khau-moi-123' }],
  ])('refuses when an owner tries to %s their own account', (_label, change) => {
    expect(staffChangeRefusal('owner-1', owner, change, 2)).toBe(StaffErrorCode.CannotChangeSelf);
  });

  it('lets an owner rename themselves', () => {
    expect(staffChangeRefusal('owner-1', owner, { displayName: 'Chị Lan' }, 1)).toBeNull();
  });

  it('refuses to disable or demote the last active owner', () => {
    expect(staffChangeRefusal('other', owner, { disabled: true }, 1)).toBe(
      StaffErrorCode.LastOwner,
    );
    expect(staffChangeRefusal('other', owner, { role: 'waiter' }, 1)).toBe(
      StaffErrorCode.LastOwner,
    );
  });

  it('lets one of two active owners disable or demote the other', () => {
    expect(staffChangeRefusal('other', owner, { disabled: true }, 2)).toBeNull();
    expect(staffChangeRefusal('other', owner, { role: 'waiter' }, 2)).toBeNull();
  });

  it('does not count a change that keeps the owner an owner', () => {
    expect(staffChangeRefusal('other', owner, { role: 'owner' }, 1)).toBeNull();
    expect(staffChangeRefusal('other', owner, { disabled: false }, 1)).toBeNull();
  });

  it('allows re-enabling or changing a disabled owner (they are not an active owner)', () => {
    const disabledOwner = { ...owner, disabled: true };
    expect(staffChangeRefusal('other', disabledOwner, { role: 'kitchen' }, 1)).toBeNull();
  });

  it('allows every change to a non-owner', () => {
    expect(
      staffChangeRefusal('owner-1', kitchen, { disabled: true, role: 'waiter', password: 'x' }, 1),
    ).toBeNull();
  });
});

describe('endsSessions', () => {
  it('ends sessions on disable and on a new password only', () => {
    expect(endsSessions({ disabled: true })).toBe(true);
    expect(endsSessions({ password: 'mat-khau-moi-123' })).toBe(true);
    expect(endsSessions({ disabled: false })).toBe(false);
    expect(endsSessions({ role: 'cashier' })).toBe(false);
    expect(endsSessions({ displayName: 'An' })).toBe(false);
  });
});
