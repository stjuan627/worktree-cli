import { execa } from "execa";
import chalk from "chalk";
import { stat } from "node:fs/promises";
import { resolve } from "node:path";
import { getDefaultEditor, shouldSkipEditor } from "../config.js";
import { findWorktreeByBranch, findWorktreeByPath } from "../utils/git.js";
import { selectWorktree } from "../utils/tui.js";
function isEnoent(err) {
    return err instanceof Error && 'code' in err && err.code === 'ENOENT';
}
export async function openWorktreeHandler(pathOrBranch = "", options) {
    try {
        // 1. Validate we're in a git repo
        const { exitCode } = await execa("git", ["rev-parse", "--is-inside-work-tree"], { reject: false });
        if (exitCode !== 0) {
            process.stderr.write(chalk.red("Not inside a git repository.") + "\n");
            process.exit(1);
        }
        let targetWorktree = null;
        // Improvement #4: Interactive TUI for missing arguments
        if (!pathOrBranch) {
            const selected = await selectWorktree({
                message: "Select a worktree to open",
                excludeMain: false,
            });
            if (!selected || Array.isArray(selected)) {
                process.stderr.write(chalk.yellow("No worktree selected.") + "\n");
                process.exit(0);
            }
            targetWorktree = selected;
        }
        else {
            // Try to find by path first
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
            // If not found by path, try by branch name
            if (!targetWorktree) {
                targetWorktree = await findWorktreeByBranch(pathOrBranch);
                if (!targetWorktree) {
                    process.stderr.write(chalk.red(`Could not find a worktree for branch "${pathOrBranch}".`) + "\n");
                    process.stderr.write(chalk.yellow("Use 'wt list' to see existing worktrees, or run 'wt open' without arguments to select interactively.") + "\n");
                    process.exit(1);
                }
            }
        }
        const targetPath = targetWorktree.path;
        // Verify the target path exists
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
        // Open in the specified editor (or use configured default)
        const configuredEditor = getDefaultEditor();
        const editorCommand = options.editor || configuredEditor;
        if (shouldSkipEditor(editorCommand)) {
            process.stdout.write(targetPath + "\n");
        }
        else {
            // Display worktree info
            if (targetWorktree.branch) {
                console.log(chalk.blue(`Opening worktree for branch "${targetWorktree.branch}"...`));
            }
            else if (targetWorktree.detached) {
                console.log(chalk.blue(`Opening detached worktree at ${targetWorktree.head.substring(0, 7)}...`));
            }
            else {
                console.log(chalk.blue(`Opening worktree at ${targetPath}...`));
            }
            // Show status indicators
            if (targetWorktree.locked) {
                console.log(chalk.yellow(`Note: This worktree is locked${targetWorktree.lockReason ? `: ${targetWorktree.lockReason}` : ''}`));
            }
            if (targetWorktree.prunable) {
                console.log(chalk.yellow(`Warning: This worktree is marked as prunable${targetWorktree.pruneReason ? `: ${targetWorktree.pruneReason}` : ''}`));
            }
            console.log(chalk.blue(`Opening ${targetPath} in ${editorCommand}...`));
            try {
                await execa(editorCommand, [targetPath], { stdio: "inherit" });
                console.log(chalk.green(`Successfully opened worktree in ${editorCommand}.`));
            }
            catch (editorError) {
                process.stderr.write(chalk.red(`Failed to open editor "${editorCommand}". Please ensure it's installed and in your PATH.`) + "\n");
                process.exit(1);
            }
        }
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        process.stderr.write(chalk.red("Failed to open worktree: ") + message + "\n");
        process.exit(1);
    }
}
