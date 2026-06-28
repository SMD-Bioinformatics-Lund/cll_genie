import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { RuleBuilder } from './RuleBuilder';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Mock matchMedia for MUI
window.matchMedia = window.matchMedia || function() {
    return {
        matches: false,
        addListener: function() {},
        removeListener: function() {}
    };
};

const queryClient = new QueryClient();

describe('RuleBuilder', () => {
  it('renders loading state initially', () => {
    render(
      <QueryClientProvider client={queryClient}>
        <RuleBuilder conditions={[]} onChange={() => {}} />
      </QueryClientProvider>
    );
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });
});
