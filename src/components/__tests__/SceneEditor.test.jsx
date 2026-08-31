import { render, screen, cleanup } from '@testing-library/react';
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
