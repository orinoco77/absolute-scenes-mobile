import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { test, expect, afterEach } from 'vitest';
import SceneEditor from '../SceneEditor.jsx';

afterEach(cleanup);

function makeScene() {
  return { id: 'sc1', title: 'Scene One', content: '<<<<<<< LOCAL\nmine\n=======\ntheirs\n>>>>>>> REMOTE' };
}

test('shows a conflict banner when hasConflict is true', () => {
  render(
    <SceneEditor
      scene={makeScene()}
      chapter={{ id: 'ch1', title: 'Chapter 1' }}
      book={{}}
      onSave={() => {}}
      onBack={() => {}}
      isLoading={false}
      error={null}
      hasConflict={true}
    />
  );

  expect(screen.getByText(/merge conflict/i)).toBeInTheDocument();
});

test('does not show a conflict banner when hasConflict is false', () => {
  render(
    <SceneEditor
      scene={makeScene()}
      chapter={{ id: 'ch1', title: 'Chapter 1' }}
      book={{}}
      onSave={() => {}}
      onBack={() => {}}
      isLoading={false}
      error={null}
      hasConflict={false}
    />
  );

  expect(screen.queryByText(/merge conflict/i)).not.toBeInTheDocument();
});

test('adopts an externally updated scene content when the user has not started editing', () => {
  const { rerender } = render(
    <SceneEditor
      scene={{ id: 'sc1', title: 'S', content: 'original' }}
      chapter={{ id: 'ch1', title: 'C' }}
      book={{}}
      onSave={() => {}}
      onBack={() => {}}
      isLoading={false}
      error={null}
    />
  );

  rerender(
    <SceneEditor
      scene={{ id: 'sc1', title: 'S', content: 'merged remote edit' }}
      chapter={{ id: 'ch1', title: 'C' }}
      book={{}}
      onSave={() => {}}
      onBack={() => {}}
      isLoading={false}
      error={null}
    />
  );

  expect(screen.getByPlaceholderText(/start writing/i)).toHaveValue('merged remote edit');
});

test('does not overwrite an in-progress unsaved edit when the scene updates externally', async () => {
  const { rerender } = render(
    <SceneEditor
      scene={{ id: 'sc1', title: 'S', content: 'original' }}
      chapter={{ id: 'ch1', title: 'C' }}
      book={{}}
      onSave={() => {}}
      onBack={() => {}}
      isLoading={false}
      error={null}
    />
  );

  const textarea = screen.getByPlaceholderText(/start writing/i);
  await userEvent.type(textarea, ' typed');

  rerender(
    <SceneEditor
      scene={{ id: 'sc1', title: 'S', content: 'merged remote edit' }}
      chapter={{ id: 'ch1', title: 'C' }}
      book={{}}
      onSave={() => {}}
      onBack={() => {}}
      isLoading={false}
      error={null}
    />
  );

  expect(textarea).toHaveValue('original typed');
});
