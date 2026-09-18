#include "core.h"
#include <string.h>

static bool append_char(char *buffer, size_t capacity, size_t *used, char value) {
    if (*used + 1 >= capacity) return false;
    buffer[(*used)++] = value; buffer[*used] = 0;
    return true;
}

bool argument_append(char *buffer, size_t capacity, const char *argument) {
    size_t used = strlen(buffer), slashes = 0;
    if (used && !append_char(buffer, capacity, &used, ' ')) return false;
    if (!append_char(buffer, capacity, &used, '"')) return false;
    // Windows doubles trailing backslashes and those immediately before quotes.
    for (const char *p = argument;; p++) {
        if (*p == '\\') { slashes++; continue; }
        size_t count = (*p == '"' || !*p) ? slashes * 2 : slashes;
        while (count--) if (!append_char(buffer, capacity, &used, '\\')) return false;
        slashes = 0;
        if (!*p) break;
        if (*p == '"' && !append_char(buffer, capacity, &used, '\\')) return false;
        if (!append_char(buffer, capacity, &used, *p)) return false;
    }
    return append_char(buffer, capacity, &used, '"');
}
