export function resolveCommitAuthor(book, gitHubService) {
  const userInfo = gitHubService.getUserInfo() ?? {};
  const name =
    book?.github?.collaboration?.currentAuthor ||
    userInfo.login ||
    'Unknown Author';
  const email = userInfo.email || `${userInfo.login}@users.noreply.github.com`;
  return { name, email };
}
