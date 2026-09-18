#include "windows.h"
#include <bcrypt.h>
#include <stdlib.h>
#include <string.h>

bool sha256_windows(const uint8_t *bytes, size_t size, uint8_t digest[32]) {
    if (size > UINT32_MAX) return false;
    BCRYPT_ALG_HANDLE algorithm = NULL;
    if (BCryptOpenAlgorithmProvider(&algorithm, BCRYPT_SHA256_ALGORITHM, NULL, 0) < 0) return false;
    NTSTATUS status = BCryptHash(algorithm, NULL, 0, (PUCHAR)bytes, (ULONG)size, digest, 32);
    NTSTATUS closed = BCryptCloseAlgorithmProvider(algorithm, 0);
    return status >= 0 && closed >= 0;
}

wchar_t *wide_from_utf8(const char *text) {
    int count = MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS, text, -1, NULL, 0);
    if (!count || count > 32767) return NULL;
    wchar_t *result = malloc((size_t)count * sizeof(wchar_t));
    if (!result) return NULL;
    if (!MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS, text, -1, result, count)) { free(result); return NULL; }
    return result;
}

char *utf8_from_wide(const wchar_t *text) {
    int count = WideCharToMultiByte(CP_UTF8, WC_ERR_INVALID_CHARS, text, -1, NULL, 0, NULL, NULL);
    if (!count) return NULL;
    char *result = malloc((size_t)count);
    if (!result) return NULL;
    if (!WideCharToMultiByte(CP_UTF8, WC_ERR_INVALID_CHARS, text, -1, result, count, NULL, NULL)) { free(result); return NULL; }
    return result;
}

uint8_t *file_read(const wchar_t *file, DWORD *size) {
    HANDLE handle = CreateFileW(file, GENERIC_READ, FILE_SHARE_READ, NULL, OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL, NULL);
    if (handle == INVALID_HANDLE_VALUE) return NULL;
    LARGE_INTEGER length;
    uint8_t *data = NULL;
    if (GetFileSizeEx(handle, &length) && length.QuadPart > 0 && length.QuadPart <= EXE_LIMIT) {
        data = malloc((size_t)length.QuadPart);
        DWORD actual = 0;
        if (data && (!ReadFile(handle, data, (DWORD)length.QuadPart, &actual, NULL) || actual != length.QuadPart)) { free(data); data = NULL; }
        if (data) *size = actual;
    }
    if (!CloseHandle(handle)) { free(data); return NULL; }
    return data;
}

bool file_write(const wchar_t *file, const uint8_t *data, DWORD size) {
    HANDLE handle = CreateFileW(file, GENERIC_WRITE, 0, NULL, CREATE_NEW, FILE_ATTRIBUTE_NORMAL, NULL);
    if (handle == INVALID_HANDLE_VALUE) return false;
    DWORD actual = 0;
    bool written = WriteFile(handle, data, size, &actual, NULL) && actual == size;
    return CloseHandle(handle) && written;
}

bool absolute_file(const wchar_t *file) {
    size_t size = wcslen(file);
    bool drive = size >= 3 && ((file[0] >= L'A' && file[0] <= L'Z') || (file[0] >= L'a' && file[0] <= L'z')) && file[1] == L':' && (file[2] == L'\\' || file[2] == L'/');
    bool unc = size > 2 && file[0] == L'\\' && file[1] == L'\\';
    DWORD attributes = GetFileAttributesW(file);
    return (drive || unc) && attributes != INVALID_FILE_ATTRIBUTES && !(attributes & FILE_ATTRIBUTE_DIRECTORY);
}
