import { test, expect } from 'vitest';
import { resolveCommitAuthor } from '../commitAuthor.js';

test('prefers the book-level collaboration display name over the GitHub login', () => {
  const book = { github: { collaboration: { currentAuthor: 'Alice Writer' } } };
  const gitHubService = { getUserInfo: () => ({ login: 'alice', email: 'alice@example.com' }) };
  expect(resolveCommitAuthor(book, gitHubService)).toEqual({
    name: 'Alice Writer',
    email: 'alice@example.com'
  });
});

test('falls back to the GitHub login when no collaboration display name is set', () => {
  const book = { github: {} };
  const gitHubService = { getUserInfo: () => ({ login: 'alice', email: null }) };
  expect(resolveCommitAuthor(book, gitHubService)).toEqual({
    name: 'alice',
    email: 'alice@users.noreply.github.com'
  });
});

test('falls back to "Unknown Author" when there is no login either', () => {
  const book = { github: {} };
  const gitHubService = { getUserInfo: () => ({}) };
  const result = resolveCommitAuthor(book, gitHubService);
  expect(result.name).toBe('Unknown Author');
});

test('handles a missing book.github block entirely', () => {
  const gitHubService = { getUserInfo: () => ({ login: 'alice', email: 'alice@example.com' }) };
  expect(resolveCommitAuthor({}, gitHubService)).toEqual({
    name: 'alice',
    email: 'alice@example.com'
  });
});
