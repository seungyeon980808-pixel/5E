# cJSON

Unmodified cJSON v1.7.19 from https://github.com/DaveGamble/cJSON/releases/tag/v1.7.19.
Pinned commit: `c859b25da02955fef659d658b8f324b5cde87be3`.
`cJSON.c`, `cJSON.h` and the MIT license are vendored so launcher builds do not
need to fetch parser code. The launcher preserves raw JSON; cJSON only parses
its settings, verifies project structure and reads the server response.
