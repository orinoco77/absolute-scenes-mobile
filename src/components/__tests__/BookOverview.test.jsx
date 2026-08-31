import { render, screen, cleanup } from '@testing-library/react';
import { test, expect, afterEach } from 'vitest';
import BookOverview from '../BookOverview.jsx';

afterEach(cleanup);

function makeBook() {
  return {
    title: 'My Book',
    author: 'A. Writer',
    chapters: [
      {
        id: 'ch1',
        title: 'Chapter 1',
        scenes: [
          { id: 'sc1', title: 'Scene One', content: 'hello world' },
          { id: 'sc2', title: 'Scene Two', content: 'more words here' }
        ]
      }
    ]
  };
}

test('shows a conflict badge only on scenes listed in conflictSceneIds', () => {
  render(
    <BookOverview
      book={makeBook()}
      onSelectScene={() => {}}
      onAddChapter={() => {}}
      onAddScene={() => {}}
      onBack={() => {}}
      isLoading={false}
      error={null}
      conflictSceneIds={['sc2']}
    />
  );

  expect(screen.getByText('Scene One').closest('button')).not.toHaveTextContent('⚠');
  expect(screen.getByText('Scene Two').closest('button')).toHaveTextContent('⚠');
});

test('renders the sync status text when provided', () => {
  render(
    <BookOverview
      book={makeBook()}
      onSelectScene={() => {}}
      onAddChapter={() => {}}
      onAddScene={() => {}}
      onBack={() => {}}
      isLoading={false}
      error={null}
      conflictSceneIds={[]}
      syncStatusText="Synced 2m ago"
    />
  );

  expect(screen.getByText('Synced 2m ago')).toBeInTheDocument();
});
