import { describe, it, expect } from 'vitest';
import { projectBook, reassembleBook } from '@absolute-scenes/git-sync';

// Books synced from desktop can carry inactive drafts and scene revisions.
// This app doesn't edit them, but its git-sync must keep them: an older
// git-sync writes them into book.json and deletes their files on push.
const bookWithDraftsAndRevisions = () => ({
  title: 'T',
  chapters: [
    {
      id: 'c1',
      title: 'C1',
      scenes: [
        {
          id: 's1',
          title: 'One',
          content: 'active text',
          activeRevision: { id: 'r1', label: 'Revision 1', created: 'x' },
          revisions: [{ id: 'r2', label: 'Alt', created: 'y', content: 'alt text' }]
        }
      ]
    }
  ],
  parts: [],
  illustrations: [],
  activeDraft: { id: 'd1', name: 'Draft 1', created: 'a' },
  drafts: [
    {
      id: 'd2',
      name: 'Draft 2',
      created: 'b',
      parts: [],
      chapters: [
        { id: 'c2', title: 'C1', scenes: [{ id: 's2', title: 'One', content: 'draft two text' }] }
      ]
    }
  ]
});

describe('git-sync drafts and revisions', () => {
  it('stores inactive revision and draft text in their own files', () => {
    const files = projectBook(bookWithDraftsAndRevisions());
    expect(files.get('scenes/s1.rev-r2.md').content).toBe('alt text');
    expect(files.get('scenes/drafts/d2/s2.md').content).toBe('draft two text');
    expect(files.get('book.json').content).not.toMatch(/alt text|draft two text/);
  });

  it('round-trips drafts and revisions losslessly', () => {
    const book = bookWithDraftsAndRevisions();
    const back = reassembleBook(projectBook(book));
    expect(back.chapters).toEqual(book.chapters);
    expect(back.drafts).toEqual(book.drafts);
    expect(back.activeDraft).toEqual(book.activeDraft);
  });
});
