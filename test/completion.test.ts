import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { WorktreeInfo } from '../src/utils/git.js';

const mockWorktrees: WorktreeInfo[] = [
    {
        path: '/Users/test/repo',
        head: 'abc123',
        branch: 'main',
        detached: false,
        locked: false,
        prunable: false,
        isMain: true,
        bare: false,
    },
    {
        path: '/Users/test/worktrees/feature-auth',
        head: 'def456',
        branch: 'feature/auth',
        detached: false,
        locked: false,
        prunable: false,
        isMain: false,
        bare: false,
    },
    {
        path: '/Users/test/worktrees/bugfix',
        head: 'ghi789',
        branch: 'bugfix/issue-123',
        detached: false,
        locked: true,
        lockReason: 'in use',
        prunable: false,
        isMain: false,
        bare: false,
    },
];

const mockBranches = ['main', 'feature/auth', 'bugfix/issue-123', 'develop'];

vi.mock('../src/utils/git.js', async () => {
    return {
        getWorktrees: vi.fn(async () => mockWorktrees),
        getBranches: vi.fn(async () => mockBranches),
    };
});

const { getCompletions } = await import('../src/commands/completion.js');

/** Capture stdout output from getCompletions */
async function captureCompletions(words: string[]): Promise<string[]> {
    const lines: string[] = [];
    const originalLog = console.log;
    console.log = (...args: any[]) => {
        const output = args.join(' ');
        lines.push(...output.split('\n'));
    };
    try {
        await getCompletions(words);
    } finally {
        console.log = originalLog;
    }
    return lines.filter(l => l !== '');
}

describe('Completion', () => {
    describe('subcommand completion', () => {
        it('should return all subcommands for empty input', async () => {
            const result = await captureCompletions(['']);
            expect(result).toContain('new');
            expect(result).toContain('merge');
            expect(result).toContain('remove');
            expect(result).toContain('rm');
            expect(result).toContain('open');
            expect(result).toContain('list');
            expect(result).toContain('ls');
            expect(result).toContain('config');
            expect(result).toContain('completion');
            expect(result).toContain('pr');
            expect(result).toContain('setup');
            expect(result).toContain('extract');
            expect(result).toContain('purge');
        });

        it('should filter subcommands by prefix', async () => {
            const result = await captureCompletions(['mer']);
            expect(result).toEqual(['merge']);
        });

        it('should match multiple subcommands with shared prefix', async () => {
            const result = await captureCompletions(['l']);
            expect(result).toContain('list');
            expect(result).toContain('ls');
            expect(result).toHaveLength(2);
        });

        it('should return empty for non-matching prefix', async () => {
            const result = await captureCompletions(['xyz']);
            expect(result).toHaveLength(0);
        });
    });

    describe('worktree branch completion (merge/remove/rm/open)', () => {
        it('should return non-main worktree branches for merge', async () => {
            const result = await captureCompletions(['merge', '']);
            expect(result).toContain('feature/auth');
            expect(result).toContain('bugfix/issue-123');
            expect(result).not.toContain('main');
        });

        it('should return non-main worktree branches for rm', async () => {
            const result = await captureCompletions(['rm', '']);
            expect(result).toContain('feature/auth');
            expect(result).toContain('bugfix/issue-123');
            expect(result).not.toContain('main');
        });

        it('should return non-main worktree branches for remove', async () => {
            const result = await captureCompletions(['remove', '']);
            expect(result).toContain('feature/auth');
            expect(result).toContain('bugfix/issue-123');
        });

        it('should return non-main worktree branches for open', async () => {
            const result = await captureCompletions(['open', '']);
            expect(result).toContain('feature/auth');
            expect(result).toContain('bugfix/issue-123');
        });

        it('should filter worktree branches by prefix', async () => {
            const result = await captureCompletions(['merge', 'feature']);
            expect(result).toEqual(['feature/auth']);
        });
    });

    describe('git branch completion (new/setup/extract)', () => {
        it('should return all git branches for new', async () => {
            const result = await captureCompletions(['new', '']);
            expect(result).toContain('main');
            expect(result).toContain('feature/auth');
            expect(result).toContain('bugfix/issue-123');
            expect(result).toContain('develop');
        });

        it('should return all git branches for setup', async () => {
            const result = await captureCompletions(['setup', '']);
            expect(result).toContain('main');
            expect(result).toContain('develop');
        });

        it('should return all git branches for extract', async () => {
            const result = await captureCompletions(['extract', '']);
            expect(result).toContain('main');
            expect(result).toContain('develop');
        });

        it('should filter git branches by prefix', async () => {
            const result = await captureCompletions(['new', 'dev']);
            expect(result).toEqual(['develop']);
        });
    });

    describe('config subcommand completion', () => {
        it('should return config subcommands', async () => {
            const result = await captureCompletions(['config', '']);
            expect(result).toContain('set');
            expect(result).toContain('get');
            expect(result).toContain('clear');
            expect(result).toContain('path');
        });

        it('should filter config subcommands by prefix', async () => {
            const result = await captureCompletions(['config', 'se']);
            expect(result).toEqual(['set']);
        });

        it('should not complete beyond config subcommands', async () => {
            const result = await captureCompletions(['config', 'set', '']);
            expect(result).toHaveLength(0);
        });
    });

    describe('commands with no dynamic completion', () => {
        it('should return empty for pr arguments', async () => {
            const result = await captureCompletions(['pr', '']);
            expect(result).toHaveLength(0);
        });

        it('should return empty for list arguments', async () => {
            const result = await captureCompletions(['list', '']);
            expect(result).toHaveLength(0);
        });

        it('should return empty for purge arguments', async () => {
            const result = await captureCompletions(['purge', '']);
            expect(result).toHaveLength(0);
        });
    });

    describe('edge cases', () => {
        it('should return all subcommands for empty words array', async () => {
            const result = await captureCompletions([]);
            expect(result).toContain('new');
            expect(result).toContain('merge');
            expect(result).toContain('open');
            expect(result).toHaveLength(13);
        });
    });
});
