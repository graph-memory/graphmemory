import { mkdtempSync, rmSync, existsSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  sanitizeEntityId,
  sanitizeFilename,
  writeAttachment,
  deleteAttachment,
  getAttachmentPath,
} from '@/lib/file-mirror';

describe('sanitizeEntityId', () => {
  it('returns basename of normal ID', () => {
    expect(sanitizeEntityId('my-note')).toBe('my-note');
  });

  it('strips directory components', () => {
    expect(sanitizeEntityId('../../etc/passwd')).toBe('passwd');
  });

  it('strips backslash directory components', () => {
    expect(sanitizeEntityId('..\\..\\etc\\passwd')).toBe('passwd');
  });

  it('strips null bytes', () => {
    expect(sanitizeEntityId('note\0id')).toBe('noteid');
  });

  it('returns empty for pure traversal: ".."', () => {
    expect(sanitizeEntityId('..')).toBe('');
  });

  it('returns empty for pure traversal: "."', () => {
    expect(sanitizeEntityId('.')).toBe('');
  });

  it('trims whitespace', () => {
    expect(sanitizeEntityId('  note  ')).toBe('note');
  });

  it('handles empty string', () => {
    expect(sanitizeEntityId('')).toBe('');
  });

  it('handles unicode', () => {
    expect(sanitizeEntityId('заметка-тест')).toBe('заметка-тест');
  });
});

describe('sanitizeFilename', () => {
  it('returns basename of normal filename', () => {
    expect(sanitizeFilename('document.pdf')).toBe('document.pdf');
  });

  it('strips directory components', () => {
    expect(sanitizeFilename('/etc/passwd')).toBe('passwd');
    expect(sanitizeFilename('../../../secret.txt')).toBe('secret.txt');
  });

  it('strips backslash path separators', () => {
    expect(sanitizeFilename('C:\\Users\\evil\\file.txt')).toBe('file.txt');
  });

  it('strips null bytes', () => {
    expect(sanitizeFilename('file\0name.txt')).toBe('filename.txt');
  });

  it('returns empty for pure traversal', () => {
    expect(sanitizeFilename('..')).toBe('');
    expect(sanitizeFilename('.')).toBe('');
  });

  it('handles dotfiles', () => {
    expect(sanitizeFilename('.gitignore')).toBe('.gitignore');
  });

  it('handles spaces', () => {
    expect(sanitizeFilename('my file.txt')).toBe('my file.txt');
  });
});

describe('writeAttachment', () => {
  let baseDir: string;

  beforeEach(() => {
    baseDir = mkdtempSync(join(tmpdir(), 'attachment-test-'));
  });

  afterEach(() => {
    rmSync(baseDir, { recursive: true, force: true });
  });

  it('writes file to correct location', () => {
    const data = Buffer.from('hello world');
    writeAttachment(baseDir, 'my-note', 'test.txt', data);

    const filePath = join(baseDir, 'my-note', 'attachments', 'test.txt');
    expect(existsSync(filePath)).toBe(true);
    expect(readFileSync(filePath, 'utf-8')).toBe('hello world');
  });

  it('creates nested directories', () => {
    writeAttachment(baseDir, 'deep-note', 'file.bin', Buffer.from([1, 2, 3]));
    expect(existsSync(join(baseDir, 'deep-note', 'attachments', 'file.bin'))).toBe(true);
  });

  it('throws on empty entity ID after sanitization', () => {
    expect(() => writeAttachment(baseDir, '..', 'file.txt', Buffer.from('x'))).toThrow(/Entity ID is empty/);
  });

  it('throws on empty filename after sanitization', () => {
    expect(() => writeAttachment(baseDir, 'note', '..', Buffer.from('x'))).toThrow(/filename is empty/);
  });

  it('sanitizes path traversal in entity ID', () => {
    writeAttachment(baseDir, '../../evil', 'file.txt', Buffer.from('safe'));
    // Should write to baseDir/evil/attachments/file.txt, not escape
    expect(existsSync(join(baseDir, 'evil', 'attachments', 'file.txt'))).toBe(true);
  });

  it('sanitizes path traversal in filename', () => {
    writeAttachment(baseDir, 'note', '../../../etc/passwd', Buffer.from('safe'));
    // Should write to note/attachments/passwd, not escape
    expect(existsSync(join(baseDir, 'note', 'attachments', 'passwd'))).toBe(true);
  });

  it('overwrites existing file', () => {
    writeAttachment(baseDir, 'note', 'file.txt', Buffer.from('v1'));
    writeAttachment(baseDir, 'note', 'file.txt', Buffer.from('v2'));
    const content = readFileSync(join(baseDir, 'note', 'attachments', 'file.txt'), 'utf-8');
    expect(content).toBe('v2');
  });

  it('handles empty data buffer', () => {
    writeAttachment(baseDir, 'note', 'empty.txt', Buffer.alloc(0));
    const content = readFileSync(join(baseDir, 'note', 'attachments', 'empty.txt'));
    expect(content.length).toBe(0);
  });
});

describe('deleteAttachment', () => {
  let baseDir: string;

  beforeEach(() => {
    baseDir = mkdtempSync(join(tmpdir(), 'attachment-del-'));
  });

  afterEach(() => {
    rmSync(baseDir, { recursive: true, force: true });
  });

  it('deletes existing file and returns true', () => {
    writeAttachment(baseDir, 'note', 'file.txt', Buffer.from('x'));
    expect(deleteAttachment(baseDir, 'note', 'file.txt')).toBe(true);
    expect(existsSync(join(baseDir, 'note', 'attachments', 'file.txt'))).toBe(false);
  });

  it('returns false for non-existent file', () => {
    expect(deleteAttachment(baseDir, 'note', 'nope.txt')).toBe(false);
  });

  it('returns false for empty entity ID', () => {
    expect(deleteAttachment(baseDir, '..', 'file.txt')).toBe(false);
  });
});

describe('getAttachmentPath', () => {
  let baseDir: string;

  beforeEach(() => {
    baseDir = mkdtempSync(join(tmpdir(), 'attachment-get-'));
  });

  afterEach(() => {
    rmSync(baseDir, { recursive: true, force: true });
  });

  it('returns path for existing attachment', () => {
    writeAttachment(baseDir, 'note', 'file.txt', Buffer.from('x'));
    const p = getAttachmentPath(baseDir, 'note', 'file.txt');
    expect(p).toBe(join(baseDir, 'note', 'attachments', 'file.txt'));
  });

  it('returns null for non-existent attachment', () => {
    expect(getAttachmentPath(baseDir, 'note', 'nope.txt')).toBeNull();
  });

  it('returns null for empty entity ID', () => {
    expect(getAttachmentPath(baseDir, '..', 'file.txt')).toBeNull();
  });
});
