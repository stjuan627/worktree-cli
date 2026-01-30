import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const mockReadFileSync = vi.fn(() => { throw new Error('ENOENT'); });
vi.mock('node:fs', () => ({ readFileSync: mockReadFileSync }));

describe('initHandler', () => {
    let stdoutSpy: ReturnType<typeof vi.spyOn>;
    let stderrSpy: ReturnType<typeof vi.spyOn>;
    let exitSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
        stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
        exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
            throw new Error('process.exit');
        }) as any);
        mockReadFileSync.mockReset().mockImplementation(() => { throw new Error('ENOENT'); });
    });

    afterEach(() => {
        stdoutSpy.mockRestore();
        stderrSpy.mockRestore();
        exitSpy.mockRestore();
    });

    it('should output bash/zsh shell function to stdout', async () => {
        const { initHandler } = await import('../src/commands/init.js');
        initHandler('zsh');

        const output = stdoutSpy.mock.calls.map(c => c[0]).join('');
        expect(output).toContain('wt()');
        expect(output).toContain('command wt cd --print');
        expect(output).toContain('builtin cd');
    });

    it('should output bash function for bash shell', async () => {
        const { initHandler } = await import('../src/commands/init.js');
        initHandler('bash');

        const output = stdoutSpy.mock.calls.map(c => c[0]).join('');
        expect(output).toContain('wt()');
    });

    it('should output fish function for fish shell', async () => {
        const { initHandler } = await import('../src/commands/init.js');
        initHandler('fish');

        const output = stdoutSpy.mock.calls.map(c => c[0]).join('');
        expect(output).toContain('function wt');
        expect(output).toContain('$argv');
    });

    it('should be silent on stderr when called with explicit shell arg', async () => {
        const { initHandler } = await import('../src/commands/init.js');
        initHandler('zsh');

        const stderrOutput = stderrSpy.mock.calls.map(c => c[0]).join('');
        expect(stderrOutput).toBe('');
    });

    it('should show usage hint on stderr when auto-detecting shell', async () => {
        process.env.SHELL = '/bin/zsh';
        const { initHandler } = await import('../src/commands/init.js');
        initHandler();

        const stderrOutput = stderrSpy.mock.calls.map(c => c[0]).join('');
        expect(stderrOutput).toContain('eval');
        expect(stderrOutput).toContain('.zshrc');
        expect(stderrOutput).toContain("echo 'eval \"$(wt init zsh)\"' >> ~/.zshrc");
    });

    it('should show fish hints when auto-detecting fish', async () => {
        process.env.SHELL = '/usr/local/bin/fish';
        const { initHandler } = await import('../src/commands/init.js');
        initHandler();

        const stderrOutput = stderrSpy.mock.calls.map(c => c[0]).join('');
        expect(stderrOutput).toContain('config.fish');
        expect(stderrOutput).not.toContain('.fishrc');
        expect(stderrOutput).toContain("echo 'wt init fish | source' >> ~/.config/fish/config.fish");
    });

    it('should exit 1 for unsupported shell', async () => {
        const { initHandler } = await import('../src/commands/init.js');

        expect(() => initHandler('powershell')).toThrow('process.exit');
        expect(exitSpy).toHaveBeenCalledWith(1);

        const stderrOutput = stderrSpy.mock.calls.map(c => c[0]).join('');
        expect(stderrOutput).toContain('Unsupported shell');
    });

    it('should be case-insensitive for shell name', async () => {
        const { initHandler } = await import('../src/commands/init.js');
        initHandler('ZSH');

        const output = stdoutSpy.mock.calls.map(c => c[0]).join('');
        expect(output).toContain('wt()');
    });

    it('should not contain 2>/dev/null in shell functions', async () => {
        const { getShellFunction } = await import('../src/commands/init.js');
        expect(getShellFunction('zsh')).not.toContain('2>/dev/null');
        expect(getShellFunction('fish')).not.toContain('2>/dev/null');
    });

    it('should show "already installed" when auto-detecting and init line exists', async () => {
        process.env.SHELL = '/bin/zsh';
        mockReadFileSync.mockReturnValueOnce('some stuff\neval "$(wt init zsh)"\nmore stuff');
        const { initHandler } = await import('../src/commands/init.js');
        initHandler();

        const stderrOutput = stderrSpy.mock.calls.map(c => c[0]).join('');
        expect(stderrOutput).toContain('Already installed');
        expect(stderrOutput).toContain('.zshrc');
        // Should not show append/reload commands
        expect(stderrOutput).not.toContain("echo '");
    });

    it('should be silent on stderr when called with shell arg even if already installed', async () => {
        mockReadFileSync.mockReturnValueOnce('eval "$(wt init zsh)"');
        const { initHandler } = await import('../src/commands/init.js');
        initHandler('zsh');

        const stderrOutput = stderrSpy.mock.calls.map(c => c[0]).join('');
        expect(stderrOutput).toBe('');
    });

    it('should still output shell function even when already installed', async () => {
        mockReadFileSync.mockReturnValueOnce('eval "$(wt init zsh)"');
        const { initHandler } = await import('../src/commands/init.js');
        initHandler('zsh');

        const output = stdoutSpy.mock.calls.map(c => c[0]).join('');
        expect(output).toContain('wt()');
    });
});

