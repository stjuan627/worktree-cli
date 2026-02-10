/**
 * Generate a Zsh completion script for the `wt` CLI.
 *
 * The script defines a completion function that calls `wt __complete`
 * to obtain dynamic completion candidates whenever the user presses Tab.
 */
export function zshCompletionScript() {
    return `
#compdef wt

_wt() {
    local -a completions
    local words_arr=("\${words[@]:1}")

    completions=(\${(f)"$(wt __complete -- "\${words_arr[@]}" 2>/dev/null)"})

    if (( \${#completions} > 0 )); then
        compadd -a completions
    fi
}

compdef _wt wt
`.trimStart();
}
