import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { WorktreeInfo } from '../src/utils/git.js';

/**
 * Unit tests for the `wt cd` command handler.
 *
 * These mock all dependencies (git utils, TUI, fs, execa) to test
 * the handler's branching logic, subshell spawning, stderr routing,
 * and exit codes in isolation.
 */

const mockWorktrees: WorktreeInfo[] = [
    {
        path: '/fake/repo',
        head: 'aaa111',
        branch: 'main',
        detached: false,
        locked: false,
        prunable: false,
        isMain: true,
        bare: false,
    },
    {
        path: '/fake/worktrees/feature-login',
        head: 'bbb222',
        branch: 'feature/login',
        detached: false,
        locked: false,
        prunable: false,
        isMain: false,
        bare: false,
    },
    {
        path: '/fake/worktrees/detached-wt',
        head: 'ccc333',
        branch: null,
        detached: true,
        locked: false,
        prunable: false,
        isMain: false,
        bare: false,
    },
];

// --- Mocks ---

const mockExeca = vi.fn(async () => ({ stdout: 'true', exitCode: 0 }));
vi.mock('execa', () => ({ execa: mockExeca }));

const mockFindByBranch = vi.fn(async () => null as WorktreeInfo | null);
const mockFindByPath = vi.fn(async () => null as WorktreeInfo | null);
vi.mock('../src/utils/git.js', () => ({
    findWorktreeByBranch: mockFindByBranch,
    findWorktreeByPath: mockFindByPath,
    getWorktrees: vi.fn(async () => mockWorktrees),
}));

const mockSelectWorktree = vi.fn(async () => null as WorktreeInfo | WorktreeInfo[] | null);
vi.mock('../src/utils/tui.js', () => ({
    selectWorktree: mockSelectWorktree,
}));

function enoentError(): Error {
    const err = new Error('ENOENT') as NodeJS.ErrnoException;
    err.code = 'ENOENT';
    return err;
}

const mockStat = vi.fn(async () => { throw enoentError(); });
vi.mock('node:fs/promises', () => ({
    stat: mockStat,
}));

