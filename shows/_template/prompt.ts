// shows/_template/prompt.ts
//
// The full master prompt for this show. /create-show writes this file
// from the prompt the user pastes when they create a new show.

export const PROMPT = `(replace this with the full master prompt for the show)

The pipeline injects the following at runtime, after this prompt:

  HOST: <host name from config>
  SHOW: <show title from config>
  CURRENT DATE: <spoken date>
  SOURCE DATE: <spoken previous-day date>
  RESEARCH INSTRUCTIONS: <web_search instructions>
  SUPPLEMENTAL CONTEXT (optional): <RSS digest if configured>

Make sure your prompt:
- Tells the model to use web_search to research yesterday's news.
- Includes a [TEN-SECOND SECTION SPACER] between every major section.
- References [HOST NAME], [CURRENT DATE], [SHOW TITLE] for substitution.
- Specifies word-count targets that match the config.ts ranges.
- Specifies the chapters array output requirement.
- Specifies any editorial lens, positive opening rules, riddle requirements,
  or other show-specific structural rules.
`;