describe('detectShell', () => {
    const originalShell = process.env.SHELL;

    afterEach(() => {
        process.env.SHELL = originalShell;
    });

    it('should detect zsh from $SHELL', async () => {
        process.env.SHELL = '/bin/zsh';
        const { detectShell } = await import('../src/commands/init.js');
        expect(detectShell()).toBe('zsh');
    });

    it('should detect bash from $SHELL', async () => {
        process.env.SHELL = '/usr/bin/bash';
        const { detectShell } = await import('../src/commands/init.js');
        expect(detectShell()).toBe('bash');
    });

    it('should detect fish from $SHELL', async () => {
        process.env.SHELL = '/usr/local/bin/fish';
        const { detectShell } = await import('../src/commands/init.js');
        expect(detectShell()).toBe('fish');
    });

    it('should return null for unsupported $SHELL', async () => {
        process.env.SHELL = '/bin/tcsh';
        const { detectShell } = await import('../src/commands/init.js');
        expect(detectShell()).toBeNull();
    });

    it('should return null when $SHELL is unset', async () => {
        delete process.env.SHELL;
        const { detectShell } = await import('../src/commands/init.js');
        expect(detectShell()).toBeNull();
    });
});

describe('initHandler auto-detection', () => {
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
    });

    afterEach(() => {
        stdoutSpy.mockRestore();
        stderrSpy.mockRestore();
        exitSpy.mockRestore();
        process.env.SHELL = originalShell;
    });

    it('should auto-detect shell when no argument given', async () => {
        process.env.SHELL = '/bin/zsh';
        const { initHandler } = await import('../src/commands/init.js');
        initHandler();

        const output = stdoutSpy.mock.calls.map(c => c[0]).join('');
        expect(output).toContain('wt()');
        const stderrOutput = stderrSpy.mock.calls.map(c => c[0]).join('');
        expect(stderrOutput).toContain('Detected shell: zsh');
    });

    it('should exit 1 when no argument and $SHELL is unsupported', async () => {
        process.env.SHELL = '/bin/tcsh';
        const { initHandler } = await import('../src/commands/init.js');

        expect(() => initHandler()).toThrow('process.exit');
        expect(exitSpy).toHaveBeenCalledWith(1);
        const stderrOutput = stderrSpy.mock.calls.map(c => c[0]).join('');
        expect(stderrOutput).toContain('Could not detect shell');
    });
});

describe('getShellFunction', () => {
    it('should return same function for bash and zsh', async () => {
        const { getShellFunction } = await import('../src/commands/init.js');
        expect(getShellFunction('bash')).toBe(getShellFunction('zsh'));
    });

    it('should return different function for fish', async () => {
        const { getShellFunction } = await import('../src/commands/init.js');
        expect(getShellFunction('fish')).not.toBe(getShellFunction('zsh'));
    });
});
