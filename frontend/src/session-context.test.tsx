import { render, screen } from '@testing-library/react';
import { SessionContext, useSession } from './session-context';
import { describe, it, expect } from 'vitest';
import type { Session } from './types';

const TestComponent = () => {
  const { session } = useSession();
  
  if (!session) return <div>No session</div>;
  
  return (
    <div>
      <div>User: {session.user.fullname}</div>
    </div>
  );
};

describe('SessionContext', () => {
  it('throws an error when useSession is used outside of context', () => {
    // Suppress console.error for the expected throw
    const originalError = console.error;
    console.error = () => {};
    
    expect(() => render(<TestComponent />)).toThrow('useSession must be used inside SessionContext');
    
    console.error = originalError;
  });

  it('provides session when inside context', () => {
    const fakeSession: Session = {
      csrf_token: 'fake',
      provider: 'local',
      user: { username: 'test', fullname: 'Test User', email: '', roles: ["user"], is_admin: false, can_analyze: true, can_moderate: false }
    };

    render(
      <SessionContext.Provider value={{ session: fakeSession, signOut: async () => {} }}>
        <TestComponent />
      </SessionContext.Provider>
    );
    expect(screen.getByText('User: Test User')).toBeInTheDocument();
  });
});
