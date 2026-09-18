#include "windows.h"
#include <bcrypt.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

bool application_registered_at(const wchar_t *location, wchar_t *executable) {
    HKEY hives[] = { HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE };
    for (size_t i = 0; i < sizeof(hives) / sizeof(hives[0]); i++) {
        HKEY key;
        if (RegOpenKeyExW(hives[i], location, 0, KEY_QUERY_VALUE | KEY_WOW64_64KEY, &key) != ERROR_SUCCESS) continue;
        DWORD version = 0, version_size = sizeof(version), type = 0, path_size = PATH_CAPACITY * sizeof(wchar_t);
        LSTATUS version_status = RegQueryValueExW(key, L"Version", NULL, &type, (BYTE *)&version, &version_size);
        bool supported = version_status == ERROR_SUCCESS && type == REG_DWORD && version_size == sizeof(version) && version == 1;
        LSTATUS path_status = RegQueryValueExW(key, L"Executable", NULL, &type, (BYTE *)executable, &path_size);
        LSTATUS close_status = RegCloseKey(key);
        if (supported && path_status == ERROR_SUCCESS && close_status == ERROR_SUCCESS && type == REG_SZ && path_size >= sizeof(wchar_t) && path_size <= PATH_CAPACITY * sizeof(wchar_t) && !(path_size % sizeof(wchar_t)) && executable[path_size / sizeof(wchar_t) - 1] == 0 && absolute_file(executable)) return true;
    }
    return false;
}

static bool apply_environment(const cJSON *development) {
    const cJSON *environment = cJSON_GetObjectItemCaseSensitive(development, "environment");
    if (!environment || cJSON_IsNull(environment)) return true;
    if (!cJSON_IsObject(environment)) return false;
    const cJSON *item;
    cJSON_ArrayForEach(item, environment) {
        if (!cJSON_IsString(item) || (strcmp(item->string, "FIVE_E_DEV_USER_DATA") && strcmp(item->string, "FIVE_E_SMOKE_USER_DATA") && strcmp(item->string, "FIVE_E_BUNDLED_PDF_PACK_SOURCE"))) return false;
        wchar_t *name = wide_from_utf8(item->string), *value = wide_from_utf8(item->valuestring);
        bool set = name && value && SetEnvironmentVariableW(name, value);
        free(name); free(value);
        if (!set) return false;
    }
    return true;
}

static char *command_line(const wchar_t *executable, const cJSON *development, const wchar_t *document) {
    char *command = calloc(131072, 1), *program = utf8_from_wide(executable), *file = utf8_from_wide(document);
    bool valid = command && program && file && argument_append(command, 131072, program);
    const cJSON *args = cJSON_GetObjectItemCaseSensitive(development, "args");
    if (args && !cJSON_IsNull(args)) {
        if (!cJSON_IsArray(args) || cJSON_GetArraySize(args) > 256) valid = false;
        const cJSON *item;
        cJSON_ArrayForEach(item, args) {
            if (!valid || !cJSON_IsString(item) || !argument_append(command, 131072, item->valuestring)) { valid = false; break; }
        }
    }
    char *argument = NULL;
    if (valid) {
        size_t size = strlen(file) + sizeof("--project-file=");
        argument = malloc(size);
        if (!argument) valid = false;
        else { snprintf(argument, size, "--project-file=%s", file); valid = argument_append(command, 131072, argument); }
    }
    free(argument); free(program); free(file);
    if (!valid) { free(command); return NULL; }
    return command;
}

bool application_start(const wchar_t *executable, const cJSON *development, const Project *project) {
    if (!absolute_file(executable)) return false;
    wchar_t *root = calloc(PATH_CAPACITY, sizeof(wchar_t)), *document = calloc(PATH_CAPACITY, sizeof(wchar_t)), *marker = calloc(PATH_CAPACITY, sizeof(wchar_t));
    bool created = false, started = false;
    char *command = NULL;
    wchar_t *wide_command = NULL;
    if (!root || !document || !marker) goto done;
    DWORD length = GetTempPathW(PATH_CAPACITY, root);
    if (!length || length + 100 >= PATH_CAPACITY) goto done;
    uint8_t random[16], digest[32];
    if (BCryptGenRandom(NULL, random, sizeof(random), BCRYPT_USE_SYSTEM_PREFERRED_RNG) < 0) goto done;
    char unique[33];
    for (size_t i = 0; i < sizeof(random); i++) snprintf(unique + i * 2, 3, "%02x", random[i]);
    wchar_t *suffix = wide_from_utf8(unique);
    if (!suffix) goto done;
    int added = swprintf(root + length, PATH_CAPACITY - length, L"5e-project-open-%ls", suffix);
    free(suffix);
    if (added < 0 || !CreateDirectoryW(root, NULL)) goto done;
    created = true;
    if (swprintf(document, PATH_CAPACITY, L"%ls\\document.5e", root) < 0 || swprintf(marker, PATH_CAPACITY, L"%ls\\.5e-handoff", root) < 0) goto done;
    if (!file_write(document, project->json, project->length) || !sha256_windows(project->json, project->length, digest)) goto done;
    char receipt[86] = "5E project handoff v1\n";
    size_t prefix = strlen(receipt);
    for (size_t i = 0; i < sizeof(digest); i++) snprintf(receipt + prefix + i * 2, 3, "%02x", digest[i]);
    if (!file_write(marker, (const uint8_t *)receipt, (DWORD)strlen(receipt))) goto done;
    command = command_line(executable, development, document);
    if (!command || !apply_environment(development)) goto done;
    wide_command = wide_from_utf8(command);
    if (!wide_command) goto done;
    STARTUPINFOW startup = { .cb = sizeof(startup) };
    PROCESS_INFORMATION process = {0};
    // Pass the executable separately; quoted arguments never go through a shell.
    if (!CreateProcessW(executable, wide_command, NULL, NULL, FALSE, CREATE_UNICODE_ENVIRONMENT, NULL, NULL, &startup, &process)) goto done;
    started = true;
    bool thread_closed = CloseHandle(process.hThread), process_closed = CloseHandle(process.hProcess);
    if (!thread_closed || !process_closed) SetLastError(ERROR_INVALID_HANDLE);
 done:
    // After a successful start only the receiver may delete its owned copy.
    if (created && !started) { if (*document) DeleteFileW(document); if (*marker) DeleteFileW(marker); RemoveDirectoryW(root); }
    free(wide_command); free(command); free(root); free(document); free(marker);
    return started;
}
