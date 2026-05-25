import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TagInput } from './tag-input';

describe('<TagInput />', () => {
  it('renders existing tags', () => {
    render(<TagInput value={['urgent', 'backend']} onChange={() => {}} />);
    expect(screen.getByText('urgent')).toBeInTheDocument();
    expect(screen.getByText('backend')).toBeInTheDocument();
  });

  it('adds a tag when Enter is pressed', () => {
    const onChange = vi.fn();
    render(<TagInput value={[]} onChange={onChange} />);
    const input = screen.getByRole('textbox');

    fireEvent.change(input, { target: { value: 'frontend' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onChange).toHaveBeenCalledWith(['frontend']);
  });

  it('normalizes tags (lowercase, no spaces, trimmed)', () => {
    const onChange = vi.fn();
    render(<TagInput value={[]} onChange={onChange} />);
    const input = screen.getByRole('textbox');

    fireEvent.change(input, { target: { value: '  Mon Tag  ' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onChange).toHaveBeenCalledWith(['mon-tag']);
  });

  it('rejects duplicate tags silently', () => {
    const onChange = vi.fn();
    render(<TagInput value={['urgent']} onChange={onChange} />);
    const input = screen.getByRole('textbox');

    fireEvent.change(input, { target: { value: 'urgent' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    // No new tag added
    expect(onChange).not.toHaveBeenCalled();
  });

  it('removes a tag when its X button is clicked', () => {
    const onChange = vi.fn();
    render(<TagInput value={['urgent', 'backend']} onChange={onChange} />);

    // next-intl mock echoes the key "tagRemoveAria" for each tag's remove button.
    // Both tags ("urgent", "backend") have an aria-label "tagRemoveAria", so
    // `getAllByLabelText` returns both — we click the first (urgent).
    const removeBtn = screen.getAllByLabelText('tagRemoveAria')[0]!;
    fireEvent.click(removeBtn);

    expect(onChange).toHaveBeenCalledWith(['backend']);
  });

  it('removes the last tag on Backspace when input is empty', () => {
    const onChange = vi.fn();
    render(<TagInput value={['a', 'b', 'c']} onChange={onChange} />);
    const input = screen.getByRole('textbox');

    fireEvent.keyDown(input, { key: 'Backspace' });

    expect(onChange).toHaveBeenCalledWith(['a', 'b']);
  });

  it('respects the maxTags limit', () => {
    const onChange = vi.fn();
    render(<TagInput value={['a', 'b']} onChange={onChange} maxTags={2} />);
    const input = screen.getByRole('textbox');

    fireEvent.change(input, { target: { value: 'c' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onChange).not.toHaveBeenCalled();
    // t('tagMax', { max: 2 }) → key "tagMax" has no {max} token → echoed as-is.
    expect(screen.getByText('tagMax')).toBeInTheDocument();
  });

  it('also adds a tag when comma is pressed', () => {
    const onChange = vi.fn();
    render(<TagInput value={[]} onChange={onChange} />);
    const input = screen.getByRole('textbox');

    fireEvent.change(input, { target: { value: 'foo' } });
    fireEvent.keyDown(input, { key: ',' });

    expect(onChange).toHaveBeenCalledWith(['foo']);
  });

  it('truncates tags longer than 32 characters', () => {
    const onChange = vi.fn();
    render(<TagInput value={[]} onChange={onChange} />);
    const input = screen.getByRole('textbox');

    fireEvent.change(input, { target: { value: 'a'.repeat(50) } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onChange).toHaveBeenCalledWith(['a'.repeat(32)]);
  });
});
