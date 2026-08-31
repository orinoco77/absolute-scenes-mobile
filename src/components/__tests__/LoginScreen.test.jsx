import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, test, expect, afterEach } from 'vitest';
import LoginScreen from '../LoginScreen.jsx';

afterEach(cleanup);

test('shows a manual token entry option alongside the QR scan button', () => {
  render(<LoginScreen onLogin={() => {}} isLoading={false} error={null} />);
  expect(screen.getByText(/paste a token manually/i)).toBeInTheDocument();
});

test('submitting a pasted token calls onLogin with the trimmed value', async () => {
  const onLogin = vi.fn().mockResolvedValue(undefined);
  render(<LoginScreen onLogin={onLogin} isLoading={false} error={null} />);

  await userEvent.click(screen.getByText(/paste a token manually/i));
  await userEvent.type(screen.getByPlaceholderText(/ghp_/i), '  ghp_abc123  ');
  await userEvent.click(screen.getByRole('button', { name: /connect/i }));

  expect(onLogin).toHaveBeenCalledWith('ghp_abc123');
});

test('shows an error if the pasted token is rejected', async () => {
  const onLogin = vi.fn().mockRejectedValue(new Error('Invalid token'));
  render(<LoginScreen onLogin={onLogin} isLoading={false} error={null} />);

  await userEvent.click(screen.getByText(/paste a token manually/i));
  await userEvent.type(screen.getByPlaceholderText(/ghp_/i), 'bad-token');
  await userEvent.click(screen.getByRole('button', { name: /connect/i }));

  expect(await screen.findByText(/Invalid token/i)).toBeInTheDocument();
});

test('the connect button is disabled until a token is entered', async () => {
  render(<LoginScreen onLogin={() => {}} isLoading={false} error={null} />);
  await userEvent.click(screen.getByText(/paste a token manually/i));
  expect(screen.getByRole('button', { name: /connect/i })).toBeDisabled();
});
