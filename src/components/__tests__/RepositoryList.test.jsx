import { render, screen } from '@testing-library/react';
import { test, expect } from 'vitest';
import RepositoryList from '../RepositoryList.jsx';

test('renders repo name and description without a filename badge', () => {
  render(
    <RepositoryList
      repositories={[{ fullName: 'alice/novel', name: 'novel', description: 'A novel', defaultBranch: 'main' }]}
      onSelectRepo={() => {}}
      onLogout={() => {}}
      isLoading={false}
      error={null}
    />
  );

  expect(screen.getByText('novel')).toBeInTheDocument();
  expect(screen.getByText('A novel')).toBeInTheDocument();
  expect(screen.queryByText(/\.book/)).not.toBeInTheDocument();
});
