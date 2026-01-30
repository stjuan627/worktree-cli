import { execa } from "execa";
import chalk from "chalk";
import { stat } from "node:fs/promises";
import { constants } from "node:os";
import { resolve } from "node:path";
import { findWorktreeByBranch, findWorktreeByPath } from "../utils/git.js";
import { selectWorktree } from "../utils/tui.js";
function isEnoent(err) {
    return err instanceof Error && 'code' in err && err.code === 'ENOENT';
}
export async function cdWorktreeHandler(pathOrBranch = "", options = {}) {
    try {
        const gitCheck = await execa("git", ["rev-parse", "--is-inside-work-tree"], { reject: false });
        if (gitCheck.exitCode !== 0 || gitCheck.stdout.trim() !== "true") {
            process.stderr.write(chalk.red("Not inside a git work tree.") + "\n");
            process.exit(1);
        }
        let targetWorktree = null;
        if (!pathOrBranch) {
            const selected = await selectWorktree({
                message: "Select a worktree to cd into",
                excludeMain: false,
                ...(options.print ? { stdout: process.stderr } : {}),
            });
            if (!selected || Array.isArray(selected)) {
                process.stderr.write(chalk.yellow("No worktree selected.") + "\n");
                process.exit(0);
            }
            targetWorktree = selected;
        }
        else {
            // Check if argument is an existing filesystem path
            let pathStats = null;
            try {
                pathStats = await stat(pathOrBranch);
            }
            catch (err) {
                if (!isEnoent(err))
                    throw err;
                // ENOENT: not a valid path, will try as branch name below
            }
            if (pathStats) {
                if (pathStats.isDirectory()) {
                    targetWorktree = await findWorktreeByPath(pathOrBranch);
                    if (!targetWorktree) {
                        try {
                            await stat(resolve(pathOrBranch, ".git"));
                            targetWorktree = {
                                path: resolve(pathOrBranch),
                                head: '',
                                branch: null,
                                detached: false,
                                locked: false,
                                prunable: false,
                                isMain: false,
                                bare: false,
                            };
                        }
                        catch {
                            process.stderr.write(chalk.red(`The path "${pathOrBranch}" exists but is not a git worktree.`) + "\n");
                            process.exit(1);
                        }
                    }
                }
                else {
                    process.stderr.write(chalk.red(`The path "${pathOrBranch}" is not a directory.`) + "\n");
                    process.exit(1);
                }
            }
            if (!targetWorktree) {
                targetWorktree = await findWorktreeByBranch(pathOrBranch);
                if (!targetWorktree) {
                    process.stderr.write(chalk.red(`Could not find a worktree for branch "${pathOrBranch}".`) + "\n");
                    process.stderr.write(chalk.yellow("Use 'wt list' to see existing worktrees, or run 'wt cd' without arguments to select interactively.") + "\n");
                    process.exit(1);
                }
            }
        }
        const targetPath = targetWorktree.path;
        try {
            await stat(targetPath);
        }
        catch (err) {
            if (!isEnoent(err))
                throw err;
            process.stderr.write(chalk.red(`The worktree path "${targetPath}" no longer exists.`) + "\n");
            process.stderr.write(chalk.yellow("The worktree may have been removed. Run 'git worktree prune' to clean up.") + "\n");
            process.exit(1);
        }
        if (options.print) {
            process.stdout.write(targetPath + "\n");
            return;
        }
        // Spawn a subshell in the target directory so cd works without shell config
        const shell = process.platform === "win32"
            ? process.env.COMSPEC || "cmd.exe"
            : process.env.SHELL || "/bin/sh";
        process.stderr.write(chalk.green(`Entering ${targetPath}`) + "\n");
        process.stderr.write(chalk.dim(`(exit or ctrl+d to return)`) + "\n");
        const result = await execa(shell, [], {
            cwd: targetPath,
            stdio: "inherit",
            reject: false,
        });
        if (result.signal) {
            const signum = constants.signals[result.signal] ?? 0;
            process.exit(128 + signum);
        }
        if (result.exitCode != null && result.exitCode !== 0) {
            process.exit(result.exitCode);
        }
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        process.stderr.write(chalk.red("Failed to resolve worktree: ") + message + "\n");
        process.exit(1);
    }
}
