import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { SamplePage } from './SamplePage';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';

// Mock matchMedia for MUI
window.matchMedia = window.matchMedia || function() {
    return {
        matches: false,
        addListener: function() {},
        removeListener: function() {}
    };
};

const queryClient = new QueryClient();

describe('SamplePage', () => {
  it('renders loading skeleton initially', () => {
    render(
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
            <SamplePage />
        </BrowserRouter>
      </QueryClientProvider>
    );
    expect(screen.getByTestId('sample-page-container')).toBeInTheDocument();
  });
});
