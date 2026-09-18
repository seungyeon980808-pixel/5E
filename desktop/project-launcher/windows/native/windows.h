#ifndef FIVE_E_WINDOWS_H
#define FIVE_E_WINDOWS_H
#include "core.h"
#include <windows.h>
#define PATH_CAPACITY 32768u
bool sha256_windows(const uint8_t *bytes, size_t size, uint8_t digest[32]);
wchar_t *wide_from_utf8(const char *text);
char *utf8_from_wide(const wchar_t *text);
uint8_t *file_read(const wchar_t *file, DWORD *size);
bool file_write(const wchar_t *file, const uint8_t *data, DWORD size);
bool absolute_file(const wchar_t *file);
bool application_registered_at(const wchar_t *location, wchar_t *executable);
bool application_start(const wchar_t *executable, const cJSON *development, const Project *project);
bool web_transfer(const Project *project, char **address);
#endif
