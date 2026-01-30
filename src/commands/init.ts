import chalk from "chalk";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";

// Shell wrapper functions that intercept `wt cd` to perform a native directory
// change via `--print`. If `--print` exits non-zero (e.g. no worktree found),
// falls back to the normal subshell-based `wt cd`.
const BASH_ZSH_FUNCTION = `wt() {
  if [[ "\$1" == "cd" ]]; then
    shift
    local dir
    dir=$(command wt cd --print "\$@")
    if [[ \$? -eq 0 && -n "\$dir" ]]; then
      builtin cd "\$dir"
    else
      command wt cd "\$@"
    fi
  else
    command wt "\$@"
  fi
}`;

const FISH_FUNCTION = `function wt
  if test (count $argv) -gt 0 -a "$argv[1]" = "cd"
    set -l dir (command wt cd --print $argv[2..-1])
    if test $status -eq 0 -a -n "$dir"
      builtin cd $dir
    else
      command wt cd $argv[2..-1]
    end
  else
    command wt $argv
  end
end`;

const SUPPORTED_SHELLS = ["zsh", "bash", "fish"] as const;
type Shell = (typeof SUPPORTED_SHELLS)[number];

const SHELL_RC: Record<Shell, { file: string; line: string }> = {
    zsh: { file: "~/.zshrc", line: 'eval "$(wt init zsh)"' },
    bash: { file: "~/.bashrc", line: 'eval "$(wt init bash)"' },
    fish: { file: "~/.config/fish/config.fish", line: "wt init fish | source" },
};

export function getShellFunction(shell: Shell): string {
    if (shell === "fish") return FISH_FUNCTION;
    return BASH_ZSH_FUNCTION;
}

export function detectShell(): Shell | null {
    const shellEnv = process.env.SHELL || "";
    const basename = shellEnv.split("/").pop()?.toLowerCase() || "";
    if (SUPPORTED_SHELLS.includes(basename as Shell)) return basename as Shell;
    return null;
}

function expandTilde(path: string): string {
    return path.startsWith("~/") ? resolve(homedir(), path.slice(2)) : path;
}

function isAlreadyInstalled(rc: { file: string; line: string }): boolean {
    try {
        const content = readFileSync(expandTilde(rc.file), "utf-8");
        return content.includes(rc.line);
    } catch {
        return false;
    }
}

const SHELL_SOURCE: Record<Shell, string> = {
    zsh: "source ~/.zshrc",
    bash: "source ~/.bashrc",
    fish: "source ~/.config/fish/config.fish",
};

export function initHandler(shell?: string): void {
    let resolved: Shell;

    if (shell) {
        const normalized = shell.toLowerCase();
        if (!SUPPORTED_SHELLS.includes(normalized as Shell)) {
            process.stderr.write(
                chalk.red(`Unsupported shell: "${shell}". Supported shells: ${SUPPORTED_SHELLS.join(", ")}`) + "\n"
            );
            process.exit(1);
        }
        resolved = normalized as Shell;
    } else {
        const detected = detectShell();
        if (!detected) {
            process.stderr.write(
                chalk.red("Could not detect shell from $SHELL.") + "\n"
            );
            process.stderr.write(
                chalk.yellow(`Usage: wt init <${SUPPORTED_SHELLS.join("|")}>`) + "\n"
            );
            process.exit(1);
        }
        resolved = detected;
        process.stderr.write(chalk.dim(`Detected shell: ${resolved}`) + "\n");
    }

    process.stdout.write(getShellFunction(resolved) + "\n");

    // When called with an explicit shell arg (e.g. `eval "$(wt init zsh)"`),
    // the user just wants the shell function emitted to stdout — no guidance.
    if (shell) return;

    const rc = SHELL_RC[resolved];

    if (isAlreadyInstalled(rc)) {
        process.stderr.write(chalk.green(`Already installed in ${rc.file}`) + "\n");
        return;
    }

    process.stderr.write(chalk.dim(`# Add to ${rc.file}:`) + "\n");
    process.stderr.write(chalk.dim("#   " + rc.line) + "\n");
    process.stderr.write("\n");
    process.stderr.write(chalk.dim("# Run this to add it automatically:") + "\n");
    const appendCmd = `echo '${rc.line}' >> ${rc.file}`;
    process.stderr.write("  " + chalk.cyan(appendCmd) + "\n");
    process.stderr.write("\n");
    process.stderr.write(chalk.dim("# Then reload your shell:") + "\n");
    process.stderr.write("  " + chalk.cyan(SHELL_SOURCE[resolved]) + "\n");
}