describe('cdWorktreeHandler', () => {
    let stdoutSpy: ReturnType<typeof vi.spyOn>;
    let stderrSpy: ReturnType<typeof vi.spyOn>;
    let exitSpy: ReturnType<typeof vi.spyOn>;
    const originalShell = process.env.SHELL;

    beforeEach(() => {
        stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
        stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
        exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
            throw new Error('process.exit');
        }) as any);

        process.env.SHELL = '/bin/zsh';

        // Reset all mocks to defaults
        mockExeca.mockReset().mockResolvedValue({ stdout: 'true', exitCode: 0 } as any);
        mockFindByBranch.mockReset().mockResolvedValue(null);
        mockFindByPath.mockReset().mockResolvedValue(null);
        mockSelectWorktree.mockReset().mockResolvedValue(null);
        mockStat.mockReset().mockRejectedValue(enoentError());
    });

    afterEach(() => {
        stdoutSpy.mockRestore();
        stderrSpy.mockRestore();
        exitSpy.mockRestore();
        process.env.SHELL = originalShell;
    });

    // --- Branch name resolution ---

    it('should spawn subshell in worktree dir when branch is found', async () => {
        const { cdWorktreeHandler } = await import('../src/commands/cd.js');

        // stat for input: not a path (throws)
        mockStat.mockRejectedValueOnce(enoentError());
        mockFindByBranch.mockResolvedValueOnce(mockWorktrees[1]);
        // stat for target path verification: exists
        mockStat.mockResolvedValueOnce({} as any);

        await cdWorktreeHandler('feature/login');

        expect(mockExeca).toHaveBeenCalledWith('/bin/zsh', [], {
            cwd: '/fake/worktrees/feature-login',
            stdio: 'inherit',
            reject: false,
        });
        expect(exitSpy).not.toHaveBeenCalled();
    });

    it('should not write anything to stdout on branch not found', async () => {
        const { cdWorktreeHandler } = await import('../src/commands/cd.js');

        mockFindByBranch.mockResolvedValueOnce(null);

        await expect(cdWorktreeHandler('no-such-branch')).rejects.toThrow('process.exit');

        expect(stdoutSpy).not.toHaveBeenCalled();
        expect(exitSpy).toHaveBeenCalledWith(1);
    });

    it('should write error to stderr when branch not found', async () => {
        const { cdWorktreeHandler } = await import('../src/commands/cd.js');

        mockFindByBranch.mockResolvedValueOnce(null);

        await expect(cdWorktreeHandler('missing')).rejects.toThrow('process.exit');

        expect(stderrSpy).toHaveBeenCalled();
        const stderrOutput = stderrSpy.mock.calls.map(c => c[0]).join('');
        expect(stderrOutput).toContain('Could not find a worktree');
        expect(stderrOutput).toContain('missing');
    });

    it('should suggest wt list and wt cd in error for missing branch', async () => {
        const { cdWorktreeHandler } = await import('../src/commands/cd.js');

        mockFindByBranch.mockResolvedValueOnce(null);

        await expect(cdWorktreeHandler('nope')).rejects.toThrow('process.exit');

        const stderrOutput = stderrSpy.mock.calls.map(c => c[0]).join('');
        expect(stderrOutput).toContain('wt list');
        expect(stderrOutput).toContain('wt cd');
    });

    // --- Path resolution ---

    it('should resolve by path when argument is an existing directory worktree', async () => {
        const { cdWorktreeHandler } = await import('../src/commands/cd.js');

        // First stat: path exists and is a directory
        mockStat.mockResolvedValueOnce({ isDirectory: () => true } as any);
        mockFindByPath.mockResolvedValueOnce(mockWorktrees[1]);
        // Second stat: target path verification
        mockStat.mockResolvedValueOnce({} as any);

        await cdWorktreeHandler('/fake/worktrees/feature-login');

        expect(mockExeca).toHaveBeenCalledWith('/bin/zsh', [], {
            cwd: '/fake/worktrees/feature-login',
            stdio: 'inherit',
            reject: false,
        });
    });

    it('should fail when path exists but is not a directory', async () => {
        const { cdWorktreeHandler } = await import('../src/commands/cd.js');

        // stat returns a file, not a directory
        mockStat.mockResolvedValueOnce({ isDirectory: () => false } as any);

        await expect(cdWorktreeHandler('/tmp/somefile.txt')).rejects.toThrow('process.exit');

        expect(exitSpy).toHaveBeenCalledWith(1);
        const stderrOutput = stderrSpy.mock.calls.map(c => c[0]).join('');
        expect(stderrOutput).toContain('is not a directory');
    });

    it('should fail when path is a directory but not a git worktree', async () => {
        const { cdWorktreeHandler } = await import('../src/commands/cd.js');

        // First stat: path exists, is directory
        mockStat.mockResolvedValueOnce({ isDirectory: () => true } as any);
        // findWorktreeByPath returns null
        mockFindByPath.mockResolvedValueOnce(null);
        // stat for .git inside directory: throws (no .git)
        mockStat.mockRejectedValueOnce(enoentError());

        await expect(cdWorktreeHandler('/tmp/plain-dir')).rejects.toThrow('process.exit');

        expect(exitSpy).toHaveBeenCalledWith(1);
        const stderrOutput = stderrSpy.mock.calls.map(c => c[0]).join('');
        expect(stderrOutput).toContain('not a git worktree');
    });

    it('should fall through to branch lookup when path does not exist', async () => {
        const { cdWorktreeHandler } = await import('../src/commands/cd.js');

        // stat throws → not a path, fall through to branch lookup
        mockStat.mockRejectedValueOnce(enoentError());
        mockFindByBranch.mockResolvedValueOnce(mockWorktrees[0]);
        // stat for target path verification
        mockStat.mockResolvedValueOnce({} as any);

        await cdWorktreeHandler('main');

        expect(mockExeca).toHaveBeenCalledWith('/bin/zsh', [], {
            cwd: '/fake/repo',
            stdio: 'inherit',
            reject: false,
        });
    });

    // --- Target path deleted from disk ---

    it('should fail when resolved worktree path no longer exists on disk', async () => {
        const { cdWorktreeHandler } = await import('../src/commands/cd.js');

        // stat for input: throws (not a path)
        mockStat.mockRejectedValueOnce(enoentError());
        mockFindByBranch.mockResolvedValueOnce(mockWorktrees[1]);
        // stat for target path verification: throws (deleted)
        mockStat.mockRejectedValueOnce(enoentError());

        await expect(cdWorktreeHandler('feature/login')).rejects.toThrow('process.exit');

        expect(exitSpy).toHaveBeenCalledWith(1);
        const stderrOutput = stderrSpy.mock.calls.map(c => c[0]).join('');
        expect(stderrOutput).toContain('no longer exists');
        expect(stdoutSpy).not.toHaveBeenCalled();
    });

    // --- Interactive selection (no argument) ---

    it('should use interactive picker when no argument is given', async () => {
        const { cdWorktreeHandler } = await import('../src/commands/cd.js');

        mockSelectWorktree.mockResolvedValueOnce(mockWorktrees[1]);
        mockStat.mockResolvedValueOnce({} as any);

        await cdWorktreeHandler('');

        expect(mockSelectWorktree).toHaveBeenCalledWith({
            message: 'Select a worktree to cd into',
            excludeMain: false,
        });
        expect(mockExeca).toHaveBeenCalledWith('/bin/zsh', [], {
            cwd: '/fake/worktrees/feature-login',
            stdio: 'inherit',
            reject: false,
        });
    });

    it('should exit 0 when user cancels interactive selection', async () => {
        const { cdWorktreeHandler } = await import('../src/commands/cd.js');

        mockSelectWorktree.mockResolvedValueOnce(null);

        await expect(cdWorktreeHandler('')).rejects.toThrow('process.exit');

        expect(exitSpy).toHaveBeenCalledWith(0);
        expect(stdoutSpy).not.toHaveBeenCalled();
    });

    it('should exit 0 when interactive selection returns array', async () => {
        const { cdWorktreeHandler } = await import('../src/commands/cd.js');

        mockSelectWorktree.mockResolvedValueOnce([mockWorktrees[0], mockWorktrees[1]]);

        await expect(cdWorktreeHandler('')).rejects.toThrow('process.exit');

        expect(exitSpy).toHaveBeenCalledWith(0);
        expect(stdoutSpy).not.toHaveBeenCalled();
    });

    it('should write cancellation message to stderr not stdout', async () => {
        const { cdWorktreeHandler } = await import('../src/commands/cd.js');

        mockSelectWorktree.mockResolvedValueOnce(null);

        await expect(cdWorktreeHandler('')).rejects.toThrow('process.exit');

        const stderrOutput = stderrSpy.mock.calls.map(c => c[0]).join('');
        expect(stderrOutput).toContain('No worktree selected');
        expect(stdoutSpy).not.toHaveBeenCalled();
    });

    // --- Not in a git repo ---

    it('should fail when not inside a git repository', async () => {
        const { cdWorktreeHandler } = await import('../src/commands/cd.js');

        mockExeca.mockResolvedValueOnce({ stdout: '', exitCode: 128 } as any);

        await expect(cdWorktreeHandler('main')).rejects.toThrow('process.exit');

        expect(exitSpy).toHaveBeenCalledWith(1);
        expect(stdoutSpy).not.toHaveBeenCalled();
    });

    it('should write git error to stderr when not in a repo', async () => {
        const { cdWorktreeHandler } = await import('../src/commands/cd.js');

        mockExeca.mockResolvedValueOnce({ stdout: '', exitCode: 128 } as any);

        await expect(cdWorktreeHandler('main')).rejects.toThrow('process.exit');

        const stderrOutput = stderrSpy.mock.calls.map(c => c[0]).join('');
        expect(stderrOutput).toContain('Not inside a git work tree');
    });

    // --- Subshell uses correct shell ---

    it('should write entering message to stderr', async () => {
        const { cdWorktreeHandler } = await import('../src/commands/cd.js');

        mockStat.mockRejectedValueOnce(enoentError());
        mockFindByBranch.mockResolvedValueOnce(mockWorktrees[0]);
        mockStat.mockResolvedValueOnce({} as any);

        await cdWorktreeHandler('main');

        const stderrOutput = stderrSpy.mock.calls.map(c => c[0]).join('');
        expect(stderrOutput).toContain('Entering');
        expect(stderrOutput).toContain('/fake/repo');
    });

    it('should not write path to stdout', async () => {
        const { cdWorktreeHandler } = await import('../src/commands/cd.js');

        mockStat.mockRejectedValueOnce(enoentError());
        mockFindByBranch.mockResolvedValueOnce(mockWorktrees[0]);
        mockStat.mockResolvedValueOnce({} as any);

        await cdWorktreeHandler('main');

        expect(stdoutSpy).not.toHaveBeenCalled();
    });

    it('should propagate non-zero shell exit code', async () => {
        const { cdWorktreeHandler } = await import('../src/commands/cd.js');

        mockStat.mockRejectedValueOnce(enoentError());
        mockFindByBranch.mockResolvedValueOnce(mockWorktrees[0]);
        mockStat.mockResolvedValueOnce({} as any);
        // Subshell exits with code 130
        mockExeca
            .mockResolvedValueOnce({ stdout: 'true', exitCode: 0 } as any) // git rev-parse
            .mockResolvedValueOnce({ exitCode: 130 } as any); // shell

        await expect(cdWorktreeHandler('main')).rejects.toThrow('process.exit');
        expect(exitSpy).toHaveBeenCalledWith(130);
    });

    it('should exit 128 when shell is killed by signal', async () => {
        const { cdWorktreeHandler } = await import('../src/commands/cd.js');

        mockStat.mockRejectedValueOnce(enoentError());
        mockFindByBranch.mockResolvedValueOnce(mockWorktrees[0]);
        mockStat.mockResolvedValueOnce({} as any);
        mockExeca
            .mockResolvedValueOnce({ stdout: 'true', exitCode: 0 } as any) // git rev-parse
            .mockResolvedValueOnce({ exitCode: undefined, signal: 'SIGKILL' } as any); // shell killed

        await expect(cdWorktreeHandler('main')).rejects.toThrow('process.exit');
        // SIGKILL = 9, so exit code should be 128 + 9 = 137
        expect(exitSpy).toHaveBeenCalledWith(137);
    });

    // --- --print mode ---

    it('should write only the path to stdout with --print', async () => {
        const { cdWorktreeHandler } = await import('../src/commands/cd.js');

        mockStat.mockRejectedValueOnce(enoentError());
        mockFindByBranch.mockResolvedValueOnce(mockWorktrees[1]);
        mockStat.mockResolvedValueOnce({} as any);

        await cdWorktreeHandler('feature/login', { print: true });

        expect(stdoutSpy).toHaveBeenCalledWith('/fake/worktrees/feature-login\n');
        // Should only have the git rev-parse call, no subshell spawn
        expect(mockExeca).toHaveBeenCalledTimes(1);
        expect(mockExeca).toHaveBeenCalledWith('git', ['rev-parse', '--is-inside-work-tree'], { reject: false });
    });

    it('should not write entering message with --print', async () => {
        const { cdWorktreeHandler } = await import('../src/commands/cd.js');

        mockStat.mockRejectedValueOnce(enoentError());
        mockFindByBranch.mockResolvedValueOnce(mockWorktrees[0]);
        mockStat.mockResolvedValueOnce({} as any);

        await cdWorktreeHandler('main', { print: true });

        const stderrOutput = stderrSpy.mock.calls.map(c => c[0]).join('');
        expect(stderrOutput).not.toContain('Entering');
    });

    it('should still exit 1 on error with --print', async () => {
        const { cdWorktreeHandler } = await import('../src/commands/cd.js');

        mockFindByBranch.mockResolvedValueOnce(null);

        await expect(cdWorktreeHandler('missing', { print: true })).rejects.toThrow('process.exit');
        expect(exitSpy).toHaveBeenCalledWith(1);
    });

    // --- Detached worktree ---

    it('should handle detached worktrees from interactive selection', async () => {
        const { cdWorktreeHandler } = await import('../src/commands/cd.js');

        mockSelectWorktree.mockResolvedValueOnce(mockWorktrees[2]);
        mockStat.mockResolvedValueOnce({} as any);

        await cdWorktreeHandler('');

        expect(mockExeca).toHaveBeenCalledWith('/bin/zsh', [], {
            cwd: '/fake/worktrees/detached-wt',
            stdio: 'inherit',
            reject: false,
        });
    });
});
