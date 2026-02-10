/**
 * Generate a Bash completion script for the `wt` CLI.
 *
 * The script registers a completion function that calls `wt __complete`
 * to obtain dynamic completion candidates whenever the user presses Tab.
 */
export function bashCompletionScript(): string {
    return `
_wt_completions() {
    local cur="\${COMP_WORDS[COMP_CWORD]}"
    local words=("\${COMP_WORDS[@]:1}")

    local completions
    completions=$(wt __complete -- "\${words[@]}" 2>/dev/null)

    COMPREPLY=($(compgen -W "\${completions}" -- "\${cur}"))
}

complete -F _wt_completions wt
`.trimStart();
}
