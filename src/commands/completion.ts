import { bashCompletionScript } from "../completions/bash.js";
import { zshCompletionScript } from "../completions/zsh.js";
import { getWorktrees, getBranches } from "../utils/git.js";

const SUBCOMMANDS = [
    "new",
    "setup",
    "list",
    "ls",
    "remove",
    "rm",
    "merge",
    "purge",
    "pr",
    "open",
    "extract",
    "config",
    "completion",
];

const CONFIG_SUBCOMMANDS = ["set", "get", "clear", "path"];

const WORKTREE_BRANCH_COMMANDS = new Set(["merge", "remove", "rm", "open"]);
const GIT_BRANCH_COMMANDS = new Set(["new", "setup", "extract"]);

/**
 * Handle the `wt completion [shell]` command.
 * Outputs the shell completion script to stdout.
 */
export async function completionHandler(shell: string): Promise<void> {
    switch (shell) {
        case "bash":
            console.log(bashCompletionScript());
            break;
        case "zsh":
            console.log(zshCompletionScript());
            break;
        default:
            console.error(
                `Unsupported shell: ${shell}. Supported shells: bash, zsh`
            );
            process.exit(1);
    }
}

/**
 * Handle dynamic completion requests from the shell completion script.
 *
 * Called internally as `wt __complete -- <words...>` where words are the
 * current command-line tokens (excluding the program name itself).
 *
 * Outputs one candidate per line to stdout.
 */
export async function getCompletions(words: string[]): Promise<void> {
    try {
        // Current word being typed (last element, may be empty string)
        const current = words.length > 0 ? words[words.length - 1] : "";
        // Completed words before the current one
        const completed = words.slice(0, -1);

        // No completed words → completing the subcommand itself
        if (completed.length === 0) {
            const matches = SUBCOMMANDS.filter((cmd) =>
                cmd.startsWith(current)
            );
            if (matches.length > 0) {
                console.log(matches.join("\n"));
            }
            return;
        }

        const command = completed[0];

        // Worktree branch commands: merge, remove/rm, open
        if (WORKTREE_BRANCH_COMMANDS.has(command)) {
            const worktrees = await getWorktrees();
            const branches = worktrees
                .filter((wt) => !wt.isMain && wt.branch)
                .map((wt) => wt.branch as string);
            const matches = branches.filter((b) => b.startsWith(current));
            if (matches.length > 0) {
                console.log(matches.join("\n"));
            }
            return;
        }

        // Git branch commands: new, setup, extract
        if (GIT_BRANCH_COMMANDS.has(command)) {
            const branches = await getBranches();
            const matches = branches.filter((b) => b.startsWith(current));
            if (matches.length > 0) {
                console.log(matches.join("\n"));
            }
            return;
        }

        // Config subcommands
        if (command === "config") {
            if (completed.length === 1) {
                const matches = CONFIG_SUBCOMMANDS.filter((cmd) =>
                    cmd.startsWith(current)
                );
                if (matches.length > 0) {
                    console.log(matches.join("\n"));
                }
            }
            return;
        }

        // No completions for other commands (pr, purge, list, etc.)
    } catch {
        // Silently return empty results on error
    }
}
