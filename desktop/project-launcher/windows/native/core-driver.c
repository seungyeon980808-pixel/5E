#include "core.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#ifdef _WIN32
#include "windows.h"
#else
#include <CommonCrypto/CommonDigest.h>
static bool sha256_native(const uint8_t *data, size_t size, uint8_t digest[32]) {
    return size <= UINT32_MAX && CC_SHA256(data, (CC_LONG)size, digest) != NULL;
}
#endif

static uint8_t *read_source(const char *name, size_t *length) {
#ifdef _WIN32
    wchar_t *file = wide_from_utf8(name);
    DWORD size = 0;
    uint8_t *data = file ? file_read(file, &size) : NULL;
    free(file); *length = size;
    return data;
#else
    FILE *file = fopen(name, "rb");
    if (!file) return NULL;
    uint8_t *data = NULL;
    if (!fseek(file, 0, SEEK_END)) {
        long size = ftell(file);
        if (size > 0 && size <= EXE_LIMIT && !fseek(file, 0, SEEK_SET)) {
            data = malloc((size_t)size);
            if (data && fread(data, 1, (size_t)size, file) != (size_t)size) { free(data); data = NULL; }
            if (data) *length = (size_t)size;
        }
    }
    if (fclose(file)) { free(data); return NULL; }
    return data;
#endif
}

static int run_driver(int argc, char **argv) {
    if (argc < 3) return 2;
    if (!strcmp(argv[1], "quote")) {
        char command[131072] = {0};
        for (int i = 2; i < argc; i++) if (!argument_append(command, sizeof(command), argv[i])) return 1;
        return fputs(command, stdout) < 0 ? 1 : 0;
    }
    if (!strcmp(argv[1], "url") && argc == 4) {
        Endpoint editor;
        return endpoint_parse(argv[2], true, &editor) && launch_url_valid(&editor, argv[3]) ? 0 : 1;
    }
#ifdef _WIN32
    if (!strcmp(argv[1], "registry")) {
        wchar_t *location = wide_from_utf8(argv[2]), *executable = calloc(PATH_CAPACITY, sizeof(wchar_t));
        bool found = location && executable && application_registered_at(location, executable);
        char *text = found ? utf8_from_wide(executable) : NULL;
        bool printed = !found || (text && fputs(text, stdout) >= 0);
        free(text); free(location); free(executable);
        return printed ? 0 : 1;
    }
#endif
    size_t length = 0;
    uint8_t *data = read_source(argv[2], &length);
    Project project = {0};
#ifdef _WIN32
    bool parsed = data && project_parse(data, length, sha256_windows, &project);
#else
    bool parsed = data && project_parse(data, length, sha256_native, &project);
#endif
    int result = 1;
    if (parsed && !strcmp(argv[1], "read")) result = fwrite(project.json, 1, project.length, stdout) == project.length ? 0 : 1;
#ifdef _WIN32
    if (parsed && !strcmp(argv[1], "transfer")) {
        char *address = NULL;
        if (web_transfer(&project, &address)) result = fputs(address, stdout) >= 0 ? 0 : 1;
        free(address);
    }
    if (parsed && !strcmp(argv[1], "start")) {
        const cJSON *development = cJSON_GetObjectItemCaseSensitive(project.config, "development"), *value = cJSON_GetObjectItemCaseSensitive(development, "executable");
        wchar_t *executable = cJSON_IsString(value) ? wide_from_utf8(value->valuestring) : NULL;
        if (executable) result = application_start(executable, development, &project) ? 0 : 1;
        free(executable);
    }
#endif
    project_close(&project); free(data);
    return result;
}

#ifdef _WIN32
int wmain(int argc, wchar_t **wide_argv) {
    char **argv = calloc((size_t)argc, sizeof(char *));
    if (!argv) return 1;
    bool valid = true;
    for (int i = 0; i < argc; i++) { argv[i] = utf8_from_wide(wide_argv[i]); if (!argv[i]) valid = false; }
    int result = valid ? run_driver(argc, argv) : 1;
    for (int i = 0; i < argc; i++) free(argv[i]);
    free(argv); return result;
}
#else
int main(int argc, char **argv) { return run_driver(argc, argv); }
#endif
